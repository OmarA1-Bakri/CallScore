import * as assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, test } from "node:test";

import { buildInitialOperatingState, createCallscoreOperatingGraph } from "../src/lib/workplane/callscore-operating-graph";
import { sentinelMonitorGoalNode } from "../src/lib/workplane/node-wrappers/sentinel-nodes";

function nodeIds(results: readonly { node_id: string }[]): string[] {
  return results.map((item) => item.node_id);
}

describe("operating sentinel monitor nodes", () => {
  test("monitor goal wrapper runs all sentinel/freshness/capacity checks with fixture data and no mutations", async () => {
    const state = buildInitialOperatingState({ goal: "monitor", testFixtures: true, maxItems: 3 });
    const patch = await sentinelMonitorGoalNode(state, { configurable: { thread_id: "sentinel-fixture-test" } });
    const results = patch.node_results ?? [];

    assert.deepEqual(nodeIds(results), [
      "fresh_call_sentinel",
      "creator_discovery_sentinel",
      "freshness_check",
      "cmo_response_monitor",
      "gemma_capacity_preflight",
      "monitoring_goal_loop",
    ]);

    const freshCall = results.find((item) => item.node_id === "fresh_call_sentinel");
    assert.equal(freshCall?.status, "ok");
    assert.equal(freshCall?.detail.discovered_count, 3);
    assert.equal(freshCall?.detail.skipped_duplicate_count, 1);
    assert.equal(freshCall?.detail.skipped_cooldown_count, 1);
    assert.equal(freshCall?.detail.recommended_count, 1);
    assert.equal(freshCall?.detail.enqueued_count, 0);

    const gemma = results.find((item) => item.node_id === "gemma_capacity_preflight");
    assert.equal(gemma?.status, "blocked");
    assert.equal(gemma?.blockers.includes("gemma_capacity_fixture_blocked"), true);

    assert.equal(patch.mutation_flags?.external_mutation_performed, false);
    assert.equal(patch.mutation_flags?.provider_mutation_performed, false);
    assert.equal(patch.mutation_flags?.db_write_performed, false);
    assert.equal(patch.mutation_flags?.public_publish_performed, false);
  });

function writeFakeCanary(root: string, markerPath: string): string {
  const scriptPath = join(root, "fake-canary.js");
  writeFileSync(scriptPath, `
const fs = require("node:fs");
const args = process.argv.slice(2);
const receiptIndex = args.indexOf("--receipt-out");
const receiptPath = receiptIndex >= 0 ? args[receiptIndex + 1] : ${JSON.stringify(join(root, "fallback-receipt.json"))};
const receipt = {
  ok: true,
  mode: "production_shadow_canary",
  mutation_scope: "workflow/artifact/agent_invocation/approval_gate tables only",
  final_business_tables_mutated: false,
  workflow_status: "completed",
  invoked_from_test: true
};
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
fs.writeFileSync(${JSON.stringify(markerPath)}, JSON.stringify({ argv: args, receiptPath }, null, 2));
console.log(JSON.stringify({ ok: true, receipt_path: receiptPath, workflow_status: "completed" }));
`);
  return scriptPath;
}

  test("bounded monitor invokes the real control-plane canary implementation through the wrapper", async () => {
    const root = mkdtempSync(join(tmpdir(), "monitor-canary-wrapper-"));
    const markerPath = join(root, "canary-marker.json");
    const scriptPath = writeFakeCanary(root, markerPath);

    const state = buildInitialOperatingState({ goal: "monitor", mode: "bounded_write", dryRun: false, approved: true, approvalReceiptId: "approval-monitor-test" });
    const patch = await sentinelMonitorGoalNode(state, {
      configurable: {
        thread_id: "monitor-real-canary-test",
        monitorCanaryCommand: [process.execPath, scriptPath],
        monitorCanaryReceiptDir: root,
      },
    });
    const result = patch.node_results?.at(-1);

    assert.equal(result?.node_id, "monitoring_goal_loop");
    assert.equal(result?.status, "ok");
    assert.equal(result?.detail.invoked_implementation, "run-control-plane-canary");
    assert.equal(result?.detail.workflow_status, "completed");
    assert.equal(result?.mutation_flags.db_write_performed, true);
    assert.equal(result?.mutation_flags.production_mutation_performed, false);
    assert.ok(result?.artifact_path);
    assert.equal(JSON.parse(readFileSync(markerPath, "utf8")).argv.includes("--receipt-out"), true);
  });

  test("full monitor graph treats missing status and heartbeat as warnings so monitor can measure reality", async () => {
    const root = mkdtempSync(join(tmpdir(), "monitor-canary-graph-"));
    const markerPath = join(root, "canary-marker.json");
    const scriptPath = writeFakeCanary(root, markerPath);
    const graph = createCallscoreOperatingGraph();

    const result = await graph.invoke(
      buildInitialOperatingState({ goal: "monitor", mode: "bounded_write", dryRun: false, approved: true, approvalReceiptId: "approval-monitor-graph-test" }),
      {
        configurable: {
          thread_id: "monitor-canary-full-graph-test",
          monitorCanaryCommand: [process.execPath, scriptPath],
          monitorCanaryReceiptDir: root,
        },
      },
    );

    assert.equal(result.blockers.includes("workplane_status_unavailable"), false);
    assert.equal(result.blockers.includes("heartbeat_missing"), false);
    assert.equal(result.warnings.includes("workplane_status_unavailable"), true);
    assert.equal(result.warnings.includes("heartbeat_missing"), true);
    assert.equal(result.node_results.some((item) => item.node_id === "monitoring_goal_loop" && item.status === "ok"), true);
    assert.equal(JSON.parse(readFileSync(markerPath, "utf8")).argv.includes("--receipt-out"), true);
  });
});
