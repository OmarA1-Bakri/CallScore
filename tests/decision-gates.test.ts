import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateGates,
  checkKillSwitchAndHeartbeat,
  checkPublicVerify,
  checkCooldownAndWorkplane,
  checkRiskClass,
  checkOwnedPublicBoundaries,
  checkEvidenceAndCaps,
  checkMediaAndOriginality,
  checkQualityThreshold,
  checkReviewThreshold,
} from "../src/lib/autonomy/decision-gates";
import type { ChannelHeadDecisionContext } from "../src/lib/autonomy/channel-head-context";

const now = "2026-06-21T12:00:00.000Z";
const later = "2026-06-21T13:00:00.000Z";
const hash = `sha256:${"a".repeat(64)}`;

function baseCtx(overrides: Partial<ChannelHeadDecisionContext> = {}): ChannelHeadDecisionContext {
  return {
    now, taskId: "task-1", targetActionType: "publish_owned_public",
    riskClass: "safe_owned_public",
    channelHeadSoul: { agentId: "test-agent", channelId: "test-channel", soulVersion: "v1", purpose: "test" },
    gtmRegistryState: { laneId: "test", currentStatus: "ready_public_owned", requiredGate: "NONE", ownedOrManaged: true, zeroSpendRequired: true, allowedActions: ["publish_owned_public"], forbiddenActions: [], rollbackPath: "/rollback" },
    workplane: { status: "OK", blockers: [] },
    recentReceipts: [],
    cooldown: { channelCooldownActive: false, providerErrorCooldownActive: false, duplicatePayloadCooldownActive: false, waitUntil: later },
    mediaGate: { status: "pass", evidenceHash: hash, artifactIds: ["media-1"] },
    originalityGate: { status: "pass", evidenceHash: hash },
    qualitySignal: { status: "pass", score: 0.92, verifierSignal: "pass", evidenceHash: hash },
    channelPolicy: { policyVersion: "v1", publicClaimsSupported: true, claimBearingAllowed: true, safeOwnedPublicAllowed: true, requiresNonFounderReviewBelowConfidence: 0.8 },
    evidence: { evidenceLevel: "E3", evidenceHash: hash, sourceArtifactIds: ["art-1"] },
    payloadHash: hash,
    caps: { channelPostsToday: 0, maxChannelPostsPerDay: 1, totalPostsToday: 0, maxTotalPostsPerDay: 3 },
    killSwitch: { global_active: false, channel_active: false, agent_paused: false, missing_state_blocks_dispatch: true },
    heartbeat: { heartbeat_id: "hb-1", fresh: true, lease_expires_at: later },
    publicVerify: { status: "pass", checked_at: now },
    ...overrides,
  };
}

// ── Gate 1: Kill switch and heartbeat ──

test("checkKillSwitchAndHeartbeat returns null when healthy", () => {
  assert.equal(checkKillSwitchAndHeartbeat(baseCtx()), null);
});

test("checkKillSwitchAndHeartbeat returns wait for global kill switch", () => {
  const r = checkKillSwitchAndHeartbeat(baseCtx({ killSwitch: { ...baseCtx().killSwitch, global_active: true } }));
  assert.equal(r!.decision, "wait");
  assert.ok(r!.reason_codes.includes("global_kill_switch_active"));
});

test("checkKillSwitchAndHeartbeat returns wait for channel kill switch", () => {
  const r = checkKillSwitchAndHeartbeat(baseCtx({ killSwitch: { ...baseCtx().killSwitch, channel_active: true } }));
  assert.equal(r!.decision, "wait");
  assert.ok(r!.reason_codes.includes("channel_kill_switch_active"));
});

test("checkKillSwitchAndHeartbeat returns wait for agent paused", () => {
  const r = checkKillSwitchAndHeartbeat(baseCtx({ killSwitch: { ...baseCtx().killSwitch, agent_paused: true } }));
  assert.equal(r!.decision, "wait");
  assert.ok(r!.reason_codes.includes("agent_paused"));
});

test("checkKillSwitchAndHeartbeat returns wait for missing heartbeat", () => {
  const r = checkKillSwitchAndHeartbeat(baseCtx({ heartbeat: { ...baseCtx().heartbeat, heartbeat_id: null } }));
  assert.equal(r!.decision, "wait");
  assert.ok(r!.reason_codes.includes("heartbeat_missing"));
});

test("checkKillSwitchAndHeartbeat returns wait for stale heartbeat", () => {
  const r = checkKillSwitchAndHeartbeat(baseCtx({ heartbeat: { ...baseCtx().heartbeat, fresh: false } }));
  assert.equal(r!.decision, "wait");
  assert.ok(r!.reason_codes.includes("heartbeat_stale"));
});

test("checkKillSwitchAndHeartbeat returns wait for expired lease", () => {
  const r = checkKillSwitchAndHeartbeat(baseCtx({ heartbeat: { ...baseCtx().heartbeat, lease_expires_at: "2026-06-21T11:59:59.000Z" } }));
  assert.equal(r!.decision, "wait");
  assert.ok(r!.reason_codes.includes("heartbeat_lease_expired"));
});

// ── Gate 2: Public verify ──

test("checkPublicVerify returns null when passed", () => {
  assert.equal(checkPublicVerify(baseCtx()), null);
});

test("checkPublicVerify returns suppress for failed verify", () => {
  const r = checkPublicVerify(baseCtx({ publicVerify: { status: "fail", checked_at: now } }));
  assert.equal(r!.decision, "suppress");
  assert.ok(r!.reason_codes.includes("public_verify_failed"));
});

test("checkPublicVerify returns suppress for unknown verify", () => {
  const r = checkPublicVerify(baseCtx({ publicVerify: { status: "unknown", checked_at: now } }));
  assert.equal(r!.decision, "suppress");
  assert.ok(r!.reason_codes.includes("public_verify_unknown"));
});

// ── Gate 3: Cooldown and Workplane ──

test("checkCooldownAndWorkplane returns null when clear", () => {
  assert.equal(checkCooldownAndWorkplane(baseCtx()), null);
});

test("checkCooldownAndWorkplane returns wait for active cooldown", () => {
  const r = checkCooldownAndWorkplane(baseCtx({ cooldown: { ...baseCtx().cooldown, channelCooldownActive: true } }));
  assert.equal(r!.decision, "wait");
  assert.ok(r!.reason_codes.includes("channel_cooldown_active"));
});

test("checkCooldownAndWorkplane returns wait for blocked workplane", () => {
  const r = checkCooldownAndWorkplane(baseCtx({ workplane: { ...baseCtx().workplane, status: "BLOCKED" } }));
  assert.equal(r!.decision, "wait");
  assert.ok(r!.reason_codes.includes("workplane_blocked"));
});

// ── Gate 4: Risk class ──

test("checkRiskClass returns null for low risk", () => {
  assert.equal(checkRiskClass(baseCtx()), null);
});

test("checkRiskClass returns request_gate for restricted risk", () => {
  const r = checkRiskClass(baseCtx({
    riskClass: "restricted_provider",
    gtmRegistryState: { ...baseCtx().gtmRegistryState, currentStatus: "gated", requiredGate: "PRODUCTION_GATE" },
  }));
  assert.equal(r!.decision, "request_gate");
  assert.equal(r!.gate_required, "PRODUCTION_GATE");
});

// ── Gate 5: Owned-public boundaries ──

test("checkOwnedPublicBoundaries returns null for safe owned-public", () => {
  assert.equal(checkOwnedPublicBoundaries(baseCtx()), null);
});

test("checkOwnedPublicBoundaries returns suppress when registry not ready", () => {
  const r = checkOwnedPublicBoundaries(baseCtx({ gtmRegistryState: { ...baseCtx().gtmRegistryState, currentStatus: "gated" } }));
  assert.equal(r!.decision, "suppress");
  assert.ok(r!.reason_codes.includes("registry_not_ready"));
});

test("checkOwnedPublicBoundaries returns suppress when not owned", () => {
  const r = checkOwnedPublicBoundaries(baseCtx({ gtmRegistryState: { ...baseCtx().gtmRegistryState, ownedOrManaged: false } }));
  assert.equal(r!.decision, "suppress");
  assert.ok(r!.reason_codes.includes("not_owned_or_managed"));
});

test("checkOwnedPublicBoundaries returns suppress when non-zero-spend", () => {
  const r = checkOwnedPublicBoundaries(baseCtx({ gtmRegistryState: { ...baseCtx().gtmRegistryState, zeroSpendRequired: false } }));
  assert.equal(r!.decision, "suppress");
  assert.ok(r!.reason_codes.includes("non_zero_spend"));
});

test("checkOwnedPublicBoundaries returns suppress when policy disallows safe-owned", () => {
  const r = checkOwnedPublicBoundaries(baseCtx({ channelPolicy: { ...baseCtx().channelPolicy, safeOwnedPublicAllowed: false } }));
  assert.equal(r!.decision, "suppress");
  assert.ok(r!.reason_codes.includes("policy_disallows_safe_owned_public"));
});

test("checkOwnedPublicBoundaries returns null for non-publish action types", () => {
  assert.equal(checkOwnedPublicBoundaries(baseCtx({ targetActionType: "monitor_read_only" })), null);
});

// ── Gate 6: Evidence and caps ──

test("checkEvidenceAndCaps returns null when complete", () => {
  assert.equal(checkEvidenceAndCaps(baseCtx()), null);
});

test("checkEvidenceAndCaps returns suppress for incomplete evidence", () => {
  const r = checkEvidenceAndCaps(baseCtx({ evidence: { evidenceLevel: "E0", evidenceHash: null, sourceArtifactIds: [] } }));
  assert.equal(r!.decision, "suppress");
  assert.ok(r!.reason_codes.includes("evidence_incomplete"));
});

test("checkEvidenceAndCaps returns suppress when daily cap reached", () => {
  const r = checkEvidenceAndCaps(baseCtx({ caps: { ...baseCtx().caps, channelPostsToday: 1, maxChannelPostsPerDay: 1 } }));
  assert.equal(r!.decision, "suppress");
  assert.ok(r!.reason_codes.includes("channel_daily_cap_reached"));
});

// ── Gate 7: Media and originality ──

test("checkMediaAndOriginality returns null when pass", () => {
  assert.equal(checkMediaAndOriginality(baseCtx()), null);
});

test("checkMediaAndOriginality returns suppress for missing media", () => {
  const r = checkMediaAndOriginality(baseCtx({ mediaGate: { ...baseCtx().mediaGate, status: "missing" } }));
  assert.equal(r!.decision, "suppress");
  assert.ok(r!.reason_codes.includes("media_gate_missing"));
});

test("checkMediaAndOriginality returns suppress for failed originality", () => {
  const r = checkMediaAndOriginality(baseCtx({ originalityGate: { ...baseCtx().originalityGate, status: "fail" } }));
  assert.equal(r!.decision, "suppress");
  assert.ok(r!.reason_codes.includes("originality_gate_failed"));
});

// ── Gate 8: Quality threshold ──

test("checkQualityThreshold returns null for high quality", () => {
  assert.equal(checkQualityThreshold(baseCtx()), null);
});

test("checkQualityThreshold returns suppress for low quality", () => {
  const r = checkQualityThreshold(baseCtx({ qualitySignal: { ...baseCtx().qualitySignal, status: "fail", score: 0.31 } }));
  assert.equal(r!.decision, "suppress");
});

// ── Gate 9: Review threshold ──

test("checkReviewThreshold returns null for high confidence", () => {
  assert.equal(checkReviewThreshold(baseCtx()), null);
});

test("checkReviewThreshold returns escalate for ambiguous quality", () => {
  const r = checkReviewThreshold(baseCtx({ qualitySignal: { ...baseCtx().qualitySignal, status: "ambiguous", score: 0.67 } }));
  assert.equal(r!.decision, "escalate_non_founder_review");
  assert.ok(r!.reason_codes.includes("quality_signal_ambiguous"));
});

test("checkReviewThreshold returns escalate for confidence below threshold", () => {
  const r = checkReviewThreshold(baseCtx({ qualitySignal: { ...baseCtx().qualitySignal, score: 0.52 } }));
  assert.equal(r!.decision, "escalate_non_founder_review");
});

// ── evaluateGates integration ──

test("evaluateGates returns null when all gates pass", () => {
  assert.equal(evaluateGates(baseCtx()), null);
});

test("evaluateGates returns first triggered gate in priority order", () => {
  // Kill switch should take priority over everything
  const killHit = evaluateGates(baseCtx({
    killSwitch: { ...baseCtx().killSwitch, global_active: true },
    evidence: { evidenceLevel: "E0", evidenceHash: null, sourceArtifactIds: [] },
    mediaGate: { ...baseCtx().mediaGate, status: "missing" },
  }));
  assert.equal(killHit!.decision, "wait");
  assert.ok(killHit!.reason_codes.includes("global_kill_switch_active"));
});

test("evaluateGates suppresses restricted risk when no higher-priority gate fires", () => {
  const r = evaluateGates(baseCtx({
    riskClass: "restricted_provider",
    gtmRegistryState: { ...baseCtx().gtmRegistryState, currentStatus: "gated", requiredGate: "PRODUCTION_GATE" },
  }));
  assert.equal(r!.decision, "request_gate");
});
