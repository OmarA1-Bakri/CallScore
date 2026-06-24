import assert from "node:assert/strict";
import test from "node:test";
import { classifyMlVerifierLabel } from "../src/lib/ml-verifier-label-policy";

test("approve + valid_call + evidence becomes positive and promotion-eligible", () => {
  const result = classifyMlVerifierLabel({ decision: "approve", reason_code: "valid_call", confidence: 0.91, recommended_extraction_confidence: 0.82, evidence_span: "I am buying BTC" });
  assert.equal(result.training_label, "positive");
  assert.equal(result.promotion_eligible, true);
  assert.equal(result.use_as_positive_truth, true);
});

test("approve + non-valid reason is an anomaly and excluded", () => {
  const result = classifyMlVerifierLabel({ decision: "approve", reason_code: "asset_not_supported", confidence: 0.99, recommended_extraction_confidence: 0.99, evidence_span: "some span" });
  assert.equal(result.training_label, "anomaly");
  assert.equal(result.promotion_eligible, false);
  assert.equal(result.use_as_positive_truth, false);
});

test("reject + terminal reason becomes negative training signal", () => {
  const result = classifyMlVerifierLabel({ decision: "reject", reason_code: "generic_word", confidence: 0.95, evidence_span: "generic link" });
  assert.equal(result.training_label, "negative");
  assert.equal(result.use_as_negative_truth, true);
});

test("timeouts and malformed outputs are excluded, not negatives", () => {
  for (const reason_code of ["model_timeout", "malformed_model_output", "model_provider_error"]) {
    const result = classifyMlVerifierLabel({ decision: "review", reason_code, confidence: 0, evidence_span: "" });
    assert.equal(result.training_label, "exclude");
    assert.equal(result.use_as_negative_truth, false);
  }
});
