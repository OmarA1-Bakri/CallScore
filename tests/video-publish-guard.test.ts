import * as assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { ComposioToolExecutor } from "../src/video/composio/composio-client";
import { ComposioYoutubePublisher } from "../src/video/composio/youtube-publisher";

const videoNodesModulePath = "../src/lib/workplane/node-wrappers/" + "video-publish-nodes";

type VideoPublishDecision = {
  readonly status: "ok" | "blocked" | "failed";
  readonly blocker_code?: string;
  readonly provider_call_permitted?: boolean;
  readonly mutation_flags?: {
    readonly provider_mutation_performed?: boolean;
    readonly public_publish_performed?: boolean;
  };
};

type VideoPublishNodesModule = {
  runYoutubeVideoPublishNode: (input: Record<string, unknown>) => VideoPublishDecision | Promise<VideoPublishDecision>;
  runYoutubeThumbnailUpdateNode: (input: Record<string, unknown>) => VideoPublishDecision | Promise<VideoPublishDecision>;
};

class RecordingExecutor implements ComposioToolExecutor {
  readonly calls: Array<{ toolSlug: string; input: Record<string, unknown> }> = [];

  async executeTool(toolSlug: string, input: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ toolSlug, input });
    return { ok: true, id: "yt-red-test-001" };
  }
}

async function loadVideoNodes(): Promise<VideoPublishNodesModule> {
  return await import(videoNodesModulePath) as VideoPublishNodesModule;
}

const graphContext = {
  operating_graph_run_id: "graph-run-video-001",
  graph_node_id: "youtube_video_publish_node",
  goal: "produce_video",
  platform: "youtube",
  mutation_family: "video_publish",
  acting_agent_id: "callscore-video-publish-node",
  authority: "gated_external_send",
  approval_receipt_id: "approval-video-001",
  approved_payload_hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  dry_run: false,
};

describe("video publish graph-only RED contract", () => {
  test("YouTube publish blocks without QA report and approval", async () => {
    const nodes = await loadVideoNodes();
    const decision = await nodes.runYoutubeVideoPublishNode({
      graph_context: graphContext,
      approval_receipt_id: null,
      qa_report_path: null,
      payload: {
        title: "CallScore daily briefing",
        description: "Daily CallScore briefing",
        thumbnail_path: "https://example.com/thumb.jpg",
        captions_path: "captions.vtt",
        video_path: "composio://47563/youtube/video.mp4?name=video.mp4&mimetype=video/mp4",
      },
    });

    assert.equal(decision.status, "blocked");
    assert.equal(decision.blocker_code, "youtube_qa_and_approval_required");
    assert.equal(decision.provider_call_permitted, false);
  });

  test("thumbnail update blocks without operating graph context", async () => {
    const nodes = await loadVideoNodes();
    const decision = await nodes.runYoutubeThumbnailUpdateNode({
      graph_context: null,
      video_id: "yt-existing-001",
      thumbnail_url: "https://example.com/thumb.jpg",
      provider_tool: "YOUTUBE_UPDATE_THUMBNAIL",
    });

    assert.equal(decision.status, "blocked");
    assert.equal(decision.blocker_code, "non_graph_youtube_mutation_blocked");
    assert.equal(decision.provider_call_permitted, false);
  });

  test("metadata update blocks without operating graph context", async () => {
    const nodes = await loadVideoNodes();
    const decision = await nodes.runYoutubeThumbnailUpdateNode({
      graph_context: null,
      video_id: "yt-existing-001",
      metadata: { title: "Updated title" },
      provider_tool: "YOUTUBE_UPDATE_VIDEO",
    });

    assert.equal(decision.status, "blocked");
    assert.equal(decision.blocker_code, "non_graph_youtube_mutation_blocked");
    assert.equal(decision.provider_call_permitted, false);
  });

  test("Composio YouTube publisher refuses to call provider without graph context", async () => {
    const executor = new RecordingExecutor();
    const publisher = new ComposioYoutubePublisher(executor);

    await assert.rejects(
      () => publisher.publishVideo({
        jobId: "job-red-graph-context",
        videoPath: "composio://47563/youtube/video.mp4?name=video.mp4&mimetype=video/mp4",
        thumbnailPath: "https://example.com/thumbnail.jpg",
        privacyStatus: "private",
        metadata: {
          title: "CallScore test",
          description: "CallScore test description",
          tags: ["CallScore"],
          categoryId: "28",
          madeForKids: false,
          language: "en",
        },
      }),
      /missing_operating_graph_context|non_graph_youtube_mutation_blocked/,
    );

    assert.equal(executor.calls.length, 0);
  });
});
