import assert from "node:assert/strict";
import test from "node:test";
import { ComposioYoutubePublisher } from "../src/video/composio/youtube-publisher";
import type { ComposioToolExecutor } from "../src/video/composio/composio-client";

class MockExecutor implements ComposioToolExecutor {
  readonly calls: Array<{ toolSlug: string; input: Record<string, unknown> }> = [];
  async executeTool(toolSlug: string, input: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ toolSlug, input });
    if (toolSlug.includes("THUMBNAIL")) return { ok: true };
    if (toolSlug.includes("UPDATE")) return { ok: true };
    return { id: "yt-test-123", ok: true };
  }
}

test("Composio YouTube publisher uses exact upload, update, and thumbnail schema fields", async () => {
  const executor = new MockExecutor();
  const publisher = new ComposioYoutubePublisher(executor);
  const result = await publisher.publishVideo({
    jobId: "job-1",
    videoPath: "composio://47563/youtube/video.mp4?name=video.mp4&mimetype=video/mp4",
    thumbnailPath: "https://example.com/thumbnail.jpg",
    privacyStatus: "public",
    metadata: { title: "CallScore test", description: "CallScore test description", tags: ["CallScore"], categoryId: "28", madeForKids: false, language: "en" },
  });
  assert.equal(result.youtubeVideoId, "yt-test-123");
  assert.equal(result.publishUrl, "https://youtu.be/yt-test-123");
  assert.equal(executor.calls[0]?.toolSlug, "YOUTUBE_UPLOAD_VIDEO");
  assert.deepEqual(Object.keys(executor.calls[0]?.input ?? {}).sort(), ["categoryId", "description", "privacyStatus", "tags", "title", "videoFilePath"].sort());
  assert.equal(executor.calls[1]?.toolSlug, "YOUTUBE_UPDATE_VIDEO");
  assert.deepEqual(Object.keys(executor.calls[1]?.input ?? {}).sort(), ["category_id", "description", "privacy_status", "tags", "title", "video_id"].sort());
  assert.equal(executor.calls[2]?.toolSlug, "YOUTUBE_UPDATE_THUMBNAIL");
  assert.deepEqual(Object.keys(executor.calls[2]?.input ?? {}).sort(), ["thumbnailUrl", "videoId"].sort());
});

test("Composio YouTube publisher blocks raw local video paths until a file bridge exists", async () => {
  const publisher = new ComposioYoutubePublisher(new MockExecutor());
  await assert.rejects(
    () => publisher.publishVideo({
      jobId: "job-2",
      videoPath: "/tmp/video.mp4",
      thumbnailPath: "https://example.com/thumbnail.jpg",
      privacyStatus: "private",
      metadata: { title: "CallScore test", description: "CallScore test description", tags: ["CallScore"], categoryId: "28", madeForKids: false, language: "en" },
    }),
    /requires a file object/,
  );
});
