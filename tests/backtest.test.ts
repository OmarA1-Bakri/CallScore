import test from "node:test";
import assert from "node:assert/strict";
import {
  BacktestValidationError,
  runBacktest,
  type BacktestDataProvider,
  type BacktestInput,
} from "../src/lib/backtest";
import type { Call, Creator } from "../src/lib/types";

// Use a frozen evaluation clock far enough past each fixture's call_date
// that the 30d + 90d horizons have elapsed. This matches how the public
// scoring pipeline evaluates calls.
const NOW = new Date("2026-04-12T00:00:00.000Z");

function buildCreator(overrides: Partial<Creator> = {}): Creator {
  return {
    id: 1,
    name: "Test Creator",
    youtube_handle: "@testcreator",
    youtube_channel_id: null,
    subscribers: null,
    focus: null,
    tier: "free",
    total_calls: 0,
    win_rate: 0,
    avg_return: 0,
    alpha_score: 0,
    accuracy_rank: null,
    last_scraped_at: null,
    created_at: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function buildCall(overrides: Partial<Call> = {}): Call {
  return {
    id: 1,
    creator_id: 1,
    video_id: 1,
    symbol: "BTCUSDT",
    direction: "bullish",
    call_type: "buy",
    entry_price: null,
    target_price: null,
    stop_loss: null,
    timeframe: null,
    confidence: "medium",
    strategy_type: "narrative",
    raw_quote: "test",
    extraction_confidence: 0.9,
    specificity_score: 0.25,
    call_date: "2025-01-15T00:00:00.000Z",
    price_at_call: 100,
    btc_price_at_call: 50000,
    price_7d: 105,
    price_30d: 110,
    price_90d: 120,
    btc_price_7d: 50100,
    btc_price_30d: 50200,
    btc_price_90d: 50500,
    return_7d: 5,
    return_30d: 10,
    return_90d: 20,
    alpha_7d: 3,
    alpha_30d: 7,
    alpha_90d: 15,
    hit_target: null,
    correct_direction: true,
    regime_at_call: 4,
    regime_difficulty: 0.7,
    score: 0,
    created_at: "2025-01-15T00:00:00.000Z",
    ...overrides,
  };
}

interface FakeProviderOptions {
  readonly creator?: Creator | null;
  readonly calls?: readonly Call[];
  readonly btcStart?: number | null;
  readonly btcEnd?: number | null;
}

function makeProvider(opts: FakeProviderOptions = {}): BacktestDataProvider {
  const startDefault = 50_000;
  const endDefault = 60_000;
  const providedStart = opts.btcStart;
  const providedEnd = opts.btcEnd;
  let call = 0;
  return {
    async loadCreator() {
      return opts.creator === undefined ? buildCreator() : opts.creator;
    },
    async loadCalls() {
      return opts.calls ?? [];
    },
    async loadBtcPriceAt() {
      call += 1;
      if (call === 1) {
        return providedStart === undefined ? startDefault : providedStart;
      }
      return providedEnd === undefined ? endDefault : providedEnd;
    },
  };
}

test("equal_weight — two known calls compute expected PnL and final capital", async () => {
  const calls: Call[] = [
    buildCall({ id: 1, return_30d: 20, call_date: "2025-02-01T00:00:00.000Z" }),
    buildCall({ id: 2, return_30d: -10, call_date: "2025-03-01T00:00:00.000Z" }),
  ];
  const result = await runBacktest(
    {
      creatorId: 1,
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: new Date("2025-12-31T23:59:59.999Z"),
      initialCapital: 1000,
      strategy: "equal_weight",
    },
    { provider: makeProvider({ calls }), now: NOW },
  );

  // allocation = 500 per call. PnL = 500*0.20 + 500*(-0.10) = 100 - 50 = 50.
  assert.equal(result.callCount, 2);
  assert.equal(result.pnlByCall.length, 2);
  assert.ok(Math.abs(result.pnlByCall[0].pnlDollars - 100) < 1e-6);
  assert.ok(Math.abs(result.pnlByCall[1].pnlDollars + 50) < 1e-6);
  assert.ok(Math.abs(result.finalCapital - 1050) < 1e-6);
  assert.ok(Math.abs(result.totalReturnPct - 5) < 1e-6);
});

test("equal_weight — mixed hits and misses compute totalReturnPct correctly", async () => {
  const calls: Call[] = [
    buildCall({ id: 1, return_30d: 50, call_date: "2025-02-01T00:00:00.000Z" }),
    buildCall({ id: 2, return_30d: -20, call_date: "2025-03-01T00:00:00.000Z" }),
    buildCall({ id: 3, return_30d: 10, call_date: "2025-04-01T00:00:00.000Z" }),
    buildCall({ id: 4, return_30d: -5, call_date: "2025-05-01T00:00:00.000Z" }),
  ];
  const result = await runBacktest(
    {
      creatorId: 1,
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: new Date("2025-12-31T23:59:59.999Z"),
      initialCapital: 1000,
      strategy: "equal_weight",
    },
    { provider: makeProvider({ calls }), now: NOW },
  );

  // allocation = 250. Total = 250*(0.50-0.20+0.10-0.05) = 250*0.35 = 87.5
  assert.equal(result.callCount, 4);
  assert.ok(Math.abs(result.finalCapital - 1087.5) < 1e-6);
  assert.ok(Math.abs(result.totalReturnPct - 8.75) < 1e-6);
  assert.equal(result.hitCount, 2);
  assert.equal(result.missCount, 2);
});

test("direction_only — 3 hits + 2 misses produces net +1 allocation", async () => {
  const calls: Call[] = [
    // Hits: long+positive, short+negative, long+positive
    buildCall({
      id: 1,
      direction: "bullish",
      return_30d: 10,
      call_date: "2025-02-01T00:00:00.000Z",
    }),
    buildCall({
      id: 2,
      direction: "bearish",
      return_30d: -15,
      call_date: "2025-03-01T00:00:00.000Z",
    }),
    buildCall({
      id: 3,
      direction: "bullish",
      return_30d: 5,
      call_date: "2025-04-01T00:00:00.000Z",
    }),
    // Misses: long+negative, short+positive
    buildCall({
      id: 4,
      direction: "bullish",
      return_30d: -8,
      call_date: "2025-05-01T00:00:00.000Z",
    }),
    buildCall({
      id: 5,
      direction: "bearish",
      return_30d: 12,
      call_date: "2025-06-01T00:00:00.000Z",
    }),
  ];
  const result = await runBacktest(
    {
      creatorId: 1,
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: new Date("2025-12-31T23:59:59.999Z"),
      initialCapital: 1000,
      strategy: "direction_only",
    },
    { provider: makeProvider({ calls }), now: NOW },
  );

  // allocation = 200. 3 hits * 200 - 2 misses * 200 = 200. final = 1200.
  assert.equal(result.callCount, 5);
  assert.ok(Math.abs(result.finalCapital - 1200) < 1e-6);
});

test("empty range returns zero-state result without throwing", async () => {
  const result = await runBacktest(
    {
      creatorId: 1,
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: new Date("2025-06-30T23:59:59.999Z"),
      initialCapital: 1000,
      strategy: "equal_weight",
    },
    { provider: makeProvider({ calls: [] }), now: NOW },
  );
  assert.equal(result.callCount, 0);
  assert.equal(result.finalCapital, 1000);
  assert.equal(result.totalReturnPct, 0);
  assert.deepEqual(result.pnlByCall, []);
  assert.ok(result.monthlySeries.length > 0);
});

test("return_30d is treated as percent — no double multiplication", async () => {
  // A single +10% call with $1000 capital must produce exactly $1100, not
  // $1000 + $1000*10 = $11,000 (which would happen with a ×100 bug).
  const calls: Call[] = [
    buildCall({ id: 1, return_30d: 10, call_date: "2025-02-01T00:00:00.000Z" }),
  ];
  const result = await runBacktest(
    {
      creatorId: 1,
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: new Date("2025-12-31T23:59:59.999Z"),
      initialCapital: 1000,
      strategy: "equal_weight",
    },
    { provider: makeProvider({ calls }), now: NOW },
  );
  assert.ok(Math.abs(result.finalCapital - 1100) < 1e-6);
  assert.ok(Math.abs(result.pnlByCall[0].pnlDollars - 100) < 1e-6);
});

test("monthly series buckets PnL by YYYY-MM month", async () => {
  const calls: Call[] = [
    // Feb 2025: +10%
    buildCall({ id: 1, return_30d: 10, call_date: "2025-02-15T00:00:00.000Z" }),
    // May 2025: -20%
    buildCall({ id: 2, return_30d: -20, call_date: "2025-05-15T00:00:00.000Z" }),
  ];
  const result = await runBacktest(
    {
      creatorId: 1,
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: new Date("2025-12-31T23:59:59.999Z"),
      initialCapital: 1000,
      strategy: "equal_weight",
    },
    { provider: makeProvider({ calls }), now: NOW },
  );

  const feb = result.monthlySeries.find((p) => p.month === "2025-02");
  const mar = result.monthlySeries.find((p) => p.month === "2025-03");
  const may = result.monthlySeries.find((p) => p.month === "2025-05");
  const jun = result.monthlySeries.find((p) => p.month === "2025-06");

  assert.ok(feb !== undefined);
  assert.ok(mar !== undefined);
  assert.ok(may !== undefined);
  assert.ok(jun !== undefined);

  // Allocation = 500. Feb +10% → +50. portfolio after Feb = 1050.
  // May -20% on 500 allocation = -100. portfolio after May = 950.
  assert.ok(Math.abs(feb.portfolioValue - 1050) < 1e-6);
  assert.ok(Math.abs(mar.portfolioValue - 1050) < 1e-6);
  assert.ok(Math.abs(may.portfolioValue - 950) < 1e-6);
  assert.ok(Math.abs(jun.portfolioValue - 950) < 1e-6);
});

test("BTC benchmark — known prices produce expected vs-BTC delta", async () => {
  const calls: Call[] = [
    buildCall({ id: 1, return_30d: 10, call_date: "2024-06-01T00:00:00.000Z" }),
  ];
  const result = await runBacktest(
    {
      creatorId: 1,
      startDate: new Date("2024-01-01T00:00:00.000Z"),
      endDate: new Date("2024-12-31T23:59:59.999Z"),
      initialCapital: 1000,
      strategy: "equal_weight",
    },
    {
      provider: makeProvider({
        calls,
        btcStart: 40_000,
        btcEnd: 60_000,
      }),
      now: NOW,
    },
  );

  // BTC went 40k → 60k = +50%. Portfolio went +10% (single +10% call).
  // totalReturnVsBtcPct = 10 - 50 = -40.
  assert.ok(Math.abs(result.totalReturnPct - 10) < 1e-6);
  assert.ok(Math.abs(result.totalReturnVsBtcPct - -40) < 1e-6);
  // Last monthly point's btcValue should equal capital * (end/start) = 1500.
  const last = result.monthlySeries[result.monthlySeries.length - 1];
  assert.ok(Math.abs(last.btcValue - 1500) < 1e-6);
});

test("BTC benchmark missing — totalReturnVsBtcPct falls back to zero", async () => {
  const calls: Call[] = [
    buildCall({ id: 1, return_30d: 10, call_date: "2024-06-01T00:00:00.000Z" }),
  ];
  const result = await runBacktest(
    {
      creatorId: 1,
      startDate: new Date("2024-01-01T00:00:00.000Z"),
      endDate: new Date("2024-12-31T23:59:59.999Z"),
      initialCapital: 1000,
      strategy: "equal_weight",
    },
    {
      provider: makeProvider({
        calls,
        btcStart: null,
        btcEnd: null,
      }),
      now: NOW,
    },
  );
  assert.equal(result.totalReturnVsBtcPct, 0);
});

test("neutral-direction calls are excluded from the backtest", async () => {
  const calls: Call[] = [
    buildCall({
      id: 1,
      direction: "neutral",
      return_30d: 5,
      call_date: "2025-02-01T00:00:00.000Z",
    }),
    buildCall({
      id: 2,
      direction: "bullish",
      return_30d: 20,
      call_date: "2025-03-01T00:00:00.000Z",
    }),
  ];
  const result = await runBacktest(
    {
      creatorId: 1,
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: new Date("2025-12-31T23:59:59.999Z"),
      initialCapital: 1000,
      strategy: "equal_weight",
    },
    { provider: makeProvider({ calls }), now: NOW },
  );
  assert.equal(result.callCount, 1);
  // 100% allocation on the one bullish call at +20%.
  assert.ok(Math.abs(result.finalCapital - 1200) < 1e-6);
});

test("pending_horizon and low-confidence calls are excluded", async () => {
  const calls: Call[] = [
    // Low-confidence: excluded
    buildCall({
      id: 1,
      extraction_confidence: 0.5,
      return_30d: 100,
      call_date: "2025-02-01T00:00:00.000Z",
    }),
    // Pending horizon (price_30d null): excluded
    buildCall({
      id: 2,
      price_30d: null,
      return_30d: null,
      call_date: "2025-03-01T00:00:00.000Z",
    }),
    // Scored: included
    buildCall({
      id: 3,
      return_30d: 10,
      call_date: "2025-04-01T00:00:00.000Z",
    }),
  ];
  const result = await runBacktest(
    {
      creatorId: 1,
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: new Date("2025-12-31T23:59:59.999Z"),
      initialCapital: 1000,
      strategy: "equal_weight",
    },
    { provider: makeProvider({ calls }), now: NOW },
  );
  assert.equal(result.callCount, 1);
  assert.equal(result.pnlByCall[0].callId, 3);
});

test("strict input validation — negative capital throws invalid_capital", async () => {
  await assert.rejects(
    () =>
      runBacktest(
        {
          creatorId: 1,
          startDate: new Date("2025-01-01T00:00:00.000Z"),
          endDate: new Date("2025-12-31T00:00:00.000Z"),
          initialCapital: -100,
          strategy: "equal_weight",
        },
        { provider: makeProvider(), now: NOW },
      ),
    (err: unknown) =>
      err instanceof BacktestValidationError && err.message === "invalid_capital",
  );
});

test("strict input validation — end before start throws invalid_range", async () => {
  await assert.rejects(
    () =>
      runBacktest(
        {
          creatorId: 1,
          startDate: new Date("2025-12-31T00:00:00.000Z"),
          endDate: new Date("2025-01-01T00:00:00.000Z"),
          initialCapital: 1000,
          strategy: "equal_weight",
        },
        { provider: makeProvider(), now: NOW },
      ),
    (err: unknown) =>
      err instanceof BacktestValidationError && err.message === "invalid_range",
  );
});

test("strict input validation — unknown strategy throws invalid_strategy", async () => {
  await assert.rejects(
    () =>
      runBacktest(
        {
          creatorId: 1,
          startDate: new Date("2025-01-01T00:00:00.000Z"),
          endDate: new Date("2025-12-31T00:00:00.000Z"),
          initialCapital: 1000,
          strategy: "leveraged_futures" as unknown as BacktestInput["strategy"],
        },
        { provider: makeProvider(), now: NOW },
      ),
    (err: unknown) =>
      err instanceof BacktestValidationError &&
      err.message === "invalid_strategy",
  );
});

test("capital above MAX_BACKTEST_CAPITAL throws invalid_capital", async () => {
  await assert.rejects(
    () =>
      runBacktest(
        {
          creatorId: 1,
          startDate: new Date("2025-01-01T00:00:00.000Z"),
          endDate: new Date("2025-12-31T00:00:00.000Z"),
          initialCapital: 100_000_000,
          strategy: "equal_weight",
        },
        { provider: makeProvider(), now: NOW },
      ),
    (err: unknown) =>
      err instanceof BacktestValidationError && err.message === "invalid_capital",
  );
});

test("unknown creator throws invalid_creator", async () => {
  await assert.rejects(
    () =>
      runBacktest(
        {
          creatorId: 999,
          startDate: new Date("2025-01-01T00:00:00.000Z"),
          endDate: new Date("2025-12-31T00:00:00.000Z"),
          initialCapital: 1000,
          strategy: "equal_weight",
        },
        { provider: makeProvider({ creator: null }), now: NOW },
      ),
    (err: unknown) =>
      err instanceof BacktestValidationError && err.message === "invalid_creator",
  );
});
