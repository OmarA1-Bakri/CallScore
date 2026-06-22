import { createHash } from "node:crypto";
import type { RiskClass, TrustDecision } from "../autonomy/contracts";

export type TrustDecisionValue = "publish" | "suppress" | "review";
export type TrustEntityType = "call" | "video" | "creator" | "leaderboard" | "profile" | "report" | "badge" | "seo_page" | "outreach_draft";
export type TrustSource = "video_intelligence_workflow" | "ml_verifier" | "ml_verifier_quality_gate" | "manual_import" | "public_claim_linter";
export type TrustReviewerQueue = "non_founder_trust_review" | null;
export type { TrustDecision } from "../autonomy/contracts";

export interface TrustDecisionInput {
  readonly entity_type: TrustEntityType;
  readonly entity_id: string | number;
  readonly confidence: number;
  readonly evidence_refs: readonly string[];
  readonly transcript_available: boolean;
  readonly evidence_supported: boolean;
  readonly public_claim_supported: boolean;
  readonly supported_market: boolean;
  readonly creator_owned: boolean;
  readonly audit_only: boolean;
  readonly source: TrustSource;
  readonly named_negative_creator_claim?: boolean;
  readonly investment_advice?: boolean;
  readonly unsupported_performance_claim?: boolean;
  readonly legal_or_compliance_claim?: boolean;
  readonly promotion_gate?: {
    readonly gate_type: "NON_FOUNDER_TRUST_REVIEW" | "PUBLISH_GATE" | "PRODUCTION_GATE";
    readonly receipt_id: string;
  } | null;
  readonly now?: string;
}

const PUBLISH_CONFIDENCE_THRESHOLD = 0.78;
const REVIEW_CONFIDENCE_FLOOR = 0.6;

type EvidenceLevel = "E0" | "E1" | "E2" | "E3" | "E4" | "E5";

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.min(1, Math.max(0, value)).toFixed(2));
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort();
}

function evidenceHash(evidenceRefs: readonly string[]): string | null {
  if (evidenceRefs.length === 0) return null;
  return `sha256:${createHash("sha256").update(JSON.stringify(evidenceRefs)).digest("hex")}`;
}

function evidenceLevel(input: TrustDecisionInput, evidenceRefs: readonly string[]): EvidenceLevel {
  if (evidenceRefs.length === 0) return "E0";
  if (!input.transcript_available || !input.evidence_supported) return "E1";
  if (input.source === "ml_verifier_quality_gate") return "E3";
  return "E2";
}

function riskClass(input: TrustDecisionInput): RiskClass {
  if (
    !input.public_claim_supported ||
    input.named_negative_creator_claim === true ||
    input.investment_advice === true ||
    input.unsupported_performance_claim === true ||
    input.legal_or_compliance_claim === true
  ) {
    return "public_claim_risk";
  }
  return "safe_owned_public";
}

function decisionId(input: TrustDecisionInput, reasonCodes: readonly string[]): string {
  const hash = createHash("sha256")
    .update(JSON.stringify({
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      confidence: clampConfidence(input.confidence),
      evidence_refs: unique(input.evidence_refs),
      source: input.source,
      reason_codes: reasonCodes,
    }))
    .digest("hex")
    .slice(0, 24);
  return `trust_${hash}`;
}

function hardSuppressReasonCodes(input: TrustDecisionInput): string[] {
  const reasons: string[] = [];
  if (!input.transcript_available) reasons.push("missing_transcript");
  if (input.evidence_refs.length === 0) reasons.push("missing_evidence_refs");
  if (!input.evidence_supported) reasons.push("unsupported_or_missing_evidence");
  if (!input.public_claim_supported) reasons.push("unsupported_public_claim");
  if (!input.supported_market) reasons.push("unsupported_market");
  if (!input.creator_owned) reasons.push("not_creator_owned");
  if (input.named_negative_creator_claim === true) reasons.push("named_negative_creator_claim");
  if (input.investment_advice === true) reasons.push("investment_advice");
  if (input.unsupported_performance_claim === true) reasons.push("unsupported_performance_claim");
  if (input.legal_or_compliance_claim === true) reasons.push("legal_or_compliance_claim");
  return reasons;
}

function hasPromotionGate(input: TrustDecisionInput): boolean {
  return Boolean(input.promotion_gate?.receipt_id.trim());
}

export function decideTrust(input: TrustDecisionInput): TrustDecision {
  const confidence = clampConfidence(input.confidence);
  const sourceArtifactIds = unique(input.evidence_refs);
  const reasons = hardSuppressReasonCodes(input);
  let decision: TrustDecisionValue;

  if (reasons.length > 0) {
    decision = "suppress";
  } else if (confidence < REVIEW_CONFIDENCE_FLOOR) {
    decision = "suppress";
    reasons.push("low_confidence");
  } else if (confidence < PUBLISH_CONFIDENCE_THRESHOLD) {
    decision = "review";
    reasons.push("medium_confidence_non_founder_review");
  } else {
    decision = "publish";
    reasons.push("high_confidence_supported_creator_owned_call");
  }

  const auditOnlyBlocked = input.audit_only && decision === "publish" && !hasPromotionGate(input);
  if (auditOnlyBlocked) {
    decision = "review";
    reasons.push("audit_only_public_impact_blocked");
  }
  if (input.audit_only && decision === "publish" && hasPromotionGate(input)) reasons.push("promotion_gate_evidence_present");

  const reasonCodes = unique(reasons);
  const nonFounderReviewRequired = decision === "review";
  const publicVisibilityAllowed = decision === "publish";
  const suppressFromPublicScoring = decision !== "publish";

  return {
    schema_version: "callscore_trust_decision.v1",
    decision_id: decisionId(input, reasonCodes),
    created_at: input.now ?? new Date().toISOString(),
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    risk_class: riskClass(input),
    decision,
    confidence,
    evidence_level: evidenceLevel(input, sourceArtifactIds),
    evidence_hash: evidenceHash(sourceArtifactIds),
    gate_receipt_id: input.promotion_gate?.receipt_id ?? null,
    suppress_from_public_scoring: suppressFromPublicScoring,
    public_visibility_allowed: publicVisibilityAllowed,
    non_founder_review_required: nonFounderReviewRequired,
    founder_review_required: false,
    reason_codes: reasonCodes,
    reviewer_role: nonFounderReviewRequired ? "trust_ops_reviewer" : "none",
    expires_at: null,
    source_artifact_ids: sourceArtifactIds,
  };
}
