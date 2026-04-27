import type { Metadata } from "next";
import { PageShell } from "@/components/layout";
import { MetricCard } from "@/components/composites";
import { getSignalViews, formatPercent } from "../_data";
import { SignalLedger } from "../_components";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Resolved Signals | CryptoTubers Ranked" };

export default async function ResolvedSignalsPage() {
  const signals = (await getSignalViews()).filter((signal) => signal.status === "resolved");
  const hitRate = signals.length ? signals.filter((signal) => signal.correct).length / signals.length : 0;
  const avgReturn = signals.length ? signals.reduce((sum, signal) => sum + (signal.return_30d ?? 0), 0) / signals.length : 0;

  return (
    <PageShell>
      <section className="signals-hero"><div><p className="shell-kicker">Resolved signals</p><h1>Historical theses with outcome evidence.</h1><p className="shell-lede">Resolved signals expose whether crowd consensus translated into excess returns after the scoring horizon.</p></div></section>
      <section className="signals-metrics" aria-label="Resolved signal summary">
        <MetricCard kicker="Resolved" label="Closed theses" value={String(signals.length)} detail="Signals with available outcomes." />
        <MetricCard kicker="Hit rate" label="Direction correct" value={`${(hitRate * 100).toFixed(1)}%`} detail="Computed on resolved signals." />
        <MetricCard kicker="30d" label="Average return" value={formatPercent(avgReturn)} detail="Simple average across resolved clusters." alpha={avgReturn} />
      </section>
      <SignalLedger signals={signals} />
    </PageShell>
  );
}
