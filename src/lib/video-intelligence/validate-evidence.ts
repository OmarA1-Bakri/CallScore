import type { EvidenceValidationIssue, EvidenceValidationReport, NormalizedCall, TranscriptSegment } from "./types";

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
    if (call.status === "accepted_call" && call.confidence < 0.7) {
      issues.push({ code: "accepted_low_confidence", callId: call.id, segmentId: call.evidenceSegmentId, message: "Accepted call confidence is below threshold" });
    }
    if (call.status === "accepted_call" && !call.marketSymbol) {
      issues.push({ code: "accepted_unsupported_market", callId: call.id, segmentId: call.evidenceSegmentId, message: "Accepted call lacks supported market symbol" });
    }
  }

  const requiresApproval = normalizedCalls.some((call) => call.requiresApproval) || issues.length > 0;
  return {
    valid: issues.length === 0,
    requiresApproval,
    acceptedCallCount,
    issues,
    metadata: {
      normalized_call_count: normalizedCalls.length,
      accepted_call_count: acceptedCallCount,
      issue_count: issues.length,
    },
  };
}
