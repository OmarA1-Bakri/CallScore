import type { ChannelHeadAction, ChannelHeadDecision, TrustDecision } from "./contracts";
import type { FreshCallSentinelReceipt } from "../sentinels/fresh-call-sentinel";

export type CmoOwnedPublicChannel = "x" | "linkedin" | "reddit" | "reddit_owned_profile";
export type CmoChannelStatus = "evaluated" | "blocked" | "cooldown" | "ready_to_publish" | "published";
export type CmoGateStatus = "pass" | "fail" | "missing" | "unknown" | "cooldown";

export interface CmoCooldownGateState {
  readonly status: Extract<CmoGateStatus, "pass" | "cooldown" | "unknown">;
  readonly evidenceHash: string | null;
  readonly waitUntil: string | null;
}

export interface CmoOriginalityGateState {
  readonly status: Extract<CmoGateStatus, "pass" | "fail" | "missing" | "unknown">;
  readonly evidenceHash: string | null;
  readonly sameChannelChecked: boolean;
}

export interface CmoMediaGateState {
  readonly status: Extract<CmoGateStatus, "pass" | "fail" | "missing" | "unknown">;
  readonly evidenceHash: string | null;
  readonly mediaRequired: boolean;
  readonly artifactIds: readonly string[];
}

export interface CmoProviderReadinessState {
  readonly available: boolean;
  readonly supportsMedia: boolean;
  readonly toolPath: string | null;
  readonly blocker?: string | null;
}

export interface CmoSocialDisciplineState {
  readonly capabilityUsagePresent: boolean;
  readonly growthMechanicsPresent: boolean;
  readonly qualityGatePassed: boolean;
}

export interface CmoPublicationState {
  readonly attempted: boolean;
  readonly succeeded: boolean;
  readonly postUrl: string | null;
}

export interface CmoChannelDecisionInput {
  readonly channel: CmoOwnedPublicChannel;
  readonly surface: string;
  readonly createdAt: string;
  readonly channelHeadDecision: ChannelHeadDecision;
  readonly trustDecision: TrustDecision;
  readonly freshCallSentinelReceipt: FreshCallSentinelReceipt;
  readonly cooldown: CmoCooldownGateState;
  readonly originalityGate: CmoOriginalityGateState;
  readonly mediaGate: CmoMediaGateState;
  readonly providerReadiness: CmoProviderReadinessState;
  readonly socialDiscipline: CmoSocialDisciplineState;
  readonly publication: CmoPublicationState;
  readonly evaluateOnly?: boolean;
}

export interface CmoConsumedSignals {
  readonly channel_head_decision_id: string;
  readonly channel_head_decision: ChannelHeadDecision["decision"];
  readonly channel_head_action_type: ChannelHeadAction["action_type"] | null;
  readonly trust_decision_id: string;
  readonly trust_decision: TrustDecision["decision"];
  readonly fresh_call_sentinel_receipt_id: string;
  readonly fresh_call_sentinel_mode: FreshCallSentinelReceipt["mode"];
  readonly cooldown_evidence_hash: string | null;
  readonly originality_evidence_hash: string | null;
  readonly media_evidence_hash: string | null;
}

export interface CmoChannelDecisionResult {
  readonly schema_version: "callscore_cmo_channel_decision.v1";
  readonly channel: CmoOwnedPublicChannel;
  readonly surface: string;
  readonly created_at: string;
  readonly status: CmoChannelStatus;
  readonly publish_allowed: boolean;
  readonly provider_call_allowed: boolean;
  readonly post_url: string | null;
  readonly next_wake_at: string | null;
  readonly blockers: readonly string[];
  readonly consumed: CmoConsumedSignals;
  readonly safety: {
    readonly text_only_publish_forbidden: boolean;
    readonly capability_usage_required: true;
    readonly no_provider_call_without_green_gates: true;
    readonly reddit_owned_profile_gap_explicit: boolean;
  };
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function isSameChannelOriginalityStrict(channel: CmoOwnedPublicChannel): boolean {
  return channel === "x" || channel === "linkedin";
}

function proposedActionType(decision: ChannelHeadDecision): ChannelHeadAction["action_type"] | null {
  return decision.proposed_action?.action_type ?? null;
}

function freshCallCooldownActive(receipt: FreshCallSentinelReceipt): boolean {
  return receipt.events_cooldown_blocked > 0
    || receipt.skipped_cooldown_count > 0
    || receipt.blocker?.toLowerCase().includes("cooldown") === true
    || receipt.blockers.some((blocker) => blocker.toLowerCase().includes("cooldown"));
}

function freshCallBlocked(receipt: FreshCallSentinelReceipt): boolean {
  return receipt.mode === "blocked" || receipt.blockers.length > 0 || Boolean(receipt.blocker);
}

function isOwnedRedditProfile(input: CmoChannelDecisionInput): boolean {
  const surface = input.surface.toLowerCase();
  return input.channel === "reddit_owned_profile" || (input.channel === "reddit" && surface.includes("owned-profile"));
}

function collectBlockers(input: CmoChannelDecisionInput): string[] {
  const blockers: string[] = [];
  const actionType = proposedActionType(input.channelHeadDecision);

  if (input.channelHeadDecision.decision !== "act") blockers.push("channel_head_decision_not_act");
  if (actionType && actionType !== "publish_owned_public") blockers.push("channel_head_action_not_publish_owned_public");
  if (!actionType && input.channelHeadDecision.decision === "act") blockers.push("channel_head_action_missing");

  if (input.trustDecision.decision !== "publish" || !input.trustDecision.public_visibility_allowed) {
    blockers.push("trust_decision_not_publish");
  }
  if (input.trustDecision.suppress_from_public_scoring) blockers.push("trust_suppresses_public_scoring");

  if (freshCallCooldownActive(input.freshCallSentinelReceipt)) blockers.push("fresh_call_sentinel_cooldown");
  else if (freshCallBlocked(input.freshCallSentinelReceipt)) blockers.push("fresh_call_sentinel_blocked");

  if (input.cooldown.status === "cooldown") blockers.push("channel_cooldown_active");
  if (input.cooldown.status === "unknown") blockers.push("channel_cooldown_unknown");

  if (input.originalityGate.status === "fail") blockers.push("originality_gate_failed");
  if (input.originalityGate.status === "missing") blockers.push("originality_gate_missing");
  if (input.originalityGate.status === "unknown") blockers.push("originality_gate_unknown");
  if (isSameChannelOriginalityStrict(input.channel) && !input.originalityGate.sameChannelChecked) {
    blockers.push("same_channel_originality_not_checked");
  }
  if (isSameChannelOriginalityStrict(input.channel) && input.originalityGate.status !== "pass") {
    blockers.push("same_channel_originality_gate_preserved");
  }

  if (input.mediaGate.mediaRequired) {
    if (input.mediaGate.status !== "pass" || input.mediaGate.artifactIds.length === 0) {
      blockers.push("media_required_but_missing", "text_only_publish_forbidden");
    }
    if (!input.providerReadiness.supportsMedia) blockers.push("media_provider_upload_unavailable", "text_only_publish_forbidden");
  }
  if (input.mediaGate.status === "fail") blockers.push("media_gate_failed");
  if (input.mediaGate.status === "unknown") blockers.push("media_gate_unknown");

  if (!input.socialDiscipline.capabilityUsagePresent) blockers.push("capability_usage_missing");
  if (!input.socialDiscipline.growthMechanicsPresent) blockers.push("growth_mechanics_missing");
  if (!input.socialDiscipline.qualityGatePassed) blockers.push("quality_gate_failed");

  if (!input.providerReadiness.available || !input.providerReadiness.toolPath) blockers.push("provider_tool_path_unavailable");
  if (input.providerReadiness.blocker?.trim()) blockers.push(input.providerReadiness.blocker.trim());
  if (isOwnedRedditProfile(input) && (!input.providerReadiness.available || !input.providerReadiness.toolPath)) {
    blockers.push("reddit_owned_profile_tool_path_unavailable");
  }

  if (input.publication.attempted && !input.publication.succeeded) blockers.push("provider_publication_failed");
  if (input.publication.succeeded && !input.publication.postUrl) blockers.push("published_status_requires_post_url");

  return [...unique(blockers)].sort();
}

function statusFor(input: CmoChannelDecisionInput, blockers: readonly string[]): CmoChannelStatus {
  const cooldownBlockers = new Set(["channel_cooldown_active", "fresh_call_sentinel_cooldown"]);
  if (blockers.some((blocker) => cooldownBlockers.has(blocker))) return "cooldown";
  if (blockers.length > 0) return "blocked";
  if (input.evaluateOnly) return "evaluated";
  if (input.publication.succeeded && input.publication.postUrl) return "published";
  return "ready_to_publish";
}

export function decideCmoChannelStatus(input: CmoChannelDecisionInput): CmoChannelDecisionResult {
  const blockers = collectBlockers(input);
  const status = statusFor(input, blockers);
  const publishAllowed = status === "ready_to_publish" || status === "published";
  const providerCallAllowed = status === "ready_to_publish";
  const redditGapExplicit = isOwnedRedditProfile(input) && blockers.includes("reddit_owned_profile_tool_path_unavailable");

  return {
    schema_version: "callscore_cmo_channel_decision.v1",
    channel: input.channel,
    surface: input.surface,
    created_at: input.createdAt,
    status,
    publish_allowed: publishAllowed,
    provider_call_allowed: providerCallAllowed,
    post_url: status === "published" ? input.publication.postUrl : null,
    next_wake_at: status === "cooldown" ? input.cooldown.waitUntil ?? input.channelHeadDecision.wait_until ?? input.channelHeadDecision.next_wake_at : null,
    blockers,
    consumed: {
      channel_head_decision_id: input.channelHeadDecision.decision_id,
      channel_head_decision: input.channelHeadDecision.decision,
      channel_head_action_type: proposedActionType(input.channelHeadDecision),
      trust_decision_id: input.trustDecision.decision_id,
      trust_decision: input.trustDecision.decision,
      fresh_call_sentinel_receipt_id: input.freshCallSentinelReceipt.receipt_id,
      fresh_call_sentinel_mode: input.freshCallSentinelReceipt.mode,
      cooldown_evidence_hash: input.cooldown.evidenceHash,
      originality_evidence_hash: input.originalityGate.evidenceHash,
      media_evidence_hash: input.mediaGate.evidenceHash,
    },
    safety: {
      text_only_publish_forbidden: input.mediaGate.mediaRequired,
      capability_usage_required: true,
      no_provider_call_without_green_gates: true,
      reddit_owned_profile_gap_explicit: redditGapExplicit,
    },
  };
}
