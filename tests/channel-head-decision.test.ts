import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AutonomyReceiptSchema, ChannelHeadDecisionSchema } from "../src/lib/autonomy/contracts";
import {
  decideChannelHeadAction,
  writeChannelHeadDecisionReceipt,
  type ChannelHeadDecisionContext,
} from "../src/lib/autonomy/channel-head-decision";

const now = "2026-06-21T12:00:00.000Z";
const later = "2026-06-21T13:00:00.000Z";
const hash = `sha256:${"a".repeat(64)}`;

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
    recentReceipts: ["receipt-prior-1"],
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
    killSwitch: {
      global_active: false,
      channel_active: false,
      agent_paused: false,
      missing_state_blocks_dispatch: true,
    },
    heartbeat: {
      heartbeat_id: "heartbeat-1",
      fresh: true,
      lease_expires_at: later,
    },
    publicVerify: {
      status: "pass",
      checked_at: now,
    },
  };
  return { ...context, ...overrides };
}

test("channel-head kernel acts when safe-owned public evidence and gates are complete", () => {
  const result = decideChannelHeadAction(baseContext());

  assert.equal(result.decision.decision, "act");
  assert.equal(result.decision.proposed_action?.action_type, "publish_owned_public");
  assert.equal(result.decision.risk_class, "safe_owned_public");
  assert.equal(result.decision.gate_required, null);
  assert.equal(result.decision.receipts_to_write.length, 1);
  assert.equal(result.receipt.receipt_type, "decision");
  assert.equal(result.receipt.status, "succeeded");
  assert.equal(result.receipt.external_mutation_performed, false);
  assert.equal(result.receipt.provider_mutation_performed, false);
  assert.equal(result.receipt.whop_mutation_performed, false);
  assert.equal(result.receipt.production_mutation_performed, false);
  assert.equal(result.receipt.send_or_outreach_performed, false);
  assert.equal(ChannelHeadDecisionSchema.parse(result.decision).decision, "act");
  assert.equal(AutonomyReceiptSchema.parse(result.receipt).receipt_id, result.receipt.receipt_id);
});

test("channel-head kernel fails closed when safe-owned public bounds are incomplete", () => {
  const unsafeCases: Array<[string, Partial<ChannelHeadDecisionContext>]> = [
    ["registry_not_ready", { gtmRegistryState: { ...baseContext().gtmRegistryState, currentStatus: "gated" } }],
    ["not_owned_or_managed", { gtmRegistryState: { ...baseContext().gtmRegistryState, ownedOrManaged: false } }],
    ["non_zero_spend", { gtmRegistryState: { ...baseContext().gtmRegistryState, zeroSpendRequired: false } }],
    ["action_not_allowed", { gtmRegistryState: { ...baseContext().gtmRegistryState, allowedActions: ["monitor_read_only"] } }],
    ["action_forbidden", { gtmRegistryState: { ...baseContext().gtmRegistryState, forbiddenActions: ["publish_owned_public"] } }],
    ["policy_disallows_safe_owned_public", { channelPolicy: { ...baseContext().channelPolicy, safeOwnedPublicAllowed: false } }],
    ["missing_evidence_hash", { evidence: { evidenceLevel: "E0", evidenceHash: null, sourceArtifactIds: [] } }],
    ["channel_daily_cap_reached", { caps: { ...baseContext().caps, channelPostsToday: 1, maxChannelPostsPerDay: 1 } }],
    ["global_daily_cap_reached", { caps: { ...baseContext().caps, totalPostsToday: 3, maxTotalPostsPerDay: 3 } }],
  ];

  for (const [expectedReason, overrides] of unsafeCases) {
    const result = decideChannelHeadAction(baseContext(overrides));

    assert.notEqual(result.decision.decision, "act", expectedReason);
    assert.equal(result.decision.proposed_action?.action_type, undefined, expectedReason);
    assert.ok(result.decision.reason_codes.includes(expectedReason), expectedReason);
    assert.equal(result.receipt.external_mutation_performed, false, expectedReason);
  }
});

test("channel-head kernel waits while cooldowns are active", () => {
  const result = decideChannelHeadAction(baseContext({
    cooldown: {
      channelCooldownActive: true,
      providerErrorCooldownActive: false,
      duplicatePayloadCooldownActive: false,
      waitUntil: later,
    },
  }));

  assert.equal(result.decision.decision, "wait");
  assert.equal(result.decision.wait_until, later);
  assert.deepEqual(result.decision.blockers, ["channel_cooldown_active"]);
  assert.equal(result.receipt.status, "blocked");
  assert.match(result.receipt.summary, /cooldown/i);
});

test("channel-head kernel blocks act decisions when kill-switch preflight is active", () => {
  const cases: Array<[string, Partial<ChannelHeadDecisionContext>, string]> = [
    ["global kill-switch", { killSwitch: { ...baseContext().killSwitch, global_active: true } }, "global_kill_switch_active"],
    ["channel kill-switch", { killSwitch: { ...baseContext().killSwitch, channel_active: true } }, "channel_kill_switch_active"],
    ["agent paused", { killSwitch: { ...baseContext().killSwitch, agent_paused: true } }, "agent_paused"],
  ];

  for (const [label, overrides, reasonCode] of cases) {
    const result = decideChannelHeadAction(baseContext(overrides));

    assert.equal(result.decision.decision, "wait", label);
    assert.equal(result.decision.proposed_action, null, label);
    assert.ok(result.decision.reason_codes.includes(reasonCode), `${label} should include ${reasonCode}`);
    assert.equal(result.receipt.status, "blocked", label);
  }
});

test("channel-head kernel waits when heartbeat lease preflight is stale or missing", () => {
  const cases: Array<[string, Partial<ChannelHeadDecisionContext>, string]> = [
    ["missing heartbeat", { heartbeat: { heartbeat_id: null, fresh: true, lease_expires_at: later } }, "heartbeat_missing"],
    ["stale heartbeat", { heartbeat: { heartbeat_id: "heartbeat-1", fresh: false, lease_expires_at: later } }, "heartbeat_stale"],
    ["missing lease", { heartbeat: { heartbeat_id: "heartbeat-1", fresh: true, lease_expires_at: null } }, "heartbeat_lease_missing"],
    ["expired lease", { heartbeat: { heartbeat_id: "heartbeat-1", fresh: true, lease_expires_at: "2026-06-21T11:59:59.000Z" } }, "heartbeat_lease_expired"],
  ];

  for (const [label, overrides, reasonCode] of cases) {
    const result = decideChannelHeadAction(baseContext(overrides));

    assert.equal(result.decision.decision, "wait", label);
    assert.equal(result.decision.proposed_action, null, label);
    assert.ok(result.decision.reason_codes.includes(reasonCode), `${label} should include ${reasonCode}`);
    assert.equal(result.receipt.status, "blocked", label);
  }
});

test("channel-head kernel suppresses act decisions when public live-verify preflight is failed or unknown", () => {
  const cases: Array<[string, Partial<ChannelHeadDecisionContext>, string]> = [
    ["failed public verify", { publicVerify: { status: "fail", checked_at: now } }, "public_verify_failed"],
    ["unknown public verify", { publicVerify: { status: "unknown", checked_at: now } }, "public_verify_unknown"],
    ["missing public verify timestamp", { publicVerify: { status: "pass" } }, "public_verify_missing_checked_at"],
  ];

  for (const [label, overrides, reasonCode] of cases) {
    const result = decideChannelHeadAction(baseContext(overrides));

    assert.equal(result.decision.decision, "suppress", label);
    assert.equal(result.decision.proposed_action, null, label);
    assert.ok(result.decision.reason_codes.includes(reasonCode), `${label} should include ${reasonCode}`);
    assert.equal(result.receipt.status, "suppressed", label);
  }
});

test("channel-head kernel suppresses low quality, missing media, and originality failures", () => {
  const lowQuality = decideChannelHeadAction(baseContext({
    qualitySignal: {
      status: "fail",
      score: 0.31,
      verifierSignal: "low_quality",
      evidenceHash: hash,
    },
  }));
  assert.equal(lowQuality.decision.decision, "suppress");
  assert.ok(lowQuality.decision.reason_codes.includes("quality_signal_failed"));
  assert.equal(lowQuality.receipt.status, "suppressed");

  const missingMedia = decideChannelHeadAction(baseContext({
    mediaGate: {
      status: "missing",
      evidenceHash: null,
      artifactIds: [],
    },
  }));
  assert.equal(missingMedia.decision.decision, "suppress");
  assert.ok(missingMedia.decision.reason_codes.includes("media_gate_missing"));

  const originalityFail = decideChannelHeadAction(baseContext({
    originalityGate: {
      status: "fail",
      evidenceHash: hash,
    },
  }));
  assert.equal(originalityFail.decision.decision, "suppress");
  assert.ok(originalityFail.decision.reason_codes.includes("originality_gate_failed"));
});

test("channel-head kernel requests an explicit gate for restricted mutations", () => {
  const result = decideChannelHeadAction(baseContext({
    targetActionType: "create_approval_packet",
    riskClass: "restricted_provider",
    gtmRegistryState: {
      ...baseContext().gtmRegistryState,
      currentStatus: "gated",
      requiredGate: "PRODUCTION_GATE",
      allowedActions: ["create_approval_packet"],
    },
  }));

  assert.equal(result.decision.decision, "request_gate");
  assert.equal(result.decision.proposed_action, null);
  assert.equal(result.decision.gate_required, "PRODUCTION_GATE");
  assert.ok(result.decision.reason_codes.includes("restricted_provider_requires_production_gate"));
  assert.equal(result.receipt.status, "blocked");
  assert.equal(result.receipt.gate_required, "PRODUCTION_GATE");
});

test("channel-head kernel suppresses unsafe safe-owned-public inputs before proposing publication", () => {
  const unsafeCases: Array<[string, ChannelHeadDecisionContext, string]> = [
    ["safe-owned policy disabled", baseContext({ channelPolicy: { ...baseContext().channelPolicy, safeOwnedPublicAllowed: false } }), "safe_owned_public_policy_disabled"],
    ["registry lane not owned", baseContext({ gtmRegistryState: { ...baseContext().gtmRegistryState, ownedOrManaged: false } }), "registry_not_owned_or_managed"],
    ["target action forbidden", baseContext({ gtmRegistryState: { ...baseContext().gtmRegistryState, forbiddenActions: ["publish_owned_public"] } }), "target_action_forbidden"],
    ["target action not allowed", baseContext({ gtmRegistryState: { ...baseContext().gtmRegistryState, allowedActions: ["monitor_read_only"] } }), "target_action_not_allowed"],
    ["source evidence missing", baseContext({ evidence: { evidenceLevel: "E0", evidenceHash: null, sourceArtifactIds: [] } }), "evidence_incomplete"],
  ];

  for (const [label, context, reasonCode] of unsafeCases) {
    const result = decideChannelHeadAction(context);
    assert.equal(result.decision.decision, "suppress", label);
    assert.equal(result.decision.proposed_action, null, label);
    assert.ok(result.decision.reason_codes.includes(reasonCode), `${label} should include ${reasonCode}`);
    assert.equal(result.receipt.external_mutation_performed, false, label);
  }
});

test("channel-head kernel escalates ambiguous safe-owned public items to non-founder review", () => {
  const result = decideChannelHeadAction(baseContext({
    qualitySignal: {
      status: "ambiguous",
      score: 0.67,
      verifierSignal: "needs_review",
      evidenceHash: hash,
    },
  }));

  assert.equal(result.decision.decision, "escalate_non_founder_review");
  assert.equal(result.decision.non_founder_review_required, true);
  assert.equal(result.decision.proposed_action?.action_type, "create_non_founder_review_item");
  assert.ok(result.decision.reason_codes.includes("quality_signal_ambiguous"));
  assert.equal(result.receipt.status, "review");
});

test("channel-head receipt writer persists the schema-valid decision receipt", () => {
  const result = decideChannelHeadAction(baseContext());
  const dir = mkdtempSync(join(tmpdir(), "callscore-channel-head-"));
  const path = writeChannelHeadDecisionReceipt(result, dir);
  const parsed = JSON.parse(readFileSync(path, "utf8"));

  assert.equal(parsed.receipt.receipt_id, result.receipt.receipt_id);
  assert.equal(parsed.receipt.artifact_path, path);
  assert.equal(parsed.decision.decision_id, result.decision.decision_id);
  assert.equal(parsed.external_mutation_performed, false);
  assert.equal(AutonomyReceiptSchema.parse(parsed.receipt).receipt_id, result.receipt.receipt_id);
  assert.equal(ChannelHeadDecisionSchema.parse(parsed.decision).decision, "act");
});
