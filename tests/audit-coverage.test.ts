import test from "node:test";
import assert from "node:assert/strict";
import { summarizeAuditCoverage } from "../src/lib/audit-coverage";

const now = new Date("2026-04-25T00:00:00.000Z");

test("audit coverage summary separates scored, low-confidence, pending, and ambiguous ticker risk", () => {
  const summary = summarizeAuditCoverage(
    [
      {
        id: 1,
        symbol: "BTCUSDT",
        raw_quote: "Bitcoin is breaking out and could push higher.",
        extraction_confidence: 0.95,
        call_date: "2025-10-01T00:00:00.000Z",
        price_at_call: 100,
        target_price: null,
        price_30d: 110,
        price_90d: null,
        return_30d: 10,
        hit_target: null,
      },
      {
        id: 2,
        symbol: "ETHUSDT",
        raw_quote: "Ethereum could rally.",
        extraction_confidence: 0.6,
        call_date: "2025-10-01T00:00:00.000Z",
        price_at_call: 100,
        target_price: null,
        price_30d: 110,
        price_90d: null,
        return_30d: 10,
        hit_target: null,
      },
      {
        id: 3,
        symbol: "SOLUSDT",
        raw_quote: "Solana could rally.",
        extraction_confidence: 0.95,
        call_date: "2026-04-10T00:00:00.000Z",
        price_at_call: 100,
        target_price: null,
        price_30d: null,
        price_90d: null,
        return_30d: null,
        hit_target: null,
      },
      {
        id: 4,
        symbol: "LINKUSDT",
        raw_quote: "Use my LINK below, bullish market setup.",
        extraction_confidence: 0.95,
        call_date: "2025-10-01T00:00:00.000Z",
        price_at_call: 100,
        target_price: null,
        price_30d: 110,
        price_90d: null,
        return_30d: 10,
        hit_target: null,
      },
    ],
    now,
  );

  assert.equal(summary.totalCalls, 4);
  assert.equal(summary.scoreStatus.scored, 2);
  assert.equal(summary.scoreStatus.excluded_confidence, 1);
  assert.equal(summary.scoreStatus.pending_horizon, 1);
  assert.equal(summary.ambiguousTickerRisk.total, 1);
  assert.deepEqual(summary.ambiguousTickerRisk.bySymbol, { LINKUSDT: 1 });
});
