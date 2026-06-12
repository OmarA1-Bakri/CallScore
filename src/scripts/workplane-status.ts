import { query } from "../lib/db";
import {
  decideNextAutonomousAction,
  latestGemmaShadowArtifact,
  latestMlEvalArtifact,
  readCollectorCooldownState,
  workplaneJobModelForStatus,
} from "../lib/workplane-status";
import { loadEnv } from "./script-helpers";
import { runFreshnessCheck } from "./callscore-freshness-check";

interface Args {
  readonly readApiBase: string | null;
  readonly collectorStatePath: string | null;
}

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || !argv[index + 1]) return null;
  return argv[index + 1];
}

export function parseWorkplaneStatusArgs(argv = process.argv.slice(2)): Args {
  return {
    readApiBase: argValue(argv, "--read-api-base") ?? process.env.HH_READ_API_BASE ?? null,
    collectorStatePath: argValue(argv, "--collector-state") ?? process.env.CALLSCORE_COLLECTOR_STATE_PATH ?? null,
  };
}

async function latestCollectorFailure(): Promise<Record<string, unknown> | null> {
  const rows = await query<Record<string, unknown>>(
    `SELECT id::text, youtube_video_id, transcript_provider, transcript_error, transcript_last_attempt_at::text
     FROM videos
     WHERE transcript_provider ILIKE 'laptop_collector%'
       AND transcript_status = 'failed'
     ORDER BY transcript_last_attempt_at DESC NULLS LAST, id DESC
     LIMIT 1`,
  );
  return rows[0] ?? null;
}

async function fetchUnsafeOfficial(base: string | null): Promise<{ readonly count: number; readonly ok: boolean }> {
  if (!base) return { count: 0, ok: false };
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/home?period=all_time`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return { count: 0, ok: false };
    const json = await response.json() as { officialRankedRows?: unknown[] };
    const official = Array.isArray(json.officialRankedRows) ? json.officialRankedRows : [];
    const unsafe = official.filter((row) => {
      if (!row || typeof row !== "object") return true;
      const item = row as Record<string, unknown>;
      const name = String(item.name ?? item.creator_name ?? "").toLowerCase();
      const handle = String(item.youtube_handle ?? item.handle ?? "").toLowerCase();
      return /altcoin daily|alex becker|moneyzg|crypto inspector/.test(name)
        || /altcoindaily|alexbeckerschannel/.test(handle)
        || (item.accuracy_rank ?? item.accuracyRank) == null;
    });
    return { count: unsafe.length, ok: true };
  } catch {
    return { count: 0, ok: false };
  }
}

function recentBacklogCount(freshness: Record<string, unknown>): number {
  const backlog = Array.isArray(freshness.transcriptBacklog) ? freshness.transcriptBacklog : [];
  return backlog.reduce((sum, row) => {
    if (!row || typeof row !== "object") return sum;
    return sum + Number((row as Record<string, unknown>).recent30d ?? 0);
  }, 0);
}

export async function buildWorkplaneStatus(args = parseWorkplaneStatusArgs()): Promise<Record<string, unknown>> {
  const freshness = await runFreshnessCheck({ readApiBase: args.readApiBase });
  const collectorCooldown = readCollectorCooldownState(args.collectorStatePath);
  const latestGemmaShadow = latestGemmaShadowArtifact();
  const latestMlEval = latestMlEvalArtifact();
  const unsafeOfficial = await fetchUnsafeOfficial(args.readApiBase);
  const latestFailure = await latestCollectorFailure();
  const unsafeSourceRanks = Number(freshness.unsafeSourceRanks ?? 0);
  const nextAction = decideNextAutonomousAction({
    unsafeSourceRanks,
    apiUnsafeOfficialCount: unsafeOfficial.count,
    collectorCooldown,
    latestGemmaShadow,
    latestMlEval,
    transcriptBacklogRecent30d: recentBacklogCount(freshness),
  });

  return {
    generatedAt: new Date().toISOString(),
    status: unsafeSourceRanks > 0 || unsafeOfficial.count > 0 ? "FAIL" : "OK",
    automation_readiness: nextAction.allowed ? "PARTIAL" : "BLOCKED",
    daily_pipeline_status: freshness.dailyTimer ?? null,
    transcript_collector_backlog: freshness.transcriptBacklog ?? [],
    transcript_cooldown_state: collectorCooldown,
    latest_transcript_attempt: (freshness.timestamps as Record<string, unknown> | undefined)?.latestTranscriptAttempt ?? null,
    latest_transcript_success: (freshness.timestamps as Record<string, unknown> | undefined)?.latestTranscriptSuccess ?? null,
    latest_collector_failure: latestFailure,
    latest_gemma_shadow_extraction_run: latestGemmaShadow,
    latest_ml_eval_run: latestMlEval,
    model_currently_recommended: nextAction.action === "improve_gemma_prompt_and_chunking" ? "rule_extractor_safe_fallback" : "callscore-gemma4-extractor:shadow_only",
    production_default_changed: false,
    unsafe_source_ranks: unsafeSourceRanks,
    api_unsafe_official: unsafeOfficial,
    job_model: workplaneJobModelForStatus(),
    next_recommended_autonomous_action: nextAction,
  };
}

async function main(): Promise<void> {
  loadEnv();
  const result = await buildWorkplaneStatus();
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
