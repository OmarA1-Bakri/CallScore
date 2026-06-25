import * as assert from "node:assert/strict";
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

  test("full monitor graph returns sentinel receipts instead of a stub loop", async () => {
    const graph = createCallscoreOperatingGraph();
    const result = await graph.invoke(
      buildInitialOperatingState({ goal: "monitor", testFixtures: true, maxItems: 3 }),
      { configurable: { thread_id: "sentinel-full-graph-test" } },
    );

    const ids = nodeIds(result.node_results);
    assert.equal(ids.includes("fresh_call_sentinel"), true);
    assert.equal(ids.includes("creator_discovery_sentinel"), true);
    assert.equal(ids.includes("freshness_check"), true);
    assert.equal(ids.includes("cmo_response_monitor"), true);
    assert.equal(ids.includes("gemma_capacity_preflight"), true);
    assert.equal(ids.includes("monitoring_goal_loop"), true);
    assert.equal(result.mutation_flags.external_mutation_performed, false);
    assert.equal(result.mutation_flags.provider_mutation_performed, false);
    assert.equal(result.mutation_flags.production_mutation_performed, false);
  });
});
