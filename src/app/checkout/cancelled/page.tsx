import Link from "next/link";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { EditorialSection, MetaStrip } from "@/components/primitives";

export const metadata: Metadata = {
  title: "Checkout cancelled — CallScore",
  description:
    "Clear post-cancel checkout page for CallScore buyers, with routes back to pricing, billing, and support.",
  alternates: { canonical: "/checkout/cancelled" },
};

export default function CheckoutCancelledPage(): ReactElement {
  return (
    <div className="max-w-page mx-auto px-4 tab:px-6 desk:px-8">
      <section className="pb-12 border-b border-ink-250">
        <p className="font-mono text-mono-sm uppercase tracking-caps text-accent mb-4">
          Checkout cancelled
        </p>
        <h1 className="font-serif text-[35px] tab:text-[45px] desk:text-[53px] text-ink-900 font-medium tracking-tight leading-[1.05] text-balance max-w-[900px] mb-5">
          Checkout cancelled.
        </h1>
        <p className="font-serif text-[20px] text-ink-700 leading-relaxed max-w-[760px]">
          No CallScore subscription was changed from this page. You can restart checkout, review
          billing guidance, or contact support if Whop showed an unexpected state.
        </p>
        <MetaStrip
          cells={[
            { k: "subscription", v: "unchanged" },
            { k: "billing", v: "Whop-managed" },
            { k: "support", v: "available" },
            { k: "next", v: "choose route" },
          ]}
        />
      </section>

      <EditorialSection
        index="01"
        title={
          <>
            Choose your <em className="italic text-accent">next step</em>.
          </>
        }
        meta={
          <>
            no payment mutation
            <br />
            app-first recovery
          </>
        }
      >
        <div className="grid gap-3 tab:grid-cols-2 desk:grid-cols-4">
          <Link
            href="/pricing"
            className="inline-flex min-h-11 items-center justify-center bg-accent px-4 font-mono text-mono-sm font-semibold uppercase tracking-caps text-ink-0 transition-colors hover:bg-accent-dim"
          >
            Return to pricing
          </Link>
          <Link
            href="/settings/billing"
            className="inline-flex min-h-11 items-center justify-center border border-ink-300 px-4 font-mono text-mono-sm uppercase tracking-caps text-ink-700 transition-colors hover:border-ink-500 hover:text-ink-900"
          >
            Billing help
          </Link>
          <Link
            href="/feedback?context=checkout-cancelled"
            className="inline-flex min-h-11 items-center justify-center border border-ink-300 px-4 font-mono text-mono-sm uppercase tracking-caps text-ink-700 transition-colors hover:border-ink-500 hover:text-ink-900"
          >
            Contact support
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center border border-ink-300 px-4 font-mono text-mono-sm uppercase tracking-caps text-ink-700 transition-colors hover:border-ink-500 hover:text-ink-900"
          >
            Open dashboard
          </Link>
        </div>
      </EditorialSection>
    </div>
  );
}
