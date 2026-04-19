import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultBacktestRange,
  parseIsoDate,
  parseIsoDateAsEndOfDay,
  parseIsoDateAsStartOfDay,
} from "../src/lib/backtest-params";

test("parseIsoDate returns null for empty / null / undefined / malformed input", () => {
  assert.equal(parseIsoDate(null), null);
  assert.equal(parseIsoDate(undefined), null);
  assert.equal(parseIsoDate(""), null);
  assert.equal(parseIsoDate("not-a-date"), null);
});

test("parseIsoDateAsStartOfDay snaps a YYYY-MM-DD input to 00:00:00.000Z", () => {
  const d = parseIsoDateAsStartOfDay("2025-06-15");
  assert.ok(d !== null);
  assert.equal(d.toISOString(), "2025-06-15T00:00:00.000Z");
});

test("parseIsoDateAsEndOfDay snaps a YYYY-MM-DD input to 23:59:59.999Z", () => {
  const d = parseIsoDateAsEndOfDay("2025-12-31");
  assert.ok(d !== null);
  assert.equal(d.toISOString(), "2025-12-31T23:59:59.999Z");
});

test("parseIsoDateAsStartOfDay / parseIsoDateAsEndOfDay propagate null on malformed input", () => {
  assert.equal(parseIsoDateAsStartOfDay("bogus"), null);
  assert.equal(parseIsoDateAsEndOfDay(undefined), null);
});

test("defaultBacktestRange returns trailing 365d snapped to UTC day bounds", () => {
  const now = new Date("2026-04-19T05:00:00.000Z");
  const { start, end } = defaultBacktestRange(now);
  assert.equal(start.toISOString(), "2025-04-19T00:00:00.000Z");
  assert.equal(end.toISOString(), "2026-04-19T23:59:59.999Z");
});
