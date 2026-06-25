import type { ChannelHeadDecisionContext } from "./channel-head-context";
import { classifyChannelHeadRisk } from "./risk-classifier";

export interface GateResult {
  readonly decision: "wait" | "suppress" | "request_gate" | "escalate_non_founder_review";
  readonly reason_codes: readonly string[];
  readonly gate_required?: string | null;
  readonly wait_until?: string | null;
  readonly suppress_until?: string | null;
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}

// ── Individual gate functions ──

/** Gate 1: Kill switch, heartbeat lease, agent pause — return wait if any active. */
export function checkKillSwitchAndHeartbeat(ctx: ChannelHeadDecisionContext): GateResult | null {
  if (ctx.killSwitch.global_active) return { decision: "wait", reason_codes: ["global_kill_switch_active"], wait_until: addMinutes(ctx.now, 15) };
  if (ctx.killSwitch.channel_active) return { decision: "wait", reason_codes: ["channel_kill_switch_active"], wait_until: addMinutes(ctx.now, 15) };
  if (ctx.killSwitch.agent_paused) return { decision: "wait", reason_codes: ["agent_paused"], wait_until: addMinutes(ctx.now, 15) };
  if (!ctx.heartbeat.heartbeat_id) return { decision: "wait", reason_codes: ["heartbeat_missing"], wait_until: addMinutes(ctx.now, 15) };
  if (!ctx.heartbeat.fresh) return { decision: "wait", reason_codes: ["heartbeat_stale"], wait_until: addMinutes(ctx.now, 15) };
  if (!ctx.heartbeat.lease_expires_at) return { decision: "wait", reason_codes: ["heartbeat_lease_missing"], wait_until: addMinutes(ctx.now, 15) };
  if (new Date(ctx.heartbeat.lease_expires_at).getTime() <= new Date(ctx.now).getTime()) return { decision: "wait", reason_codes: ["heartbeat_lease_expired"], wait_until: addMinutes(ctx.now, 15) };
  return null;
}

/** Gate 2: Public live-verify status — suppress if not passing. */
export function checkPublicVerify(ctx: ChannelHeadDecisionContext): GateResult | null {
  if (ctx.publicVerify.status === "fail") return { decision: "suppress", reason_codes: ["public_verify_failed"], suppress_until: addMinutes(ctx.now, 1440) };
  if (ctx.publicVerify.status === "unknown") return { decision: "suppress", reason_codes: ["public_verify_unknown"], suppress_until: addMinutes(ctx.now, 1440) };
  if (!ctx.publicVerify.checked_at) return { decision: "suppress", reason_codes: ["public_verify_missing_checked_at"], suppress_until: addMinutes(ctx.now, 1440) };
  return null;
}

/** Gate 3: Cooldown and Workplane status — wait if any are active. */
export function checkCooldownAndWorkplane(ctx: ChannelHeadDecisionContext): GateResult | null {
  const blockers: string[] = [];
  if (ctx.cooldown.channelCooldownActive) blockers.push("channel_cooldown_active");
  if (ctx.cooldown.providerErrorCooldownActive) blockers.push("provider_error_cooldown_active");
  if (ctx.cooldown.duplicatePayloadCooldownActive) blockers.push("duplicate_payload_cooldown_active");
  if (ctx.workplane.status === "BLOCKED") blockers.push("workplane_blocked");
  if (blockers.length > 0) return { decision: "wait", reason_codes: blockers, wait_until: ctx.cooldown.waitUntil ?? addMinutes(ctx.now, 60) };
  return null;
}

/** Gate 4: Risk class — restricted actions require explicit gate evidence. */
export function checkRiskClass(ctx: ChannelHeadDecisionContext): GateResult | null {
  const risk = classifyChannelHeadRisk(ctx);
  if (risk.action_risk === "restricted") return { decision: "request_gate", reason_codes: risk.reason_codes, gate_required: risk.gate_required };
  return null;
}

/** Gate 5: Owned-public boundary checks — registry, policy, action allow/forbid. */
export function checkOwnedPublicBoundaries(ctx: ChannelHeadDecisionContext): GateResult | null {
  if (ctx.targetActionType !== "publish_owned_public") return null;
  const reasons: string[] = [];
  if (ctx.gtmRegistryState.currentStatus !== "ready_public_owned") reasons.push("registry_not_ready");
  if (!ctx.gtmRegistryState.ownedOrManaged) reasons.push("not_owned_or_managed", "registry_not_owned_or_managed");
  if (!ctx.gtmRegistryState.zeroSpendRequired) reasons.push("non_zero_spend");
  if (!ctx.gtmRegistryState.allowedActions.includes(ctx.targetActionType)) reasons.push("action_not_allowed", "target_action_not_allowed");
  if (ctx.gtmRegistryState.forbiddenActions.includes(ctx.targetActionType)) reasons.push("action_forbidden", "target_action_forbidden");
  if (!ctx.channelPolicy.safeOwnedPublicAllowed) reasons.push("policy_disallows_safe_owned_public", "safe_owned_public_policy_disabled");
  if (reasons.length > 0) return { decision: "suppress", reason_codes: [...new Set(reasons)], suppress_until: addMinutes(ctx.now, 1440) };
  return null;
}

/** Gate 6: Evidence completeness and daily caps. */
export function checkEvidenceAndCaps(ctx: ChannelHeadDecisionContext): GateResult | null {
  const reasons: string[] = [];
  if (ctx.evidence.evidenceLevel === "E0" || !ctx.evidence.evidenceHash || ctx.evidence.sourceArtifactIds.length === 0) reasons.push("evidence_incomplete", "missing_evidence_hash");
  if (!ctx.channelPolicy.claimBearingAllowed) reasons.push("claim_bearing_not_allowed");
  if (!ctx.channelPolicy.publicClaimsSupported) reasons.push("public_claims_not_supported");
  if (ctx.caps.channelPostsToday >= ctx.caps.maxChannelPostsPerDay) reasons.push("channel_daily_cap_reached");
  if (ctx.caps.totalPostsToday >= ctx.caps.maxTotalPostsPerDay) reasons.push("global_daily_cap_reached");
  if (reasons.length > 0) return { decision: "suppress", reason_codes: [...new Set(reasons)], suppress_until: addMinutes(ctx.now, 1440) };
  return null;
}

/** Gate 7: Media gate and originality gate. */
export function checkMediaAndOriginality(ctx: ChannelHeadDecisionContext): GateResult | null {
  if (ctx.mediaGate.status === "missing") return { decision: "suppress", reason_codes: ["media_gate_missing"], suppress_until: addMinutes(ctx.now, 1440) };
  if (ctx.mediaGate.status === "fail") return { decision: "suppress", reason_codes: ["media_gate_failed"], suppress_until: addMinutes(ctx.now, 1440) };
  if (ctx.originalityGate.status === "fail") return { decision: "suppress", reason_codes: ["originality_gate_failed"], suppress_until: addMinutes(ctx.now, 1440) };
  if (ctx.originalityGate.status === "missing") return { decision: "suppress", reason_codes: ["originality_gate_missing"], suppress_until: addMinutes(ctx.now, 1440) };
  return null;
}

/** Gate 8: Quality score threshold — suppress if too low. */
export function checkQualityThreshold(ctx: ChannelHeadDecisionContext): GateResult | null {
  if (ctx.qualitySignal.status === "fail") return { decision: "suppress", reason_codes: ["quality_signal_failed", "quality_below_threshold"], suppress_until: addMinutes(ctx.now, 1440) };
  if (ctx.qualitySignal.score < 0.5) return { decision: "suppress", reason_codes: ["quality_below_threshold", "verifier_confidence_low"], suppress_until: addMinutes(ctx.now, 1440) };
  return null;
}

/** Gate 9: Ambiguous quality — escalate to non-founder review. */
export function checkReviewThreshold(ctx: ChannelHeadDecisionContext): GateResult | null {
  if (ctx.qualitySignal.status === "ambiguous") return { decision: "escalate_non_founder_review", reason_codes: ["quality_signal_ambiguous", "non_founder_review_required"] };
  if (ctx.qualitySignal.score < ctx.channelPolicy.requiresNonFounderReviewBelowConfidence) return { decision: "escalate_non_founder_review", reason_codes: ["confidence_below_review_threshold", "non_founder_review_required"] };
  return null;
}

/** The full gate chain, evaluated in priority order. Returns the first triggered gate or null. */
export function evaluateGates(ctx: ChannelHeadDecisionContext): GateResult | null {
  const gates = [
    checkKillSwitchAndHeartbeat,
    checkPublicVerify,
    checkCooldownAndWorkplane,
    checkRiskClass,
    checkOwnedPublicBoundaries,
    checkEvidenceAndCaps,
    checkMediaAndOriginality,
    checkQualityThreshold,
    checkReviewThreshold,
  ] as const;
  for (const gate of gates) {
    const result = gate(ctx);
    if (result) return result;
  }
  return null;
}
