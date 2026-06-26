import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildVideoArtifactPaths } from "../src/video/artifacts/artifact-paths";
import { runPublishStage } from "../src/video/queues/workers/publish.worker";
import { createVideoJobState } from "../src/video/queues/video-queues";
import { VideoJobStateSchema } from "../src/video/schemas/video.schemas";
import type { VideoPublisher } from "../src/video/composio/youtube-publisher";
import type { YoutubePublishInput } from "../src/video/schemas/youtube.schemas";

const graphContext = {
  operating_graph_run_id: "graph-run-worker-001",
  graph_node_id: "youtube_publish_node",
  goal: "produce_video",
  platform: "youtube",
  mutation_family: "video_publish",
  acting_agent_id: "callscore-video-publish-node",
  authority: "gated_external_send",
  approval_receipt_id: "approval-worker-001",
  evidence_receipt_id: "evidence-worker-001",
  originality_receipt_id: "originality-worker-001",
  approved_payload_hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  dry_run: false,
} as const;

class CapturingPublisher implements VideoPublisher {
  input: YoutubePublishInput | null = null;
  async publishVideo(input: YoutubePublishInput) {
    this.input = input;
    return { jobId: input.jobId, youtubeVideoId: "yt-worker-001", publishUrl: "https://youtu.be/yt-worker-001", privacyStatus: input.privacyStatus, publishAt: input.publishAt ?? null, rawResponse: { ok: true } };
  }
}

test("publish worker propagates stored graph_context into publisher input", async () => {
  const root = mkdtempSync(join(tmpdir(), "video-publish-worker-graph-"));
  const base = createVideoJobState({ jobId: "video-worker-graph", format: "daily_short", artifactRoot: root, now: new Date("2026-06-25T00:00:00.000Z") });
  const state = VideoJobStateSchema.parse({
    ...base,
    status: "qa_passed",
    videoPath: "composio://47563/youtube/video.mp4?name=video.mp4&mimetype=video/mp4",
    thumbnailPath: "https://example.com/thumbnail.jpg",
    metadata: { title: "CallScore worker", description: "CallScore worker description", tags: ["CallScore"], categoryId: "28", madeForKids: false, language: "en" },
    qaReport: { ok: true, checkedAt: "2026-06-25T00:00:00.000Z", format: "daily_short", videoExists: true, audioStreamPresent: true, dimensionsOk: true, durationOk: true, thumbnailExists: true, metadataValid: true, claimsValid: true, warnings: [], errors: [] },
    graph_context: graphContext,
  });
  const paths = buildVideoArtifactPaths(state.jobId, root);
  mkdirSync(paths.artifactDir, { recursive: true });
  await writeFile(paths.stateJson, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  const publisher = new CapturingPublisher();
  await runPublishStage(paths.stateJson, { publisher, env: { ...process.env, VIDEO_AUTO_PUBLISH: "true", VIDEO_PRIVACY_STATUS: "private" } });
  assert.deepEqual(publisher.input?.graph_context, graphContext);
});
