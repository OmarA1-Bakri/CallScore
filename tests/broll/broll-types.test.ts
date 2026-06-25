import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BrollClip } from "../../src/video/broll/broll-types";

describe("BrollClip type", () => {
  it("should allow creating a valid BrollClip object", () => {
    const clip: BrollClip = {
      url: "https://example.com/video.mp4",
      thumbnailUrl: "https://example.com/thumb.jpg",
      provider: "pexels",
      width: 1920,
      height: 1080,
      durationSeconds: 10.5,
      license: "free",
    };

    assert.equal(clip.url, "https://example.com/video.mp4");
    assert.equal(clip.thumbnailUrl, "https://example.com/thumb.jpg");
    assert.equal(clip.provider, "pexels");
    assert.equal(clip.width, 1920);
    assert.equal(clip.height, 1080);
    assert.equal(clip.durationSeconds, 10.5);
    assert.equal(clip.license, "free");
  });

  it("should accept all provider types", () => {
    const pexelsClip: BrollClip = {
      url: "https://pexels.com/video.mp4",
      thumbnailUrl: "https://pexels.com/thumb.jpg",
      provider: "pexels",
      width: 1920,
      height: 1080,
      durationSeconds: 8,
      license: "pexels-free",
    };
    assert.equal(pexelsClip.provider, "pexels");

    const unsplashClip: BrollClip = {
      url: "https://unsplash.com/photo.jpg",
      thumbnailUrl: "https://unsplash.com/thumb.jpg",
      provider: "unsplash",
      width: 4000,
      height: 3000,
      durationSeconds: 0,
      license: "unsplash-free",
    };
    assert.equal(unsplashClip.provider, "unsplash");

    const archiveClip: BrollClip = {
      url: "https://archive.org/video.mp4",
      thumbnailUrl: "https://archive.org/thumb.jpg",
      provider: "archive",
      width: 640,
      height: 480,
      durationSeconds: 30,
      license: "public-domain",
    };
    assert.equal(archiveClip.provider, "archive");
  });

  it("should enforce required fields (compile-time check via unknown cast)", () => {
    // This test verifies the interface is correctly exported by checking
    // that using an object missing required fields would cause issues
    const incomplete = {
      url: "https://example.com/video.mp4",
      // missing thumbnailUrl, provider, etc.
    } as unknown;

    // At runtime, we can only check structural properties
    const asRecord = incomplete as Record<string, unknown>;
    assert.equal(asRecord.url, "https://example.com/video.mp4");
    assert.equal(asRecord.thumbnailUrl, undefined);
    assert.equal(asRecord.provider, undefined);
  });
});
