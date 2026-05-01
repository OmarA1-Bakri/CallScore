import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(__dirname, "..", "src/components/PeriodFilter.tsx"),
  "utf8",
);

test("no rounded-lg/md pill chrome", () => {
  assert.doesNotMatch(src, /\brounded-(lg|md|xl)\b/);
});

test("active state uses accent underline (border-b)", () => {
  assert.match(src, /border-b-2/);
  assert.match(src, /border-accent/);
});

test("font-mono uppercase tabs", () => {
  assert.match(src, /font-mono/);
  assert.match(src, /uppercase/);
});
