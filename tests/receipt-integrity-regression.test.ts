import * as assert from "node:assert/strict";
import { describe, test } from "node:test";

import { validatePublishedReceiptIntegrity } from "../src/lib/workplane/external-mutation-guard";

describe("public publish receipt integrity", () => {
  test("parent MCP Composio output cannot satisfy graph-owned mutation proof", () => {
    const result = validatePublishedReceiptIntegrity({
      provider_action_performed: true,
      public_post_published: true,
      external_mutation_performed: true,
      public_publish_performed: true,
      provider_proof: {
        parent_session_id: "20260627_091345_efb86c",
        tool: "mcp_composio_COMPOSIO_MULTI_EXECUTE_TOOL",
        provider_slug: "TWITTER_CREATION_OF_A_POST",
        post_url: "https://x.com/0marbakri/status/2070777874915664293",
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.blocker_code, "parent_provider_mutation_not_graph_owned");
  });

  test("receipt claiming public publish without graph-owned child lineage fails", () => {
    const result = validatePublishedReceiptIntegrity({
      provider_action_performed: true,
      public_post_published: true,
      external_mutation_performed: true,
      public_publish_performed: true,
      child_external_mutation_receipts: [],
    });

    assert.equal(result.ok, false);
    assert.equal(result.blocker_code, "parent_provider_mutation_not_graph_owned");
  });

  test("graph-owned child receipt with payload hash and provider object is valid", () => {
    const result = validatePublishedReceiptIntegrity({
      provider_action_performed: true,
      public_post_published: true,
      external_mutation_performed: true,
      public_publish_performed: true,
      child_external_mutation_receipts: [{
        status: "ok",
        operating_graph_run_id: "graph-run-001",
        graph_node_id: "x_owned_publish_node",
        provider_tool: "TWITTER_CREATION_OF_A_POST",
        provider_execution_receipt_id: "provider-exec-001",
        approved_payload_hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        provider_response: { ok: true, id: "2070000000000000000", url: "https://x.com/0marbakri/status/2070000000000000000" },
        external_url: "https://x.com/0marbakri/status/2070000000000000000",
        child_receipt_ids: ["provider-exec-001"],
      }],
    });

    assert.equal(result.ok, true);
  });
});
