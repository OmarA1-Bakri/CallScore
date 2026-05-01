// tests/floatingfeedback-shape.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(__dirname, "..", "src/components/FloatingFeedbackButton.tsx"),
  "utf8",
);

test("no rounded-full or hover:scale chrome", () => {
  assert.doesNotMatch(src, /\brounded-full\b/);
  assert.doesNotMatch(src, /\bhover:scale-/);
  assert.doesNotMatch(src, /\bglow-/);
});

test("renders a next/link, not a button", () => {
  assert.match(src, /from\s+["']next\/link["']/);
});
