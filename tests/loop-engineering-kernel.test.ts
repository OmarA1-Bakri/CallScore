import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildExtractionLoopReceipt } from "../src/lib/loop-engineering";
import { getWorkplaneJobSpec, runWorkplaneJob, WORKPLANE_JOB_TYPES } from "../src/lib/workplane-jobs";
import { latestShadowArtifact } from "../src/scripts/ml-idle-improve";
import { buildReadinessDomains, latestLoopEngineeringReceipt } from "../src/lib/workplane-status";
import type { PipelineJob } from "../src/lib/pipeline";

const safeMlReport = {
  record_type: "ml_idle_improvement_report",
  run_id: "loop-test",
  metrics: {
    shadow_records: 1,
    fixture_records: 1,
    json_valid_rate: 1,
    schema_pass_rate: 1,
    parser_error_count: 0,
    accepted_calls: 1,
    rejected_or_no_call_records: 0,
    high_confidence_calls: 0,
    diff_status_counts: {},
  },
  promotion_gate: {
    json_valid_ge_95: true,
    schema_pass_ge_95: true,
    no_parser_errors: true,
    no_unreviewed_high_confidence_diffs: true,
    approval_recorded: false,
    eligible_for_write_canary: false,
    reasons: ["manual_or_eval_approval_not_recorded"],
  },
  suggestions: ["Keep promotion gated."],
  next_fixture_targets: ["known high-quality creator-owned calls"],
  production_default_changed: false,
};

function baseJob(payload: Record<string, unknown>): PipelineJob {
  return {
    id: 1,
    run_id: null,
    type: "loop_engineering_eval",
    status: "pending",
    priority: 0,
    payload,
    attempts: 0,
    max_attempts: 1,
    locked_by: null,
    locked_at: null,
    heartbeat_at: null,
    lease_expires_at: null,
    run_after: new Date(0).toISOString(),
    idempotency_key: null,
    error: null,
    metrics: {},
    phase: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
}

test("extraction loop receipt is dry-run/local-write only and blocks promotion", () => {
  const receipt = buildExtractionLoopReceipt({
    runId: "loop-test",
    sourceData: ["data/eval/call-extraction-fixtures.jsonl"],
    mlIdleReport: safeMlReport,
  });

  assert.equal(receipt.artifact_type, "LoopReceipt");
  assert.equal(receipt.loop_id, "callscore_extraction_precision_loop");
  assert.equal(receipt.mode, "dry_run");
  assert.equal(receipt.local_write_only, true);
  assert.equal(receipt.decision, "needs_approval");
  assert.equal(receipt.failure_class, "approval_missing");
  assert.equal(receipt.public_action_performed, false);
  assert.equal(receipt.external_mutation_performed, false);
  assert.equal(receipt.provider_mutation_performed, false);
  assert.equal(receipt.whop_mutation_performed, false);
  assert.equal(receipt.production_mutation_performed, false);
  assert.equal(receipt.production_default_changed, false);
  assert.equal(receipt.production_db_writes_allowed, false);
  assert.equal(receipt.production_call_writes_allowed, false);
  assert.equal(receipt.public_ranking_impact_allowed, false);
  assert.match(receipt.next_safe_action, /extraction_promotion_review/);
});

test("loop_engineering_eval workplane spec is safe and status-visible", () => {
  assert.ok((WORKPLANE_JOB_TYPES as readonly string[]).includes("loop_engineering_eval"));
  const spec = getWorkplaneJobSpec("loop_engineering_eval");
  assert.equal(spec.execution_location, "HH");
  assert.equal(spec.production_db_writes_allowed, false);
  assert.equal(spec.production_call_writes_allowed, false);
  assert.equal(spec.public_ranking_impact_allowed, false);
  assert.match(spec.retry_policy, /never auto-promote/);
  assert.ok(spec.failure_classification.includes("approval_missing"));
  assert.ok(spec.success_criteria.some((item) => item.includes("LoopReceipt")));
});

test("latestShadowArtifact chooses newest artifact by mtime instead of lexicographic name", () => {
  const dir = mkdtempSync(join(tmpdir(), "shadow-artifact-order-"));
  const root = join(dir, ".tmp", "shadow-extraction");
  mkdirSync(root, { recursive: true });

  const lexicographicallyLastButOlder = join(root, "workplane-canary-20260612.jsonl");
  const newest = join(root, "gemma-final-shadow-20260614T110138Z.jsonl");
  writeFileSync(lexicographicallyLastButOlder, `${JSON.stringify({ record_type: "shadow_extraction" })}\n`);
  writeFileSync(newest, `${JSON.stringify({ record_type: "shadow_extraction" })}\n`);
  utimesSync(lexicographicallyLastButOlder, new Date("2026-06-12T00:00:00.000Z"), new Date("2026-06-12T00:00:00.000Z"));
  utimesSync(newest, new Date("2026-06-14T00:00:00.000Z"), new Date("2026-06-14T00:00:00.000Z"));

  assert.equal(latestShadowArtifact(root), newest);
});

test("runWorkplaneJob writes extraction LoopReceipt without live side effects", async () => {
  const dir = mkdtempSync(join(tmpdir(), "loop-engineering-job-"));
  const previous = process.cwd();
  process.chdir(dir);
  try {
    mkdirSync("fixtures", { recursive: true });
    const fixtures = join(dir, "fixtures", "fixtures.jsonl");
    writeFileSync(fixtures, `${JSON.stringify({ id: "fixture-1" })}\n`);

    mkdirSync(join(dir, ".tmp", "shadow-extraction"), { recursive: true });
    const discoveredShadow = ".tmp/shadow-extraction/gemma-loop-test-20260617T000000Z.jsonl";
    writeFileSync(join(dir, discoveredShadow), `${JSON.stringify({
      record_type: "shadow_extraction",
      ts: "2026-06-17T00:00:00.000Z",
      run_id: "shadow-test",
      provider: "ollama",
      model: "callscore-gemma4-extractor:latest",
      fallback_model: null,
      video: { id: 1, creator_id: 1, creator_name: "Fixture Creator", youtube_handle: "@fixture", youtube_video_id: "fixture-video", title: "Fixture", published_at: null, created_at: null },
      transcript_sha256: "fixture-sha",
      transcript_length: 100,
      schema_valid: true,
      confidence_distribution: { min: null, max: null, average: null, high_confidence_count: 0, medium_confidence_count: 0, low_confidence_count: 0 },
      parser_errors: [],
      latency_ms: 1,
      comparison_to_rule_extractor: { status: "pending_shadow_diff", note: "test" },
      candidate_count: 0,
      accepted_count: 0,
      accepted_calls: [],
      chunk_summary: { chunk_count: 1, covered_until_offset: 100, reached_transcript_end: true },
      error: null,
    })}\n`);

    const result = await runWorkplaneJob(baseJob({
      run_id: "loop-job-test",
      fixtures,
      out: ".tmp/loop-engineering/loop-job-test.json",
      ml_report_out: ".tmp/ml-idle-improve/loop-job-test.loop-ml-idle.json",
    }));

    assert.equal(result.mode, "loop_engineering_dry_run");
    assert.equal(result.public_action_performed, false);
    assert.equal(result.external_mutation_performed, false);
    assert.equal(result.provider_mutation_performed, false);
    assert.equal(result.whop_mutation_performed, false);
    assert.equal(result.production_mutation_performed, false);
    assert.equal(result.production_default_changed, false);
    assert.equal(result.production_db_writes_allowed, false);
    assert.equal(result.production_call_writes_allowed, false);
    assert.equal(result.public_ranking_impact_allowed, false);

    const receiptPath = join(dir, ".tmp", "loop-engineering", "loop-job-test.json");
    assert.equal(existsSync(receiptPath), true);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    assert.equal(receipt.artifact_type, "LoopReceipt");
    assert.equal(receipt.source_data.includes(discoveredShadow), true);
    assert.equal(receipt.metrics_after.shadow_records, 1);
    assert.equal(receipt.metric_summary.json_valid_rate, 1);
    assert.equal(receipt.failure_class, "no_accepted_calls");
    assert.equal(receipt.public_action_performed, false);
    assert.equal(receipt.production_default_changed, false);

    const latest = latestLoopEngineeringReceipt(join(dir, ".tmp", "loop-engineering"));
    assert.equal(latest.exists, true);
    assert.equal(latest.summary.loop_id, "callscore_extraction_precision_loop");
    assert.equal(latest.summary.production_mutation_performed, false);
  } finally {
    process.chdir(previous);
  }
});

test("loop_engineering_kernel readiness domain is monitored and gated", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-engineering-status-"));
  mkdirSync(join(root, "docs", "ops"), { recursive: true });
  writeFileSync(join(root, "docs", "ops", "callscore-loop-engineering-contract.md"), "contract");
  writeFileSync(join(root, "docs", "ops", "callscore-loop-failure-taxonomy.md"), "taxonomy");

  const domains = buildReadinessDomains({
    repoRoot: root,
    unsafeSourceRanks: 0,
    apiUnsafeOfficialCount: 0,
    collectorCooldown: {
      state_path: null,
      status: "clear",
      cooldown_until_utc: null,
      cooldown_reason: null,
      latest_failure_reason: null,
      latest_job_id: null,
      last_run_utc: null,
      last_attempted_count: 0,
      last_success_count: 0,
      last_failure_count: 0,
      last_success_rate: null,
      recent_failure_reasons: {},
      checked_at: "now",
    },
    latestGemmaShadow: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    latestMlEval: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    transcriptBacklogRecent30d: 0,
    dailyPipelineActive: true,
    nextAction: { action: "none", reason: "test", job_type: null, allowed: true },
    now: new Date("2026-06-17T00:00:00.000Z"),
  });

  assert.equal(domains.loop_engineering_kernel.status, "MONITORED");
  assert.equal(domains.loop_engineering_kernel.production_mutation_allowed, false);
  assert.ok(domains.loop_engineering_kernel.relevant_jobs.includes("loop_engineering_eval"));
  assert.equal(domains.loop_engineering_kernel.canary_available, false);
  assert.match(domains.loop_engineering_kernel.safe_next_action ?? "", /loop_engineering_eval/);
});
