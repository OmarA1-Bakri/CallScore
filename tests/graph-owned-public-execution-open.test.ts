import * as assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, test } from "node:test";

import {
  evaluateExternalMutationRequest,
  finalizeExternalMutationReceipt,
} from "../src/lib/workplane/external-mutation-guard";
import {
  runLinkedInOwnedPublishNode,
  runRedditCommentOrSubredditPublishNode,
  runRedditOwnedProfilePublishNode,
  runXOwnedPublishNode,
  runXPublicReplyNode,
  runLinkedInPublicCommentNode,
} from "../src/lib/workplane/node-wrappers/social-publish-nodes";
import {
  runYoutubeMetadataUpdateNode,
  runYoutubePublicCommentNode,
  runYoutubeThumbnailUpdateNode,
  runYoutubeVideoPublishNode,
} from "../src/lib/workplane/node-wrappers/video-publish-nodes";

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

function context(overrides: Record<string, unknown>) {
  return {
    operating_graph_run_id: "graph-run-open-public-001",
    graph_node_id: "x_owned_publish_node",
    goal: "revenue_now",
    platform: "x",
    mutation_family: "public_publish",
    acting_agent_id: "callscore-public-executor",
    authority: "owned_public_publish",
    approved_payload_hash: payloadHash((overrides as Record<string, unknown>).payload_for_hash ?? { text: "CallScore public update" }),
    provider_execution_receipt_id: "provider-exec-001",
    dry_run: false,
    ...overrides,
  };
}

const providerResponse = { ok: true, id: "public-object-001", url: "https://example.com/public-object-001" };

describe("graph-owned public publishing and engagement open by default", () => {
  test("live_owned_public guard allows graph-owned public publish without manual approval", () => {
    const decision = evaluateExternalMutationRequest({
      mode: "live_owned_public",
      graph_context: context({ graph_node_id: "x_owned_publish_node", platform: "x", mutation_family: "public_publish", payload_for_hash: { text: "CallScore public update" } }),
      requested_action: "publish_owned_public",
      platform: "x",
      provider_tool: "TWITTER_CREATION_OF_A_POST",
      provider_payload: { text: "CallScore public update" },
      mutation_flags: {},
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.provider_call_permitted, true);
  });

  test("X owned post and public reply open when provider/payload/target exist", () => {
    const owned = runXOwnedPublishNode({
      graph_context: context({ graph_node_id: "x_owned_publish_node", platform: "x", mutation_family: "public_publish", payload_for_hash: { text: "CallScore public update" } }),
      provider_tool: "TWITTER_CREATION_OF_A_POST",
      provider_response: providerResponse,
      payload: { text: "CallScore public update" },
    });
    assert.equal(owned.status, "ok");
    assert.equal(owned.mutation_flags.public_publish_performed, true);

    const reply = runXPublicReplyNode({
      graph_context: context({ graph_node_id: "x_public_reply_node", platform: "x", mutation_family: "public_engagement", payload_for_hash: { text: "Relevant CallScore reply" } }),
      target_url_or_id: "https://x.com/creator/status/1",
      provider_tool: "TWITTER_CREATION_OF_A_POST",
      provider_response: { ...providerResponse, id: "reply-001" },
      payload: { text: "Relevant CallScore reply" },
    });
    assert.equal(reply.status, "ok");
    assert.equal(reply.mutation_flags.public_engagement_performed, true);
  });

  test("LinkedIn owned post and public comment open without manual approval", () => {
    const owned = runLinkedInOwnedPublishNode({
      graph_context: context({ graph_node_id: "linkedin_owned_publish_node", platform: "linkedin", mutation_family: "public_publish", payload_for_hash: { text: "CallScore LinkedIn update" } }),
      provider_tool: "LINKEDIN_CREATE_LINKED_IN_POST",
      provider_response: providerResponse,
      payload: { text: "CallScore LinkedIn update" },
    });
    assert.equal(owned.status, "ok");

    const comment = runLinkedInPublicCommentNode({
      graph_context: context({ graph_node_id: "linkedin_public_comment_node", platform: "linkedin", mutation_family: "public_engagement", payload_for_hash: { text: "Relevant CallScore comment" } }),
      target_url_or_id: "linkedin-post-001",
      provider_tool: "LINKEDIN_CREATE_COMMENT_ON_POST",
      provider_response: { ...providerResponse, id: "li-comment-001" },
      payload: { text: "Relevant CallScore comment" },
    });
    assert.equal(comment.status, "ok");
    assert.equal(comment.mutation_flags.public_engagement_performed, true);
  });

  test("Reddit profile post, subreddit post, and public comment open with target when needed", () => {
    const profile = runRedditOwnedProfilePublishNode({
      graph_context: context({ graph_node_id: "reddit_owned_publish_node", platform: "reddit", mutation_family: "public_publish", payload_for_hash: { title: "CallScore update", text: "Public profile post" } }),
      provider_tool: "REDDIT_CREATE_REDDIT_POST",
      provider_response: providerResponse,
      payload: { title: "CallScore update", text: "Public profile post" },
    });
    assert.equal(profile.status, "ok");

    const subreddit = runRedditCommentOrSubredditPublishNode({
      graph_context: context({ graph_node_id: "reddit_public_comment_node", platform: "reddit", mutation_family: "public_engagement", payload_for_hash: { title: "CallScore thread", text: "Relevant subreddit post" } }),
      target_url_or_id: "r/CryptoCurrency",
      provider_tool: "REDDIT_CREATE_REDDIT_POST",
      provider_response: { ...providerResponse, id: "reddit-post-001" },
      payload: { title: "CallScore thread", text: "Relevant subreddit post" },
    });
    assert.equal(subreddit.status, "ok");
  });

  test("YouTube publish/comment/update open when graph-owned and execution inputs exist", () => {
    const publish = runYoutubeVideoPublishNode({
      graph_context: context({ graph_node_id: "youtube_publish_node", goal: "produce_video", platform: "youtube", mutation_family: "video_publish", payload_for_hash: { title: "CallScore video", description: "Daily video", video_path: "/tmp/rendered.mp4" } }),
      provider_tool: "YOUTUBE_UPLOAD_VIDEO",
      provider_response: { ...providerResponse, videoId: "yt-001" },
      rendered_video_path: "/tmp/rendered.mp4",
      payload: { title: "CallScore video", description: "Daily video", video_path: "/tmp/rendered.mp4" },
    });
    assert.equal(publish.status, "ok");
    assert.equal(publish.mutation_flags.public_publish_performed, true);

    const comment = runYoutubePublicCommentNode({
      graph_context: context({ graph_node_id: "youtube_public_comment_node", goal: "produce_video", platform: "youtube", mutation_family: "public_engagement", payload_for_hash: { text: "Relevant CallScore comment" } }),
      target_url_or_id: "yt-target-001",
      provider_tool: "YOUTUBE_COMMENT",
      provider_response: { ...providerResponse, id: "yt-comment-001" },
      payload: { text: "Relevant CallScore comment" },
    });
    assert.equal(comment.status, "ok");
    assert.equal(comment.mutation_flags.public_engagement_performed, true);

    const thumb = runYoutubeThumbnailUpdateNode({
      graph_context: context({ graph_node_id: "youtube_thumbnail_update_node", goal: "produce_video", platform: "youtube", mutation_family: "video_update", payload_for_hash: { thumbnail_path: "/tmp/thumb.png" } }),
      target_url_or_id: "yt-001",
      provider_tool: "YOUTUBE_UPDATE_THUMBNAIL",
      provider_response: providerResponse,
      payload: { thumbnail_path: "/tmp/thumb.png" },
    });
    assert.equal(thumb.status, "ok");

    const metadata = runYoutubeMetadataUpdateNode({
      graph_context: context({ graph_node_id: "youtube_metadata_update_node", goal: "produce_video", platform: "youtube", mutation_family: "video_update", payload_for_hash: { title: "Updated title", description: "Updated description" } }),
      target_url_or_id: "yt-001",
      provider_tool: "YOUTUBE_UPDATE_VIDEO",
      provider_response: providerResponse,
      payload: { title: "Updated title", description: "Updated description" },
    });
    assert.equal(metadata.status, "ok");
  });

  test("draft_only and missing graph context still block before provider call", () => {
    const draft = evaluateExternalMutationRequest({
      mode: "draft_only",
      graph_context: context({}),
      requested_action: "publish_owned_public",
      platform: "x",
      provider_tool: "TWITTER_CREATION_OF_A_POST",
    });
    assert.equal(draft.allowed, false);
    assert.equal(draft.blocker_code, "draft_only_external_mutation_blocked");

    const missing = evaluateExternalMutationRequest({
      mode: "live_owned_public",
      graph_context: null,
      requested_action: "publish_owned_public",
      platform: "x",
      provider_tool: "TWITTER_CREATION_OF_A_POST",
    });
    assert.equal(missing.allowed, false);
    assert.equal(missing.blocker_code, "missing_operating_graph_context");
  });

  test("provider failure writes failed receipt and never marks mutation true", () => {
    const failed = finalizeExternalMutationReceipt({
      mode: "live_owned_public",
      graph_context: context({ graph_node_id: "x_owned_publish_node", platform: "x", mutation_family: "public_publish", payload_for_hash: { text: "CallScore public update" } }),
      requested_action: "publish_owned_public",
      platform: "x",
      provider_tool: "TWITTER_CREATION_OF_A_POST",
      provider_response: { ok: false, error: "provider failed" },
      mutation_flags: {
        external_mutation_performed: true,
        provider_mutation_performed: true,
        public_publish_performed: true,
      },
      provider_execution_receipt_id: "provider-exec-failed",
      child_receipt_ids: ["provider-exec-failed"],
    });
    assert.equal(failed.allowed, false);
    assert.equal(failed.receipt?.status, "failed");
    assert.equal(failed.receipt?.provider_mutation_performed, false);
    assert.equal(failed.receipt?.public_publish_performed, false);
  });
});
