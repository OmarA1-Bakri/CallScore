import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CANDLE_REFRESH_SYMBOLS,
  buildFetchWindows,
  isValidCandleOpenTimeMs,
  parseCandleRefreshArgs,
} from "../src/scripts/refresh-candles";
import { INVALID_CANDLE_OPEN_TIME_SQL } from "../src/scripts/validate-candle-open-time-constraint";
import {
  buildDataVisionMonthlyUrl,
  enumerateMonths,
  parseBulkBackfillArgs,
  parseDataVisionCsv,
} from "../src/scripts/backfill-candles-data-vision";

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

test("candle open_time guard accepts milliseconds and rejects seconds", () => {
  assert.equal(isValidCandleOpenTimeMs(Date.parse("2026-05-01T00:00:00Z")), true);
  assert.equal(isValidCandleOpenTimeMs(1_714_521_600), false);
  assert.equal(isValidCandleOpenTimeMs(Date.parse("2200-01-01T00:00:00Z")), false);
});

test("candle constraint validation audits invalid legacy rows before ALTER VALIDATE", () => {
  assert.match(INVALID_CANDLE_OPEN_TIME_SQL, /COUNT\(\*\)::bigint AS invalid_count/i);
  assert.match(INVALID_CANDLE_OPEN_TIME_SQL, /open_time < \$1 OR open_time > \$2/i);
});

test("Binance data.vision bulk backfill is bounded and dry-run by default", () => {
  const args = parseBulkBackfillArgs([
    "--symbols",
    "btcusdt,ethusdt",
    "--start-month",
    "2026-01",
    "--end-month",
    "2026-03",
    "--max-files-per-symbol",
    "2",
  ]);

  assert.equal(args.write, false);
  assert.deepEqual(args.symbols, ["BTCUSDT", "ETHUSDT"]);
  assert.deepEqual(enumerateMonths(args.startMonth, args.endMonth, args.maxFilesPerSymbol), ["2026-01", "2026-02"]);
  assert.equal(
    buildDataVisionMonthlyUrl("btcusdt", "2026-01"),
    "https://data.binance.vision/data/spot/monthly/klines/BTCUSDT/1m/BTCUSDT-1m-2026-01.zip",
  );
});

test("Binance data.vision CSV parser keeps valid millisecond candles", () => {
  const rows = parseDataVisionCsv([
    "open_time,open,high,low,close,volume",
    "1767225600000,100,110,90,105,123",
    "1767225660,100,110,90,105,123",
  ].join("\n"));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].open_time, 1767225600000);
  assert.equal(rows[0].close, 105);
});
