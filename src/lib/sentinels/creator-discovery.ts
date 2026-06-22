import { query } from "../db";
import type { FreshCallCandidate, FreshCallDedupeState } from "./fresh-call-sentinel";

export interface FreshCallDiscoveryQueryArgs {
  readonly limit: number;
  readonly sinceDays: number;
}

export interface FreshCallCandidateRow {
  readonly kind: "video" | "call";
  readonly source: "transcript_worklist";
  readonly creator_id: number | string | null;
  readonly creator_handle: string | null;
  readonly video_id: number | string | null;
  readonly youtube_video_id: string | null;
  readonly published_at: string | null;
  readonly transcript_status: "missing" | "queued" | "ready" | "cooldown" | "failed" | "not_required";
  readonly candidate_call_count: number | string | null;
}

interface FreshCallExistingDedupeRow {
  readonly dedupe_type: "call_video_id" | "call_youtube_video_id" | "creator_handle" | "video_youtube_id" | "pipeline_job_key" | "channel_task_key";
  readonly dedupe_value: string | null;
}

function boundedPositiveInt(value: number, fallback: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(max, Math.floor(value));
}

export function normalizeFreshCallPublishedAt(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const postgresLike = trimmed.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?:\s*([+-]\d{2})(?::?(\d{2}))?|\s*(Z))?$/i);
  const normalized = postgresLike
    ? `${postgresLike[1]}T${postgresLike[2]}${postgresLike[5] ? "Z" : postgresLike[3] ? `${postgresLike[3]}:${postgresLike[4] ?? "00"}` : "Z"}`
    : trimmed;
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeCandidate(row: FreshCallCandidateRow): FreshCallCandidate {
  return {
    kind: row.kind,
    source: row.source,
    creator_id: row.creator_id,
    creator_handle: row.creator_handle,
    video_id: row.video_id,
    youtube_video_id: row.youtube_video_id,
    published_at: normalizeFreshCallPublishedAt(row.published_at) ?? row.published_at,
    transcript_status: row.transcript_status,
    candidate_call_count: Number(row.candidate_call_count ?? 0),
  };
}

export function rowsToFreshCallCandidates(rows: readonly FreshCallCandidateRow[]): readonly FreshCallCandidate[] {
  return rows.map(normalizeCandidate);
}

export function buildFreshCallCandidateSql(args: FreshCallDiscoveryQueryArgs): { readonly sql: string; readonly params: readonly unknown[] } {
  const sinceDays = boundedPositiveInt(args.sinceDays, 14, 365);
  const limit = boundedPositiveInt(args.limit, 25, 250);
  return {
    sql: `WITH recent_videos AS (
        SELECT
          v.id,
          v.creator_id,
          c.youtube_handle,
          v.youtube_video_id,
          v.published_at::text AS published_at,
          CASE
            WHEN v.transcript IS NOT NULL AND length(v.transcript) > 0 AND COALESCE(v.calls_extracted, false) = false THEN 'call'
            ELSE 'video'
          END AS kind,
          CASE
            WHEN v.transcript IS NOT NULL AND length(v.transcript) > 0 THEN 'ready'
            WHEN COALESCE(v.transcript_status, 'pending') IN ('pending', 'attempted') THEN 'missing'
            WHEN COALESCE(v.transcript_status, 'pending') = 'failed' THEN 'failed'
            ELSE 'queued'
          END AS transcript_status,
          CASE
            WHEN v.transcript IS NOT NULL AND length(v.transcript) > 0 AND COALESCE(v.calls_extracted, false) = false THEN 1
            ELSE 0
          END AS candidate_call_count
        FROM videos v
        JOIN creators c ON c.id = v.creator_id
        LEFT JOIN calls existing_calls ON existing_calls.video_id = v.id
        WHERE v.youtube_video_id IS NOT NULL
          AND v.published_at IS NOT NULL
          AND v.published_at >= NOW() - ($1::int * INTERVAL '1 day')
          AND existing_calls.id IS NULL
          AND (
            (v.transcript IS NOT NULL AND length(v.transcript) > 0 AND COALESCE(v.calls_extracted, false) = false)
            OR (v.transcript IS NULL OR length(v.transcript) = 0)
          )
      )
      SELECT
        kind,
        'transcript_worklist' AS source,
        creator_id,
        youtube_handle AS creator_handle,
        id AS video_id,
        youtube_video_id,
        published_at,
        transcript_status,
        candidate_call_count
      FROM recent_videos
      ORDER BY CASE kind WHEN 'call' THEN 0 ELSE 1 END, published_at DESC NULLS LAST, id DESC
      LIMIT $2`,
    params: [sinceDays, limit],
  };
}

export function buildFreshCallExistingDedupeSql(): { readonly sql: string; readonly params: readonly unknown[] } {
  return {
    sql: `SELECT 'call_video_id' AS dedupe_type, video_id::text AS dedupe_value
      FROM calls
      WHERE video_id IS NOT NULL
      UNION ALL
      SELECT 'call_youtube_video_id' AS dedupe_type, v.youtube_video_id AS dedupe_value
      FROM calls c
      JOIN videos v ON v.id = c.video_id
      WHERE v.youtube_video_id IS NOT NULL
      UNION ALL
      SELECT 'creator_handle' AS dedupe_type, lower(youtube_handle) AS dedupe_value
      FROM creators
      WHERE youtube_handle IS NOT NULL
      UNION ALL
      SELECT 'video_youtube_id' AS dedupe_type, lower(youtube_video_id) AS dedupe_value
      FROM videos
      WHERE youtube_video_id IS NOT NULL
      UNION ALL
      SELECT 'pipeline_job_key' AS dedupe_type, idempotency_key AS dedupe_value
      FROM pipeline_jobs
      WHERE status IN ('pending', 'running') AND idempotency_key IS NOT NULL
      UNION ALL
      SELECT 'channel_task_key' AS dedupe_type, idempotency_key AS dedupe_value
      FROM channel_tasks
      WHERE status IN ('pending', 'running') AND idempotency_key IS NOT NULL`,
    params: [],
  };
}

function add(set: Set<string>, value: string | null): void {
  if (value?.trim()) set.add(value.trim().toLowerCase());
}

export function rowsToFreshCallDedupeState(rows: readonly FreshCallExistingDedupeRow[]): FreshCallDedupeState {
  const callVideoIds = new Set<string>();
  const callYoutubeVideoIds = new Set<string>();
  const creatorHandles = new Set<string>();
  const videoYoutubeIds = new Set<string>();
  const pipelineJobIdempotencyKeys = new Set<string>();
  const channelTaskIdempotencyKeys = new Set<string>();

  for (const row of rows) {
    if (row.dedupe_type === "call_video_id") add(callVideoIds, row.dedupe_value);
    if (row.dedupe_type === "call_youtube_video_id") add(callYoutubeVideoIds, row.dedupe_value);
    if (row.dedupe_type === "creator_handle") add(creatorHandles, row.dedupe_value);
    if (row.dedupe_type === "video_youtube_id") add(videoYoutubeIds, row.dedupe_value);
    if (row.dedupe_type === "pipeline_job_key") add(pipelineJobIdempotencyKeys, row.dedupe_value);
    if (row.dedupe_type === "channel_task_key") add(channelTaskIdempotencyKeys, row.dedupe_value);
  }

  return { callVideoIds, callYoutubeVideoIds, creatorHandles, videoYoutubeIds, pipelineJobIdempotencyKeys, channelTaskIdempotencyKeys };
}

export async function loadFreshCallCandidates(args: FreshCallDiscoveryQueryArgs): Promise<readonly FreshCallCandidate[]> {
  const statement = buildFreshCallCandidateSql(args);
  const rows = await query<FreshCallCandidateRow>(statement.sql, [...statement.params]);
  return rowsToFreshCallCandidates(rows);
}

export async function loadFreshCallExistingDedupeState(): Promise<FreshCallDedupeState> {
  const statement = buildFreshCallExistingDedupeSql();
  const rows = await query<FreshCallExistingDedupeRow>(statement.sql, [...statement.params]);
  return rowsToFreshCallDedupeState(rows);
}
