import Link from "next/link";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { EditorialSection, MetaStrip } from "@/components/primitives";
import { analyticsDataset } from "@/lib/conversion-analytics";
import { getCurrentTier } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Checkout return — CallScore",
  description:
    "Post-checkout entitlement verification for CallScore, with direct routes to refresh access, the app, and Whop-managed billing.",
  alternates: { canonical: "/checkout/success" },
};

export default async function CheckoutSuccessPage(): Promise<ReactElement> {
  const tier = await getCurrentTier();
  const accessActive = tier !== "free";
  const tierLabel = tier === "alpha" ? "Alpha" : "Pro";

  return (
    <div
      {...(accessActive ? analyticsDataset("checkout_completed", { tier }, "view") : {})}
      className="max-w-page mx-auto px-4 tab:px-6 desk:px-8"
    >
      <section className="pb-12 border-b border-ink-250">
        <p className="font-mono text-mono-sm uppercase tracking-caps text-accent mb-4">
          {accessActive ? "Checkout verified" : "Checkout returned"}
        </p>
        <h1 className="font-serif text-[35px] tab:text-[45px] desk:text-[53px] text-ink-900 font-medium tracking-tight leading-[1.05] text-balance max-w-[900px] mb-5">
          {accessActive
            ? `Your CallScore ${tierLabel} access is active.`
            : "Verify your CallScore access to complete activation."}
        </h1>
        <p className="font-serif text-[20px] text-ink-700 leading-relaxed max-w-[760px]">
          {accessActive
            ? "You can manage or cancel billing from Whop at any time. Continue in CallScore to use your paid features."
            : "This return page cannot confirm a purchase on its own. Refresh access through Whop; paid features remain locked until entitlement verification succeeds."}
        </p>
        <MetaStrip
          cells={[
            { k: "access", v: accessActive ? `${tierLabel} active` : "verification required" },
            { k: "billing", v: "Whop-managed" },
            { k: "cancel", v: "Whop anytime" },
            { k: "next", v: accessActive ? "open app" : "refresh access" },
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
