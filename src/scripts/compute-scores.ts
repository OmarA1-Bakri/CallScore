import * as fs from "fs";
import * as path from "path";
import { query } from "../lib/db";
import { computeAlphaScore } from "../lib/scoring";
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

interface CreatorRow {
  readonly id: number;
  readonly name: string;
}

interface CallForScore {
  readonly id: number;
  readonly correct_direction: boolean | null;
  readonly alpha_30d: number | null;
  readonly specificity_score: number;
  readonly regime_difficulty: number;
  readonly hit_target: boolean | null;
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
}

interface ModeRow {
  readonly most_called: string | null;
}

interface BestWorstRow {
  readonly best_id: number | null;
  readonly worst_id: number | null;
}

function getPeriodFilter(period: Period): string {
  if (period === "30d") return "AND c.call_date >= NOW() - INTERVAL '30 days'";
  if (period === "90d") return "AND c.call_date >= NOW() - INTERVAL '90 days'";
  return ""; // all_time
}

/**
 * Step 1: Score individual calls that have price data but no score yet.
 */
async function scoreUnscoredCalls(): Promise<number> {
  const calls = await query<CallForScore>(
    `SELECT id, correct_direction, alpha_30d, specificity_score, regime_difficulty, hit_target
     FROM calls
     WHERE price_at_call IS NOT NULL
       AND score = 0
       AND return_30d IS NOT NULL`,
  );

  if (calls.length === 0) return 0;

  console.log(`[${timestamp()}] Scoring ${calls.length} unscored calls...`);

  let scored = 0;
  for (const call of calls) {
    // Build a minimal Call object for computeAlphaScore
    const callForScoring: Call = {
      ...({} as Call),
      id: call.id,
      correct_direction: call.correct_direction,
      alpha_30d: call.alpha_30d,
      specificity_score: call.specificity_score,
      regime_difficulty: call.regime_difficulty,
      hit_target: call.hit_target,
    };

    const score = computeAlphaScore(callForScoring);

    await query("UPDATE calls SET score = $1 WHERE id = $2", [score, call.id]);
    scored++;
  }

  return scored;
}

/**
 * Step 2: Compute aggregate stats per creator per period.
 */
async function computeCreatorStats(
  creators: readonly CreatorRow[],
  period: Period,
): Promise<void> {
  const periodFilter = getPeriodFilter(period);

  console.log(`[${timestamp()}] Computing ${period} stats for ${creators.length} creators...`);

  // Collect all stats, then rank
  const statsData: {
    creatorId: number;
    totalCalls: number;
    winRate: number;
    avgReturn7d: number;
    avgReturn30d: number;
    avgReturn90d: number;
    avgAlpha30d: number;
    hitRate: number;
    mostCalledSymbol: string | null;
    specificityAvg: number;
    alphaScore: number;
    bestCallId: number | null;
    worstCallId: number | null;
  }[] = [];

  for (const creator of creators) {
    // Aggregate stats
    const aggRows = await query<AggregateRow>(
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
        AVG(c.score) as avg_score
      FROM calls c
      WHERE c.creator_id = $1
        AND c.price_at_call IS NOT NULL
        ${periodFilter}
      GROUP BY c.creator_id`,
      [creator.id],
    );

    if (aggRows.length === 0) continue;

    const agg = aggRows[0];
    const totalCalls = parseInt(agg.total_calls, 10);
    const winCount = parseInt(agg.win_count, 10);
    const hitCount = parseInt(agg.hit_count, 10);

    // Most called symbol (MODE)
    const modeRows = await query<ModeRow>(
      `SELECT c.symbol as most_called
       FROM calls c
       WHERE c.creator_id = $1
         AND c.price_at_call IS NOT NULL
         ${periodFilter}
       GROUP BY c.symbol
       ORDER BY COUNT(*) DESC
       LIMIT 1`,
      [creator.id],
    );

    // Best and worst calls
    const bwPeriodFilter = periodFilter.replace(/\bc\./g, "calls.");
    const bwRows = await query<BestWorstRow>(
      `SELECT
        (SELECT id FROM calls WHERE creator_id = $1 AND price_at_call IS NOT NULL ${bwPeriodFilter} ORDER BY score DESC LIMIT 1) as best_id,
        (SELECT id FROM calls WHERE creator_id = $1 AND price_at_call IS NOT NULL ${bwPeriodFilter} ORDER BY score ASC LIMIT 1) as worst_id`,
      [creator.id],
    );

    statsData.push({
      creatorId: creator.id,
      totalCalls,
      winRate: totalCalls > 0 ? winCount / totalCalls : 0,
      avgReturn7d: agg.avg_return_7d ?? 0,
      avgReturn30d: agg.avg_return_30d ?? 0,
      avgReturn90d: agg.avg_return_90d ?? 0,
      avgAlpha30d: agg.avg_alpha_30d ?? 0,
      hitRate: totalCalls > 0 ? hitCount / totalCalls : 0,
      mostCalledSymbol: modeRows.length > 0 ? modeRows[0].most_called : null,
      specificityAvg: agg.avg_specificity ?? 0,
      alphaScore: agg.avg_score ?? 0,
      bestCallId: bwRows.length > 0 ? bwRows[0].best_id : null,
      worstCallId: bwRows.length > 0 ? bwRows[0].worst_id : null,
    });
  }

  // Sort by alphaScore DESC to assign ranks
  const ranked = [...statsData].sort((a, b) => b.alphaScore - a.alphaScore);

  for (let i = 0; i < ranked.length; i++) {
    const s = ranked[i];
    const rank = i + 1;

    await query(
      `INSERT INTO creator_stats (
        creator_id, period, total_calls, win_rate,
        avg_return_7d, avg_return_30d, avg_return_90d, avg_alpha_30d,
        best_call_id, worst_call_id, hit_rate,
        most_called_symbol, specificity_avg, alpha_score, accuracy_rank,
        updated_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14, $15,
        NOW()
      )
      ON CONFLICT (creator_id, period) DO UPDATE SET
        total_calls = EXCLUDED.total_calls,
        win_rate = EXCLUDED.win_rate,
        avg_return_7d = EXCLUDED.avg_return_7d,
        avg_return_30d = EXCLUDED.avg_return_30d,
        avg_return_90d = EXCLUDED.avg_return_90d,
        avg_alpha_30d = EXCLUDED.avg_alpha_30d,
        best_call_id = EXCLUDED.best_call_id,
        worst_call_id = EXCLUDED.worst_call_id,
        hit_rate = EXCLUDED.hit_rate,
        most_called_symbol = EXCLUDED.most_called_symbol,
        specificity_avg = EXCLUDED.specificity_avg,
        alpha_score = EXCLUDED.alpha_score,
        accuracy_rank = EXCLUDED.accuracy_rank,
        updated_at = NOW()`,
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
        s.specificityAvg,
        s.alphaScore,
        rank,
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

  for (const stats of allTimeStats) {
    const rank = stats.accuracy_rank ?? 20;
    let tier: string;
    if (rank <= 5) {
      tier = "elite";
    } else if (rank <= 10) {
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

  // Get all creators
  const creators = await query<CreatorRow>("SELECT id, name FROM creators ORDER BY id");

  // Step 2: Compute stats for each period
  const periods: readonly Period[] = ["all_time", "90d", "30d"];
  for (const period of periods) {
    await computeCreatorStats(creators, period);
  }

  // Step 3: Update creator rankings and tiers
  await updateCreatorRankings();

  console.log(`[${timestamp()}] Score computation complete`);
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] Fatal error:`, err);
  process.exit(1);
});
