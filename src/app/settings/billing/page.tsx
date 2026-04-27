import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout";
import { Badge } from "@/components/primitives";
import { SettingsHero } from "../_components";

export const metadata: Metadata = { title: "Billing Settings | CryptoTubers Ranked" };

export default function BillingSettingsPage() {
  return (
    <PageShell>
      <SettingsHero kicker="Billing settings" title="Manage plan intent before checkout goes live." lede="The public beta keeps billing inactive while Stripe-vs-Whop provider decisions and premium workflow boundaries are finalized." gate="billing paused">
        <section className="settings-grid settings-grid-two">
          <article className="settings-card"><Badge tone="neutral">current</Badge><h2>Free public beta</h2><p>Leaderboard, profiles, calls, pricing, methodology, and route previews are available without checkout.</p><Link href="/pricing" className="ui-button ui-button-primary">Review pricing</Link></article>
          <article className="settings-card"><Badge tone="lock">planned</Badge><h2>Premium provider</h2><p>Billing remains provider-gated. Paid CTAs route to feedback until account and invoice semantics are final.</p><Link href="/feedback" className="ui-button ui-button-outline">Join billing beta</Link></article>
        </section>
      </SettingsHero>
    </PageShell>
  );
}
