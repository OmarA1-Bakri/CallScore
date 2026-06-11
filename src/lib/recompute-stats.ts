import { query } from "./db";
import {
  computePublicScore,
  getCallEligibilitySql,
  getCallScoreStatus,
} from "./public-methodology";
import {
  getCreatorStatsOfficialThreshold,
  getCreatorStatsOfficialEligibilitySql,
} from "./creator-stats-eligibility";
import { getPeriodFilterSql } from "./judgment-window";
import type { Call, Period } from "./types";

interface ScoreRow {
  readonly id: number;
  readonly extraction_confidence: number;
  readonly call_date: string;
  readonly target_price: number | null;
  readonly price_at_call: number | null;
  readonly price_30d: number | null;
  readonly price_90d: number | null;
  readonly return_30d: number | null;
  readonly correct_direction: boolean | null;
  readonly alpha_30d: number | null;
  readonly specificity_score: number;
  readonly regime_difficulty: number;
  readonly hit_target: boolean | null;
}

function toScoreInput(row: ScoreRow): Call {
  return {
    ...({} as Call),
    id: row.id,
    creator_id: 0,
    video_id: 0,
    symbol: "",
    direction: "neutral",
    call_type: null,
    entry_price: null,
    target_price: row.target_price,
    stop_loss: null,
    timeframe: null,
    confidence: null,
    strategy_type: null,
    raw_quote: null,
    extraction_confidence: row.extraction_confidence,
    specificity_score: row.specificity_score,
    call_date: row.call_date,
    price_at_call: row.price_at_call,
    btc_price_at_call: null,
    price_7d: null,
    price_30d: row.price_30d,
    price_90d: row.price_90d,
    btc_price_7d: null,
    btc_price_30d: null,
    btc_price_90d: null,
    return_7d: null,
    return_30d: row.return_30d,
    return_90d: null,
    alpha_7d: null,
    alpha_30d: row.alpha_30d,
    alpha_90d: null,
    hit_target: row.hit_target,
    correct_direction: row.correct_direction,
    regime_at_call: null,
    regime_difficulty: row.regime_difficulty,
    score: 0,
    created_at: row.call_date,
  };
}

export async function recomputeCallScores(): Promise<number> {
  const rows = await query<ScoreRow>(
    `SELECT
      id,
      extraction_confidence,
      call_date::text AS call_date,
      target_price,
      price_at_call,
      price_30d,
      price_90d,
      return_30d,
      correct_direction,
      alpha_30d,
      specificity_score,
      regime_difficulty,
      hit_target
     FROM calls`,
  );

  const scoredUpdates = rows.map((row) => {
    const eligible = getCallScoreStatus({
      extraction_confidence: row.extraction_confidence,
      call_date: row.call_date,
      price_at_call: row.price_at_call,
      target_price: row.target_price,
      price_30d: row.price_30d,
      price_90d: row.price_90d,
      return_30d: row.return_30d,
      hit_target: row.hit_target,
    }) === "scored";

    return {
      id: row.id,
      score: eligible ? computePublicScore(toScoreInput(row)) : 0,
    };
  });

  const batchSize = 500;
  for (let index = 0; index < scoredUpdates.length; index += batchSize) {
    const batch = scoredUpdates.slice(index, index + batchSize);
    await query(
      `UPDATE calls SET score = bulk.score
       FROM unnest($1::int[], $2::float8[]) AS bulk(id, score)
       WHERE calls.id = bulk.id`,
      [batch.map((row) => row.id), batch.map((row) => row.score)],
    );
  }

  return scoredUpdates.filter((row) => row.score > 0).length;
}

export async function recomputeCreatorStats(period: Period): Promise<void> {
  const periodFilter = getPeriodFilterSql("c", period);
  const subqueryPeriodFilter = getPeriodFilterSql("cl", period);
  const eligibleSql = getCallEligibilitySql("c");

  await query(
    `DELETE FROM creator_stats WHERE period = $1`,
    [period],
  );

  await query(
    `INSERT INTO creator_stats (
      creator_id, period, total_calls, win_rate,
      avg_return_7d, avg_return_30d, avg_return_90d, avg_alpha_30d,
      best_call_id, worst_call_id, hit_rate, most_called_symbol,
      strategy_consistency, specificity_avg, alpha_score,
      accuracy_rank, effective_n, wilson_lb, bullish_win_rate,
      bearish_win_rate, bullish_pct, sharpe_ratio, updated_at
    )
    SELECT
      cr.id AS creator_id,
      $1 AS period,
      COUNT(c.id) FILTER (WHERE ${eligibleSql} ${periodFilter}) AS total_calls,
      COALESCE(AVG(CASE WHEN ${eligibleSql} ${periodFilter} THEN CASE WHEN c.correct_direction THEN 1.0 ELSE 0.0 END END), 0) AS win_rate,
      COALESCE(AVG(c.return_7d) FILTER (WHERE ${eligibleSql} ${periodFilter}), 0) AS avg_return_7d,
      COALESCE(AVG(c.return_30d) FILTER (WHERE ${eligibleSql} ${periodFilter}), 0) AS avg_return_30d,
      COALESCE(AVG(c.return_90d) FILTER (WHERE ${eligibleSql} ${periodFilter}), 0) AS avg_return_90d,
      COALESCE(AVG(c.alpha_30d) FILTER (WHERE ${eligibleSql} ${periodFilter}), 0) AS avg_alpha_30d,
      (
        SELECT cl.id
        FROM calls cl
        WHERE cl.creator_id = cr.id
          AND ${getCallEligibilitySql("cl")}
          ${subqueryPeriodFilter}
        ORDER BY cl.score DESC, cl.id ASC
        LIMIT 1
      ) AS best_call_id,
      (
        SELECT cl.id
        FROM calls cl
        WHERE cl.creator_id = cr.id
          AND ${getCallEligibilitySql("cl")}
          ${subqueryPeriodFilter}
        ORDER BY cl.score ASC, cl.id ASC
        LIMIT 1
      ) AS worst_call_id,
      COALESCE(AVG(CASE WHEN ${eligibleSql} ${periodFilter} THEN CASE WHEN c.hit_target THEN 1.0 ELSE 0.0 END END), 0) AS hit_rate,
      (
        SELECT cl.symbol
        FROM calls cl
        WHERE cl.creator_id = cr.id
          AND ${getCallEligibilitySql("cl")}
          ${subqueryPeriodFilter}
        GROUP BY cl.symbol
        ORDER BY COUNT(*) DESC, cl.symbol ASC
        LIMIT 1
      ) AS most_called_symbol,
      COALESCE(
        1.0 - (
          STDDEV_POP(c.score) FILTER (WHERE ${eligibleSql} ${periodFilter}) /
          NULLIF(AVG(c.score) FILTER (WHERE ${eligibleSql} ${periodFilter}), 0)
        ),
        0
      ) AS strategy_consistency,
      COALESCE(AVG(c.specificity_score) FILTER (WHERE ${eligibleSql} ${periodFilter}), 0) AS specificity_avg,
      COALESCE(AVG(c.score) FILTER (WHERE ${eligibleSql} ${periodFilter}), 0) AS alpha_score,
      NULL::int AS accuracy_rank,
      COUNT(DISTINCT (c.symbol || ':' || c.direction || ':' || TO_CHAR(c.call_date, 'YYYY-MM'))) FILTER (WHERE ${eligibleSql} ${periodFilter}) AS effective_n,
      0 AS wilson_lb,
      COALESCE(
        AVG(CASE WHEN c.direction = 'bullish' AND ${eligibleSql} ${periodFilter} THEN CASE WHEN c.correct_direction THEN 1.0 ELSE 0.0 END END),
        0
      ) AS bullish_win_rate,
      COALESCE(
        AVG(CASE WHEN c.direction = 'bearish' AND ${eligibleSql} ${periodFilter} THEN CASE WHEN c.correct_direction THEN 1.0 ELSE 0.0 END END),
        0
      ) AS bearish_win_rate,
      COALESCE(
        AVG(CASE WHEN ${eligibleSql} ${periodFilter} THEN CASE WHEN c.direction = 'bullish' THEN 1.0 ELSE 0.0 END END),
        0
      ) AS bullish_pct,
      COALESCE(
        AVG(c.score) FILTER (WHERE ${eligibleSql} ${periodFilter}) /
        NULLIF(STDDEV_POP(c.score) FILTER (WHERE ${eligibleSql} ${periodFilter}), 0),
        0
      ) AS sharpe_ratio,
      NOW() AS updated_at
    -- Keep one row per creator even when the period has too few eligible calls.
    -- Eligibility is applied to ranking, not row existence, so low-N creators
    -- do not disappear from snapshots after a recompute.
    FROM creators cr
    LEFT JOIN calls c ON c.creator_id = cr.id
    GROUP BY cr.id`,
    [period],
  );

  const officialThreshold = getCreatorStatsOfficialThreshold(period);
  if (officialThreshold === null) return;

  const officialEligibilitySql = getCreatorStatsOfficialEligibilitySql({
    statsAlias: "cs_inner",
    creatorAlias: "cr_inner",
    freshnessAlias: "vf",
  });

  await query(
    `UPDATE creator_stats cs
     SET accuracy_rank = ranked.rank
     FROM (
       SELECT
         cs_inner.id,
         ROW_NUMBER() OVER (
           PARTITION BY cs_inner.period
           ORDER BY cs_inner.alpha_score DESC, cs_inner.win_rate DESC, cs_inner.total_calls DESC, cs_inner.creator_id ASC
         ) AS rank
       FROM creator_stats cs_inner
       JOIN creators cr_inner ON cr_inner.id = cs_inner.creator_id
       LEFT JOIN (
         SELECT creator_id, MAX(published_at) AS latest_video_date
         FROM videos
         GROUP BY creator_id
       ) vf ON vf.creator_id = cr_inner.id
       WHERE cs_inner.period = $1
         AND ${officialEligibilitySql}
     ) ranked
     WHERE cs.id = ranked.id`,
    [period],
  );
}

export async function syncCreatorSnapshots(): Promise<void> {
  await query(
    `UPDATE creators c
     SET
       alpha_score = cs.alpha_score,
       win_rate = cs.win_rate,
       avg_return = cs.avg_return_30d,
       total_calls = cs.total_calls,
       accuracy_rank = cs.accuracy_rank
     FROM creator_stats cs
     WHERE cs.creator_id = c.id
       AND cs.period = 'all_time'`,
  );
}

export interface RecomputeAllStatsMetrics {
  readonly scored_calls: number;
}

export async function recomputeAllStats(): Promise<RecomputeAllStatsMetrics> {
  const scoredCalls = await recomputeCallScores();
  await recomputeCreatorStats("all_time");
  await recomputeCreatorStats("90d");
  await recomputeCreatorStats("30d");
  await syncCreatorSnapshots();
  return { scored_calls: scoredCalls };
}
