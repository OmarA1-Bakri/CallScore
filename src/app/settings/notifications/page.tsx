import Link from "next/link";
import SettingsShell from "@/components/SettingsShell";
import { getSession } from "@/lib/auth";
import {
  hasAlertUnsubscribe,
  listRecentAlertsForUser,
  listWatchesWithCreators,
} from "@/lib/alerts";
import { requireSessionAccess } from "@/lib/premium";

export default async function NotificationsSettingsPage() {
  const session = await getSession();

  if (!session) {
    return (
      <SettingsShell
        active="notifications"
        title="Notifications"
        description="Sign in and upgrade to Pro to manage email notifications and watchlist alerts."
        primaryAction={{
          label: "View plans",
          href: "/pricing",
        }}
      >
        <section className="border border-ink-250 bg-ink-50 p-5">
          <p className="font-serif text-[19px] leading-relaxed text-ink-700">
            Notifications require a Pro or Alpha plan. View plans to get access.
          </p>
          <Link
            href="/pricing"
            className="mt-4 inline-flex min-h-11 items-center bg-accent px-4 font-mono text-mono-sm font-semibold uppercase tracking-caps text-ink-0"
          >
            View plans
          </Link>
        </section>
      </SettingsShell>
    );
  }

  const access = await requireSessionAccess("pro");
  if (access instanceof Response) {
    return (
      <SettingsShell
        active="notifications"
        title="Notifications"
        description="Email delivery and queue inspection are part of the Pro and Alpha delivery surface."
        tier={session.tier}
        primaryAction={{
          label: "Upgrade to Pro",
          href: "/api/checkout/pro",
        }}
      >
        <section className="border border-ink-250 bg-ink-50 p-5">
          <p className="font-serif text-[19px] leading-relaxed text-ink-700">
            Upgrade to Pro or Alpha to unlock creator watchlists, outbound alert email, and
            delivery health checks.
          </p>
          <Link
            href="/api/checkout/pro"
            className="mt-4 inline-flex min-h-11 items-center bg-accent px-4 font-mono text-mono-sm font-semibold uppercase tracking-caps text-ink-0"
          >
            Upgrade to Pro
          </Link>
        </section>
      </SettingsShell>
    );
  }

  const [watches, recentAlerts, unsubscribed] = await Promise.all([
    listWatchesWithCreators(access.userId),
    listRecentAlertsForUser(access.userId, 12),
    hasAlertUnsubscribe(access.userId),
  ]);
  const pendingCount = recentAlerts.filter((alert) => !alert.sent_at).length;

  return (
    <SettingsShell
      active="notifications"
      title="Notifications"
      description="Read-only notification health for this account: email deliverability, watchlist coverage, and the latest alert queue activity."
      tier={access.tier}
      primaryAction={{
        label: "Manage alerts",
        href: "/settings/alerts",
      }}
      secondaryAction={{
        label: "Feedback",
        href: "/feedback?context=/settings/notifications",
      }}
      status={[
        {
          label: "Email",
          value: unsubscribed ? "Unsubscribed" : "Deliverable",
          tone: unsubscribed ? "warn" : "good",
        },
        {
          label: "Watchlist",
          value: `${watches.length} creators`,
          tone: watches.length > 0 ? "good" : "warn",
        },
        {
          label: "Queue",
          value: pendingCount > 0 ? `${pendingCount} pending` : "clear",
          tone: pendingCount > 0 ? "warn" : "good",
        },
      ]}
    >
      <div className="space-y-6">
        {unsubscribed && (
          <p className="border border-neg/30 bg-neg/10 p-3 text-sm text-ink-700">
            This account is currently unsubscribed from alert email. Re-enable delivery through
            support before adding more watches.
          </p>
        )}

        <section className="grid gap-4 desk:grid-cols-[0.95fr_1.05fr]">
          <div className="border border-ink-250 bg-ink-50 p-4">
            <p className="font-mono text-mono-sm uppercase tracking-caps text-accent">
              Deliverability
            </p>
            <dl className="mt-4 space-y-3 font-mono text-[12px]">
              <div className="flex justify-between gap-4 border-b border-ink-200 pb-2">
                <dt className="uppercase tracking-caps text-ink-500">Email state</dt>
                <dd className="text-right text-ink-800">
                  {unsubscribed ? "unsubscribed" : "eligible for alerts"}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-ink-200 pb-2">
                <dt className="uppercase tracking-caps text-ink-500">Queue events</dt>
                <dd className="text-right text-ink-800">{recentAlerts.length}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="uppercase tracking-caps text-ink-500">Pending now</dt>
                <dd className="text-right text-ink-800">{pendingCount}</dd>
              </div>
            </dl>
          </div>

          <div className="border border-ink-250 bg-ink-50 p-4">
            <p className="font-mono text-mono-sm uppercase tracking-caps text-accent">
              Watchlist coverage
            </p>
            {watches.length === 0 ? (
              <p className="mt-4 font-serif text-[18px] leading-relaxed text-ink-700">
                No watched creators yet. Add watches from the Alerts page to begin delivery.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {watches.slice(0, 5).map((watch) => (
                  <div
                    key={watch.id}
                    className="border-b border-ink-200 pb-3 last:border-b-0 last:pb-0"
                  >
                    <p className="font-semibold text-ink-900">{watch.creator_name}</p>
                    <p className="font-mono text-[12px] text-ink-500">
                      {watch.youtube_handle} / {watch.total_calls} calls /{" "}
                      {watch.accuracy_rank ? `rank #${watch.accuracy_rank}` : "unranked"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="border border-ink-250 bg-ink-50">
          <div className="border-b border-ink-250 p-4">
            <h2 className="font-mono text-[12px] uppercase tracking-caps text-ink-500">
              Recent queue
            </h2>
          </div>
          {recentAlerts.length === 0 ? (
            <div className="p-4 text-sm text-ink-500">No recent notification events.</div>
          ) : (
            <div className="divide-y divide-ink-200">
              {recentAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="grid gap-2 p-4 font-mono text-[12px] tab:grid-cols-[1fr_auto]"
                >
                  <span className="text-ink-700">
                    {alert.event_type} / {alert.creator_name ?? `creator ${alert.creator_id ?? "any"}`} / call{" "}
                    {alert.call_id ?? "digest"}
                  </span>
                  <span className={alert.sent_at ? "text-pos" : "text-warn"}>
                    {alert.sent_at ? "sent" : "pending"}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-ink-250 p-4">
            <Link
              href="/settings/alerts"
              className="inline-flex min-h-11 items-center border border-ink-300 px-4 font-mono text-mono-sm uppercase tracking-caps text-ink-700 transition-colors hover:border-ink-500 hover:text-ink-900"
            >
              Manage alerts
            </Link>
          </div>
        </section>
      </div>
    </SettingsShell>
  );
}
