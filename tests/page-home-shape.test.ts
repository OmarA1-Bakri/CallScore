import { test } from "node:test";
import { strict as assert } from "node:assert";
import { read, FORBIDDEN_PHOSPHOR } from "./page-helpers";

const src = read("src/app/page.tsx");

test("home uses editorial primitives, not Trophy pill", () => {
  assert.match(src, /EditorialSection/);
  assert.match(src, /MetaStrip/);
  assert.doesNotMatch(src, /Trophy/);
});

test("no phosphor-green hardcoded colors", () => {
  for (const re of FORBIDDEN_PHOSPHOR) assert.doesNotMatch(src, re);
});

test("no rounded-full or pill chrome", () => {
  assert.doesNotMatch(src, /\brounded-full\b/);
});

test("hero h1 uses font-serif", () => {
  // The new hero h1 must carry font-serif (or be inside a serif-defaulting block).
  assert.match(src, /font-serif/);
});

test("server-side data fetch preserved (query() and getPublicCounts())", () => {
  assert.match(src, /query<LeaderboardQueryRow>/);
  assert.match(src, /getPublicCounts/);
});
