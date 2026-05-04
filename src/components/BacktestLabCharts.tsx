"use client";

import type { PortfolioBacktestResult } from "@/lib/portfolio-backtest";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const SPEC = {
  bg: "#0A0A0B",
  surface: "#0E0F10",
  elevated: "#141517",
  grid: "#22242A",
  gridStrong: "#2B2D33",
  text: "#E1E3E7",
  body: "#C2C5CC",
  muted: "#7A7F89",
  accent: "#C9A24B",
  benchmark: "#7FA6C9",
  positive: "#6FA56A",
  negative: "#D47A70",
} as const;

interface TooltipPayloadItem {
  readonly value?: number | string;
  readonly name?: string;
  readonly dataKey?: string;
  readonly payload?: Record<string, unknown>;
}

interface ChartTooltipProps {
  readonly active?: boolean;
  readonly payload?: readonly TooltipPayloadItem[];
  readonly label?: string;
}

function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  const compact =
    abs >= 1000
      ? `$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`
      : `$${abs.toFixed(0)}`;
  return value < 0 ? `-${compact}` : compact;
}

function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function benchmarkLabel(value: PortfolioBacktestResult["benchmark"]): string {
  if (value === "btc_eth_50") return "BTC/ETH 50";
  return value.toUpperCase();
}

function compactName(value: string): string {
  return value.length > 18 ? `${value.slice(0, 16)}..` : value;
}

function ProvenanceSquare({ tone = "accent" }: { readonly tone?: "accent" | "positive" | "negative" | "benchmark" }) {
  const color =
    tone === "positive"
      ? SPEC.positive
      : tone === "negative"
        ? SPEC.negative
        : tone === "benchmark"
          ? SPEC.benchmark
          : SPEC.accent;
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2 w-2 shrink-0"
      style={{ backgroundColor: color }}
    />
  );
}

function PanelKicker({
  children,
  tone = "accent",
}: {
  readonly children: string;
  readonly tone?: "accent" | "positive" | "negative" | "benchmark";
}) {
  return (
    <p className="flex items-center gap-2 font-mono text-mono-sm uppercase tracking-caps text-accent">
      <ProvenanceSquare tone={tone} />
      {children}
    </p>
  );
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="border border-ink-250 bg-ink-0/95 px-3 py-2 font-mono text-[11px] shadow-tooltip">
      {label && (
        <p className="mb-2 uppercase tracking-caps text-ink-500">{label}</p>
      )}
      <div className="space-y-1">
        {payload.map((item) => {
          if (typeof item.value !== "number") return null;
          const isReturn = item.dataKey === "returnPct";
          return (
            <p key={`${item.dataKey ?? item.name}-${item.value}`} className="text-ink-800">
              <span className="text-ink-500">{item.name ?? item.dataKey}: </span>
              <span className={item.value < 0 ? "text-neg" : "text-pos"}>
                {isReturn ? formatPct(item.value) : formatCurrency(item.value)}
              </span>
            </p>
          );
        })}
      </div>
    </div>
  );
}

export default function BacktestLabCharts({
  result,
}: {
  readonly result: PortfolioBacktestResult;
}) {
  const label = benchmarkLabel(result.benchmark);
  const equityData = result.monthlySeries.map((point) => ({
    month: point.month,
    portfolioValue: point.portfolioValue,
    benchmarkValue: point.benchmarkValue,
    edgeDollars: point.portfolioValue - point.benchmarkValue,
  }));
  const creatorData = [...result.creatorBreakdown]
    .sort((a, b) => Math.abs(b.pnlDollars) - Math.abs(a.pnlDollars))
    .slice(0, 8)
    .map((row) => ({
      name: compactName(row.creatorName),
      pnlDollars: row.pnlDollars,
      returnPct: row.returnPct,
      allocatedCapital: row.allocatedCapital,
      calls: row.callCount,
    }));
  const edgeData = equityData.map((point) => ({
    month: point.month,
    edgeDollars: point.edgeDollars,
  }));

  return (
    <section
      aria-label="Backtest visual analysis"
      className="scroll-mt-28 grid gap-4 desk:grid-cols-[1.55fr_1fr]"
    >
      <div className="min-w-0 overflow-hidden border border-ink-250 bg-ink-50 p-4 tab:p-5">
        <div className="flex min-w-0 flex-col items-start gap-3 tab:flex-row tab:justify-between">
          <div className="min-w-0">
            <PanelKicker>Visual readout</PanelKicker>
            <h2 className="mt-2 font-serif text-h3 text-ink-900">
              Portfolio equity vs {label}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">
              Total simulated capital versus the passive benchmark across the backtest window.
            </p>
          </div>
          <div className="max-w-full break-words font-mono text-mono-sm uppercase tracking-caps text-ink-500 tab:text-right">
            {result.startDate.slice(0, 10)} / {result.endDate.slice(0, 10)}
          </div>
        </div>
        <div className="mt-5 h-[300px] min-w-0 overflow-hidden tab:h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={equityData}
              margin={{ top: 12, right: 12, left: 4, bottom: 0 }}
            >
              <CartesianGrid stroke={SPEC.grid} strokeDasharray="1 7" />
              <XAxis
                dataKey="month"
                tick={{ fill: SPEC.muted, fontSize: 10, fontFamily: "monospace" }}
                tickLine={false}
                axisLine={{ stroke: SPEC.grid }}
                minTickGap={18}
              />
              <YAxis
                tick={{ fill: SPEC.muted, fontSize: 10, fontFamily: "monospace" }}
                tickFormatter={formatCurrency}
                tickLine={false}
                axisLine={{ stroke: SPEC.grid }}
                width={52}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="portfolioValue"
                name="Portfolio capital"
                fill={SPEC.accent}
                fillOpacity={0.12}
                stroke={SPEC.accent}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                activeDot={{ r: 4, fill: SPEC.accent, stroke: SPEC.bg, strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="benchmarkValue"
                name={`${label} buy-and-hold`}
                stroke={SPEC.benchmark}
                strokeDasharray="4 4"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 font-mono text-[11px] uppercase tracking-caps text-ink-500 tab:grid-cols-2 tab:gap-3">
          <span className="flex items-center gap-2">
            <ProvenanceSquare />
            Portfolio capital
          </span>
          <span className="flex items-center gap-2">
            <ProvenanceSquare tone="benchmark" />
            {label} buy-and-hold
          </span>
        </div>
      </div>

      <div className="grid min-w-0 gap-4">
        <div className="min-w-0 overflow-hidden border border-ink-250 bg-ink-50 p-4">
          <PanelKicker>Attribution</PanelKicker>
          <h3 className="mt-2 font-serif text-h4 text-ink-900">
            Top creator contribution
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Largest positive and negative dollar contributors among the selected sleeves.
          </p>
          <div className="mt-4 h-[250px] min-w-0 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={creatorData}
                layout="vertical"
                margin={{ top: 4, right: 12, left: 6, bottom: 4 }}
              >
                <CartesianGrid stroke={SPEC.grid} strokeDasharray="1 7" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: SPEC.muted, fontSize: 10, fontFamily: "monospace" }}
                  tickFormatter={formatCurrency}
                  tickLine={false}
                  axisLine={{ stroke: SPEC.grid }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: SPEC.body, fontSize: 10, fontFamily: "monospace" }}
                  tickLine={false}
                  axisLine={false}
                  width={116}
                />
                <ReferenceLine x={0} stroke={SPEC.gridStrong} />
                <Tooltip content={<ChartTooltip />} />
                <Bar
                  dataKey="pnlDollars"
                  name="Creator PnL"
                  radius={[0, 2, 2, 0]}
                  barSize={12}
                  isAnimationActive={false}
                >
                  {creatorData.map((row) => (
                    <Cell
                      key={row.name}
                      fill={row.pnlDollars >= 0 ? SPEC.positive : SPEC.negative}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="min-w-0 overflow-hidden border border-ink-250 bg-ink-50 p-4">
          <PanelKicker tone="benchmark">Benchmark edge</PanelKicker>
          <h3 className="mt-2 font-serif text-h4 text-ink-900">
            Monthly edge vs benchmark
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Positive bars mean the basket stayed ahead of the passive benchmark for that month.
          </p>
          <div className="mt-4 h-[170px] min-w-0 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={edgeData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={SPEC.grid} strokeDasharray="1 7" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: SPEC.muted, fontSize: 10, fontFamily: "monospace" }}
                  tickLine={false}
                  axisLine={{ stroke: SPEC.grid }}
                  minTickGap={16}
                />
                <YAxis
                  tick={{ fill: SPEC.muted, fontSize: 10, fontFamily: "monospace" }}
                  tickFormatter={formatCurrency}
                  tickLine={false}
                  axisLine={false}
                  width={46}
                />
                <ReferenceLine y={0} stroke={SPEC.gridStrong} />
                <Tooltip content={<ChartTooltip />} />
                <Bar
                  dataKey="edgeDollars"
                  name={`Monthly edge vs ${label}`}
                  barSize={10}
                  isAnimationActive={false}
                >
                  {edgeData.map((row) => (
                    <Cell
                      key={row.month}
                      fill={row.edgeDollars >= 0 ? SPEC.positive : SPEC.negative}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
}
