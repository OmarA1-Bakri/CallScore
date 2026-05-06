import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentTier } from "@/lib/auth";
import { creatorHandlePath, findCreatorByHandle } from "@/lib/creator-handles";
import { hasAccess } from "@/lib/whop";
import {
  BACKTEST_STRATEGIES,
  MAX_BACKTEST_CAPITAL,
  MIN_BACKTEST_CAPITAL,
  runBacktest,
  type BacktestCall,
  type BacktestMonthlyPoint,
  type BacktestResult,
  type BacktestStrategy,
} from "@/lib/backtest";
import {
  defaultBacktestRange,
  parseIsoDateAsEndOfDay,
  parseIsoDateAsStartOfDay,
} from "@/lib/backtest-params";
import type { Creator } from "@/lib/types";

interface PageProps {
  readonly params: Promise<{ handle: string }>;
  readonly searchParams: Promise<{
    readonly start?: string;
    readonly end?: string;
    readonly capital?: string;
    readonly strategy?: string;
  }>;
}

const DEFAULT_CAPITAL = 1000;
const DEFAULT_STRATEGY: BacktestStrategy = "equal_weight";

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { handle: rawHandle } = await params;
  const handle = decodeURIComponent(rawHandle);
  try {
    const creator = await findCreatorByHandle<Pick<Creator, "name" | "youtube_handle">>(
      handle,
      "name, youtube_handle",
    );
    if (!creator) {
      return { title: "Backtest - Creator Not Found | CallScore" };
    }
    return {
      title: `${creator.name} - Backtest | CallScore`,
      description: `Backtest ${creator.name}'s scored crypto calls against BTC.`,
      alternates: {
        canonical: `/creator/${creatorHandlePath(creator.youtube_handle ?? handle)}/backtest`,
      },
    };
  } catch {
    return { title: "Backtest | CallScore" };
  }
}

function parseCapitalParam(value: string | undefined): number {
  if (value === undefined) return DEFAULT_CAPITAL;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_CAPITAL;
  if (parsed < MIN_BACKTEST_CAPITAL) return MIN_BACKTEST_CAPITAL;
  if (parsed > MAX_BACKTEST_CAPITAL) return MAX_BACKTEST_CAPITAL;
  return parsed;
}

function parseStrategyParam(value: string | undefined): BacktestStrategy {
  return BACKTEST_STRATEGIES.includes(value as BacktestStrategy)
    ? (value as BacktestStrategy)
    : DEFAULT_STRATEGY;
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

function toIsoDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function labelize(value: string): string {
  return value.replaceAll("_", " ").toUpperCase();
}

function toneClass(value: number): string {
  if (value > 0) return "text-pos";
  if (value < 0) return "text-neg";
  return "text-ink-900";
}

function PageTitle({ children }: { readonly children: ReactNode }) {
  return (
    <h1 className="mt-3 font-serif text-h1 font-medium leading-tight text-ink-900">
      {children}
    </h1>
  );
}

function BackLink({
  creator,
}: {
  readonly creator: Pick<Creator, "name" | "youtube_handle">;
}) {
  return (
    <Link
      href={`/creator/${creatorHandlePath(creator.youtube_handle)}`}
      className="inline-flex items-center gap-1.5 font-mono text-mono-sm uppercase tracking-caps text-ink-500 transition-colors hover:text-accent"
    >
      <span aria-hidden="true">&larr;</span>
      Back to {creator.name}
    </Link>
  );
}

function AlphaLocked({
  creator,
}: {
  readonly creator: Pick<Creator, "name" | "youtube_handle">;
}) {
  return (
    <div className="mx-auto max-w-page px-[14px] py-8 tab:px-6 tab:py-10 desk:px-8 desk:py-12">
      <BackLink creator={creator} />
      <section className="mt-6 max-w-5xl border border-ink-250 bg-ink-50 p-5 tab:p-6">
        <p className="flex items-center gap-2 font-mono text-mono-sm uppercase tracking-caps text-accent">
          <span aria-hidden="true" className="inline-block h-2 w-2 bg-accent" />
          Alpha lab required
        </p>
        <PageTitle>
          Historical backtests are an{" "}
          <em className="italic text-accent">Alpha</em> feature.
        </PageTitle>
        <p className="mt-4 max-w-2xl font-serif text-body-lg leading-relaxed text-ink-700">
          Single-creator simulations use the same scored-call engine as the
          Backtest Lab, then compare resolved calls against BTC.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link
            href="/pricing"
            className="inline-flex min-h-11 items-center bg-accent px-4 font-mono text-mono-lg font-semibold uppercase tracking-caps text-ink-0 transition-colors hover:bg-accent-dim"
          >
            Upgrade to Alpha
          </Link>
          <Link
            href="/backtest"
            className="inline-flex min-h-11 items-center border border-ink-250 px-4 font-mono text-mono-lg uppercase tracking-caps text-ink-700 transition-colors hover:border-accent hover:text-accent"
          >
            View Lab
          </Link>
        </div>
      </section>
    </div>
  );
}

interface BacktestFormProps {
  readonly handle: string;
  readonly start: Date;
  readonly end: Date;
  readonly capital: number;
  readonly strategy: BacktestStrategy;
}

function BacktestForm({
  handle,
  start,
  end,
  capital,
  strategy,
}: BacktestFormProps) {
  return (
    <form
      method="GET"
      action={`/creator/${encodeURIComponent(handle)}/backtest`}
      className="grid gap-3 tab:grid-cols-2 desk:grid-cols-4"
    >
      <label className="space-y-1">
        <span className="block font-mono text-mono-sm uppercase tracking-caps text-ink-500">
          Start
        </span>
        <input
          type="date"
          name="start"
          defaultValue={toIsoDateInput(start)}
          className="min-h-11 w-full border border-ink-250 bg-ink-0 px-3 py-2 font-mono text-body text-ink-800"
        />
      </label>
      <label className="space-y-1">
        <span className="block font-mono text-mono-sm uppercase tracking-caps text-ink-500">
          End
        </span>
        <input
          type="date"
          name="end"
          defaultValue={toIsoDateInput(end)}
          className="min-h-11 w-full border border-ink-250 bg-ink-0 px-3 py-2 font-mono text-body text-ink-800"
        />
      </label>
      <label className="space-y-1">
        <span className="block font-mono text-mono-sm uppercase tracking-caps text-ink-500">
          Capital
        </span>
        <input
          type="number"
          name="capital"
          min={MIN_BACKTEST_CAPITAL}
          max={MAX_BACKTEST_CAPITAL}
          step="1"
          defaultValue={capital}
          className="min-h-11 w-full border border-ink-250 bg-ink-0 px-3 py-2 font-mono text-body text-ink-800"
        />
      </label>
      <label className="space-y-1">
        <span className="block font-mono text-mono-sm uppercase tracking-caps text-ink-500">
          Strategy
        </span>
        <select
          name="strategy"
          defaultValue={strategy}
          className="min-h-11 w-full border border-ink-250 bg-ink-0 px-3 py-2 font-mono text-body text-ink-800"
        >
          {BACKTEST_STRATEGIES.map((item) => (
            <option key={item} value={item}>
              {labelize(item)}
            </option>
          ))}
        </select>
      </label>
      <div className="tab:col-span-2 desk:col-span-4">
        <button
          type="submit"
          className="min-h-11 bg-accent px-4 font-mono text-mono-lg font-semibold uppercase tracking-caps text-ink-0 transition-colors hover:bg-accent-dim"
        >
          Run Backtest
        </button>
      </div>
    </form>
  );
}

function Summary({ result }: { readonly result: BacktestResult }) {
  const hitRate = result.callCount > 0 ? (result.hitCount / result.callCount) * 100 : 0;
  const stats = [
    { label: "Final capital", value: formatCurrency(result.finalCapital), tone: result.finalCapital - result.initialCapital },
    { label: "Return", value: formatPct(result.totalReturnPct), tone: result.totalReturnPct },
    { label: "Vs BTC", value: formatPct(result.totalReturnVsBtcPct), tone: result.totalReturnVsBtcPct },
    { label: "Hit rate", value: `${result.hitCount}/${result.callCount} (${hitRate.toFixed(0)}%)`, tone: 0 },
  ] as const;

  return (
    <section className="grid grid-cols-2 border border-ink-250 bg-ink-50 desk:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="border-b border-r border-ink-200 p-4 last:border-r-0">
          <p className="flex items-center gap-2 font-mono text-mono-sm uppercase tracking-caps text-ink-500">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 bg-accent" />
            {stat.label}
          </p>
          <p className={`mt-2 break-words font-serif text-2xl tabular-nums tab:text-metric-card ${toneClass(stat.tone)}`}>
            {stat.value}
          </p>
        </div>
      ))}
    </section>
  );
}

function MonthlyBars({
  series,
}: {
  readonly series: readonly BacktestMonthlyPoint[];
}) {
  const values = series.flatMap((point) => [point.portfolioValue, point.btcValue]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);

  return (
    <section className="border border-ink-250 bg-ink-50 p-4 tab:p-5">
      <div className="flex flex-col gap-3 tab:flex-row tab:items-start tab:justify-between">
        <div>
          <p className="flex items-center gap-2 font-mono text-mono-sm uppercase tracking-caps text-accent">
            <span aria-hidden="true" className="inline-block h-2 w-2 bg-accent" />
            Equity path
          </p>
          <h2 className="mt-2 font-serif text-h3 text-ink-900">
            Portfolio vs BTC
          </h2>
        </div>
        <div className="grid gap-1 font-mono text-mono-sm uppercase tracking-caps text-ink-500">
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-2 w-2 bg-accent" />
            Portfolio
          </span>
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-2 w-2 bg-new" />
            BTC
          </span>
        </div>
      </div>
      <div className="mt-6 flex h-[220px] items-end gap-2 overflow-x-auto border-b border-ink-250 pb-3">
        {series.map((point) => {
          const portfolioHeight = 18 + ((point.portfolioValue - min) / span) * 82;
          const btcHeight = 18 + ((point.btcValue - min) / span) * 82;
          return (
            <div key={point.month} className="flex min-w-[34px] flex-1 flex-col items-center gap-2">
              <div className="flex h-[178px] items-end gap-1">
                <div
                  className="w-3 bg-accent"
                  style={{ height: `${portfolioHeight}%` }}
                  title={`${point.month} portfolio ${formatCurrency(point.portfolioValue)}`}
                />
                <div
                  className="w-3 bg-new"
                  style={{ height: `${btcHeight}%` }}
                  title={`${point.month} BTC ${formatCurrency(point.btcValue)}`}
                />
              </div>
              <span className="font-mono text-[10px] text-ink-500">
                {point.month.slice(5)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Ledger({ calls }: { readonly calls: readonly BacktestCall[] }) {
  return (
    <section className="max-w-full overflow-x-auto border border-ink-250 bg-ink-50">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="font-mono text-[11px] uppercase tracking-caps text-ink-500">
          <tr className="border-b border-ink-250">
            <th className="px-3 py-2 text-left">Date</th>
            <th className="px-3 py-2 text-left">Asset</th>
            <th className="px-3 py-2 text-right">Entry</th>
            <th className="px-3 py-2 text-right">Exit</th>
            <th className="px-3 py-2 text-right">Return</th>
            <th className="px-3 py-2 text-right">Alpha vs BTC</th>
            <th className="px-3 py-2 text-right">PnL</th>
            <th className="px-3 py-2 text-right">Result</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((call) => (
            <tr key={call.callId} className="border-b border-ink-200 last:border-b-0">
              <td className="px-3 py-2 font-mono text-[12px] text-ink-600">
                {call.callDate.slice(0, 10)}
              </td>
              <td className="px-3 py-2 font-mono text-[12px] text-ink-700">
                {call.ticker} / {call.direction}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {call.entryPrice === null ? "-" : formatCurrency(call.entryPrice)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {call.exitPrice === null ? "-" : formatCurrency(call.exitPrice)}
              </td>
              <td className={`px-3 py-2 text-right tabular-nums ${toneClass(call.returnPct ?? 0)}`}>
                {call.returnPct === null ? "-" : formatPct(call.returnPct)}
              </td>
              <td className={`px-3 py-2 text-right tabular-nums ${toneClass(call.alphaOverBtc ?? 0)}`}>
                {call.alphaOverBtc === null ? "-" : formatPct(call.alphaOverBtc)}
              </td>
              <td className={`px-3 py-2 text-right tabular-nums ${toneClass(call.pnlDollars)}`}>
                {formatCurrency(call.pnlDollars)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-[11px] uppercase tracking-caps">
                {call.isHit ? "Hit" : "Miss"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default async function BacktestPage({
  params,
  searchParams,
}: PageProps) {
  const [resolvedParams, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const handle = decodeURIComponent(resolvedParams.handle);
  const currentTier = await getCurrentTier();

  let creator: Creator;
  try {
    const resolvedCreator = await findCreatorByHandle<Creator>(handle);
    if (!resolvedCreator) notFound();
    creator = resolvedCreator;
  } catch {
    notFound();
  }

  if (!hasAccess(currentTier, "alpha")) {
    return <AlphaLocked creator={creator} />;
  }

  const now = new Date();
  const { start: defaultStart, end: defaultEnd } = defaultBacktestRange(now);
  const startDate =
    parseIsoDateAsStartOfDay(resolvedSearchParams.start) ?? defaultStart;
  const endDate = parseIsoDateAsEndOfDay(resolvedSearchParams.end) ?? defaultEnd;
  const capital = parseCapitalParam(resolvedSearchParams.capital);
  const strategy = parseStrategyParam(resolvedSearchParams.strategy);
  const safeStart =
    endDate.getTime() > startDate.getTime() ? startDate : defaultStart;
  const safeEnd =
    endDate.getTime() > safeStart.getTime() ? endDate : defaultEnd;

  let result: BacktestResult | null = null;
  let hasError = false;
  try {
    result = await runBacktest({
      creatorId: creator.id,
      startDate: safeStart,
      endDate: safeEnd,
      initialCapital: capital,
      strategy,
    });
  } catch (error: unknown) {
    console.error("[backtest:page] unhandled error:", error);
    hasError = true;
  }

  return (
    <div className="mx-auto max-w-page px-[14px] py-8 tab:px-6 tab:py-10 desk:px-8 desk:py-12">
      <BackLink creator={creator} />

      <div className="mt-8 border-b border-ink-250 pb-8">
        <p className="flex items-center gap-2 font-mono text-mono-sm uppercase tracking-caps text-accent">
          <span aria-hidden="true" className="inline-block h-2 w-2 bg-accent" />
          Single creator backtest
        </p>
        <PageTitle>
          {creator.name} <em className="italic text-accent">simulated</em>.
        </PageTitle>
        <p className="mt-4 max-w-3xl font-serif text-body-lg leading-relaxed text-ink-700">
          Run resolved calls through a capital-weighted scenario
          and compare the result against BTC over the same period.
        </p>
      </div>

      <section className="mt-6 border border-ink-250 bg-ink-50 p-4 tab:p-5">
        <BacktestForm
          handle={handle}
          start={safeStart}
          end={safeEnd}
          capital={capital}
          strategy={strategy}
        />
      </section>

      <div className="mt-6 space-y-6">
        {hasError || !result ? (
          <section className="border border-neg bg-neg/10 p-5 text-ink-800">
            Backtest unavailable. Check the date range and try again.
          </section>
        ) : (
          <>
            <Summary result={result} />
            {result.monthlySeries.length > 0 && (
              <MonthlyBars series={result.monthlySeries} />
            )}
            {result.pnlByCall.length > 0 ? (
              <Ledger calls={result.pnlByCall} />
            ) : (
              <section className="border border-ink-250 bg-ink-50 p-5">
                <p className="font-mono text-mono-sm uppercase tracking-caps text-ink-500">
                  No scored calls in this window. Try expanding the date range.
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
