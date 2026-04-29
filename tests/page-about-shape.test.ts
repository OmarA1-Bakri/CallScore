// tests/page-about-shape.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { read, FORBIDDEN_PHOSPHOR } from "./page-helpers";

const src = read("src/app/about/page.tsx");
const root = join(__dirname, "..");

test("/about uses editorial primitives", () => {
  assert.match(src, /EditorialSection/);
});

test("/about contains no phosphor-green hardcoded colors", () => {
  for (const re of FORBIDDEN_PHOSPHOR) assert.doesNotMatch(src, re);
});

test("/about does not import BrandWordmark", () => {
  assert.doesNotMatch(src, /BrandWordmark/);
});

test("BrandWordmark.tsx has been deleted", () => {
  assert.equal(existsSync(join(root, "src/app/about/BrandWordmark.tsx")), false);
});

test("/about uses font-serif for the hero", () => {
  assert.match(src, /font-serif/);
});
