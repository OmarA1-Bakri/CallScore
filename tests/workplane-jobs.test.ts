import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
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
  assert.deepEqual([...WORKPLANE_JOB_TYPES], [
    "transcript_collect_laptop",
    "transcript_ingest_result",
    "gemma_shadow_extract",
    "ml_extraction_eval",
    "ml_idle_improve",
    "extraction_promotion_review",
  ]);

  const collector = getWorkplaneJobSpec("transcript_collect_laptop");
  assert.equal(collector.execution_location, "Omar laptop");
  assert.equal(collector.max_batch_size, 5);
  assert.equal(collector.concurrency, 1);
  assert.equal(collector.production_db_writes_allowed, true);
  assert.equal(collector.production_call_writes_allowed, false);
  assert.equal(collector.public_ranking_impact_allowed, false);
  assert.match(collector.cooldown_policy, /12-24h/);

  const gemma = getWorkplaneJobSpec("gemma_shadow_extract");
  assert.equal(gemma.execution_location, "HH");
  assert.equal(gemma.max_batch_size, 10);
  assert.equal(gemma.production_db_writes_allowed, false);
  assert.equal(gemma.production_call_writes_allowed, false);
  assert.match(gemma.default_safe_command, /callscore-gemma4-extractor:latest/);

  const ingest = getWorkplaneJobSpec("transcript_ingest_result");
  assert.equal(ingest.production_db_writes_allowed, true);
  assert.equal(ingest.production_call_writes_allowed, false);
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
    collectorCooldown: { state_path: null, status: "unknown" as const, cooldown_until_utc: null, cooldown_reason: null, latest_failure_reason: null, checked_at: "now" },
    latestGemmaShadow: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    latestMlEval: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    transcriptBacklogRecent30d: 10,
  };
  assert.equal(decideNextAutonomousAction({ ...base, unsafeSourceRanks: 1 }).allowed, false);
  assert.equal(decideNextAutonomousAction({ ...base, collectorCooldown: { ...base.collectorCooldown, status: "active", cooldown_until_utc: "later" } }).action, "wait_for_collector_cooldown");
  assert.equal(decideNextAutonomousAction({ ...base, latestMlEval: { path: "r", exists: true, modified_at: "now", malformed: false, summary: { promotion_gate: { eligible_for_write_canary: false } } } }).action, "improve_gemma_prompt_and_chunking");
  assert.equal(decideNextAutonomousAction(base).job_type, "gemma_shadow_extract");
});
