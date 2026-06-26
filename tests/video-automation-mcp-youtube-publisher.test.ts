import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { McpYoutubePublisher } from "../src/video/composio/mcp-youtube-publisher";
import { mockVideoCandidates } from "../src/video/data/mock-video-candidates";
import { planVideo } from "../src/video/planning/video-planner.graph";
import { rankVideoCandidates } from "../src/video/data/rank-video-candidates";

async function makeHelper(dir: string): Promise<string> {
  const helper = path.join(dir, "helper.py");
  await fs.writeFile(helper, `
import json, sys
payload=json.load(open(sys.argv[1]))
print(json.dumps({
  "ok": True,
  "youtubeVideoId": "private-video-123",
  "publishUrl": "https://youtu.be/private-video-123",
  "privacyStatus": "private",
  "rawInput": payload,
}))
`, "utf8");
  return helper;
}

const graphContext = {
  operating_graph_run_id: "graph-run-mcp-youtube-001",
  graph_node_id: "youtube_publish_node",
  goal: "produce_video",
  platform: "youtube",
  mutation_family: "video_publish",
  acting_agent_id: "callscore-video-publish-node",
  authority: "gated_external_send",
  approval_receipt_id: "approval-mcp-youtube-001",
  evidence_receipt_id: "evidence-mcp-youtube-001",
  originality_receipt_id: "originality-mcp-youtube-001",
  approved_payload_hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  dry_run: false,
} as const;

test("McpYoutubePublisher wraps helper result into canonical publish result", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "callscore-mcp-publisher-"));
  const helperPath = await makeHelper(dir);
  const ranked = rankVideoCandidates(mockVideoCandidates, new Date("2026-06-23T00:00:00.000Z"));
  const plan = planVideo({ rankedCandidates: ranked, runDate: "2026-06-23T00:00:00.000Z" });
  const publisher = new McpYoutubePublisher({ helperPath, pythonPath: "python3", timeoutMs: 30_000, artifactDir: dir });
  const result = await publisher.publishVideo({
    jobId: "test-job",
    videoPath: path.join(dir, "video.mp4"),
    thumbnailPath: path.join(dir, "thumbnail.jpg"),
    metadata: plan.metadata,
    privacyStatus: "private",
    graph_context: graphContext,
  });
  assert.equal(result.youtubeVideoId, "private-video-123");
  assert.equal(result.privacyStatus, "private");
});

test("McpYoutubePublisher blocks non-private mode by default", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "callscore-mcp-publisher-"));
  const helperPath = await makeHelper(dir);
  const ranked = rankVideoCandidates(mockVideoCandidates, new Date("2026-06-23T00:00:00.000Z"));
  const plan = planVideo({ rankedCandidates: ranked, runDate: "2026-06-23T00:00:00.000Z" });
  const publisher = new McpYoutubePublisher({ helperPath, pythonPath: "python3", timeoutMs: 30_000 });
  await assert.rejects(
    () => publisher.publishVideo({
      jobId: "test-job",
      videoPath: path.join(dir, "video.mp4"),
      thumbnailPath: path.join(dir, "thumbnail.jpg"),
      metadata: plan.metadata,
      privacyStatus: "public",
      graph_context: graphContext,
    }),
    /private-only/,
  );
});


test("McpYoutubePublisher rejects forged minimal graph context before helper execution", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "callscore-mcp-publisher-"));
  const helperPath = await makeHelper(dir);
  const ranked = rankVideoCandidates(mockVideoCandidates, new Date("2026-06-23T00:00:00.000Z"));
  const plan = planVideo({ rankedCandidates: ranked, runDate: "2026-06-23T00:00:00.000Z" });
  const publisher = new McpYoutubePublisher({ helperPath, pythonPath: "python3", timeoutMs: 30_000, artifactDir: dir });

  await assert.rejects(
    () => publisher.publishVideo({
      jobId: "test-job",
      videoPath: path.join(dir, "video.mp4"),
      thumbnailPath: path.join(dir, "thumbnail.jpg"),
      metadata: plan.metadata,
      privacyStatus: "private",
      graph_context: { graph_node_id: "youtube_publish_node" } as never,
    }),
    /missing_operating_graph_context|approval_missing|invalid_type/,
  );
});
