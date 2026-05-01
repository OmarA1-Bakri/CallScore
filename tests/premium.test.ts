import test from "node:test";
import assert from "node:assert/strict";
import { csvEscape, rowsToCsv } from "../src/lib/csv";
import { hasAccess, normalizeTier } from "../src/lib/whop";

test("normalizeTier maps legacy elite sessions to alpha", () => {
  assert.equal(normalizeTier("elite"), "alpha");
  assert.equal(normalizeTier("alpha"), "alpha");
  assert.equal(normalizeTier("pro"), "pro");
  assert.equal(normalizeTier("unknown"), "free");
});

test("hasAccess treats alpha as the highest tier", () => {
  assert.equal(hasAccess("alpha", "pro"), true);
  assert.equal(hasAccess("elite", "alpha"), true);
  assert.equal(hasAccess("pro", "alpha"), false);
  assert.equal(hasAccess("free", "pro"), false);
});

test("csv helpers escape delimiters and quotes", () => {
  assert.equal(csvEscape('BTC, "spot"'), '"BTC, ""spot"""');
  assert.equal(
    rowsToCsv(["symbol", "note"], [{ symbol: "BTC", note: "line\nbreak" }]),
    'symbol,note\r\nBTC,"line\nbreak"\r\n',
  );
});
