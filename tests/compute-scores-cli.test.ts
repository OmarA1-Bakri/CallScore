import test from "node:test";
import assert from "node:assert/strict";
import { parseComputeScoresArgs } from "../src/scripts/compute-scores";

test("compute-scores CLI parses explicit full recompute modes", () => {
  assert.deepEqual(parseComputeScoresArgs([]), { mode: "full" });
  assert.deepEqual(parseComputeScoresArgs(["--confirm-full-recompute"]), { mode: "full" });
});

test("compute-scores CLI supports bounded call and video canaries", () => {
  assert.deepEqual(parseComputeScoresArgs(["--call-id", "6105"]), {
    mode: "canary",
    callIds: [6105],
    videoId: null,
    limit: 5,
  });
  assert.deepEqual(parseComputeScoresArgs(["--call-ids", "6105,6106,6105", "--video-id", "20290", "--limit", "1"]), {
    mode: "canary",
    callIds: [6105, 6106],
    videoId: 20290,
    limit: 1,
  });
});

test("compute-scores CLI rejects misleading or unbounded canary flags", () => {
  assert.throws(
    () => parseComputeScoresArgs(["--limit", "1"]),
    /requires --call-id, --call-ids, or --video-id/,
  );
  assert.throws(
    () => parseComputeScoresArgs(["--video-id", "20290", "--limit", "6"]),
    /must be <=5/,
  );
  assert.throws(
    () => parseComputeScoresArgs(["--creator-id", "1"]),
    /Unsupported compute-scores arguments/,
  );
});
