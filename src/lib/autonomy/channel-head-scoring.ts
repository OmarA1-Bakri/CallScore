import type { ChannelHeadDecisionContext } from "./channel-head-context";
import { classifyChannelHeadRisk } from "./risk-classifier";

export type ChannelHeadScoreDecision = "act" | "suppress" | "review" | "request_gate" | "wait";
export type ChannelHeadConfidenceBucket = "low" | "medium" | "high";

export interface ChannelHeadScoreDimension {
  readonly name: string;
  readonly score: number;
  readonly reason_codes: readonly string[];
}

export interface ChannelHeadCandidateScore {
  readonly decision: ChannelHeadScoreDecision;
  readonly confidence_bucket: ChannelHeadConfidenceBucket;
  readonly total_score: number;
  readonly dimensions: readonly ChannelHeadScoreDimension[];
  readonly gate_required: ReturnType<typeof classifyChannelHeadRisk>["gate_required"];
  readonly reason_codes: readonly string[];
}

const DIMENSION_NAMES = [
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
] as const;

function dimension(name: (typeof DIMENSION_NAMES)[number], score: number, reason_codes: readonly string[]): ChannelHeadScoreDimension {
  return { name, score: Math.max(0, Math.min(1, score)), reason_codes };
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function confidenceBucket(totalScore: number): ChannelHeadConfidenceBucket {
  if (totalScore >= 0.85) return "high";
  if (totalScore >= 0.6) return "medium";
  return "low";
}

function unsafeOwnedPublicReasonCodes(context: ChannelHeadDecisionContext): string[] {
  const reasons: string[] = [];
  if (context.targetActionType === "publish_owned_public" && context.gtmRegistryState.currentStatus.toLowerCase() !== "ready_public_owned") reasons.push("registry_not_ready");
  if (!context.channelPolicy.safeOwnedPublicAllowed) reasons.push("policy_disallows_safe_owned_public", "safe_owned_public_policy_disabled");
  if (!context.gtmRegistryState.ownedOrManaged) reasons.push("not_owned_or_managed", "registry_not_owned_or_managed");
  if (!context.gtmRegistryState.zeroSpendRequired) reasons.push("non_zero_spend");
  if (!context.gtmRegistryState.allowedActions.includes(context.targetActionType)) reasons.push("action_not_allowed", "target_action_not_allowed");
  if (context.gtmRegistryState.forbiddenActions.includes(context.targetActionType)) reasons.push("action_forbidden", "target_action_forbidden");
  if (context.evidence.evidenceLevel === "E0" || !context.evidence.evidenceHash || context.evidence.sourceArtifactIds.length === 0) reasons.push("missing_evidence_hash", "evidence_incomplete");
  if (context.caps.channelPostsToday >= context.caps.maxChannelPostsPerDay) reasons.push("channel_daily_cap_reached");
  if (context.caps.totalPostsToday >= context.caps.maxTotalPostsPerDay) reasons.push("global_daily_cap_reached");
  if (context.mediaGate.status === "missing") reasons.push("media_gate_missing");
  if (context.mediaGate.status === "fail") reasons.push("media_gate_failed");
  if (context.originalityGate.status === "missing") reasons.push("originality_gate_missing");
  if (context.originalityGate.status === "fail") reasons.push("originality_gate_failed");
  return reasons;
}

export function scoreChannelHeadCandidate(context: ChannelHeadDecisionContext): ChannelHeadCandidateScore {
  const risk = classifyChannelHeadRisk(context);
  const cooldownClear = !context.cooldown.channelCooldownActive && !context.cooldown.providerErrorCooldownActive && !context.cooldown.duplicatePayloadCooldownActive;
  const evidenceComplete = context.evidence.evidenceLevel !== "E0" && Boolean(context.evidence.evidenceHash) && context.evidence.sourceArtifactIds.length > 0;
  const mediaReady = context.mediaGate.status === "pass" && context.mediaGate.artifactIds.length > 0;
  const originalityReady = context.originalityGate.status === "pass";
  const policyClear = context.channelPolicy.publicClaimsSupported && context.channelPolicy.claimBearingAllowed;
  const channelFit = context.gtmRegistryState.currentStatus === "ready_public_owned" && context.gtmRegistryState.ownedOrManaged && context.gtmRegistryState.zeroSpendRequired && context.gtmRegistryState.allowedActions.includes(context.targetActionType) && !context.gtmRegistryState.forbiddenActions.includes(context.targetActionType) && context.channelPolicy.safeOwnedPublicAllowed;
  const qualityScore = context.qualitySignal.status === "fail" ? 0 : context.qualitySignal.score;
  const receiptScore = Math.min(1, context.recentReceipts.length / 2);

  const dimensions = [
    dimension("freshness", context.workplane.status === "OK" ? 1 : 0.4, [context.workplane.status === "OK" ? "workplane_ok" : "workplane_not_ok"]),
    dimension("evidence_completeness", evidenceComplete ? 1 : 0, [evidenceComplete ? "evidence_complete" : "evidence_incomplete"]),
    dimension("cooldown_clearance", cooldownClear ? 1 : 0, [cooldownClear ? "cooldown_clear" : "cooldown_active"]),
    dimension("novelty_originality", originalityReady ? 1 : 0, [originalityReady ? "originality_gate_passed" : context.originalityGate.status === "fail" ? "originality_gate_failed" : context.originalityGate.status === "missing" ? "originality_gate_missing" : "originality_gate_unknown"]),
    dimension("media_readiness", mediaReady ? 1 : 0, [mediaReady ? "media_ready" : context.mediaGate.status === "missing" ? "media_gate_missing" : context.mediaGate.status === "fail" ? "media_gate_failed" : "media_gate_unknown"]),
    dimension("public_claim_risk", policyClear ? 1 : 0, [policyClear ? "public_claim_policy_clear" : !context.channelPolicy.claimBearingAllowed ? "claim_bearing_not_allowed" : "public_claims_not_supported"]),
    dimension("prior_performance_receipt_signal", receiptScore, [receiptScore > 0 ? "prior_receipts_present" : "prior_receipts_missing"]),
    dimension("verifier_confidence", qualityScore, [qualityScore >= 0.8 ? "verifier_confidence_high" : qualityScore >= 0.6 ? "verifier_confidence_medium" : "verifier_confidence_low"]),
    dimension("channel_fit", channelFit ? 1 : 0, [channelFit ? "channel_fit_clear" : "channel_fit_blocked"]),
    dimension("action_risk", risk.action_risk === "low" ? 1 : 0, risk.reason_codes),
  ];
  const totalScore = Number(average(dimensions.map((item) => item.score)).toFixed(4));
  const reasonCodes = [...new Set(dimensions.flatMap((item) => item.reason_codes))];
  const unsafeReasons = unsafeOwnedPublicReasonCodes(context);

  if (!cooldownClear || context.workplane.status === "BLOCKED") {
    return {
      decision: "wait",
      confidence_bucket: confidenceBucket(totalScore),
      total_score: totalScore,
      dimensions,
      gate_required: null,
      reason_codes: [...new Set([
        ...reasonCodes,
        ...(context.cooldown.channelCooldownActive ? ["channel_cooldown_active"] : []),
        ...(context.cooldown.providerErrorCooldownActive ? ["provider_error_cooldown_active"] : []),
        ...(context.cooldown.duplicatePayloadCooldownActive ? ["duplicate_payload_cooldown_active"] : []),
        ...(context.workplane.status === "BLOCKED" ? ["workplane_blocked"] : []),
      ])],
    };
  }

  if (risk.action_risk === "restricted") {
    return {
      decision: "request_gate",
      confidence_bucket: confidenceBucket(totalScore),
      total_score: totalScore,
      dimensions,
      gate_required: risk.gate_required,
      reason_codes: [...reasonCodes, ...risk.reason_codes],
    };
  }

  if (unsafeReasons.length > 0) {
    return {
      decision: "suppress",
      confidence_bucket: confidenceBucket(totalScore),
      total_score: totalScore,
      dimensions,
      gate_required: null,
      reason_codes: [...reasonCodes, ...unsafeReasons],
    };
  }

  if (reasonCodes.some((code) => [
    "media_gate_missing",
    "media_gate_failed",
    "originality_gate_failed",
    "originality_gate_missing",
    "claim_bearing_not_allowed",
    "public_claims_not_supported",
  ].includes(code))) {
    return {
      decision: "suppress",
      confidence_bucket: confidenceBucket(totalScore),
      total_score: totalScore,
      dimensions,
      gate_required: null,
      reason_codes: [...reasonCodes, "fail_closed_suppression"],
    };
  }

  if (qualityScore < 0.6) {
    return {
      decision: "suppress",
      confidence_bucket: "low",
      total_score: totalScore,
      dimensions,
      gate_required: null,
      reason_codes: [...reasonCodes, "verifier_confidence_low", ...(context.qualitySignal.status === "fail" ? ["quality_signal_failed"] : [])],
    };
  }

  if (context.qualitySignal.status === "ambiguous" || qualityScore < context.channelPolicy.requiresNonFounderReviewBelowConfidence) {
    return {
      decision: "review",
      confidence_bucket: "medium",
      total_score: totalScore,
      dimensions,
      gate_required: null,
      reason_codes: [...reasonCodes, "quality_signal_ambiguous", "non_founder_review_required"],
    };
  }

  return {
    decision: "act",
    confidence_bucket: confidenceBucket(totalScore),
    total_score: totalScore,
    dimensions,
    gate_required: null,
    reason_codes: [...reasonCodes, "score_high_confidence_low_risk"],
  };
}
