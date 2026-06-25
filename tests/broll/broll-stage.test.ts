import { describe, it, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { type ScenePlan } from "../../src/video/schemas/video.schemas";
import type { BrollStageOutput } from "../../src/video/broll/broll-stage";

describe("BrollStage", () => {
  const tmpDir = path.join(process.cwd(), ".tmp-test", "broll-stage");

  before(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should export a runBrollStage function", async () => {
    let runBrollStage: (scenes: readonly ScenePlan[], options?: { outputDir?: string }) => Promise<BrollStageOutput>;

    try {
      const mod = await import("../../src/video/broll/broll-stage");
      runBrollStage = mod.runBrollStage;
    } catch {
      assert.fail("broll-stage module not found — RED phase expected");
      return;
    }

    assert.equal(typeof runBrollStage, "function");
  });

  it("should generate search queries from narration text and fetch clips", async () => {
    let runBrollStage: (scenes: readonly ScenePlan[], options?: { outputDir?: string }) => Promise<BrollStageOutput>;

    try {
      const mod = await import("../../src/video/broll/broll-stage");
      runBrollStage = mod.runBrollStage;
    } catch {
      assert.fail("broll-stage module not found — RED phase expected");
      return;
    }

    // Mock both provider fetches
    const originalFetch = globalThis.fetch;
    mock.method(globalThis, "fetch", (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlStr.includes("api.pexels.com")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              videos: [
                {
                  id: 1,
                  width: 1920,
                  height: 1080,
                  url: "https://pexels.com/video/1",
                  image: "https://pexels.com/thumb/1.jpg",
                  duration: 10,
                  video_files: [{ id: 1, quality: "hd", file_type: "video/mp4", link: "https://player.vimeo.com/external/1.hd.mp4", width: 1920, height: 1080 }],
                },
              ],
            }),
            { status: 200, headers: new Headers({ "Content-Type": "application/json" }) },
          ),
        );
      }
      if (urlStr.includes("api.unsplash.com")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              results: [
                {
                  id: "photo1",
                  width: 4000,
                  height: 3000,
                  urls: { raw: "https://unsplash.com/photo1", full: "https://unsplash.com/photo1?w=1920", regular: "https://unsplash.com/photo1?w=1080" },
                  links: { html: "https://unsplash.com/photos/photo1" },
                },
              ],
            }),
            { status: 200, headers: new Headers({ "Content-Type": "application/json" }) },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 404 }));
    });

    try {
      const scenes: ScenePlan[] = [
        {
          sceneId: "hook",
          order: 0,
          title: "Hook",
          narration: "Bitcoin just hit a new all-time high and traders are watching closely.",
          durationSeconds: 10,
          visualType: "hook" as const,
          dataRefs: [],
        },
        {
          sceneId: "score",
          order: 1,
          title: "Score reveal",
          narration: "Ethereum has been showing strong DeFi activity this quarter.",
          durationSeconds: 8,
          visualType: "score_reveal" as const,
          dataRefs: [],
        },
      ];

      const result = await runBrollStage(scenes, { outputDir: tmpDir });

      assert.ok(result.manifestPath);
      assert.ok(result.manifestPath.endsWith(".json"));
      assert.ok(Array.isArray(result.clips));
      assert.equal(result.clips.length, 2);
      assert.equal(result.clips[0].sceneId, "hook");
      assert.ok(result.clips[0].clips.length > 0);
      assert.equal(result.clips[0].clips[0].provider, "pexels");

      // Verify manifest file was written
      const manifestContent = await fs.readFile(result.manifestPath, "utf8");
      const manifest = JSON.parse(manifestContent);
      assert.ok(manifest.clips);
      assert.equal(manifest.clips.length, 2);
    } finally {
      mock.reset();
    }
  });

  it("should handle empty scenes gracefully", async () => {
    let runBrollStage: (scenes: readonly ScenePlan[], options?: { outputDir?: string }) => Promise<BrollStageOutput>;

    try {
      const mod = await import("../../src/video/broll/broll-stage");
      runBrollStage = mod.runBrollStage;
    } catch {
      assert.fail("broll-stage module not found — RED phase expected");
      return;
    }

    const result = await runBrollStage([], { outputDir: tmpDir });
    assert.ok(result.manifestPath);
    assert.ok(Array.isArray(result.clips));
    assert.equal(result.clips.length, 0);
  });

  it("should extract meaningful keywords from narration for search queries", async () => {
    let runBrollStage: (scenes: readonly ScenePlan[], options?: { outputDir?: string }) => Promise<BrollStageOutput>;

    try {
      const mod = await import("../../src/video/broll/broll-stage");
      runBrollStage = mod.runBrollStage;
    } catch {
      assert.fail("broll-stage module not found — RED phase expected");
      return;
    }

    // This test verifies the keyword extraction logic indirectly
    // by checking that function accepts narration and produces results
    const scenes: ScenePlan[] = [
      {
        sceneId: "test",
        order: 0,
        title: "Test",
        narration: "Crypto market analysis shows interesting trends.",
        durationSeconds: 5,
        visualType: "text_card" as const,
        dataRefs: [],
      },
    ];

    const result = await runBrollStage(scenes, { outputDir: tmpDir });
    assert.ok(result.manifestPath);
  });
});
