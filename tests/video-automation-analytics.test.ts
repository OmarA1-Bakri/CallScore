import assert from "node:assert/strict";
import test from "node:test";
import { ingestYoutubeAnalytics } from "../src/video/analytics/analytics-ingestion";
import type { ComposioToolExecutor } from "../src/video/composio/composio-client";

class MockExecutor implements ComposioToolExecutor {
  async executeTool(toolSlug: string, input: Record<string, unknown>): Promise<unknown> {
    assert.equal(toolSlug, "YOUTUBE_GET_VIDEO_DETAILS_BATCH");
    assert.deepEqual(input.id, ["video-123"]);
    return { data: { items: [{ id: "video-123", snippet: { title: "CallScore update" }, status: { privacyStatus: "public" }, statistics: { viewCount: "42", likeCount: "5", commentCount: "1" } }] } };
  }
}

test("YouTube analytics ingestion parses numeric statistics defensively", async () => {
  const snapshot = await ingestYoutubeAnalytics({ videoId: "video-123", executor: new MockExecutor() });
  assert.equal(snapshot.title, "CallScore update");
  assert.equal(snapshot.viewCount, 42);
  assert.equal(snapshot.likeCount, 5);
  assert.equal(snapshot.commentCount, 1);
});
