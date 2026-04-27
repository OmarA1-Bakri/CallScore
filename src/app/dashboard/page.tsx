import { PageShell } from "@/components/layout";

export default function Page() {
  return (
    <PageShell className="shell-placeholder">
      <p className="shell-kicker">Dashboard</p>
      <h1>Decide whether to follow, fade, or ignore since last visit.</h1>
      <p className="shell-lede">Phase 1 establishes route chrome and navigation; full data composition lands in later route phases.</p>
      <div className="shell-panel">
        <span className="shell-square" aria-hidden="true" />
        <p>Cockpit shell uses seed data until last-visit storage lands (OQ-27).</p>
      </div>
    </PageShell>
  );
}
