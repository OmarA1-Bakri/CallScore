import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CANDLE_REFRESH_SYMBOLS,
  buildFetchWindows,
  parseCandleRefreshArgs,
} from "../src/scripts/refresh-candles";

const MINUTE = 60_000;

test("candle refresh defaults to safe dry-run with tracked symbols plus XLM", () => {
  const args = parseCandleRefreshArgs([]);

  assert.equal(args.write, false);
  assert.equal(args.maxRequestsPerSymbol, 25);
  assert.equal(args.gapMs, 250);
  assert.equal(args.auditOut, null);
  assert.ok(DEFAULT_CANDLE_REFRESH_SYMBOLS.includes("BTCUSDT"));
  assert.ok(DEFAULT_CANDLE_REFRESH_SYMBOLS.includes("XLMUSDT"));
});

test("candle refresh parses explicit bounded write arguments", () => {
  const args = parseCandleRefreshArgs([
    "--symbols",
    "ethusdt, XRPUSDT,ethusdt",
    "--start-date",
    "2026-03-29T00:00:00Z",
    "--end-date",
    "2026-05-01T00:00:00Z",
    "--max-requests-per-symbol",
    "3",
    "--gap-ms",
    "1000",
    "--audit-out",
    ".tmp/candles.jsonl",
    "--write",
  ]);

  assert.deepEqual(args.symbols, ["ETHUSDT", "XRPUSDT"]);
  assert.equal(args.startDate, "2026-03-29T00:00:00Z");
  assert.equal(args.endDate, "2026-05-01T00:00:00Z");
  assert.equal(args.maxRequestsPerSymbol, 3);
  assert.equal(args.gapMs, 1000);
  assert.equal(args.auditOut, ".tmp/candles.jsonl");
  assert.equal(args.write, true);
});

test("buildFetchWindows refreshes forward from latest candle and respects request limit", () => {
  const startDateMs = Date.parse("2026-03-29T00:00:00Z");
  const latestOpenTime = Date.parse("2026-03-30T00:00:00Z");
  const endDateMs = latestOpenTime + 3000 * MINUTE;

  const windows = buildFetchWindows({ latestOpenTime, startDateMs, endDateMs, maxRequests: 2 });

  assert.equal(windows.length, 2);
  assert.equal(windows[0].startTime, latestOpenTime + MINUTE);
  assert.equal(windows[0].endTime, latestOpenTime + 1000 * MINUTE);
  assert.equal(windows[1].startTime, latestOpenTime + 1001 * MINUTE);
});
