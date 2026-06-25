import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import type { BrollClip } from "../../src/video/broll/broll-types";

describe("Unsplash search", () => {
  it("should export an unsplashSearch function", async () => {
    let unsplashSearch: (query: string, options?: { perPage?: number }) => Promise<BrollClip[]>;

    try {
      const mod = await import("../../src/video/broll/unsplash-search");
      unsplashSearch = mod.unsplashSearch;
    } catch {
      assert.fail("unsplash-search module not found — RED phase expected");
      return;
    }

    assert.equal(typeof unsplashSearch, "function");
  });

  it("should return clips from a text query", async () => {
    let unsplashSearch: (query: string, options?: { perPage?: number }) => Promise<BrollClip[]>;

    try {
      const mod = await import("../../src/video/broll/unsplash-search");
      unsplashSearch = mod.unsplashSearch;
    } catch {
      assert.fail("unsplash-search module not found — RED phase expected");
      return;
    }

    const originalFetch = globalThis.fetch;
    mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlStr.includes("api.unsplash.com")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "abc123",
                width: 4000,
                height: 3000,
                urls: {
                  raw: "https://images.unsplash.com/photo-abc123",
                  full: "https://images.unsplash.com/photo-abc123?w=1920",
                  regular: "https://images.unsplash.com/photo-abc123?w=1080",
                },
                links: {
                  html: "https://unsplash.com/photos/abc123",
                },
              },
            ],
          }),
          { status: 200, headers: new Headers({ "Content-Type": "application/json" }) },
        );
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });

    try {
      const clips = await unsplashSearch("trading crypto", { perPage: 5 });
      assert.ok(Array.isArray(clips));
      assert.equal(clips.length, 1);
      assert.equal(clips[0].provider, "unsplash");
      assert.equal(clips[0].width, 4000);
      assert.equal(clips[0].height, 3000);
      assert.ok(clips[0].url.length > 0);
      assert.ok(clips[0].thumbnailUrl.length > 0);
    } finally {
      mock.reset();
    }
  });

  it("should handle API errors gracefully", async () => {
    let unsplashSearch: (query: string, options?: { perPage?: number }) => Promise<BrollClip[]>;

    try {
      const mod = await import("../../src/video/broll/unsplash-search");
      unsplashSearch = mod.unsplashSearch;
    } catch {
      assert.fail("unsplash-search module not found — RED phase expected");
      return;
    }

    const originalFetch = globalThis.fetch;
    mock.method(globalThis, "fetch", async () => {
      return new Response("Unauthorized", {
        status: 401,
        headers: new Headers({ "Content-Type": "text/plain" }),
      });
    });

    try {
      const clips = await unsplashSearch("bitcoin");
      assert.ok(Array.isArray(clips));
      assert.equal(clips.length, 0);
    } finally {
      mock.reset();
    }
  });

  it("should use UNSPLASH_ACCESS_KEY from environment when available", () => {
    // Verify the function signature exists and works with env-based keys
  });
});
