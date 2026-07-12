import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return val;
  });
}

const canonicalReceipts = [
  "editorial_angle_receipt.v1",
  "platform_fit_receipt.v1",
  "visual_brief_receipt.v1",
  "visual_qa_receipt.v1",
  "copy_visual_coherence_receipt.v1",
  "same_shit_memory_receipt.v1",
  "callscore.task_router_receipt.v1",
  "callscore.tool_inheritance_receipt.v1",
].map((schema) => ({
  schema,
  receipt_id: `${schema}:whop-test`,
  created_at: "2026-07-12T00:00:00.000Z",
  agent_id: "callscore-whop-head",
  decision: "approved",
  evidence_hash: `sha256:${"a".repeat(64)}`,
  blockers: [],
}));

test("Whop listing node is a dedicated graph-owned wrapper with rollback metadata", async () => {
  const nodes = await import("../src/lib/workplane/node-wrappers/commerce-mutation-nodes");
  const payload = {
    id: "app_cDfDRY1cj8yQJZ",
    description: "Updated short description",
    app_store_description: "Updated long description",
  };
  const hash = `sha256:${createHash("sha256").update(stableJson(payload)).digest("hex")}`;
  const missingPackage = nodes.runWhopListingUpdateNode({
    provider_tool: "WHOP_UPDATE_APP",
    provider_payload: payload,
    prior_listing: { description: "Old short description", app_store_description: null },
  });
  assert.equal(missingPackage.status, "blocked");
  assert.equal(missingPackage.blocker_code, "canonical_operational_package_missing");

  const decision = nodes.runWhopListingUpdateNode({
    graph_context: {
      operating_graph_run_id: "graph-run-whop-listing-001",
      graph_node_id: "whop_listing_update_node",
      goal: "revenue_now",
      platform: "whop",
      mutation_family: "whop_mutation",
      acting_agent_id: "callscore-whop-head",
      authority: "hard_gate",
      approval_receipt_id: "approval-whop-listing-001",
      approved_payload_hash: hash,
      provider_execution_receipt_id: "provider-exec-whop-listing-001",
      dry_run: false,
      parent_receipt_id: "approval-whop-listing-001",
    },
    approved: true,
    canonical_receipts: canonicalReceipts,
    approval_receipt_id: "approval-whop-listing-001",
    provider_tool: "WHOP_UPDATE_APP",
    provider_payload: payload,
    payload,
    provider_execution_receipt_id: "provider-exec-whop-listing-001",
    child_receipt_ids: ["provider-exec-whop-listing-001"],
    provider_response: { ok: true, id: "app_cDfDRY1cj8yQJZ" },
    prior_listing: {
      description: "Old short description",
      app_store_description: "Old long description",
    },
  });

  assert.equal(decision.status, "ok");
  assert.equal(decision.node_id, "whop_listing_update_node");
  assert.equal(decision.mutation_flags?.provider_mutation_performed, true);
  assert.equal(decision.mutation_flags?.whop_mutation_performed, true);
  assert.deepEqual(decision.rollback, {
    operation: "WHOP_UPDATE_APP",
    provider_payload: {
      id: "app_cDfDRY1cj8yQJZ",
      description: "Old short description",
      app_store_description: "Old long description",
    },
  });
});
