import { query } from "../lib/db";
import { loadEnv } from "./script-helpers";

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

function ageHours(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.now() - Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return Math.round((ms / 3_600_000) * 10) / 10;
}

async function fetchReadApi(base: string | null): Promise<Record<string, unknown> | null> {
  if (!base) return null;
  const root = base.replace(/\/$/, "");
  const response = await fetch(`${root}/home?period=all_time`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    return { ok: false, status: response.status };
  }
  const json = await response.json() as Record<string, unknown>;
  const official = Array.isArray(json.officialRankedRows) ? json.officialRankedRows : [];
  const legacyRows = (json.leaderboard as { rows?: unknown[] } | undefined)?.rows ?? [];
  return {
    ok: json.ok === true,
    nativeBuckets: Array.isArray(json.officialRankedRows)
      && Array.isArray(json.provisionalRows)
      && Array.isArray(json.watchlistRows)
      && Array.isArray(json.staleRows)
      && Array.isArray(json.excludedRows)
      && Array.isArray(json.pendingMaturityRows),
    officialCount: official.length,
    leaderboardRowsEqualOfficial: JSON.stringify(legacyRows) === JSON.stringify(official),
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
      (SELECT COUNT(*)::text FROM videos WHERE transcript_error = 'provider_credentials_missing') AS transcript_provider_missing_failures,
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
         cs.total_calls < 25
         OR lower(coalesce(c.name, '')) LIKE '%altcoin daily%'
         OR lower(replace(coalesce(c.youtube_handle, ''), '@', '')) = 'altcoindaily'
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

  const timestamps = {
    latestJobCreated: freshness?.latest_job_created ?? null,
    latestJobCompleted: freshness?.latest_job_completed ?? null,
    latestNonSmokeJobCreated: freshness?.latest_non_smoke_job_created ?? null,
    latestNonSmokeJobCompleted: freshness?.latest_non_smoke_job_completed ?? null,
    latestComputeScoresCompleted: freshness?.latest_compute_scores_completed ?? null,
    latestVideoInserted: freshness?.latest_video_inserted ?? null,
    latestTranscriptAttempt: freshness?.latest_transcript_attempt ?? null,
    latestCallInserted: freshness?.latest_call_inserted ?? null,
    latestScoringUpdate: freshness?.latest_scoring_update ?? null,
    latestCreatorStatsUpdate: freshness?.latest_creator_stats_update ?? null,
  };
  const ages = Object.fromEntries(Object.entries(timestamps).map(([key, value]) => [key, ageHours(value)]));
  const readApi = await fetchReadApi(args.readApiBase);
  const unsafeRankCount = Number(unsafeSourceRanks?.unsafe_ranked_rows ?? 0);
  const transcriptProviderMissingFailures = Number(freshness?.transcript_provider_missing_failures ?? 0);
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
  ];
  const warnings = [
    ...(ages.latestTranscriptAttempt === null || Number(ages.latestTranscriptAttempt) > 24
      ? ["transcript attempts are stale or unavailable"]
      : []),
    ...(transcriptProviderMissingFailures > 0
      ? [`transcript provider credential missing failures=${transcriptProviderMissingFailures}`]
      : []),
  ];

  return {
    generatedAt: new Date().toISOString(),
    status: blockers.length > 0 ? "FAIL" : warnings.length > 0 ? "WARN" : "PASS",
    blockers,
    warnings,
    db: identity,
    timestamps,
    ageHours: ages,
    unsafeSourceRanks: unsafeRankCount,
    transcriptProviderMissingFailures,
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
