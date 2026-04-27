import type { Metadata } from "next";
import { PageShell } from "@/components/layout";
import { MetricCard } from "@/components/composites";
import { Badge } from "@/components/primitives";
import { getSignalViews } from "../_data";
import { SignalCard, SignalLedger } from "../_components";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Active Signals | CryptoTubers Ranked",
  description: "Consensus crypto theses forming across tracked creators.",
};

export default async function ActiveSignalsPage() {
  const signals = (await getSignalViews()).filter((signal) => signal.status === "active");
  const avgConviction = signals.length ? signals.reduce((sum, signal) => sum + signal.conviction, 0) / signals.length : 0;
  const totalCreators = signals.reduce((sum, signal) => sum + signal.creator_count, 0);

  return (
    <PageShell>
      <section className="signals-hero">
        <div>
          <p className="shell-kicker">Signals</p>
          <h1>Theses forming across creators — ranked by conviction, disclosed by evidence.</h1>
          <p className="shell-lede">Consensus signals group recent creator calls by asset, direction, overlap, and outcome horizon.</p>
        </div>
        <Badge tone="lock">elite methodology preview</Badge>
      </section>

      <section className="signals-metrics" aria-label="Active signal summary">
        <MetricCard kicker="Active" label="Consensus theses" value={String(signals.length)} detail="Signals still inside active outcome windows." />
        <MetricCard kicker="Creators" label="Aligned voices" value={String(totalCreators)} detail="Creator mentions across active clusters." />
        <MetricCard kicker="Conviction" label="Average score" value={avgConviction.toFixed(0)} detail="Overlap-weighted placeholder until OQ-17." />
      </section>

      <section className="signals-grid" aria-label="Active signal cards">
        {signals.map((signal) => <SignalCard key={signal.id} signal={signal} />)}
      </section>

      <SignalLedger signals={signals} />
    </PageShell>
  );
}
