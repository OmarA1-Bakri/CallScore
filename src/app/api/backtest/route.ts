import { NextRequest, NextResponse } from "next/server";
import { captureApiException } from "@/lib/monitoring";
import { z } from "zod";
import {
  BacktestValidationError,
  MAX_BACKTEST_CAPITAL,
  MIN_BACKTEST_CAPITAL,
  type BacktestStrategy,
} from "@/lib/backtest";
import {
  parseIsoDateAsEndOfDay,
  parseIsoDateAsStartOfDay,
  defaultBacktestRange,
} from "@/lib/backtest-params";
import { requireSessionAccess } from "@/lib/premium";
import {
  PORTFOLIO_BENCHMARKS,
  PORTFOLIO_WEIGHTING_MODES,
  runPortfolioBacktest,
  type PortfolioBenchmark,
  type PortfolioWeightingMode,
} from "@/lib/portfolio-backtest";

const DEFAULT_CAPITAL = 1000;

const portfolioQuerySchema = z.object({
  creatorIds: z.array(z.number().int().positive()).min(1),
  start: z.string().nullable(),
  end: z.string().nullable(),
  capital: z.string().nullable(),
  strategy: z.string().nullable(),
  weighting: z.string().nullable(),
  benchmark: z.string().nullable(),
});

interface ParsedPortfolioParams {
  readonly creatorIds: readonly number[];
  readonly startDate: Date;
  readonly endDate: Date;
  readonly capital: number;
  readonly strategy: BacktestStrategy;
  readonly weighting: PortfolioWeightingMode;
  readonly benchmark: PortfolioBenchmark;
}

function parseCreatorIds(searchParams: URLSearchParams): readonly number[] {
  const raw = [
    ...searchParams.getAll("creator"),
    ...searchParams.getAll("creators").flatMap((value) => value.split(",")),
  ];
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const item of raw) {
    const parsed = Number(item);
    if (Number.isInteger(parsed) && parsed > 0 && !seen.has(parsed)) {
      seen.add(parsed);
      ids.push(parsed);
    }
  }
  return ids;
}

function parseCapital(raw: string | null): number | null {
  if (raw === null || raw.length === 0) return DEFAULT_CAPITAL;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function parseParams(
  searchParams: URLSearchParams,
  now: Date,
): ParsedPortfolioParams | { readonly error: string } {
  const raw = portfolioQuerySchema.safeParse({
    creatorIds: parseCreatorIds(searchParams),
    start: searchParams.get("start"),
    end: searchParams.get("end"),
    capital: searchParams.get("capital"),
    strategy: searchParams.get("strategy"),
    weighting: searchParams.get("weighting"),
    benchmark: searchParams.get("benchmark"),
  });

  if (!raw.success) return { error: "invalid_creator" };

  const defaults = defaultBacktestRange(now);
  const { creatorIds } = raw.data;
  const startRaw = raw.data.start;
  const startDate =
    startRaw === null ? defaults.start : parseIsoDateAsStartOfDay(startRaw);
  if (!startDate) return { error: "invalid_start" };

  const endRaw = raw.data.end;
  const endDate =
    endRaw === null ? defaults.end : parseIsoDateAsEndOfDay(endRaw);
  if (!endDate) return { error: "invalid_end" };
  if (endDate.getTime() <= startDate.getTime()) {
    return { error: "invalid_range" };
  }

  const capital = parseCapital(raw.data.capital);
  if (
    capital === null ||
    capital < MIN_BACKTEST_CAPITAL ||
    capital > MAX_BACKTEST_CAPITAL
  ) {
    return { error: "invalid_capital" };
  }

  const strategyRaw = raw.data.strategy ?? "equal_weight";
  const strategy =
    strategyRaw === "equal_weight" || strategyRaw === "direction_only"
      ? strategyRaw
      : null;
  if (!strategy) return { error: "invalid_strategy" };

  const weightingRaw = raw.data.weighting ?? "equal_creator";
  const weighting = PORTFOLIO_WEIGHTING_MODES.includes(
    weightingRaw as PortfolioWeightingMode,
  )
    ? (weightingRaw as PortfolioWeightingMode)
    : null;
  if (!weighting) return { error: "invalid_weighting" };

  const benchmarkRaw = raw.data.benchmark ?? "btc";
  const benchmark = PORTFOLIO_BENCHMARKS.includes(
    benchmarkRaw as PortfolioBenchmark,
  )
    ? (benchmarkRaw as PortfolioBenchmark)
    : null;
  if (!benchmark) return { error: "invalid_benchmark" };

  return { creatorIds, startDate, endDate, capital, strategy, weighting, benchmark };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await requireSessionAccess("alpha");
  if (session instanceof NextResponse) return session;

  const parsed = parseParams(request.nextUrl.searchParams, new Date());
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await runPortfolioBacktest({
      creatorIds: parsed.creatorIds,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      initialCapital: parsed.capital,
      strategy: parsed.strategy,
      weighting: parsed.weighting,
      benchmark: parsed.benchmark,
    });
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error: unknown) {
    if (error instanceof BacktestValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    void captureApiException(error, "/api/backtest");
    return NextResponse.json(
      { error: "internal_error", message: "Backtest unavailable. Please try again." },
      { status: 500 },
    );
  }
}
