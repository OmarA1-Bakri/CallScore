import type { Metadata } from "next";
import { PageShell } from "@/components/layout";
import { SettingsCard, SettingsHero } from "../_components";

export const metadata: Metadata = { title: "Team Settings | CryptoTubers Ranked" };

export default function TeamSettingsPage() {
  return (
    <PageShell>
      <SettingsHero kicker="Team settings" title="Manage seats, SSO, and research roles." lede="Team settings are a roadmap surface for funds, research desks, and creator-monitoring teams that need shared alert routing." gate="team roadmap">
        <section className="settings-grid">
          <SettingsCard title="Seat management" copy="Invite analysts and assign read-only, alert-manager, or owner-style roles once team accounts land." action="Request seats" />
          <SettingsCard title="Shared watchlists" copy="Create team-level creator and asset lists so signal feeds are consistent across researchers." action="Request shared lists" />
          <SettingsCard title="Audit trail" copy="Track who changed alert routing and which creator/signal decisions were exported." action="Request audit trail" />
        </section>
      </SettingsHero>
    </PageShell>
  );
}
