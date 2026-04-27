import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout";
import { MetricCard } from "@/components/composites";
import { AlphaScore, Badge, DirChip, PremiumPreviewLock, SignalFreshness, Token } from "@/components/primitives";
import { MOCK_LEADERBOARD_ROWS } from "@/lib/mock-data";
import { getSignalViews, formatPercent } from "@/app/signals/_data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard | CryptoTubers Ranked",
  description: "Personal cockpit for creator calls, consensus signals, and follow/fade decisions.",
};

export default async function DashboardPage() {
  const signals = (await getSignalViews()).slice(0, 3);
  const watched = MOCK_LEADERBOARD_ROWS.slice(0, 4);
  const avgAlpha = watched.reduce((sum, row) => sum + row.stats.avg_alpha_30d, 0) / watched.length;
  const alerts = signals.filter((signal) => signal.status === "active").length + watched.filter((row) => row.trend === "up").length;

  return (
    <PageShell>
      <section className="dashboard-hero">
        <div>
          <p className="shell-kicker">Dashboard</p>
          <h1>Decide whether to follow, fade, or ignore since last visit.</h1>
          <p className="shell-lede">A cockpit for watched creators, live consensus clusters, and action-ready call evidence.</p>
        </div>
        <div className="dashboard-alpha-card">
          <AlphaScore value={avgAlpha} window="watchlist" variant="hero" />
          <span>watchlist blended 30d alpha</span>
        </div>
      </section>

      <section className="dashboard-metrics" aria-label="Dashboard summary">
        <MetricCard kicker="Action" label="New items" value={String(alerts)} detail="Creator trend shifts plus active consensus signals." />
        <MetricCard kicker="Watchlist" label="Creators followed" value={String(watched.length)} detail="Seed watchlist until persistent settings land." />
        <MetricCard kicker="Signals" label="Active clusters" value={String(signals.filter((signal) => signal.status === "active").length)} detail="Consensus groups still maturing." />
        <MetricCard kicker="Return" label="Best 30d signal" value={formatPercent(Math.max(...signals.map((signal) => signal.return_30d ?? 0)))} detail="Resolved/fallback sample only." alpha={Math.max(...signals.map((signal) => signal.return_30d ?? 0))} />
      </section>

      <section className="dashboard-grid">
        <div className="dashboard-panel dashboard-panel-wide">
          <div className="dashboard-panel-head"><p className="shell-kicker">Follow / fade queue</p><Link href="/calls">open ledger</Link></div>
          <div className="dashboard-queue">
            {watched.map((row) => (
              <article key={row.creator.id}>
                <div><strong>{row.creator.name}</strong><span>{row.creator.focus}</span></div>
                <AlphaScore value={row.stats.avg_alpha_30d} window="30d" />
                <Badge tone={row.trend === "up" ? "pos" : row.trend === "down" ? "neg" : "neutral"}>{row.trend}</Badge>
              </article>
            ))}
          </div>
        </div>

        <aside className="dashboard-panel">
          <p className="shell-kicker">Personalization</p>
          <PremiumPreviewLock gate="saved watchlist">
            <p>Persisted assets, creators, and alert rules will unlock this dashboard for signed-in users.</p>
          </PremiumPreviewLock>
          <Link href="/settings/alerts" className="ui-button ui-button-outline">Configure alerts</Link>
        </aside>
      </section>

      <section className="dashboard-panel dashboard-signals">
        <div className="dashboard-panel-head"><p className="shell-kicker">Consensus alerts</p><Link href="/signals/active">view signals</Link></div>
        {signals.map((signal) => (
          <article key={signal.id}>
            <Token symbol={signal.symbol} />
            <DirChip direction={signal.direction === "bullish" ? "long" : "short"} />
            <span>{signal.creator_count} creators aligned</span>
            <SignalFreshness state={signal.status === "active" ? "fresh" : "stale"} label={signal.status} />
            <strong>{formatPercent(signal.return_30d)}</strong>
          </article>
        ))}
      </section>
    </PageShell>
  );
}
