import type { PipelineJob } from "./pipeline";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildRunId } from "./shadow-extraction";

export const WORKPLANE_JOB_TYPES = [
  "transcript_collect_laptop",
  "transcript_ingest_result",
  "gemma_shadow_extract",
  "ml_extraction_eval",
  "ml_idle_improve",
  "extraction_promotion_review",
  "whop_provider_health",
  "whop_plan_inventory_check",
  "whop_entitlement_sync_dry_run",
  "whop_webhook_replay_safe",
  "whop_customer_status_check",
  "whop_activation_review",
  "artofwar_strategy_brief",
  "artofwar_content_queue_dry_run",
  "artofwar_campaign_plan_generate",
  "artofwar_audience_research_dry_run",
  "artofwar_outreach_queue_prepare",
  "artofwar_publish_approval_review",
  "artofwar_spend_approval_review",
  "automation_registry_refresh",
  "automation_dry_run",
  "automation_health_check",
  "automation_activation_review",
] as const;

export type WorkplaneJobType = (typeof WORKPLANE_JOB_TYPES)[number];
export type ExecutionLocation = "HH" | "Omar laptop" | "both";

export interface WorkplaneJobSpec {
  readonly type: WorkplaneJobType;
  readonly input_payload: Record<string, unknown>;
  readonly execution_location: ExecutionLocation;
  readonly max_batch_size: number;
  readonly concurrency: number;
  readonly timeout_seconds: number;
  readonly retry_policy: string;
  readonly cooldown_policy: string;
  readonly output_artifact: string;
  readonly success_criteria: readonly string[];
  readonly failure_classification: readonly string[];
  readonly production_db_writes_allowed: boolean;
  readonly production_call_writes_allowed: boolean;
  readonly public_ranking_impact_allowed: boolean;
  readonly default_safe_command: string;
}

type SpecInput = Omit<WorkplaneJobSpec, "type" | "production_db_writes_allowed" | "production_call_writes_allowed" | "public_ranking_impact_allowed"> & {
  readonly production_db_writes_allowed?: boolean;
};

function safeReportSpec(type: WorkplaneJobType, input: SpecInput): WorkplaneJobSpec {
  return {
    type,
    production_db_writes_allowed: input.production_db_writes_allowed ?? false,
    production_call_writes_allowed: false,
    public_ranking_impact_allowed: false,
    ...input,
  };
}

const providerReadFailures = ["provider_auth_missing", "provider_read_failed", "unsafe_mutation_requested", "approval_missing"] as const;
const approvalFailures = ["approval_missing", "unsafe_public_action_requested", "unsafe_spend_requested"] as const;

export const WORKPLANE_JOB_SPECS: Record<WorkplaneJobType, WorkplaneJobSpec> = {
  transcript_collect_laptop: safeReportSpec("transcript_collect_laptop", {
    input_payload: {
      limit: 5,
      max_limit: 25,
      allow_large_batch: false,
      browser: "firefox",
      since_days: 45,
      min_gap_seconds: 45,
      max_gap_seconds: 90,
      write_result_to_hh: true,
      workplane_claim: true,
    },
    execution_location: "Omar laptop",
    max_batch_size: 5,
    concurrency: 1,
    timeout_seconds: 3600,
    retry_policy: "no automatic retry after terminal YouTube failure; skip recent failed video ids for 24h",
    cooldown_policy: "stop on HTTP 429, bot verification, or impersonation warning threshold; persist randomized 12-24h laptop cooldown",
    output_artifact: "%LOCALAPPDATA%\\CallScore\\transcript-collector-state.json mirrored to HH .tmp/laptop-collector/latest-state.json plus HH transcript ingest rows",
    success_criteria: [
      "workplane job claimed over Tailscale/SSH",
      "bounded worklist fetched over Tailscale",
      "captions fetched transcript-only",
      "cookies remain laptop-local",
      "available/failed result pushed to HH ingest path",
      "collector state/cooldown published back to HH",
    ],
    failure_classification: [
      "rate_limited",
      "bot_verification_required",
      "impersonation_unavailable",
      "impersonation_warning_threshold",
      "no_captions",
      "live_or_upcoming",
      "private_or_deleted",
      "transcript_too_short",
      "transient_network",
      "transcript_failed",
      "runner_overlap",
    ],
    production_db_writes_allowed: true,
    default_safe_command: "scripts/windows/run-transcript-collector.ps1 -Workplane -Limit 5 -Browser firefox -SinceDays 45 -HhHost omar@100.107.162.80 -HhPort 2222 -HhIdentityFile $env:USERPROFILE\\.ssh\\callscore_hh_ed25519 -Write",
  }),
  transcript_ingest_result: safeReportSpec("transcript_ingest_result", {
    input_payload: { result_json: "validated transcript result or failure record", overwrite: false, write: true },
    execution_location: "HH",
    max_batch_size: 1,
    concurrency: 1,
    timeout_seconds: 120,
    retry_policy: "idempotent retry only for transport/database transient errors; never overwrite existing transcript unless explicitly requested",
    cooldown_policy: "inherits laptop collector cooldown; no local YouTube access",
    output_artifact: "videos.transcript/transcript_status update through npm run transcript:ingest",
    success_criteria: ["record validates video id/youtube id", "available transcript is stored through ingest script", "calls_extracted resets false only for new transcript text"],
    failure_classification: ["invalid_payload", "video_mismatch", "transcript_too_short", "db_write_failed"],
    production_db_writes_allowed: true,
    default_safe_command: "npm run transcript:ingest -- --input - --write",
  }),
  gemma_shadow_extract: safeReportSpec("gemma_shadow_extract", {
    input_payload: {
      model: "callscore-gemma4-extractor:latest",
      provider: "ollama",
      ollama_host: "http://127.0.0.1:11434",
      limit: 10,
      chunk_chars: 350,
      chunk_overlap: 50,
      max_chunks: 1,
      num_predict: 350,
      request_timeout_ms: 45000,
      prompt_profile: "shadow-compact",
      write: false,
      shadow_out: "/tmp/callscore-shadow-extractions/<run-id>.jsonl",
    },
    execution_location: "HH",
    max_batch_size: 10,
    concurrency: 1,
    timeout_seconds: 900,
    retry_policy: "no automatic model retry beyond configured bounded model_attempts; failures become shadow artifact rows",
    cooldown_policy: "none; use latency/timeout gate to hold promotion",
    output_artifact: "/tmp/callscore-shadow-extractions/<run-id>.jsonl",
    success_criteria: ["reads existing transcripts only", "writes shadow artifact rows only", "does not write calls or creator_stats", "records parser/schema/latency evidence"],
    failure_classification: ["invalid_json", "schema_invalid", "timeout", "ollama_unavailable", "manual_review"],
    default_safe_command: "npm run shadow:extract -- --execute --provider ollama --ollama-host http://127.0.0.1:11434 --model callscore-gemma4-extractor:latest --limit 10 --video-agents 1 --chunk-agents 1 --model-attempts 1 --prompt-profile shadow-compact --chunk-chars 350 --chunk-overlap 50 --max-chunks 1 --num-predict 350 --request-timeout-ms 45000",
  }),
  ml_extraction_eval: safeReportSpec("ml_extraction_eval", {
    input_payload: { fixtures: "data/eval/call-extraction-fixtures.jsonl", shadow_in: "/tmp/callscore-shadow-extractions/<run-id>.jsonl", diff_in: "/tmp/callscore-shadow-extractions/<run-id>.diff.jsonl" },
    execution_location: "HH",
    max_batch_size: 100,
    concurrency: 1,
    timeout_seconds: 300,
    retry_policy: "artifact-only retry is safe; no production state mutation",
    cooldown_policy: "none; blocked promotion remains encoded in report",
    output_artifact: "/tmp/callscore-shadow-extractions/<run-id>.ml-idle-report.json",
    success_criteria: ["fixtures and shadow outputs are parsed", "JSON/schema/false-positive metrics are emitted", "promotion remains false without approval evidence"],
    failure_classification: ["missing_fixture", "malformed_shadow_artifact", "malformed_diff_artifact", "eval_failed"],
    default_safe_command: "npm run ml:idle-improve -- --shadow-in <shadow.jsonl> --diff-in <diff.jsonl>",
  }),
  ml_idle_improve: safeReportSpec("ml_idle_improve", {
    input_payload: { fixtures: "data/eval/call-extraction-fixtures.jsonl", include_disagreements: true, output: ".tmp/ml-idle-improve/<run-id>.json" },
    execution_location: "HH",
    max_batch_size: 100,
    concurrency: 1,
    timeout_seconds: 300,
    retry_policy: "artifact-only retry is safe; no automatic promotion",
    cooldown_policy: "none; recommendations only",
    output_artifact: ".tmp/ml-idle-improve/<run-id>.json",
    success_criteria: ["metrics generated", "prompt/fixture/model recommendations generated", "eligible_for_write_canary remains false until gates pass and approval is recorded"],
    failure_classification: ["missing_artifact", "malformed_artifact", "insufficient_evidence"],
    default_safe_command: "npm run ml:idle-improve",
  }),
  extraction_promotion_review: safeReportSpec("extraction_promotion_review", {
    input_payload: { shadow_run_id: "<run-id>", ml_report: "<report.json>", reviewed_by: "operator_or_eval_gate" },
    execution_location: "HH",
    max_batch_size: 1,
    concurrency: 1,
    timeout_seconds: 120,
    retry_policy: "review report can be regenerated; no production default change",
    cooldown_policy: "not applicable",
    output_artifact: ".tmp/extraction-promotion-review/<run-id>.json",
    success_criteria: ["promotion evidence summarized", "blocked gates listed", "production default remains unchanged"],
    failure_classification: ["missing_report", "gate_failed", "approval_missing"],
    default_safe_command: "npm run workplane:status",
  }),
  whop_provider_health: safeReportSpec("whop_provider_health", {
    input_payload: { mode: "read_only", provider_mutation: false },
    execution_location: "HH",
    max_batch_size: 1,
    concurrency: 1,
    timeout_seconds: 120,
    retry_policy: "read-only retry only; never mutate Whop provider settings",
    cooldown_policy: "none",
    output_artifact: ".tmp/workplane-jobs/whop_provider_health-<run-id>.json",
    success_criteria: ["Whop-auto repo/config discovered", "read-only provider health evidence captured", "secrets redacted"],
    failure_classification: providerReadFailures,
    default_safe_command: "npm run workplane:status",
  }),
  whop_plan_inventory_check: safeReportSpec("whop_plan_inventory_check", {
    input_payload: { mode: "read_only", plans: ["pro monthly", "pro annual", "alpha monthly", "alpha annual"] },
    execution_location: "HH",
    max_batch_size: 1,
    concurrency: 1,
    timeout_seconds: 120,
    retry_policy: "read-only retry only",
    cooldown_policy: "none",
    output_artifact: ".tmp/workplane-jobs/whop_plan_inventory_check-<run-id>.json",
    success_criteria: ["product/plan inventory visible", "checkout mapping evidence captured", "no pricing/payment mutation"],
    failure_classification: providerReadFailures,
    default_safe_command: "npm run workplane:status",
  }),
  whop_entitlement_sync_dry_run: safeReportSpec("whop_entitlement_sync_dry_run", {
    input_payload: { dry_run: true, mutate_entitlements: false },
    execution_location: "HH",
    max_batch_size: 1,
    concurrency: 1,
    timeout_seconds: 180,
    retry_policy: "dry-run only; customer-impacting writes require approval",
    cooldown_policy: "none",
    output_artifact: ".tmp/workplane-jobs/whop_entitlement_sync_dry_run-<run-id>.json",
    success_criteria: ["entitlement sync path identified", "dry-run result only", "no live customer mutation"],
    failure_classification: providerReadFailures,
    default_safe_command: "npm run workplane:status",
  }),
  whop_webhook_replay_safe: safeReportSpec("whop_webhook_replay_safe", {
    input_payload: { dry_run: true, replay_fixture_only: true },
    execution_location: "HH",
    max_batch_size: 1,
    concurrency: 1,
    timeout_seconds: 180,
    retry_policy: "fixture replay only; no provider callback mutation",
    cooldown_policy: "none",
    output_artifact: ".tmp/workplane-jobs/whop_webhook_replay_safe-<run-id>.json",
    success_criteria: ["signed webhook path/test fixture available", "idempotent replay evidence only", "no live provider mutation"],
    failure_classification: providerReadFailures,
    default_safe_command: "npm run workplane:status",
  }),
  whop_customer_status_check: safeReportSpec("whop_customer_status_check", {
    input_payload: { mode: "read_only", customer_id: "optional_redacted" },
    execution_location: "HH",
    max_batch_size: 1,
    concurrency: 1,
    timeout_seconds: 120,
    retry_policy: "read-only retry only",
    cooldown_policy: "none",
    output_artifact: ".tmp/workplane-jobs/whop_customer_status_check-<run-id>.json",
    success_criteria: ["customer/account state read path identified", "no entitlement mutation"],
    failure_classification: providerReadFailures,
    default_safe_command: "npm run workplane:status",
  }),
  whop_activation_review: safeReportSpec("whop_activation_review", {
    input_payload: { approval_review: true },
    execution_location: "HH",
    max_batch_size: 1,
    concurrency: 1,
    timeout_seconds: 120,
    retry_policy: "report can be regenerated",
    cooldown_policy: "not applicable",
    output_artifact: ".tmp/workplane-jobs/whop_activation_review-<run-id>.json",
    success_criteria: ["readiness summarized", "approval-gated actions listed", "no provider mutation"],
    failure_classification: ["missing_provider_evidence", "approval_missing"],
    default_safe_command: "npm run workplane:status",
  }),
  artofwar_strategy_brief: safeReportSpec("artofwar_strategy_brief", {
    input_payload: { dry_run: true, public_action: false },
    execution_location: "HH",
    max_batch_size: 1,
    concurrency: 1,
    timeout_seconds: 180,
    retry_policy: "local dry-run retry only",
    cooldown_policy: "none",
    output_artifact: ".tmp/workplane-jobs/artofwar_strategy_brief-<run-id>.json",
    success_criteria: ["strategy generated locally", "no publishing/outreach/spend"],
    failure_classification: approvalFailures,
    default_safe_command: "cd /srv/agents/repos/Claude_Code_Automations && python scripts/art_of_war.py report --dry-run",
  }),
  artofwar_content_queue_dry_run: safeReportSpec("artofwar_content_queue_dry_run", {
    input_payload: { dry_run: true, publish: false },
    execution_location: "HH",
    max_batch_size: 10,
    concurrency: 1,
    timeout_seconds: 180,
    retry_policy: "local dry-run retry only",
    cooldown_policy: "none",
    output_artifact: ".tmp/workplane-jobs/artofwar_content_queue_dry_run-<run-id>.json",
    success_criteria: ["content queue prepared as draft evidence", "no public posting"],
    failure_classification: approvalFailures,
    default_safe_command: "npm run workplane:status",
  }),
  artofwar_campaign_plan_generate: safeReportSpec("artofwar_campaign_plan_generate", {
    input_payload: { dry_run: true },
    execution_location: "HH",
    max_batch_size: 1,
    concurrency: 1,
    timeout_seconds: 180,
    retry_policy: "local dry-run retry only",
    cooldown_policy: "none",
    output_artifact: ".tmp/workplane-jobs/artofwar_campaign_plan_generate-<run-id>.json",
    success_criteria: ["campaign plan generated", "public actions remain approval-gated"],
    failure_classification: approvalFailures,
    default_safe_command: "npm run workplane:status",
  }),
  artofwar_audience_research_dry_run: safeReportSpec("artofwar_audience_research_dry_run", {
    input_payload: { dry_run: true, bounded: true },
    execution_location: "HH",
    max_batch_size: 10,
    concurrency: 1,
    timeout_seconds: 180,
    retry_policy: "bounded dry-run retry only",
    cooldown_policy: "provider/robots compliant; no aggressive scraping",
    output_artifact: ".tmp/workplane-jobs/artofwar_audience_research_dry_run-<run-id>.json",
    success_criteria: ["audience research draft produced", "no aggressive scraping"],
    failure_classification: approvalFailures,
    default_safe_command: "npm run workplane:status",
  }),
  artofwar_outreach_queue_prepare: safeReportSpec("artofwar_outreach_queue_prepare", {
    input_payload: { dry_run: true, send: false },
    execution_location: "HH",
    max_batch_size: 10,
    concurrency: 1,
    timeout_seconds: 180,
    retry_policy: "draft-only retry",
    cooldown_policy: "no send without approval",
    output_artifact: ".tmp/workplane-jobs/artofwar_outreach_queue_prepare-<run-id>.json",
    success_criteria: ["outreach queue prepared as draft", "no messages sent"],
    failure_classification: approvalFailures,
    default_safe_command: "npm run workplane:status",
  }),
  artofwar_publish_approval_review: safeReportSpec("artofwar_publish_approval_review", {
    input_payload: { approval_required: true },
    execution_location: "HH",
    max_batch_size: 1,
    concurrency: 1,
    timeout_seconds: 120,
    retry_policy: "review-only",
    cooldown_policy: "not applicable",
    output_artifact: ".tmp/workplane-jobs/artofwar_publish_approval_review-<run-id>.json",
    success_criteria: ["publish blockers and approvals listed", "no publish action"],
    failure_classification: approvalFailures,
    default_safe_command: "npm run workplane:status",
  }),
  artofwar_spend_approval_review: safeReportSpec("artofwar_spend_approval_review", {
    input_payload: { approval_required: true, spend: false },
    execution_location: "HH",
    max_batch_size: 1,
    concurrency: 1,
    timeout_seconds: 120,
    retry_policy: "review-only",
    cooldown_policy: "not applicable",
    output_artifact: ".tmp/workplane-jobs/artofwar_spend_approval_review-<run-id>.json",
    success_criteria: ["spend blockers and approvals listed", "no spend action"],
    failure_classification: approvalFailures,
    default_safe_command: "npm run workplane:status",
  }),
  automation_registry_refresh: safeReportSpec("automation_registry_refresh", {
    input_payload: { dry_run: true, scan_paths: ["/srv/agents/repos/Claude_Code_Automations"] },
    execution_location: "HH",
    max_batch_size: 100,
    concurrency: 1,
    timeout_seconds: 180,
    retry_policy: "read-only scan retry only",
    cooldown_policy: "none",
    output_artifact: ".tmp/workplane-jobs/automation_registry_refresh-<run-id>.json",
    success_criteria: ["automation registry refreshed from safe metadata", "risky automations classified"],
    failure_classification: ["repo_not_found", "malformed_registry", "unsafe_execution_requested"],
    default_safe_command: "npm run workplane:status",
  }),
  automation_dry_run: safeReportSpec("automation_dry_run", {
    input_payload: { automation: "<name>", dry_run: true },
    execution_location: "HH",
    max_batch_size: 1,
    concurrency: 1,
    timeout_seconds: 180,
    retry_policy: "dry-run only",
    cooldown_policy: "none",
    output_artifact: ".tmp/workplane-jobs/automation_dry_run-<run-id>.json",
    success_criteria: ["selected automation supports dry-run", "no provider/public/spend/destructive action"],
    failure_classification: ["automation_missing", "dry_run_missing", "approval_required"],
    default_safe_command: "npm run workplane:status",
  }),
  automation_health_check: safeReportSpec("automation_health_check", {
    input_payload: { dry_run: true },
    execution_location: "HH",
    max_batch_size: 1,
    concurrency: 1,
    timeout_seconds: 120,
    retry_policy: "read-only health retry only",
    cooldown_policy: "none",
    output_artifact: ".tmp/workplane-jobs/automation_health_check-<run-id>.json",
    success_criteria: ["automation repo exists", "safe commands inventoried"],
    failure_classification: ["repo_not_found", "test_failed", "unsafe_execution_requested"],
    default_safe_command: "cd /srv/agents/repos/Claude_Code_Automations/workplane && npm run status",
  }),
  automation_activation_review: safeReportSpec("automation_activation_review", {
    input_payload: { approval_review: true },
    execution_location: "HH",
    max_batch_size: 1,
    concurrency: 1,
    timeout_seconds: 120,
    retry_policy: "review-only",
    cooldown_policy: "not applicable",
    output_artifact: ".tmp/workplane-jobs/automation_activation_review-<run-id>.json",
    success_criteria: ["automation activation evidence summarized", "approval-gated classes remain blocked"],
    failure_classification: ["missing_registry", "approval_missing"],
    default_safe_command: "npm run workplane:status",
  }),
};

export function isWorkplaneJobType(value: string): value is WorkplaneJobType {
  return (WORKPLANE_JOB_TYPES as readonly string[]).includes(value);
}

export function getWorkplaneJobSpec(type: WorkplaneJobType): WorkplaneJobSpec {
  return WORKPLANE_JOB_SPECS[type];
}

export function workplaneSpecsForStatus(): readonly WorkplaneJobSpec[] {
  return WORKPLANE_JOB_TYPES.map((type) => WORKPLANE_JOB_SPECS[type]);
}

function writeReportOnlyArtifact(job: PipelineJob, spec: WorkplaneJobSpec): Record<string, unknown> {
  const runId = typeof job.payload?.run_id === "string" ? job.payload.run_id : buildRunId(job.type);
  const out = typeof job.payload?.out === "string" ? job.payload.out : `.tmp/workplane-jobs/${job.type}-${runId}.json`;
  mkdirSync(dirname(out), { recursive: true });
  const report = {
    record_type: "workplane_report_only_job",
    job_type: job.type,
    run_id: runId,
    generated_at: new Date().toISOString(),
    payload: job.payload ?? {},
    execution_location: spec.execution_location,
    success_criteria: spec.success_criteria,
    failure_classification: spec.failure_classification,
    production_db_writes_allowed: spec.production_db_writes_allowed,
    production_call_writes_allowed: spec.production_call_writes_allowed,
    public_ranking_impact_allowed: spec.public_ranking_impact_allowed,
    decision: "report_only_no_external_mutation",
  };
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  return { mode: "report_only", out, ...report };
}

export async function runWorkplaneJob(job: PipelineJob): Promise<Record<string, unknown>> {
  if (!isWorkplaneJobType(job.type)) throw new Error(`Unsupported workplane job type: ${job.type}`);
  const spec = getWorkplaneJobSpec(job.type);
  const payload = job.payload ?? {};

  if (job.type === "transcript_collect_laptop") {
    return {
      mode: "external_runner_required",
      execution_location: spec.execution_location,
      command: spec.default_safe_command,
      payload,
      success: false,
      failure_classification: "laptop_runner_required",
      note: "Hermes can represent and enqueue this job, but cookies remain laptop-local and execution must happen on Omar laptop/workplane runner.",
    };
  }

  if (job.type === "transcript_ingest_result") {
    const inputPath = typeof payload.input_path === "string" ? payload.input_path : null;
    if (!inputPath) throw new Error("transcript_ingest_result requires payload.input_path");
    const { main } = await import("../scripts/ingest-transcript-result");
    await main(["--input", inputPath, ...(payload.write === false ? ["--dry-run"] : ["--write"])]);
    return { mode: payload.write === false ? "dry_run" : "write", execution_location: spec.execution_location, input_path: inputPath, production_call_writes_allowed: false, public_ranking_impact_allowed: false };
  }

  if (job.type === "gemma_shadow_extract") {
    const runId = typeof payload.run_id === "string" ? payload.run_id : buildRunId("gemma-shadow");
    const shadowOut = typeof payload.shadow_out === "string" ? payload.shadow_out : `/tmp/callscore-shadow-extractions/${runId}.jsonl`;
    const { main } = await import("../scripts/shadow-extract-transcripts");
    await main([
      "--execute",
      "--provider", "ollama",
      "--ollama-host", String(payload.ollama_host ?? "http://127.0.0.1:11434"),
      "--model", String(payload.model ?? "callscore-gemma4-extractor:latest"),
      "--limit", String(Math.min(Number(payload.limit ?? 10), 10)),
      "--video-agents", "1",
      "--chunk-agents", "1",
      "--model-attempts", "1",
      "--shadow-out", shadowOut,
      "--run-id", runId,
      "--prompt-profile", String(payload.prompt_profile ?? "shadow-compact"),
      "--chunk-chars", String(payload.chunk_chars ?? 350),
      "--chunk-overlap", String(payload.chunk_overlap ?? 50),
      "--max-chunks", String(payload.max_chunks ?? 1),
      "--num-predict", String(payload.num_predict ?? 350),
      "--request-timeout-ms", String(payload.request_timeout_ms ?? 45_000),
    ]);
    return { mode: "shadow_artifact", execution_location: spec.execution_location, run_id: runId, shadow_out: shadowOut, production_call_writes_allowed: false, public_ranking_impact_allowed: false };
  }

  if (job.type === "ml_extraction_eval" || job.type === "ml_idle_improve") {
    const { main } = await import("../scripts/ml-idle-improve");
    const out = typeof payload.out === "string" ? payload.out : `.tmp/ml-idle-improve/${buildRunId("ml-idle")}.json`;
    await main([
      ...(typeof payload.shadow_in === "string" ? ["--shadow-in", payload.shadow_in] : []),
      ...(typeof payload.diff_in === "string" ? ["--diff-in", payload.diff_in] : []),
      ...(typeof payload.fixtures === "string" ? ["--fixtures", payload.fixtures] : []),
      "--out", out,
    ]);
    return { mode: "eval_artifact", execution_location: spec.execution_location, out, production_call_writes_allowed: false, public_ranking_impact_allowed: false };
  }

  if (job.type === "extraction_promotion_review") {
    const runId = typeof payload.run_id === "string" ? payload.run_id : buildRunId("promotion-review");
    const out = typeof payload.out === "string" ? payload.out : `.tmp/extraction-promotion-review/${runId}.json`;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify({
      record_type: "extraction_promotion_review",
      run_id: runId,
      generated_at: new Date().toISOString(),
      payload,
      decision: "no_promotion_without_explicit_approval",
      production_default_changed: false,
      production_call_writes_allowed: false,
      public_ranking_impact_allowed: false,
    }, null, 2)}\n`);
    return { mode: "promotion_review_report", execution_location: spec.execution_location, out, production_db_writes_allowed: false, production_call_writes_allowed: false, public_ranking_impact_allowed: false, note: "Promotion review creates evidence only; production default remains unchanged." };
  }

  return writeReportOnlyArtifact(job, spec);
}
