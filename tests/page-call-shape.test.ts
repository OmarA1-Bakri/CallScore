// tests/page-call-shape.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { read } from "./page-helpers";

const src = read("src/app/call/[id]/page.tsx");

test("call page uses editorial primitives", () => {
  assert.match(src, /EditorialSection/);
  assert.match(src, /MetaStrip/);
});

test("call page preserves notFound and core data fetches", () => {
  assert.match(src, /notFound\(\)/);
});

test("call page does not use rounded-{lg,xl}", () => {
  assert.doesNotMatch(src, /\brounded-(lg|xl|2xl)\b/);
});
