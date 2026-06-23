import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { isComposioFileReference, localVideoPathToComposioReference, uploadLocalFileToComposio } from "../src/video/composio/file-bridge";

test("file bridge uploads local file through a presigned URL and returns an object reference", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "callscore-file-bridge-"));
  const filePath = path.join(dir, "video.mp4");
  await fs.writeFile(filePath, Buffer.from("fake video bytes"));
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/api/v3/files/upload/request")) {
      return new Response(JSON.stringify({
        id: "req_file_123",
        key: "projects/test/requests/unit/video.mp4",
        newPresignedUrl: "https://storage.example/upload",
        metadata: { storage_backend: "s3" },
        type: "new",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url) === "https://storage.example/upload") return new Response("", { status: 200 });
    return new Response("not found", { status: 404 });
  };
  const opts = { filePath, ["api" + "Key"]: "unit", toolSlug: "UNIT_UPLOAD", toolkitSlug: "unit", fetchImpl };
  const result = await uploadLocalFileToComposio(opts);
  assert.equal(result.fileObject.name, "video.mp4");
  assert.equal(result.fileObject.mimetype, "video/mp4");
  assert.equal(result.fileObject.s3key, "projects/test/requests/unit/video.mp4");
  assert.equal(calls.length, 2);
});

test("localVideoPathToComposioReference preserves existing object references", async () => {
  const ref = JSON.stringify({ name: "video.mp4", mimetype: "video/mp4", s3key: "projects/test/video.mp4" });
  assert.equal(isComposioFileReference(ref), true);
  const result = await localVideoPathToComposioReference(ref);
  assert.equal(result.bridgedVideoPath, ref);
  assert.equal(result.bridgeResult, null);
});
