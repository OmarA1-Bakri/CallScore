import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import AlphaScoreBadge from "@/components/AlphaScoreBadge";
import PerformanceChart from "@/components/PerformanceChart";
import CallHistory from "@/components/CallHistory";
import ScoreBreakdown from "@/components/ScoreBreakdown";
import { EditorialSection, MetaStrip } from "@/components/primitives";
import { query } from "@/lib/db";
import {
  computeCreatorAvgAlpha30d,
  computeCreatorHitRate,
  computeCreatorScoreAverages,
  computeCreatorWinRate,
  getScoredCalls,
  serializeCalls,
} from "@/lib/public-serializer";
import type { Creator, CreatorStats, Call } from "@/lib/types";

interface PageProps {
  readonly params: { handle: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const handle = decodeURIComponent(params.handle);

  try {
    const creators = await query<Creator>(
      `SELECT * FROM creators WHERE youtube_handle = $1 LIMIT 1`,
      [handle],
    );

    if (creators.length === 0) {
      return { title: "Creator Not Found | CryptoTubers Ranked" };
    }

    const creator = creators[0];
    return {
      title: `${creator.name} — Creator Profile | CryptoTubers Ranked`,
      description: `See ${creator.name}'s crypto call track record, alpha score, win rate, and full call history on CryptoTubers Ranked.`,
      alternates: { canonical: `/creator/${handle}` },
    };
  } catch {
    return { title: "Creator Not Found | CryptoTubers Ranked" };
  }
}

interface PerformancePoint {
  readonly date: string;
  readonly score: number;
}

export default async function CreatorPage({ params }: PageProps) {
  const handle = decodeURIComponent(params.handle);

  // Fetch creator — handle missing table gracefully
  let creator: Creator;
  try {
    const creators = await query<Creator>(
      `SELECT * FROM creators WHERE youtube_handle = $1 LIMIT 1`,
      [handle],
    );
    if (creators.length === 0) {
      notFound();
    }
    creator = creators[0];
  } catch {
    notFound();
  }

  // Fetch creator stats (all_time period)
  let stats: CreatorStats | null = null;
  try {
    const statsRows = await query<CreatorStats>(
      `SELECT * FROM creator_stats WHERE creator_id = $1 AND period = 'all_time' LIMIT 1`,
      [creator.id],
    );
    stats = statsRows.length > 0 ? statsRows[0] : null;
  } catch {
    // Stats table may not exist yet
  }

  // Fetch all calls so the creator-level aggregates use the same eligibility
  // rules as the call page and recompute pipeline.
  const CALL_LIMIT = 50;
  let allCalls: Call[] = [];
  try {
    allCalls = await query<Call>(
      `SELECT *
       FROM calls
       WHERE creator_id = $1
       ORDER BY call_date DESC`,
      [creator.id],
    );
  } catch {
    // Calls table may not exist yet
  }

  const serializedCalls = serializeCalls(allCalls);
  const displayCalls = serializedCalls.slice(0, CALL_LIMIT);
  const trackedCallCount = allCalls.length;
  const scoreAverages = computeCreatorScoreAverages(allCalls);
  const scoredCalls = getScoredCalls(allCalls);

  const monthlyMap = new Map<string, { label: string; total: number; count: number; ts: number }>();
  for (const call of scoredCalls) {
    const callDate = new Date(call.call_date);
    const monthKey = `${callDate.getUTCFullYear()}-${String(callDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const existing = monthlyMap.get(monthKey) ?? {
      label: callDate.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
      total: 0,
      count: 0,
      ts: Date.UTC(callDate.getUTCFullYear(), callDate.getUTCMonth(), 1),
    };
    monthlyMap.set(monthKey, {
      ...existing,
      total: existing.total + (call.public_score ?? 0),
      count: existing.count + 1,
    });
  }

  const performance: PerformancePoint[] = Array.from(monthlyMap.values())
    .sort((a, b) => a.ts - b.ts)
    .map((row) => ({
      date: row.label,
      score: Number((row.total / row.count).toFixed(1)),
    }));

  const alphaScore = Number(scoreAverages.total.toFixed(1));
  const winRate = computeCreatorWinRate(allCalls);
  const avgAlpha30d = computeCreatorAvgAlpha30d(allCalls);
  const scoredCallCount = scoredCalls.length;
  const hitRate = computeCreatorHitRate(allCalls);

  return (
    <div className="max-w-page mx-auto px-4 tab:px-6 desk:px-8 py-8">
      {/* Back link — replaces lucide ArrowLeft with Unicode glyph per spec */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 font-mono text-[10px] text-ink-500 hover:text-ink-700 tracking-caps uppercase mb-8"
      >
        <span aria-hidden="true">←</span> Leaderboard
      </Link>

      {/* HERO */}
      <section className="pb-10 border-b border-ink-250">
        <div className="font-mono text-[10px] text-ink-500 tracking-caps uppercase mb-2">
          Profile · Rank {stats?.accuracy_rank ?? "—"}
        </div>
        <h1 className="font-serif text-[34px] tab:text-[44px] text-ink-900 font-medium tracking-tight leading-[1.1] mb-2">
          {creator.name}
        </h1>
        <a
          href={`https://www.youtube.com/${creator.youtube_handle}`}
          className="font-mono text-[12px] text-ink-500 hover:text-ink-700 tracking-wide inline-flex items-center gap-1.5"
          target="_blank"
          rel="noopener noreferrer"
        >
          {creator.youtube_handle} <ExternalLink className="w-3 h-3" />
        </a>
        <MetaStrip
          cells={[
            { k: "rank", v: stats?.accuracy_rank ?? "—" },
            { k: "alpha", v: alphaScore.toFixed(1) },
            { k: "win rate", v: `${(winRate * 100).toFixed(0)}%` },
            { k: "scored calls", v: scoredCallCount },
          ]}
        />
      </section>

      {/* 01 — synthesis */}
      <EditorialSection index="01" title={<><em className="italic text-accent">Why</em> this rank.</>}>
        <p className="font-serif text-[16px] text-ink-700 leading-relaxed max-w-[680px]">
          {creator.name} ranks{" "}
          <em className="italic text-accent">#{stats?.accuracy_rank ?? "—"}</em> on average alpha
          across {scoredCallCount} scored calls
          {scoredCallCount > 0
            ? `, with a ${(winRate * 100).toFixed(0)}% directional hit rate at 30 days`
            : ""}
          .
        </p>
      </EditorialSection>

      {/* 02 — headline metrics
          Approach: reuse <AlphaScoreBadge> for the alpha tile and render
          three sibling tiles using the same hairline-bordered numeric chip
          pattern (border + bg-ink-50 + 2px radius). Phase 4 may extract
          this into a shared <MetricTile> primitive — see plan Step 4 TODO. */}
      <EditorialSection index="02" title={<>Headline <em className="italic text-accent">metrics</em>.</>}>
        <div className="grid grid-cols-2 tab:grid-cols-4 gap-4">
          <AlphaScoreBadge score={alphaScore} size="lg" />
          <MetricTile
            label="Hit Rate"
            value={`${(hitRate * 100).toFixed(0)}%`}
            unit="hit"
          />
          <MetricTile
            label="Avg α 30d"
            value={`${avgAlpha30d >= 0 ? "+" : ""}${avgAlpha30d.toFixed(1)}`}
            unit="%"
            tone={avgAlpha30d >= 0 ? "pos" : "neg"}
          />
          <MetricTile
            label="Scored Calls"
            value={String(scoredCallCount)}
            unit="n"
          />
        </div>
      </EditorialSection>

      {/* 03 — calls */}
      <EditorialSection index="03" title={<>Recent <em className="italic text-accent">calls</em>.</>}>
        {displayCalls.length > 0 ? (
          <CallHistory
            calls={displayCalls}
            totalCount={trackedCallCount}
            scoredCount={scoredCallCount}
          />
        ) : (
          <p className="font-mono text-[11px] text-ink-500 tracking-wide">
            No calls tracked yet for this creator.
          </p>
        )}
      </EditorialSection>

      {/* 04 — score breakdown */}
      <EditorialSection
        index="04"
        title={<>Score <em className="italic text-accent">breakdown</em>.</>}
        meta={performance.length > 0 ? <>monthly average score<br />window: all time</> : undefined}
      >
        <div className="grid grid-cols-1 desk:grid-cols-2 gap-8">
          <ScoreBreakdown
            direction={Number(scoreAverages.direction.toFixed(1))}
            alpha={Number(scoreAverages.alpha.toFixed(1))}
            specificity={Number(scoreAverages.specificity.toFixed(1))}
            regime={Number(scoreAverages.regime.toFixed(1))}
            target={Number(scoreAverages.target.toFixed(1))}
          />
          {performance.length > 0 ? (
            <PerformanceChart data={performance} />
          ) : (
            <div className="border border-ink-200 p-5 flex items-center justify-center" style={{ borderRadius: 2 }}>
              <p className="font-mono text-[11px] text-ink-500 tracking-wide">No performance data yet</p>
            </div>
          )}
        </div>
      </EditorialSection>

      {/* 05 — backtest CTA */}
      <EditorialSection index="05" title={<>Simulate <em className="italic text-accent">returns</em>.</>}>
        <Link
          href={`/creator/${encodeURIComponent(creator.youtube_handle)}/backtest`}
          className="inline-block font-mono text-[11px] tracking-caps uppercase border border-accent-dim text-accent hover:bg-accent-low px-4 py-2.5 transition-colors"
          style={{ borderRadius: 2 }}
          prefetch={false}
        >
          Run backtest →
        </Link>
      </EditorialSection>
    </div>
  );
}

interface MetricTileProps {
  readonly label: string;
  readonly value: string;
  readonly unit: string;
  readonly tone?: "pos" | "neg" | "default";
}

function MetricTile({ label, value, unit, tone = "default" }: MetricTileProps) {
  const valueColor =
    tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-ink-900";

  return (
    <div
      className="inline-flex flex-col items-start gap-1.5 border border-ink-200 bg-ink-50 px-3 py-2.5"
      style={{ borderRadius: 2 }}
    >
      <div className="flex items-baseline gap-1">
        <span className={`font-serif text-[40px] font-medium tabular-nums tracking-tight ${valueColor}`}>
          {value}
        </span>
        <span className="font-mono text-[13px] text-ink-500 tracking-wide">{unit}</span>
      </div>
      <div className="font-mono text-[9px] text-ink-500 tracking-caps uppercase">
        {label}
      </div>
    </div>
  );
}
