import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WORKPLANE_JOB_SPECS, WORKPLANE_JOB_TYPES, getWorkplaneJobSpec } from "../src/lib/workplane-jobs";
import {
  decideNextAutonomousAction,
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
  assert.equal(decideNextAutonomousAction({ ...base, latestMlEval: { path: "r", exists: true, modified_at: "now", malformed: false, summary: { promotion_gate: { eligible_for_write_canary: false } } } }).action, "start_artofwar_internal_growth_intelligence");
  assert.equal(decideNextAutonomousAction(base).job_type, "gemma_shadow_extract");
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

test("Gemma Ollama Modelfile is aligned to production shadow extraction schema", () => {
  const modelfile = readFileSync("ops/ollama/Modelfile.callscore-gemma4-extractor", "utf8");
  assert.match(modelfile, /\"symbol\":\"BTCUSDT\"/);
  assert.match(modelfile, /\"raw_quote\":\"exact quote\"/);
  assert.match(modelfile, /"extraction_confidence":0\.0-1\.0/);
  assert.doesNotMatch(modelfile, /asset_symbol/);
  assert.doesNotMatch(modelfile, /rejected_news_or_aggregation/);
});
