import Link from "next/link";
import SettingsShell from "@/components/SettingsShell";
import { getSession } from "@/lib/auth";

export default async function TeamSettingsPage() {
  const session = await getSession();
  const tier = session?.tier;

  return (
    <SettingsShell
      active="team"
      title="Team"
      description="Planned team management surface for shared access, seat controls, and delivery ownership. This route is live, but the backend is intentionally not invented yet."
      tier={tier}
      primaryAction={{
        label: session ? "Request pilot" : "Sign in",
        href: session ? "/feedback?context=/settings/team" : "/api/auth/whop",
        prefetch: session ? undefined : false,
      }}
      secondaryAction={{
        label: "Account",
        href: "/settings/account",
      }}
      status={[
        {
          label: "Session",
          value: session ? "Signed in" : "Signed out",
          tone: session ? "good" : "warn",
        },
        {
          label: "Seats",
          value: "Planned",
          tone: "neutral",
        },
        {
          label: "Role sync",
          value: "Not shipped",
          tone: "warn",
        },
      ]}
    >
      <div className="space-y-6">
        <section className="grid gap-4 desk:grid-cols-[1fr_1fr]">
          <div className="border border-ink-250 bg-ink-50 p-4">
            <p className="font-mono text-mono-sm uppercase tracking-caps text-accent">
              Planned scope
            </p>
            <p className="mt-4 font-serif text-[18px] leading-relaxed text-ink-700">
              Team support is reserved for a later slice: shared watchlists, seat assignments,
              alert ownership, and account-level webhook governance.
            </p>
          </div>

          <div className="border border-ink-250 bg-ink-50 p-4">
            <p className="font-mono text-mono-sm uppercase tracking-caps text-accent">
              Current posture
            </p>
            <dl className="mt-4 space-y-3 font-mono text-[12px]">
              <div className="flex justify-between gap-4 border-b border-ink-200 pb-2">
                <dt className="uppercase tracking-caps text-ink-500">Current user</dt>
                <dd className="text-right text-ink-800">{session?.userId ?? "guest"}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-ink-200 pb-2">
                <dt className="uppercase tracking-caps text-ink-500">Plan</dt>
                <dd className="text-right text-ink-800">{tier ?? "free"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="uppercase tracking-caps text-ink-500">Shared access</dt>
                <dd className="text-right text-ink-800">pending design</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="border border-ink-250 bg-ink-50">
          <div className="border-b border-ink-250 p-4">
            <h2 className="font-mono text-[12px] uppercase tracking-caps text-ink-500">
              Next actions
            </h2>
          </div>
          <div className="grid gap-3 p-4 tab:grid-cols-2 desk:grid-cols-4">
            {!session && (
              <Link
                href="/api/auth/whop"
                prefetch={false}
                className="inline-flex min-h-11 items-center justify-center bg-accent px-4 font-mono text-mono-sm font-semibold uppercase tracking-caps text-ink-0 transition-colors hover:bg-accent-dim"
              >
                Sign in
              </Link>
            )}

            <Link
              href="/settings/account"
              className="inline-flex min-h-11 items-center justify-center border border-ink-300 px-4 font-mono text-mono-sm uppercase tracking-caps text-ink-700 transition-colors hover:border-ink-500 hover:text-ink-900"
            >
              Account
            </Link>

            <Link
              href="/pricing"
              className="inline-flex min-h-11 items-center justify-center border border-ink-300 px-4 font-mono text-mono-sm uppercase tracking-caps text-ink-700 transition-colors hover:border-ink-500 hover:text-ink-900"
            >
              Pricing
            </Link>

            <Link
              href="/feedback"
              className="inline-flex min-h-11 items-center justify-center border border-ink-300 px-4 font-mono text-mono-sm uppercase tracking-caps text-ink-700 transition-colors hover:border-ink-500 hover:text-ink-900"
            >
              Request pilot
            </Link>
          </div>
        </section>
      </div>
    </SettingsShell>
  );
}
