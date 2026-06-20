import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMlVerifierQualityGateReceipt,
  countCapturedVerifierReasons,
  parseMlVerifierQualityGateArgs,
} from "../src/scripts/ml-verifier-quality-gate";
import type { MlVerifierMetrics } from "../src/lib/ml-verifier";

const baseMetrics: MlVerifierMetrics = {
  selected: 20,
  processed: 20,
  approved: 12,
  rejected: 5,
  review: 3,
  publish_ready: 12,
  suppressed: 6,
  non_founder_review: 2,
  founder_review_required: 0,
  prompt_version: "ml-verifier-v1",
  provider: "ollama",
  model: "qwen2.5:3b",
  audit_only: true,
};

test("quality gate passes only bounded audit-only verifier runs with enough clean outputs", () => {
  const receipt = buildMlVerifierQualityGateReceipt({
    runId: "quality-gate-test",
    metrics: baseMetrics,
    reasonCodeCounts: { valid_call: 12, quote_not_in_transcript: 5, unclear: 3 },
    sampleSize: 20,
    minSampleSize: 20,
    minimumAgreementRate: 0.9,
    maxModelFailureRate: 0.1,
    receiptPath: ".tmp/workflow-receipts/ml_verifier_quality_gate/test.json",
    createdAt: "2026-06-20T12:00:00.000Z",
  });

  assert.equal(receipt.workflow_name, "ml_verifier_quality_gate");
  assert.equal(receipt.result, "passed");
  assert.equal(receipt.audit_only, true);
  assert.equal(receipt.eligible_for_activation, true);
  assert.equal(receipt.public_ranking_impact_allowed, false);
  assert.equal(receipt.production_mutation_performed, false);
  assert.equal(receipt.agreement_rate, 1);
  assert.deepEqual(receipt.blockers, []);
});

test("quality gate defers verifier activation on provider failure or insufficient sample", () => {
  const receipt = buildMlVerifierQualityGateReceipt({
    runId: "quality-gate-test",
    metrics: { ...baseMetrics, selected: 10, processed: 10, review: 10, approved: 0, rejected: 0, publish_ready: 0, suppressed: 10 },
    reasonCodeCounts: { model_provider_error: 3, model_timeout: 1, unclear: 6 },
    sampleSize: 10,
    minSampleSize: 20,
    minimumAgreementRate: 0.9,
    maxModelFailureRate: 0.1,
    receiptPath: ".tmp/workflow-receipts/ml_verifier_quality_gate/test.json",
    createdAt: "2026-06-20T12:00:00.000Z",
  });

  assert.equal(receipt.result, "deferred");
  assert.equal(receipt.eligible_for_activation, false);
  assert.equal(receipt.agreement_rate, 0.6);
  assert.equal(receipt.model_failure_rate, 0.4);
  assert.ok(receipt.blockers.includes("sample_size_below_minimum"));
  assert.ok(receipt.blockers.includes("agreement_rate_below_threshold"));
  assert.ok(receipt.blockers.includes("model_failure_rate_above_threshold"));
  assert.equal(receipt.production_mutation_performed, false);
});

test("quality gate argument parser clamps unsafe broad sample sizes", () => {
  assert.deepEqual(parseMlVerifierQualityGateArgs(["--sample-size", "25", "--min-sample-size", "20"]), {
    sampleSize: 25,
    minSampleSize: 20,
    minimumAgreementRate: 0.9,
    maxModelFailureRate: 0.1,
    workerId: "ml-verifier-quality-gate",
  });
  assert.throws(() => parseMlVerifierQualityGateArgs(["--sample-size", "0"]), /sample-size must be/);
  assert.throws(() => parseMlVerifierQualityGateArgs(["--sample-size", "51"]), /sample-size must be/);
});

test("quality gate reason counter captures ml_verification_runs insert params", () => {
  const counter = countCapturedVerifierReasons();
  counter.observeSql(
    "INSERT INTO ml_verification_runs (run_id, job_id, call_id, video_id, creator_id, provider, model, prompt_version, candidate_bucket, decision, reason_code)",
    [null, 1, 2, 3, 4, "ollama", "model", "prompt", "bucket", "review", "model_timeout"],
  );
  counter.observeSql("SELECT 1", []);

  assert.deepEqual(counter.reasonCodeCounts(), { model_timeout: 1 });
  assert.deepEqual(counter.decisionCounts(), { review: 1 });
});
