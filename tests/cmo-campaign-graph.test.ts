import * as assert from "node:assert/strict";
import { test, describe } from "node:test";
import { createCmoCampaignGraph } from "../src/lib/autonomy/cmo-campaign-graph";
import type { CmoCampaignReceipt } from "../src/lib/autonomy/cmo-campaign-schemas";
import type { RunnableConfig } from "@langchain/core/runnables";

describe("cmoCampaignGraph", () => {
  test("runs end-to-end in dry-run", async () => {
    const graph = createCmoCampaignGraph();
    const runConfig: RunnableConfig = {
      configurable: {
        campaignId: "campaign-e2e",
      },
    };

    const result = await graph.invoke(
      {
        campaign_id: "campaign-e2e",
        dry_run: true,
        started_at: new Date().toISOString(),
      },
      runConfig,
    );

    // Verify one CMO campaign receipt
    assert.ok(result.cmo_campaign_receipt, "should have cmo_campaign_receipt");
    assert.equal(result.cmo_campaign_receipt.schema_version, "callscore_cmo_campaign_receipt.v1");
    assert.equal(result.cmo_campaign_receipt.campaign_id, "campaign-e2e");
    assert.equal(result.cmo_campaign_receipt.dry_run, true);

    // Verify three channel receipts
    assert.ok(result.channel_receipts, "should have channel_receipts");
    assert.equal(result.channel_receipts.length, 3, "should have 3 channel receipts");

    const channels = result.channel_receipts.map((r) => r.channel).sort();
    assert.deepEqual(channels, ["linkedin", "reddit", "x"]);

    // Verify specialist receipts exist for each channel
    assert.ok(result.channel_specialist_receipts, "should have channel_specialist_receipts");
    assert.equal(
      Object.keys(result.channel_specialist_receipts).length,
      3,
      "should have specialist receipts for 3 channels",
    );

    // Each channel should have 5 specialist receipts + 1 channel head = 6 total
    for (const channel of ["x", "linkedin", "reddit"]) {
      const receipts = result.channel_specialist_receipts[channel];
      assert.ok(receipts, `should have specialist receipts for ${channel}`);
      assert.equal(receipts.length, 6, `should have 6 receipts for ${channel} (5 specialists + 1 head)`);
    }

    // Count total specialist decisions
    const total = Object.values(result.channel_specialist_receipts).reduce(
      (sum, r) => sum + r.length,
      0,
    );
    assert.equal(total, 18, "should have 18 total specialist+head decisions across 3 channels");

    // Verify total_specialist_decisions matches
    assert.equal(result.cmo_campaign_receipt.total_specialist_decisions, 18);
  });

  test("all specialist agents route through authority handlers", async () => {
    const graph = createCmoCampaignGraph();
    const result = await graph.invoke(
      {
        campaign_id: "campaign-authority-test",
        dry_run: true,
        started_at: new Date().toISOString(),
      },
      { configurable: { campaignId: "campaign-authority-test" } },
    );

    // All 18 agent decisions should have reason_codes or authority values
    for (const [channel, receipts] of Object.entries(result.channel_specialist_receipts)) {
      for (const rec of receipts) {
        assert.ok(rec.agent_id, `${channel} receipt missing agent_id`);
        assert.ok(rec.authority, `${channel} receipt ${rec.agent_id} missing authority`);
        assert.ok(rec.decision, `${channel} receipt ${rec.agent_id} missing decision`);
        assert.ok(rec.receipt_id, `${channel} receipt ${rec.agent_id} missing receipt_id`);
      }
    }
  });

  test("no receipt indicates external mutation, send, follow, comment, Whop, or production mutation", async () => {
    const graph = createCmoCampaignGraph();
    const result = await graph.invoke(
      {
        campaign_id: "campaign-no-mut",
        dry_run: true,
        started_at: new Date().toISOString(),
      },
      { configurable: { campaignId: "campaign-no-mut" } },
    );

    // Check campaign receipt
    assert.ok(result.cmo_campaign_receipt, "cmo_campaign_receipt should exist");
    const cRec = result.cmo_campaign_receipt!;
    assert.equal(cRec.dry_run, true);
    assert.equal(cRec.external_mutation_performed, false);
    assert.equal(cRec.send_or_outreach_performed, false);
    assert.equal(cRec.provider_mutation_performed, false);
    assert.equal(cRec.whop_mutation_performed, false);
    assert.equal(cRec.production_mutation_performed, false);

    // Check channel receipts
    for (const rec of result.channel_receipts) {
      assert.equal(rec.dry_run, true);
      assert.equal(rec.external_mutation_performed, false);
      assert.equal(rec.send_or_outreach_performed, false);
      assert.equal(rec.provider_mutation_performed, false);
      assert.equal(rec.whop_mutation_performed, false);
      assert.equal(rec.production_mutation_performed, false);
    }

    // Check specialist receipts
    for (const rec of Object.values(result.channel_specialist_receipts).flat()) {
      assert.equal(rec.dry_run, true, `${rec.receipt_id} must be dry_run`);
      assert.equal(rec.external_mutation_performed, false, `${rec.receipt_id} must not have external mutation`);
      assert.equal(rec.send_or_outreach_performed, false, `${rec.receipt_id} must not have send/outreach`);
      assert.equal(rec.provider_mutation_performed, false, `${rec.receipt_id} must not have provider mutation`);
      assert.equal(rec.whop_mutation_performed, false, `${rec.receipt_id} must not have whop mutation`);
      assert.equal(rec.production_mutation_performed, false, `${rec.receipt_id} must not have production mutation`);
    }
  });

  test("unknown agent still fails closed", async () => {
    const graph = createCmoCampaignGraph();
    const result = await graph.invoke(
      {
        campaign_id: "campaign-unknown-agent",
        dry_run: true,
        started_at: new Date().toISOString(),
      },
      {
        configurable: {
          campaignId: "campaign-unknown-agent",
          // Override one channel config to inject an unknown agent
          channelOverrides: {
            x: {
              postingAgentId: "callscore-nonexistent-ghost-agent",
            },
          },
        },
      },
    );

    // The unknown agent should still produce a receipt (suppress decision)
    const xReceipts = result.channel_specialist_receipts["x"];
    const unknownReceipt = xReceipts.find(
      (r) => r.agent_id === "callscore-nonexistent-ghost-agent",
    );

    if (unknownReceipt) {
      assert.equal(unknownReceipt.decision, "suppress");
    } else {
      // If no receipt for the unknown agent, there must be errors
      const allErrors = result.channel_errors?.some((e) =>
        e.includes("callscore-nonexistent-ghost-agent"),
      );
      assert.ok(allErrors, "should have errors for unknown agent");
    }
  });

  test("uses RunnableConfig.configurable for graph input injection in new graph code", async () => {
    const graph = createCmoCampaignGraph();

    // Run twice with different campaign IDs — should produce independent results
    const resultA = await graph.invoke(
      { campaign_id: "campaign-iso-a", dry_run: true, started_at: new Date().toISOString() },
      { configurable: { campaignId: "campaign-iso-a" } },
    );

    const resultB = await graph.invoke(
      { campaign_id: "campaign-iso-b", dry_run: true, started_at: new Date().toISOString() },
      { configurable: { campaignId: "campaign-iso-b" } },
    );

    assert.ok(resultA.cmo_campaign_receipt, "cmo_campaign_receipt should exist for A");
    assert.ok(resultB.cmo_campaign_receipt, "cmo_campaign_receipt should exist for B");
    assert.equal(resultA.cmo_campaign_receipt!.campaign_id, "campaign-iso-a");
    assert.equal(resultB.cmo_campaign_receipt!.campaign_id, "campaign-iso-b");
    // Specialist receipts should reference the correct campaign
    for (const rec of Object.values(resultA.channel_specialist_receipts).flat()) {
      assert.equal(rec.campaign_id, "campaign-iso-a");
    }
    for (const rec of Object.values(resultB.channel_specialist_receipts).flat()) {
      assert.equal(rec.campaign_id, "campaign-iso-b");
    }
    // No module-level state leakage: channel receipts from A should be for campaign-iso-a only
    assert.notEqual(resultA.cmo_campaign_receipt!.campaign_id, resultB.cmo_campaign_receipt!.campaign_id);
  });
});
