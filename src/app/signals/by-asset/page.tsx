import type { Metadata } from "next";
import { PageShell } from "@/components/layout";
import { Badge, Token } from "@/components/primitives";
import { getSignalViews } from "../_data";
import { SignalLedger } from "../_components";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Signals by Asset | CryptoTubers Ranked" };

export default async function SignalsByAssetPage() {
  const signals = await getSignalViews();
  const assets = Array.from(new Set(signals.map((signal) => signal.symbol)));

  return (
    <PageShell>
      <section className="signals-hero"><div><p className="shell-kicker">Signals by asset</p><h1>Cluster active and recent theses by underlying asset.</h1><p className="shell-lede">Use asset clusters to spot crowded trades, contrarian calls, and unresolved consensus.</p></div></section>
      <div className="asset-cluster-strip">
        {assets.map((asset) => <a key={asset} href={`#${asset}`}><Token symbol={asset} /><Badge tone="neutral">{signals.filter((signal) => signal.symbol === asset).length}</Badge></a>)}
      </div>
      <SignalLedger signals={signals} />
    </PageShell>
  );
}
