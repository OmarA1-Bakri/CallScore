import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Whop dashboard view — CallScore",
  description: "Embedded CallScore dashboard entrypoint for Whop company surfaces.",
};

export default async function WhopDashboardPage({
  params,
}: {
  readonly params: Promise<{
    readonly companyId: string;
  }>;
}): Promise<ReactElement> {
  const { companyId } = await params;

  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-10 px-4 py-12 tab:px-8 desk:px-10">
      <section className="border border-ink-200 bg-ink-0 px-5 py-6 tab:px-8 tab:py-8" style={{ borderRadius: 2 }}>
        <p className="mb-4 font-mono text-[11px] uppercase tracking-caps text-accent">
          Whop dashboard view
        </p>
        <h1 className="max-w-[780px] font-serif text-[40px] font-normal leading-[0.95] tracking-tight text-ink-900 tab:text-[56px]">
          CallScore control surface for company {companyId}
        </h1>
        <p className="mt-5 max-w-[680px] font-sans text-[16px] leading-relaxed text-ink-650 tab:text-[18px]">
          Launch the embedded product workspace, verify member access, and route operators to
          the current CallScore surfaces without leaving the Whop context.
        </p>
      </section>

      <section className="grid gap-4 tab:grid-cols-3">
        {[
          ["Leaderboard", "Review public creator rankings and score evidence.", "/"],
          ["Alerts", "Open paid alert configuration and delivery rules.", "/settings/alerts"],
          ["Webhooks", "Manage outbound automation hooks for Alpha users.", "/settings/webhooks"],
        ].map(([label, description, href]) => (
          <Link
            key={label}
            href={href}
            className="border border-ink-200 bg-ink-0 px-4 py-5 transition-colors hover:border-accent focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
            style={{ borderRadius: 2 }}
          >
            <span className="block font-mono text-[11px] uppercase tracking-caps text-accent">
              {label}
            </span>
            <span className="mt-3 block font-sans text-[14px] leading-relaxed text-ink-650">
              {description}
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}
