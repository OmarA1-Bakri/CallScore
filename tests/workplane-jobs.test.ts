import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WORKPLANE_JOB_SPECS, WORKPLANE_JOB_TYPES, getWorkplaneJobSpec } from "../src/lib/workplane-jobs";
import {
  buildReadinessDomains,
  decideNextAutonomousAction,
  latestArtOfWarCampaignReceipt,
  latestGemmaShadowArtifact,
  latestMlEvalArtifact,
  readCollectorCooldownState,
  workplaneJobModelForStatus,
} from "../src/lib/workplane-status";

test("workplane job specs cover required Hermes surfaces with safe defaults", () => {
  for (const required of [
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
    "artofwar_campaign_preflight",
    "artofwar_campaign_iteration",
    "artofwar_campaign_verify",
    "artofwar_campaign_persona_test",
    "artofwar_campaign_dry_run",
    "artofwar_campaign_gemma_eval",
    "artofwar_campaign_receipt",
    "artofwar_campaign_dossier",
    "artofwar_campaign_approval_review",
    "automation_registry_refresh",
    "automation_dry_run",
    "automation_health_check",
    "automation_activation_review",
  ]) {
    assert.equal((WORKPLANE_JOB_TYPES as readonly string[]).includes(required), true, required);
  }

  const collector = getWorkplaneJobSpec("transcript_collect_laptop");
  assert.equal(collector.execution_location, "Omar laptop");
  assert.equal(collector.max_batch_size, 5);
  assert.equal(collector.concurrency, 1);
  assert.equal(collector.production_db_writes_allowed, true);
  assert.equal(collector.production_call_writes_allowed, false);
  assert.equal(collector.public_ranking_impact_allowed, false);
  assert.match(collector.cooldown_policy, /12-24h/);
  assert.match(collector.default_safe_command, /-Workplane/);
  assert.ok(collector.failure_classification.includes("collector_tool_error"));

  const gemma = getWorkplaneJobSpec("gemma_shadow_extract");
  assert.equal(gemma.execution_location, "HH");
  assert.equal(gemma.max_batch_size, 10);
  assert.equal(gemma.production_db_writes_allowed, false);
  assert.equal(gemma.production_call_writes_allowed, false);
  assert.match(gemma.default_safe_command, /callscore-gemma4-extractor:latest/);

  const ingest = getWorkplaneJobSpec("transcript_ingest_result");
  assert.equal(ingest.production_db_writes_allowed, true);
  assert.equal(ingest.production_call_writes_allowed, false);

  const whop = getWorkplaneJobSpec("whop_plan_inventory_check");
  assert.equal(whop.production_db_writes_allowed, false);
  assert.equal(whop.production_call_writes_allowed, false);
  assert.match(whop.default_safe_command, /workplane:status/);

  const art = getWorkplaneJobSpec("artofwar_publish_approval_review");
  assert.equal(art.public_ranking_impact_allowed, false);
  assert.match(art.cooldown_policy, /not applicable/);
});

test("workplane status exposes all job specs as JSON-friendly records", () => {
  const rows = workplaneJobModelForStatus();
  assert.equal(rows.length, WORKPLANE_JOB_TYPES.length);
  assert.equal(rows.some((row) => row.type === "ml_idle_improve"), true);
  assert.equal(rows.every((row) => row.public_ranking_impact_allowed === false), true);
});

test("collector cooldown state handles missing, active, clear, and malformed files", () => {
  const dir = mkdtempSync(join(tmpdir(), "collector-state-"));
  const now = new Date("2026-06-12T12:00:00.000Z");
  assert.equal(readCollectorCooldownState(null, now).status, "unknown");
  assert.equal(readCollectorCooldownState(join(dir, "missing.json"), now).status, "unknown");

  const active = join(dir, "active.json");
  writeFileSync(active, JSON.stringify({ cooldown_until_utc: "2026-06-12T20:00:00.000Z", cooldown_reason: "rate_limited", video_failures: { a: { reason: "rate_limited", failed_at_utc: "2026-06-12T11:00:00.000Z" } } }));
  const activeState = readCollectorCooldownState(active, now);
  assert.equal(activeState.status, "active");
  assert.equal(activeState.cooldown_reason, "rate_limited");
  assert.equal(activeState.latest_failure_reason, "rate_limited");
  assert.deepEqual(activeState.recent_failure_reasons, { rate_limited: 1 });

  const clear = join(dir, "clear.json");
  writeFileSync(clear, JSON.stringify({ cooldown_until_utc: "2026-06-12T01:00:00.000Z" }));
  assert.equal(readCollectorCooldownState(clear, now).status, "clear");

  const malformed = join(dir, "bad.json");
  writeFileSync(malformed, "not json");
  assert.equal(readCollectorCooldownState(malformed, now).status, "malformed");
});

test("artifact readers summarize Gemma shadow and ML reports without throwing on malformed files", () => {
  const dir = mkdtempSync(join(tmpdir(), "workplane-artifacts-"));
  const shadow = join(dir, "gemma-shadow-test.jsonl");
  writeFileSync(shadow, `${JSON.stringify({ record_type: "shadow_extraction", accepted_count: 0, error: "Ollama timed out" })}\n`);
  const shadowSummary = latestGemmaShadowArtifact(dir);
  assert.equal(shadowSummary.exists, true);
  assert.equal(shadowSummary.malformed, false);
  assert.deepEqual(shadowSummary.summary.errors, { timeout: 1 });

  const report = join(dir, "gemma-shadow-test.ml-idle-report.json");
  writeFileSync(report, JSON.stringify({ run_id: "ml", metrics: { shadow_records: 1 }, promotion_gate: { eligible_for_write_canary: false }, production_default_changed: false }));
  const mlSummary = latestMlEvalArtifact(dir);
  assert.equal(mlSummary.exists, true);
  assert.equal((mlSummary.summary.promotion_gate as Record<string, unknown>).eligible_for_write_canary, false);

  writeFileSync(join(dir, "z-gemma-shadow-bad.jsonl"), "not json");
  assert.equal(latestGemmaShadowArtifact(dir).malformed, true);
});

test("Gemma readiness trusts bounded shadow sample receipts and clean artifacts", () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-gemma-shadow-receipt-"));
  const receiptDir = join(root, ".tmp", "workflow-receipts", "gemma_shadow_sample");
  mkdirSync(receiptDir, { recursive: true });
  writeFileSync(join(receiptDir, "gemma-laptop-batch3.json"), JSON.stringify({
    workflow_name: "gemma_shadow_sample",
    run_id: "gemma-laptop-batch3",
    result: "passed",
    artifact_path: ".tmp/shadow-extraction/gemma-laptop-batch3.jsonl",
    blockers: [],
  }));

  const domains = buildReadinessDomains({
    repoRoot: root,
    unsafeSourceRanks: 0,
    apiUnsafeOfficialCount: 0,
    collectorCooldown: { state_path: null, status: "clear", cooldown_until_utc: null, cooldown_reason: null, latest_failure_reason: null, latest_job_id: null, last_run_utc: null, last_attempted_count: 0, last_success_count: 0, last_failure_count: 0, last_success_rate: null, recent_failure_reasons: {}, checked_at: "now" },
    latestGemmaShadow: { path: ".tmp/shadow-extraction/gemma-laptop-batch3.jsonl", exists: true, modified_at: "now", malformed: false, summary: { rows: 5, accepted_calls: 1, errors: { none: 5 } } },
    latestMlEval: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    transcriptBacklogRecent30d: 0,
    dailyPipelineActive: true,
    nextAction: { action: "none", reason: "test", job_type: "gemma_shadow_extract", allowed: true },
    now: new Date("2026-06-14T04:10:00.000Z"),
  });

  assert.equal(domains.gemma_shadow_extraction.status, "READY");
  assert.deepEqual(domains.gemma_shadow_extraction.blockers, []);
  assert.equal(domains.gemma_shadow_extraction.canary_available, true);
  assert.match(String(domains.gemma_shadow_extraction.safe_next_action), /shadow diff/);
  assert.ok(domains.gemma_shadow_extraction.evidence.some((item) => item.includes("latest_gemma_shadow_sample_receipt=")));
});

test("next autonomous action blocks unsafe/cooldown and otherwise chooses safe work", () => {
  const base = {
    unsafeSourceRanks: 0,
    apiUnsafeOfficialCount: 0,
    collectorCooldown: { state_path: null, status: "unknown" as const, cooldown_until_utc: null, cooldown_reason: null, latest_failure_reason: null, latest_job_id: null, last_run_utc: null, last_attempted_count: null, last_success_count: null, last_failure_count: null, last_success_rate: null, recent_failure_reasons: {}, checked_at: "now" },
    latestGemmaShadow: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    latestMlEval: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    transcriptBacklogRecent30d: 10,
    collectorLastAttemptedCount: null,
    collectorLastSuccessCount: null,
  };
  assert.equal(decideNextAutonomousAction({ ...base, unsafeSourceRanks: 1 }).allowed, false);
  assert.equal(decideNextAutonomousAction({ ...base, collectorCooldown: { ...base.collectorCooldown, status: "active", cooldown_until_utc: "later" } }).action, "wait_for_collector_cooldown");
  assert.equal(decideNextAutonomousAction({ ...base, collectorLastAttemptedCount: 5, collectorLastSuccessCount: 0 }).action, "repair_transcript_targeting_or_failure_classification");
  assert.equal(
    decideNextAutonomousAction({ ...base, collectorLastAttemptedCount: 5, collectorLastSuccessCount: 0, latestTranscriptCadencePassed: true }).action,
    "run_gemma_shadow_extract_limit_10",
  );
  assert.equal(decideNextAutonomousAction({ ...base, latestMlEval: { path: "r", exists: true, modified_at: "now", malformed: false, summary: { promotion_gate: { eligible_for_write_canary: false } } } }).action, "start_artofwar_internal_growth_intelligence");
  assert.equal(decideNextAutonomousAction(base).job_type, "gemma_shadow_extract");
});


test("transcript readiness trusts latest successful cadence receipt over stale collector state", () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-workplane-receipt-"));
  const receiptDir = join(root, ".tmp", "workflow-receipts", "transcript_laptop_cadence");
  mkdirSync(receiptDir, { recursive: true });
  writeFileSync(join(receiptDir, "laptop-limit5.json"), JSON.stringify({
    workflow_name: "transcript_laptop_cadence",
    run_id: "laptop-limit5",
    result: "passed",
    blockers: [],
  }));

  const domains = buildReadinessDomains({
    repoRoot: root,
    unsafeSourceRanks: 0,
    apiUnsafeOfficialCount: 0,
    collectorCooldown: {
      state_path: ".tmp/laptop-collector/latest-state.json",
      status: "clear",
      cooldown_until_utc: null,
      cooldown_reason: null,
      latest_failure_reason: "transcript_failed",
      latest_job_id: "old-job",
      last_run_utc: "2026-06-12T18:33:23Z",
      last_attempted_count: 5,
      last_success_count: 0,
      last_failure_count: 5,
      last_success_rate: 0,
      recent_failure_reasons: { transcript_failed: 5 },
      checked_at: "now",
    },
    latestGemmaShadow: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    latestMlEval: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    transcriptBacklogRecent30d: 5,
    dailyPipelineActive: true,
    nextAction: { action: "repair_transcript_targeting_or_failure_classification", reason: "stale", job_type: "transcript_collect_laptop", allowed: true },
    now: new Date("2026-06-13T18:30:00.000Z"),
  });

  assert.equal(domains.transcript_collector.status, "READY");
  assert.deepEqual(domains.transcript_collector.blockers, []);
  assert.match(String(domains.transcript_collector.safe_next_action), /continue bounded laptop collector/);
  assert.ok(domains.transcript_collector.evidence.some((item) => item.includes("latest_cadence_receipt=")));
});



test("pipeline readiness recognizes latest Gemma write and score canary receipts", () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-workplane-write-canary-"));
  const transcriptDir = join(root, ".tmp", "workflow-receipts", "transcript_laptop_cadence");
  const writeDir = join(root, ".tmp", "workflow-receipts", "gemma_write_canary");
  const scoreDir = join(root, ".tmp", "workflow-receipts", "pipeline_score_canary");
  mkdirSync(transcriptDir, { recursive: true });
  mkdirSync(writeDir, { recursive: true });
  mkdirSync(scoreDir, { recursive: true });
  writeFileSync(join(transcriptDir, "laptop-limit5.json"), JSON.stringify({
    workflow_name: "transcript_laptop_cadence",
    run_id: "laptop-limit5",
    result: "passed",
    blockers: [],
  }));
  writeFileSync(join(writeDir, "gemma-write.json"), JSON.stringify({
    workflow_name: "gemma_write_canary",
    run_id: "gemma-write",
    result: "passed",
    blockers: [],
  }));
  writeFileSync(join(scoreDir, "score-canary.json"), JSON.stringify({
    workflow_name: "pipeline_score_canary",
    run_id: "score-canary",
    result: "passed",
    blockers: [],
  }));

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
    nextAction: { action: "none", reason: "test", job_type: "gemma_shadow_extract", allowed: true },
    now: new Date("2026-06-13T18:30:00.000Z"),
  });

  assert.deepEqual(domains.callscore_pipeline.blockers, [
    "bounded transcript cadence, one-video Gemma write canary, and bounded score canary passed; audit pipeline completeness remains partial",
  ]);
  assert.match(String(domains.callscore_pipeline.safe_next_action), /audit pipeline completeness/);
  assert.ok(domains.callscore_pipeline.evidence.some((item) => item.includes("latest_gemma_write_canary_receipt=")));
  assert.ok(domains.callscore_pipeline.evidence.some((item) => item.includes("latest_pipeline_score_canary_receipt=")));
});

test("readiness domains cover all activation surfaces with mutation gates", async () => {
  const { buildReadinessDomains } = await import("../src/lib/workplane-status");
  const domains = buildReadinessDomains({
    unsafeSourceRanks: 0,
    apiUnsafeOfficialCount: 0,
    collectorCooldown: { state_path: null, status: "unknown", cooldown_until_utc: null, cooldown_reason: null, latest_failure_reason: null, latest_job_id: null, last_run_utc: null, last_attempted_count: null, last_success_count: null, last_failure_count: null, last_success_rate: null, recent_failure_reasons: {}, checked_at: "now" },
    latestGemmaShadow: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    latestMlEval: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    transcriptBacklogRecent30d: 3,
    dailyPipelineActive: true,
    nextAction: { action: "run_laptop_collector_limit_5_if_laptop_cooldown_clear", reason: "test", job_type: "transcript_collect_laptop", allowed: true },
    now: new Date("2026-06-12T12:00:00.000Z"),
  });
  for (const key of ["callscore_pipeline", "transcript_collector", "gemma_shadow_extraction", "ml_improvement_loop", "whop_auto", "art_of_war", "claude_code_automations", "hermes_worker", "provider_integrations", "activation_gates", "root_hygiene"]) {
    assert.ok(domains[key], key);
    assert.equal(domains[key].production_mutation_allowed, false, key);
  }
  assert.equal(domains.activation_gates.status, "NEEDS_APPROVAL");
  assert.ok(domains.whop_auto.risky_actions_blocked.some((item) => item.includes("pricing")));
  assert.ok(domains.art_of_war.risky_actions_blocked.some((item) => item.includes("publishing")));
});

test("workplane status exposes executable report-only job commands", () => {
  const model = workplaneJobModelForStatus();
  const campaignLoop = model.find((entry) => entry.type === "artofwar_campaign_iteration");
  assert.ok(campaignLoop, "missing campaign iteration job model");
  assert.match(String(campaignLoop.default_safe_command), /campaign-loop --dry-run/);
  assert.equal(campaignLoop.production_db_writes_allowed, false);
  assert.equal(campaignLoop.public_ranking_impact_allowed, false);
  assert.ok(Array.isArray(campaignLoop.success_criteria));
  assert.ok(Array.isArray(campaignLoop.failure_classification));
});


test("Art of War campaign loop jobs are report-only and approval-gated", () => {
  const campaignJobs = [
    "artofwar_campaign_preflight",
    "artofwar_campaign_iteration",
    "artofwar_campaign_verify",
    "artofwar_campaign_persona_test",
    "artofwar_campaign_dry_run",
    "artofwar_campaign_gemma_eval",
    "artofwar_campaign_receipt",
    "artofwar_campaign_dossier",
    "artofwar_campaign_approval_review",
  ] as const;

  for (const type of campaignJobs) {
    const spec = getWorkplaneJobSpec(type);
    assert.equal(spec.execution_location, "HH", type);
    assert.equal(spec.production_db_writes_allowed, false, type);
    assert.equal(spec.production_call_writes_allowed, false, type);
    assert.equal(spec.public_ranking_impact_allowed, false, type);
    assert.ok(spec.failure_classification.includes("approval_missing"), type);
    assert.doesNotMatch(spec.default_safe_command, /publish|send|spend|whop:bootstrap|shadow:promote/i, type);
  }

  const preflight = getWorkplaneJobSpec("artofwar_campaign_preflight");
  assert.deepEqual((preflight.input_payload.required_fields as string[]).slice(0, 4), ["campaign_id", "track", "objective", "source_data"]);

  const persona = getWorkplaneJobSpec("artofwar_campaign_persona_test");
  assert.deepEqual(persona.input_payload.personas, ["creator_operator", "whop_buyer", "skeptical_prospect", "high_intent_buyer", "low_trust_cold_prospect", "technical_evaluator"]);
  assert.equal(persona.input_payload.threshold, 70);

  const approval = getWorkplaneJobSpec("artofwar_campaign_approval_review");
  assert.match(approval.success_criteria.join(" "), /approval_missing blocks/);
});

test("Gemma Ollama Modelfile is aligned to production shadow extraction schema", () => {
  const modelfile = readFileSync("ops/ollama/Modelfile.callscore-gemma4-extractor", "utf8");
  assert.match(modelfile, /\"symbol\":\"BTCUSDT\"/);
  assert.match(modelfile, /\"raw_quote\":\"exact quote\"/);
  assert.match(modelfile, /"extraction_confidence":0\.0-1\.0/);
  assert.doesNotMatch(modelfile, /asset_symbol/);
  assert.doesNotMatch(modelfile, /rejected_news_or_aggregation/);
});


test("existing enqueue script can safely enqueue bounded workplane jobs", () => {
  const enqueueScript = readFileSync("src/scripts/callscore-enqueue-job.ts", "utf8");
  assert.match(enqueueScript, /--job <candles\|match\|scores\|ml\|workplane>/);
  assert.match(enqueueScript, /--workplane-type TYPE/);
  assert.match(enqueueScript, /isWorkplaneJobType/);
  assert.match(enqueueScript, /getWorkplaneJobSpec/);
  assert.match(enqueueScript, /transcript_collect_laptop/);
  assert.match(enqueueScript, /--limit >5 is not supported by this safe workplane enqueue path/);
  assert.match(enqueueScript, /allow_large_batch: false/);
  assert.match(enqueueScript, /production_call_writes_allowed: spec\.production_call_writes_allowed/);
  assert.match(enqueueScript, /public_ranking_impact_allowed: spec\.public_ranking_impact_allowed/);
});


test("latest Art of War campaign receipt summarizes operational loop safely", () => {
  const dir = mkdtempSync(join(tmpdir(), "callscore-artofwar-receipt-"));
  const path = join(dir, "callscore-art-of-war-receipts-proof-operational-001.json");
  writeFileSync(path, JSON.stringify({
    campaign_id: "receipts-proof-operational-001",
    iteration: 1,
    decision: "revise_or_hold",
    failure_class: "audience_mismatch",
    next_safe_action: "revise_private_campaign_or_add_evidence",
    approval_required: true,
    public_action_performed: false,
    external_mutation_performed: false,
    whop_mutation_performed: false,
    production_mutation_performed: false,
    verifier_result: { passed: false },
    persona_scorecard: { passed: false },
    gemma_evaluation: { passed: false },
  }));
  const artifact = latestArtOfWarCampaignReceipt(dir);
  assert.equal(artifact.exists, true);
  assert.equal(artifact.summary.campaign_id, "receipts-proof-operational-001");
  assert.equal(artifact.summary.decision, "revise_or_hold");
  assert.equal(artifact.summary.public_action_performed, false);
  assert.equal(artifact.summary.external_mutation_performed, false);
  assert.equal(artifact.summary.approval_required, true);
});

test("Whop workplane jobs stay read-only or dry-run by default", () => {
  const whopJobs = [
    "whop_provider_health",
    "whop_plan_inventory_check",
    "whop_entitlement_sync_dry_run",
    "whop_webhook_replay_safe",
    "whop_customer_status_check",
    "whop_activation_review",
  ] as const;

  for (const type of whopJobs) {
    const spec = getWorkplaneJobSpec(type);
    assert.equal(spec.production_db_writes_allowed, false, type);
    assert.equal(spec.production_call_writes_allowed, false, type);
    assert.equal(spec.public_ranking_impact_allowed, false, type);
    assert.doesNotMatch(spec.default_safe_command, /whop:bootstrap|create|update|delete|pricing|payment/i, type);
    assert.ok(spec.failure_classification.includes("approval_missing") || spec.failure_classification.includes("unsafe_mutation_requested"), type);
  }
});
