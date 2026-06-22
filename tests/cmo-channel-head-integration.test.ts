import test from "node:test";
import assert from "node:assert/strict";
import { decideCmoChannelStatus, type CmoChannelDecisionInput } from "../src/lib/autonomy/cmo-channel-integration";
import { decideChannelHeadAction } from "../src/lib/autonomy/channel-head-decision";
import type { ChannelHeadDecisionContext } from "../src/lib/autonomy/channel-head-decision";
import type { FreshCallSentinelReceipt } from "../src/lib/sentinels/fresh-call-sentinel";
import { TrustDecisionSchema, type TrustDecision } from "../src/lib/autonomy/contracts";

const now = "2026-06-21T12:00:00.000Z";
const later = "2026-06-21T13:00:00.000Z";
const hash = `sha256:${"b".repeat(64)}`;

function channelHeadContext(overrides: Partial<ChannelHeadDecisionContext> = {}): ChannelHeadDecisionContext {
  const base: ChannelHeadDecisionContext = {
    now,
    taskId: "cmo-task-1",
    targetActionType: "publish_owned_public",
    riskClass: "safe_owned_public",
    channelHeadSoul: {
      agentId: "callscore-x-linkedin-growth-head",
      channelId: "owned_social",
      soulVersion: "souls.v1",
      purpose: "Own safe CallScore X/LinkedIn growth within social discipline gates.",
    },
    gtmRegistryState: {
      laneId: "owned-social",
      currentStatus: "ready_public_owned",
      requiredGate: "NONE",
      ownedOrManaged: true,
      zeroSpendRequired: true,
      allowedActions: ["publish_owned_public", "monitor_read_only"],
      forbiddenActions: ["dm", "paid_spend"],
      rollbackPath: "docs/ops/callscore-gtm-agent-registry.md",
    },
    workplane: { status: "OK", automationReadiness: "CONTROLLED_FULL", blockers: [] },
    recentReceipts: ["owned-public-prior"],
    cooldown: {
      channelCooldownActive: false,
      providerErrorCooldownActive: false,
      duplicatePayloadCooldownActive: false,
      waitUntil: later,
    },
    mediaGate: { status: "pass", evidenceHash: hash, artifactIds: ["visual-card-1"] },
    originalityGate: { status: "pass", evidenceHash: hash },
    qualitySignal: { status: "pass", score: 0.94, verifierSignal: "quality_gate_pass", evidenceHash: hash },
    channelPolicy: {
      policyVersion: "social-policy.v1",
      publicClaimsSupported: true,
      claimBearingAllowed: true,
      safeOwnedPublicAllowed: true,
      requiresNonFounderReviewBelowConfidence: 0.8,
    },
    evidence: { evidenceLevel: "E3", evidenceHash: hash, sourceArtifactIds: ["packet", "quality-gate"] },
    payloadHash: hash,
    caps: { channelPostsToday: 0, maxChannelPostsPerDay: 1, totalPostsToday: 0, maxTotalPostsPerDay: 3 },
    killSwitch: { global_active: false, channel_active: false, agent_paused: false, missing_state_blocks_dispatch: true },
    heartbeat: { heartbeat_id: "heartbeat-cmo", fresh: true, lease_expires_at: later },
    publicVerify: { status: "pass", checked_at: now },
  };
  return { ...base, ...overrides };
}

function trustDecision(overrides: Partial<TrustDecision> = {}): TrustDecision {
  const decision: TrustDecision = {
    schema_version: "callscore_trust_decision.v1",
    decision_id: "trust-decision-1",
    created_at: now,
    entity_type: "call",
    entity_id: "call-1",
    risk_class: "safe_owned_public",
    decision: "publish",
    confidence: 0.91,
    evidence_level: "E3",
    evidence_hash: hash,
    gate_receipt_id: null,
    suppress_from_public_scoring: false,
    public_visibility_allowed: true,
    non_founder_review_required: false,
    founder_review_required: false,
    reason_codes: ["high_confidence_supported_creator_owned_call"],
    reviewer_role: "none",
    expires_at: null,
    source_artifact_ids: ["evidence-1"],
    ...overrides,
  };
  assert.equal(TrustDecisionSchema.safeParse(decision).success, true);
  return decision;
}

function sentinelReceipt(overrides: Partial<FreshCallSentinelReceipt> = {}): FreshCallSentinelReceipt {
  return {
    schema_version: "callscore_sentinel_run_receipt.v1",
    receipt_id: "sentinel-receipt-1",
    created_at: now,
    sentinel_id: "fresh-call-sentinel",
    mode: "read_only",
    input_hash: hash,
    events_seen: 3,
    events_new: 1,
    events_duplicate: 1,
    events_cooldown_blocked: 0,
    tasks_enqueued: 0,
    discovered_count: 3,
    skipped_duplicate_count: 1,
    skipped_cooldown_count: 0,
    enqueued_count: 0,
    recommended_count: 1,
    production_mutation_performed: false,
    provider_mutation_performed: false,
    external_send_performed: false,
    cooldowns_respected: true,
    dedupe_keys: ["youtube_rss:video:creator:abc"],
    blockers: [],
    blocker: null,
    artifact_path: ".tmp/workflow-receipts/fresh_call_sentinel/sentinel.json",
    receipt_path: ".tmp/workflow-receipts/fresh_call_sentinel/sentinel.json",
    ...overrides,
  };
}

function baseInput(overrides: Partial<CmoChannelDecisionInput> = {}): CmoChannelDecisionInput {
  const channelHead = decideChannelHeadAction(channelHeadContext());
  return {
    channel: "x",
    surface: "x-post",
    createdAt: now,
    channelHeadDecision: channelHead.decision,
    trustDecision: trustDecision(),
    freshCallSentinelReceipt: sentinelReceipt(),
    cooldown: { status: "pass", evidenceHash: hash, waitUntil: null },
    originalityGate: { status: "pass", evidenceHash: hash, sameChannelChecked: true },
    mediaGate: { status: "pass", evidenceHash: hash, mediaRequired: true, artifactIds: ["visual-card-1"] },
    providerReadiness: { available: true, supportsMedia: true, toolPath: "composio.twitter" },
    socialDiscipline: { capabilityUsagePresent: true, growthMechanicsPresent: true, qualityGatePassed: true },
    publication: { attempted: false, succeeded: false, postUrl: null },
    ...overrides,
  };
}

test("CMO marks a fully gated channel ready_to_publish before provider mutation", () => {
  const result = decideCmoChannelStatus(baseInput());

  assert.equal(result.status, "ready_to_publish");
  assert.equal(result.publish_allowed, true);
  assert.equal(result.provider_call_allowed, true);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.consumed.channel_head_decision_id, baseInput().channelHeadDecision.decision_id);
  assert.equal(result.consumed.trust_decision_id, "trust-decision-1");
  assert.equal(result.consumed.fresh_call_sentinel_receipt_id, "sentinel-receipt-1");
});

test("CMO preserves X and LinkedIn cooldown/originality gates as cooldown or blocked statuses", () => {
  const cooldown = decideCmoChannelStatus(baseInput({
    channel: "linkedin",
    cooldown: { status: "cooldown", evidenceHash: hash, waitUntil: later },
  }));
  assert.equal(cooldown.status, "cooldown");
  assert.equal(cooldown.publish_allowed, false);
  assert.ok(cooldown.blockers.includes("channel_cooldown_active"));
  assert.equal(cooldown.next_wake_at, later);

  const originality = decideCmoChannelStatus(baseInput({
    channel: "x",
    originalityGate: { status: "fail", evidenceHash: hash, sameChannelChecked: true },
  }));
  assert.equal(originality.status, "blocked");
  assert.equal(originality.publish_allowed, false);
  assert.ok(originality.blockers.includes("originality_gate_failed"));
  assert.ok(originality.blockers.includes("same_channel_originality_gate_preserved"));
});

test("CMO blocks text-only publication whenever media is required", () => {
  const result = decideCmoChannelStatus(baseInput({
    mediaGate: { status: "missing", evidenceHash: null, mediaRequired: true, artifactIds: [] },
    providerReadiness: { available: true, supportsMedia: false, toolPath: "composio.twitter" },
  }));

  assert.equal(result.status, "blocked");
  assert.equal(result.publish_allowed, false);
  assert.equal(result.provider_call_allowed, false);
  assert.ok(result.blockers.includes("media_required_but_missing"));
  assert.ok(result.blockers.includes("text_only_publish_forbidden"));
});

test("CMO makes the Reddit owned-profile tool gap explicit instead of hiding it", () => {
  const result = decideCmoChannelStatus(baseInput({
    channel: "reddit",
    surface: "owned-profile",
    providerReadiness: { available: false, supportsMedia: true, toolPath: null, blocker: "trusted_member_profile_post_path_unavailable" },
  }));

  assert.equal(result.status, "blocked");
  assert.equal(result.publish_allowed, false);
  assert.ok(result.blockers.includes("reddit_owned_profile_tool_path_unavailable"));
  assert.ok(result.blockers.includes("provider_tool_path_unavailable"));
});

test("CMO requires channel-head act, trust publish, sentinel clearance, and capability_usage ledger", () => {
  const reviewHead = decideChannelHeadAction(channelHeadContext({
    qualitySignal: { status: "ambiguous", score: 0.66, verifierSignal: "needs_review", evidenceHash: hash },
  }));
  const result = decideCmoChannelStatus(baseInput({
    channelHeadDecision: reviewHead.decision,
    trustDecision: trustDecision({
      decision: "review",
      suppress_from_public_scoring: true,
      public_visibility_allowed: false,
      non_founder_review_required: true,
      reviewer_role: "trust_ops_reviewer",
      reason_codes: ["medium_confidence_non_founder_review"],
    }),
    freshCallSentinelReceipt: sentinelReceipt({ blockers: ["collector_cooldown_active"], blocker: "collector_cooldown_active", skipped_cooldown_count: 1, events_cooldown_blocked: 1 }),
    socialDiscipline: { capabilityUsagePresent: false, growthMechanicsPresent: true, qualityGatePassed: true },
  }));

  assert.equal(result.status, "cooldown");
  assert.equal(result.publish_allowed, false);
  assert.ok(result.blockers.includes("channel_head_decision_not_act"));
  assert.ok(result.blockers.includes("trust_decision_not_publish"));
  assert.ok(result.blockers.includes("fresh_call_sentinel_cooldown"));
  assert.ok(result.blockers.includes("capability_usage_missing"));
});

test("CMO only reports published after a passed gate provider success with readback URL", () => {
  const result = decideCmoChannelStatus(baseInput({
    publication: { attempted: true, succeeded: true, postUrl: "https://x.com/callscore/status/1" },
  }));

  assert.equal(result.status, "published");
  assert.equal(result.publish_allowed, true);
  assert.equal(result.post_url, "https://x.com/callscore/status/1");

  const failedReadback = decideCmoChannelStatus(baseInput({
    publication: { attempted: true, succeeded: true, postUrl: null },
  }));
  assert.equal(failedReadback.status, "blocked");
  assert.ok(failedReadback.blockers.includes("published_status_requires_post_url"));
});
