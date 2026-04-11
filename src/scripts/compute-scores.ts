import * as fs from "fs";
import * as path from "path";
import { query } from "../lib/db";
import { computeAlphaScore, wilsonLowerBound } from "../lib/scoring";
import type { Call, Period } from "../lib/types";

function loadEnv(): void {
  if (process.env.NEON_DATABASE_URL) return;
  const root = path.resolve(__dirname, "../..");
  const envPath = fs.existsSync(path.join(root, ".env.local"))
    ? path.join(root, ".env.local")
    : path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx < 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function timestamp(): string {
  return new Date().toISOString();
}

interface CallForScore {
  readonly id: number;
  readonly correct_direction: boolean | null;
  readonly alpha_30d: number | null;
  readonly specificity_score: number;
  readonly regime_difficulty: number;
  readonly hit_target: boolean | null;
  readonly confidence: string | null;
}

interface AggregateRow {
  readonly creator_id: number;
  readonly total_calls: string;
  readonly win_count: string;
  readonly avg_return_7d: number | null;
  readonly avg_return_30d: number | null;
  readonly avg_return_90d: number | null;
  readonly avg_alpha_30d: number | null;
  readonly hit_count: string;
  readonly avg_specificity: number | null;
  readonly avg_score: number | null;
  readonly score_stddev: number | null;
  readonly unique_symbols: string;
  readonly effective_n: string;
}


function getPeriodFilter(period: Period): string {
  if (period === "30d") return "AND c.call_date >= NOW() - INTERVAL '30 days'";
  if (period === "90d") return "AND c.call_date >= NOW() - INTERVAL '90 days'";
  return ""; // all_time
}

// Time decay for all_time: exponential decay with 1-year half-life.
// A call from 1 year ago gets 50% weight, 2 years ago 25%, etc.
// For 30d/90d periods, no decay (natural recency already built in).
//
// Validated: with dataset spanning 2 years (Mar 2024 - Apr 2026),
// decay produces avg 0.57 pt delta vs unweighted, max 4.35 pts.
// Largest shift: InvestAnswers (+5 raw ranks), but Bayesian shrinkage
// (K=15, effectiveN=16) correctly reins this in.
const DECAY_LAMBDA = Math.log(2) / 365; // ≈ 0.0019

function getScoreAvgExpr(period: Period): string {
  if (period === "all_time") {
    // Weighted average: sum(score * decay) / sum(decay)
    const decay = `EXP(-${DECAY_LAMBDA} * EXTRACT(EPOCH FROM (NOW() - c.call_date)) / 86400.0)`;
    return `SUM(c.score * ${decay}) / NULLIF(SUM(${decay}), 0)`;
  }
  return "AVG(c.score)";
}

/**
 * Step 1: Score individual calls that have price data but no score yet.
 */
async function scoreUnscoredCalls(): Promise<number> {
  const calls = await query<CallForScore>(
    `SELECT id, correct_direction, alpha_30d, specificity_score, regime_difficulty, hit_target, confidence
     FROM calls
     WHERE price_at_call IS NOT NULL
       AND score = 0
       AND return_30d IS NOT NULL
       AND extraction_confidence >= 0.5`,
  );
  // NOTE: extraction_confidence threshold is a no-op — 100% of matched calls
  // have conf >= 0.5 (99% are exactly 0.6000). The 43 outliers with 0.8-1.0
  // actually perform terribly (7% win rate), suggesting Gemini outputs high
  // confidence when hallucinating. Keep threshold as safety net only.

  if (calls.length === 0) return 0;

  console.log(`[${timestamp()}] Scoring ${calls.length} unscored calls...`);

  // Compute all scores in memory first (no DB queries needed)
  const updates: { id: number; score: number }[] = [];
  for (const call of calls) {
    const callForScoring: Call = {
      ...({} as Call),
      id: call.id,
      correct_direction: call.correct_direction,
      alpha_30d: call.alpha_30d,
      specificity_score: call.specificity_score,
      regime_difficulty: call.regime_difficulty,
      hit_target: call.hit_target,
      confidence: call.confidence,
    };
    const score = computeAlphaScore(callForScoring);
    // Skip legitimate zeros (e.g. BTC hit-and-retreat: target hit +10 cancels
    // wrong direction -10, alpha=0). Use tiny sentinel so they aren't
    // reprocessed on the next run.
    updates.push({ id: call.id, score: score === 0 ? 0.001 : score });
  }

  // Batch UPDATE using unnest — ~100x faster than per-row UPDATEs
  const BATCH_SIZE = 500;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    await query(
      `UPDATE calls SET score = bulk.score
       FROM unnest($1::int[], $2::float8[]) AS bulk(id, score)
       WHERE calls.id = bulk.id`,
      [batch.map((u) => u.id), batch.map((u) => u.score)],
    );
    console.log(`[${timestamp()}]   Batch ${Math.floor(i / BATCH_SIZE) + 1}: updated ${batch.length} scores`);
  }

  return updates.length;
}

/**
 * Step 2: Compute aggregate stats per creator per period.
 */
async function computeCreatorStats(period: Period): Promise<void> {
  const periodFilter = getPeriodFilter(period);

  // Clear stale rows for this period — prevents creators with 0 matched
  // calls from retaining old stats (documented gotcha: gotcha_stale_creator_stats.md)
  await query("DELETE FROM creator_stats WHERE period = $1", [period]);

  console.log(`[${timestamp()}] Computing ${period} stats...`);

  // Collect all stats, then rank
  const statsData: {
    creatorId: number;
    totalCalls: number;
    uniqueSymbols: number;
    effectiveN: number;
    winRate: number;
    avgReturn7d: number;
    avgReturn30d: number;
    avgReturn90d: number;
    avgAlpha30d: number;
    hitRate: number;
    mostCalledSymbol: string | null;
    specificityAvg: number;
    alphaScore: number;
    scoreStddev: number;
    bestCallId: number | null;
    worstCallId: number | null;
    bullishWinRate: number;
    bearishWinRate: number;
    bullishPct: number;
  }[] = [];

  // ── Batch query 1: aggregate stats for ALL creators at once ────────
  const scoreAvgExpr = getScoreAvgExpr(period);
  const allAgg = await query<AggregateRow>(
    `SELECT
      c.creator_id,
      COUNT(*)::text as total_calls,
      COUNT(*) FILTER (WHERE c.correct_direction = true)::text as win_count,
      AVG(c.return_7d) as avg_return_7d,
      AVG(c.return_30d) as avg_return_30d,
      AVG(c.return_90d) as avg_return_90d,
      AVG(c.alpha_30d) as avg_alpha_30d,
      COUNT(*) FILTER (WHERE c.hit_target = true)::text as hit_count,
      AVG(c.specificity_score) as avg_specificity,
      ${scoreAvgExpr} as avg_score,
      STDDEV_POP(c.score) as score_stddev,
      COUNT(DISTINCT c.symbol)::text as unique_symbols,
      COUNT(DISTINCT (c.symbol || ':' || c.direction || ':' || TO_CHAR(c.call_date, 'YYYY-MM')))::text as effective_n
    FROM calls c
    WHERE c.price_at_call IS NOT NULL
      AND c.extraction_confidence >= 0.5
      ${periodFilter}
    GROUP BY c.creator_id`,
  );

  // ── Batch query 2: most called symbol per creator ────────
  const allModes = await query<{ creator_id: number; most_called: string }>(
    `SELECT DISTINCT ON (sub.creator_id) sub.creator_id, sub.symbol as most_called
     FROM (
       SELECT c.creator_id, c.symbol, COUNT(*) as cnt
       FROM calls c
       WHERE c.price_at_call IS NOT NULL ${periodFilter}
       GROUP BY c.creator_id, c.symbol
     ) sub
     ORDER BY sub.creator_id, sub.cnt DESC`,
  );
  const modeMap = new Map(allModes.map((m) => [m.creator_id, m.most_called]));

  // ── Batch query 3: best and worst call per creator ────────
  const allBw = await query<{ creator_id: number; best_id: number | null; worst_id: number | null }>(
    `SELECT
      creator_id,
      MAX(id) FILTER (WHERE rn_best = 1) as best_id,
      MAX(id) FILTER (WHERE rn_worst = 1) as worst_id
    FROM (
      SELECT c.creator_id, c.id,
             ROW_NUMBER() OVER (PARTITION BY c.creator_id ORDER BY c.score DESC) as rn_best,
             ROW_NUMBER() OVER (PARTITION BY c.creator_id ORDER BY c.score ASC) as rn_worst
      FROM calls c
      WHERE c.price_at_call IS NOT NULL ${periodFilter}
    ) ranked
    WHERE rn_best = 1 OR rn_worst = 1
    GROUP BY creator_id`,
  );
  const bwMap = new Map(allBw.map((bw) => [bw.creator_id, bw]));

  // ── Batch query 4: De-duplicated score average ────────
  // Groups calls by (creator, symbol, direction, month) and averages within
  // each group first, then averages across groups. This prevents a creator
  // who says "BTC bullish" 573 times from having that one opinion dominate
  // their score. Each unique observation gets equal weight.
  //
  // For all_time: applies time decay per group (using the group's earliest call
  // date for the decay factor), then computes a weighted average across groups.
  const dedupDecay = period === "all_time"
    ? `EXP(-${DECAY_LAMBDA} * EXTRACT(EPOCH FROM (NOW() - MIN(c.call_date))) / 86400.0)`
    : "1.0";
  const allDedup = await query<{ creator_id: number; dedup_score: number; dedup_stddev: number }>(
    `SELECT creator_id,
      SUM(group_score * decay_weight) / NULLIF(SUM(decay_weight), 0) as dedup_score,
      STDDEV_POP(group_score) as dedup_stddev
    FROM (
      SELECT c.creator_id,
        AVG(c.score) as group_score,
        ${dedupDecay} as decay_weight
      FROM calls c
      WHERE c.price_at_call IS NOT NULL
        AND c.extraction_confidence >= 0.5
        ${periodFilter}
      GROUP BY c.creator_id, c.symbol, c.direction, DATE_TRUNC('month', c.call_date)
    ) groups
    GROUP BY creator_id`,
  );
  const dedupMap = new Map(allDedup.map((d) => [d.creator_id, d]));

  // ── Batch query 5: Directional stats (bullish vs bearish win rates) ────────
  const allDir = await query<{
    creator_id: number; direction: string; dir_total: string; dir_wins: string;
  }>(
    `SELECT c.creator_id, c.direction,
      COUNT(*)::text as dir_total,
      COUNT(*) FILTER (WHERE c.correct_direction = true)::text as dir_wins
    FROM calls c
    WHERE c.price_at_call IS NOT NULL
      AND c.extraction_confidence >= 0.5
      AND c.direction IN ('bullish', 'bearish')
      ${periodFilter}
    GROUP BY c.creator_id, c.direction`,
  );
  const dirMap = new Map<number, { bullWin: number; bearWin: number; bullPct: number }>();
  for (const d of allDir) {
    const existing = dirMap.get(d.creator_id) ?? { bullWin: 0, bearWin: 0, bullPct: 0 };
    const total = parseInt(d.dir_total, 10);
    const wins = parseInt(d.dir_wins, 10);
    if (d.direction === "bullish") {
      existing.bullWin = total > 0 ? wins / total : 0;
    } else {
      existing.bearWin = total > 0 ? wins / total : 0;
    }
    dirMap.set(d.creator_id, existing);
  }
  // Compute bullish percentage per creator
  for (const d of allDir) {
    const existing = dirMap.get(d.creator_id);
    if (!existing) continue;
    if (d.direction === "bullish") {
      const bullTotal = parseInt(d.dir_total, 10);
      const allForCreator = allDir
        .filter((x) => x.creator_id === d.creator_id)
        .reduce((s, x) => s + parseInt(x.dir_total, 10), 0);
      existing.bullPct = allForCreator > 0 ? bullTotal / allForCreator : 0;
    }
  }

  // ── Assemble stats in JavaScript ────────
  // Gate on effective-N (unique symbol+direction+month triples), not raw call
  // count. A creator with 100 identical "BTC bullish" calls has ~3 effective
  // observations, not 100. Using effective-N prevents volume-spammers from
  // qualifying with artificially high raw counts.
  //
  // Impact: effective-N ratios range from 17% (Crypto Rover: 106→18) to 76%
  // (InvestAnswers: 21→16). De-duplication shifts rankings by up to ±11 positions.
  // Correctly penalizes concentrated callers (BTC-only, same opinion monthly)
  // and rewards diverse callers across many symbols and time periods.
  const MIN_EFFECTIVE_N = 10;

  for (const agg of allAgg) {
    const totalCalls = parseInt(agg.total_calls, 10);
    const effectiveN = parseInt(agg.effective_n ?? "0", 10);
    if (effectiveN < MIN_EFFECTIVE_N) continue;

    const creatorId = agg.creator_id;
    const winCount = parseInt(agg.win_count, 10);
    const hitCount = parseInt(agg.hit_count, 10);
    const uniqueSymbols = parseInt(agg.unique_symbols ?? "0", 10);
    const bw = bwMap.get(creatorId);
    const dedup = dedupMap.get(creatorId);
    const dir = dirMap.get(creatorId);

    // Use de-duplicated score: gives equal weight to each unique
    // (symbol, direction, month) observation instead of raw call count.
    // Falls back to raw avg_score if de-dup query returned nothing.
    const alphaScore = dedup?.dedup_score ?? agg.avg_score ?? 0;
    const scoreStddev = dedup?.dedup_stddev ?? agg.score_stddev ?? 0;

    statsData.push({
      creatorId,
      totalCalls,
      uniqueSymbols,
      effectiveN,
      winRate: totalCalls > 0 ? winCount / totalCalls : 0,
      avgReturn7d: agg.avg_return_7d ?? 0,
      avgReturn30d: agg.avg_return_30d ?? 0,
      avgReturn90d: agg.avg_return_90d ?? 0,
      avgAlpha30d: agg.avg_alpha_30d ?? 0,
      hitRate: totalCalls > 0 ? hitCount / totalCalls : 0,
      mostCalledSymbol: modeMap.get(creatorId) ?? null,
      specificityAvg: agg.avg_specificity ?? 0,
      alphaScore,
      scoreStddev,
      bestCallId: bw?.best_id ?? null,
      worstCallId: bw?.worst_id ?? null,
      bullishWinRate: dir?.bullWin ?? 0,
      bearishWinRate: dir?.bearWin ?? 0,
      bullishPct: dir?.bullPct ?? 0,
    });
  }

  // Bayesian shrinkage: pull small-sample creators toward the global median.
  // adjusted = (raw_mean * effectiveN + global_median * K) / (effectiveN + K)
  //
  // KEY CHANGE: Uses effectiveN (unique symbol+direction+month triples) instead
  // of totalCalls. A creator with 2000 calls but only 80 effective independent
  // observations gets shrunk the same as someone with 80 calls across 80 unique
  // observations. This prevents high-volume creators who spam the same call
  // from getting artificial confidence.
  //
  // K=15 (reduced from 20): with effective-N being smaller than totalCalls,
  // the shrinkage is already stronger. K=15 means a creator needs ~15
  // independent observations before their score is mostly their own.
  //
  // Sensitivity analysis: rankings are stable across K=5-50 (all Spearman > 0.99).
  // At K=15: InvestAnswers (eff=16) gets 52% own / 48% median (appropriate skepticism),
  //          Altcoin Daily (eff=402) gets 96% own (barely touched).
  //
  // Using MEDIAN prevents a single high-volume creator from dominating the target.
  const SHRINKAGE_K = 15;
  const sortedScores = [...statsData].sort((a, b) => a.alphaScore - b.alphaScore);
  const globalMedianScore =
    sortedScores.length > 0
      ? sortedScores.length % 2 === 1
        ? sortedScores[Math.floor(sortedScores.length / 2)].alphaScore
        : (sortedScores[sortedScores.length / 2 - 1].alphaScore +
           sortedScores[sortedScores.length / 2].alphaScore) / 2
      : 0;

  const avgEffRatio = statsData.reduce((s, d) => s + d.effectiveN / d.totalCalls, 0) / statsData.length;
  console.log(
    `[${timestamp()}] Shrinkage: K=${SHRINKAGE_K}, median=${globalMedianScore.toFixed(2)}, ` +
    `avgEffRatio=${(avgEffRatio * 100).toFixed(0)}%, ${period === "all_time" ? "time-decayed" : "simple avg"}`,
  );

  // Step A: Bayesian shrinkage using effective-N
  const shrunk = statsData.map((s) => ({
    ...s,
    alphaScore:
      (s.alphaScore * s.effectiveN + globalMedianScore * SHRINKAGE_K) /
      (s.effectiveN + SHRINKAGE_K),
  }));

  // Step B: Consistency adjustment using Sharpe ratio.
  //
  // Analysis showed CV ranges from 2.65 to 24.41 (9x spread) but the old
  // 15% max penalty barely affected rankings. Sharpe ratio (mean/stddev)
  // is a much better differentiator: ranges from 0.377 (Crypto Rover) to
  // -0.178 (Michael Wrubel), directly measuring risk-adjusted performance.
  //
  // Method: compute Sharpe per creator, normalize to [0, 1] across peers,
  // then apply up to 25% penalty. The highest-Sharpe creator gets 0% penalty,
  // the lowest gets 25%. Negative-Sharpe creators are appropriately penalized.
  const MAX_CONSISTENCY_PENALTY = 0.25;

  const withSharpe = shrunk.map((s) => {
    const sharpe = s.scoreStddev > 0 ? s.alphaScore / s.scoreStddev : 0;
    return { ...s, sharpe };
  });

  const sharpeValues = withSharpe.map((s) => s.sharpe);
  const minSharpe = Math.min(...sharpeValues);
  const maxSharpe = Math.max(...sharpeValues);
  const sharpeRange = maxSharpe - minSharpe;

  console.log(
    `[${timestamp()}] Sharpe: min=${minSharpe.toFixed(3)}, max=${maxSharpe.toFixed(3)}, ` +
    `range=${sharpeRange.toFixed(3)}, creators=${withSharpe.length}`,
  );

  const adjusted = withSharpe.map((s) => {
    if (sharpeRange === 0) {
      return { ...s, consistencyScore: 1.0 };
    }
    // Normalize Sharpe to [0, 1]: 1 = best Sharpe, 0 = worst Sharpe
    const normalizedSharpe = (s.sharpe - minSharpe) / sharpeRange;
    // Invert: worst Sharpe gets max penalty, best gets 0
    const penalty = (1 - normalizedSharpe) * MAX_CONSISTENCY_PENALTY;
    const consistencyScore = 1 - penalty;
    return { ...s, alphaScore: s.alphaScore * consistencyScore, consistencyScore };
  });

  // Sort by adjusted alphaScore DESC to assign ranks
  const ranked = adjusted.sort((a, b) => b.alphaScore - a.alphaScore);

  for (let i = 0; i < ranked.length; i++) {
    const s = ranked[i];
    const rank = i + 1;

    // Wilson lower bound: honest floor for win rate given effective sample size.
    // Uses effectiveN (not totalCalls) because repeated calls on the same coin
    // in the same month are not independent observations.
    // Scale wins proportionally: preserve the observed win rate but use
    // effective-N as the sample size for confidence interval calculation.
    const effectiveWins = Math.round(s.winRate * s.effectiveN);
    const wlb = wilsonLowerBound(effectiveWins, s.effectiveN);

    await query(
      `INSERT INTO creator_stats (
        creator_id, period, total_calls, win_rate,
        avg_return_7d, avg_return_30d, avg_return_90d, avg_alpha_30d,
        best_call_id, worst_call_id, hit_rate,
        most_called_symbol, strategy_consistency, specificity_avg,
        alpha_score, accuracy_rank, effective_n, wilson_lb,
        bullish_win_rate, bearish_win_rate, bullish_pct,
        sharpe_ratio, updated_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, $21,
        $22, NOW()
      )`,
      [
        s.creatorId,
        period,
        s.totalCalls,
        s.winRate,
        s.avgReturn7d,
        s.avgReturn30d,
        s.avgReturn90d,
        s.avgAlpha30d,
        s.bestCallId,
        s.worstCallId,
        s.hitRate,
        s.mostCalledSymbol,
        s.consistencyScore,
        s.specificityAvg,
        s.alphaScore,
        rank,
        s.effectiveN,
        wlb,
        s.bullishWinRate,
        s.bearishWinRate,
        s.bullishPct,
        s.sharpe,
      ],
    );
  }

  console.log(`[${timestamp()}] ${period}: ${ranked.length} creators ranked`);
}

/**
 * Step 3: Update creators table from all_time stats and assign tiers.
 */
async function updateCreatorRankings(): Promise<void> {
  console.log(`[${timestamp()}] Updating creator rankings and tiers...`);

  interface StatsRow {
    readonly creator_id: number;
    readonly alpha_score: number;
    readonly win_rate: number;
    readonly avg_return_30d: number;
    readonly total_calls: number;
    readonly accuracy_rank: number | null;
  }

  const allTimeStats = await query<StatsRow>(
    `SELECT creator_id, alpha_score, win_rate, avg_return_30d, total_calls, accuracy_rank
     FROM creator_stats
     WHERE period = 'all_time'
     ORDER BY accuracy_rank ASC NULLS LAST`,
  );

  // Percentile-based tiers (scales with creator count):
  //   Top 20% = elite, next 30% = pro, rest = free
  const totalRanked = allTimeStats.length;
  const eliteCutoff = Math.max(1, Math.ceil(totalRanked * 0.2));
  const proCutoff = Math.max(eliteCutoff + 1, Math.ceil(totalRanked * 0.5));

  for (const stats of allTimeStats) {
    const rank = stats.accuracy_rank ?? totalRanked;
    let tier: string;
    if (rank <= eliteCutoff) {
      tier = "elite";
    } else if (rank <= proCutoff) {
      tier = "pro";
    } else {
      tier = "free";
    }

    await query(
      `UPDATE creators SET
        alpha_score = $1,
        win_rate = $2,
        avg_return = $3,
        total_calls = $4,
        accuracy_rank = $5,
        tier = $6
      WHERE id = $7`,
      [
        stats.alpha_score,
        stats.win_rate,
        stats.avg_return_30d,
        stats.total_calls,
        stats.accuracy_rank,
        tier,
        stats.creator_id,
      ],
    );
  }

  console.log(`[${timestamp()}] Updated ${allTimeStats.length} creator rankings`);
}

async function main(): Promise<void> {
  loadEnv();

  console.log(`[${timestamp()}] Starting score computation...`);

  // Step 1: Score unscored calls
  const scored = await scoreUnscoredCalls();
  console.log(`[${timestamp()}] Scored ${scored} calls`);

  // Step 2: Compute stats for each period (batched queries, no per-creator loop)
  const periods: readonly Period[] = ["all_time", "90d", "30d"];
  for (const period of periods) {
    await computeCreatorStats(period);
  }

  // Step 3: Update creator rankings and tiers
  await updateCreatorRankings();

  console.log(`[${timestamp()}] Score computation complete`);
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] Fatal error:`, err);
  process.exit(1);
});
