import type { Metadata } from "next";
import { PageShell } from "@/components/layout";
import { SettingsCard, SettingsHero } from "../_components";

export const metadata: Metadata = { title: "Alert Settings | CryptoTubers Ranked" };

export default function AlertSettingsPage() {
  return (
    <PageShell>
      <SettingsHero kicker="Alert settings" title="Configure signal, creator, and threshold alerts." lede="Alert settings define the future contract for watchlists, email delivery, push notifications, and webhook rules." gate="delivery roadmap">
        <section className="settings-grid">
          <SettingsCard title="Creator watchlist" copy="Follow specific creators and receive alerts when their rank, alpha score, or call cadence changes materially." action="Request creator alerts" />
          <SettingsCard title="Asset thresholds" copy="Track BTC, ETH, SOL, and smaller tokens when consensus clusters form or reverse direction." action="Request asset alerts" />
          <SettingsCard title="Delivery channels" copy="Email is the default planned channel; push/webhooks remain infrastructure-gated until OQ-31 is resolved." action="Request delivery beta" />
        </section>
      </SettingsHero>
    </PageShell>
  );
}
