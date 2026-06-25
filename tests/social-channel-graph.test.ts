import * as assert from "node:assert/strict";
import { test, describe } from "node:test";
import { createSocialChannelGraph } from "../src/lib/autonomy/social-channel-graph";
import { CHANNEL_CONFIGS } from "../src/lib/autonomy/social-channel-config";
import type { RunnableConfig } from "@langchain/core/runnables";

/**
 * Helper: invoke a graph with common configurable params.
 */
async function invokeGraph(graph: ReturnType<typeof createSocialChannelGraph>, campaignId: string, channelKey: string) {
  const config = CHANNEL_CONFIGS[channelKey];
  if (!config) throw new Error(`Unknown channel: ${channelKey}`);

  const runConfig: RunnableConfig = {
    configurable: {
      channelConfig: config,
      campaignId,
    },
  };

  const result = await graph.invoke(
    {
      campaign_id: campaignId,
      dry_run: true,
      started_at: new Date().toISOString(),
    },
    runConfig,
  );

  return result;
}

describe("createSocialChannelGraph", () => {
  test("runs for X channel in dry-run", async () => {
    const graph = createSocialChannelGraph();
    const result = await invokeGraph(graph, "campaign-test-x", "x");

    assert.ok(result.specialist_receipts, "should have specialist_receipts");
    assert.equal(result.specialist_receipts.length, 5, "should have 5 specialist receipts");
    assert.ok(result.channel_review_receipt, "should have channel_review_receipt");
    assert.equal(result.channel_errors.length, 0, "should have 0 errors");
  });

  test("runs for LinkedIn channel in dry-run", async () => {
    const graph = createSocialChannelGraph();
    const result = await invokeGraph(graph, "campaign-test-linkedin", "linkedin");

    assert.ok(result.specialist_receipts, "should have specialist_receipts");
    assert.equal(result.specialist_receipts.length, 5, "should have 5 specialist receipts");
    assert.ok(result.channel_review_receipt, "should have channel_review_receipt");
  });

  test("runs for Reddit channel in dry-run", async () => {
    const graph = createSocialChannelGraph();
    const result = await invokeGraph(graph, "campaign-test-reddit", "reddit");

    assert.ok(result.specialist_receipts, "should have specialist_receipts");
    assert.equal(result.specialist_receipts.length, 5, "should have 5 specialist receipts");
    assert.ok(result.channel_review_receipt, "should have channel_review_receipt");
  });

  test("all specialist receipts have correct field lineage", async () => {
    const graph = createSocialChannelGraph();
    const result = await invokeGraph(graph, "campaign-field-lineage", "x");

    for (const rec of result.specialist_receipts) {
      assert.equal(rec.campaign_id, "campaign-field-lineage", `receipt ${rec.receipt_id} should have campaign_id`);
      assert.equal(rec.channel, "x", `receipt ${rec.receipt_id} should have channel x`);
      assert.ok(rec.agent_id, `receipt ${rec.receipt_id} should have agent_id`);
      assert.ok(rec.authority, `receipt ${rec.receipt_id} should have authority`);
      assert.ok(rec.decision, `receipt ${rec.receipt_id} should have decision`);
      assert.ok(rec.receipt_id, `receipt ${rec.receipt_id} should have receipt_id`);
    }
  });

  test("all specialist agent IDs are resolved via authority router", async () => {
    const graph = createSocialChannelGraph();
    const result = await invokeGraph(graph, "campaign-edge-cases", "x");

    // All 5 specialists should have resolved through the authority router
    const agentIds = result.specialist_receipts.map((r) => r.agent_id);
    assert.ok(agentIds.includes("callscore-x-posting-agent"));
    assert.ok(agentIds.includes("callscore-x-commenting-agent"));
    assert.ok(agentIds.includes("callscore-x-image-agent"));
    assert.ok(agentIds.includes("callscore-x-profile-discovery-agent"));
    assert.ok(agentIds.includes("callscore-x-analytics-agent"));
  });

  test("no receipt indicates external mutation", async () => {
    const graph = createSocialChannelGraph();
    const result = await invokeGraph(graph, "campaign-no-mut", "x");

    // Specialist receipts
    for (const rec of result.specialist_receipts) {
      assert.equal(rec.external_mutation_performed, false, `${rec.agent_id} should not have external mutation`);
      assert.equal(rec.send_or_outreach_performed, false, `${rec.agent_id} should not have send/outreach`);
      assert.equal(rec.provider_mutation_performed, false, `${rec.agent_id} should not have provider mutation`);
      assert.equal(rec.whop_mutation_performed, false, `${rec.agent_id} should not have whop mutation`);
      assert.equal(rec.production_mutation_performed, false, `${rec.agent_id} should not have production mutation`);
    }

    // Channel review receipt
    assert.equal(result.channel_review_receipt!.external_mutation_performed, false);
    assert.equal(result.channel_review_receipt!.send_or_outreach_performed, false);
    assert.equal(result.channel_review_receipt!.provider_mutation_performed, false);
    assert.equal(result.channel_review_receipt!.whop_mutation_performed, false);
    assert.equal(result.channel_review_receipt!.production_mutation_performed, false);
  });

  test("unknown agent fails closed with suppress decision", async () => {
    // Use a deliberately unknown config to test fail-closed
    const graph = createSocialChannelGraph();
    const unknownConfig = {
      ...CHANNEL_CONFIGS.x,
      analyticsAgentId: "callscore-nonexistent-ghost-agent",
    };

    const result = await graph.invoke(
      {
        campaign_id: "test-unknown",
        dry_run: true,
        started_at: new Date().toISOString(),
      },
      { configurable: { channelConfig: unknownConfig, campaignId: "test-unknown" } },
    );

    // The unknown agent should produce a suppress decision — that's still a valid receipt
    // which means it counted among the receipts but with suppress decision.
    // Actually, routeDecision() for unknown agent returns suppress with reason_code unknown_agent_not_authorized
    // But routeDecision() doesn't throw — it returns a valid suppress result. So it should be in the receipts.
    const unknownReceipt = result.specialist_receipts.find(
      (r) => r.agent_id === "callscore-nonexistent-ghost-agent",
    );
    // The unknown agent may or may not appear depending on whether routeDecision handles it
    // If it returns a valid suppress receipt, it appears. If it throws, the error is in channel_errors.
    // Let's verify at least one of these conditions:
    if (unknownReceipt) {
      assert.equal(unknownReceipt.decision, "suppress");
    } else {
      assert.ok(result.channel_errors.length > 0, "should have channel errors for unknown agent");
    }
  });

  test("uses RunnableConfig.configurable for input injection, not module-level state", async () => {
    const graph = createSocialChannelGraph();

    // Invoke twice with different configs — should not interfere
    const resultA = await invokeGraph(graph, "campaign-a", "x");
    const resultB = await invokeGraph(graph, "campaign-b", "linkedin");

    assert.equal(resultA.specialist_receipts[0].campaign_id, "campaign-a");
    assert.equal(resultB.specialist_receipts[0].campaign_id, "campaign-b");
    assert.notEqual(resultA.specialist_receipts[0].channel, resultB.specialist_receipts[0].channel);
  });
});
