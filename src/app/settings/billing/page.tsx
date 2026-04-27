import { PageShell } from "@/components/layout";

export default function Page() {
  return (
    <PageShell className="shell-placeholder">
      <p className="shell-kicker">Billing settings</p>
      <h1>Manage plan and invoices.</h1>
      <p className="shell-lede">Phase 1 establishes route chrome and navigation; full data composition lands in later route phases.</p>
      <div className="shell-panel">
        <span className="shell-square" aria-hidden="true" />
        <p>Real billing waits on Stripe vs Whop provider decision (OQ-24).</p>
      </div>
    </PageShell>
  );
}
