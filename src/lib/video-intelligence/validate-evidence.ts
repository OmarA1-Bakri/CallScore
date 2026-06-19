import type { EvidenceValidationIssue, EvidenceValidationReport, NormalizedCall, PublicationDecision, TranscriptSegment } from "./types";

const PUBLICATION_CONFIDENCE_THRESHOLD = 0.78;
const NON_FOUNDER_REVIEW_CONFIDENCE_FLOOR = 0.6;

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function rejectionReasonCodes(calls: readonly NormalizedCall[]): readonly string[] {
  return unique(calls.map((call) => call.rejectionReason ?? call.status));
}

function decidePublication(input: {
  readonly normalizedCalls: readonly NormalizedCall[];
  readonly issues: readonly EvidenceValidationIssue[];
  readonly acceptedCallCount: number;
}): PublicationDecision {
  const acceptedCalls = input.normalizedCalls.filter((call) => call.status === "accepted_call");
  const issueCodes = unique(input.issues.map((issue) => issue.code));
  const hardIssueCodes = issueCodes.filter((code) => code !== "accepted_low_confidence");
  const reasonCodes = unique([...issueCodes, ...rejectionReasonCodes(input.normalizedCalls)]);
  const minAcceptedConfidence = acceptedCalls.reduce(
    (min, call) => Math.min(min, call.confidence),
    acceptedCalls.length > 0 ? 1 : 0,
  );

  if (input.acceptedCallCount === 0) {
    return {
      decision: "suppress",
      confidence: 0.95,
      suppression_required: true,
      non_founder_review_required: false,
      reason_codes: reasonCodes.length > 0 ? reasonCodes : ["no_accepted_creator_owned_call"],
      summary: "No creator-owned accepted call met the minimum evidence requirements; suppress without founder involvement.",
    };
  }

  if (hardIssueCodes.length > 0) {
    return {
      decision: "suppress",
      confidence: 0.9,
      suppression_required: true,
      non_founder_review_required: false,
      reason_codes: unique([...hardIssueCodes, ...reasonCodes]),
      summary: "Accepted call has a hard evidence or market-support issue; suppress until data is repaired.",
    };
  }

  if (minAcceptedConfidence < PUBLICATION_CONFIDENCE_THRESHOLD) {
    const reviewable = minAcceptedConfidence >= NON_FOUNDER_REVIEW_CONFIDENCE_FLOOR;
    return {
      decision: reviewable ? "review" : "suppress",
      confidence: Number(minAcceptedConfidence.toFixed(2)),
      suppression_required: !reviewable,
      non_founder_review_required: reviewable,
      reason_codes: unique(["medium_confidence_accepted_call", ...reasonCodes]),
      summary: reviewable
        ? "Accepted call is evidence-backed but below public-autopublish confidence; route to non-founder trust review."
        : "Accepted call is below minimum confidence; suppress automatically.",
    };
  }

  return {
    decision: "publish",
    confidence: Number(minAcceptedConfidence.toFixed(2)),
    suppression_required: false,
    non_founder_review_required: false,
    reason_codes: ["high_confidence_creator_owned_call"],
    summary: "High-confidence creator-owned call has supported evidence and can proceed to downstream scoring/publication gates.",
  };
}

export function validateEvidence(
  normalizedCalls: readonly NormalizedCall[],
  segments: readonly TranscriptSegment[],
): EvidenceValidationReport {
  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  const issues: EvidenceValidationIssue[] = [];
  let acceptedCallCount = 0;

  for (const call of normalizedCalls) {
    const segment = byId.get(call.evidenceSegmentId);
    if (!segment) {
      issues.push({ code: "missing_evidence_segment", callId: call.id, segmentId: call.evidenceSegmentId, message: "Evidence segment does not exist" });
      continue;
    }
    if (!segment.text.includes(call.evidenceQuote)) {
      issues.push({ code: "quote_not_in_segment", callId: call.id, segmentId: call.evidenceSegmentId, message: "Evidence quote is not contained in the segment" });
    }
    if (call.status === "accepted_call") acceptedCallCount += 1;
    if (call.status === "accepted_call" && call.confidence < PUBLICATION_CONFIDENCE_THRESHOLD) {
      issues.push({ code: "accepted_low_confidence", callId: call.id, segmentId: call.evidenceSegmentId, message: "Accepted call confidence is below public autopublish threshold" });
    }
    if (call.status === "accepted_call" && !call.marketSymbol) {
      issues.push({ code: "accepted_unsupported_market", callId: call.id, segmentId: call.evidenceSegmentId, message: "Accepted call lacks supported market symbol" });
    }
  }

  const publicationDecision = decidePublication({ normalizedCalls, issues, acceptedCallCount });
  const requiresApproval = publicationDecision.non_founder_review_required;
  return {
    valid: publicationDecision.decision === "publish",
    requiresApproval,
    acceptedCallCount,
    publicationDecision,
    issues,
    metadata: {
      normalized_call_count: normalizedCalls.length,
      accepted_call_count: acceptedCallCount,
      issue_count: issues.length,
      publication_decision: publicationDecision.decision,
      suppression_required: publicationDecision.suppression_required,
      non_founder_review_required: publicationDecision.non_founder_review_required,
    },
  };
}
