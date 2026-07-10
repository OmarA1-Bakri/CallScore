import * as assert from "node:assert/strict";
import { test } from "node:test";

import { extractComposioS3Key } from "../src/lib/workplane/node-wrappers/graph-owned-provider-adapter";

test("extracts an s3key from structured Composio upload output", () => {
  assert.equal(
    extractComposioS3Key({ data: { upload: { s3key: "project/example/media-key" } } }),
    "project/example/media-key",
  );
});

test("extracts an s3key from workbench stdout with log lines before JSON", () => {
  const stdout = [
    "File uploaded to S3 successfully",
    "Reference S3 Key (s3key): project/pr_test/tool_router_session/trs_test/media123",
    '{"ok":true,"upload":{"s3key":"project/pr_test/tool_router_session/trs_test/media123"}}',
  ].join("\n");
  assert.equal(
    extractComposioS3Key({ data: { stdout } }),
    "project/pr_test/tool_router_session/trs_test/media123",
  );
});

test("returns null when Composio output has no staging key", () => {
  assert.equal(extractComposioS3Key({ data: { stdout: "upload failed" } }), null);
});
