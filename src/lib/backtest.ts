import { query } from "./db";
import { getCallScoreStatus } from "./public-methodology";
import type { Call, Creator, Direction } from "./types";

// Supported simulation strategies. equal_weight allocates a fixed $
// slice per scored call. direction_only scores +/- one allocation
// unit per call based on directional correctness.
export type BacktestStrategy = "equal_weight" | "direction_only";

export const BACKTEST_STRATEGIES: readonly BacktestStrategy[] = [
  "equal_weight",
  "direction_only",
] as const;

export const MAX_BACKTEST_CAPITAL = 10_000_000;
export const MIN_BACKTEST_CAPITAL = 1;

// Simulator direction is externally expressed as long/short. Internally
// the DB stores 'bullish'|'bearish'|'neutral' — we drop 'neutral' since
// neutral calls cannot take a position in the backtest.
export type BacktestDirection = "long" | "short";

export interface BacktestInput {
  readonly creatorId: number;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly initialCapital: number;
  readonly strategy: BacktestStrategy;
}

export interface BacktestCall {
  readonly callId: number;
  readonly ticker: string;
  readonly direction: BacktestDirection;
  readonly callDate: string;
  readonly entryPrice: number | null;
  readonly exitPrice: number | null;
  readonly returnPct: number | null;
  readonly alphaOverBtc: number | null;
  readonly pnlDollars: number;
  // Direction-aware outcome flag: true iff the creator's directional
  // prediction was correct (long with +return or short with -return).
  // Strategy-independent — drives hitCount/missCount and the UI ledger
  // verdict regardless of whether the strategy is equal_weight or
  // direction_only. A correct short with return_30d = -15 is a HIT.
  readonly isHit: boolean;
}

export interface BacktestMonthlyPoint {
  readonly month: string;
  readonly portfolioValue: number;
  readonly btcValue: number;
}

export interface BacktestResult {
  readonly creatorId: number;
  readonly creatorName: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly initialCapital: number;
  readonly finalCapital: number;
  readonly totalReturnPct: number;
  readonly totalReturnVsBtcPct: number;
  readonly callCount: number;
  readonly hitCount: number;
  readonly missCount: number;
  readonly pnlByCall: readonly BacktestCall[];
  readonly monthlySeries: readonly BacktestMonthlyPoint[];
}

export class BacktestValidationError extends Error {
  public readonly field: string;

  public constructor(field: string) {
    super(`invalid_${field}`);
    this.field = field;
    this.name = "BacktestValidationError";
  }
}

// Internal fetchers — isolated so tests can inject fakes via Object.defineProperty
// on the exported module, matching the pattern used elsewhere.
export interface BacktestDataProvider {
  readonly loadCreator: (creatorId: number) => Promise<Creator | null>;
  readonly loadCalls: (
    creatorId: number,
    startIso: string,
    endIso: string,
  ) => Promise<readonly Call[]>;
  readonly loadBtcPriceAt: (date: Date) => Promise<number | null>;
}

export const liveDataProvider: BacktestDataProvider = {
  async loadCreator(creatorId) {
    const rows = await query<Creator>(
      `SELECT * FROM creators WHERE id = $1 LIMIT 1`,
      [creatorId],
    );
    return rows.length > 0 ? rows[0] : null;
  },
  async loadCalls(creatorId, startIso, endIso) {
    return await query<Call>(
      `SELECT * FROM calls
       WHERE creator_id = $1
         AND call_date >= $2
         AND call_date <= $3
       ORDER BY call_date ASC`,
      [creatorId, startIso, endIso],
    );
  },
  async loadBtcPriceAt(date) {
    // Candles use Unix millisecond timestamps (bigint). Match the
    // nearest candle at or before the target date, mirroring the
    // existing match-prices.ts query pattern.
    const dateMs = date.getTime();
    const rows = await query<{ close: number | string }>(
      `SELECT close FROM candles
       WHERE symbol = 'BTCUSDT' AND open_time <= $1
       ORDER BY open_time DESC
       LIMIT 1`,
      [dateMs],
    );
    if (rows.length === 0) return null;
    const raw = rows[0].close;
    const parsed = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  },
};

function validateInput(input: BacktestInput): void {
  if (!Number.isFinite(input.creatorId) || input.creatorId < 1) {
    throw new BacktestValidationError("creator");
  }
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
  if (!BACKTEST_STRATEGIES.includes(input.strategy)) {
    throw new BacktestValidationError("strategy");
  }
}

function toBacktestDirection(direction: Direction): BacktestDirection | null {
  if (direction === "bullish") return "long";
  if (direction === "bearish") return "short";
  return null;
}

// The memory gotcha: return_30d is stored already-×100 (a percent, e.g.
// +10 means "+10%", not 10x). Do NOT re-multiply. Full float precision
// is preserved — rounding is a display concern handled in the UI.
function equalWeightPnl(returnPct: number, allocation: number): number {
  return allocation * (returnPct / 100);
}

// Direction-aware hit test. Shared by direction_only's PnL calc and by
// the hitCount/missCount/ledger-verdict accounting so that short calls
// are credited correctly when return_30d is negative.
function isDirectionalHit(
  direction: BacktestDirection,
  returnPct: number,
): boolean {
  if (direction === "long") return returnPct > 0;
  return returnPct < 0;
}

// direction_only PnL: +allocation on a directional hit, -allocation
// otherwise. Zero returns count as a miss (magnitude floor is enforced
// upstream in scoring).
function directionOnlyPnl(
  direction: BacktestDirection,
  returnPct: number,
  allocation: number,
): number {
  return isDirectionalHit(direction, returnPct) ? allocation : -allocation;
}

function monthKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

interface ScoredRow {
  readonly call: Call;
  readonly direction: BacktestDirection;
  readonly returnPct: number;
}

function filterEligible(
  calls: readonly Call[],
  now: Date,
): readonly ScoredRow[] {
  const out: ScoredRow[] = [];
  for (const call of calls) {
    const status = getCallScoreStatus(
      {
        extraction_confidence: call.extraction_confidence,
        call_date: call.call_date,
        target_price: call.target_price,
        price_30d: call.price_30d,
        price_90d: call.price_90d,
        return_30d: call.return_30d,
        hit_target: call.hit_target,
      },
      now,
    );
    if (status !== "scored") continue;
    if (call.return_30d === null) continue;
    const direction = toBacktestDirection(call.direction);
    if (direction === null) continue;
    out.push({ call, direction, returnPct: call.return_30d });
  }
  return out;
}

// Build monthly series. Each month value is the running portfolio/BTC
// value AT END OF MONTH — we fold per-call PnL into the month the call
// fired in, then carry the cumulative value forward across empty months
// so the chart stays connected from startDate to endDate.
function buildMonthlySeries(
  pnlByCall: readonly BacktestCall[],
  startDate: Date,
  endDate: Date,
  initialCapital: number,
  btcStartPrice: number | null,
  btcEndPrice: number | null,
): readonly BacktestMonthlyPoint[] {
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

  const canComputeBtc =
    btcStartPrice !== null &&
    btcEndPrice !== null &&
    btcStartPrice > 0 &&
    btcEndPrice > 0;
  const btcFinalValue = canComputeBtc
    ? initialCapital * (btcEndPrice / btcStartPrice)
    : initialCapital;

  const totalSpanMs = endDate.getTime() - startDate.getTime();
  const series: BacktestMonthlyPoint[] = [];
  let running = initialCapital;
  for (const month of months) {
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
            Math.max(
              0,
              (cappedEnd.getTime() - startDate.getTime()) / totalSpanMs,
            ),
          )
        : 0;
    const btcValue = canComputeBtc
      ? initialCapital + (btcFinalValue - initialCapital) * elapsedRatio
      : initialCapital;
    series.push({
      month,
      portfolioValue: running,
      btcValue,
    });
  }
  return series;
}

export interface RunBacktestOptions {
  readonly now?: Date;
  readonly provider?: BacktestDataProvider;
}

export async function runBacktest(
  input: BacktestInput,
  options: RunBacktestOptions = {},
): Promise<BacktestResult> {
  validateInput(input);
  const provider = options.provider ?? liveDataProvider;
  const now = options.now ?? new Date();

  const creator = await provider.loadCreator(input.creatorId);
  if (creator === null) {
    throw new BacktestValidationError("creator");
  }

  const rawCalls = await provider.loadCalls(
    input.creatorId,
    input.startDate.toISOString(),
    input.endDate.toISOString(),
  );
  const eligible = filterEligible(rawCalls, now);

  const zeroStateSeries = buildMonthlySeries(
    [],
    input.startDate,
    input.endDate,
    input.initialCapital,
    null,
    null,
  );

  if (eligible.length === 0) {
    return {
      creatorId: input.creatorId,
      creatorName: creator.name,
      startDate: input.startDate.toISOString(),
      endDate: input.endDate.toISOString(),
      initialCapital: input.initialCapital,
      finalCapital: input.initialCapital,
      totalReturnPct: 0,
      totalReturnVsBtcPct: 0,
      callCount: 0,
      hitCount: 0,
      missCount: 0,
      pnlByCall: [],
      monthlySeries: zeroStateSeries,
    };
  }

  const allocation = input.initialCapital / eligible.length;

  const pnlByCall: BacktestCall[] = eligible.map(
    ({ call, direction, returnPct }) => {
      const pnl =
        input.strategy === "equal_weight"
          ? equalWeightPnl(returnPct, allocation)
          : directionOnlyPnl(direction, returnPct, allocation);
      return {
        callId: call.id,
        ticker: call.symbol,
        direction,
        callDate: call.call_date,
        entryPrice: call.price_at_call,
        exitPrice: call.price_30d,
        returnPct,
        alphaOverBtc: call.alpha_30d,
        pnlDollars: pnl,
        isHit: isDirectionalHit(direction, returnPct),
      };
    },
  );

  const totalPnl = pnlByCall.reduce((sum, row) => sum + row.pnlDollars, 0);
  const finalCapital = input.initialCapital + totalPnl;
  const totalReturnPct = (totalPnl / input.initialCapital) * 100;

  let hitCount = 0;
  let missCount = 0;
  for (const row of pnlByCall) {
    if (row.isHit) hitCount += 1;
    else missCount += 1;
  }

  const [btcStart, btcEnd] = await Promise.all([
    provider.loadBtcPriceAt(input.startDate),
    provider.loadBtcPriceAt(input.endDate),
  ]);

  let totalReturnVsBtcPct = 0;
  if (btcStart !== null && btcEnd !== null && btcStart > 0) {
    const btcReturnPct = ((btcEnd - btcStart) / btcStart) * 100;
    totalReturnVsBtcPct = totalReturnPct - btcReturnPct;
  }

  const monthlySeries = buildMonthlySeries(
    pnlByCall,
    input.startDate,
    input.endDate,
    input.initialCapital,
    btcStart,
    btcEnd,
  );

  return {
    creatorId: input.creatorId,
    creatorName: creator.name,
    startDate: input.startDate.toISOString(),
    endDate: input.endDate.toISOString(),
    initialCapital: input.initialCapital,
    finalCapital,
    totalReturnPct,
    totalReturnVsBtcPct,
    callCount: eligible.length,
    hitCount,
    missCount,
    pnlByCall,
    monthlySeries,
  };
}
