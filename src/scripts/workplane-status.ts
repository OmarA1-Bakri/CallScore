import { query } from "../lib/db";
import {
  buildReadinessDomains,
  chooseStatusNextAction,
  defaultCollectorStatePath,
  decideNextAutonomousAction,
  latestArtOfWarCampaignReceipt,
  latestGemmaShadowArtifact,
  latestWorkflowReceipt,
  latestMlEvalArtifact,
  latestMlVerifierQualityGateArtifact,
  latestGemmaCapacityPreflightArtifact,
  latestLoopEngineeringReceipt,
  readCollectorCooldownState,
  rootHygieneAudit,
  summarizePublicArtifactReadiness,
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
    collectorStatePath: argValue(argv, "--collector-state") ?? process.env.CALLSCORE_COLLECTOR_STATE_PATH ?? defaultCollectorStatePath(),
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
  let freshness: Record<string, unknown>;
  try {
    freshness = await runFreshnessCheck({ readApiBase: args.readApiBase });
  } catch (error) {
    freshness = {
      status: "WARN",
      blockers: [],
      warnings: [`freshness_check_unavailable:${error instanceof Error ? error.message : String(error)}`],
      unsafeSourceRanks: 0,
      transcriptBacklog: [],
      timestamps: {},
      dailyTimer: null,
    };
  }
  const collectorCooldown = readCollectorCooldownState(args.collectorStatePath);
  const latestGemmaShadow = latestGemmaShadowArtifact();
  const latestMlEval = latestMlEvalArtifact();
  const latestMlVerifierQualityGate = latestMlVerifierQualityGateArtifact();
  const latestGemmaCapacityPreflight = latestGemmaCapacityPreflightArtifact();
  const latestArtOfWarCampaignLoop = latestArtOfWarCampaignReceipt();
  const latestLoopEngineeringEval = latestLoopEngineeringReceipt();
  const latestTranscriptCadenceReceipt = latestWorkflowReceipt("transcript_laptop_cadence");
  const latestTranscriptCadencePassed = latestTranscriptCadenceReceipt.exists
    && !latestTranscriptCadenceReceipt.malformed
    && latestTranscriptCadenceReceipt.summary.result === "passed";
  const latestTranscriptCadenceResult = typeof latestTranscriptCadenceReceipt.summary.result === "string"
    ? latestTranscriptCadenceReceipt.summary.result
    : null;
  const unsafeOfficial = await fetchUnsafeOfficial(args.readApiBase);
  const latestFailure = await latestCollectorFailure();
  const unsafeSourceRanks = Number(freshness.unsafeSourceRanks ?? 0);
  const transcriptBacklogRecent30d = recentBacklogCount(freshness);
  const nextAction = decideNextAutonomousAction({
    unsafeSourceRanks,
    apiUnsafeOfficialCount: unsafeOfficial.count,
    collectorCooldown,
    latestGemmaShadow,
    latestMlEval,
    transcriptBacklogRecent30d,
    collectorLastAttemptedCount: collectorCooldown.last_attempted_count,
    collectorLastSuccessCount: collectorCooldown.last_success_count,
    latestTranscriptCadencePassed,
    latestTranscriptCadenceResult,
  });
  const dailyTimer = freshness.dailyTimer as Record<string, unknown> | null | undefined;
  const dailyPipelineActive = dailyTimer?.active === true || dailyTimer?.state === "active";
  const readiness_domains = buildReadinessDomains({
    unsafeSourceRanks,
    apiUnsafeOfficialCount: unsafeOfficial.count,
    collectorCooldown,
    latestGemmaShadow,
    latestMlEval,
    transcriptBacklogRecent30d,
    dailyPipelineActive,
    nextAction,
  });
  const rootAudit = rootHygieneAudit();
  const publicArtifactReadiness = summarizePublicArtifactReadiness(readiness_domains);
  const statusNextAction = chooseStatusNextAction(nextAction, publicArtifactReadiness);
  const domainStatuses = Object.values(readiness_domains).map((domain) => domain.status);
  const blockingDomain = domainStatuses.some((status) => status === "BLOCKED");
  const hardPartialDomain = domainStatuses.some((status) => status === "PARTIAL" || status === "NOT_CONNECTED");
  const monitoredDomain = domainStatuses.some((status) => status === "MONITORED" || status === "NEEDS_APPROVAL");
  const automationReadiness = unsafeSourceRanks > 0 || unsafeOfficial.count > 0 || blockingDomain
    ? "BLOCKED"
    : hardPartialDomain
      ? "PARTIAL"
      : (monitoredDomain ? "CONTROLLED_FULL" : "READY");
  const latestMlGate = (latestMlEval.summary.promotion_gate ?? {}) as Record<string, unknown>;

  return {
    generatedAt: new Date().toISOString(),
    status: unsafeSourceRanks > 0 || unsafeOfficial.count > 0 ? "FAIL" : "OK",
    automation_readiness: automationReadiness,
    system_purpose: "produce safe owned public artifacts with receipts; gates exist for irreversible, non-owned, spend, provider, financial, DB/ranking, and restricted-claim mutations",
    public_artifact_readiness: publicArtifactReadiness,
    daily_pipeline_status: freshness.dailyTimer ?? null,
    readiness_domains,
    root_hygiene: readiness_domains.root_hygiene,
    unused_file_audit: rootAudit,
    freshness_warnings: freshness.warnings ?? [],
    fresh_call_inflow: freshness.freshCallInflow ?? null,
    transcript_collector_backlog: freshness.transcriptBacklog ?? [],
    transcript_cooldown_state: collectorCooldown,
    latest_transcript_attempt: (freshness.timestamps as Record<string, unknown> | undefined)?.latestTranscriptAttempt ?? null,
    latest_transcript_success: (freshness.timestamps as Record<string, unknown> | undefined)?.latestTranscriptSuccess ?? null,
    latest_collector_failure: latestFailure,
    latest_collector_run: {
      job_id: collectorCooldown.latest_job_id,
      last_run_utc: collectorCooldown.last_run_utc,
      attempted: collectorCooldown.last_attempted_count,
      successes: collectorCooldown.last_success_count,
      failures: collectorCooldown.last_failure_count,
      success_rate: collectorCooldown.last_success_rate,
      recent_failure_reasons: collectorCooldown.recent_failure_reasons,
    },
    latest_gemma_shadow_extraction_run: latestGemmaShadow,
    latest_gemma_capacity_preflight_run: latestGemmaCapacityPreflight,
    latest_ml_eval_run: latestMlEval,
    latest_ml_verifier_quality_gate_run: latestMlVerifierQualityGate,
    model_currently_recommended: latestMlEval.exists && latestMlGate.eligible_for_write_canary !== true
      ? "rule_extractor_safe_fallback"
      : "callscore-gemma4-extractor:shadow_only",
    production_default_changed: false,
    unsafe_source_ranks: unsafeSourceRanks,
    api_unsafe_official: unsafeOfficial,
    homepage_safety: { ok: unsafeOfficial.ok && unsafeOfficial.count === 0, unsafe_official_count: unsafeOfficial.count },
    whop_provider_readiness: readiness_domains.whop_auto,
    art_of_war_activation_gate_status: readiness_domains.art_of_war,
    latest_artofwar_campaign_loop_run: latestArtOfWarCampaignLoop,
    latest_loop_engineering_eval_run: latestLoopEngineeringEval,
    automation_registry_status: readiness_domains.claude_code_automations,
    approval_required_for_next_risky_action: readiness_domains.activation_gates.required_approvals,
    next_approval_gated_action: "operator approval required before public marketing/outreach/spend, Whop live mutation, Gemma write-canary, or production extractor default change",
    autonomous_revenue_status: "NO",
    blocked_public_actions: readiness_domains.activation_gates.risky_actions_blocked,
    runtime_loop_capabilities: [
      "inspect_workplane_status",
      "run_laptop_collector_limit_5_when_cooldown_clear",
      "ingest_transcript_results",
      "run_gemma_shadow_extract_artifact_only",
      "run_ml_idle_improve_artifact_only",
      "run_loop_engineering_eval_dry_run",
      "write_loop_receipt_public_action_false",
      "compare_loop_iteration_metrics",
      "block_loop_on_repeated_failure_class",
      "run_whop_read_only_dry_runs",
      "run_artofwar_private_dry_runs",
      "run_artofwar_campaign_contract_preflight",
      "run_artofwar_persona_tests_report_only",
      "run_artofwar_dry_run_simulations_report_only",
      "run_artofwar_gemma_evaluation_report_only",
      "write_artofwar_campaign_receipts_public_action_false",
      "produce_promotion_reviews_without_auto_promotion",
    ],
    job_model: workplaneJobModelForStatus(),
    next_recommended_autonomous_action: statusNextAction,
    next_private_infra_action: nextAction,
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
