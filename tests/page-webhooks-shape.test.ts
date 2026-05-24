import { test } from "node:test";
import { strict as assert } from "node:assert";
import { read, FORBIDDEN_ROUNDED } from "./page-helpers";

const src = read("src/app/webhooks/page.tsx");

test("/webhooks uses editorial primitives", () => {
  assert.match(src, /EditorialSection/);
  assert.match(src, /MetaStrip/);
  assert.match(src, /Chip/);
});

test("/webhooks is a standalone product page, not settings chrome", () => {
  assert.doesNotMatch(src, /SettingsShell/);
  assert.doesNotMatch(src, /<main\b/);
  assert.equal((src.match(/<h1\b/g) ?? []).length, 1);
});

test("/webhooks has metadata and canonical alternate", () => {
  assert.match(src, /title: TITLE/);
  assert.match(src, /alternates:\s*\{\s*canonical:\s*"\/webhooks"\s*\}/);
});

test("/webhooks keeps Alpha/API positioning and settings CTAs", () => {
  assert.match(src, /Alpha delivery/);
  assert.match(src, /signed CallScore events/i);
  assert.match(src, /new_call_digest/);
  assert.match(src, /consensus_signal/);
  assert.match(src, /plan gate/);
  assert.match(src, /href="\/settings\/webhooks"/);
  assert.match(src, /href="\/pricing"/);
});

test("/webhooks has no rounded dashboard chrome", () => {
  assert.doesNotMatch(src, FORBIDDEN_ROUNDED);
});
