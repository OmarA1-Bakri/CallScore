import Link from "next/link";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { EditorialSection, MetaStrip } from "@/components/primitives";

const TITLE = "Pricing — CallScore";
const DESCRIPTION =
  "Three tiers: free, pro ($19/mo), alpha ($49/mo). Full research free. Alerts, exports, and API on paid.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/pricing" },
};

type Glyph = "yes" | "no" | "soon";

interface FeatureRow {
  readonly label: string;
  readonly free: Glyph;
  readonly pro: Glyph;
  readonly alpha: Glyph;
  readonly href?: string;
}

const FEATURES: readonly FeatureRow[] = [
  { label: "Full leaderboard",                          free: "yes", pro: "yes", alpha: "yes", href: "/" },
  { label: "Profiles + call history",                   free: "yes", pro: "yes", alpha: "yes", href: "/" },
  { label: "Alpha breakdowns",                          free: "yes", pro: "yes", alpha: "yes", href: "/methodology" },
  { label: "Methodology",                               free: "yes", pro: "yes", alpha: "yes", href: "/methodology" },
  { label: "Per-creator email alerts + queue",          free: "no",  pro: "yes", alpha: "yes", href: "/alerts" },
  { label: "Watchlists with creator management",        free: "no",  pro: "yes", alpha: "yes", href: "/alerts" },
  { label: "Recent-performance filter (30/90d planned)", free: "no", pro: "soon", alpha: "soon" },
  { label: "CSV export of creator call history",        free: "no",  pro: "yes", alpha: "yes", href: "/pricing#plans" },
  { label: "Historical backtest simulator",             free: "no",  pro: "no",  alpha: "yes", href: "/backtest" },
  { label: "Anti-consensus alerts (Alpha preview)",     free: "no",  pro: "no",  alpha: "soon", href: "/alerts" },
  { label: "API access with key manager",               free: "no",  pro: "no",  alpha: "yes", href: "/settings/api" },
  { label: "Webhook notifications + delivery log",      free: "no",  pro: "no",  alpha: "yes", href: "/webhooks" },
] as const;

function glyphChar(g: Glyph): string {
  return g === "yes" ? "✓" : g === "soon" ? "→" : "·";
}

function glyphClass(g: Glyph): string {
  return g === "yes"
    ? "text-pos font-bold"
    : g === "soon"
      ? "text-warn font-medium"
      : "text-ink-500";
}

function glyphAriaLabel(g: Glyph): string {
  return g === "yes"
    ? "included"
    : g === "soon"
      ? "coming soon"
      : "not in this tier";
}

interface PlanCardProps {
  readonly name: string;
  readonly price: string;
  readonly cadence: string;
  readonly tagline: string;
  readonly cta: string;
  readonly ctaHref: string;
  readonly manageLinks?: readonly { readonly label: string; readonly href: string; readonly prefetch?: boolean }[];
  readonly emphasis?: boolean; // editorial anchor — slightly wider, accent-low background
  readonly ctaVariant?: "button" | "soft" | "none"; // round2-005: free tier has no purchase, use soft link
}

function PlanCard({
  name,
  price,
  cadence,
  tagline,
  cta,
  ctaHref,
  manageLinks = [],
  emphasis = false,
  ctaVariant = "button",
}: PlanCardProps): ReactElement {
  return (
    <div
      className={`flex flex-col p-6 border ${
        emphasis
          ? "border-accent-dim bg-accent-low"
          : "border-ink-200 bg-ink-50"
      }`}
      style={{ borderRadius: 2 }}
    >
      {/* Plan name as a styled label, NOT a Chip — Chip is reserved for status/category
          microlabels (round2-004). Plan-tier identifier sits between Chip (9.5px) and h2. */}
      <div
        className={`font-mono text-[13px] tracking-caps uppercase mb-3 ${
          emphasis ? "text-accent" : "text-ink-700"
        }`}
      >
        {name}
      </div>
      <div className="mt-1 mb-3 flex items-baseline gap-1.5">
        <span className="font-serif text-[41px] text-ink-900 font-medium tabular-nums leading-none">
          {price}
        </span>
        <span className="font-mono text-[12px] tracking-wide text-ink-700">{cadence}</span>
      </div>
      <p className="font-serif text-[16px] text-ink-700 leading-relaxed mb-6">{tagline}</p>
      {manageLinks.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-x-3 gap-y-2 border-t border-ink-200 pt-4">
          {manageLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              prefetch={link.prefetch}
              className="inline-flex min-h-10 items-center font-mono text-[11px] tracking-wide text-accent underline decoration-accent/60 underline-offset-4 hover:decoration-accent focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {link.label} <span aria-hidden="true">&rarr;</span>
            </Link>
          ))}
        </div>
      )}
      {ctaVariant === "button" && (
        <Link
          href={ctaHref}
          className={`mt-auto inline-block text-center font-mono text-[12px] tracking-caps uppercase px-4 py-2.5 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent ${
            emphasis
              ? "bg-accent hover:bg-accent-dim text-ink-0"
              : "border border-ink-300 text-ink-700 hover:bg-ink-100"
          }`}
          style={{ borderRadius: 2 }}
        >
          {cta}
        </Link>
      )}
      {ctaVariant === "soft" && (
        <Link
          href={ctaHref}
          className="mt-auto inline-flex min-h-10 items-center font-mono text-[12px] tracking-wide text-accent underline decoration-accent/60 underline-offset-4 hover:decoration-accent focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
        >
          {cta} <span aria-hidden="true">&rarr;</span>
        </Link>
      )}
    </div>
  );
}

export default function PricingPage(): ReactElement {
  return (
    <div className="max-w-page mx-auto px-4 tab:px-6 desk:px-8">
      {/* HERO */}
      <section className="pb-12 border-b border-ink-250">
        <h1 className="font-serif text-[35px] tab:text-[45px] desk:text-[53px] text-ink-900 font-medium tracking-tight leading-[1.05] text-balance max-w-[880px] mb-5">
          CallScore plans.{" "}
          <em className="italic font-normal text-accent">Free research, paid delivery.</em>
        </h1>
        <p className="font-serif text-[20px] text-ink-700 leading-relaxed max-w-[760px]">
          Leaderboards stay free. Paid tiers add alerts, exports, backtests, and API access.
        </p>
        <MetaStrip
          cells={[
            { k: "free tier", v: "$0" },
            {
              k: "pro",
              v: (
                <>
                  $19<span className="text-ink-500 text-[15px]"> /mo</span>
                </>
              ),
            },
            {
              k: "alpha",
              v: (
                <>
                  $49<span className="text-ink-500 text-[15px]"> /mo</span>
                </>
              ),
            },
            { k: "refund", v: "30 days" },
          ]}
        />
      </section>

      {/* 01 — TIERS (asymmetric 1fr-1.2fr-1fr; pro is the editorial anchor) */}
      <EditorialSection
        id="plans"
        index="01"
        title={
          <>
            Three <em className="italic text-accent">tiers</em>.
          </>
        }
        meta={
          <>
            billed monthly &middot; no contracts
            <br />
            cancel anytime &middot; refund within 30d
          </>
        }
      >
        <div className="grid grid-cols-1 tab:grid-cols-3 desk:grid-cols-[1fr_1.2fr_1fr] gap-4">
          <PlanCard
            name="Free"
            price="$0"
            cadence="forever"
            tagline="Full public research."
            cta="Browse leaderboard"
            ctaHref="/"
            ctaVariant="soft"
          />
          <PlanCard
            name="Pro"
            price="$19"
            cadence="/mo"
            tagline="Alerts, watchlists, exports."
            cta="Upgrade to Pro"
            ctaHref="/api/checkout/pro"
            manageLinks={[
              { label: "Email alerts", href: "/alerts" },
              { label: "CSV exports", href: "/pricing#plans" },
            ]}
            emphasis
          />
          <PlanCard
            name="Alpha"
            price="$49"
            cadence="/mo"
            tagline="Backtests, API, webhooks."
            cta="Upgrade to Alpha"
            ctaHref="/api/checkout/alpha"
            manageLinks={[
              { label: "Backtest Lab", href: "/backtest" },
              { label: "API keys", href: "/settings/api" },
              { label: "Webhooks", href: "/settings/webhooks" },
            ]}
          />
        </div>
      </EditorialSection>

      {/* 02 — FEATURE MATRIX */}
      <EditorialSection
        index="02"
        title={
          <>
            Feature <em className="italic text-accent">matrix</em>.
          </>
        }
        meta={
          <>
            {FEATURES.length} features &middot; 3 plans
            <br />
            &#10003; included &middot; &rarr; preview/planned &middot; &middot; gated
          </>
        }
      >
        <div
          className="overflow-x-auto focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
          tabIndex={0}
          aria-label="Pricing feature matrix"
        >
          <table className="w-full font-mono text-[13px]">
            <caption className="sr-only">Feature availability by tier</caption>
            <thead className="sticky top-0 bg-ink-50 z-sticky">
              <tr className="border-b border-ink-250">
                <th
                  scope="col"
                  className="text-left text-[11px] text-ink-500 tracking-caps uppercase font-normal py-2.5 px-3"
                >
                  Feature
                </th>
                <th
                  scope="col"
                  className="text-center text-[11px] text-ink-500 tracking-caps uppercase font-normal py-2.5 px-3 w-20"
                >
                  Free
                </th>
                <th
                  scope="col"
                  className="text-center text-[11px] text-ink-500 tracking-caps uppercase font-normal py-2.5 px-3 w-20"
                >
                  Pro
                </th>
                <th
                  scope="col"
                  className="text-center text-[11px] text-ink-500 tracking-caps uppercase font-normal py-2.5 px-3 w-20"
                >
                  Alpha
                </th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((f) => (
                <tr key={f.label} className="border-b border-ink-150">
                  <td className="py-3 px-3 font-serif text-[15px] text-ink-800">
                    {f.href ? (
                      <Link
                        href={f.href}
                        prefetch={f.href.startsWith("/api/") ? false : undefined}
                        className="underline decoration-ink-300 underline-offset-4 transition-colors hover:text-accent hover:decoration-accent focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        {f.label}
                      </Link>
                    ) : (
                      f.label
                    )}
                  </td>
                  {(["free", "pro", "alpha"] as const).map((tier) => (
                    <td
                      key={tier}
                      className="py-3 px-3 text-center"
                      aria-label={glyphAriaLabel(f[tier])}
                    >
                      <span className={glyphClass(f[tier])}>{glyphChar(f[tier])}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </EditorialSection>

      {/* 03 — FAQ */}
      <EditorialSection
        index="03"
        title={
          <>
            <em className="italic text-accent">Why</em> these tiers.
          </>
        }
      >
        <div className="font-serif text-[17px] text-ink-700 leading-relaxed max-w-[680px] space-y-4">
          <p>
            <b className="text-ink-900">Why is research free?</b> Because the value of an
            accuracy tracker is in the public methodology, not the data lock. If we hid the
            leaderboard behind a paywall, no one could check our work — which would defeat the
            point.
          </p>
          <p>
            <b className="text-ink-900">What do paid tiers actually buy?</b> Delivery, not
            data. Pro alerts you when ranked creators move so you don&apos;t have to refresh.
            Alpha adds the Backtest Lab, API keys, and webhook delivery logs for users who want
            to build on the data. Anti-consensus delivery is marked preview until the consensus
            worker is live.
          </p>
          <p>
            <b className="text-ink-900">Refunds?</b> 30 days, full refund. Send the
            request through the{" "}
            <Link
              href="/feedback"
              className="text-accent underline decoration-accent/60 underline-offset-4 hover:decoration-accent focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              feedback page
            </Link>{" "}
            with the email used at checkout.
          </p>
        </div>
      </EditorialSection>
    </div>
  );
}
