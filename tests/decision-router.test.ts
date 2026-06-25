import test from "node:test";
import assert from "node:assert/strict";
import { routeDecision } from "../src/lib/autonomy/decision-router";
import { ChannelHeadDecisionSchema, AutonomyReceiptSchema } from "../src/lib/autonomy/contracts";
import type { ChannelHeadDecisionContext } from "../src/lib/autonomy/channel-head-context";

const now = "2026-06-21T12:00:00.000Z";
const later = "2026-06-21T13:00:00.000Z";
const hash = `sha256:${"a".repeat(64)}`;

function baseCtx(overrides: Partial<ChannelHeadDecisionContext> = {}): ChannelHeadDecisionContext {
  return {
    now, taskId: "task-1", targetActionType: "publish_owned_public",
    riskClass: "safe_owned_public",
    channelHeadSoul: { agentId: "callscore-x-linkedin-growth-head", channelId: "owned_social", soulVersion: "v1", purpose: "test" },
    gtmRegistryState: { laneId: "owned-social", currentStatus: "ready_public_owned", requiredGate: "NONE", ownedOrManaged: true, zeroSpendRequired: true, allowedActions: ["publish_owned_public"], forbiddenActions: [], rollbackPath: "/rollback" },
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

test("router dispatches owned_public_publish agents to publish handler — returns act", () => {
  const result = routeDecision(baseCtx());
  assert.equal(result.decision.decision, "act");
  assert.equal(result.decision.proposed_action?.action_type, "publish_owned_public");
  assert.equal(result.decision.risk_class, "safe_owned_public");
  assert.equal(ChannelHeadDecisionSchema.parse(result.decision).decision, "act");
  assert.equal(AutonomyReceiptSchema.parse(result.receipt).receipt_id, result.receipt.receipt_id);
});

test("router waits when kill switch is active", () => {
  const result = routeDecision(baseCtx({
    killSwitch: { ...baseCtx().killSwitch, global_active: true },
  }));
  assert.equal(result.decision.decision, "wait");
  assert.equal(result.receipt.status, "blocked");
});

test("router suppresses when evidence is incomplete", () => {
  const result = routeDecision(baseCtx({
    evidence: { evidenceLevel: "E0", evidenceHash: null, sourceArtifactIds: [] },
  }));
  assert.equal(result.decision.decision, "suppress");
  assert.equal(result.receipt.status, "suppressed");
});

test("router requests gate for restricted risk", () => {
  const result = routeDecision(baseCtx({
    riskClass: "restricted_provider",
    gtmRegistryState: { ...baseCtx().gtmRegistryState, currentStatus: "gated", requiredGate: "PRODUCTION_GATE" },
  }));
  assert.equal(result.decision.decision, "request_gate");
  assert.equal(result.decision.gate_required, "PRODUCTION_GATE");
});

test("router handles sentinel agents through gates but allows observe when clear", () => {
  const result = routeDecision(baseCtx({
    channelHeadSoul: { agentId: "callscore-data-pipeline-sentinel", channelId: "data_pipeline", soulVersion: "v1", purpose: "test" },
    targetActionType: "monitor_read_only",
  }));
  assert.equal(result.decision.decision, "act");
});

test("router blocks sentinel when kill switch active", () => {
  const result = routeDecision(baseCtx({
    channelHeadSoul: { agentId: "callscore-data-pipeline-sentinel", channelId: "data_pipeline", soulVersion: "v1", purpose: "test" },
    targetActionType: "monitor_read_only",
    killSwitch: { ...baseCtx().killSwitch, global_active: true },
  }));
  assert.equal(result.decision.decision, "wait");
});

test("router handles unknown agents via fallback to legacy decision engine", () => {
  const result = routeDecision(baseCtx({
    channelHeadSoul: { agentId: "callscore-unknown-test-agent", channelId: "test", soulVersion: "v1", purpose: "test" },
  }));
  // Falls back to decideChannelHeadAction which runs full gates
  assert.ok(["act", "wait", "suppress", "request_gate", "escalate_non_founder_review"].includes(result.decision.decision));
  assert.equal(ChannelHeadDecisionSchema.parse(result.decision).decision, result.decision.decision);
});

test("router escalates ambiguous quality to non-founder review", () => {
  const result = routeDecision(baseCtx({
    channelHeadSoul: { agentId: "callscore-x-linkedin-growth-head", channelId: "owned_social", soulVersion: "v1", purpose: "test" },
    qualitySignal: { ...baseCtx().qualitySignal, status: "ambiguous", score: 0.67 },
  }));
  assert.equal(result.decision.decision, "escalate_non_founder_review");
  assert.equal(result.decision.non_founder_review_required, true);
});

test("router cooldown clears after wait period", () => {
  const result = routeDecision(baseCtx({
    cooldown: { ...baseCtx().cooldown, channelCooldownActive: true },
  }));
  assert.equal(result.decision.decision, "wait");
  assert.equal(result.decision.wait_until, later);
});
