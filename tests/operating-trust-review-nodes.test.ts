import * as assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { buildInitialOperatingState, createCallscoreOperatingGraph } from "../src/lib/workplane/callscore-operating-graph";
import { trustReviewGoalLoopNode } from "../src/lib/workplane/node-wrappers/trust-review-nodes";
import { decideTrust, type TrustDecisionInput } from "../src/lib/trust/trust-decision-engine";
import { createNonFounderReviewItem, writeNonFounderReviewItem } from "../src/lib/trust/non-founder-review-queue";

const evidenceBackedInput: TrustDecisionInput = {
  entity_type: "call",
  entity_id: "call-operating-trust-1",
  confidence: 0.66,
  evidence_refs: ["artifact:transcript-segment-1"],
  transcript_available: true,
  evidence_supported: true,
  public_claim_supported: true,
  supported_market: true,
  creator_owned: true,
  audit_only: false,
  source: "video_intelligence_workflow",
  now: "2026-06-25T12:00:00.000Z",
};

describe("operating trust review nodes", () => {
  test("trustReviewGoalLoopNode returns a skipped no-pending receipt without mutation", async () => {
    const root = mkdtempSync(join(tmpdir(), "trust-review-empty-"));
    const state = buildInitialOperatingState({ goal: "trust_review", testFixtures: true });
    const patch = await trustReviewGoalLoopNode(state, {
      configurable: { thread_id: "trust-empty-test", nonFounderReviewRoot: root },
    });

    const result = patch.node_results?.[0];
    assert.equal(result?.node_id, "trust_goal_loop");
    assert.equal(result?.status, "skipped");
    assert.equal(result?.detail.pending_review_count, 0);
    assert.equal(result?.detail.founder_review_required_count, 0);
    assert.equal(patch.mutation_flags?.external_mutation_performed, false);
    assert.equal(patch.mutation_flags?.db_write_performed, false);
  });

  test("trustReviewGoalLoopNode runs trust decision input and writes a decision artifact", async () => {
    const root = mkdtempSync(join(tmpdir(), "trust-review-decision-"));
    const state = buildInitialOperatingState({ goal: "trust_review", testFixtures: true });
    state.artifacts.trust_decision_input = evidenceBackedInput;

    const patch = await trustReviewGoalLoopNode(state, {
      configurable: { thread_id: "trust-decision-test", nonFounderReviewRoot: root },
    });

    const result = patch.node_results?.[0];
    assert.equal(result?.status, "ok");
    assert.equal(result?.detail.decision, "review");
    assert.equal(result?.detail.non_founder_review_required, true);
    assert.equal(result?.detail.founder_review_required, false);
    assert.ok(result?.artifact_path);
    assert.equal(existsSync(result!.artifact_path!), true);
    const artifact = JSON.parse(readFileSync(result!.artifact_path!, "utf8")) as Record<string, unknown>;
    assert.equal((artifact.trust_decision as Record<string, unknown>).decision, "review");
    assert.equal((artifact.trust_decision as Record<string, unknown>).founder_review_required, false);
  });

  test("trustReviewGoalLoopNode blocks restricted approve_publish resolution without gate evidence", async () => {
    const root = mkdtempSync(join(tmpdir(), "trust-review-resolution-"));
    const decision = decideTrust(evidenceBackedInput);
    const item = createNonFounderReviewItem(decision, {
      review_item_id: "review-resolution-block",
      now: "2026-06-25T12:00:00.000Z",
      due_at: "2026-06-26T12:00:00.000Z",
      recommended_action: "approve_publish",
    });
    writeNonFounderReviewItem(item, root);

    const state = buildInitialOperatingState({ goal: "trust_review", mode: "bounded_write", dryRun: false, approved: true, testFixtures: true });
    const patch = await trustReviewGoalLoopNode(state, {
      configurable: {
        thread_id: "trust-resolution-block-test",
        nonFounderReviewRoot: root,
        trustReviewResolution: {
          review_item_id: item.review_item_id,
          action: "approve_publish",
          resolved_by: "trust-ops-fixture",
        },
      },
    });

    const result = patch.node_results?.[0];
    assert.equal(result?.status, "blocked");
    assert.equal(result?.blockers.includes("non_founder_gate_evidence_missing"), true);
    assert.equal(patch.mutation_flags?.public_publish_performed, false);
    assert.equal(patch.mutation_flags?.provider_mutation_performed, false);
  });

  test("trust_review graph goal uses the trust review node instead of the stub", async () => {
    const graph = createCallscoreOperatingGraph();
    const result = await graph.invoke(
      buildInitialOperatingState({ goal: "trust_review", testFixtures: true }),
      { configurable: { thread_id: "trust-graph-test", nonFounderReviewRoot: mkdtempSync(join(tmpdir(), "trust-review-graph-")) } },
    );

    const trustNode = result.node_results.find((item) => item.node_id === "trust_goal_loop");
    assert.equal(trustNode?.status, "skipped");
    assert.notEqual(trustNode?.detail.note, "wrapper_first_stub_ready_for_domain_integration");
  });
});
