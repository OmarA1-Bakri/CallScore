import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelHeadDecisionContext } from "../src/lib/autonomy/channel-head-context";
import { classifyChannelHeadRisk } from "../src/lib/autonomy/risk-classifier";
import { scoreChannelHeadCandidate, DIMENSION_NAMES } from "../src/lib/autonomy/channel-head-scoring";

const now = "2026-06-21T12:00:00.000Z";
const later = "2026-06-21T13:00:00.000Z";
const hash = `sha256:${"b".repeat(64)}`;

function baseContext(overrides: Partial<ChannelHeadDecisionContext> = {}): ChannelHeadDecisionContext {
  const context: ChannelHeadDecisionContext = {
    now,
    taskId: "task-1",
    targetActionType: "publish_owned_public",
    riskClass: "safe_owned_public",
    channelHeadSoul: {
      agentId: "callscore-x-linkedin-growth-head",
      channelId: "owned_social",
      soulVersion: "souls.v1",
      purpose: "Publish safe owned public CallScore GTM when evidence and policy gates pass.",
    },
    gtmRegistryState: {
      laneId: "owned-social",
      currentStatus: "ready_public_owned",
      requiredGate: "NONE",
      ownedOrManaged: true,
      zeroSpendRequired: true,
      allowedActions: ["publish_owned_public", "monitor_read_only"],
      forbiddenActions: ["dm", "paid_spend"],
      rollbackPath: "docs/ops/rollback.md",
    },
    workplane: {
      status: "OK",
      automationReadiness: "CONTROLLED_FULL",
      blockers: [],
    },
    recentReceipts: ["receipt-prior-1", "receipt-prior-2"],
    cooldown: {
      channelCooldownActive: false,
      providerErrorCooldownActive: false,
      duplicatePayloadCooldownActive: false,
      waitUntil: later,
    },
    mediaGate: {
      status: "pass",
      evidenceHash: hash,
      artifactIds: ["media-card-1"],
    },
    originalityGate: {
      status: "pass",
      evidenceHash: hash,
    },
    qualitySignal: {
      status: "pass",
      score: 0.92,
      verifierSignal: "pass",
      evidenceHash: hash,
    },
    channelPolicy: {
      policyVersion: "policy.v1",
      publicClaimsSupported: true,
      claimBearingAllowed: true,
      safeOwnedPublicAllowed: true,
      requiresNonFounderReviewBelowConfidence: 0.8,
    },
    evidence: {
      evidenceLevel: "E3",
      evidenceHash: hash,
      sourceArtifactIds: ["artifact-1"],
    },
    payloadHash: hash,
    caps: {
      channelPostsToday: 0,
      maxChannelPostsPerDay: 1,
      totalPostsToday: 0,
      maxTotalPostsPerDay: 3,
    },
    killSwitch: { global_active: false, channel_active: false, agent_paused: false, missing_state_blocks_dispatch: true },
    heartbeat: { heartbeat_id: "heartbeat-1", fresh: true, lease_expires_at: later },
    publicVerify: { status: "pass", checked_at: now },
  };
  return { ...context, ...overrides };
}

test("channel-head scoring is deterministic, explainable, and covers every required dimension", () => {
  const first = scoreChannelHeadCandidate(baseContext());
  const second = scoreChannelHeadCandidate(baseContext());

  assert.deepEqual(first, second);
  assert.equal(first.confidence_bucket, "high");
  assert.ok(first.total_score >= 0.85);
  assert.deepEqual(first.dimensions.map((d) => d.name), [...DIMENSION_NAMES]);
  for (const dimension of first.dimensions) {
    assert.ok(dimension.score >= 0 && dimension.score <= 1, `${dimension.name} score should be normalized`);
    assert.ok(dimension.reason_codes.length > 0, `${dimension.name} should emit reason codes`);
  }
  assert.ok(first.reason_codes.includes("score_computed"));
});

test("scoring produces correct scores for various evidence completeness levels", () => {
  const completeEvidence = scoreChannelHeadCandidate(baseContext());
  const incompleteEvidence = scoreChannelHeadCandidate(baseContext({
    evidence: { evidenceLevel: "E0", evidenceHash: null, sourceArtifactIds: [] },
  }));
  assert.ok(completeEvidence.total_score > incompleteEvidence.total_score);
});

test("scoring is lower when cooldown is active", () => {
  const noCooldown = scoreChannelHeadCandidate(baseContext());
  const cooldown = scoreChannelHeadCandidate(baseContext({
    cooldown: { ...baseContext().cooldown, channelCooldownActive: true },
  }));
  assert.ok(noCooldown.total_score >= cooldown.total_score);
  const cdDim = cooldown.dimensions.find((d) => d.name === "cooldown_clearance");
  assert.equal(cdDim!.score, 0);
});

test("scoring is lower when quality is low", () => {
  const highQuality = scoreChannelHeadCandidate(baseContext());
  const lowQuality = scoreChannelHeadCandidate(baseContext({
    qualitySignal: { status: "fail", score: 0.31, verifierSignal: "low_quality", evidenceHash: hash },
  }));
  assert.ok(highQuality.total_score > lowQuality.total_score);
  const vcDim = lowQuality.dimensions.find((d) => d.name === "verifier_confidence");
  assert.equal(vcDim!.score, 0);
});

test("risk classifier requests gates for restricted classes and public-claim risk", () => {
  assert.deepEqual(classifyChannelHeadRisk(baseContext({ riskClass: "restricted_provider" })), {
    action_risk: "restricted",
    gate_required: "PRODUCTION_GATE",
    reason_codes: ["restricted_provider_requires_production_gate"],
  });
  assert.deepEqual(classifyChannelHeadRisk(baseContext({ riskClass: "public_claim_risk" })), {
    action_risk: "restricted",
    gate_required: "PUBLISH_GATE",
    reason_codes: ["public_claim_risk_requires_publish_gate"],
  });
});

test("scoring still produces reason_codes when registry is not ready", () => {
  const score = scoreChannelHeadCandidate(baseContext({
    gtmRegistryState: { ...baseContext().gtmRegistryState, currentStatus: "gated" },
  }));
  assert.ok(score.dimensions.find((d) => d.name === "channel_fit")!.score === 0);
  assert.ok(score.reason_codes.includes("channel_fit_blocked"));
  // Still produces valid score — gates are separate
  assert.ok(score.total_score > 0);
  assert.ok(score.reason_codes.includes("score_computed"));
});
