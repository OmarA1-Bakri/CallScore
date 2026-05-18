import Link from "next/link";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { MetaStrip } from "@/components/primitives";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Dashboard — CallScore",
  description: "Whop dashboard view for CallScore operations, billing, and delivery surfaces.",
  robots: { index: false, follow: false },
};

interface DashboardEntryPageProps {
  readonly params: Promise<{
    readonly companyId: string;
  }>;
}

export default async function DashboardEntryPage({
  params,
}: DashboardEntryPageProps): Promise<ReactElement> {
  const { companyId } = await params;
  const session = await getSession();
  const tier = session?.tier ?? "free";

  return (
    <div className="mx-auto max-w-page px-4 py-10 tab:px-6 desk:px-8">
      <DashboardHero companyId={companyId} tier={tier} />
      <DashboardCardGrid companyId={companyId} />
      <DashboardSummary />
    </div>
  );
}

interface DashboardHeroProps {
  readonly companyId: string;
  readonly tier: string;
}

function DashboardHero({ companyId, tier }: DashboardHeroProps): ReactElement {
  return (
    <section className="border-b border-ink-250 pb-8">
      <p className="mb-3 font-mono text-mono-sm uppercase tracking-caps text-ink-500">
        Whop dashboard view
      </p>
      <h1 className="max-w-[840px] font-serif text-[35px] font-medium leading-tight text-ink-900 tab:text-[45px] desk:text-[53px]">
        CallScore operations. <em className="italic font-normal text-accent">Company control.</em>
      </h1>
      <p className="mt-4 max-w-[720px] font-serif text-[18px] leading-relaxed text-ink-700">
        Manage the CallScore app surface for this Whop company without leaving the embedded dashboard.
      </p>
      <MetaStrip
        cells={[
          { k: "company", v: companyId },
          { k: "plan", v: tier },
          { k: "runtime", v: "Vercel + Hermes" },
          { k: "checkout", v: "Whop" },
        ]}
      />
    </section>
  );
}

interface DashboardCardGridProps {
  readonly companyId: string;
}

function DashboardCardGrid({ companyId }: DashboardCardGridProps): ReactElement {
  const accountHref = `/settings/account?companyId=${encodeURIComponent(companyId)}`;

  return (
    <section className="grid gap-4 py-8 tab:grid-cols-2 desk:grid-cols-4">
      <DashboardCard
        label="Account"
        value="Whop-managed access"
        body="Inspect the current session, tier, and embedded company context."
        href={accountHref}
        cta="Open account"
      />
      <DashboardCard
        label="Billing"
        value="Checkout + refunds"
        body="Route plan changes and support requests through the Whop-managed billing flow."
        href="/settings/billing"
        cta="Open billing"
      />
      <DashboardCard
        label="Delivery"
        value="Alerts + watchlists"
        body="Configure creator monitoring and alert delivery for Pro workflows."
        href="/settings/alerts"
        cta="Open alerts"
      />
      <DashboardCard
        label="Alpha"
        value="API + webhooks"
        body="Manage programmatic access, delivery logs, and webhook settings."
        href="/settings/api"
        cta="Open API"
      />
    </section>
  );
}

function DashboardSummary(): ReactElement {
  return (
    <section className="grid gap-4 border-t border-ink-250 pt-8 desk:grid-cols-[1.15fr_0.85fr]">
      <div className="border border-ink-250 bg-ink-50 p-4">
        <p className="font-mono text-mono-sm uppercase tracking-caps text-accent">
          Submission posture
        </p>
        <p className="mt-4 font-serif text-[18px] leading-relaxed text-ink-700">
          Public research remains open. Paid value is delivery: alerts, exports, backtests,
          API keys, and webhooks. Production jobs continue on Hermes while Vercel serves this
          dashboard and the public app.
        </p>
      </div>

      <div className="border border-ink-250 bg-ink-50 p-4">
        <p className="font-mono text-mono-sm uppercase tracking-caps text-accent">
          Quick actions
        </p>
        <div className="mt-4 grid gap-2 font-mono text-[12px] uppercase tracking-caps">
          <Link href="/pricing" className="text-ink-700 underline decoration-ink-300 underline-offset-4 hover:text-accent hover:decoration-accent">
            Compare plans
          </Link>
          <Link href="/settings/webhooks" className="text-ink-700 underline decoration-ink-300 underline-offset-4 hover:text-accent hover:decoration-accent">
            Webhooks
          </Link>
          <Link href="/feedback?context=/dashboard" className="text-ink-700 underline decoration-ink-300 underline-offset-4 hover:text-accent hover:decoration-accent">
            Support request
          </Link>
        </div>
      </div>
    </section>
  );
}

interface DashboardCardProps {
  readonly label: string;
  readonly value: string;
  readonly body: string;
  readonly href: string;
  readonly cta: string;
}

function DashboardCard({ label, value, body, href, cta }: DashboardCardProps): ReactElement {
  return (
    <article className="flex min-h-[240px] flex-col border border-ink-250 bg-ink-50 p-4">
      <p className="font-mono text-mono-sm uppercase tracking-caps text-ink-500">{label}</p>
      <h2 className="mt-3 font-serif text-[22px] font-medium leading-tight text-ink-900">
        {value}
      </h2>
      <p className="mt-3 font-serif text-[16px] leading-relaxed text-ink-700">{body}</p>
      <Link
        href={href}
        className="mt-auto inline-flex min-h-10 items-center font-mono text-[12px] uppercase tracking-caps text-accent underline decoration-accent/60 underline-offset-4 hover:decoration-accent"
      >
        {cta} <span aria-hidden="true">&rarr;</span>
      </Link>
    </article>
  );
}
