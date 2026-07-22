import test from "node:test";
import assert from "node:assert/strict";
import { extractionRunExitCode } from "../src/scripts/extract-calls-llm";

test("extractor exits nonzero when any selected video fails or is not processed", () => {
  assert.equal(extractionRunExitCode({ videos: 4, processed: 0, failed: 4 }), 1);
  assert.equal(extractionRunExitCode({ videos: 4, processed: 3, failed: 1 }), 1);
  assert.equal(extractionRunExitCode({ videos: 4, processed: 4, failed: 0 }), 0);
  assert.equal(extractionRunExitCode({ videos: 0, processed: 0, failed: 0 }), 0);
});
