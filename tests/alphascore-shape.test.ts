import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(__dirname, "..", "src/components/AlphaScoreBadge.tsx"),
  "utf8",
);

test("uses spec semantic tokens only (no ink-yellow/orange/blue/etc.)", () => {
  assert.doesNotMatch(src, /\b(text|bg|border)-(yellow|orange|blue|pink|cyan|purple)-\d/);
});

test("does not use rounded-full or rounded-xl", () => {
  assert.doesNotMatch(src, /\brounded-(full|xl|lg)\b/);
});

test("uses serif numeral and mono unit", () => {
  assert.match(src, /font-serif/);
  assert.match(src, /α/);
});

test("exports AlphaScoreBar (horizontal bar variant)", () => {
  assert.match(src, /export function AlphaScoreBar/);
});

test("does not render an SVG ring", () => {
  assert.doesNotMatch(src, /<svg[^>]*viewBox="0 0 100 100"/);
});
