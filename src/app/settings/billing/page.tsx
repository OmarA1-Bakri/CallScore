import Link from "next/link";
import SettingsShell from "@/components/SettingsShell";
import { getSession } from "@/lib/auth";

function nextUpgradeHref(tier: string | undefined): string {
  if (tier === "pro") return "/api/checkout/alpha";
  if (tier === "alpha") return "/pricing";
  return "/api/checkout/pro";
}

function nextUpgradeLabel(tier: string | undefined): string {
  if (tier === "pro") return "Upgrade to Alpha";
  if (tier === "alpha") return "Compare plans";
  return "Upgrade to Pro";
}

export default async function BillingSettingsPage() {
  const session = await getSession();
  const tier = session?.tier;

  return (
    <SettingsShell
      active="billing"
      title="Billing"
      description="See the current plan, understand the Whop-managed checkout path, and route upgrade or refund requests without inventing account tooling."
      tier={tier}
      primaryAction={{
        label: nextUpgradeLabel(tier),
        href: nextUpgradeHref(tier),
      }}
      secondaryAction={{
        label: "Refund request",
        href: "/feedback?context=/settings/billing",
      }}
      status={[
        {
          label: "Plan",
          value: tier ?? "free",
          tone: tier && tier !== "free" ? "good" : "neutral",
        },
        {
          label: "Billing owner",
          value: "Whop checkout",
          tone: "neutral",
        },
        {
          label: "Refund policy",
          value: "30 days",
          tone: "neutral",
        },
      ]}
    >
      <div className="space-y-6">
        <section className="grid gap-4 desk:grid-cols-[1.1fr_0.9fr]">
          <div className="border border-ink-250 bg-ink-50 p-4">
            <p className="font-mono text-mono-sm uppercase tracking-caps text-accent">
              Current billing context
            </p>
            <p className="mt-4 font-serif text-[18px] leading-relaxed text-ink-700">
              {session
                ? `This session is on the ${tier} plan. Checkout, renewals, and access grants are managed through Whop, not inside CallScore.`
                : "Checkout, renewals, and access grants are managed through the surrounding Whop account, not inside CallScore."}
            </p>
            <dl className="mt-4 space-y-3 font-mono text-[12px]">
              <div className="flex justify-between gap-4 border-b border-ink-200 pb-2">
                <dt className="uppercase tracking-caps text-ink-500">Checkout path</dt>
                <dd className="text-right text-ink-800">/api/checkout/{tier ?? "pro"}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-ink-200 pb-2">
                <dt className="uppercase tracking-caps text-ink-500">Billing system</dt>
                <dd className="text-right text-ink-800">Whop-managed</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="uppercase tracking-caps text-ink-500">Refund requests</dt>
                <dd className="text-right text-ink-800">feedback + checkout email</dd>
              </div>
            </dl>
          </div>

          <div className="border border-ink-250 bg-ink-50 p-4">
            <p className="font-mono text-mono-sm uppercase tracking-caps text-accent">
              Refunds and support
            </p>
            <p className="mt-4 font-serif text-[18px] leading-relaxed text-ink-700">
              The public policy remains a 30-day refund window. Use the feedback form with the
              email used at checkout so support can match the Whop purchase record.
            </p>
          </div>
        </section>

        <section className="border border-ink-250 bg-ink-50">
          <div className="border-b border-ink-250 p-4">
            <h2 className="font-mono text-[12px] uppercase tracking-caps text-ink-500">
              Billing actions
            </h2>
          </div>
          <div className="grid gap-3 p-4 tab:grid-cols-2 desk:grid-cols-4">
            <Link
              href={nextUpgradeHref(tier)}
              className="inline-flex min-h-11 items-center justify-center bg-accent px-4 font-mono text-mono-sm font-semibold uppercase tracking-caps text-ink-0 transition-colors hover:bg-accent-dim"
            >
              {nextUpgradeLabel(tier)}
            </Link>

            <Link
              href="/settings/account"
              className="inline-flex min-h-11 items-center justify-center border border-ink-300 px-4 font-mono text-mono-sm uppercase tracking-caps text-ink-700 transition-colors hover:border-ink-500 hover:text-ink-900"
            >
              Account status
            </Link>

            <Link
              href="/feedback"
              className="inline-flex min-h-11 items-center justify-center border border-ink-300 px-4 font-mono text-mono-sm uppercase tracking-caps text-ink-700 transition-colors hover:border-ink-500 hover:text-ink-900"
            >
              Request refund
            </Link>
          </div>
        </section>
      </div>
    </SettingsShell>
  );
}
