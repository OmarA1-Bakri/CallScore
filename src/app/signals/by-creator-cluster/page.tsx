import type { Metadata } from "next";
import { PageShell } from "@/components/layout";
import { MetricCard } from "@/components/composites";
import { getSignalViews } from "../_data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Creator Signal Clusters | CryptoTubers Ranked" };

export default async function CreatorClusterPage() {
  const signals = await getSignalViews();
  const largest = [...signals].sort((a, b) => b.creator_count - a.creator_count).slice(0, 4);

  return (
    <PageShell>
      <section className="signals-hero"><div><p className="shell-kicker">Creator clusters</p><h1>Group theses by creator-cohort behavior.</h1><p className="shell-lede">This view surfaces creator overlap before the full cohort cohesion backend lands.</p></div></section>
      <section className="signals-grid">
        {largest.map((signal) => <MetricCard key={signal.id} kicker={signal.symbol.replace("USDT", "")} label={`${signal.direction} cluster`} value={`${signal.creator_count} creators`} detail={signal.creator_names.slice(0, 4).join(", ") || "Creator names unavailable."} />)}
      </section>
    </PageShell>
  );
}
