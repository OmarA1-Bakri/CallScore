import test from "node:test";
import assert from "node:assert/strict";
import {
  runPortfolioBacktest,
  type PortfolioBacktestDeps,
} from "../src/lib/portfolio-backtest";
import { BacktestValidationError } from "../src/lib/backtest";
import type { Call, Creator } from "../src/lib/types";

const NOW = new Date("2026-04-12T00:00:00.000Z");

function creator(overrides: Partial<Creator> = {}): Creator {
  return {
    id: 1,
    name: "Creator One",
    youtube_handle: "@one",
    youtube_channel_id: null,
    subscribers: null,
    focus: null,
    tier: "free",
    total_calls: 0,
    win_rate: 0,
    avg_return: 0,
    alpha_score: 10,
    accuracy_rank: 1,
    last_scraped_at: null,
    created_at: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function call(overrides: Partial<Call> = {}): Call {
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
    call_date: "2025-02-01T00:00:00.000Z",
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
    created_at: "2025-02-01T00:00:00.000Z",
    ...overrides,
  };
}

function deps(
  creators: readonly Creator[],
  calls: readonly Call[],
  prices: Record<string, readonly [number | null, number | null]> = {
    BTCUSDT: [50_000, 60_000],
    ETHUSDT: [2_000, 3_000],
  },
): PortfolioBacktestDeps {
  const priceCalls = new Map<string, number>();
  return {
    async loadCreators(ids) {
      const wanted = new Set(ids);
      return creators.filter((row) => wanted.has(row.id));
    },
    async loadCalls(ids) {
      const wanted = new Set(ids);
      return calls.filter((row) => wanted.has(row.creator_id));
    },
    async loadBenchmarkPriceAt(symbol) {
      const count = priceCalls.get(symbol) ?? 0;
      priceCalls.set(symbol, count + 1);
      const pair = prices[symbol] ?? [null, null];
      return pair[Math.min(count, 1)] ?? null;
    },
  };
}

const baseInput = {
  creatorIds: [1, 2],
  startDate: new Date("2025-01-01T00:00:00.000Z"),
  endDate: new Date("2025-12-31T23:59:59.999Z"),
  initialCapital: 1200,
  strategy: "equal_weight" as const,
  weighting: "equal_call" as const,
  benchmark: "btc" as const,
};

test("equal_call weights every eligible call equally across selected creators", async () => {
  const result = await runPortfolioBacktest(
    {
      ...baseInput,
      weighting: "equal_call",
    },
    {
      deps: deps(
        [creator({ id: 1 }), creator({ id: 2, name: "Creator Two" })],
        [
          call({ id: 1, creator_id: 1, return_30d: 10 }),
          call({ id: 2, creator_id: 1, return_30d: 20 }),
          call({ id: 3, creator_id: 2, return_30d: -5 }),
        ],
      ),
      now: NOW,
    },
  );

  assert.equal(result.callCount, 3);
  assert.ok(Math.abs(result.finalCapital - 1300) < 1e-6);
  assert.deepEqual(
    result.creatorBreakdown.map((row) => [row.creatorId, row.callCount, Math.round(row.pnlDollars)]),
    [
      [1, 2, 120],
      [2, 1, -20],
    ],
  );
});

test("equal_creator gives each selected creator a sleeve and keeps no-call creators in cash", async () => {
  const result = await runPortfolioBacktest(
    {
      ...baseInput,
      creatorIds: [1, 2, 3],
      weighting: "equal_creator",
    },
    {
      deps: deps(
        [
          creator({ id: 1 }),
          creator({ id: 2, name: "Creator Two" }),
          creator({ id: 3, name: "No Calls" }),
        ],
        [
          call({ id: 1, creator_id: 1, return_30d: 30 }),
          call({ id: 2, creator_id: 2, return_30d: -15 }),
        ],
      ),
      now: NOW,
    },
  );

  assert.equal(result.creatorBreakdown.length, 3);
  assert.equal(result.creatorBreakdown[2].callCount, 0);
  assert.equal(result.creatorBreakdown[2].allocatedCapital, 400);
  assert.ok(Math.abs(result.finalCapital - 1260) < 1e-6);
});

test("alpha_score weighting allocates larger sleeves to higher-scored creators", async () => {
  const result = await runPortfolioBacktest(
    {
      ...baseInput,
      weighting: "alpha_score",
    },
    {
      deps: deps(
        [
          creator({ id: 1, alpha_score: 30 }),
          creator({ id: 2, name: "Creator Two", alpha_score: 10 }),
        ],
        [
          call({ id: 1, creator_id: 1, return_30d: 10 }),
          call({ id: 2, creator_id: 2, return_30d: 10 }),
        ],
      ),
      now: NOW,
    },
  );

  assert.equal(result.creatorBreakdown[0].allocatedCapital, 900);
  assert.equal(result.creatorBreakdown[1].allocatedCapital, 300);
  assert.ok(Math.abs(result.finalCapital - 1320) < 1e-6);
});

test("rank_tier weighting follows displayed creator rank bands", async () => {
  const result = await runPortfolioBacktest(
    {
      ...baseInput,
      creatorIds: [1, 2, 3],
      weighting: "rank_tier",
    },
    {
      deps: deps(
        [
          creator({ id: 1, accuracy_rank: 3 }),
          creator({ id: 2, name: "T2", accuracy_rank: 8 }),
          creator({ id: 3, name: "T3", accuracy_rank: 20 }),
        ],
        [
          call({ id: 1, creator_id: 1, return_30d: 10 }),
          call({ id: 2, creator_id: 2, return_30d: 10 }),
          call({ id: 3, creator_id: 3, return_30d: 10 }),
        ],
      ),
      now: NOW,
    },
  );

  assert.ok(result.creatorBreakdown[0].allocatedCapital > result.creatorBreakdown[1].allocatedCapital);
  assert.ok(result.creatorBreakdown[1].allocatedCapital > result.creatorBreakdown[2].allocatedCapital);
  assert.ok(Math.abs(result.finalCapital - 1320) < 1e-6);
});

test("btc_eth_50 benchmark averages BTC and ETH holding returns", async () => {
  const result = await runPortfolioBacktest(
    {
      ...baseInput,
      creatorIds: [1],
      benchmark: "btc_eth_50",
    },
    {
      deps: deps(
        [creator({ id: 1 })],
        [call({ id: 1, creator_id: 1, return_30d: 10 })],
      ),
      now: NOW,
    },
  );

  assert.ok(Math.abs(result.benchmarkReturnPct - 35) < 1e-6);
  assert.ok(Math.abs(result.totalReturnVsBenchmarkPct - -25) < 1e-6);
});

test("invalid creator selection throws invalid_creator", async () => {
  await assert.rejects(
    () =>
      runPortfolioBacktest(
        {
          ...baseInput,
          creatorIds: [],
        },
        { deps: deps([], []), now: NOW },
      ),
    (err: unknown) =>
      err instanceof BacktestValidationError &&
      err.message === "invalid_creator",
  );
});
