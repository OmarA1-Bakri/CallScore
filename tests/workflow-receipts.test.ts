import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildReceiptFromArgv } from "../src/scripts/write-workflow-receipt";
import { buildWorkflowReceiptPath, enforceWorkflowApprovalGate, isApprovalRequiredWorkflow, writeWorkflowReceipt, type WorkflowReceipt } from "../src/lib/workflow-receipts";

function receipt(overrides: Partial<WorkflowReceipt> = {}): WorkflowReceipt {
  return {
    run_id: "run-1",
    workflow_name: "public_verification",
    started_at: "2026-06-13T00:00:00.000Z",
    finished_at: "2026-06-13T00:00:01.000Z",
    command: "npm run verify:public",
    result: "passed",
    blockers: [],
    approval_evidence: null,
    next_action: "continue",
    ...overrides,
  };
}

test("workflow receipts write deterministic JSON artifacts", () => {
  const root = mkdtempSync(join(tmpdir(), "workflow-receipts-"));
  const result = writeWorkflowReceipt(receipt({ workflow_name: "freshness_check", run_id: "fresh-1" }), root);
  assert.match(result.path, /freshness_check\/fresh-1\.json$/);
  const stored = JSON.parse(readFileSync(result.path, "utf8")) as WorkflowReceipt;
  assert.equal(stored.workflow_name, "freshness_check");
  assert.equal(stored.result, "passed");
});

test("workflow receipt paths reject traversal", () => {
  assert.throws(() => buildWorkflowReceiptPath({ workflow_name: "../x", run_id: "run" }), /not safe|escapes/);
  assert.throws(() => buildWorkflowReceiptPath({ workflow_name: "ok", run_id: ".." }), /not safe|escapes/);
});

test("public spend and provider mutation workflows fail closed without approval evidence", () => {
  assert.equal(isApprovalRequiredWorkflow("artofwar_publish_approval_review"), true);
  assert.equal(isApprovalRequiredWorkflow("whop_customer_payment_write"), true);
  assert.equal(isApprovalRequiredWorkflow("freshness_check"), false);

  const gated = enforceWorkflowApprovalGate(receipt({ workflow_name: "artofwar_public_publish", command: "publish post" }));
  assert.equal(gated.result, "blocked");
  assert.ok(gated.blockers.includes("approval_missing"));

  const approved = enforceWorkflowApprovalGate(receipt({ workflow_name: "artofwar_public_publish", command: "publish post", approval_evidence: ".tmp/approval.json" }));
  assert.equal(approved.result, "passed");
});

test("receipt CLI parser keeps required schema fields", () => {
  const parsed = buildReceiptFromArgv([
    "--workflow", "gemma_shadow_extract",
    "--run-id", "gemma-1",
    "--command", "npm run shadow:extract -- --limit 1",
    "--result", "blocked",
    "--blocker", "ollama_unavailable",
    "--next-action", "start ollama if approved",
  ], "2026-06-13T00:00:00.000Z");
  assert.equal(parsed.workflow_name, "gemma_shadow_extract");
  assert.equal(parsed.result, "blocked");
  assert.deepEqual(parsed.blockers, ["ollama_unavailable"]);
});
