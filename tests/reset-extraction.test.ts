import test from "node:test";
import assert from "node:assert/strict";
import { parseResetExtractionArgs } from "../src/scripts/reset-extraction";

test("reset extraction script defaults to dry-run", () => {
  assert.deepEqual(parseResetExtractionArgs([]), {
    write: false,
    confirmed: false,
  });
});

test("reset extraction script requires both write and confirmation flags", () => {
  assert.deepEqual(parseResetExtractionArgs(["--write"]), {
    write: true,
    confirmed: false,
  });
  assert.deepEqual(parseResetExtractionArgs(["--write", "--confirm-reset-extraction"]), {
    write: true,
    confirmed: true,
  });
});
