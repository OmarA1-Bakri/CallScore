import { query } from "./db";
import { getCallEligibilitySql } from "./public-methodology";

export interface AutonomyStatusSnapshot {
  readonly generated_at: string;
  readonly db_health: {
    readonly ok: boolean;
    readonly checked_at: string;
  };
  readonly latest_pipeline_run: Record<string, unknown> | null;
  readonly latest_video_discovery: Record<string, unknown> | null;
  readonly latest_extraction: Record<string, unknown> | null;
  readonly latest_scored_call: Record<string, unknown> | null;
  readonly latest_leaderboard_update: Record<string, unknown> | null;
  readonly failed_jobs: Record<string, unknown>;
}

interface CountRow {
  readonly total: string;
  readonly last_7d: string;
}

function firstRecord(rows: readonly Record<string, unknown>[]): Record<string, unknown> | null {
  return rows[0] ?? null;
}

function numberFromText(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function unavailableAutonomyStatusSnapshot(
  checkedAt = new Date().toISOString(),
): AutonomyStatusSnapshot {
  return {
    generated_at: checkedAt,
    db_health: { ok: false, checked_at: checkedAt },
    latest_pipeline_run: null,
    latest_video_discovery: null,
    latest_extraction: null,
    latest_scored_call: null,
    latest_leaderboard_update: null,
    failed_jobs: { total: 0, last_7d: 0 },
  };
}

export async function getAutonomyStatusSnapshot(): Promise<AutonomyStatusSnapshot> {
  const checkedAt = new Date().toISOString();
  await query("SELECT 1 AS ok");

  const publicScoredSql = getCallEligibilitySql("c");
  const [
    latestPipelineRun,
    latestVideoDiscovery,
    latestExtraction,
    latestScoredCall,
    latestLeaderboardUpdate,
    failedJobRows,
  ] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT
         id::text,
         run_key,
         type,
         status,
         started_at::text,
         finished_at::text,
         created_at::text,
         updated_at::text
       FROM pipeline_runs
       ORDER BY COALESCE(started_at, created_at) DESC
       LIMIT 1`,
    ),
    query<Record<string, unknown>>(
      `SELECT
         v.id::text,
         v.youtube_video_id,
         v.title,
         cr.name AS creator_name,
         cr.youtube_handle,
         v.published_at::text,
         v.created_at::text
       FROM videos v
       LEFT JOIN creators cr ON cr.id = v.creator_id
       ORDER BY v.created_at DESC
       LIMIT 1`,
    ),
    query<Record<string, unknown>>(
      `SELECT
         c.id::text,
         c.symbol,
         c.direction,
         c.created_at::text,
         c.call_date::text,
         c.extraction_confidence,
         cr.name AS creator_name,
         cr.youtube_handle,
         v.youtube_video_id
       FROM calls c
       LEFT JOIN creators cr ON cr.id = c.creator_id
       LEFT JOIN videos v ON v.id = c.video_id
       ORDER BY c.created_at DESC
       LIMIT 1`,
    ),
    query<Record<string, unknown>>(
      `SELECT
         c.id::text,
         c.symbol,
         c.direction,
         c.call_date::text,
         c.score,
         c.return_30d,
         c.alpha_30d,
         cr.name AS creator_name,
         cr.youtube_handle,
         v.youtube_video_id
       FROM calls c
       LEFT JOIN creators cr ON cr.id = c.creator_id
       LEFT JOIN videos v ON v.id = c.video_id
       WHERE ${publicScoredSql}
       ORDER BY c.call_date DESC, c.id DESC
       LIMIT 1`,
    ),
    query<Record<string, unknown>>(
      `SELECT
         MAX(updated_at)::text AS updated_at,
         COUNT(*)::text AS rows,
         COUNT(*) FILTER (WHERE period = 'all_time')::text AS all_time_rows
       FROM creator_stats`,
    ),
    query<CountRow>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '7 days')::text AS last_7d
       FROM pipeline_jobs
       WHERE status = 'failed'`,
    ),
  ]);

  const failedJobs = failedJobRows[0] ?? { total: "0", last_7d: "0" };

  return {
    generated_at: checkedAt,
    db_health: { ok: true, checked_at: checkedAt },
    latest_pipeline_run: firstRecord(latestPipelineRun),
    latest_video_discovery: firstRecord(latestVideoDiscovery),
    latest_extraction: firstRecord(latestExtraction),
    latest_scored_call: firstRecord(latestScoredCall),
    latest_leaderboard_update: firstRecord(latestLeaderboardUpdate),
    failed_jobs: {
      total: numberFromText(failedJobs.total),
      last_7d: numberFromText(failedJobs.last_7d),
    },
  };
}
