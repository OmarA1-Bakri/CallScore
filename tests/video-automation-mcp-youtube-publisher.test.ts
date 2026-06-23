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
    }),
    /private-only/,
  );
});
