import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout";
import { PremiumPreviewLock } from "@/components/primitives";
import { getSignalViews } from "../_data";
import { SignalCard } from "../_components";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My Signals | CryptoTubers Ranked" };

export default async function MySignalsPage() {
  const signals = (await getSignalViews()).slice(0, 2);

  return (
    <PageShell>
      <section className="signals-hero">
        <div><p className="shell-kicker">My signals</p><h1>Watchlist-filtered signals for signed-in users.</h1><p className="shell-lede">Personalized signal filters will connect to auth and settings in the next route phase.</p></div>
        <PremiumPreviewLock gate="watchlist required"><span>Alerts and saved assets unlock this personalized stream.</span></PremiumPreviewLock>
      </section>
      <section className="signals-grid">{signals.map((signal) => <SignalCard key={signal.id} signal={signal} />)}</section>
      <div className="leaderboard-empty"><span className="shell-square" aria-hidden="true" /><p>Connect a watchlist in <Link href="/settings/alerts">alert settings</Link> to filter this feed.</p></div>
    </PageShell>
  );
}
