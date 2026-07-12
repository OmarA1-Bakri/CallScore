import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { bridgeGraphOwnedProviderMedia, executeGraphOwnedProviderCall } from "../src/lib/workplane/node-wrappers/graph-owned-provider-adapter";

test("YouTube graph media bridge stages a local MP4 into videoFilePath", async () => {
  const previous = process.env.CALLSCORE_GRAPH_FILE_UPLOAD_TEST_MODE;
  process.env.CALLSCORE_GRAPH_FILE_UPLOAD_TEST_MODE = "1";
  try {
    const dir = mkdtempSync(join(tmpdir(), "callscore-youtube-bridge-"));
    const path = join(dir, "candidate.mp4");
    writeFileSync(path, Buffer.from("video-fixture"));
    const input: Record<string, unknown> = {
      provider_tool: "YOUTUBE_UPLOAD_VIDEO",
      provider_payload: {
        title: "Evidence-led call review",
        description: "A bounded publication candidate.",
        tags: ["CallScore"],
        categoryId: "27",
        privacyStatus: "public",
      },
      payload: {
        title: "Evidence-led call review",
        description: "A bounded publication candidate.",
        tags: ["CallScore"],
        categoryId: "27",
        privacyStatus: "public",
      },
      graph_context: {
        approved_payload_hash: "sha256:placeholder",
      },
      media_gate: {
        visual_required: true,
        media_plan: "media",
        local_path: path,
        mimetype: "video/mp4",
      },
    };

    const result = await bridgeGraphOwnedProviderMedia(input);
    assert.equal(result.ok, true);
    const payload = input.provider_payload as Record<string, unknown>;
    assert.deepEqual(payload.videoFilePath, {
      name: "candidate.mp4",
      mimetype: "video/mp4",
      s3key: "test/YOUTUBE_UPLOAD_VIDEO/candidate.mp4",
    });
    assert.deepEqual(input.payload, payload);
    assert.match(String((input.graph_context as Record<string, unknown>).approved_payload_hash), /^sha256:[a-f0-9]{64}$/);
  } finally {
    if (previous === undefined) delete process.env.CALLSCORE_GRAPH_FILE_UPLOAD_TEST_MODE;
    else process.env.CALLSCORE_GRAPH_FILE_UPLOAD_TEST_MODE = previous;
  }
});

test("YouTube graph media bridge prefers the Composio API key for file staging", async () => {
  const previousMode = process.env.CALLSCORE_GRAPH_FILE_UPLOAD_TEST_MODE;
  const previousApi = process.env.COMPOSIO_API_KEY;
  const previousFileApi = process.env.COMPOSIO_FILE_UPLOAD_API_KEY;
  const previousFetch = globalThis.fetch;
  delete process.env.CALLSCORE_GRAPH_FILE_UPLOAD_TEST_MODE;
  process.env.COMPOSIO_API_KEY = "composio-api-key";
  process.env.COMPOSIO_FILE_UPLOAD_API_KEY = "consumer-file-key";
  let requestKey: string | null = null;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("/files/upload/request")) {
      requestKey = new Headers(init?.headers).get("x-api-key");
      return new Response(JSON.stringify({ data: { new_presigned_url: "https://upload.test/video", key: "real/video.mp4", metadata: { storage_backend: "s3" } } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("", { status: 200 });
  };
  try {
    const dir = mkdtempSync(join(tmpdir(), "callscore-youtube-bridge-key-"));
    const path = join(dir, "candidate.mp4");
    writeFileSync(path, Buffer.from("video-fixture"));
    const input: Record<string, unknown> = {
      provider_tool: "YOUTUBE_UPLOAD_VIDEO",
      provider_payload: { title: "Evidence-led call review" },
      graph_context: { approved_payload_hash: "sha256:placeholder" },
      media_gate: { visual_required: true, media_plan: "media", local_path: path, mimetype: "video/mp4" },
    };
    const result = await bridgeGraphOwnedProviderMedia(input);
    assert.equal(result.ok, true);
    assert.equal(requestKey, "composio-api-key");
    assert.equal(((input.provider_payload as Record<string, unknown>).videoFilePath as Record<string, unknown>).s3key, "real/video.mp4");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousMode === undefined) delete process.env.CALLSCORE_GRAPH_FILE_UPLOAD_TEST_MODE; else process.env.CALLSCORE_GRAPH_FILE_UPLOAD_TEST_MODE = previousMode;
    if (previousApi === undefined) delete process.env.COMPOSIO_API_KEY; else process.env.COMPOSIO_API_KEY = previousApi;
    if (previousFileApi === undefined) delete process.env.COMPOSIO_FILE_UPLOAD_API_KEY; else process.env.COMPOSIO_FILE_UPLOAD_API_KEY = previousFileApi;
  }
});

test("YouTube graph media bridge chunks Workbench fallback for large files", async () => {
  const previousMode = process.env.CALLSCORE_GRAPH_FILE_UPLOAD_TEST_MODE;
  const previousProviderMode = process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE;
  const previousMock = process.env.CALLSCORE_GRAPH_PROVIDER_MOCK_RESPONSE_JSON;
  const previousApi = process.env.COMPOSIO_API_KEY;
  const previousFetch = globalThis.fetch;
  delete process.env.CALLSCORE_GRAPH_FILE_UPLOAD_TEST_MODE;
  process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE = "1";
  process.env.CALLSCORE_GRAPH_PROVIDER_MOCK_RESPONSE_JSON = JSON.stringify({ COMPOSIO_REMOTE_WORKBENCH: { ok: true, s3key: "workbench/video.mp4" } });
  process.env.COMPOSIO_API_KEY = "expired-key";
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "Invalid API key" } }), { status: 401, headers: { "content-type": "application/json" } });
  try {
    const dir = mkdtempSync(join(tmpdir(), "callscore-youtube-bridge-chunks-"));
    const path = join(dir, "large-candidate.mp4");
    writeFileSync(path, Buffer.alloc(900 * 1024, 7));
    const input: Record<string, unknown> = {
      provider_tool: "YOUTUBE_UPLOAD_VIDEO",
      provider_payload: { title: "Evidence-led call review" },
      graph_context: { approved_payload_hash: "sha256:placeholder" },
      media_gate: { visual_required: true, media_plan: "media", local_path: path, mimetype: "video/mp4" },
    };
    const result = await bridgeGraphOwnedProviderMedia(input);
    assert.equal(result.ok, true);
    assert.equal(((input.provider_payload as Record<string, unknown>).videoFilePath as Record<string, unknown>).s3key, "workbench/video.mp4");
    assert.ok((result.providerExecutionReceiptIds?.length ?? 0) >= 4);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousMode === undefined) delete process.env.CALLSCORE_GRAPH_FILE_UPLOAD_TEST_MODE; else process.env.CALLSCORE_GRAPH_FILE_UPLOAD_TEST_MODE = previousMode;
    if (previousProviderMode === undefined) delete process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE; else process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE = previousProviderMode;
    if (previousMock === undefined) delete process.env.CALLSCORE_GRAPH_PROVIDER_MOCK_RESPONSE_JSON; else process.env.CALLSCORE_GRAPH_PROVIDER_MOCK_RESPONSE_JSON = previousMock;
    if (previousApi === undefined) delete process.env.COMPOSIO_API_KEY; else process.env.COMPOSIO_API_KEY = previousApi;
  }
});

test("YouTube upload normalization extracts nested response_data video IDs", async () => {
  const previousMode = process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE;
  const previousMock = process.env.CALLSCORE_GRAPH_PROVIDER_MOCK_RESPONSE_JSON;
  process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE = "1";
  process.env.CALLSCORE_GRAPH_PROVIDER_MOCK_RESPONSE_JSON = JSON.stringify({
    YOUTUBE_UPLOAD_VIDEO: { ok: true, data: { response_data: { id: "qf5gVo05Uh8", status: { privacyStatus: "public" } } } },
  });
  try {
    const result = await executeGraphOwnedProviderCall("YOUTUBE_UPLOAD_VIDEO", { title: "Evidence-led call review" });
    assert.equal(result.ok, true);
    assert.equal(result.response.id, "qf5gVo05Uh8");
    assert.equal(result.response.url, "https://www.youtube.com/watch?v=qf5gVo05Uh8");
  } finally {
    if (previousMode === undefined) delete process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE; else process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE = previousMode;
    if (previousMock === undefined) delete process.env.CALLSCORE_GRAPH_PROVIDER_MOCK_RESPONSE_JSON; else process.env.CALLSCORE_GRAPH_PROVIDER_MOCK_RESPONSE_JSON = previousMock;
  }
});
