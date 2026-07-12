import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { bridgeGraphOwnedProviderMedia } from "../src/lib/workplane/node-wrappers/graph-owned-provider-adapter";

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
