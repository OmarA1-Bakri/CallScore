import { PageShell } from "@/components/layout";

export default function Page() {
  return (
    <PageShell className="shell-placeholder">
      <p className="shell-kicker">Team settings</p>
      <h1>Manage seats, SSO, and roles.</h1>
      <p className="shell-lede">Phase 1 establishes route chrome and navigation; full data composition lands in later route phases.</p>
      <div className="shell-panel">
        <span className="shell-square" aria-hidden="true" />
        <p>Team admin/member behavior is backend gated by OQ-32.</p>
      </div>
    </PageShell>
  );
}
