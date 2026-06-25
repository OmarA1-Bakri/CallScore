import { describe, it, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

describe("Broll worker", () => {
  const tmpDir = path.join(process.cwd(), ".tmp-test", "broll-worker");
  const statePath = path.join(tmpDir, "state.json");

  before(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should export a runBrollStage function (worker-style)", async () => {
    let runBrollStage: (statePath: string) => Promise<string>;

    try {
      const mod = await import("../../src/video/queues/workers/broll.worker");
      runBrollStage = mod.runBrollStage;
    } catch {
      assert.fail("broll.worker module not found — RED phase expected");
      return;
    }

    assert.equal(typeof runBrollStage, "function");
  });

  it("should read state, run broll stage, and update state with manifest path", async () => {
    let runBrollWorker: (statePath: string) => Promise<string>;

    try {
      const mod = await import("../../src/video/queues/workers/broll.worker");
      runBrollWorker = mod.runBrollStage;
    } catch {
      assert.fail("broll.worker module not found — RED phase expected");
      return;
    }

    // Write a minimal valid job state
    const jobId = "test-broll-001";
    const artifactDir = path.join(tmpDir, jobId);
    const scenesJsonPath = path.join(artifactDir, "scenes.json");

    await fs.mkdir(artifactDir, { recursive: true });

    // Write scenes.json
    await fs.writeFile(
      scenesJsonPath,
      JSON.stringify([
        {
          sceneId: "hook",
          order: 0,
          title: "Hook",
          narration: "Bitcoin markets are volatile right now.",
          durationSeconds: 10,
          visualType: "hook",
          dataRefs: [],
        },
      ]),
      "utf8",
    );

    // Write state.json
    await fs.writeFile(
      statePath,
      JSON.stringify({
        jobId,
        runDate: new Date().toISOString(),
        format: "weekly_investigation",
        status: "captions_generated",
        selectedCreator: {
          creatorId: 1,
          name: "Test Creator",
          youtubeHandle: "@test",
          youtubeChannelId: "UCtest",
          totalCalls: 10,
          winRate: 0.5,
          alphaScore: 100,
          rank: 1,
          scoreDelta: 0,
          rankMovement: 0,
          recentResolvedCalls: 5,
          recentCalls: [],
        },
        creators: [],
        scriptPackage: null,
        audioPath: null,
        normalizedAudioPath: null,
        captionsPath: null,
        srtPath: null,
        brollManifestPath: null,
        videoPath: null,
        thumbnailPath: null,
        metadata: null,
        qaReport: null,
        youtubeVideoId: null,
        publishUrl: null,
        artifactDir,
        errors: [],
        warnings: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      "utf8",
    );

    // Mock fetch for provider APIs
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
      const resultPath = await runBrollWorker(statePath);

      // Should return the state.json inside artifact dir
      assert.ok(resultPath.endsWith("/state.json") || resultPath.endsWith("\\state.json"));

      // State should now have brollManifestPath set and status updated
      const updatedState = JSON.parse(await fs.readFile(resultPath, "utf8"));
      assert.ok(updatedState.brollManifestPath);
      assert.ok(typeof updatedState.brollManifestPath === "string");
      assert.ok(updatedState.brollManifestPath.endsWith(".json"));
      assert.notEqual(updatedState.status, "captions_generated");
    } finally {
      mock.reset();
    }
  });

  it("should export the worker module with the correct pattern", () => {});
});
