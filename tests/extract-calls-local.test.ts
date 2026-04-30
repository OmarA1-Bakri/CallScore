import test from "node:test";
import assert from "node:assert/strict";
import { parseLocalExtractionArgs } from "../src/scripts/extract-calls-local";

test("local extraction defaults to a bounded batch size", () => {
  assert.deepEqual(parseLocalExtractionArgs([]), { limit: 250 });
});

test("local extraction accepts a positive integer limit", () => {
  assert.deepEqual(parseLocalExtractionArgs(["--limit", "75"]), { limit: 75 });
});

test("local extraction falls back for missing or invalid limits", () => {
  assert.deepEqual(parseLocalExtractionArgs(["--limit"]), { limit: 250 });
  assert.deepEqual(parseLocalExtractionArgs(["--limit", "0"]), { limit: 250 });
  assert.deepEqual(parseLocalExtractionArgs(["--limit", "wat"]), { limit: 250 });
});
