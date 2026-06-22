import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ComposioYoutubePublisher } from "../src/video/composio/youtube-publisher";
import type { ComposioToolExecutor } from "../src/video/composio/composio-client";

class MockExecutor implements ComposioToolExecutor {
  readonly calls: Array<{ toolSlug: string; input: Record<string, unknown> }> = [];
  async executeTool(toolSlug: string, input: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ toolSlug, input });
    if (toolSlug.includes("THUMBNAIL")) return { ok: true };
    return { id: "yt-test-123", ok: true };
  }
}

test("Composio YouTube publisher uses upload and thumbnail tools", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "callscore-video-publisher-"));
  const videoPath = path.join(dir, "video.mp4");
  const thumbnailPath = path.join(dir, "thumbnail.jpg");
  await fs.writeFile(videoPath, "fake-video");
  await fs.writeFile(thumbnailPath, "fake-thumbnail");
  const executor = new MockExecutor();
  const publisher = new ComposioYoutubePublisher(executor);
  const result = await publisher.publishVideo({
    jobId: "job-1",
    videoPath,
    thumbnailPath,
    privacyStatus: "public",
    metadata: { title: "CallScore test", description: "CallScore test description", tags: ["CallScore"], categoryId: "28", madeForKids: false, language: "en" },
  });
  assert.equal(result.youtubeVideoId, "yt-test-123");
  assert.equal(result.publishUrl, "https://youtu.be/yt-test-123");
  assert.equal(executor.calls[0]?.toolSlug, "YOUTUBE_UPLOAD_VIDEO");
  assert.equal(executor.calls[1]?.toolSlug, "YOUTUBE_UPDATE_THUMBNAIL");
});
