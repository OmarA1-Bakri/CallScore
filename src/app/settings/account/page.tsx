import Link from "next/link";
import SettingsShell from "@/components/SettingsShell";
import { getSession } from "@/lib/auth";

function formatExpiry(exp: number): string {
  const value = new Date(exp);
  if (Number.isNaN(value.getTime())) return "unknown";
  return `${value.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export default async function AccountSettingsPage() {
  const session = await getSession();
  const tier = session?.tier;

  return (
    <SettingsShell
      active="account"
      title="Account"
      description="Inspect Whop-managed access, confirm the current plan, and jump to billing or support actions without exposing secrets."
      tier={tier}
      primaryAction={{
        label:
          tier === "alpha"
            ? "View plans"
            : tier === "pro"
              ? "Upgrade to Alpha"
              : "Upgrade to Pro",
        href:
          tier === "alpha"
            ? "/pricing"
            : tier === "pro"
              ? "/api/checkout/alpha"
              : "/api/checkout/pro",
      }}
      secondaryAction={{
        label: "Billing",
        href: "/settings/billing",
      }}
      status={[
        {
          label: "Identity",
          value: session ? "Whop-Verified" : "Whop-Managed",
          tone: session ? "good" : "neutral",
        },
        {
          label: "Plan",
          value: tier ?? "free",
          tone: tier && tier !== "free" ? "good" : "neutral",
        },
        {
          label: "Access",
          value: session ? "Verified / Redacted" : "Attached by Whop",
          tone: session ? "good" : "neutral",
        },
      ]}
    >
      <div className="space-y-6">
        <section className="grid gap-4 desk:grid-cols-[1.1fr_0.9fr]">
          <div className="border border-ink-250 bg-ink-50 p-4">
            <p className="font-mono text-mono-sm uppercase tracking-caps text-accent">
              Session state
            </p>
            <dl className="mt-4 space-y-3 font-mono text-[12px]">
              <div className="flex justify-between gap-4 border-b border-ink-200 pb-2">
                <dt className="uppercase tracking-caps text-ink-500">User id</dt>
                <dd className="text-right text-ink-800">{session?.userId ?? "Whop-Managed"}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-ink-200 pb-2">
                <dt className="uppercase tracking-caps text-ink-500">Tier</dt>
                <dd className="text-right text-ink-800">{tier ?? "free"}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-ink-200 pb-2">
                <dt className="uppercase tracking-caps text-ink-500">Access token</dt>
                <dd className="text-right text-ink-800">
                  {session ? "Verified / Redacted" : "Attached by Whop"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="uppercase tracking-caps text-ink-500">Expires</dt>
                <dd className="text-right text-ink-800">
                  {session ? formatExpiry(session.exp) : "per Whop request"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="border border-ink-250 bg-ink-50 p-4">
            <p className="font-mono text-mono-sm uppercase tracking-caps text-accent">
              Plan posture
            </p>
            <p className="mt-4 font-serif text-[18px] leading-relaxed text-ink-700">
              Free keeps the public research open. Pro adds watchlists and alert delivery.
              Alpha adds backtests, API keys, and signed webhooks.
            </p>
          </div>
        </section>

        <section className="border border-ink-250 bg-ink-50">
          <div className="border-b border-ink-250 p-4">
            <h2 className="font-mono text-[12px] uppercase tracking-caps text-ink-500">
              Actions
            </h2>
          </div>
          <div className="grid gap-3 p-4 tab:grid-cols-2 desk:grid-cols-4">
            <Link
              href={
                tier === "alpha"
                  ? "/pricing"
                  : tier === "pro"
                    ? "/api/checkout/alpha"
                    : "/api/checkout/pro"
              }
              className="inline-flex min-h-11 items-center justify-center bg-accent px-4 font-mono text-mono-sm font-semibold uppercase tracking-caps text-ink-0 transition-colors hover:bg-accent-dim"
            >
              {tier === "alpha"
                ? "View plans"
                : tier === "pro"
                  ? "Upgrade to Alpha"
                  : "Upgrade to Pro"}
            </Link>

            <Link
              href="/settings/billing"
              className="inline-flex min-h-11 items-center justify-center border border-ink-300 px-4 font-mono text-mono-sm uppercase tracking-caps text-ink-700 transition-colors hover:border-ink-500 hover:text-ink-900"
            >
              Billing
            </Link>

            {tier !== "alpha" && (
              <Link
                href="/pricing"
                className="inline-flex min-h-11 items-center justify-center border border-ink-300 px-4 font-mono text-mono-sm uppercase tracking-caps text-ink-700 transition-colors hover:border-ink-500 hover:text-ink-900"
              >
                Plans
              </Link>
            )}

            <Link
              href="/feedback"
              className="inline-flex min-h-11 items-center justify-center border border-ink-300 px-4 font-mono text-mono-sm uppercase tracking-caps text-ink-700 transition-colors hover:border-ink-500 hover:text-ink-900"
            >
              Feedback
            </Link>
          </div>
        </section>
      </div>
    </SettingsShell>
  );
}
