import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createVideoJobState, VIDEO_STAGES } from "../../src/video/queues/video-queues";
import { VideoJobStateSchema, VideoJobStatusSchema } from "../../src/video/schemas/video.schemas";

describe("VideoJobState creation with broll fields", () => {
  it("should create a state with brollManifestPath nullable field", () => {
    const state = createVideoJobState({
      jobId: "test-broll-field-001",
      format: "weekly_investigation",
    });

    // Verify brollManifestPath is present and null by default
    assert.ok("brollManifestPath" in state);
    assert.equal(state.brollManifestPath, null);

    // Verify the field is accepted by the schema (would throw if missing)
    const parsed = VideoJobStateSchema.parse(state);
    assert.equal(parsed.brollManifestPath, null);
  });

  it("should include broll in VIDEO_STAGES between captions and render", () => {
    const stages = [...VIDEO_STAGES];
    const captionsIdx = stages.indexOf("captions");
    const brollIdx = stages.indexOf("broll");
    const renderIdx = stages.indexOf("render");

    assert.notEqual(captionsIdx, -1, "captions stage must exist");
    assert.notEqual(brollIdx, -1, "broll stage must exist");
    assert.notEqual(renderIdx, -1, "render stage must exist");
    assert.equal(brollIdx, captionsIdx + 1, "broll must follow captions");
    assert.equal(renderIdx, brollIdx + 1, "render must follow broll");
  });

  it("should include broll_ready in VideoJobStatus enum", () => {
    const parsed = VideoJobStatusSchema.parse("broll_ready");
    assert.equal(parsed, "broll_ready");
  });
});
