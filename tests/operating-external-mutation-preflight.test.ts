import * as assert from "node:assert/strict";
import { test } from "node:test";

import { buildInitialOperatingState, createCallscoreOperatingGraph } from "../src/lib/workplane/callscore-operating-graph";

test("operating graph always routes through external mutation preflight before revenue lane", async () => {
  const graph = createCallscoreOperatingGraph();
  const result = await graph.invoke(buildInitialOperatingState({ goal: "revenue_now", mode: "draft_only", testFixtures: true }));
  const nodeIds = result.node_results.map((item) => item.node_id);
  const gateIndex = nodeIds.indexOf("external_mutation_preflight");
  const revenueIndex = nodeIds.indexOf("revenue_goal_loop");

  assert.notEqual(gateIndex, -1);
  assert.notEqual(revenueIndex, -1);
  assert.equal(gateIndex < revenueIndex, true);
  assert.equal(result.mutation_flags.external_mutation_performed, false);
  assert.equal(result.mutation_flags.provider_mutation_performed, false);
  assert.equal(result.mutation_flags.public_publish_performed, false);
});

test("approved publish mode without approval evidence blocks before goal lane execution", async () => {
  const graph = createCallscoreOperatingGraph();
  const result = await graph.invoke(buildInitialOperatingState({ goal: "produce_video", mode: "approved_publish", dryRun: false, approved: true, testFixtures: true }));
  const nodeIds = result.node_results.map((item) => item.node_id);

  assert.equal(nodeIds.includes("external_mutation_preflight"), true);
  assert.equal(nodeIds.includes("video_goal_loop"), false);
  assert.equal(result.blockers.includes("external_mutation_approval_missing"), true);
  assert.equal(result.mutation_flags.external_mutation_performed, false);
  assert.equal(result.mutation_flags.provider_mutation_performed, false);
  assert.equal(result.mutation_flags.public_publish_performed, false);
});


test("operating graph source registers graph-owned external mutation node ids", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile("src/lib/workplane/callscore-operating-graph.ts", "utf8");
  for (const nodeId of [
    "x_owned_publish_node",
    "linkedin_owned_publish_node",
    "reddit_owned_profile_publish_node",
    "reddit_comment_or_subreddit_publish_node",
    "youtube_video_publish_node",
    "youtube_thumbnail_update_node",
    "gmail_send_node",
    "resend_alert_send_node",
    "whop_mutation_node",
    "attio_write_node",
    "posthog_write_node",
  ]) {
    assert.match(source, new RegExp(`\\.addNode\\("${nodeId}"`));
  }
});
