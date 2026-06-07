// tests/page-pricing-shape.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { read, FORBIDDEN_PHOSPHOR } from "./page-helpers";

const src = read("src/app/pricing/page.tsx");

test("/pricing has no phosphor-green hardcoded colors", () => {
  for (const re of FORBIDDEN_PHOSPHOR) assert.doesNotMatch(src, re);
});

test("/pricing uses editorial primitives", () => {
  assert.match(src, /EditorialSection|MetaStrip|font-serif/);
});

test("/pricing has a 3-column plan grid", () => {
  assert.match(src, /tab:grid-cols-3|desk:grid-cols-3|grid-cols-3/);
});

test("/pricing keeps the feature matrix table with 12 features", () => {
  assert.match(src, /const FEATURES/);
});

test("/pricing presents only the 90d recent-context filter as a paid feature", () => {
  assert.match(src, /90-day recent-context filter/);
  assert.doesNotMatch(src, /Recent-performance filters \(30\/90d\)|30\/90d planned|Recent-performance filter \(30\/90d planned\)/);
});

test("/pricing does not use the `cat /docs/pricing.md` terminal-prompt header", () => {
  assert.doesNotMatch(src, /cat \/docs/);
});
