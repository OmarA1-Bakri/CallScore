import * as assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
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
    "runDiscordOwnedPublishNode",
    "runWhopListingUpdateNode",
    "runCredentialRotationNode",
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
    "discord_send_node",
    "whop_listing_update_node",
    "credential_rotation_node",
  ]) {
    assert.doesNotMatch(source, new RegExp(`\\.addNode\\("${nodeId}", graphOwnedMutationPlaceholderNode`));
  }
});

test("live owned-public Discord uses a real node and never calls provider before graph preflight", async () => {
  const previousMode = process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE;
  const previousMock = process.env.CALLSCORE_GRAPH_PROVIDER_MOCK_RESPONSE_JSON;
  const previousAppDir = process.env.CALLSCORE_APP_DIR;
  const appDir = mkdtempSync(`${tmpdir()}/callscore-discord-preflight-`);
  process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE = "1";
  process.env.CALLSCORE_GRAPH_PROVIDER_MOCK_RESPONSE_JSON = JSON.stringify({
    DISCORDBOT_CREATE_MESSAGE: { ok: true, channel_id: "channel-preflight", message_id: "must-not-exist" },
  });
  process.env.CALLSCORE_APP_DIR = appDir;

  try {
    const graph = createCallscoreOperatingGraph();
    const payload = { channel_id: "channel-preflight", content: "must not send" };
    const result = await graph.invoke(buildInitialOperatingState({
      goal: "revenue_now",
      mode: "live_owned_public",
      dryRun: false,
      approved: true,
      approvalReceiptId: "approval-discord-preflight",
      testFixtures: true,
      artifacts: {
        graph_mutation_inputs: {
          discord_send_node: {
            graph_context: {
              operating_graph_run_id: "graph-run-discord-preflight",
              graph_node_id: "discord_send_node",
              goal: "revenue_now",
              platform: "discord",
              mutation_family: "public_publish",
              acting_agent_id: "callscore-community-head",
              authority: "owned_public_publish",
              approval_receipt_id: "approval-discord-preflight",
              evidence_receipt_id: "evidence-discord-preflight",
              originality_receipt_id: "originality-discord-preflight",
              approved_payload_hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              dry_run: false,
              parent_receipt_id: "approval-discord-preflight",
            },
            approved: true,
            provider_tool: "DISCORDBOT_CREATE_MESSAGE",
            provider_payload: payload,
            payload,
          },
        },
      },
    }));

    const nodeIds = result.node_results.map((item) => item.node_id);
    const preflightIndex = nodeIds.indexOf("external_mutation_preflight");
    const discordIndex = nodeIds.indexOf("discord_send_node");
    const discordNode = result.node_results[discordIndex];
    assert.notEqual(discordIndex, -1);
    assert.equal(preflightIndex < discordIndex, true);
    assert.equal(discordNode?.status, "blocked");
    assert.equal(discordNode?.detail.blocker_code, "approved_payload_hash_mismatch");
    assert.deepEqual(discordNode?.detail.provider_calls, []);
    assert.equal(discordNode?.detail.provider_response, null);
    assert.equal(existsSync(`${appDir}/.tmp/workflow-receipts/provider_execution`), false);
  } finally {
    if (previousMode === undefined) delete process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE;
    else process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE = previousMode;
    if (previousMock === undefined) delete process.env.CALLSCORE_GRAPH_PROVIDER_MOCK_RESPONSE_JSON;
    else process.env.CALLSCORE_GRAPH_PROVIDER_MOCK_RESPONSE_JSON = previousMock;
    if (previousAppDir === undefined) delete process.env.CALLSCORE_APP_DIR;
    else process.env.CALLSCORE_APP_DIR = previousAppDir;
  }
});
