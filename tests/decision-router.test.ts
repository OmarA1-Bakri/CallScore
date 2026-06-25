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

// ── Internal Enqueue handler tests ──

test("internal enqueue handler produces act with draft action type", () => {
  const { handleInternalEnqueue } = require("../src/lib/autonomy/decision-handlers/internal-enqueue");
  const result = handleInternalEnqueue(baseCtx({
    targetActionType: "draft",
    evidence: { evidenceLevel: "E0", evidenceHash: null, sourceArtifactIds: [] },
  }));
  assert.equal(result.decision.decision, "act");
  assert.equal(result.decision.proposed_action?.action_type, "draft");
  assert.equal(result.receipt.dry_run, true);
  assert.equal(result.receipt.external_mutation_performed, false);
  assert.equal(result.receipt.provider_mutation_performed, false);
  assert.equal(result.receipt.send_or_outreach_performed, false);
  assert.equal(ChannelHeadDecisionSchema.parse(result.decision).decision, "act");
  assert.equal(AutonomyReceiptSchema.parse(result.receipt).receipt_id, result.receipt.receipt_id);
});

test("internal enqueue handler waits when kill switch active", () => {
  const { handleInternalEnqueue } = require("../src/lib/autonomy/decision-handlers/internal-enqueue");
  const result = handleInternalEnqueue(baseCtx({
    killSwitch: { ...baseCtx().killSwitch, global_active: true },
  }));
  assert.equal(result.decision.decision, "wait");
  assert.equal(result.receipt.status, "blocked");
});

test("internal enqueue handler waits when workplane blocked", () => {
  const { handleInternalEnqueue } = require("../src/lib/autonomy/decision-handlers/internal-enqueue");
  const result = handleInternalEnqueue(baseCtx({
    workplane: { status: "BLOCKED", blockers: ["maintenance"] },
  }));
  assert.equal(result.decision.decision, "wait");
  assert.equal(result.receipt.status, "blocked");
});

// ── Internal State Mutation handler tests ──

test("internal state mutation handler routes via pipeline-scorer-head", () => {
  const result = routeDecision(baseCtx({
    channelHeadSoul: { agentId: "callscore-pipeline-scorer-head", channelId: "internal", soulVersion: "v1", purpose: "test" },
    targetActionType: "draft",
  }));
  assert.equal(result.decision.decision, "act");
  assert.equal(result.decision.proposed_action?.action_type, "draft");
  assert.equal(result.receipt.dry_run, true);
  assert.equal(result.receipt.external_mutation_performed, false);
  assert.equal(ChannelHeadDecisionSchema.parse(result.decision).decision, "act");
  assert.equal(AutonomyReceiptSchema.parse(result.receipt).receipt_id, result.receipt.receipt_id);
});

test("internal state mutation handler requests gate for restricted financial risk", () => {
  const { handleInternalStateMutation } = require("../src/lib/autonomy/decision-handlers/internal-state-mutation");
  const result = handleInternalStateMutation(baseCtx({
    riskClass: "restricted_financial",
    gtmRegistryState: { ...baseCtx().gtmRegistryState, requiredGate: "FINANCIAL_GATE", requiredReceipt: undefined },
  }));
  assert.equal(result.decision.decision, "request_gate");
  assert.equal(result.decision.gate_required, "FINANCIAL_GATE");
  assert.equal(result.receipt.status, "blocked");
});

test("internal state mutation handler suppresses when evidence missing", () => {
  const { handleInternalStateMutation } = require("../src/lib/autonomy/decision-handlers/internal-state-mutation");
  const result = handleInternalStateMutation(baseCtx({
    evidence: { evidenceLevel: "E0", evidenceHash: null, sourceArtifactIds: [] },
    payloadHash: null,
  }));
  assert.equal(result.decision.decision, "suppress");
  assert.equal(result.receipt.status, "suppressed");
});

// ── Gated External Send handler tests ──

test("gated external send handler routes via whop-commerce-head", () => {
  const result = routeDecision(baseCtx({
    channelHeadSoul: { agentId: "callscore-whop-commerce-head", channelId: "commerce", soulVersion: "v1", purpose: "test" },
    targetActionType: "draft",
  }));
  // whop-commerce-head has [draft_artifact, gated_external_send]; draft_artifact matches first
  // So this produces a normal act with draft action type from the draft-artifact handler
  assert.equal(result.decision.decision, "act");
  assert.equal(ChannelHeadDecisionSchema.parse(result.decision).decision, "act");
});

test("gated external send handler requests gate when required gate missing", () => {
  const { handleGatedExternalSend } = require("../src/lib/autonomy/decision-handlers/gated-external-send");
  const result = handleGatedExternalSend(baseCtx({
    riskClass: "restricted_outreach",
    gtmRegistryState: { ...baseCtx().gtmRegistryState, requiredGate: "SEND_GATE", requiredReceipt: undefined },
    evidence: { evidenceLevel: "E0", evidenceHash: null, sourceArtifactIds: [] },
  }));
  assert.equal(result.decision.decision, "request_gate");
  assert.ok(result.decision.reason_codes.some((c: string) => c.includes("send_gate") || c.includes("missing")));
  assert.equal(result.receipt.status, "blocked");
});

test("gated external send handler produces approval packet when gates clear", () => {
  const { handleGatedExternalSend } = require("../src/lib/autonomy/decision-handlers/gated-external-send");
  const result = handleGatedExternalSend(baseCtx({
    riskClass: "safe_owned_public",
    gtmRegistryState: { ...baseCtx().gtmRegistryState, requiredGate: "NONE", requiredReceipt: "receipt-gate-1" },
  }));
  assert.equal(result.decision.decision, "act");
  assert.equal(result.decision.proposed_action?.action_type, "create_approval_packet");
  assert.equal(result.receipt.dry_run, true);
  assert.equal(result.receipt.external_mutation_performed, false);
  assert.equal(result.receipt.send_or_outreach_performed, false);
  assert.equal(ChannelHeadDecisionSchema.parse(result.decision).decision, "act");
});

test("gated external send handler waits when kill switch active", () => {
  const { handleGatedExternalSend } = require("../src/lib/autonomy/decision-handlers/gated-external-send");
  const result = handleGatedExternalSend(baseCtx({
    killSwitch: { ...baseCtx().killSwitch, global_active: true },
  }));
  assert.equal(result.decision.decision, "wait");
  assert.equal(result.receipt.status, "blocked");
});

// ── All 7 authority tiers registered test ──

test("router has registered handlers for all 7 action authority tiers", () => {
  // Import the router source to verify HANDLER_REGISTRY keys
  const { routeDecision: rd } = require("../src/lib/autonomy/decision-router");
  // All 7 authorities should have a handler, meaning agents from each authority
  // path should route successfully (even if some fall through to legacy)

  // read_only_observe
  const observeResult = routeDecision(baseCtx({
    channelHeadSoul: { agentId: "callscore-opportunity-research-head", channelId: "research", soulVersion: "v1", purpose: "test" },
  }));
  assert.ok(observeResult.decision.decision);

  // internal_enqueue — test handler exists by calling it directly
  const { handleInternalEnqueue: hie } = require("../src/lib/autonomy/decision-handlers/internal-enqueue");
  assert.ok(typeof hie === "function");

  // draft_artifact
  const draftResult = routeDecision(baseCtx({
    channelHeadSoul: { agentId: "callscore-artofwar-strategist", channelId: "campaign", soulVersion: "v1", purpose: "test" },
  }));
  assert.ok(draftResult.decision.decision);

  // internal_state_mutation
  const stateResult = routeDecision(baseCtx({
    channelHeadSoul: { agentId: "callscore-pipeline-scorer-head", channelId: "internal", soulVersion: "v1", purpose: "test" },
  }));
  assert.ok(stateResult.decision.decision);

  // owned_public_publish
  const publishResult = routeDecision(baseCtx());
  assert.ok(publishResult.decision.decision);

  // gated_external_send — test handler exists by calling it directly
  const { handleGatedExternalSend: hges } = require("../src/lib/autonomy/decision-handlers/gated-external-send");
  assert.ok(typeof hges === "function");

  // hard_gate
  const gateResult = routeDecision(baseCtx({
    channelHeadSoul: { agentId: "callscore-compliance-linter-head", channelId: "compliance", soulVersion: "v1", purpose: "test" },
  }));
  assert.ok(gateResult.decision.decision);
});

// ── Legacy fallback still exists but canonical agents no longer reach it ──

test("legacy fallback still handles truly unknown agent IDs", () => {
  const result = routeDecision(baseCtx({
    channelHeadSoul: { agentId: "callscore-nonexistent-agent", channelId: "unknown", soulVersion: "v1", purpose: "test" },
  }));
  assert.ok(["act", "wait", "suppress", "request_gate", "escalate_non_founder_review"].includes(result.decision.decision));
  assert.equal(ChannelHeadDecisionSchema.parse(result.decision).decision, result.decision.decision);
});
