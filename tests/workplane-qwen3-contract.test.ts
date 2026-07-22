import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildReadinessDomains,
  decideNextAutonomousAction,
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
