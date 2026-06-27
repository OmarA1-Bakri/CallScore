import * as assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, test } from "node:test";

import { buildInitialOperatingState, createCallscoreOperatingGraph } from "../src/lib/workplane/callscore-operating-graph";

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return val;
  });
}

function payloadHash(payload: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(payload)).digest("hex")}`;
}

function graphContext(nodeId: "x_owned_publish_node" | "linkedin_owned_publish_node", payload: Record<string, unknown>) {
  return {
    operating_graph_run_id: "owned-public-graph-run-test",
    graph_node_id: nodeId,
    goal: "revenue_now",
    platform: nodeId.startsWith("x_") ? "x" : "linkedin",
    mutation_family: "public_publish",
    acting_agent_id: nodeId.startsWith("x_") ? "callscore-x-channel-head" : "callscore-linkedin-channel-head",
    authority: "owned_public_publish",
    evidence_receipt_id: "evidence-receipt-test",
    originality_receipt_id: "originality-receipt-test",
    approved_payload_hash: payloadHash(payload),
    provider_execution_receipt_id: `${nodeId}-provider-exec-test`,
    dry_run: false,
    parent_receipt_id: "quality-gated-final-draft-test",
  };
}

describe("revenue_now live_owned_public graph-owned publish routing", () => {
  test("routes quality-passed X and LinkedIn payloads through graph-owned publish nodes", async () => {
    const xPayload = { text: "CallScore public update", media_media_ids: ["media-x-1"] };
    const linkedinPayload = {
      author: "urn:li:person:test",
      commentary: "CallScore LinkedIn update",
      visibility: "PUBLIC",
      lifecycleState: "PUBLISHED",
      images: [{ id: "urn:li:image:test", altText: "CallScore proof visual" }],
    };

    const graph = createCallscoreOperatingGraph();
    const result = await graph.invoke(buildInitialOperatingState({
      goal: "revenue_now",
      mode: "live_owned_public",
      dryRun: false,
      testFixtures: true,
      artifacts: {
        graph_mutation_inputs: {
          x_owned_publish_node: {
            graph_context: graphContext("x_owned_publish_node", xPayload),
            provider_tool: "TWITTER_CREATION_OF_A_POST",
            provider_payload: xPayload,
            provider_response: { ok: true, id: "2070000000000000000", url: "https://x.com/0marbakri/status/2070000000000000000" },
            provider_execution_receipt_id: "x_owned_publish_node-provider-exec-test",
            child_receipt_ids: ["x_owned_publish_node-provider-exec-test"],
          },
          linkedin_owned_publish_node: {
            graph_context: graphContext("linkedin_owned_publish_node", linkedinPayload),
            provider_tool: "LINKEDIN_CREATE_LINKED_IN_POST",
            provider_payload: linkedinPayload,
            provider_response: { ok: true, id: "urn:li:share:test", x_restli_id: "urn:li:share:test" },
            provider_execution_receipt_id: "linkedin_owned_publish_node-provider-exec-test",
            child_receipt_ids: ["linkedin_owned_publish_node-provider-exec-test"],
          },
        },
      },
    } as Parameters<typeof buildInitialOperatingState>[0] & { artifacts: Record<string, unknown> }));

    const nodeIds = result.node_results.map((node) => node.node_id);
    assert.ok(nodeIds.includes("x_owned_publish_node"), nodeIds.join(","));
    assert.ok(nodeIds.includes("linkedin_owned_publish_node"), nodeIds.join(","));
    assert.equal(result.mutation_flags.provider_mutation_performed, true);
    assert.equal(result.mutation_flags.public_publish_performed, true);
    assert.equal(result.blockers.includes("graph_owned_provider_publish_missing"), false);
  });

  test("missing graph-owned provider execution writes blocked receipt instead of parent fallback publish", async () => {
    const graph = createCallscoreOperatingGraph();
    const result = await graph.invoke(buildInitialOperatingState({
      goal: "revenue_now",
      mode: "live_owned_public",
      dryRun: false,
      testFixtures: true,
      artifacts: {
        owned_public_final_draft: {
          content_type: "thought_leadership",
          quality_gate: { ok: true, failures: [] },
          drafts: { x: { exact_copy: "x" }, linkedin: { exact_copy: "linkedin" } },
        },
      },
    } as Parameters<typeof buildInitialOperatingState>[0] & { artifacts: Record<string, unknown> }));

    assert.equal(result.mutation_flags.provider_mutation_performed, false);
    assert.equal(result.mutation_flags.public_publish_performed, false);
    assert.ok(result.blockers.includes("graph_owned_provider_publish_missing"), result.blockers.join(","));
    assert.match(JSON.stringify(result.node_results), /graph_owned_provider_publish_missing/);
    assert.doesNotMatch(JSON.stringify(result.node_results), /overgovernance-correction|connected Composio fallback/i);
  });
});
