import Link from "next/link";
import type { ReactNode } from "react";
import { requireSessionAccess } from "@/lib/premium";
import { hasAlertUnsubscribe, listRecentAlertsForUser, listWatches } from "@/lib/alerts";

export default async function AlertSettingsPage() {
  const session = await requireSessionAccess("pro");
  if (session instanceof Response) {
    return (
      <SettingsShell title="Alerts">
        <p className="font-serif text-[19px] text-ink-700">Pro unlocks watchlists and email alerts.</p>
        <Link href="/pricing" className="text-accent font-mono text-[12px] tracking-caps uppercase">Upgrade</Link>
      </SettingsShell>
    );
  }

  const [watches, recentAlerts, unsubscribed] = await Promise.all([
    listWatches(session.userId),
    listRecentAlertsForUser(session.userId, 20),
    hasAlertUnsubscribe(session.userId),
  ]);

  return (
    <SettingsShell title="Alerts">
      <section className="border-y border-ink-150 py-4">
        {unsubscribed && (
          <p className="mb-4 border border-neg/30 bg-neg/10 p-3 text-sm text-ink-700">
            This account is unsubscribed from alert emails. Add a watch after resubscribing support-side to resume delivery.
          </p>
        )}
        <h2 className="font-mono text-[12px] tracking-caps uppercase text-ink-500 mb-3">Watchlist</h2>
        {watches.length === 0 ? (
          <p className="text-ink-500 text-sm">No watched creators yet.</p>
        ) : (
          <ul className="space-y-2">
            {watches.map((watch) => (
              <li key={watch.id} className="font-mono text-[13px] text-ink-700">
                creator #{watch.creator_id}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="py-4">
        <h2 className="font-mono text-[12px] tracking-caps uppercase text-ink-500 mb-3">Recent alert queue</h2>
        {recentAlerts.length === 0 ? (
          <p className="text-ink-500 text-sm">No recent alerts.</p>
        ) : (
          <ul className="space-y-2">
            {recentAlerts.map((alert) => (
              <li key={alert.id} className="font-mono text-[13px] text-ink-700">
                {alert.event_type} · creator {alert.creator_id ?? "any"} · {alert.sent_at ? "sent" : "pending"}
              </li>
            ))}
          </ul>
        )}
      </section>
    </SettingsShell>
  );
}

function SettingsShell({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <main className="max-w-page mx-auto px-4 tab:px-6 desk:px-8 py-10">
      <p className="font-mono text-[11px] text-ink-500 tracking-caps uppercase mb-2">settings</p>
      <h1 className="font-serif text-[35px] text-ink-900 font-medium mb-6">{title}</h1>
      <div className="space-y-6">{children}</div>
    </main>
  );
}
