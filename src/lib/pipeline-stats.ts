import { query } from "./db";
import {
  EXTRACTION_CONFIDENCE_THRESHOLD,
  getCallEligibilitySql,
  getScoreReadyIgnoringConfidenceSql,
} from "./public-methodology";

export const DEFAULT_PIPELINE_STATS_LIMIT = 15;
export const MAX_PIPELINE_STATS_LIMIT = 50;

interface CountRow {
  readonly [key: string]: string | number | null;
}

interface CreatorTierRow {
  readonly tier: string;
  readonly creators: string;
}

interface ConfidenceRow {
  readonly extraction_confidence: string | null;
  readonly calls: string;
  readonly videos: string;
  readonly creators: string;
  readonly created_first_at: string | null;
  readonly created_latest_at: string | null;
}

interface SymbolRow {
  readonly symbol: string;
  readonly raw_calls: string;
  readonly high_confidence_calls: string;
  readonly score_ready_ignoring_confidence_calls: string;
  readonly public_score_eligible_calls: string;
  readonly videos: string;
  readonly creators: string;
  readonly missing_price_at_call: string;
  readonly latest_call_at: string | null;
}

interface CreatorRawCallsRow {
  readonly creator_id: string;
  readonly name: string;
  readonly youtube_handle: string | null;
  readonly raw_calls: string;
  readonly high_confidence_calls: string;
  readonly score_ready_ignoring_confidence_calls: string;
  readonly public_score_eligible_calls: string;
  readonly videos_with_calls: string;
  readonly latest_call_at: string | null;
}

interface CreatorStatsSummaryRow {
  readonly rows: string;
  readonly all_time_rows: string;
  readonly ranked_all_time_creators: string;
  readonly public_scored_calls_all_time: string;
  readonly latest_updated_at: string | null;
}

interface LeaderboardRow {
  readonly accuracy_rank: string | null;
  readonly creator_id: string;
  readonly name: string;
  readonly youtube_handle: string | null;
  readonly total_calls: string;
  readonly win_rate: number | null;
  readonly avg_return_30d: number | null;
  readonly avg_alpha_30d: number | null;
  readonly alpha_score: number | null;
  readonly updated_at: string | null;
}

interface CandleEstimateRow {
  readonly estimated_rows: string;
  readonly estimated_symbols: string | null;
  readonly last_analyzed_at: string | null;
}

interface CandleCoverageRow {
  readonly symbol: string;
  readonly call_count: string;
  readonly earliest_open_time: string | null;
  readonly earliest_at: string | null;
  readonly latest_open_time: string | null;
  readonly latest_at: string | null;
  readonly days_since_latest: string | null;
}

interface OptionalSummaryRow {
  readonly [key: string]: string | number | null;
}

interface RecentPipelineRunRow {
  readonly run_key: string;
  readonly type: string;
  readonly status: string;
  readonly started_at: string | null;
  readonly finished_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly metrics: Record<string, unknown> | string | null;
}

export interface PipelineStatsOptions {
  readonly limit?: number;
}

export interface PipelineStatsSnapshot {
  readonly generated_at: string;
  readonly confidence_threshold: number;
  readonly limit: number;
  readonly creators: Record<string, unknown>;
  readonly videos: Record<string, unknown>;
  readonly calls: Record<string, unknown>;
  readonly calls_by_confidence: readonly Record<string, unknown>[];
  readonly top_symbols_by_raw_calls: readonly Record<string, unknown>[];
  readonly top_creators_by_raw_calls: readonly Record<string, unknown>[];
  readonly creator_stats: Record<string, unknown>;
  readonly leaderboard_top: readonly Record<string, unknown>[];
  readonly market_data: Record<string, unknown>;
  readonly consensus: Record<string, unknown>;
  readonly orchestration: Record<string, unknown>;
}

export function normalizePipelineStatsLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_PIPELINE_STATS_LIMIT;
  return Math.min(
    MAX_PIPELINE_STATS_LIMIT,
    Math.max(1, Math.floor(value ?? DEFAULT_PIPELINE_STATS_LIMIT)),
  );
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function percentage(numerator: unknown, denominator: unknown): number {
  const den = toNumber(denominator);
  if (den <= 0) return 0;
  return Number(((toNumber(numerator) / den) * 100).toFixed(2));
}

function readJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

async function tableExists(tableName: string): Promise<boolean> {
  const rows = await query<{ exists: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [`public.${tableName}`],
  );
  return Boolean(rows[0]?.exists);
}

function firstRow(rows: readonly CountRow[]): CountRow {
  return rows[0] ?? {};
}

function numberField(row: CountRow, key: string): number {
  return toNumber(row[key]);
}

function nullableNumberField(row: CountRow, key: string): number | null {
  return nullableNumber(row[key]);
}

function stringField(row: CountRow, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function getPipelineStatsSnapshot(
  options: PipelineStatsOptions = {},
): Promise<PipelineStatsSnapshot> {
  const limit = normalizePipelineStatsLimit(options.limit);
  const publicEligibleSql = getCallEligibilitySql("c");
  const scoreReadySql = getScoreReadyIgnoringConfidenceSql("c");

  const [
    creatorRows,
    creatorTierRows,
    videoRows,
    callRows,
    confidenceRows,
    symbolRows,
    creatorRawRows,
    creatorStatsExists,
    candlesExists,
    consensusExists,
    pipelineRunsExists,
    mlVerificationRunsExists,
  ] = await Promise.all([
    query<CountRow>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE NULLIF(BTRIM(youtube_handle), '') IS NOT NULL)::text AS with_youtube_handle,
         COUNT(*) FILTER (WHERE NULLIF(BTRIM(youtube_channel_id), '') IS NOT NULL)::text AS with_youtube_channel_id,
         COUNT(*) FILTER (WHERE accuracy_rank IS NOT NULL)::text AS ranked_snapshot,
         COUNT(*) FILTER (WHERE total_calls > 0)::text AS with_snapshot_calls,
         MIN(created_at)::text AS first_created_at,
         MAX(created_at)::text AS latest_created_at,
         MAX(last_scraped_at)::text AS latest_scraped_at
       FROM creators`,
    ),
    query<CreatorTierRow>(
      `SELECT COALESCE(NULLIF(tier, ''), 'unknown') AS tier, COUNT(*)::text AS creators
       FROM creators
       GROUP BY COALESCE(NULLIF(tier, ''), 'unknown')
       ORDER BY COUNT(*) DESC, tier ASC`,
    ),
    query<CountRow>(
      `WITH video_call_counts AS (
         SELECT video_id, COUNT(*) AS call_count
         FROM calls
         GROUP BY video_id
       )
       SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE published_at IS NOT NULL)::text AS with_published_at,
         COUNT(*) FILTER (WHERE published_at >= NOW() - INTERVAL '365 days')::text AS last_365d,
         COUNT(*) FILTER (WHERE NULLIF(BTRIM(transcript), '') IS NOT NULL)::text AS with_transcript,
         COUNT(*) FILTER (
           WHERE published_at >= NOW() - INTERVAL '365 days'
             AND NULLIF(BTRIM(transcript), '') IS NOT NULL
         )::text AS last_365d_with_transcript,
         COUNT(*) FILTER (
           WHERE NULLIF(BTRIM(transcript), '') IS NOT NULL
             AND COALESCE(transcript_quality, 0) > 0.2
         )::text AS extraction_eligible,
         COUNT(*) FILTER (
           WHERE published_at >= NOW() - INTERVAL '365 days'
             AND NULLIF(BTRIM(transcript), '') IS NOT NULL
             AND COALESCE(transcript_quality, 0) > 0.2
         )::text AS last_365d_extraction_eligible,
         COUNT(*) FILTER (WHERE NULLIF(BTRIM(transcript), '') IS NULL)::text AS missing_transcript,
         COUNT(*) FILTER (
           WHERE published_at >= NOW() - INTERVAL '365 days'
             AND NULLIF(BTRIM(transcript), '') IS NULL
         )::text AS last_365d_missing_transcript,
         COUNT(*) FILTER (WHERE calls_extracted IS TRUE)::text AS marked_extracted,
         COUNT(*) FILTER (WHERE calls_extracted IS NOT TRUE)::text AS not_marked_extracted,
         COUNT(*) FILTER (WHERE calls_extracted AND COALESCE(vcc.call_count, 0) = 0)::text AS extracted_zero_calls,
         COUNT(*) FILTER (
           WHERE calls_extracted IS NOT TRUE
             AND NULLIF(BTRIM(transcript), '') IS NOT NULL
             AND COALESCE(transcript_quality, 0) > 0.2
         )::text AS eligible_not_extracted,
         AVG(transcript_quality) FILTER (WHERE NULLIF(BTRIM(transcript), '') IS NOT NULL)::float8 AS avg_transcript_quality,
         MIN(published_at)::text AS earliest_published_at,
         MAX(published_at)::text AS latest_published_at
       FROM videos v
       LEFT JOIN video_call_counts vcc ON vcc.video_id = v.id`,
    ),
    query<CountRow>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(DISTINCT video_id)::text AS videos_with_calls,
         COUNT(DISTINCT creator_id)::text AS creators_with_calls,
         COUNT(*) FILTER (WHERE extraction_confidence >= $1)::text AS high_confidence,
         COUNT(*) FILTER (WHERE extraction_confidence < $1)::text AS low_confidence,
         COUNT(*) FILTER (WHERE ${scoreReadySql})::text AS score_ready_ignoring_confidence,
         COUNT(*) FILTER (WHERE ${publicEligibleSql})::text AS public_score_eligible,
         COUNT(*) FILTER (WHERE extraction_confidence < $1 AND ${scoreReadySql})::text AS low_confidence_score_ready,
         COUNT(*) FILTER (WHERE extraction_confidence >= $1 AND NOT (${scoreReadySql}))::text AS high_confidence_not_score_ready,
         COUNT(*) FILTER (WHERE price_at_call IS NOT NULL)::text AS with_price_at_call,
         COUNT(*) FILTER (WHERE price_at_call IS NULL)::text AS missing_price_at_call,
         COUNT(*) FILTER (WHERE price_30d IS NOT NULL)::text AS with_price_30d,
         COUNT(*) FILTER (WHERE return_30d IS NOT NULL)::text AS with_return_30d,
         COUNT(*) FILTER (WHERE call_date <= NOW() - INTERVAL '30 days')::text AS thirty_day_elapsed,
         COUNT(*) FILTER (WHERE call_date > NOW() - INTERVAL '30 days')::text AS thirty_day_pending_time,
         COUNT(*) FILTER (
           WHERE call_date <= NOW() - INTERVAL '30 days'
             AND (price_30d IS NULL OR return_30d IS NULL)
         )::text AS thirty_day_missing_eval,
         COUNT(*) FILTER (WHERE target_price IS NOT NULL)::text AS target_calls,
         COUNT(*) FILTER (WHERE target_price IS NOT NULL AND call_date <= NOW() - INTERVAL '90 days')::text AS target_90d_elapsed,
         COUNT(*) FILTER (WHERE target_price IS NOT NULL AND call_date > NOW() - INTERVAL '90 days')::text AS target_90d_pending_time,
         COUNT(*) FILTER (
           WHERE target_price IS NOT NULL
             AND call_date <= NOW() - INTERVAL '90 days'
             AND (price_90d IS NULL OR hit_target IS NULL)
         )::text AS target_90d_missing_eval,
         COUNT(*) FILTER (WHERE target_price IS NOT NULL AND price_90d IS NOT NULL AND hit_target IS NOT NULL)::text AS target_90d_ready,
         COUNT(*) FILTER (WHERE hit_target IS TRUE)::text AS with_hit_target,
         COUNT(*) FILTER (WHERE correct_direction IS NOT NULL)::text AS with_correct_direction,
         COUNT(*) FILTER (WHERE score > 0)::text AS nonzero_score,
         MIN(call_date)::text AS earliest_call_at,
         MAX(call_date)::text AS latest_call_at,
         MIN(created_at)::text AS first_created_at,
         MAX(created_at)::text AS latest_created_at
       FROM calls c`,
      [EXTRACTION_CONFIDENCE_THRESHOLD],
    ),
    query<ConfidenceRow>(
      `SELECT
         extraction_confidence::text,
         COUNT(*)::text AS calls,
         COUNT(DISTINCT video_id)::text AS videos,
         COUNT(DISTINCT creator_id)::text AS creators,
         MIN(created_at)::text AS created_first_at,
         MAX(created_at)::text AS created_latest_at
       FROM calls
       GROUP BY extraction_confidence
       ORDER BY extraction_confidence DESC NULLS LAST`,
    ),
    query<SymbolRow>(
      `SELECT
         symbol,
         COUNT(*)::text AS raw_calls,
         COUNT(*) FILTER (WHERE extraction_confidence >= $1)::text AS high_confidence_calls,
         COUNT(*) FILTER (WHERE ${scoreReadySql})::text AS score_ready_ignoring_confidence_calls,
         COUNT(*) FILTER (WHERE ${publicEligibleSql})::text AS public_score_eligible_calls,
         COUNT(DISTINCT video_id)::text AS videos,
         COUNT(DISTINCT creator_id)::text AS creators,
         COUNT(*) FILTER (WHERE price_at_call IS NULL)::text AS missing_price_at_call,
         MAX(call_date)::text AS latest_call_at
       FROM calls c
       GROUP BY symbol
       ORDER BY COUNT(*) DESC, symbol ASC
       LIMIT $2`,
      [EXTRACTION_CONFIDENCE_THRESHOLD, limit],
    ),
    query<CreatorRawCallsRow>(
      `SELECT
         cr.id::text AS creator_id,
         cr.name,
         cr.youtube_handle,
         COUNT(c.id)::text AS raw_calls,
         COUNT(c.id) FILTER (WHERE c.extraction_confidence >= $1)::text AS high_confidence_calls,
         COUNT(c.id) FILTER (WHERE ${scoreReadySql})::text AS score_ready_ignoring_confidence_calls,
         COUNT(c.id) FILTER (WHERE ${publicEligibleSql})::text AS public_score_eligible_calls,
         COUNT(DISTINCT c.video_id)::text AS videos_with_calls,
         MAX(c.call_date)::text AS latest_call_at
       FROM creators cr
       JOIN calls c ON c.creator_id = cr.id
       GROUP BY cr.id, cr.name, cr.youtube_handle
       ORDER BY COUNT(c.id) DESC, cr.name ASC
       LIMIT $2`,
      [EXTRACTION_CONFIDENCE_THRESHOLD, limit],
    ),
    tableExists("creator_stats"),
    tableExists("candles"),
    tableExists("consensus_signals"),
    tableExists("pipeline_runs"),
    tableExists("ml_verification_runs"),
  ]);

  const optionalQueries = await Promise.all([
    creatorStatsExists ? getCreatorStatsSummary(limit) : Promise.resolve(null),
    candlesExists ? getCandleStats(limit) : Promise.resolve(null),
    consensusExists ? getConsensusSummary() : Promise.resolve(null),
    pipelineRunsExists ? getPipelineRunSummary(limit) : Promise.resolve(null),
    mlVerificationRunsExists ? getMlVerificationSummary() : Promise.resolve(null),
  ]);

  const creatorRow = firstRow(creatorRows);
  const videoRow = firstRow(videoRows);
  const callRow = firstRow(callRows);
  const creatorStats = optionalQueries[0] ?? {
    exists: false,
    summary: {
      exists: false,
      note: "creator_stats table was not found",
    },
    leaderboard_top: [] as readonly Record<string, unknown>[],
  };
  const marketData = optionalQueries[1] ?? {
    candles: {
      exists: false,
      note: "candles table was not found",
    },
  };
  const consensus = optionalQueries[2] ?? {
    exists: false,
    note: "consensus_signals table was not found",
  };
  const pipelineRuns = optionalQueries[3] ?? {
    exists: false,
    note: "pipeline_runs table was not found",
  };
  const mlVerification = optionalQueries[4] ?? {
    exists: false,
    note: "ml_verification_runs table was not found",
  };

  return {
    generated_at: new Date().toISOString(),
    confidence_threshold: EXTRACTION_CONFIDENCE_THRESHOLD,
    limit,
    creators: {
      total: numberField(creatorRow, "total"),
      with_youtube_handle: numberField(creatorRow, "with_youtube_handle"),
      with_youtube_channel_id: numberField(creatorRow, "with_youtube_channel_id"),
      ranked_snapshot: numberField(creatorRow, "ranked_snapshot"),
      with_snapshot_calls: numberField(creatorRow, "with_snapshot_calls"),
      by_tier: Object.fromEntries(
        creatorTierRows.map((row) => [row.tier, toNumber(row.creators)]),
      ),
      first_created_at: stringField(creatorRow, "first_created_at"),
      latest_created_at: stringField(creatorRow, "latest_created_at"),
      latest_scraped_at: stringField(creatorRow, "latest_scraped_at"),
    },
    videos: {
      total: numberField(videoRow, "total"),
      with_published_at: numberField(videoRow, "with_published_at"),
      last_365d: numberField(videoRow, "last_365d"),
      with_transcript: numberField(videoRow, "with_transcript"),
      last_365d_with_transcript: numberField(videoRow, "last_365d_with_transcript"),
      missing_transcript: numberField(videoRow, "missing_transcript"),
      last_365d_missing_transcript: numberField(videoRow, "last_365d_missing_transcript"),
      extraction_eligible: numberField(videoRow, "extraction_eligible"),
      last_365d_extraction_eligible: numberField(videoRow, "last_365d_extraction_eligible"),
      marked_extracted: numberField(videoRow, "marked_extracted"),
      not_marked_extracted: numberField(videoRow, "not_marked_extracted"),
      extracted_zero_calls: numberField(videoRow, "extracted_zero_calls"),
      eligible_not_extracted: numberField(videoRow, "eligible_not_extracted"),
      avg_transcript_quality: nullableNumberField(videoRow, "avg_transcript_quality"),
      transcript_coverage_pct: percentage(videoRow.with_transcript, videoRow.total),
      last_365d_transcript_coverage_pct: percentage(
        videoRow.last_365d_with_transcript,
        videoRow.last_365d,
      ),
      extraction_eligible_coverage_pct: percentage(videoRow.extraction_eligible, videoRow.total),
      extraction_marked_pct: percentage(videoRow.marked_extracted, videoRow.total),
      earliest_published_at: stringField(videoRow, "earliest_published_at"),
      latest_published_at: stringField(videoRow, "latest_published_at"),
    },
    calls: {
      total: numberField(callRow, "total"),
      videos_with_calls: numberField(callRow, "videos_with_calls"),
      creators_with_calls: numberField(callRow, "creators_with_calls"),
      high_confidence: numberField(callRow, "high_confidence"),
      low_confidence: numberField(callRow, "low_confidence"),
      score_ready_ignoring_confidence: numberField(callRow, "score_ready_ignoring_confidence"),
      public_score_eligible: numberField(callRow, "public_score_eligible"),
      low_confidence_score_ready: numberField(callRow, "low_confidence_score_ready"),
      high_confidence_not_score_ready: numberField(callRow, "high_confidence_not_score_ready"),
      with_price_at_call: numberField(callRow, "with_price_at_call"),
      missing_price_at_call: numberField(callRow, "missing_price_at_call"),
      with_price_30d: numberField(callRow, "with_price_30d"),
      with_return_30d: numberField(callRow, "with_return_30d"),
      thirty_day_elapsed: numberField(callRow, "thirty_day_elapsed"),
      thirty_day_pending_time: numberField(callRow, "thirty_day_pending_time"),
      thirty_day_missing_eval: numberField(callRow, "thirty_day_missing_eval"),
      target_calls: numberField(callRow, "target_calls"),
      target_90d_elapsed: numberField(callRow, "target_90d_elapsed"),
      target_90d_pending_time: numberField(callRow, "target_90d_pending_time"),
      target_90d_missing_eval: numberField(callRow, "target_90d_missing_eval"),
      target_90d_ready: numberField(callRow, "target_90d_ready"),
      with_hit_target: numberField(callRow, "with_hit_target"),
      with_correct_direction: numberField(callRow, "with_correct_direction"),
      nonzero_score: numberField(callRow, "nonzero_score"),
      high_confidence_pct: percentage(callRow.high_confidence, callRow.total),
      public_score_eligible_pct: percentage(callRow.public_score_eligible, callRow.total),
      price_at_call_coverage_pct: percentage(callRow.with_price_at_call, callRow.total),
      low_confidence_score_ready_pct_of_low_confidence: percentage(
        callRow.low_confidence_score_ready,
        callRow.low_confidence,
      ),
      earliest_call_at: stringField(callRow, "earliest_call_at"),
      latest_call_at: stringField(callRow, "latest_call_at"),
      first_created_at: stringField(callRow, "first_created_at"),
      latest_created_at: stringField(callRow, "latest_created_at"),
    },
    calls_by_confidence: confidenceRows.map((row) => ({
      extraction_confidence: nullableNumber(row.extraction_confidence),
      calls: toNumber(row.calls),
      videos: toNumber(row.videos),
      creators: toNumber(row.creators),
      created_first_at: row.created_first_at,
      created_latest_at: row.created_latest_at,
    })),
    top_symbols_by_raw_calls: symbolRows.map((row) => ({
      symbol: row.symbol,
      raw_calls: toNumber(row.raw_calls),
      high_confidence_calls: toNumber(row.high_confidence_calls),
      score_ready_ignoring_confidence_calls: toNumber(row.score_ready_ignoring_confidence_calls),
      public_score_eligible_calls: toNumber(row.public_score_eligible_calls),
      videos: toNumber(row.videos),
      creators: toNumber(row.creators),
      missing_price_at_call: toNumber(row.missing_price_at_call),
      latest_call_at: row.latest_call_at,
    })),
    top_creators_by_raw_calls: creatorRawRows.map((row) => ({
      creator_id: toNumber(row.creator_id),
      name: row.name,
      youtube_handle: row.youtube_handle,
      raw_calls: toNumber(row.raw_calls),
      high_confidence_calls: toNumber(row.high_confidence_calls),
      score_ready_ignoring_confidence_calls: toNumber(row.score_ready_ignoring_confidence_calls),
      public_score_eligible_calls: toNumber(row.public_score_eligible_calls),
      videos_with_calls: toNumber(row.videos_with_calls),
      latest_call_at: row.latest_call_at,
    })),
    creator_stats: creatorStats.summary,
    leaderboard_top: creatorStats.leaderboard_top ?? [],
    market_data: marketData,
    consensus,
    orchestration: {
      pipeline_runs: pipelineRuns,
      ml_verification_runs: mlVerification,
    },
  };
}

async function getCreatorStatsSummary(limit: number): Promise<{
  readonly exists: true;
  readonly summary: Record<string, unknown>;
  readonly leaderboard_top: readonly Record<string, unknown>[];
}> {
  const [summaryRows, leaderboardRows] = await Promise.all([
    query<CreatorStatsSummaryRow>(
      `SELECT
         COUNT(*)::text AS rows,
         COUNT(*) FILTER (WHERE period = 'all_time')::text AS all_time_rows,
         COUNT(*) FILTER (WHERE period = 'all_time' AND total_calls > 0)::text AS ranked_all_time_creators,
         COALESCE(SUM(total_calls) FILTER (WHERE period = 'all_time'), 0)::text AS public_scored_calls_all_time,
         MAX(updated_at)::text AS latest_updated_at
       FROM creator_stats`,
    ),
    query<LeaderboardRow>(
      `SELECT
         cs.accuracy_rank::text,
         cr.id::text AS creator_id,
         cr.name,
         cr.youtube_handle,
         cs.total_calls::text,
         cs.win_rate,
         cs.avg_return_30d,
         cs.avg_alpha_30d,
         cs.alpha_score,
         cs.updated_at::text
       FROM creator_stats cs
       JOIN creators cr ON cr.id = cs.creator_id
       WHERE cs.period = 'all_time'
         AND cs.total_calls > 0
       ORDER BY cs.accuracy_rank ASC NULLS LAST, cs.alpha_score DESC, cr.name ASC
       LIMIT $1`,
      [limit],
    ),
  ]);

  const summary = summaryRows[0];
  return {
    exists: true,
    summary: {
      exists: true,
      rows: toNumber(summary?.rows),
      all_time_rows: toNumber(summary?.all_time_rows),
      ranked_all_time_creators: toNumber(summary?.ranked_all_time_creators),
      public_scored_calls_all_time: toNumber(summary?.public_scored_calls_all_time),
      latest_updated_at: summary?.latest_updated_at ?? null,
    },
    leaderboard_top: leaderboardRows.map((row) => ({
      accuracy_rank: nullableNumber(row.accuracy_rank),
      creator_id: toNumber(row.creator_id),
      name: row.name,
      youtube_handle: row.youtube_handle,
      total_calls: toNumber(row.total_calls),
      win_rate: row.win_rate,
      avg_return_30d: row.avg_return_30d,
      avg_alpha_30d: row.avg_alpha_30d,
      alpha_score: row.alpha_score,
      updated_at: row.updated_at,
    })),
  };
}

async function getCandleStats(limit: number): Promise<Record<string, unknown>> {
  const [estimateRows, coverageRows] = await Promise.all([
    query<CandleEstimateRow>(
      `SELECT
         GREATEST(COALESCE(c.reltuples, 0), 0)::bigint::text AS estimated_rows,
         s.n_distinct::text AS estimated_symbols,
         st.last_analyze::text AS last_analyzed_at
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_stat_all_tables st ON st.relid = c.oid
       LEFT JOIN pg_stats s
         ON s.schemaname = n.nspname
        AND s.tablename = c.relname
        AND s.attname = 'symbol'
       WHERE n.nspname = 'public'
         AND c.relname = 'candles'
       LIMIT 1`,
    ),
    query<CandleCoverageRow>(
      `WITH call_symbols AS (
         SELECT symbol, COUNT(*)::text AS call_count
         FROM calls
         GROUP BY symbol
       )
       SELECT
         cs.symbol,
         cs.call_count,
         earliest.open_time::text AS earliest_open_time,
         CASE WHEN earliest.open_time IS NULL THEN NULL ELSE to_timestamp(earliest.open_time / 1000.0)::text END AS earliest_at,
         latest.open_time::text AS latest_open_time,
         CASE WHEN latest.open_time IS NULL THEN NULL ELSE to_timestamp(latest.open_time / 1000.0)::text END AS latest_at,
         CASE WHEN latest.open_time IS NULL THEN NULL ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - to_timestamp(latest.open_time / 1000.0))) / 86400)::text END AS days_since_latest
       FROM call_symbols cs
       LEFT JOIN LATERAL (
         SELECT open_time
         FROM candles
         WHERE symbol = cs.symbol
         ORDER BY open_time ASC
         LIMIT 1
       ) earliest ON TRUE
       LEFT JOIN LATERAL (
         SELECT open_time
         FROM candles
         WHERE symbol = cs.symbol
         ORDER BY open_time DESC
         LIMIT 1
       ) latest ON TRUE
       ORDER BY latest.open_time ASC NULLS FIRST, cs.call_count::bigint DESC, cs.symbol ASC`,
    ),
  ]);

  const estimate = estimateRows[0];
  const covered = coverageRows.filter((row) => row.latest_open_time !== null);
  const latestTimes = covered.map((row) => toNumber(row.latest_open_time));
  const earliestTimes = covered.map((row) => toNumber(row.earliest_open_time));

  return {
    candles: {
      exists: true,
      estimated_rows: toNumber(estimate?.estimated_rows),
      estimated_symbols: nullableNumber(estimate?.estimated_symbols),
      estimate_source: "pg_class.reltuples / pg_stats.n_distinct; avoids scanning the large candles table on every API call",
      last_analyzed_at: estimate?.last_analyzed_at ?? null,
      call_symbols_total: coverageRows.length,
      call_symbols_with_candles: covered.length,
      call_symbol_coverage_pct: percentage(covered.length, coverageRows.length),
      earliest_call_symbol_open_time: earliestTimes.length > 0 ? Math.min(...earliestTimes) : null,
      latest_call_symbol_open_time: latestTimes.length > 0 ? Math.max(...latestTimes) : null,
      freshness_worst_call_symbols: coverageRows.slice(0, limit).map((row) => ({
        symbol: row.symbol,
        call_count: toNumber(row.call_count),
        earliest_open_time: nullableNumber(row.earliest_open_time),
        earliest_at: row.earliest_at,
        latest_open_time: nullableNumber(row.latest_open_time),
        latest_at: row.latest_at,
        days_since_latest: nullableNumber(row.days_since_latest),
      })),
    },
  };
}

async function getConsensusSummary(): Promise<Record<string, unknown>> {
  const rows = await query<OptionalSummaryRow>(
    `SELECT
       COUNT(*)::text AS total,
       COUNT(*) FILTER (WHERE correct IS NOT NULL)::text AS evaluated,
       COUNT(*) FILTER (WHERE correct IS TRUE)::text AS correct,
       COUNT(DISTINCT symbol)::text AS symbols,
       MIN(signal_date)::text AS earliest_signal_at,
       MAX(signal_date)::text AS latest_signal_at
     FROM consensus_signals`,
  );
  const row = firstRow(rows);
  return {
    exists: true,
    total: numberField(row, "total"),
    evaluated: numberField(row, "evaluated"),
    correct: numberField(row, "correct"),
    symbols: numberField(row, "symbols"),
    win_rate_pct: percentage(row.correct, row.evaluated),
    earliest_signal_at: stringField(row, "earliest_signal_at"),
    latest_signal_at: stringField(row, "latest_signal_at"),
  };
}

async function getPipelineRunSummary(limit: number): Promise<Record<string, unknown>> {
  const [summaryRows, recentRows] = await Promise.all([
    query<OptionalSummaryRow>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE status = 'queued')::text AS queued,
         COUNT(*) FILTER (WHERE status = 'running')::text AS running,
         COUNT(*) FILTER (WHERE status = 'succeeded')::text AS succeeded,
         COUNT(*) FILTER (WHERE status = 'failed')::text AS failed,
         COUNT(*) FILTER (WHERE status = 'cancelled')::text AS cancelled,
         MAX(created_at)::text AS latest_created_at,
         MAX(finished_at)::text AS latest_finished_at
       FROM pipeline_runs`,
    ),
    query<RecentPipelineRunRow>(
      `SELECT
         run_key,
         type,
         status,
         started_at::text,
         finished_at::text,
         created_at::text,
         updated_at::text,
         metrics
       FROM pipeline_runs
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    ),
  ]);
  const row = firstRow(summaryRows);
  return {
    exists: true,
    total: numberField(row, "total"),
    queued: numberField(row, "queued"),
    running: numberField(row, "running"),
    succeeded: numberField(row, "succeeded"),
    failed: numberField(row, "failed"),
    cancelled: numberField(row, "cancelled"),
    latest_created_at: stringField(row, "latest_created_at"),
    latest_finished_at: stringField(row, "latest_finished_at"),
    recent: recentRows.map((run) => ({
      run_key: run.run_key,
      type: run.type,
      status: run.status,
      started_at: run.started_at,
      finished_at: run.finished_at,
      created_at: run.created_at,
      updated_at: run.updated_at,
      metrics: readJsonObject(run.metrics),
    })),
  };
}

async function getMlVerificationSummary(): Promise<Record<string, unknown>> {
  const rows = await query<OptionalSummaryRow>(
    `SELECT
       COUNT(*)::text AS total,
       COUNT(DISTINCT call_id)::text AS calls_verified,
       COUNT(*) FILTER (WHERE decision = 'approve')::text AS approved,
       COUNT(*) FILTER (WHERE decision = 'reject')::text AS rejected,
       COUNT(*) FILTER (WHERE decision = 'review')::text AS needs_review,
       COUNT(DISTINCT model)::text AS models,
       MAX(created_at)::text AS latest_created_at
     FROM ml_verification_runs`,
  );
  const row = firstRow(rows);
  return {
    exists: true,
    total: numberField(row, "total"),
    calls_verified: numberField(row, "calls_verified"),
    approved: numberField(row, "approved"),
    rejected: numberField(row, "rejected"),
    needs_review: numberField(row, "needs_review"),
    models: numberField(row, "models"),
    latest_created_at: stringField(row, "latest_created_at"),
  };
}
