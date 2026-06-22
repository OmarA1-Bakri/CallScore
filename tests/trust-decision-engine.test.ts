import test from "node:test";
import assert from "node:assert/strict";
import {
  decideTrust,
  type TrustDecisionInput,
} from "../src/lib/trust/trust-decision-engine";
import { createNonFounderReviewItem } from "../src/lib/trust/non-founder-review-queue";
import { TrustDecisionSchema } from "../src/lib/autonomy/contracts";

const baseInput: TrustDecisionInput = {
  entity_type: "call",
  entity_id: "call-1",
  confidence: 0.92,
  evidence_refs: ["artifact:transcript-segment-1"],
  transcript_available: true,
  evidence_supported: true,
  public_claim_supported: true,
  supported_market: true,
  creator_owned: true,
  audit_only: false,
  source: "video_intelligence_workflow",
};

function assertCanonicalTrustDecision(decision: unknown, label: string) {
  const parsed = TrustDecisionSchema.safeParse(decision);
  assert.equal(parsed.success, true, label);
  return parsed.success ? parsed.data : null;
}

test("decideTrust publishes high-confidence creator-owned evidence without founder review", () => {
  const decision = decideTrust(baseInput);
  const canonical = assertCanonicalTrustDecision(decision, "publish decision uses canonical trust schema");

  assert.equal(decision.decision, "publish");
  assert.equal(canonical?.risk_class, "safe_owned_public");
  assert.equal(canonical?.evidence_level, "E2");
  assert.equal(canonical?.public_visibility_allowed, true);
  assert.equal(canonical?.suppress_from_public_scoring, false);
  assert.equal(canonical?.non_founder_review_required, false);
  assert.equal(canonical?.founder_review_required, false);
  assert.deepEqual(canonical?.source_artifact_ids, ["artifact:transcript-segment-1"]);
  assert.ok(decision.reason_codes.includes("high_confidence_supported_creator_owned_call"));
});

test("decideTrust suppresses missing transcript or evidence fail-closed", () => {
  const decision = decideTrust({
    ...baseInput,
    transcript_available: false,
    evidence_refs: [],
  });
  const canonical = assertCanonicalTrustDecision(decision, "suppress decision uses canonical trust schema");

  assert.equal(decision.decision, "suppress");
  assert.equal(canonical?.public_visibility_allowed, false);
  assert.equal(canonical?.suppress_from_public_scoring, true);
  assert.equal(canonical?.non_founder_review_required, false);
  assert.equal(canonical?.founder_review_required, false);
  assert.ok(decision.reason_codes.includes("missing_transcript"));
  assert.ok(decision.reason_codes.includes("missing_evidence_refs"));
});

test("decideTrust suppresses unsupported public claims, named negative claims, and investment advice", () => {
  for (const [field, reasonCode] of [
    ["public_claim_supported", "unsupported_public_claim"],
    ["named_negative_creator_claim", "named_negative_creator_claim"],
    ["investment_advice", "investment_advice"],
  ] as const) {
    const decision = decideTrust({
      ...baseInput,
      [field]: field === "public_claim_supported" ? false : true,
    });

    assert.equal(decision.decision, "suppress", reasonCode);
    const canonical = assertCanonicalTrustDecision(decision, `${reasonCode} uses canonical trust schema`);
    assert.equal(canonical?.public_visibility_allowed, false, reasonCode);
    assert.equal(canonical?.suppress_from_public_scoring, true, reasonCode);
    assert.equal(canonical?.founder_review_required, false, reasonCode);
    assert.ok(decision.reason_codes.includes(reasonCode), reasonCode);
  }
});

test("decideTrust routes only medium-confidence evidence-backed calls to non-founder review", () => {
  const decision = decideTrust({ ...baseInput, confidence: 0.66 });
  const canonical = assertCanonicalTrustDecision(decision, "review decision uses canonical trust schema");

  assert.equal(decision.decision, "review");
  assert.equal(canonical?.non_founder_review_required, true);
  assert.equal(canonical?.reviewer_role, "trust_ops_reviewer");
  assert.equal(canonical?.founder_review_required, false);
  assert.equal(canonical?.public_visibility_allowed, false);
  assert.equal(canonical?.suppress_from_public_scoring, true);
  assert.ok(decision.reason_codes.includes("medium_confidence_non_founder_review"));

  const item = createNonFounderReviewItem(decision, {
    review_item_id: "review-1",
    now: "2026-06-21T12:00:00.000Z",
    due_at: "2026-06-22T12:00:00.000Z",
  });
  assert.equal(item.queue, "trust_ops");
  assert.equal(item.founder_escalation_allowed, false);
  assert.equal(item.trust_decision_id, decision.decision_id);
});

test("decideTrust suppresses low-confidence calls instead of burdening review queues", () => {
  const decision = decideTrust({ ...baseInput, confidence: 0.52 });
  const canonical = assertCanonicalTrustDecision(decision, "low-confidence suppress uses canonical trust schema");

  assert.equal(decision.decision, "suppress");
  assert.equal(canonical?.non_founder_review_required, false);
  assert.equal(canonical?.founder_review_required, false);
  assert.ok(decision.reason_codes.includes("low_confidence"));
});

test("decideTrust keeps audit-only verifier output non-mutating unless promoted by gate evidence", () => {
  const auditOnly = decideTrust({
    ...baseInput,
    audit_only: true,
    source: "ml_verifier_quality_gate",
  });

  assert.equal(auditOnly.decision, "review");
  const auditOnlyCanonical = assertCanonicalTrustDecision(auditOnly, "audit-only output uses canonical trust schema");
  assert.equal(auditOnlyCanonical?.public_visibility_allowed, false);
  assert.equal(auditOnlyCanonical?.suppress_from_public_scoring, true);
  assert.equal(auditOnlyCanonical?.non_founder_review_required, true);
  assert.ok(auditOnly.reason_codes.includes("audit_only_public_impact_blocked"));

  const promoted = decideTrust({
    ...baseInput,
    audit_only: true,
    source: "ml_verifier_quality_gate",
    promotion_gate: {
      gate_type: "NON_FOUNDER_TRUST_REVIEW",
      receipt_id: "gate-receipt-1",
    },
  });

  assert.equal(promoted.decision, "publish");
  const promotedCanonical = assertCanonicalTrustDecision(promoted, "gate-promoted output uses canonical trust schema");
  assert.equal(promotedCanonical?.public_visibility_allowed, true);
  assert.equal(promotedCanonical?.suppress_from_public_scoring, false);
  assert.equal(promotedCanonical?.gate_receipt_id, "gate-receipt-1");
  assert.ok(promoted.reason_codes.includes("promotion_gate_evidence_present"));
});
