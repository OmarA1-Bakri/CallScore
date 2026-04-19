import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@/lib/db";
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
import type { Creator } from "@/lib/types";

interface PageProps {
  readonly params: { handle: string };
  readonly searchParams: {
    readonly start?: string;
    readonly end?: string;
    readonly capital?: string;
    readonly strategy?: string;
  };
}

// Terminal aesthetic palette (DESIGN-LOCK.md v2 — 2026-04-19).
const COLOR_PHOSPHOR = "#3FD67A";
const COLOR_TERMINAL_RED = "#FF5B5B";
const COLOR_BG = "#0B0F0E";
const COLOR_DIM = "#4A6A55";
const COLOR_MID = "#7AA68A";

const DEFAULT_CAPITAL = 1000;
const DEFAULT_STRATEGY: BacktestStrategy = "equal_weight";

// Block glyphs used for the ASCII sparkline. Lowest bar first.
const SPARK_BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const handle = decodeURIComponent(params.handle);
  try {
    const creators = await query<Creator>(
      `SELECT name FROM creators WHERE youtube_handle = $1 LIMIT 1`,
      [handle],
    );
    if (creators.length === 0) {
      return { title: "Backtest — Creator Not Found | CryptoTubers Ranked" };
    }
    return {
      title: `${creators[0].name} — Simulate Returns | CryptoTubers Ranked`,
      description: `Backtest ${creators[0].name}'s scored crypto calls against BTC. See what $1,000 would have become.`,
      alternates: { canonical: `/creator/${handle}/backtest` },
    };
  } catch {
    return { title: "Backtest | CryptoTubers Ranked" };
  }
}

function parseIsoDate(value: string | undefined): Date | null {
  if (value === undefined || value.length === 0) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

// Date-only inputs like "2025-12-31" parse as 2025-12-31T00:00:00Z. Snap
// start to start-of-day and end to end-of-day UTC so the engine's
// inclusive `call_date <= endDate` filter doesn't silently drop calls
// timestamped later on the boundary day.
function parseIsoDateAsStartOfDay(value: string | undefined): Date | null {
  const d = parseIsoDate(value);
  if (d === null) return null;
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function parseIsoDateAsEndOfDay(value: string | undefined): Date | null {
  const d = parseIsoDate(value);
  if (d === null) return null;
  d.setUTCHours(23, 59, 59, 999);
  return d;
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

function buildSparkline(series: readonly BacktestMonthlyPoint[]): string {
  if (series.length === 0) return "";
  const values = series.map((p) => p.portfolioValue);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  if (span === 0) return SPARK_BLOCKS[3].repeat(series.length);
  return values
    .map((v) => {
      const normalized = (v - min) / span;
      const bucket = Math.min(
        SPARK_BLOCKS.length - 1,
        Math.max(0, Math.round(normalized * (SPARK_BLOCKS.length - 1))),
      );
      return SPARK_BLOCKS[bucket];
    })
    .join("");
}

function buildBtcSparkline(series: readonly BacktestMonthlyPoint[]): string {
  if (series.length === 0) return "";
  const values = series.map((p) => p.btcValue);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  if (span === 0) return SPARK_BLOCKS[3].repeat(series.length);
  return values
    .map((v) => {
      const normalized = (v - min) / span;
      const bucket = Math.min(
        SPARK_BLOCKS.length - 1,
        Math.max(0, Math.round(normalized * (SPARK_BLOCKS.length - 1))),
      );
      return SPARK_BLOCKS[bucket];
    })
    .join("");
}

function padRight(value: string, width: number): string {
  if (value.length >= width) return value.slice(0, width);
  return value + " ".repeat(width - value.length);
}

function padLeft(value: string, width: number): string {
  if (value.length >= width) return value.slice(-width);
  return " ".repeat(width - value.length) + value;
}

function renderStatRow(label: string, value: string, width = 40): string {
  const left = label;
  const right = value;
  const dots = Math.max(1, width - left.length - right.length);
  return `${left}${".".repeat(dots)}${right}`;
}

interface LedgerRowProps {
  readonly call: BacktestCall;
}

function LedgerRow({ call }: LedgerRowProps) {
  // Direction-aware hit flag supplied by the engine — a correct short
  // (return_30d < 0) renders HIT, matching how direction_only pays out.
  const hit = call.isHit;
  const color = hit ? COLOR_PHOSPHOR : COLOR_TERMINAL_RED;
  const date = call.callDate.slice(0, 10);
  const ticker = padRight(call.ticker, 10);
  const direction = padRight(call.direction, 5);
  const entry = padLeft(
    call.entryPrice !== null ? `$${call.entryPrice.toFixed(4)}` : "—",
    10,
  );
  const exit = padLeft(
    call.exitPrice !== null ? `$${call.exitPrice.toFixed(4)}` : "—",
    10,
  );
  const ret = padLeft(
    call.returnPct !== null ? formatPct(call.returnPct) : "—",
    8,
  );
  const alpha = padLeft(
    call.alphaOverBtc !== null ? formatPct(call.alphaOverBtc) : "—",
    8,
  );
  const verdict = hit ? "HIT " : "MISS";
  return (
    <div
      className="font-mono text-[11px] sm:text-xs whitespace-pre"
      style={{ color }}
    >
      {`${date}  ${ticker} ${direction} ${entry} ${exit} ${ret} ${alpha}  ${verdict}`}
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
      className="grid grid-cols-1 sm:grid-cols-4 gap-3 font-mono text-xs"
    >
      <label className="flex flex-col gap-1">
        <span style={{ color: COLOR_MID }}>start</span>
        <input
          type="date"
          name="start"
          defaultValue={toIsoDateInput(start)}
          className="bg-transparent border px-2 py-1 rounded"
          style={{ borderColor: COLOR_DIM, color: COLOR_PHOSPHOR }}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span style={{ color: COLOR_MID }}>end</span>
        <input
          type="date"
          name="end"
          defaultValue={toIsoDateInput(end)}
          className="bg-transparent border px-2 py-1 rounded"
          style={{ borderColor: COLOR_DIM, color: COLOR_PHOSPHOR }}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span style={{ color: COLOR_MID }}>capital ($)</span>
        <input
          type="number"
          name="capital"
          min={MIN_BACKTEST_CAPITAL}
          max={MAX_BACKTEST_CAPITAL}
          step="1"
          defaultValue={capital}
          className="bg-transparent border px-2 py-1 rounded"
          style={{ borderColor: COLOR_DIM, color: COLOR_PHOSPHOR }}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span style={{ color: COLOR_MID }}>strategy</span>
        <select
          name="strategy"
          defaultValue={strategy}
          className="bg-transparent border px-2 py-1 rounded"
          style={{ borderColor: COLOR_DIM, color: COLOR_PHOSPHOR }}
        >
          {BACKTEST_STRATEGIES.map((s) => (
            <option key={s} value={s} style={{ backgroundColor: COLOR_BG }}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <div className="sm:col-span-4">
        <button
          type="submit"
          className="border px-3 py-1 rounded font-mono text-xs hover:brightness-125 transition"
          style={{ borderColor: COLOR_PHOSPHOR, color: COLOR_PHOSPHOR }}
        >
          :: run
        </button>
      </div>
    </form>
  );
}

export default async function BacktestPage({
  params,
  searchParams,
}: PageProps) {
  const handle = decodeURIComponent(params.handle);

  let creator: Creator;
  try {
    const creators = await query<Creator>(
      `SELECT * FROM creators WHERE youtube_handle = $1 LIMIT 1`,
      [handle],
    );
    if (creators.length === 0) notFound();
    creator = creators[0];
  } catch {
    notFound();
  }

  const now = new Date();
  const defaultEnd = new Date(now);
  defaultEnd.setUTCHours(23, 59, 59, 999);
  const defaultStart = new Date(now);
  defaultStart.setUTCDate(defaultStart.getUTCDate() - 365);
  defaultStart.setUTCHours(0, 0, 0, 0);

  const startDate =
    parseIsoDateAsStartOfDay(searchParams.start) ?? defaultStart;
  const endDate = parseIsoDateAsEndOfDay(searchParams.end) ?? defaultEnd;
  const capital = parseCapitalParam(searchParams.capital);
  const strategy = parseStrategyParam(searchParams.strategy);

  // Guard against an invalid user range server-side. Fall back to the
  // defaults rather than 500'ing so the form remains usable.
  const safeStart =
    endDate.getTime() > startDate.getTime() ? startDate : defaultStart;
  const safeEnd =
    endDate.getTime() > safeStart.getTime() ? endDate : defaultEnd;

  let result: BacktestResult | null = null;
  let errorMessage: string | null = null;
  try {
    result = await runBacktest({
      creatorId: creator.id,
      startDate: safeStart,
      endDate: safeEnd,
      initialCapital: capital,
      strategy,
    });
  } catch (error: unknown) {
    errorMessage = error instanceof Error ? error.message : "backtest_failed";
  }

  const profitable = result ? result.finalCapital >= result.initialCapital : true;
  const heroColor = profitable ? COLOR_PHOSPHOR : COLOR_TERMINAL_RED;

  const sparkline = result ? buildSparkline(result.monthlySeries) : "";
  const btcSparkline = result ? buildBtcSparkline(result.monthlySeries) : "";

  const hitRate =
    result && result.callCount > 0
      ? (result.hitCount / result.callCount) * 100
      : 0;

  const ledger = result ? result.pnlByCall : [];

  return (
    <div
      className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-mono"
      style={{ color: COLOR_PHOSPHOR }}
    >
      <div
        className="border-b pb-3 mb-6 text-xs"
        style={{ borderColor: COLOR_DIM, color: COLOR_MID }}
      >
        {`// creator/${handle}/backtest :: v1 :: cache 1h`}
      </div>

      <div className="mb-4">
        <Link
          href={`/creator/${encodeURIComponent(handle)}`}
          className="text-xs hover:underline"
          style={{ color: COLOR_MID }}
        >
          ← back to {creator.name}
        </Link>
      </div>

      <section className="mb-8">
        <p className="text-xs mb-1" style={{ color: COLOR_MID }}>
          simulated portfolio
        </p>
        {result ? (
          <h1
            className="text-3xl sm:text-5xl font-bold tabular-nums"
            style={{ color: heroColor }}
          >
            {`${formatCurrency(result.initialCapital)} → ${formatCurrency(result.finalCapital)}`}
          </h1>
        ) : (
          <h1 className="text-2xl" style={{ color: COLOR_TERMINAL_RED }}>
            {errorMessage ?? "backtest unavailable"}
          </h1>
        )}
      </section>

      <section
        className="mb-8 border p-4 rounded"
        style={{ borderColor: COLOR_DIM }}
      >
        <BacktestForm
          handle={handle}
          start={safeStart}
          end={safeEnd}
          capital={capital}
          strategy={strategy}
        />
      </section>

      {result && (
        <>
          <section className="mb-8 text-xs sm:text-sm space-y-1">
            <div className="whitespace-pre">
              {renderStatRow("TOTAL RETURN", formatPct(result.totalReturnPct))}
            </div>
            <div className="whitespace-pre">
              {renderStatRow("VS BTC", formatPct(result.totalReturnVsBtcPct))}
            </div>
            <div className="whitespace-pre">
              {renderStatRow(
                "HIT RATE",
                `${result.hitCount}/${result.callCount} (${hitRate.toFixed(0)}%)`,
              )}
            </div>
            <div className="whitespace-pre">
              {renderStatRow("CALL COUNT", String(result.callCount))}
            </div>
            <div className="whitespace-pre">
              {renderStatRow(
                "PERIOD",
                `${result.startDate.slice(0, 10)} → ${result.endDate.slice(0, 10)}`,
              )}
            </div>
            <div className="whitespace-pre">
              {renderStatRow("STRATEGY", strategy)}
            </div>
          </section>

          <section
            className="mb-8 border p-4 rounded"
            style={{ borderColor: COLOR_DIM }}
          >
            <p className="text-xs mb-2" style={{ color: COLOR_MID }}>
              portfolio (phosphor) vs btc (dim)
            </p>
            <div
              className="text-2xl tabular-nums whitespace-pre leading-none"
              style={{ color: COLOR_PHOSPHOR }}
              aria-hidden="true"
            >
              {sparkline.length > 0 ? sparkline : "—"}
            </div>
            <div
              className="text-2xl tabular-nums whitespace-pre leading-none mt-1 opacity-70"
              style={{ color: COLOR_MID }}
              aria-hidden="true"
            >
              {btcSparkline.length > 0 ? btcSparkline : "—"}
            </div>
            <div className="sr-only">
              Portfolio chart over {result.monthlySeries.length} months,
              ending at {formatCurrency(result.finalCapital)} versus BTC
              benchmark.
            </div>
          </section>

          <section className="mb-8">
            <p className="text-xs mb-2" style={{ color: COLOR_MID }}>
              ledger ({ledger.length} calls)
            </p>
            {ledger.length > 0 ? (
              <div
                className="border p-3 rounded overflow-x-auto"
                style={{ borderColor: COLOR_DIM }}
              >
                <div
                  className="font-mono text-[11px] sm:text-xs whitespace-pre mb-2"
                  style={{ color: COLOR_MID }}
                >
                  {`DATE        TICKER     DIR   ENTRY      EXIT       RET%     ALPHA     HIT/MISS`}
                </div>
                {ledger.map((call) => (
                  <LedgerRow key={call.callId} call={call} />
                ))}
              </div>
            ) : (
              <div
                className="border p-4 rounded text-xs"
                style={{ borderColor: COLOR_DIM, color: COLOR_MID }}
              >
                no scored calls in this window. try expanding the date range.
              </div>
            )}
          </section>
        </>
      )}

      <footer
        className="pt-4 border-t text-[11px]"
        style={{ borderColor: COLOR_DIM, color: COLOR_MID }}
      >
        {`// scoring: return_30d (close-to-close) :: benchmark: BTCUSDT :: source: CryptoTubers Ranked`}
      </footer>
    </div>
  );
}
