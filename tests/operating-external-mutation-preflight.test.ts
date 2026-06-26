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


test("operating graph source wires public graph-owned mutation nodes to real wrappers, not placeholders", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile("src/lib/workplane/callscore-operating-graph.ts", "utf8");
  const realWrappers = [
    "runXOwnedPublishNode",
    "runXPublicReplyNode",
    "runLinkedInOwnedPublishNode",
    "runLinkedInPublicCommentNode",
    "runRedditOwnedProfilePublishNode",
    "runRedditCommunityMutationNode",
    "runYoutubeVideoPublishNode",
    "runYoutubePublicCommentNode",
    "runYoutubeThumbnailUpdateNode",
    "runYoutubeMetadataUpdateNode",
  ];
  for (const wrapper of realWrappers) {
    assert.match(source, new RegExp(wrapper));
  }
  for (const nodeId of [
    "x_owned_publish_node",
    "x_public_reply_node",
    "linkedin_owned_publish_node",
    "linkedin_public_comment_node",
    "reddit_owned_publish_node",
    "reddit_public_comment_node",
    "youtube_publish_node",
    "youtube_public_comment_node",
    "youtube_thumbnail_update_node",
    "youtube_metadata_update_node",
  ]) {
    assert.doesNotMatch(source, new RegExp(`\\.addNode\\("${nodeId}", graphOwnedMutationPlaceholderNode`));
  }
});
