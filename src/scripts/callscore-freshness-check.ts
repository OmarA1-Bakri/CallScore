import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { query } from "../lib/db";
import {
  CREATOR_STATS_CERTIFIED_THRESHOLDS,
  CREATOR_STATS_OFFICIAL_THRESHOLDS,
  CREATOR_STATS_PROVISIONAL_THRESHOLDS,
} from "../lib/creator-stats-eligibility";
import { loadEnv } from "./script-helpers";

const execFileAsync = promisify(execFile);

interface Args {
  readonly readApiBase: string | null;
}

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || argv[index + 1] === undefined) return null;
  return argv[index + 1];
}

export function parseFreshnessCheckArgs(argv = process.argv.slice(2)): Args {
  return {
    readApiBase: argValue(argv, "--read-api-base") ?? process.env.HH_READ_API_BASE ?? null,
  };
}


async function systemdTimerStatus(): Promise<Record<string, unknown>> {
  try {
    const { stdout } = await execFileAsync("systemctl", ["is-active", "callscore-daily-pipeline.timer"], { timeout: 5_000 });
    return { unit: "callscore-daily-pipeline.timer", active: stdout.trim() === "active", state: stdout.trim() };
  } catch (error) {
    const maybe = error as { stdout?: string; stderr?: string; message?: string };
    return { unit: "callscore-daily-pipeline.timer", active: false, state: (maybe.stdout ?? maybe.stderr ?? maybe.message ?? "unknown").trim() };
  }
}

function ageHours(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.now() - Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return Math.round((ms / 3_600_000) * 10) / 10;
}

async function fetchReadApi(base: string | null): Promise<Record<string, unknown> | null> {
  if (!base) return null;
  const root = base.replace(/\/$/, "");
  const periods = ["12m", "all_time", "90d", "30d"] as const;
  const byPeriod: Record<string, unknown> = {};
  let nativeBuckets = true;
  let leaderboardRowsEqualOfficial = true;
  let ok = true;

  for (const period of periods) {
    const response = await fetch(`${root}/home?period=${period}`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      byPeriod[period] = { ok: false, status: response.status };
      ok = false;
      continue;
    }
    const json = await response.json() as Record<string, unknown>;
    const official = Array.isArray(json.officialRankedRows) ? json.officialRankedRows : [];
    const legacyRows = (json.leaderboard as { rows?: unknown[] } | undefined)?.rows ?? [];
    const periodNative = Array.isArray(json.officialRankedRows)
      && Array.isArray(json.provisionalRows)
      && Array.isArray(json.watchlistRows)
      && Array.isArray(json.staleRows)
      && Array.isArray(json.excludedRows)
      && Array.isArray(json.pendingMaturityRows);
    const rowsEqual = JSON.stringify(legacyRows) === JSON.stringify(official);
    nativeBuckets = nativeBuckets && periodNative;
    leaderboardRowsEqualOfficial = leaderboardRowsEqualOfficial && rowsEqual;
    byPeriod[period] = {
      ok: json.ok === true,
      emptyReason: json.emptyReason ?? null,
      nativeBuckets: periodNative,
      officialCount: official.length,
      provisionalCount: Array.isArray(json.provisionalRows) ? json.provisionalRows.length : null,
      watchlistCount: Array.isArray(json.watchlistRows) ? json.watchlistRows.length : null,
      staleCount: Array.isArray(json.staleRows) ? json.staleRows.length : null,
      excludedCount: Array.isArray(json.excludedRows) ? json.excludedRows.length : null,
      pendingCount: Array.isArray(json.pendingMaturityRows) ? json.pendingMaturityRows.length : null,
      leaderboardRowsEqualOfficial: rowsEqual,
    };
  }

  return {
    ok,
    nativeBuckets,
    leaderboardRowsEqualOfficial,
    byPeriod,
  };
}

export async function runFreshnessCheck(args = parseFreshnessCheckArgs()): Promise<Record<string, unknown>> {
  const [identity] = await query<{ current_user: string; current_database: string; server_addr: string; server_port: number }>(
    `SELECT current_user, current_database(), inet_server_addr()::text AS server_addr, inet_server_port() AS server_port`,
  );
  const [freshness] = await query<Record<string, string | null>>(
    `SELECT
      (SELECT MAX(created_at)::text FROM pipeline_jobs) AS latest_job_created,
      (SELECT MAX(updated_at)::text FROM pipeline_jobs WHERE status = 'succeeded') AS latest_job_completed,
      (SELECT MAX(created_at)::text FROM pipeline_jobs WHERE type <> 'hermes_smoke_test') AS latest_non_smoke_job_created,
      (SELECT MAX(updated_at)::text FROM pipeline_jobs WHERE status = 'succeeded' AND type <> 'hermes_smoke_test') AS latest_non_smoke_job_completed,
      (SELECT MAX(updated_at)::text FROM pipeline_jobs WHERE status = 'succeeded' AND type = 'compute_scores') AS latest_compute_scores_completed,
      (SELECT MAX(created_at)::text FROM videos) AS latest_video_inserted,
      (SELECT MAX(transcript_last_attempt_at)::text FROM videos) AS latest_transcript_attempt,
      (SELECT MAX(transcript_last_attempt_at)::text FROM videos WHERE transcript_status = 'available' AND NULLIF(BTRIM(transcript), '') IS NOT NULL) AS latest_transcript_success,
      (SELECT COUNT(*)::text FROM videos WHERE transcript_error = 'provider_credentials_missing') AS transcript_provider_missing_failures,
      (SELECT COUNT(*)::text FROM videos WHERE transcript_error = 'bot_verification_required') AS transcript_bot_verification_failures,
      (SELECT COUNT(*)::text FROM videos WHERE transcript_error = 'cookie_invalid_or_rotated') AS transcript_cookie_invalid_failures,
      (SELECT COUNT(*)::text FROM videos WHERE transcript_error = 'po_token_required') AS transcript_po_token_required_failures,
      (SELECT COUNT(*)::text FROM videos WHERE transcript_error = 'js_challenge_runtime_missing') AS transcript_js_runtime_missing_failures,
      (SELECT COUNT(*)::text FROM videos WHERE transcript_error = 'rate_limited') AS transcript_rate_limited_failures,
      (SELECT MAX(created_at)::text FROM calls) AS latest_call_inserted,
      GREATEST(
        COALESCE((SELECT MAX(updated_at) FROM pipeline_jobs WHERE status = 'succeeded' AND type = 'compute_scores'), '-infinity'::timestamptz),
        COALESCE((SELECT MAX(updated_at) FROM creator_stats), '-infinity'::timestamptz),
        COALESCE((SELECT MAX(GREATEST(created_at, COALESCE(price_repaired_at, created_at))) FROM calls WHERE score <> 0), '-infinity'::timestamptz)
      )::text AS latest_scoring_update,
      (SELECT MAX(updated_at)::text FROM creator_stats) AS latest_creator_stats_update`,
  );
  const [unsafeSourceRanks] = await query<{ unsafe_ranked_rows: string }>(
    `SELECT COUNT(*)::text AS unsafe_ranked_rows
     FROM creator_stats cs
     JOIN creators c ON c.id = cs.creator_id
     WHERE cs.accuracy_rank IS NOT NULL
       AND (
         cs.period = '30d'
         OR (cs.period = 'all_time' AND cs.total_calls < 24)
         OR (cs.period = '12m' AND cs.total_calls < 12)
         OR (cs.period = '90d' AND cs.total_calls < 3)
         OR lower(regexp_replace(coalesce(c.name, ''), '[^a-zA-Z0-9]+', '', 'g')) IN ('altcoindaily','alexbeckerschannel','moneyzg','cryptoinspector')
         OR lower(regexp_replace(coalesce(c.youtube_handle, ''), '[^a-zA-Z0-9]+', '', 'g')) IN ('altcoindaily','alexbeckerschannel','moneyzg','cryptoinspector')
       )`,
  );
  const grants = await query<{ table_name: string; privilege_type: string }>(
    `SELECT table_name, privilege_type
     FROM information_schema.role_table_grants
     WHERE grantee = current_user
       AND table_schema = 'public'
       AND table_name IN ('videos','calls','creator_stats','pipeline_jobs','pipeline_job_events')
     ORDER BY table_name, privilege_type`,
  );
  const transcriptBacklog = await query<{ status: string; error: string; count: string; recent_30d: string; recent_90d: string }>(
    `WITH normalized AS (
       SELECT
         COALESCE(transcript_status, 'missing') AS status,
         CASE
           WHEN transcript_error IS NULL OR transcript_error = '' THEN 'none'
           WHEN transcript_error = 'provider_credentials_missing' THEN 'provider_credentials_missing'
           WHEN transcript_error = 'bot_verification_required' THEN 'bot_verification_required'
           WHEN transcript_error = 'cookie_invalid_or_rotated' THEN 'cookie_invalid_or_rotated'
           WHEN transcript_error = 'po_token_required' THEN 'po_token_required'
           WHEN transcript_error = 'js_challenge_runtime_missing' THEN 'js_challenge_runtime_missing'
           WHEN transcript_error = 'rate_limited' THEN 'rate_limited'
           WHEN transcript_error ILIKE '%too many requests%' OR transcript_error ILIKE '%captcha%' THEN 'legacy_youtube_rate_or_captcha'
           WHEN transcript_error ILIKE '%disabled%' THEN 'transcript_disabled'
           WHEN transcript_error ILIKE '%unavailable%' THEN 'transcript_unavailable'
           ELSE 'other_failed'
         END AS error,
         published_at
       FROM videos
       WHERE transcript IS NULL OR length(transcript) = 0
     )
     SELECT
       status,
       error,
       COUNT(*)::text AS count,
       COUNT(*) FILTER (WHERE published_at >= NOW() - INTERVAL '30 days')::text AS recent_30d,
       COUNT(*) FILTER (WHERE published_at >= NOW() - INTERVAL '90 days')::text AS recent_90d
     FROM normalized
     GROUP BY status, error
     ORDER BY COUNT(*) DESC`,
  );
  const sourceBuckets = await query<{ period: string; rows: string; official: string; certified: string; provisional: string }>(
    `SELECT
       period,
       COUNT(*)::text AS rows,
       COUNT(*) FILTER (WHERE accuracy_rank IS NOT NULL)::text AS official,
       COUNT(*) FILTER (
         WHERE (period = 'all_time' AND total_calls >= 50)
            OR (period = '12m' AND total_calls >= 25)
            OR (period = '90d' AND total_calls >= 10)
       )::text AS certified,
       COUNT(*) FILTER (
         WHERE accuracy_rank IS NULL
           AND (
             (period = 'all_time' AND total_calls >= 6 AND total_calls < 24)
             OR (period = '12m' AND total_calls >= 6 AND total_calls < 12)
             OR (period = '90d' AND total_calls >= 1 AND total_calls < 3)
           )
       )::text AS provisional
     FROM creator_stats
     GROUP BY period
     ORDER BY period`,
  );
  const dailyTimer = await systemdTimerStatus();
  const ytdlpCookieState = {
    YTDLP_COOKIES_PATH: Boolean(process.env.YTDLP_COOKIES_PATH),
    YTDLP_COOKIES: Boolean(process.env.YTDLP_COOKIES),
    YTDLP_COOKIES_FROM_BROWSER: Boolean(process.env.YTDLP_COOKIES_FROM_BROWSER),
  };

  const timestamps = {
    latestJobCreated: freshness?.latest_job_created ?? null,
    latestJobCompleted: freshness?.latest_job_completed ?? null,
    latestNonSmokeJobCreated: freshness?.latest_non_smoke_job_created ?? null,
    latestNonSmokeJobCompleted: freshness?.latest_non_smoke_job_completed ?? null,
    latestComputeScoresCompleted: freshness?.latest_compute_scores_completed ?? null,
    latestVideoInserted: freshness?.latest_video_inserted ?? null,
    latestTranscriptAttempt: freshness?.latest_transcript_attempt ?? null,
    latestTranscriptSuccess: freshness?.latest_transcript_success ?? null,
    latestCallInserted: freshness?.latest_call_inserted ?? null,
    latestScoringUpdate: freshness?.latest_scoring_update ?? null,
    latestCreatorStatsUpdate: freshness?.latest_creator_stats_update ?? null,
  };
  const ages = Object.fromEntries(Object.entries(timestamps).map(([key, value]) => [key, ageHours(value)]));
  const readApi = await fetchReadApi(args.readApiBase);
  const unsafeRankCount = Number(unsafeSourceRanks?.unsafe_ranked_rows ?? 0);
  const transcriptProviderMissingFailures = Number(freshness?.transcript_provider_missing_failures ?? 0);
  const transcriptBotVerificationFailures = Number(freshness?.transcript_bot_verification_failures ?? 0);
  const transcriptCookieInvalidFailures = Number(freshness?.transcript_cookie_invalid_failures ?? 0);
  const transcriptPoTokenRequiredFailures = Number(freshness?.transcript_po_token_required_failures ?? 0);
  const transcriptJsRuntimeMissingFailures = Number(freshness?.transcript_js_runtime_missing_failures ?? 0);
  const transcriptRateLimitedFailures = Number(freshness?.transcript_rate_limited_failures ?? 0);
  const requiredGrants = new Map([
    ["videos", ["SELECT", "INSERT", "UPDATE"]],
    ["calls", ["SELECT", "INSERT", "UPDATE", "DELETE"]],
    ["creator_stats", ["SELECT", "INSERT", "UPDATE"]],
    ["pipeline_jobs", ["SELECT", "INSERT", "UPDATE"]],
    ["pipeline_job_events", ["SELECT", "INSERT"]],
  ]);
  const actualGrants = new Map<string, Set<string>>();
  for (const grant of grants) {
    const set = actualGrants.get(grant.table_name) ?? new Set<string>();
    set.add(grant.privilege_type);
    actualGrants.set(grant.table_name, set);
  }
  const missingGrants = [...requiredGrants.entries()].flatMap(([table, privileges]) =>
    privileges
      .filter((privilege) => !actualGrants.get(table)?.has(privilege))
      .map((privilege) => `${table}.${privilege}`),
  );
  const blockers = [
    ...(unsafeRankCount > 0 ? [`unsafeSourceRanks=${unsafeRankCount}`] : []),
    ...((readApi && readApi.nativeBuckets !== true) ? ["readApi.nativeBuckets=false"] : []),
    ...(missingGrants.length > 0 ? [`missingGrants=${missingGrants.join(",")}`] : []),
    ...(dailyTimer.active === false ? ["dailyTimer.active=false"] : []),
  ];
  const warnings = [
    ...(ages.latestTranscriptAttempt === null || Number(ages.latestTranscriptAttempt) > 24
      ? ["transcript attempts are stale or unavailable"]
      : []),
    ...(transcriptProviderMissingFailures > 0
      ? [`transcript provider credential missing failures=${transcriptProviderMissingFailures}`]
      : []),
    ...(transcriptBotVerificationFailures > 0
      ? [`yt-dlp bot verification failures=${transcriptBotVerificationFailures}`]
      : []),
    ...(transcriptCookieInvalidFailures > 0
      ? [`yt-dlp cookie invalid/rotated failures=${transcriptCookieInvalidFailures}`]
      : []),
    ...(transcriptPoTokenRequiredFailures > 0
      ? [`yt-dlp PO token required failures=${transcriptPoTokenRequiredFailures}`]
      : []),
    ...(transcriptJsRuntimeMissingFailures > 0
      ? [`yt-dlp JS runtime missing failures=${transcriptJsRuntimeMissingFailures}`]
      : []),
    ...(transcriptRateLimitedFailures > 0
      ? [`yt-dlp rate limited failures=${transcriptRateLimitedFailures}`]
      : []),
  ];

  return {
    generatedAt: new Date().toISOString(),
    status: blockers.length > 0 ? "FAIL" : warnings.length > 0 ? "WARN" : "PASS",
    blockers,
    warnings,
    db: identity,
    thresholds: {
      official: CREATOR_STATS_OFFICIAL_THRESHOLDS,
      certified: CREATOR_STATS_CERTIFIED_THRESHOLDS,
      provisional: CREATOR_STATS_PROVISIONAL_THRESHOLDS,
    },
    sourceBuckets: sourceBuckets.map((row) => ({
      period: row.period,
      rows: Number(row.rows),
      official: Number(row.official),
      certified: Number(row.certified),
      provisional: Number(row.provisional),
    })),
    ytdlpCookieState,
    timestamps,
    ageHours: ages,
    unsafeSourceRanks: unsafeRankCount,
    transcriptProviderMissingFailures,
    transcriptBotVerificationFailures,
    transcriptCookieInvalidFailures,
    transcriptPoTokenRequiredFailures,
    transcriptJsRuntimeMissingFailures,
    transcriptRateLimitedFailures,
    transcriptBacklog: transcriptBacklog.map((row) => ({
      status: row.status,
      error: row.error,
      count: Number(row.count),
      recent30d: Number(row.recent_30d),
      recent90d: Number(row.recent_90d),
    })),
    dailyTimer,
    grants,
    readApi,
  };
}

async function main(): Promise<void> {
  loadEnv();
  const result = await runFreshnessCheck();
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
