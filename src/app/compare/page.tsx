import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout";
import { MetricCard } from "@/components/composites";
import { AlphaScore, Badge, Originator, Rank, RankTierBadge } from "@/components/primitives";
import { MOCK_LEADERBOARD_ROWS } from "@/lib/mock-data";

export const metadata: Metadata = {
  title: "Compare Creators | CryptoTubers Ranked",
  description: "Side-by-side creator synthesis across alpha, win rate, sample depth, and strategy profile.",
};

function toTier(rank: number): "S" | "A" | "B" | "C" | "D" {
  if (rank <= 3) return "S";
  if (rank <= 10) return "A";
  if (rank <= 25) return "B";
  if (rank <= 50) return "C";
  return "D";
}

const compared = MOCK_LEADERBOARD_ROWS.slice(0, 3);
const leader = compared[0];

export default function ComparePage() {
  return (
    <PageShell>
      <section className="compare-hero">
        <div>
          <p className="shell-kicker">Compare</p>
          <h1>Side-by-side creator synthesis on the same axes.</h1>
          <p className="shell-lede">Compare creator quality without mixing sample size, scoring window, or raw subscriber popularity into the same claim.</p>
        </div>
        <Badge tone="lock">4-way export pro-gated</Badge>
      </section>

      <section className="compare-summary" aria-label="Comparison summary">
        <MetricCard kicker="Leader" label={leader.creator.name} value={`${leader.stats.alpha_score.toFixed(1)}α`} detail="Best alpha score in this comparison." alpha={leader.stats.avg_alpha_30d} />
        <MetricCard kicker="Spread" label="Alpha gap" value={`${(compared[0].stats.alpha_score - compared[2].stats.alpha_score).toFixed(1)} pts`} detail="Difference between top and third slot." />
        <MetricCard kicker="Sample" label="Total calls" value={String(compared.reduce((sum, row) => sum + row.stats.total_calls, 0))} detail="Combined scored calls across compared creators." />
      </section>

      <section className="compare-board" aria-label="Creator comparison board">
        {compared.map((row, index) => (
          <article key={row.creator.id} className="compare-card">
            <div className="compare-card-head">
              <Rank value={row.rank} />
              <RankTierBadge tier={toTier(row.rank)} />
              {index === 0 ? <Originator label="benchmark" /> : null}
            </div>
            <h2>{row.creator.name}</h2>
            <p>{row.creator.focus}</p>
            <AlphaScore value={row.stats.avg_alpha_30d} window="30d" variant="hero" confidence={row.stats.total_calls < 20 ? "low" : "normal"} />
            <dl className="compare-axis-grid">
              <div><dt>Win rate</dt><dd>{(row.stats.win_rate * 100).toFixed(1)}%</dd></div>
              <div><dt>Wilson floor</dt><dd>{(row.stats.wilson_lb * 100).toFixed(1)}%</dd></div>
              <div><dt>Specificity</dt><dd>{row.stats.specificity_avg.toFixed(2)}</dd></div>
              <div><dt>Consistency</dt><dd>{row.stats.strategy_consistency.toFixed(2)}</dd></div>
            </dl>
            <Link href={`/creator/${row.creator.youtube_handle}`} className="ui-button ui-button-outline">Open profile</Link>
          </article>
        ))}
      </section>

      <section className="compare-notes">
        <span className="shell-square" aria-hidden="true" />
        <p>Comparison inputs are locked to one scoring window. Query-string creator selection can layer on top of this layout without changing the card contract.</p>
      </section>
    </PageShell>
  );
}
