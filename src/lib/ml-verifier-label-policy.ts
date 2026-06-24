export type MlVerifierTrainingLabel = "positive" | "negative" | "exclude" | "anomaly";

export interface MlVerifierLabelInput {
  readonly decision: string | null;
  readonly reason_code: string | null;
  readonly confidence: number | string | null;
  readonly evidence_span?: string | null;
  readonly recommended_extraction_confidence?: number | string | null;
}

export interface MlVerifierLabelPolicyResult {
  readonly training_label: MlVerifierTrainingLabel;
  readonly promotion_eligible: boolean;
  readonly use_as_positive_truth: boolean;
  readonly use_as_negative_truth: boolean;
  readonly reason: string;
}

const TERMINAL_NEGATIVE_REASONS = new Set([
  "generic_word",
  "asset_not_supported",
  "direction_not_supported",
  "non_actionable",
  "quote_not_in_transcript",
  "missing_evidence",
]);

const EXCLUDED_REASONS = new Set([
  "model_timeout",
  "malformed_model_output",
  "model_provider_error",
  "unclear",
]);

function asNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function hasEvidence(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function classifyMlVerifierLabel(input: MlVerifierLabelInput): MlVerifierLabelPolicyResult {
  const decision = String(input.decision ?? "").trim();
  const reason = String(input.reason_code ?? "").trim();
  const confidence = asNumber(input.confidence);
  const recommended = asNumber(input.recommended_extraction_confidence ?? input.confidence);
  const evidence = hasEvidence(input.evidence_span);

  if (decision === "approve" && reason === "valid_call" && confidence >= 0.85 && recommended >= 0.7 && evidence) {
    return { training_label: "positive", promotion_eligible: true, use_as_positive_truth: true, use_as_negative_truth: false, reason: "approved_valid_call_with_evidence" };
  }

  if (decision === "approve" && reason !== "valid_call") {
    return { training_label: "anomaly", promotion_eligible: false, use_as_positive_truth: false, use_as_negative_truth: false, reason: "approved_non_valid_reason" };
  }

  if (decision === "reject" && TERMINAL_NEGATIVE_REASONS.has(reason)) {
    return { training_label: "negative", promotion_eligible: false, use_as_positive_truth: false, use_as_negative_truth: true, reason: "terminal_negative_reject" };
  }

  if (decision === "review" || EXCLUDED_REASONS.has(reason)) {
    return { training_label: "exclude", promotion_eligible: false, use_as_positive_truth: false, use_as_negative_truth: false, reason: "review_or_operational_failure" };
  }

  return { training_label: "exclude", promotion_eligible: false, use_as_positive_truth: false, use_as_negative_truth: false, reason: "insufficient_for_training" };
}
