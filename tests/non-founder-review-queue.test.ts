import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NonFounderReviewItemSchema } from "../src/lib/autonomy/contracts";
import { decideTrust, type TrustDecisionInput } from "../src/lib/trust/trust-decision-engine";
import {
  createNonFounderReviewItem,
  readNonFounderReviewQueue,
  resolveNonFounderReviewItem,
  writeNonFounderReviewItem,
} from "../src/lib/trust/non-founder-review-queue";

const baseInput: TrustDecisionInput = {
  entity_type: "call",
  entity_id: "call-ambiguous-1",
  confidence: 0.66,
  evidence_refs: ["artifact:transcript-segment-1", "artifact:normalized-call-1"],
  transcript_available: true,
  evidence_supported: true,
  public_claim_supported: true,
  supported_market: true,
  creator_owned: true,
  audit_only: false,
  source: "video_intelligence_workflow",
  now: "2026-06-21T12:00:00.000Z",
};

function reviewDecision() {
  const decision = decideTrust(baseInput);
  assert.equal(decision.decision, "review");
  return decision;
}

test("createNonFounderReviewItem captures evidence, reason, risk, recommendation, source run, and reconsideration window", () => {
  const decision = reviewDecision();

  const item = createNonFounderReviewItem(decision, {
    review_item_id: "review-ambiguous-call-1",
    now: "2026-06-21T12:01:00.000Z",
    due_at: "2026-06-22T12:00:00.000Z",
    expires_at: "2026-06-28T12:00:00.000Z",
    reconsider_after: "2026-06-22T12:00:00.000Z",
    risk_class: "public_claim_risk",
    recommended_action: "request_more_evidence",
    source_workflow: "video_intelligence_workflow",
    source_workflow_run_id: "workflow-run-1",
    source_run_id: "pipeline-run-1",
    evidence: [
      {
        artifact_id: "artifact:transcript-segment-1",
        evidence_type: "workflow_artifact",
        uri: "workflow://workflow-run-1/artifacts/artifact:transcript-segment-1",
        summary: "Transcript segment supports the ambiguous BTC call.",
      },
      {
        artifact_id: "artifact:normalized-call-1",
        evidence_type: "workflow_artifact",
        uri: "workflow://workflow-run-1/artifacts/artifact:normalized-call-1",
        summary: "Normalized call artifact was produced by the workflow.",
      },
    ],
  });

  assert.equal(item.risk_class, "public_claim_risk");
  assert.equal(item.recommended_action, "request_more_evidence");
  assert.equal(item.source_workflow, "video_intelligence_workflow");
  assert.equal(item.source_workflow_run_id, "workflow-run-1");
  assert.equal(item.source_run_id, "pipeline-run-1");
  assert.equal(item.expires_at, "2026-06-28T12:00:00.000Z");
  assert.equal(item.reconsider_after, "2026-06-22T12:00:00.000Z");
  assert.deepEqual(item.reason_codes, decision.reason_codes);
  assert.deepEqual(item.artifact_ids, decision.source_artifact_ids);
  assert.equal(item.evidence.length, 2);
  assert.equal(item.founder_escalation_allowed, false);
  assert.equal(item.external_send_performed, false);
  assert.equal(item.provider_mutation_performed, false);
  assert.match(item.payload_hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(NonFounderReviewItemSchema.parse(item).review_item_id, "review-ambiguous-call-1");
});

test("non-founder review queue writes, reads, and resolves locally without founder escalation or provider sends", () => {
  const root = mkdtempSync(join(tmpdir(), "non-founder-review-queue-"));
  const item = createNonFounderReviewItem(reviewDecision(), {
    review_item_id: "review-local-1",
    now: "2026-06-21T12:01:00.000Z",
    due_at: "2026-06-22T12:00:00.000Z",
    expires_at: "2026-06-28T12:00:00.000Z",
    risk_class: "public_claim_risk",
    recommended_action: "keep_suppressed",
    source_workflow: "video_intelligence_workflow",
    source_workflow_run_id: "workflow-run-local",
    source_run_id: "pipeline-run-local",
  });

  const writeResult = writeNonFounderReviewItem(item, root);
  assert.match(writeResult.path, /\.tmp\/workflow-receipts\/non_founder_review_queue\/review-local-1\.json$/);
  const persisted = JSON.parse(readFileSync(writeResult.path, "utf8"));
  assert.equal(persisted.status, "open");
  assert.equal(persisted.founder_escalation_allowed, false);
  assert.equal(persisted.external_send_performed, false);

  const openItems = readNonFounderReviewQueue({ root, status: "open" });
  assert.equal(openItems.length, 1);
  assert.equal(openItems[0].review_item_id, "review-local-1");

  const resolved = resolveNonFounderReviewItem({
    root,
    review_item_id: "review-local-1",
    action: "keep_suppressed",
    resolved_by: "trust-ops-reviewer",
    now: "2026-06-21T13:00:00.000Z",
    notes: "Evidence remained ambiguous; keep suppressed from public scoring.",
  });

  assert.equal(resolved.item.status, "resolved");
  assert.equal(resolved.item.resolution?.action, "keep_suppressed");
  assert.equal(resolved.item.resolution?.public_scoring_allowed, false);
  assert.equal(resolved.item.founder_escalation_allowed, false);
  assert.equal(resolved.item.external_send_performed, false);
  assert.equal(readNonFounderReviewQueue({ root, status: "resolved" }).length, 1);
});

test("approving publish from non-founder review is gated by non-founder trust review receipt evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "non-founder-review-gate-"));
  const item = createNonFounderReviewItem(reviewDecision(), {
    review_item_id: "review-gated-1",
    now: "2026-06-21T12:01:00.000Z",
    due_at: "2026-06-22T12:00:00.000Z",
    expires_at: "2026-06-28T12:00:00.000Z",
    risk_class: "public_claim_risk",
    recommended_action: "approve_publish",
    source_workflow: "video_intelligence_workflow",
    source_workflow_run_id: "workflow-run-gated",
    source_run_id: "pipeline-run-gated",
  });
  writeNonFounderReviewItem(item, root);

  assert.throws(
    () => resolveNonFounderReviewItem({
      root,
      review_item_id: "review-gated-1",
      action: "approve_publish",
      resolved_by: "trust-ops-reviewer",
      now: "2026-06-21T13:00:00.000Z",
    }),
    /NON_FOUNDER_TRUST_REVIEW gate receipt/,
  );

  const resolved = resolveNonFounderReviewItem({
    root,
    review_item_id: "review-gated-1",
    action: "approve_publish",
    resolved_by: "trust-ops-reviewer",
    now: "2026-06-21T13:00:00.000Z",
    gate_receipt_id: "non-founder-gate-receipt-1",
    notes: "Non-founder trust reviewer approved promotion; downstream promotion must still use gate evidence.",
  });

  assert.equal(resolved.item.status, "resolved");
  assert.equal(resolved.item.restricted_action_gate_required, "NON_FOUNDER_TRUST_REVIEW");
  assert.equal(resolved.item.resolution?.gate_receipt_id, "non-founder-gate-receipt-1");
  assert.equal(resolved.item.resolution?.public_scoring_allowed, true);
});
