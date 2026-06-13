import test from "node:test";
import assert from "node:assert/strict";
import { parseComputeScoresArgs } from "../src/scripts/compute-scores";

test("compute-scores CLI rejects misleading bounded canary flags", () => {
  assert.deepEqual(parseComputeScoresArgs([]), { fullRecompute: true });
  assert.deepEqual(parseComputeScoresArgs(["--confirm-full-recompute"]), { fullRecompute: true });
  assert.throws(
    () => parseComputeScoresArgs(["--limit", "1"]),
    /performs a full public score recompute/,
  );
});
