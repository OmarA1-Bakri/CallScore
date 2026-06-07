import Link from "next/link";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { EditorialSection, MetaStrip } from "@/components/primitives";

export const metadata: Metadata = {
  title: "Checkout complete — CallScore",
  description:
    "Post-checkout confirmation for CallScore buyers, with direct routes back to the app, alerts, and Whop-managed billing.",
  alternates: { canonical: "/checkout/success" },
};

export default function CheckoutSuccessPage(): ReactElement {
  return (
    <div className="max-w-page mx-auto px-4 tab:px-6 desk:px-8">
      <section className="pb-12 border-b border-ink-250">
        <p className="font-mono text-mono-sm uppercase tracking-caps text-accent mb-4">
          Checkout complete
        </p>
        <h1 className="font-serif text-[35px] tab:text-[45px] desk:text-[53px] text-ink-900 font-medium tracking-tight leading-[1.05] text-balance max-w-[900px] mb-5">
          Your CallScore Pro access is active.
        </h1>
        <p className="font-serif text-[20px] text-ink-700 leading-relaxed max-w-[760px]">
          You can manage or cancel billing from Whop at any time. Return to CallScore to confirm
          your session, configure alerts, and use the paid 90-day context filter.
        </p>
        <MetaStrip
          cells={[
            { k: "access", v: "Pro active" },
            { k: "billing", v: "Whop-managed" },
            { k: "cancel", v: "Whop anytime" },
            { k: "next", v: "open app" },
          ]}
        />
      </section>

      <EditorialSection
        index="01"
        title={
          <>
            Continue in <em className="italic text-accent">CallScore</em>.
          </>
        }
        meta={
          <>
            post-purchase handoff
            <br />
            app-first next steps
          </>
        }
      >
        <div className="grid gap-3 tab:grid-cols-2 desk:grid-cols-4">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center bg-accent px-4 font-mono text-mono-sm font-semibold uppercase tracking-caps text-ink-0 transition-colors hover:bg-accent-dim"
          >
            Open dashboard
          </Link>
          <Link
            href="/alerts"
            className="inline-flex min-h-11 items-center justify-center border border-ink-300 px-4 font-mono text-mono-sm uppercase tracking-caps text-ink-700 transition-colors hover:border-ink-500 hover:text-ink-900"
          >
            Configure alerts
          </Link>
          <Link
            href="/settings/billing"
            className="inline-flex min-h-11 items-center justify-center border border-ink-300 px-4 font-mono text-mono-sm uppercase tracking-caps text-ink-700 transition-colors hover:border-ink-500 hover:text-ink-900"
          >
            Manage billing
          </Link>
          <Link
            href="/api/auth/whop"
            prefetch={false}
            className="inline-flex min-h-11 items-center justify-center border border-ink-300 px-4 font-mono text-mono-sm uppercase tracking-caps text-ink-700 transition-colors hover:border-ink-500 hover:text-ink-900"
          >
            Refresh access
          </Link>
        </div>
      </EditorialSection>

      <EditorialSection
        index="02"
        title={
          <>
            Billing stays <em className="italic text-accent">in Whop</em>.
          </>
        }
      >
        <div className="border border-ink-250 bg-ink-50 p-4 font-serif text-[18px] leading-relaxed text-ink-700">
          If you need to cancel, open Whop from your account and manage the CallScore subscription
          there. CallScore does not store payment details and this page does not create, update, or
          cancel subscriptions.
        </div>
      </EditorialSection>
    </div>
  );
}
