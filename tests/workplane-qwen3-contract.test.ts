import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildReadinessDomains,
  decideNextAutonomousAction,
  latestLocalModelCapacityPreflightArtifact,
  type ArtifactSummary,
  type CollectorCooldownState,
} from "../src/lib/workplane-status";

const QWEN3_MODEL = "qwen3:4b-instruct-2507-q4_K_M";

function collectorState(): CollectorCooldownState {
  return {
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
    checked_at: "2026-07-22T00:00:00.000Z",
  };
}

const emptyArtifact: ArtifactSummary = {
  path: null,
  exists: false,
  modified_at: null,
  malformed: false,
  summary: {},
};

test("Workplane exposes the live Qwen3 local-model domains without stale current labels", () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "callscore-qwen3-contract-"));
  const domains = buildReadinessDomains({
    repoRoot,
    unsafeSourceRanks: 0,
    apiUnsafeOfficialCount: 0,
    collectorCooldown: collectorState(),
    latestGemmaShadow: emptyArtifact,
    latestMlEval: emptyArtifact,
    transcriptBacklogRecent30d: 0,
    dailyPipelineActive: true,
    nextAction: { action: "hold_monitor", reason: "test", job_type: null, allowed: true },
    now: new Date("2026-07-22T00:00:00.000Z"),
  });

  assert.ok(domains.local_model_runtime_capacity);
  assert.ok(domains.local_model_shadow_extraction);
  assert.equal(Object.keys(domains).some((key) => /gemma|qwen2[._-]?5|qwen25/i.test(key)), false);

  const liveContract = JSON.stringify({
    local_model_runtime_capacity: domains.local_model_runtime_capacity,
    local_model_shadow_extraction: domains.local_model_shadow_extraction,
  });
  assert.match(liveContract, new RegExp(QWEN3_MODEL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(liveContract, /Gemma4|Qwen2[._-]?5|qwen25/i);
});

test("Workplane recommends a bounded local Qwen3 shadow run when no current artifact exists", () => {
  const decision = decideNextAutonomousAction({
    unsafeSourceRanks: 0,
    apiUnsafeOfficialCount: 0,
    collectorCooldown: collectorState(),
    latestGemmaShadow: emptyArtifact,
    latestMlEval: emptyArtifact,
    transcriptBacklogRecent30d: 0,
    collectorLastAttemptedCount: 0,
    collectorLastSuccessCount: 0,
  });

  assert.equal(decision.action, "run_local_model_shadow_extract_limit_10");
  assert.match(decision.reason, new RegExp(QWEN3_MODEL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(`${decision.action} ${decision.reason}`, /Gemma4|Qwen2[._-]?5|qwen25/i);
});

test("historical Gemma capacity receipts are compatibility-only evidence", () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "callscore-qwen3-legacy-receipt-"));
  const receiptDir = join(repoRoot, ".tmp", "workflow-receipts", "gemma_capacity_preflight");
  mkdirSync(receiptDir, { recursive: true });
  writeFileSync(join(receiptDir, "historical-gemma.json"), JSON.stringify({
    workflow_name: "gemma_capacity_preflight",
    run_id: "historical-gemma",
    result: "passed",
    model: "callscore-gemma4-extractor:latest",
    can_load: true,
    blockers: [],
  }));

  const artifact = latestLocalModelCapacityPreflightArtifact(repoRoot);
  const domains = buildReadinessDomains({
    repoRoot,
    unsafeSourceRanks: 0,
    apiUnsafeOfficialCount: 0,
    collectorCooldown: collectorState(),
    latestGemmaShadow: emptyArtifact,
    latestMlEval: emptyArtifact,
    transcriptBacklogRecent30d: 0,
    dailyPipelineActive: true,
    nextAction: { action: "hold_monitor", reason: "test", job_type: null, allowed: true },
    now: new Date("2026-07-22T00:00:00.000Z"),
  });

  assert.equal(artifact.exists, true);
  assert.equal(artifact.summary.model, "callscore-gemma4-extractor:latest");
  assert.equal(domains.local_model_runtime_capacity.status, "BLOCKED");
  assert.ok(domains.local_model_runtime_capacity.blockers.includes("historical_local_model_capacity_receipt_not_current"));
  assert.equal(artifact.summary.model_contract_status, "historical_compatibility_only");
  assert.equal(artifact.summary.historical_compatibility, true);
  assert.equal(artifact.summary.canonical_model, QWEN3_MODEL);
});

test("canonical model text cannot make an unrelated receipt current", () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "callscore-qwen3-forged-receipt-"));
  const receiptDir = join(repoRoot, ".tmp", "workflow-receipts", "local_model_capacity_preflight");
  mkdirSync(receiptDir, { recursive: true });
  writeFileSync(join(receiptDir, "unrelated.json"), JSON.stringify({
    workflow_name: "unrelated_workflow",
    schema_version: "unrelated.v0",
    run_id: "unrelated",
    result: "passed",
    model: QWEN3_MODEL,
    can_load: true,
    blockers: [],
  }));

  const artifact = latestLocalModelCapacityPreflightArtifact(repoRoot);
  const domains = buildReadinessDomains({
    repoRoot,
    unsafeSourceRanks: 0,
    apiUnsafeOfficialCount: 0,
    collectorCooldown: collectorState(),
    latestGemmaShadow: emptyArtifact,
    latestMlEval: emptyArtifact,
    transcriptBacklogRecent30d: 0,
    dailyPipelineActive: true,
    nextAction: { action: "hold_monitor", reason: "test", job_type: null, allowed: true },
    now: new Date("2026-07-22T00:00:00.000Z"),
  });

  assert.equal(artifact.summary.model_contract_status, "unknown_or_noncanonical");
  assert.equal(domains.local_model_runtime_capacity.status, "BLOCKED");
  assert.ok(domains.local_model_runtime_capacity.blockers.includes("local_model_capacity_receipt_noncanonical"));
  assert.equal(domains.local_model_runtime_capacity.canary_available, false);
});
