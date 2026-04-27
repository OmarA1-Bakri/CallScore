import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout";
import { MetricCard } from "@/components/composites";
import {
  AlphaScore,
  Badge,
  Button,
  DirChip,
  LowNBadge,
  Provenance,
  RankTierBadge,
  Token,
} from "@/components/primitives";
import { query } from "@/lib/db";
import {
  computeCreatorScoreAverages,
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

function toRankTier(rank: number | null | undefined): "S" | "A" | "B" | "C" | "D" {
  const resolved = rank ?? 999;
  if (resolved <= 3) return "S";
  if (resolved <= 10) return "A";
  if (resolved <= 25) return "B";
  if (resolved <= 50) return "C";
  return "D";
}

function displayDirection(direction: Call["direction"]): "long" | "short" | "neutral" {
  if (direction === "bullish") return "long";
  if (direction === "bearish") return "short";
  return "neutral";
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
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

  const alphaScore = stats?.alpha_score ?? creator.alpha_score;
  const winRate = stats?.win_rate ?? creator.win_rate;
  const avgAlpha30d = stats?.avg_alpha_30d ?? 0;
  const scoredCallCount = stats?.total_calls ?? scoredCalls.length;

  const rankTier = toRankTier(stats?.accuracy_rank ?? creator.accuracy_rank);
  const rank = stats?.accuracy_rank ?? creator.accuracy_rank;
  const initials = creator.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <PageShell>
      <Link href="/" className="profile-backlink">← leaderboard</Link>

      <section className="profile-hero">
        <div className="profile-avatar" aria-hidden="true">{initials}</div>
        <div className="profile-id">
          <p className="shell-kicker">Creator profile</p>
          <h1>{creator.name} <em>verified</em></h1>
          <div className="profile-meta">
            <Badge tone="neutral">{creator.youtube_handle}</Badge>
            {creator.subscribers ? <Badge tone="neutral">{creator.subscribers} subs</Badge> : null}
            {creator.focus ? <Badge tone="accent">{creator.focus}</Badge> : null}
            <RankTierBadge tier={rankTier} />
          </div>
        </div>
        <div className="profile-actions">
          <Button variant="primary">Follow</Button>
          <Button>Configure alerts</Button>
          <Link href={`/compare?c=${encodeURIComponent(creator.youtube_handle)}`} className="ui-button ui-button-outline">Compare</Link>
        </div>
      </section>

      <section className="profile-why">
        <span>Why they rank</span>
        <p>
          {creator.name} ranks {rank ? `#${rank}` : "outside the scored set"} with {scoredCallCount} scored calls,
          a {(winRate * 100).toFixed(1)}% win rate, and an evidence-weighted alpha profile of {alphaScore.toFixed(1)}α.
        </p>
        <Provenance href="/methodology" label="score method" />
      </section>

      <section className="profile-metrics" aria-label="Creator metrics">
        <div className="profile-alpha-card"><AlphaScore value={alphaScore} window="all" variant="hero" confidence={scoredCallCount < 20 ? "low" : "normal"} /></div>
        <MetricCard kicker="Win rate" label="Directional wins" value={`${(winRate * 100).toFixed(1)}%`} detail={`Wilson floor ≥${((stats?.wilson_lb ?? 0) * 100).toFixed(1)}%`} />
        <MetricCard kicker="Avg α" label="30d excess" value={`${avgAlpha30d >= 0 ? "+" : ""}${avgAlpha30d.toFixed(1)}%`} detail="Average excess return over BTC benchmark." alpha={avgAlpha30d} />
        <MetricCard kicker="Self-correction" label="Revision score" value={scoreAverages.target.toFixed(1)} detail="Proxy until correction composite lands." />
        <MetricCard kicker="Calls" label="Scored sample" value={String(scoredCallCount)} detail={`${trackedCallCount} tracked calls in ledger.`} />
      </section>

      <section className="profile-body">
        <div className="profile-panel">
          <p className="shell-kicker">Score component averages</p>
          <dl className="profile-score-grid">
            <div><dt>Direction</dt><dd>{scoreAverages.direction.toFixed(1)}</dd></div>
            <div><dt>Alpha</dt><dd>{scoreAverages.alpha.toFixed(1)}</dd></div>
            <div><dt>Specificity</dt><dd>{scoreAverages.specificity.toFixed(1)}</dd></div>
            <div><dt>Regime</dt><dd>{scoreAverages.regime.toFixed(1)}</dd></div>
            <div><dt>Target</dt><dd>{scoreAverages.target.toFixed(1)}</dd></div>
          </dl>
          {scoredCallCount < 20 ? <LowNBadge n={scoredCallCount} /> : <Badge tone="pos">sample healthy</Badge>}
        </div>

        <aside className="profile-panel profile-rail">
          <p className="shell-kicker">Evidence trail</p>
          <p>{performance.length > 0 ? `${performance.length} monthly performance buckets available.` : "No monthly performance data yet."}</p>
          <a href={`https://youtube.com/${creator.youtube_handle}`} target="_blank" rel="noopener noreferrer" className="ui-button ui-button-outline">View YouTube source</a>
        </aside>
      </section>

      <section className="profile-calls" aria-label="Recent calls">
        <div className="profile-section-head">
          <div>
            <p className="shell-kicker">Recent calls</p>
            <h2>Evidence ledger</h2>
          </div>
          <Badge tone="neutral">showing {displayCalls.length} of {trackedCallCount}</Badge>
        </div>
        {displayCalls.length > 0 ? (
          <div className="profile-call-list">
            {displayCalls.map((call) => (
              <article key={call.id}>
                <Token symbol={call.symbol} />
                <DirChip direction={displayDirection(call.direction)} />
                <span>{formatDate(call.call_date)}</span>
                <Badge tone={call.score_status === "scored" ? "pos" : "warn"}>{call.score_status}</Badge>
                <Provenance href={`/call/${call.id}`} label="call" />
              </article>
            ))}
          </div>
        ) : (
          <div className="leaderboard-empty"><span className="shell-square" aria-hidden="true" /><p>No calls tracked yet for this creator.</p></div>
        )}
      </section>
    </PageShell>
  );
}
