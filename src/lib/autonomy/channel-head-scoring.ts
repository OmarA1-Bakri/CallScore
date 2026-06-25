import type { ChannelHeadDecisionContext } from "./channel-head-context";
import { classifyChannelHeadRisk } from "./risk-classifier";

export type ChannelHeadConfidenceBucket = "low" | "medium" | "high";

export interface ChannelHeadScoreDimension {
  readonly name: string;
  readonly score: number;
  readonly reason_codes: readonly string[];
}

export interface ChannelHeadCandidateScore {
  readonly total_score: number;
  readonly confidence_bucket: ChannelHeadConfidenceBucket;
  readonly dimensions: readonly ChannelHeadScoreDimension[];
  readonly reason_codes: readonly string[];
}

export const DIMENSION_NAMES = [
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

/**
 * Pure priority scoring — computes dimension scores and confidence.
 * Does NOT make gate decisions. Call evaluateGates() from decision-gates first.
 *
 * Each dimension produces a normalized [0,1] score and explanatory reason codes.
 * The total score is the arithmetic mean of all 10 dimensions.
 */
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
    dimension("novelty_originality", originalityReady ? 1 : 0, [originalityReady ? "originality_gate_passed" : "originality_gate_not_passed"]),
    dimension("media_readiness", mediaReady ? 1 : 0, [mediaReady ? "media_ready" : "media_not_ready"]),
    dimension("public_claim_risk", policyClear ? 1 : 0, [policyClear ? "public_claim_policy_clear" : "public_claim_policy_blocked"]),
    dimension("prior_performance_receipt_signal", receiptScore, [receiptScore > 0 ? "prior_receipts_present" : "prior_receipts_missing"]),
    dimension("verifier_confidence", qualityScore, [qualityScore >= 0.8 ? "verifier_confidence_high" : qualityScore >= 0.6 ? "verifier_confidence_medium" : "verifier_confidence_low"]),
    dimension("channel_fit", channelFit ? 1 : 0, [channelFit ? "channel_fit_clear" : "channel_fit_blocked"]),
    dimension("action_risk", risk.action_risk === "low" ? 1 : 0, risk.reason_codes),
  ];
  const totalScore = Number(average(dimensions.map((d) => d.score)).toFixed(4));
  const reasonCodes = [...new Set(dimensions.flatMap((d) => d.reason_codes))];

  return {
    total_score: totalScore,
    confidence_bucket: confidenceBucket(totalScore),
    dimensions,
    reason_codes: [...reasonCodes, "score_computed"],
  };
}
