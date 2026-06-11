// tests/page-methodology-shape.test.ts
//
// Phase 3 Task 4 guardrail: ensures /methodology was rebuilt against the
// editorial dev-pack (EditorialSection / MetaStrip / Chip composition),
// dropped the legacy lucide pipeline icons + rounded-lg chrome, and still
// references the public-methodology score weights and tracked-creator data.
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { read } from "./page-helpers";

const src = read("src/app/methodology/page.tsx");

test("/methodology uses EditorialSection / MetaStrip / Chip", () => {
  assert.match(src, /EditorialSection/);
  assert.match(src, /MetaStrip/);
  assert.match(src, /Chip/);
});

test("/methodology drops the lucide pipeline icons", () => {
  assert.doesNotMatch(src, /Crosshair|Brain|Video|Database|Award/);
});

test("/methodology has no rounded-{lg,xl} chrome", () => {
  assert.doesNotMatch(src, /\brounded-(lg|xl|2xl)\b/);
});

test("/methodology preserves SCORE_WEIGHTS-driven content", () => {
  assert.match(src, /SCORE_WEIGHTS/);
});

test("/methodology labels TRACKED_CREATOR_COUNT as seed-list scope", () => {
  assert.match(src, /TRACKED_CREATOR_COUNT|TRACKED_COINS/);
  assert.match(src, /creator seed list/);
  assert.doesNotMatch(src, /creators tracked", v: TRACKED_CREATOR_COUNT/);
});
