import type { Metadata } from "next";
import Link from "next/link";
import BacktestLabCharts from "@/components/BacktestLabCharts";
import { getCurrentTier } from "@/lib/auth";
import {
  defaultBacktestRange,
  parseIsoDateAsEndOfDay,
  parseIsoDateAsStartOfDay,
} from "@/lib/backtest-params";
import {
  MAX_BACKTEST_CAPITAL,
  MIN_BACKTEST_CAPITAL,
  type BacktestStrategy,
} from "@/lib/backtest";
import { creatorHandlePath } from "@/lib/creator-handles";
import { query } from "@/lib/db";
import {
  PORTFOLIO_BENCHMARKS,
  PORTFOLIO_WEIGHTING_MODES,
  runPortfolioBacktest,
  type PortfolioBacktestCall,
  type PortfolioBacktestResult,
  type PortfolioBenchmark,
  type PortfolioWeightingMode,
} from "@/lib/portfolio-backtest";
import { hasAccess } from "@/lib/whop";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Backtest Lab | CallScore",
  description:
    "Build creator baskets, run historical simulations, and compare scored calls against BTC and ETH benchmarks.",
};

interface PageProps {
  readonly searchParams: {
    readonly creator?: string | readonly string[];
    readonly creators?: string;
    readonly start?: string;
    readonly end?: string;
    readonly capital?: string;
    readonly strategy?: string;
    readonly weighting?: string;
    readonly benchmark?: string;
    readonly q?: string;
  };
}

interface CreatorOption {
  readonly id: number;
  readonly name: string;
  readonly youtube_handle: string;
  readonly alpha_score: number;
  readonly accuracy_rank: number | null;
  readonly total_calls: number;
}

const DEFAULT_CAPITAL = 1000;
const DEFAULT_STRATEGY: BacktestStrategy = "equal_weight";
const DEFAULT_WEIGHTING: PortfolioWeightingMode = "equal_creator";
const DEFAULT_BENCHMARK: PortfolioBenchmark = "btc";
const STRATEGY_OPTIONS = [
  {
    value: "equal_weight" as const,
    label: "Scored return",
    description:
      "Uses the measured return magnitude for each scored call so stronger wins and losses carry more weight.",
  },
  {
    value: "direction_only" as const,
    label: "Direction only",
    description:
      "Grades each call by whether the direction was right, without sizing the result by move magnitude.",
  },
] as const;
const BENCHMARK_OPTIONS = [
  {
    value: "btc" as const,
    label: "BTC",
    description: "Passive BTC held across the full backtest window.",
  },
  {
    value: "eth" as const,
    label: "ETH",
    description: "Passive ETH held across the full backtest window.",
  },
  {
    value: "btc_eth_50" as const,
    label: "BTC / ETH 50-50",
    description: "Even split between BTC and ETH for a blended market proxy.",
  },
] as const;
const WEIGHTING_COPY: Record<
  PortfolioWeightingMode,
  { readonly label: string; readonly description: string }
> = {
  equal_call: {
    label: "Equal call",
    description:
      "Every eligible call receives the same capital sleeve, regardless of creator rank.",
  },
  equal_creator: {
    label: "Equal creator",
    description:
      "Each selected creator gets the same sleeve first, then capital is split across that creator's calls.",
  },
  alpha_score: {
    label: "Alpha score",
    description:
      "Higher-alpha creators receive larger sleeves before their calls are evaluated.",
  },
  rank_tier: {
    label: "Rank tier",
    description:
      "Capital steps down by leaderboard tier so top-ranked creators carry more of the basket.",
  },
};

async function loadCreatorOptions(): Promise<readonly CreatorOption[]> {
  return await query<CreatorOption>(
    `SELECT
       cr.id,
       cr.name,
       cr.youtube_handle,
       COALESCE(cs.alpha_score, cr.alpha_score) AS alpha_score,
       COALESCE(cs.accuracy_rank, cr.accuracy_rank) AS accuracy_rank,
       COALESCE(cs.total_calls, cr.total_calls) AS total_calls
     FROM creators cr
     LEFT JOIN creator_stats cs
       ON cs.creator_id = cr.id AND cs.period = 'all_time'
     ORDER BY COALESCE(cs.accuracy_rank, cr.accuracy_rank, 999999), cr.name ASC
     LIMIT 60`,
  );
}

async function loadCreatorsByIds(ids: readonly number[]): Promise<readonly CreatorOption[]> {
  if (ids.length === 0) return [];
  return await query<CreatorOption>(
    `SELECT
       cr.id,
       cr.name,
       cr.youtube_handle,
       COALESCE(cs.alpha_score, cr.alpha_score) AS alpha_score,
       COALESCE(cs.accuracy_rank, cr.accuracy_rank) AS accuracy_rank,
       COALESCE(cs.total_calls, cr.total_calls) AS total_calls
     FROM creators cr
     LEFT JOIN creator_stats cs
       ON cs.creator_id = cr.id AND cs.period = 'all_time'
     WHERE cr.id = ANY($1::int[])
     ORDER BY COALESCE(cs.accuracy_rank, cr.accuracy_rank, 999999), cr.name ASC`,
    [ids as number[]],
  );
}

function mergeCreatorOptions(
  base: readonly CreatorOption[],
  selected: readonly CreatorOption[],
): readonly CreatorOption[] {
  const seen = new Set<number>();
  const merged: CreatorOption[] = [];
  for (const row of [...selected, ...base]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return merged;
}

function parseCreatorIds(
  searchParams: PageProps["searchParams"],
  fallback: readonly CreatorOption[],
): readonly number[] {
  const raw: string[] = [];
  const creator = searchParams.creator;
  if (Array.isArray(creator)) raw.push(...creator);
  else if (typeof creator === "string") raw.push(creator);
  if (searchParams.creators) raw.push(...searchParams.creators.split(","));

  const ids: number[] = [];
  const seen = new Set<number>();
  for (const item of raw) {
    const parsed = Number(item);
    if (Number.isInteger(parsed) && parsed > 0 && !seen.has(parsed)) {
      seen.add(parsed);
      ids.push(parsed);
    }
  }
  if (ids.length > 0) return ids;
  return fallback.slice(0, 5).map((row) => row.id);
}

function parseCapital(value: string | undefined): number {
  if (!value) return DEFAULT_CAPITAL;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_CAPITAL;
  if (parsed < MIN_BACKTEST_CAPITAL) return MIN_BACKTEST_CAPITAL;
  if (parsed > MAX_BACKTEST_CAPITAL) return MAX_BACKTEST_CAPITAL;
  return parsed;
}

function parseStrategy(value: string | undefined): BacktestStrategy {
  return value === "direction_only" || value === "equal_weight"
    ? value
    : DEFAULT_STRATEGY;
}

function parseWeighting(value: string | undefined): PortfolioWeightingMode {
  return PORTFOLIO_WEIGHTING_MODES.includes(value as PortfolioWeightingMode)
    ? (value as PortfolioWeightingMode)
    : DEFAULT_WEIGHTING;
}

function parseBenchmark(value: string | undefined): PortfolioBenchmark {
  return PORTFOLIO_BENCHMARKS.includes(value as PortfolioBenchmark)
    ? (value as PortfolioBenchmark)
    : DEFAULT_BENCHMARK;
}

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `-$${formatted}` : `$${formatted}`;
}

function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function labelize(value: string): string {
  return value.replaceAll("_", " ").toUpperCase();
}

function normalizeQuery(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function buildBacktestHref(
  params: {
    readonly creatorIds: readonly number[];
    readonly start: Date;
    readonly end: Date;
    readonly capital: number;
    readonly strategy: BacktestStrategy;
    readonly weighting: PortfolioWeightingMode;
    readonly benchmark: PortfolioBenchmark;
    readonly q?: string;
  },
): string {
  const query = new URLSearchParams({
    start: toDateInput(params.start),
    end: toDateInput(params.end),
    capital: String(params.capital),
    strategy: params.strategy,
    weighting: params.weighting,
    benchmark: params.benchmark,
  });
  if (params.q) query.set("q", params.q);
  for (const creatorId of params.creatorIds) {
    query.append("creator", String(creatorId));
  }
  return `/backtest?${query.toString()}`;
}

function buildBacktestApiHref(
  params: {
    readonly creatorIds: readonly number[];
    readonly start: Date;
    readonly end: Date;
    readonly capital: number;
    readonly strategy: BacktestStrategy;
    readonly weighting: PortfolioWeightingMode;
    readonly benchmark: PortfolioBenchmark;
  },
): string {
  const query = new URLSearchParams({
    creators: params.creatorIds.join(","),
    start: toDateInput(params.start),
    end: toDateInput(params.end),
    capital: String(params.capital),
    strategy: params.strategy,
    weighting: params.weighting,
    benchmark: params.benchmark,
  });
  return `/api/backtest?${query.toString()}`;
}

function LabLocked() {
  return (
    <div className="mx-auto max-w-[1360px] px-[14px] py-12 tab:px-6 desk:px-8 desk:py-16">
      <section className="max-w-3xl border border-ink-250 bg-ink-50 p-6 tab:p-8">
        <p className="flex items-center gap-2 font-mono text-mono-sm uppercase tracking-caps text-accent">
          <span aria-hidden="true" className="inline-block h-2 w-2 bg-accent" />
          Alpha workspace
        </p>
        <h1 className="mt-4 font-serif text-h1 text-ink-900">
          Backtest Lab is an Alpha feature.
        </h1>
        <p className="mt-4 text-body-lg text-ink-700">
          Build creator baskets, run portfolio simulations, and compare the
          system against BTC and ETH benchmarks.
        </p>
        <Link
          href="/pricing"
          className="mt-6 inline-flex min-h-11 items-center bg-accent px-4 font-mono text-mono-lg font-semibold uppercase tracking-caps text-ink-0 transition-colors hover:bg-accent-dim"
        >
          Get Alpha Access
        </Link>
      </section>
    </div>
  );
}

function LabForm({
  creators,
  selectedIds,
  start,
  end,
  capital,
  strategy,
  weighting,
  benchmark,
  q,
}: {
  readonly creators: readonly CreatorOption[];
  readonly selectedIds: readonly number[];
  readonly start: Date;
  readonly end: Date;
  readonly capital: number;
  readonly strategy: BacktestStrategy;
  readonly weighting: PortfolioWeightingMode;
  readonly benchmark: PortfolioBenchmark;
  readonly q: string;
}) {
  const selected = new Set(selectedIds);
  const normalizedQ = normalizeQuery(q);
  const creatorMap = new Map(creators.map((creator) => [creator.id, creator] as const));
  const selectedCreators = selectedIds
    .map((creatorId) => creatorMap.get(creatorId))
    .filter((creator): creator is CreatorOption => Boolean(creator));
  const visibleCreators = normalizedQ
    ? creators.filter((creator) =>
        `${creator.name} ${creator.youtube_handle}`
          .toLowerCase()
          .includes(normalizedQ),
      )
    : creators;
  const orderedVisibleCreators = [...visibleCreators].sort((left, right) => {
    const selectedDelta =
      Number(selected.has(right.id)) - Number(selected.has(left.id));
    if (selectedDelta !== 0) return selectedDelta;
    return left.name.localeCompare(right.name);
  });
  const visibleCreatorIds = new Set(visibleCreators.map((creator) => creator.id));
  const hiddenSelectedIds = selectedIds.filter(
    (creatorId) => !visibleCreatorIds.has(creatorId),
  );
  const topThreeCreators = creators.slice(0, 3).map((creator) => creator.id);
  const presetCreators = creators.slice(0, 5).map((creator) => creator.id);
  const topTenCreators = creators.slice(0, 10).map((creator) => creator.id);
  const clearSearchHref = buildBacktestHref({
    creatorIds: selectedIds,
    start,
    end,
    capital,
    strategy,
    weighting,
    benchmark,
  });
  const resetDefaultsHref = buildBacktestHref({
    creatorIds: presetCreators,
    start,
    end,
    capital,
    strategy,
    weighting: "equal_creator",
    benchmark,
  });
  const shareHref = buildBacktestHref({
    creatorIds: selectedIds,
    start,
    end,
    capital,
    strategy,
    weighting,
    benchmark,
    q,
  });
  const exportHref = buildBacktestApiHref({
    creatorIds: selectedIds,
    start,
    end,
    capital,
    strategy,
    weighting,
    benchmark,
  });

  return (
    <form method="GET" action="/backtest" className="space-y-5">
      {hiddenSelectedIds.map((creatorId) => (
        <input key={creatorId} type="hidden" name="creator" value={creatorId} />
      ))}
      <section className="space-y-4 border-b border-ink-200 pb-4">
        <div>
          <p className="font-mono text-mono-sm uppercase tracking-caps text-ink-500">
            Scenario frame
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Define the time window and the initial sleeve size for the simulation.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 desk:grid-cols-1">
          <label className="space-y-1">
            <span className="block font-mono text-mono-sm uppercase tracking-caps text-ink-500">
              Start
            </span>
            <input
              type="date"
              name="start"
              defaultValue={toDateInput(start)}
              className="min-h-11 w-full border border-ink-250 bg-ink-0 px-2 py-2 font-mono text-body text-ink-800"
            />
          </label>
          <label className="space-y-1">
            <span className="block font-mono text-mono-sm uppercase tracking-caps text-ink-500">
              End
            </span>
            <input
              type="date"
              name="end"
              defaultValue={toDateInput(end)}
              className="min-h-11 w-full border border-ink-250 bg-ink-0 px-2 py-2 font-mono text-body text-ink-800"
            />
          </label>
          <label className="space-y-1 desk:col-span-1">
            <span className="block font-mono text-mono-sm uppercase tracking-caps text-ink-500">
              Starting capital
            </span>
            <input
              type="number"
              name="capital"
              min={MIN_BACKTEST_CAPITAL}
              max={MAX_BACKTEST_CAPITAL}
              defaultValue={capital}
              className="min-h-11 w-full border border-ink-250 bg-ink-0 px-2 py-2 font-mono text-body text-ink-800"
            />
          </label>
        </div>
      </section>

      <section className="space-y-4 border-b border-ink-200 pb-4">
        <div>
          <p className="font-mono text-mono-sm uppercase tracking-caps text-ink-500">
            Return model
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Choose how the basket scores calls, allocates capital, and measures
            excess return against a passive benchmark.
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-2 font-mono text-mono-sm uppercase tracking-caps text-ink-500">
            Strategy
          </legend>
          {STRATEGY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex gap-3 border border-ink-200 bg-ink-0 px-3 py-3 transition-colors hover:border-ink-300"
            >
              <input
                type="radio"
                name="strategy"
                value={option.value}
                defaultChecked={option.value === strategy}
                className="mt-1 accent-accent"
              />
              <span className="min-w-0">
                <span className="block font-semibold text-ink-800">
                  {option.label}
                </span>
                <span className="mt-1 block text-[12px] leading-relaxed text-ink-500">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-2 font-mono text-mono-sm uppercase tracking-caps text-ink-500">
            Weighting
          </legend>
          {PORTFOLIO_WEIGHTING_MODES.map((mode) => (
            <label
              key={mode}
              className="flex gap-3 border border-ink-200 bg-ink-0 px-3 py-3 transition-colors hover:border-ink-300"
            >
              <input
                type="radio"
                name="weighting"
                value={mode}
                defaultChecked={mode === weighting}
                className="mt-1 accent-accent"
              />
              <span className="min-w-0">
                <span className="block font-semibold text-ink-800">
                  {WEIGHTING_COPY[mode].label}
                </span>
                <span className="mt-1 block text-[12px] leading-relaxed text-ink-500">
                  {WEIGHTING_COPY[mode].description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-2 font-mono text-mono-sm uppercase tracking-caps text-ink-500">
            Benchmark
          </legend>
          {BENCHMARK_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex gap-3 border border-ink-200 bg-ink-0 px-3 py-3 transition-colors hover:border-ink-300"
            >
              <input
                type="radio"
                name="benchmark"
                value={option.value}
                defaultChecked={option.value === benchmark}
                className="mt-1 accent-accent"
              />
              <span className="min-w-0">
                <span className="block font-semibold text-ink-800">
                  {option.label}
                </span>
                <span className="mt-1 block text-[12px] leading-relaxed text-ink-500">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      </section>

      <section className="space-y-4">
        <div>
          <p className="font-mono text-mono-sm uppercase tracking-caps text-ink-500">
            Creator basket
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Selected creators stay in the URL and remain pinned even if the
            current search filter hides them from the checklist below.
          </p>
        </div>

        <div className="border border-ink-250 bg-ink-0 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-caps text-ink-500">
                Selected creators
              </p>
              <p className="mt-2 text-sm font-semibold text-ink-800">
                {selectedCreators.length} creator{selectedCreators.length === 1 ? "" : "s"} in scenario
              </p>
            </div>
            <div className="flex flex-wrap gap-3 font-mono text-[11px] uppercase tracking-caps text-ink-600">
              {q && (
                <Link
                  href={clearSearchHref}
                  className="inline-flex min-h-10 items-center underline decoration-ink-300 underline-offset-4 hover:text-accent hover:decoration-accent"
                >
                  Clear search
                </Link>
              )}
              <Link
                href={resetDefaultsHref}
                className="inline-flex min-h-10 items-center underline decoration-ink-300 underline-offset-4 hover:text-accent hover:decoration-accent"
              >
                Reset defaults
              </Link>
              <Link
                href={shareHref}
                className="inline-flex min-h-10 items-center underline decoration-ink-300 underline-offset-4 hover:text-accent hover:decoration-accent"
              >
                Share scenario URL
              </Link>
              <Link
                href={exportHref}
                className="inline-flex min-h-10 items-center underline decoration-ink-300 underline-offset-4 hover:text-accent hover:decoration-accent"
              >
                Export JSON
              </Link>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {selectedCreators.map((creator) => (
              <Link
                key={creator.id}
                href={`/creator/${creatorHandlePath(creator.youtube_handle)}`}
                className="border border-ink-250 bg-ink-50 px-3 py-2 transition-colors hover:border-accent"
              >
                <span className="block text-sm font-semibold text-ink-800">
                  {creator.name}
                </span>
                <span className="mt-1 block font-mono text-[11px] text-ink-500">
                  {creator.youtube_handle} ·{" "}
                  {creator.accuracy_rank ? `#${creator.accuracy_rank}` : "#--"} ·{" "}
                  {creator.alpha_score.toFixed(1)} alpha
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <p className="font-mono text-mono-sm uppercase tracking-caps text-ink-500">
            Preset scenarios
          </p>
          <div className="grid gap-2">
            <Link
              href={buildBacktestHref({
                creatorIds: topThreeCreators,
                start,
                end,
                capital,
                strategy,
                weighting: "equal_creator",
                benchmark,
              })}
              className="border border-ink-250 bg-ink-0 px-3 py-3 transition-colors hover:border-accent"
            >
              <span className="block font-mono text-[11px] uppercase tracking-caps text-ink-500">
                Concentrated
              </span>
              <span className="mt-1 block text-sm font-semibold text-ink-800">
                Top 3 ranked creators
              </span>
              <span className="mt-1 block text-[12px] leading-relaxed text-ink-500">
                Quick stress test for a tighter, higher-conviction basket.
              </span>
            </Link>
            <Link
              href={buildBacktestHref({
                creatorIds: presetCreators,
                start,
                end,
                capital,
                strategy,
                weighting: "equal_creator",
                benchmark,
              })}
              className="border border-ink-250 bg-ink-0 px-3 py-3 transition-colors hover:border-accent"
            >
              <span className="block font-mono text-[11px] uppercase tracking-caps text-ink-500">
                Balanced
              </span>
              <span className="mt-1 block text-sm font-semibold text-ink-800">
                Top 5 creators
              </span>
              <span className="mt-1 block text-[12px] leading-relaxed text-ink-500">
                Equal-creator basket across the leading ranked names.
              </span>
            </Link>
            <Link
              href={buildBacktestHref({
                creatorIds: topTenCreators,
                start,
                end,
                capital,
                strategy,
                weighting: "alpha_score",
                benchmark,
              })}
              className="border border-ink-250 bg-ink-0 px-3 py-3 transition-colors hover:border-accent"
            >
              <span className="block font-mono text-[11px] uppercase tracking-caps text-ink-500">
                Breadth
              </span>
              <span className="mt-1 block text-sm font-semibold text-ink-800">
                Alpha-weighted top 10
              </span>
              <span className="mt-1 block text-[12px] leading-relaxed text-ink-500">
                Wider basket with larger sleeves going to the strongest records.
              </span>
            </Link>
          </div>
        </div>

        <fieldset className="border border-ink-250 bg-ink-50 p-4">
          <legend className="px-1 font-mono text-mono-sm uppercase tracking-caps text-ink-500">
            Creators
          </legend>
          <label className="mb-3 block">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-caps text-ink-500">
              Search creators
            </span>
            <input
              name="q"
              defaultValue={q}
              placeholder="Search creator or @handle"
              className="min-h-10 w-full border border-ink-250 bg-ink-0 px-3 font-mono text-body text-ink-800 placeholder:text-ink-500 focus:border-accent focus:outline-none"
            />
          </label>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] uppercase tracking-caps text-ink-500">
              Available creators
            </p>
            <p className="font-mono text-[10px] uppercase tracking-caps text-ink-500">
              {orderedVisibleCreators.length} shown
            </p>
          </div>
          <div className="grid max-h-[312px] grid-cols-1 gap-2 overflow-y-auto pr-1 tab:grid-cols-2 desk:grid-cols-1">
            {orderedVisibleCreators.map((creator) => (
              <label
                key={creator.id}
                className={`flex min-h-11 items-start gap-2 border px-3 py-2 transition-colors hover:border-ink-300 hover:bg-ink-100 ${
                  selected.has(creator.id)
                    ? "border-accent bg-ink-0"
                    : "border-ink-200 bg-ink-0"
                }`}
              >
                <input
                  type="checkbox"
                  name="creator"
                  value={creator.id}
                  defaultChecked={selected.has(creator.id)}
                  className="mt-1 accent-accent"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink-800">
                    {creator.name}
                  </span>
                  <span className="block font-mono text-[11px] text-ink-500">
                    {creator.youtube_handle}
                  </span>
                  <span className="block font-mono text-[11px] text-ink-500">
                    {creator.accuracy_rank ? `#${creator.accuracy_rank}` : "#--"} ·{" "}
                    {creator.alpha_score.toFixed(1)} alpha · {creator.total_calls} calls
                  </span>
                </span>
              </label>
            ))}
          </div>
          {orderedVisibleCreators.length === 0 && (
            <p className="mt-3 text-sm text-ink-500">No creators match that search.</p>
          )}
        </fieldset>
      </section>

      <button
        type="submit"
        className="min-h-11 bg-accent px-4 font-mono text-mono-lg font-semibold uppercase tracking-caps text-ink-0 transition-colors hover:bg-accent-dim"
      >
        Run scenario
      </button>
    </form>
  );
}

function Summary({ result }: { readonly result: PortfolioBacktestResult }) {
  const hitRate = result.callCount > 0 ? (result.hitCount / result.callCount) * 100 : 0;
  const stats = [
    { label: "Final capital", value: formatCurrency(result.finalCapital), tone: "neutral" },
    { label: "Return", value: formatPct(result.totalReturnPct), tone: result.totalReturnPct >= 0 ? "pos" : "neg" },
    {
      label: `Vs ${labelize(result.benchmark)}`,
      value: formatPct(result.totalReturnVsBenchmarkPct),
      tone: result.totalReturnVsBenchmarkPct >= 0 ? "pos" : "neg",
    },
    { label: "Hit rate", value: `${result.hitCount}/${result.callCount} (${hitRate.toFixed(0)}%)`, tone: "neutral" },
  ] as const;
  return (
    <section className="grid grid-cols-2 border border-ink-250 bg-ink-50 desk:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="border-r border-b border-ink-200 p-4 last:border-r-0">
          <p className="flex items-center gap-2 font-mono text-mono-sm uppercase tracking-caps text-ink-500">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 bg-accent" />
            {stat.label}
          </p>
          <p
            className={`mt-2 break-words font-serif text-2xl tabular-nums tab:text-metric-card ${
              stat.tone === "pos"
                ? "text-pos"
                : stat.tone === "neg"
                  ? "text-neg"
                  : "text-ink-900"
            }`}
          >
            {stat.value}
          </p>
        </div>
      ))}
    </section>
  );
}

function BacktestNarrative({
  result,
}: {
  readonly result: PortfolioBacktestResult;
}) {
  const sortedCreators = [...result.creatorBreakdown].sort(
    (a, b) => b.pnlDollars - a.pnlDollars,
  );
  const best = sortedCreators[0] ?? null;
  const worst = sortedCreators[sortedCreators.length - 1] ?? null;
  const hitRate =
    result.callCount > 0 ? (result.hitCount / result.callCount) * 100 : 0;
  const outperformed = result.totalReturnVsBenchmarkPct >= 0;

  return (
    <section className="grid gap-4 border border-ink-250 bg-ink-50 p-4 tab:p-5 desk:grid-cols-[1fr_1fr_1fr]">
      <div className="desk:col-span-1">
        <p className="flex items-center gap-2 font-mono text-mono-sm uppercase tracking-caps text-accent">
          <span aria-hidden="true" className="inline-block h-2 w-2 bg-accent" />
          Lab readout
        </p>
        <h2 className="mt-3 font-serif text-h3 text-ink-900">
          {outperformed ? "Scenario beat" : "Scenario trailed"}{" "}
          {labelize(result.benchmark)} by{" "}
          <span className={outperformed ? "text-pos" : "text-neg"}>
            {formatPct(result.totalReturnVsBenchmarkPct)}
          </span>
          .
        </h2>
      </div>
      <div className="border-t border-ink-200 pt-3 desk:border-l desk:border-t-0 desk:pl-4 desk:pt-0">
        <p className="font-mono text-mono-sm uppercase tracking-caps text-ink-500">
          Signal quality
        </p>
        <p className="mt-2 text-body text-ink-700">
          {result.hitCount} of {result.callCount} calls resolved as hits
          across the selected basket, a {hitRate.toFixed(0)}% hit rate before
          creator allocation effects.
        </p>
      </div>
      <div className="border-t border-ink-200 pt-3 desk:border-l desk:border-t-0 desk:pl-4 desk:pt-0">
        <p className="font-mono text-mono-sm uppercase tracking-caps text-ink-500">
          Attribution
        </p>
        <p className="mt-2 text-body text-ink-700">
          {best
            ? `${best.creatorName} contributed ${formatCurrency(best.pnlDollars)}.`
            : "No creator attribution available."}{" "}
          {worst && worst.creatorId !== best?.creatorId
            ? `${worst.creatorName} was the largest drag at ${formatCurrency(worst.pnlDollars)}.`
            : ""}
        </p>
      </div>
    </section>
  );
}

function CreatorTable({ result }: { readonly result: PortfolioBacktestResult }) {
  return (
    <section className="border border-ink-250 bg-ink-50">
      <div className="border-b border-ink-200 px-4 py-4">
        <p className="font-mono text-mono-sm uppercase tracking-caps text-accent">
          Creator sleeves
        </p>
        <h2 className="mt-2 font-serif text-h3 text-ink-900">
          Capital allocation by creator
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          Dollar contribution, total sleeve size, and call count for each selected creator.
        </p>
      </div>
      <div
        className="max-w-full overflow-x-auto focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
        tabIndex={0}
        aria-label="Backtest creator allocation table"
      >
      <table className="min-w-[620px] w-full text-sm">
        <thead className="font-mono text-[11px] uppercase tracking-caps text-ink-500">
          <tr className="border-b border-ink-250">
            <th className="px-3 py-2 text-left">Creator</th>
            <th className="px-3 py-2 text-right">Sleeve</th>
            <th className="px-3 py-2 text-right">PnL</th>
            <th className="px-3 py-2 text-right">Return</th>
            <th className="px-3 py-2 text-right">Calls</th>
          </tr>
        </thead>
        <tbody>
          {result.creatorBreakdown.map((row) => (
            <tr key={row.creatorId} className="border-b border-ink-200 last:border-b-0">
              <td className="px-3 py-2">
                <Link
                  href={`/creator/${creatorHandlePath(row.youtubeHandle)}`}
                  className="font-semibold text-ink-800 hover:text-accent"
                >
                  {row.creatorName}
                </Link>
                <div className="font-mono text-[11px] text-ink-500">
                  {row.accuracyRank ? `#${row.accuracyRank}` : "#--"} ·
                  {" "}
                  {row.alphaScore.toFixed(1)} alpha
                </div>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatCurrency(row.allocatedCapital)}
              </td>
              <td
                className={`px-3 py-2 text-right tabular-nums ${
                  row.pnlDollars >= 0 ? "text-pos" : "text-neg"
                }`}
              >
                {formatCurrency(row.pnlDollars)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatPct(row.returnPct)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {row.callCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}

function Ledger({ calls }: { readonly calls: readonly PortfolioBacktestCall[] }) {
  return (
    <section className="border border-ink-250 bg-ink-50">
      <div className="border-b border-ink-200 px-4 py-4">
        <p className="font-mono text-mono-sm uppercase tracking-caps text-accent">
          Call ledger
        </p>
        <h2 className="mt-2 font-serif text-h3 text-ink-900">
          Trade-by-trade readout
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          First 80 resolved calls used in the current scenario, with realized PnL and hit status.
        </p>
      </div>
      <div
        className="max-w-full overflow-x-auto focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
        tabIndex={0}
        aria-label="Backtest call ledger table"
      >
      <table className="min-w-[720px] w-full text-sm">
        <thead className="font-mono text-[11px] uppercase tracking-caps text-ink-500">
          <tr className="border-b border-ink-250">
            <th className="px-3 py-2 text-left">Date</th>
            <th className="px-3 py-2 text-left">Creator</th>
            <th className="px-3 py-2 text-left">Asset</th>
            <th className="px-3 py-2 text-right">Return</th>
            <th className="px-3 py-2 text-right">PnL</th>
            <th className="px-3 py-2 text-right">Result</th>
          </tr>
        </thead>
        <tbody>
          {calls.slice(0, 80).map((call) => (
            <tr key={call.callId} className="border-b border-ink-200 last:border-b-0">
              <td className="px-3 py-2 font-mono text-[12px] text-ink-600">
                {call.callDate.slice(0, 10)}
              </td>
              <td className="px-3 py-2 text-ink-800">{call.creatorName}</td>
              <td className="px-3 py-2 font-mono text-[12px] text-ink-700">
                {call.ticker} · {call.direction}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatPct(call.returnPct)}
              </td>
              <td
                className={`px-3 py-2 text-right tabular-nums ${
                  call.pnlDollars >= 0 ? "text-pos" : "text-neg"
                }`}
              >
                {formatCurrency(call.pnlDollars)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-[11px] uppercase tracking-caps">
                {call.isHit ? "Hit" : "Miss"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {calls.length > 80 && (
        <div className="px-3 py-2 font-mono text-[11px] text-ink-500">
          Showing first 80 of {calls.length} calls.
        </div>
      )}
    </section>
  );
}

export default async function BacktestLabPage({ searchParams }: PageProps) {
  const tier = await getCurrentTier();
  if (!hasAccess(tier, "alpha")) return <LabLocked />;

  const topCreators = await loadCreatorOptions();
  const now = new Date();
  const defaults = defaultBacktestRange(now);
  const selectedIds = parseCreatorIds(searchParams, topCreators);
  const selectedCreators = await loadCreatorsByIds(selectedIds);
  const creators = mergeCreatorOptions(topCreators, selectedCreators);
  const start = parseIsoDateAsStartOfDay(searchParams.start) ?? defaults.start;
  const end = parseIsoDateAsEndOfDay(searchParams.end) ?? defaults.end;
  const safeEnd = end.getTime() > start.getTime() ? end : defaults.end;
  const safeStart = safeEnd.getTime() > start.getTime() ? start : defaults.start;
  const capital = parseCapital(searchParams.capital);
  const strategy = parseStrategy(searchParams.strategy);
  const weighting = parseWeighting(searchParams.weighting);
  const benchmark = parseBenchmark(searchParams.benchmark);
  const q = searchParams.q ?? "";
  const shareHref = buildBacktestHref({
    creatorIds: selectedIds,
    start: safeStart,
    end: safeEnd,
    capital,
    strategy,
    weighting,
    benchmark,
    q,
  });
  const exportHref = buildBacktestApiHref({
    creatorIds: selectedIds,
    start: safeStart,
    end: safeEnd,
    capital,
    strategy,
    weighting,
    benchmark,
  });

  let result: PortfolioBacktestResult | null = null;
  let error = false;
  try {
    result = await runPortfolioBacktest({
      creatorIds: selectedIds,
      startDate: safeStart,
      endDate: safeEnd,
      initialCapital: capital,
      strategy,
      weighting,
      benchmark,
    });
  } catch (err) {
    console.error("[backtest-lab:page] unavailable:", err);
    error = true;
  }

  return (
    <div className="mx-auto max-w-[1360px] px-[14px] py-6 tab:px-6 tab:py-10 desk:px-8 desk:py-12">
      <div className="mb-8 flex flex-col desk:flex-row desk:items-end desk:justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 font-mono text-mono-sm uppercase tracking-caps text-accent">
            <span aria-hidden="true" className="inline-block h-2 w-2 bg-accent" />
            Alpha Lab
          </p>
          <h1 className="mt-2 font-serif text-h1 text-ink-900">
            Backtest <em className="italic text-accent">Lab</em>
          </h1>
          <p className="mt-3 max-w-3xl text-body-lg text-ink-600">
            Build a creator basket, choose the scoring and weighting rules, and
            compare the portfolio against a passive market benchmark.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 font-mono text-mono-sm uppercase tracking-caps">
          <Link
            href={shareHref}
            className="min-h-11 border border-ink-250 bg-ink-50 px-4 py-3 text-ink-700 transition-colors hover:border-accent hover:text-accent"
          >
            Share scenario URL
          </Link>
          <Link
            href={exportHref}
            className="min-h-11 border border-ink-250 bg-ink-50 px-4 py-3 text-ink-700 transition-colors hover:border-accent hover:text-accent"
          >
            JSON export
          </Link>
        </div>
      </div>

      <div className="grid min-w-0 gap-6 desk:grid-cols-[320px_1fr] desk:items-start">
        <section className="order-2 min-w-0 border border-ink-250 bg-ink-50 p-4 tab:p-5 desk:sticky desk:top-28 desk:order-1">
          <div className="mb-4 border-b border-ink-200 pb-3">
            <p className="flex items-center gap-2 font-mono text-mono-sm uppercase tracking-caps text-accent">
              <span aria-hidden="true" className="inline-block h-2 w-2 bg-accent" />
              Scenario builder
            </p>
            <p className="mt-2 text-body text-ink-600">
              Build the scenario in sequence: define the time window, choose the
              return model, then tune the creator basket.
            </p>
          </div>
          <LabForm
            creators={creators}
            selectedIds={selectedIds}
            start={safeStart}
            end={safeEnd}
            capital={capital}
            strategy={strategy}
            weighting={weighting}
            benchmark={benchmark}
            q={q}
          />
        </section>

        <div className="order-1 min-w-0 space-y-6 desk:order-2">
          {error || !result ? (
            <section className="border border-neg bg-neg/10 p-5 text-ink-800">
              Backtest unavailable. Check the selected creators and date range.
            </section>
          ) : (
            <>
              <Summary result={result} />
              <BacktestNarrative result={result} />
              <BacktestLabCharts result={result} />
              <CreatorTable result={result} />
              <Ledger calls={result.pnlByCall} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
