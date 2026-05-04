import { BacktestValidationError, MAX_BACKTEST_CAPITAL, MIN_BACKTEST_CAPITAL } from "./backtest";
import { query } from "./db";
import { getCallScoreStatus } from "./public-methodology";
import type { Call, Creator, Direction } from "./types";

export type PortfolioWeightingMode =
  | "equal_call"
  | "equal_creator"
  | "alpha_score"
  | "rank_tier";

export type PortfolioBenchmark = "btc" | "eth" | "btc_eth_50";

export const PORTFOLIO_WEIGHTING_MODES: readonly PortfolioWeightingMode[] = [
  "equal_call",
  "equal_creator",
  "alpha_score",
  "rank_tier",
] as const;

export const PORTFOLIO_BENCHMARKS: readonly PortfolioBenchmark[] = [
  "btc",
  "eth",
  "btc_eth_50",
] as const;

export interface PortfolioBacktestInput {
  readonly creatorIds: readonly number[];
  readonly startDate: Date;
  readonly endDate: Date;
  readonly initialCapital: number;
  readonly strategy: "equal_weight" | "direction_only";
  readonly weighting: PortfolioWeightingMode;
  readonly benchmark: PortfolioBenchmark;
}

export interface PortfolioCreator extends Creator {
  readonly effective_n?: number | null;
  readonly wilson_lb?: number | null;
}

export interface PortfolioBacktestDeps {
  readonly loadCreators: (
    creatorIds: readonly number[],
  ) => Promise<readonly PortfolioCreator[]>;
  readonly loadCalls: (
    creatorIds: readonly number[],
    startIso: string,
    endIso: string,
  ) => Promise<readonly Call[]>;
  readonly loadBenchmarkPriceAt: (
    symbol: "BTCUSDT" | "ETHUSDT",
    date: Date,
  ) => Promise<number | null>;
}

export interface PortfolioBacktestCall {
  readonly callId: number;
  readonly creatorId: number;
  readonly creatorName: string;
  readonly ticker: string;
  readonly direction: "long" | "short";
  readonly callDate: string;
  readonly returnPct: number;
  readonly pnlDollars: number;
  readonly allocatedCapital: number;
  readonly isHit: boolean;
}

export interface PortfolioCreatorBreakdown {
  readonly creatorId: number;
  readonly creatorName: string;
  readonly youtubeHandle: string;
  readonly alphaScore: number;
  readonly accuracyRank: number | null;
  readonly callCount: number;
  readonly allocatedCapital: number;
  readonly pnlDollars: number;
  readonly finalCapital: number;
  readonly returnPct: number;
}

export interface PortfolioMonthlyPoint {
  readonly month: string;
  readonly portfolioValue: number;
  readonly benchmarkValue: number;
}

export interface PortfolioBacktestResult {
  readonly creatorIds: readonly number[];
  readonly startDate: string;
  readonly endDate: string;
  readonly initialCapital: number;
  readonly finalCapital: number;
  readonly totalReturnPct: number;
  readonly benchmarkReturnPct: number;
  readonly totalReturnVsBenchmarkPct: number;
  readonly strategy: "equal_weight" | "direction_only";
  readonly weighting: PortfolioWeightingMode;
  readonly benchmark: PortfolioBenchmark;
  readonly callCount: number;
  readonly hitCount: number;
  readonly missCount: number;
  readonly creatorBreakdown: readonly PortfolioCreatorBreakdown[];
  readonly pnlByCall: readonly PortfolioBacktestCall[];
  readonly monthlySeries: readonly PortfolioMonthlyPoint[];
}

export const livePortfolioBacktestDeps: PortfolioBacktestDeps = {
  async loadCreators(creatorIds) {
    return await query<PortfolioCreator>(
      `SELECT
         cr.*,
         cs.effective_n,
         cs.wilson_lb,
         COALESCE(cs.alpha_score, cr.alpha_score) AS alpha_score,
         COALESCE(cs.accuracy_rank, cr.accuracy_rank) AS accuracy_rank
       FROM creators cr
       LEFT JOIN creator_stats cs
         ON cs.creator_id = cr.id AND cs.period = 'all_time'
       WHERE cr.id = ANY($1::int[])
       ORDER BY COALESCE(cs.accuracy_rank, cr.accuracy_rank, 999999), cr.name ASC`,
      [creatorIds],
    );
  },
  async loadCalls(creatorIds, startIso, endIso) {
    return await query<Call>(
      `SELECT *
       FROM calls
       WHERE creator_id = ANY($1::int[])
         AND call_date >= $2
         AND call_date <= $3
       ORDER BY call_date ASC, id ASC`,
      [creatorIds, startIso, endIso],
    );
  },
  async loadBenchmarkPriceAt(symbol, date) {
    const rows = await query<{ close: number | string }>(
      `SELECT close
       FROM candles
       WHERE symbol = $1 AND open_time <= $2
       ORDER BY open_time DESC
       LIMIT 1`,
      [symbol, date.getTime()],
    );
    if (rows.length === 0) return null;
    const parsed = Number(rows[0].close);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  },
};

interface EligibleCall {
  readonly call: Call;
  readonly creator: PortfolioCreator;
  readonly direction: "long" | "short";
  readonly returnPct: number;
}

interface BenchmarkPrices {
  readonly start: number | null;
  readonly end: number | null;
}

function uniquePositiveInts(values: readonly number[]): readonly number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const value of values) {
    if (!Number.isInteger(value) || value < 1 || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function validateInput(input: PortfolioBacktestInput): readonly number[] {
  const creatorIds = uniquePositiveInts(input.creatorIds);
  if (creatorIds.length === 0) throw new BacktestValidationError("creator");
  if (
    !(input.startDate instanceof Date) ||
    Number.isNaN(input.startDate.getTime())
  ) {
    throw new BacktestValidationError("start");
  }
  if (
    !(input.endDate instanceof Date) ||
    Number.isNaN(input.endDate.getTime())
  ) {
    throw new BacktestValidationError("end");
  }
  if (input.endDate.getTime() <= input.startDate.getTime()) {
    throw new BacktestValidationError("range");
  }
  if (
    !Number.isFinite(input.initialCapital) ||
    input.initialCapital < MIN_BACKTEST_CAPITAL ||
    input.initialCapital > MAX_BACKTEST_CAPITAL
  ) {
    throw new BacktestValidationError("capital");
  }
  if (input.strategy !== "equal_weight" && input.strategy !== "direction_only") {
    throw new BacktestValidationError("strategy");
  }
  if (!PORTFOLIO_WEIGHTING_MODES.includes(input.weighting)) {
    throw new BacktestValidationError("weighting");
  }
  if (!PORTFOLIO_BENCHMARKS.includes(input.benchmark)) {
    throw new BacktestValidationError("benchmark");
  }
  return creatorIds;
}

function toDirection(direction: Direction): "long" | "short" | null {
  if (direction === "bullish") return "long";
  if (direction === "bearish") return "short";
  return null;
}

function isHit(direction: "long" | "short", returnPct: number): boolean {
  return direction === "long" ? returnPct > 0 : returnPct < 0;
}

function pnlFor(
  strategy: PortfolioBacktestInput["strategy"],
  direction: "long" | "short",
  returnPct: number,
  allocation: number,
): number {
  if (strategy === "direction_only") {
    return isHit(direction, returnPct) ? allocation : -allocation;
  }
  return allocation * (returnPct / 100);
}

function filterEligible(
  calls: readonly Call[],
  creatorsById: ReadonlyMap<number, PortfolioCreator>,
  now: Date,
): readonly EligibleCall[] {
  const out: EligibleCall[] = [];
  for (const call of calls) {
    const creator = creatorsById.get(call.creator_id);
    if (!creator || call.return_30d === null) continue;
    const direction = toDirection(call.direction);
    if (direction === null) continue;
    const status = getCallScoreStatus(
      {
        extraction_confidence: call.extraction_confidence,
        call_date: call.call_date,
        price_at_call: call.price_at_call,
        target_price: call.target_price,
        price_30d: call.price_30d,
        price_90d: call.price_90d,
        return_30d: call.return_30d,
        hit_target: call.hit_target,
      },
      now,
    );
    if (status !== "scored") continue;
    out.push({ call, creator, direction, returnPct: call.return_30d });
  }
  return out;
}

function rankTierWeight(creator: PortfolioCreator): number {
  const rank = creator.accuracy_rank ?? 999999;
  let base = 0.25;
  if (rank <= 5) base = 1;
  else if (rank <= 12) base = 0.55;
  const effectiveN = creator.effective_n ?? creator.total_calls;
  return effectiveN < 50 ? base * 0.5 : base;
}

function creatorWeight(
  creator: PortfolioCreator,
  weighting: PortfolioWeightingMode,
): number {
  if (weighting === "alpha_score") return Math.max(0, creator.alpha_score);
  if (weighting === "rank_tier") return rankTierWeight(creator);
  return 1;
}

function monthKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function buildMonthlySeries(
  pnlByCall: readonly PortfolioBacktestCall[],
  startDate: Date,
  endDate: Date,
  initialCapital: number,
  benchmarkReturnPct: number,
): readonly PortfolioMonthlyPoint[] {
  const monthPnl = new Map<string, number>();
  for (const row of pnlByCall) {
    const key = monthKey(new Date(row.callDate));
    monthPnl.set(key, (monthPnl.get(key) ?? 0) + row.pnlDollars);
  }

  const months: string[] = [];
  const walker = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1),
  );
  const terminal = new Date(
    Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1),
  );
  while (walker.getTime() <= terminal.getTime()) {
    months.push(monthKey(walker));
    walker.setUTCMonth(walker.getUTCMonth() + 1);
  }

  const totalSpanMs = endDate.getTime() - startDate.getTime();
  const benchmarkFinal = initialCapital * (1 + benchmarkReturnPct / 100);
  let running = initialCapital;
  return months.map((month) => {
    running += monthPnl.get(month) ?? 0;
    const [yearStr, monthStr] = month.split("-");
    const endOfMonth = new Date(
      Date.UTC(Number(yearStr), Number(monthStr), 0, 23, 59, 59, 999),
    );
    const cappedEnd =
      endOfMonth.getTime() > endDate.getTime() ? endDate : endOfMonth;
    const elapsedRatio =
      totalSpanMs > 0
        ? Math.min(
            1,
            Math.max(0, (cappedEnd.getTime() - startDate.getTime()) / totalSpanMs),
          )
        : 0;
    return {
      month,
      portfolioValue: running,
      benchmarkValue:
        initialCapital + (benchmarkFinal - initialCapital) * elapsedRatio,
    };
  });
}

function benchmarkReturn(prices: readonly BenchmarkPrices[]): number {
  const returns = prices
    .filter((p) => p.start !== null && p.end !== null && p.start > 0)
    .map((p) => ((p.end! - p.start!) / p.start!) * 100);
  if (returns.length === 0) return 0;
  return returns.reduce((sum, value) => sum + value, 0) / returns.length;
}

async function loadBenchmarkReturn(
  input: PortfolioBacktestInput,
  deps: PortfolioBacktestDeps,
): Promise<number> {
  const symbols: readonly ("BTCUSDT" | "ETHUSDT")[] =
    input.benchmark === "btc"
      ? ["BTCUSDT"]
      : input.benchmark === "eth"
        ? ["ETHUSDT"]
        : ["BTCUSDT", "ETHUSDT"];
  const prices = await Promise.all(
    symbols.map(async (symbol) => ({
      start: await deps.loadBenchmarkPriceAt(symbol, input.startDate),
      end: await deps.loadBenchmarkPriceAt(symbol, input.endDate),
    })),
  );
  return benchmarkReturn(prices);
}

export interface RunPortfolioBacktestOptions {
  readonly now?: Date;
  readonly deps?: PortfolioBacktestDeps;
}

export async function runPortfolioBacktest(
  input: PortfolioBacktestInput,
  options: RunPortfolioBacktestOptions = {},
): Promise<PortfolioBacktestResult> {
  const creatorIds = validateInput(input);
  const deps = options.deps ?? livePortfolioBacktestDeps;
  const now = options.now ?? new Date();

  const creators = await deps.loadCreators(creatorIds);
  if (creators.length === 0) throw new BacktestValidationError("creator");

  const creatorsById = new Map(creators.map((row) => [row.id, row]));
  const rawCalls = await deps.loadCalls(
    creatorIds,
    input.startDate.toISOString(),
    input.endDate.toISOString(),
  );
  const eligible = filterEligible(rawCalls, creatorsById, now);
  const callsByCreator = new Map<number, EligibleCall[]>();
  for (const row of eligible) {
    const rows = callsByCreator.get(row.creator.id) ?? [];
    rows.push(row);
    callsByCreator.set(row.creator.id, rows);
  }

  const benchmarkReturnPct = await loadBenchmarkReturn(input, deps);
  const pnlByCall: PortfolioBacktestCall[] = [];
  const breakdown: PortfolioCreatorBreakdown[] = [];

  if (input.weighting === "equal_call") {
    const allocation = eligible.length > 0 ? input.initialCapital / eligible.length : 0;
    for (const row of eligible) {
      const pnl = pnlFor(input.strategy, row.direction, row.returnPct, allocation);
      pnlByCall.push({
        callId: row.call.id,
        creatorId: row.creator.id,
        creatorName: row.creator.name,
        ticker: row.call.symbol,
        direction: row.direction,
        callDate: toIsoString(row.call.call_date),
        returnPct: row.returnPct,
        pnlDollars: pnl,
        allocatedCapital: allocation,
        isHit: isHit(row.direction, row.returnPct),
      });
    }
  } else {
    const weights = creators.map((row) => creatorWeight(row, input.weighting));
    const fallbackWeight = weights.every((value) => value <= 0) ? 1 : 0;
    const totalWeight = weights.reduce(
      (sum, value) => sum + (value > 0 ? value : fallbackWeight),
      0,
    );
    creators.forEach((creator, index) => {
      const weight = weights[index] > 0 ? weights[index] : fallbackWeight;
      const sleeve = totalWeight > 0 ? (input.initialCapital * weight) / totalWeight : 0;
      const rows = callsByCreator.get(creator.id) ?? [];
      const allocation = rows.length > 0 ? sleeve / rows.length : 0;
      for (const row of rows) {
        const pnl = pnlFor(input.strategy, row.direction, row.returnPct, allocation);
        pnlByCall.push({
          callId: row.call.id,
          creatorId: creator.id,
          creatorName: creator.name,
          ticker: row.call.symbol,
          direction: row.direction,
          callDate: toIsoString(row.call.call_date),
          returnPct: row.returnPct,
          pnlDollars: pnl,
          allocatedCapital: allocation,
          isHit: isHit(row.direction, row.returnPct),
        });
      }
    });
  }

  for (const creator of creators) {
    const creatorCalls = pnlByCall.filter((row) => row.creatorId === creator.id);
    const allocatedCapital =
      input.weighting === "equal_call"
        ? creatorCalls.reduce((sum, row) => sum + row.allocatedCapital, 0)
        : (() => {
            const explicit = creatorCalls.reduce((sum, row) => sum + row.allocatedCapital, 0);
            if (explicit > 0) return explicit;
            const weights = creators.map((row) => creatorWeight(row, input.weighting));
            const fallbackWeight = weights.every((value) => value <= 0) ? 1 : 0;
            const totalWeight = weights.reduce(
              (sum, value) => sum + (value > 0 ? value : fallbackWeight),
              0,
            );
            const weight = creatorWeight(creator, input.weighting);
            return totalWeight > 0
              ? (input.initialCapital * (weight > 0 ? weight : fallbackWeight)) / totalWeight
              : 0;
          })();
    const pnl = creatorCalls.reduce((sum, row) => sum + row.pnlDollars, 0);
    breakdown.push({
      creatorId: creator.id,
      creatorName: creator.name,
      youtubeHandle: creator.youtube_handle,
      alphaScore: creator.alpha_score,
      accuracyRank: creator.accuracy_rank,
      callCount: creatorCalls.length,
      allocatedCapital,
      pnlDollars: pnl,
      finalCapital: allocatedCapital + pnl,
      returnPct: allocatedCapital > 0 ? (pnl / allocatedCapital) * 100 : 0,
    });
  }

  const totalPnl = pnlByCall.reduce((sum, row) => sum + row.pnlDollars, 0);
  const finalCapital = input.initialCapital + totalPnl;
  const totalReturnPct = (totalPnl / input.initialCapital) * 100;
  const hitCount = pnlByCall.filter((row) => row.isHit).length;
  const missCount = pnlByCall.length - hitCount;

  return {
    creatorIds,
    startDate: input.startDate.toISOString(),
    endDate: input.endDate.toISOString(),
    initialCapital: input.initialCapital,
    finalCapital,
    totalReturnPct,
    benchmarkReturnPct,
    totalReturnVsBenchmarkPct: totalReturnPct - benchmarkReturnPct,
    strategy: input.strategy,
    weighting: input.weighting,
    benchmark: input.benchmark,
    callCount: pnlByCall.length,
    hitCount,
    missCount,
    creatorBreakdown: breakdown,
    pnlByCall: pnlByCall.sort(
      (a, b) => new Date(a.callDate).getTime() - new Date(b.callDate).getTime(),
    ),
    monthlySeries: buildMonthlySeries(
      pnlByCall,
      input.startDate,
      input.endDate,
      input.initialCapital,
      benchmarkReturnPct,
    ),
  };
}
