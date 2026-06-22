import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelHeadDecisionContext } from "../src/lib/autonomy/channel-head-decision";
import { classifyChannelHeadRisk } from "../src/lib/autonomy/risk-classifier";
import { scoreChannelHeadCandidate } from "../src/lib/autonomy/channel-head-scoring";

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
  assert.equal(first.decision, "act");
  assert.equal(first.confidence_bucket, "high");
  assert.ok(first.total_score >= 0.85);
  assert.deepEqual(first.dimensions.map((dimension) => dimension.name), [
    "freshness",
    "evidence_completeness",
    "cooldown_clearance",
    "novelty_originality",
    "media_readiness",
    "public_claim_risk",
    "prior_performance_receipt_signal",
    "verifier_confidence",
    "channel_fit",
    "action_risk",
  ]);
  for (const dimension of first.dimensions) {
    assert.ok(dimension.score >= 0 && dimension.score <= 1, `${dimension.name} score should be normalized`);
    assert.ok(dimension.reason_codes.length > 0, `${dimension.name} should emit reason codes`);
  }
  assert.ok(first.reason_codes.includes("score_high_confidence_low_risk"));
});

test("channel-head scoring fails closed for unsafe owned-public policy, registry, action, and evidence gaps", () => {
  const cases: Array<[string, ChannelHeadDecisionContext, string]> = [
    ["safe-owned policy disabled", baseContext({ channelPolicy: { ...baseContext().channelPolicy, safeOwnedPublicAllowed: false } }), "safe_owned_public_policy_disabled"],
    ["registry lane not owned", baseContext({ gtmRegistryState: { ...baseContext().gtmRegistryState, ownedOrManaged: false } }), "registry_not_owned_or_managed"],
    ["target action forbidden", baseContext({ gtmRegistryState: { ...baseContext().gtmRegistryState, forbiddenActions: ["publish_owned_public"] } }), "target_action_forbidden"],
    ["target action not allowed", baseContext({ gtmRegistryState: { ...baseContext().gtmRegistryState, allowedActions: ["monitor_read_only"] } }), "target_action_not_allowed"],
    ["source evidence missing", baseContext({ evidence: { evidenceLevel: "E0", evidenceHash: null, sourceArtifactIds: [] } }), "evidence_incomplete"],
  ];

  for (const [label, context, reasonCode] of cases) {
    const score = scoreChannelHeadCandidate(context);
    assert.equal(score.decision, "suppress", label);
    assert.ok(score.reason_codes.includes(reasonCode), `${label} should include ${reasonCode}`);
    assert.notEqual(score.decision, "act", label);
  }
});

test("channel-head scoring suppresses low confidence and routes only medium ambiguity to non-founder review", () => {
  const low = scoreChannelHeadCandidate(baseContext({
    qualitySignal: {
      status: "pass",
      score: 0.52,
      verifierSignal: "weak_verifier",
      evidenceHash: hash,
    },
  }));
  assert.equal(low.decision, "suppress");
  assert.equal(low.confidence_bucket, "low");
  assert.ok(low.reason_codes.includes("verifier_confidence_low"));

  const ambiguous = scoreChannelHeadCandidate(baseContext({
    qualitySignal: {
      status: "ambiguous",
      score: 0.67,
      verifierSignal: "needs_review",
      evidenceHash: hash,
    },
  }));
  assert.equal(ambiguous.decision, "review");
  assert.equal(ambiguous.confidence_bucket, "medium");
  assert.ok(ambiguous.reason_codes.includes("non_founder_review_required"));
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
