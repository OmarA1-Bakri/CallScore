import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  BACKTEST_STRATEGIES,
  BacktestValidationError,
  MAX_BACKTEST_CAPITAL,
  MIN_BACKTEST_CAPITAL,
  runBacktest,
  type BacktestStrategy,
} from "@/lib/backtest";
import type { Creator } from "@/lib/types";

// TODO: gate behind Pro+ when premium launches. Current release is public
// for GTM so creators can be verified by anyone.

const DEFAULT_STRATEGY: BacktestStrategy = "equal_weight";
const DEFAULT_CAPITAL = 1000;

interface ParsedParams {
  readonly startDate: Date;
  readonly endDate: Date;
  readonly capital: number;
  readonly strategy: BacktestStrategy;
}

function parseIsoDate(raw: string | null): Date | null {
  if (raw === null || raw.length === 0) return null;
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) return null;
  return value;
}

// Date-only inputs like "2025-12-31" parse as 2025-12-31T00:00:00Z, which
// would silently exclude calls timestamped later that same day from an
// inclusive call_date <= end filter. Normalize explicitly so the UX
// matches the user's intent: start = start-of-day, end = end-of-day UTC.
function parseIsoDateAsStartOfDay(raw: string | null): Date | null {
  const d = parseIsoDate(raw);
  if (d === null) return null;
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function parseIsoDateAsEndOfDay(raw: string | null): Date | null {
  const d = parseIsoDate(raw);
  if (d === null) return null;
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function parseCapital(raw: string | null): number | null {
  if (raw === null || raw.length === 0) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return value;
}

function parseStrategy(raw: string | null): BacktestStrategy | null {
  if (raw === null || raw.length === 0) return DEFAULT_STRATEGY;
  return BACKTEST_STRATEGIES.includes(raw as BacktestStrategy)
    ? (raw as BacktestStrategy)
    : null;
}

function defaultRange(now: Date): { readonly start: Date; readonly end: Date } {
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 365);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
}

function parseQuery(
  searchParams: URLSearchParams,
  now: Date,
): ParsedParams | { readonly error: string } {
  const { start: defaultStart, end: defaultEnd } = defaultRange(now);

  const startRaw = searchParams.get("start");
  const startDate =
    startRaw === null ? defaultStart : parseIsoDateAsStartOfDay(startRaw);
  if (startDate === null) return { error: "invalid_start" };

  const endRaw = searchParams.get("end");
  const endDate =
    endRaw === null ? defaultEnd : parseIsoDateAsEndOfDay(endRaw);
  if (endDate === null) return { error: "invalid_end" };

  if (endDate.getTime() <= startDate.getTime()) {
    return { error: "invalid_range" };
  }

  const capitalRaw = searchParams.get("capital");
  const capital =
    capitalRaw === null ? DEFAULT_CAPITAL : parseCapital(capitalRaw);
  if (
    capital === null ||
    capital < MIN_BACKTEST_CAPITAL ||
    capital > MAX_BACKTEST_CAPITAL
  ) {
    return { error: "invalid_capital" };
  }

  const strategyRaw = searchParams.get("strategy");
  const strategy = parseStrategy(strategyRaw);
  if (strategy === null) return { error: "invalid_strategy" };

  return { startDate, endDate, capital, strategy };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
): Promise<NextResponse> {
  try {
    const { handle: rawHandle } = await params;
    const handle = decodeURIComponent(rawHandle);
    if (handle.length === 0) {
      return NextResponse.json(
        { error: "invalid_handle" },
        { status: 400 },
      );
    }

    const parsed = parseQuery(request.nextUrl.searchParams, new Date());
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const creators = await query<Creator>(
      `SELECT * FROM creators WHERE youtube_handle = $1 LIMIT 1`,
      [handle],
    );
    if (creators.length === 0) {
      return NextResponse.json(
        { error: "creator_not_found" },
        { status: 404 },
      );
    }

    const result = await runBacktest({
      creatorId: creators[0].id,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      initialCapital: parsed.capital,
      strategy: parsed.strategy,
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error: unknown) {
    if (error instanceof BacktestValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    // Do NOT surface internal error messages publicly — DB errors can
    // leak connection-string fragments, table names, or stack frames.
    // Log full detail server-side, return a generic envelope to clients.
    // eslint-disable-next-line no-console
    console.error("[backtest] unhandled error:", error);
    return NextResponse.json(
      {
        error: "internal_error",
        message: "Backtest unavailable. Please try again.",
      },
      { status: 500 },
    );
  }
}
