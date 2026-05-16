import { test } from "node:test";
import { strict as assert } from "node:assert";
import { read, FORBIDDEN_ROUNDED } from "./page-helpers";

const src = read("src/app/alerts/page.tsx");

test("/alerts uses editorial primitives", () => {
  assert.match(src, /EditorialSection/);
  assert.match(src, /MetaStrip/);
  assert.match(src, /Chip/);
});

test("/alerts is a standalone product page, not settings chrome", () => {
  assert.doesNotMatch(src, /SettingsShell/);
  assert.doesNotMatch(src, /<main\b/);
  assert.equal((src.match(/<h1\b/g) ?? []).length, 1);
});

test("/alerts has metadata and canonical alternate", () => {
  assert.match(src, /title: TITLE/);
  assert.match(src, /alternates:\s*\{\s*canonical:\s*"\/alerts"\s*\}/);
});

test("/alerts keeps product positioning and settings CTAs", () => {
  assert.match(src, /Paid delivery/);
  assert.match(src, /Watchlists become delivery/);
  assert.match(src, /plan gate/);
  assert.match(src, /href="\/settings\/alerts"/);
  assert.match(src, /href="\/pricing"/);
});

test("/alerts has no rounded dashboard chrome", () => {
  assert.doesNotMatch(src, FORBIDDEN_ROUNDED);
});
