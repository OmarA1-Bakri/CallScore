// tests/page-creator-shape.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { read } from "./page-helpers";

const src = read("src/app/creator/[handle]/page.tsx");

test("creator page uses editorial primitives", () => {
  assert.match(src, /EditorialSection/);
  assert.match(src, /MetaStrip/);
});

test("creator page preserves notFound and query fetches", () => {
  assert.match(src, /notFound\(\)/);
  assert.match(src, /findCreatorByHandle<Creator>/);
  assert.match(src, /query<CreatorStats>/);
  assert.match(src, /query<Call>/);
});

test("creator page does not use rounded-{lg,xl}", () => {
  assert.doesNotMatch(src, /\brounded-(lg|xl|2xl)\b/);
});

test("creator page imports AlphaScoreBadge (not AlphaScoreBar — that's leaderboard)", () => {
  assert.match(src, /import AlphaScoreBadge/);
});

test("creator page distinguishes directional wins from target hit rate", () => {
  assert.match(src, /direction win/);
  assert.match(src, /directional win rate on resolved calls/);
  assert.match(src, /Target Hit Rate/);
});
