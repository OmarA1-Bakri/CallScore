import { PageShell } from "@/components/layout";

export default function Page() {
  return (
    <PageShell className="shell-placeholder">
      <p className="shell-kicker">My signals</p>
      <h1>Watchlist-filtered signals for signed-in users.</h1>
      <p className="shell-lede">Phase 1 establishes route chrome and navigation; full data composition lands in later route phases.</p>
      <div className="shell-panel">
        <span className="shell-square" aria-hidden="true" />
        <p>Signed-in watchlist chrome — auth gate wiring lands with settings.</p>
      </div>
    </PageShell>
  );
}
