import type { LeaderboardSentinelOperational, LeaderboardSentinelRow } from "./leaderboard-sentinel-v2";

export type ReadOnlyQueryExecutor = (
  statement: string,
  params?: readonly unknown[],
) => Promise<readonly Record<string, unknown>[]>;

interface PublicLeaderboardApiRow {
  readonly rank?: unknown;
  readonly creator?: {
    readonly id?: unknown;
    readonly name?: unknown;
  };
  readonly stats?: {
    readonly period?: unknown;
    readonly alpha_score?: unknown;
    readonly effective_n?: unknown;
    readonly total_calls?: unknown;
    readonly updated_at?: unknown;
  };
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requiredNumber(value: unknown, label: string): number {
  const parsed = finiteNumber(value);
  if (parsed === null) throw new Error(`malformed public leaderboard row: ${label}`);
  return parsed;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function parsePublicLeaderboardV2Payload(payload: unknown): readonly LeaderboardSentinelRow[] {
  if (!payload || typeof payload !== "object") throw new Error("malformed public leaderboard payload");
  const data = (payload as { data?: unknown }).data;
  const meta = (payload as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object" || stringOrNull((meta as { period?: unknown }).period) !== "12m") {
    throw new Error("malformed public leaderboard payload: meta.period must be 12m");
  }
  if (!data || typeof data !== "object") throw new Error("malformed public leaderboard payload: data missing");
  const leaderboard = (data as { leaderboard?: unknown }).leaderboard;
  if (!Array.isArray(leaderboard)) throw new Error("malformed public leaderboard payload: leaderboard missing");

  return leaderboard.slice(0, 100).map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error(`malformed public leaderboard row: index ${index}`);
    const row = raw as PublicLeaderboardApiRow;
    const creatorName = stringOrNull(row.creator?.name);
    if (!creatorName) throw new Error(`malformed public leaderboard row: creator.name at index ${index}`);
    const rank = requiredNumber(row.rank, `rank at index ${index}`);
    if (!Number.isInteger(rank) || rank < 1) throw new Error(`malformed public leaderboard row: rank at index ${index}`);
    const period = stringOrNull(row.stats?.period);
    if (period !== "12m") throw new Error(`malformed public leaderboard row: stats.period at index ${index}`);
    return {
      creator_id: requiredNumber(row.creator?.id, `creator.id at index ${index}`),
      creator_name: creatorName,
      period,
      rank,
      alpha_score: requiredNumber(row.stats?.alpha_score, `stats.alpha_score at index ${index}`),
      effective_n: finiteNumber(row.stats?.effective_n),
      total_calls: finiteNumber(row.stats?.total_calls),
      updated_at: stringOrNull(row.stats?.updated_at),
    } satisfies LeaderboardSentinelRow;
  });
}

function normalizeDatabaseRow(row: Readonly<Record<string, unknown>>): LeaderboardSentinelRow {
  const creatorId = finiteNumber(row.creator_id);
  const creatorName = stringOrNull(row.creator_name);
  if (creatorId === null || !creatorName) throw new Error("malformed internal leaderboard row");
  return {
    creator_id: creatorId,
    creator_name: creatorName,
    period: stringOrNull(row.period) ?? "all_time",
    rank: finiteNumber(row.rank),
    alpha_score: finiteNumber(row.alpha_score),
    effective_n: finiteNumber(row.effective_n),
    total_calls: finiteNumber(row.total_calls),
    updated_at: stringOrNull(row.updated_at),
  };
}

function countValue(row: Readonly<Record<string, unknown>>, key: string): number {
  return finiteNumber(row[key]) ?? 0;
}

export async function loadInternalLeaderboardSentinelV2(execute: ReadOnlyQueryExecutor): Promise<{
  readonly rows: readonly LeaderboardSentinelRow[];
  readonly operational: LeaderboardSentinelOperational;
}> {
  const rows = await execute(
    `SELECT
       c.id::text AS creator_id,
       c.name AS creator_name,
       cs.period,
       cs.accuracy_rank::text AS rank,
       cs.alpha_score::text AS alpha_score,
       cs.effective_n::text AS effective_n,
       cs.total_calls::text AS total_calls,
       cs.updated_at::text AS updated_at
     FROM creator_stats cs
     JOIN creators c ON c.id = cs.creator_id
     WHERE cs.period = 'all_time'
       AND cs.accuracy_rank IS NOT NULL
     ORDER BY cs.accuracy_rank ASC, c.id ASC
     LIMIT 100`,
  );
  const operationalRows = await execute(
    `SELECT
       (SELECT status FROM pipeline_runs WHERE type = 'compute-scores' ORDER BY created_at DESC LIMIT 1) AS latest_pipeline_status,
       (SELECT finished_at::text FROM pipeline_runs WHERE type = 'compute-scores' ORDER BY created_at DESC LIMIT 1) AS latest_pipeline_finished_at,
       (SELECT COUNT(*)::text FROM pipeline_runs WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours') AS failed_pipeline_runs_24h,
       (SELECT COUNT(*)::text FROM pipeline_jobs WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours') AS failed_pipeline_jobs_24h,
       (SELECT COUNT(*)::text FROM pipeline_jobs WHERE status IN ('pending', 'running')) AS active_pipeline_jobs,
       (SELECT COUNT(*)::text FROM videos WHERE NULLIF(BTRIM(transcript), '') IS NULL AND COALESCE(transcript_status, 'pending') <> 'failed') AS pending_transcripts,
       (SELECT COUNT(*)::text FROM videos WHERE NULLIF(BTRIM(transcript), '') IS NULL AND transcript_status = 'failed') AS failed_transcripts`,
  );
  const operationalRow = operationalRows[0] ?? {};
  return {
    rows: rows.map(normalizeDatabaseRow),
    operational: {
      latest_pipeline_status: stringOrNull(operationalRow.latest_pipeline_status),
      latest_pipeline_finished_at: stringOrNull(operationalRow.latest_pipeline_finished_at),
      failed_pipeline_runs_24h: countValue(operationalRow, "failed_pipeline_runs_24h"),
      failed_pipeline_jobs_24h: countValue(operationalRow, "failed_pipeline_jobs_24h"),
      active_pipeline_jobs: countValue(operationalRow, "active_pipeline_jobs"),
      pending_transcripts: countValue(operationalRow, "pending_transcripts"),
      failed_transcripts: countValue(operationalRow, "failed_transcripts"),
    },
  };
}
