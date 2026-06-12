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

export const WORKPLANE_JOB_SPECS: Record<WorkplaneJobType, WorkplaneJobSpec> = {
  transcript_collect_laptop: {
    type: "transcript_collect_laptop",
    input_payload: {
      limit: 5,
      max_limit: 25,
      allow_large_batch: false,
      browser: "firefox",
      since_days: 45,
      min_gap_seconds: 45,
      max_gap_seconds: 90,
      write_result_to_hh: true,
    },
    execution_location: "Omar laptop",
    max_batch_size: 5,
    concurrency: 1,
    timeout_seconds: 3600,
    retry_policy: "no automatic retry after terminal YouTube failure; skip recent failed video ids for 24h",
    cooldown_policy: "stop on HTTP 429, bot verification, or impersonation warning threshold; persist randomized 12-24h laptop cooldown",
    output_artifact: "%LOCALAPPDATA%\\CallScore\\transcript-collector-state.json plus HH transcript ingest rows",
    success_criteria: [
      "bounded worklist fetched over Tailscale",
      "captions fetched transcript-only",
      "cookies remain laptop-local",
      "available/failed result pushed to HH ingest path",
    ],
    failure_classification: [
      "rate_limited",
      "bot_verification_required",
      "impersonation_unavailable",
      "impersonation_warning_threshold",
      "no_captions",
      "transcript_failed",
    ],
    production_db_writes_allowed: true,
    production_call_writes_allowed: false,
    public_ranking_impact_allowed: false,
    default_safe_command: "scripts/windows/run-transcript-collector.ps1 -Limit 5 -Browser firefox -SinceDays 45 -HhHost hermes-agent-box -Write",
  },
  transcript_ingest_result: {
    type: "transcript_ingest_result",
    input_payload: {
      result_json: "validated transcript result or failure record",
      overwrite: false,
      write: true,
    },
    execution_location: "HH",
    max_batch_size: 1,
    concurrency: 1,
    timeout_seconds: 120,
    retry_policy: "idempotent retry only for transport/database transient errors; never overwrite existing transcript unless explicitly requested",
    cooldown_policy: "inherits laptop collector cooldown; no local YouTube access",
    output_artifact: "videos.transcript/transcript_status update through npm run transcript:ingest",
    success_criteria: [
      "record validates video id/youtube id",
      "available transcript is stored through ingest script",
      "calls_extracted resets false only for new transcript text",
    ],
    failure_classification: ["invalid_payload", "video_mismatch", "transcript_too_short", "db_write_failed"],
    production_db_writes_allowed: true,
    production_call_writes_allowed: false,
    public_ranking_impact_allowed: false,
    default_safe_command: "npm run transcript:ingest -- --input - --write",
  },
  gemma_shadow_extract: {
    type: "gemma_shadow_extract",
    input_payload: {
      model: "callscore-gemma4-extractor:latest",
      provider: "ollama",
      ollama_host: "http://127.0.0.1:11434",
      limit: 10,
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
    success_criteria: [
      "reads existing transcripts only",
      "writes shadow artifact rows only",
      "does not write calls or creator_stats",
      "records parser/schema/latency evidence",
    ],
    failure_classification: ["invalid_json", "schema_invalid", "timeout", "ollama_unavailable", "manual_review"],
    production_db_writes_allowed: false,
    production_call_writes_allowed: false,
    public_ranking_impact_allowed: false,
    default_safe_command: "npm run shadow:extract -- --execute --provider ollama --ollama-host http://127.0.0.1:11434 --model callscore-gemma4-extractor:latest --limit 10 --video-agents 1 --chunk-agents 1 --model-attempts 1",
  },
  ml_extraction_eval: {
    type: "ml_extraction_eval",
    input_payload: {
      fixtures: "data/eval/call-extraction-fixtures.jsonl",
      shadow_in: "/tmp/callscore-shadow-extractions/<run-id>.jsonl",
      diff_in: "/tmp/callscore-shadow-extractions/<run-id>.diff.jsonl",
    },
    execution_location: "HH",
    max_batch_size: 100,
    concurrency: 1,
    timeout_seconds: 300,
    retry_policy: "artifact-only retry is safe; no production state mutation",
    cooldown_policy: "none; blocked promotion remains encoded in report",
    output_artifact: "/tmp/callscore-shadow-extractions/<run-id>.ml-idle-report.json",
    success_criteria: [
      "fixtures and shadow outputs are parsed",
      "JSON/schema/false-positive metrics are emitted",
      "promotion remains false without approval evidence",
    ],
    failure_classification: ["missing_fixture", "malformed_shadow_artifact", "malformed_diff_artifact", "eval_failed"],
    production_db_writes_allowed: false,
    production_call_writes_allowed: false,
    public_ranking_impact_allowed: false,
    default_safe_command: "npm run ml:idle-improve -- --shadow-in <shadow.jsonl> --diff-in <diff.jsonl>",
  },
  ml_idle_improve: {
    type: "ml_idle_improve",
    input_payload: {
      fixtures: "data/eval/call-extraction-fixtures.jsonl",
      include_disagreements: true,
      output: ".tmp/ml-idle-improve/<run-id>.json",
    },
    execution_location: "HH",
    max_batch_size: 100,
    concurrency: 1,
    timeout_seconds: 300,
    retry_policy: "artifact-only retry is safe; no automatic promotion",
    cooldown_policy: "none; recommendations only",
    output_artifact: ".tmp/ml-idle-improve/<run-id>.json",
    success_criteria: [
      "metrics generated",
      "prompt/fixture/model recommendations generated",
      "eligible_for_write_canary remains false until gates pass and approval is recorded",
    ],
    failure_classification: ["missing_artifact", "malformed_artifact", "insufficient_evidence"],
    production_db_writes_allowed: false,
    production_call_writes_allowed: false,
    public_ranking_impact_allowed: false,
    default_safe_command: "npm run ml:idle-improve",
  },
  extraction_promotion_review: {
    type: "extraction_promotion_review",
    input_payload: {
      shadow_run_id: "<run-id>",
      ml_report: "<report.json>",
      reviewed_by: "operator_or_eval_gate",
    },
    execution_location: "HH",
    max_batch_size: 1,
    concurrency: 1,
    timeout_seconds: 120,
    retry_policy: "review report can be regenerated; no production default change",
    cooldown_policy: "not applicable",
    output_artifact: ".tmp/extraction-promotion-review/<run-id>.json",
    success_criteria: [
      "promotion evidence summarized",
      "blocked gates listed",
      "production default remains unchanged",
    ],
    failure_classification: ["missing_report", "gate_failed", "approval_missing"],
    production_db_writes_allowed: false,
    production_call_writes_allowed: false,
    public_ranking_impact_allowed: false,
    default_safe_command: "npm run workplane:status",
  },
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
      note: "Hermes can represent and schedule this job, but cookies remain laptop-local and execution must happen on Omar laptop/workplane runner.",
    };
  }

  if (job.type === "transcript_ingest_result") {
    const inputPath = typeof payload.input_path === "string" ? payload.input_path : null;
    if (!inputPath) throw new Error("transcript_ingest_result requires payload.input_path");
    const { main } = await import("../scripts/ingest-transcript-result");
    await main(["--input", inputPath, ...(payload.write === false ? ["--dry-run"] : ["--write"])]);
    return {
      mode: payload.write === false ? "dry_run" : "write",
      execution_location: spec.execution_location,
      input_path: inputPath,
      production_call_writes_allowed: false,
      public_ranking_impact_allowed: false,
    };
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
      ...(payload.chunk_chars ? ["--chunk-chars", String(payload.chunk_chars)] : []),
      ...(payload.max_chunks ? ["--max-chunks", String(payload.max_chunks)] : []),
      ...(payload.num_predict ? ["--num-predict", String(payload.num_predict)] : []),
      ...(payload.request_timeout_ms ? ["--request-timeout-ms", String(payload.request_timeout_ms)] : []),
    ]);
    return {
      mode: "shadow_artifact",
      execution_location: spec.execution_location,
      run_id: runId,
      shadow_out: shadowOut,
      production_call_writes_allowed: false,
      public_ranking_impact_allowed: false,
    };
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
    return {
      mode: "eval_artifact",
      execution_location: spec.execution_location,
      out,
      production_call_writes_allowed: false,
      public_ranking_impact_allowed: false,
    };
  }

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
  return {
    mode: "promotion_review_report",
    execution_location: spec.execution_location,
    out,
    production_db_writes_allowed: false,
    production_call_writes_allowed: false,
    public_ranking_impact_allowed: false,
    note: "Promotion review creates evidence only; production default remains unchanged.",
  };
}
