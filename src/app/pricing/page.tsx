import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing — CryptoTubers Ranked",
  description:
    "Three tiers: free, pro ($19/mo), alpha ($49/mo). Full research free. Alerts, exports, and API on paid.",
  alternates: { canonical: "/pricing" },
};

/* ------------------------------------------------------------------ */
/*  Terminal-aesthetic pricing page                                    */
/*  Locked tokens: #0B0F0E / #121815 / #C8D3CA / #5B6B63 / #3FD67A     */
/* ------------------------------------------------------------------ */

type Glyph = "yes" | "no" | "soon";

interface FeatureRow {
  readonly label: string;
  readonly free: Glyph;
  readonly pro: Glyph;
  readonly alpha: Glyph;
}

const FEATURES: readonly FeatureRow[] = [
  { label: "Full leaderboard (all ranks)", free: "yes", pro: "yes", alpha: "yes" },
  { label: "Creator profiles + full call history", free: "yes", pro: "yes", alpha: "yes" },
  { label: "Per-call Alpha Score breakdowns", free: "yes", pro: "yes", alpha: "yes" },
  { label: "Methodology transparency", free: "yes", pro: "yes", alpha: "yes" },
  { label: "Per-creator email alerts", free: "no", pro: "yes", alpha: "yes" },
  { label: "Watchlists (unlimited)", free: "no", pro: "yes", alpha: "yes" },
  { label: "Recent-performance filter (30/90d)", free: "no", pro: "yes", alpha: "yes" },
  { label: "CSV export of call history", free: "no", pro: "yes", alpha: "yes" },
  { label: "Historical backtest simulator", free: "no", pro: "no", alpha: "yes" },
  { label: "Anti-consensus / convergence alerts", free: "no", pro: "no", alpha: "yes" },
  { label: "API access (read-only)", free: "no", pro: "no", alpha: "yes" },
  { label: "Webhook notifications", free: "no", pro: "no", alpha: "yes" },
] as const;

function glyphChar(g: Glyph): string {
  if (g === "yes") return "\u2713";
  if (g === "soon") return "\u2192";
  return "\u00b7";
}

function glyphClass(g: Glyph): string {
  if (g === "yes") return "text-[#3FD67A] font-bold";
  if (g === "soon") return "text-[#5B6B63] font-medium";
  return "text-[#5B6B63]";
}

function glyphAriaLabel(g: Glyph): string {
  if (g === "yes") return "included";
  if (g === "soon") return "coming soon";
  return "not in this tier";
}

export default function PricingPage() {
  return (
    <main className="bg-[#0B0F0E] text-[#C8D3CA] font-mono min-h-screen">
      <div className="max-w-[980px] mx-auto px-6 py-16">
        {/* =============== HERO =============== */}
        <section className="mb-16" aria-labelledby="pricing-title">
          <p className="text-[#5B6B63] text-xs tracking-wider mb-2">
            <span className="text-[#3FD67A]">&gt;</span> cat /docs/pricing.md
          </p>
          <h1
            id="pricing-title"
            className="font-mono font-bold text-4xl sm:text-5xl leading-none tracking-tight mb-4"
          >
            <span className="text-[#3FD67A] mr-3">#</span>PRICING
          </h1>
          <p className="text-[#C8D3CA] text-lg font-medium mb-3">
            Pay once alerts earn their keep. Free research, forever.
          </p>
          <p className="text-[#5B6B63] text-sm max-w-prose leading-relaxed">
            The leaderboard, creator histories, score breakdowns, and methodology
            stay free — always. Paid tiers buy delivery: alerts, exports, simulators, API.
          </p>
        </section>

        {/* =============== TIERS (dot-leader rows) =============== */}
        <section className="mb-16" aria-labelledby="tiers-title">
          <p className="text-[#5B6B63] text-xs uppercase tracking-[0.08em] mb-2">01 / tiers</p>
          <h2
            id="tiers-title"
            className="font-mono font-bold text-xl mb-6"
          >
            <span className="text-[#5B6B63] mr-2">{"//"}</span>select one
          </h2>

          <ul className="font-mono text-sm" aria-label="subscription tiers">
            <TierRow
              marker=" "
              name="TIER_FREE"
              price="$0"
              status="ACTIVE"
              statusTone="active"
              ctaText="start here"
              ctaHref="/"
              note="full leaderboard + creator profiles + call history + score breakdowns"
            />
            <TierRow
              marker=">"
              name="TIER_PRO"
              price="$19/mo"
              status="LIVE"
              statusTone="active"
              recommended
              ctaText={"14-day free trial \u2192"}
              ctaHref="/api/checkout/pro?interval=monthly"
              note={"alerts + watchlists + 30/90d filter + CSV export ($190/yr \u00b7 2 months free)"}
              annualHref="/api/checkout/pro?interval=annual"
            />
            <TierRow
              marker=" "
              name="TIER_ALPHA"
              price="$49/mo"
              status="LIVE"
              statusTone="active"
              ctaText={"14-day free trial \u2192"}
              ctaHref="/api/checkout/alpha?interval=monthly"
              note={"everything in pro + backtest simulator + anti-consensus alerts + API ($490/yr \u00b7 2 months free)"}
              annualHref="/api/checkout/alpha?interval=annual"
            />
          </ul>

          <p className="mt-6 text-[#5B6B63] text-sm">
            <span className="text-[#3FD67A] mr-2">#</span>
            <span className="text-[#3FD67A] font-bold">TIER_PRO</span>
            <span className="text-[#5B6B63]">
              : daily-driver recommended. 14-day free trial, no card required.
            </span>
          </p>
        </section>

        {/* =============== FEATURE MATRIX =============== */}
        <section className="mb-16" aria-labelledby="compare-title">
          <p className="text-[#5B6B63] text-xs uppercase tracking-[0.08em] mb-2">02 / comparison</p>
          <h2
            id="compare-title"
            className="font-mono font-bold text-xl mb-6"
          >
            <span className="text-[#5B6B63] mr-2">{"//"}</span>features {"\u2014"} per tier
          </h2>

          <div className="border border-[rgba(200,211,202,0.14)] bg-[#121815] overflow-x-auto">
            <div
              aria-hidden="true"
              className="text-[#5B6B63] text-xs font-mono whitespace-nowrap overflow-hidden px-4 py-2 border-b border-dashed border-[rgba(200,211,202,0.08)]"
            >
              {"\u250C\u2500 capability \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252C\u2500\u2500free\u2500\u2500\u252C\u2500\u2500pro\u2500\u2500\u252C\u2500alpha\u2500\u2510"}
            </div>
            <table className="w-full font-mono text-sm text-[#C8D3CA]">
              <caption className="sr-only">Feature availability by tier</caption>
              <thead>
                <tr className="text-[#5B6B63] text-xs uppercase tracking-[0.06em]">
                  <th scope="col" className="text-left font-medium px-4 py-3">
                    capability
                  </th>
                  <th scope="col" className="text-center font-medium px-4 py-3">
                    free
                  </th>
                  <th scope="col" className="text-center font-medium px-4 py-3">
                    pro
                  </th>
                  <th scope="col" className="text-center font-medium px-4 py-3">
                    alpha
                  </th>
                </tr>
              </thead>
              <tbody>
                {FEATURES.map((row) => (
                  <tr
                    key={row.label}
                    className="border-t border-[rgba(200,211,202,0.06)] hover:bg-[rgba(63,214,122,0.03)]"
                  >
                    <td className="px-4 py-2.5 text-[#C8D3CA] whitespace-nowrap">
                      {row.label}
                    </td>
                    <td className={`px-4 py-2.5 text-center ${glyphClass(row.free)}`}>
                      <span aria-label={glyphAriaLabel(row.free)}>{glyphChar(row.free)}</span>
                    </td>
                    <td className={`px-4 py-2.5 text-center ${glyphClass(row.pro)}`}>
                      <span aria-label={glyphAriaLabel(row.pro)}>{glyphChar(row.pro)}</span>
                    </td>
                    <td className={`px-4 py-2.5 text-center ${glyphClass(row.alpha)}`}>
                      <span aria-label={glyphAriaLabel(row.alpha)}>{glyphChar(row.alpha)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div
              aria-hidden="true"
              className="text-[#5B6B63] text-xs font-mono whitespace-nowrap overflow-hidden px-4 py-2 border-t border-dashed border-[rgba(200,211,202,0.08)]"
            >
              {"\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518"}
            </div>
          </div>

          <p className="mt-4 text-[#5B6B63] text-xs flex flex-wrap gap-5">
            <span>glyphs:</span>
            <span>
              <span className="text-[#3FD67A] font-bold">{"\u2713"}</span> included
            </span>
            <span>
              <span className="text-[#5B6B63]">{"\u00b7"}</span> not in this tier
            </span>
            <span>
              <span className="text-[#5B6B63]">{"\u2192"}</span> coming soon
            </span>
          </p>
        </section>

        {/* =============== STATUS DISCLOSURE =============== */}
        <section className="mb-16" aria-labelledby="status-title">
          <p className="text-[#5B6B63] text-xs uppercase tracking-[0.08em] mb-2">03 / status</p>
          <h2
            id="status-title"
            className="font-mono font-bold text-xl mb-6"
          >
            <span className="text-[#5B6B63] mr-2">{"//"}</span>right now
          </h2>

          <div className="bg-[#121815] border border-[rgba(200,211,202,0.14)] font-mono text-sm">
            <div className="px-4 py-3 border-b border-dashed border-[rgba(200,211,202,0.08)] text-[#3FD67A]">
              <span className="mr-2">$</span>cat PRICING_STATUS.md
            </div>
            <ol className="px-4 py-3 text-[#C8D3CA] leading-7">
              <li>
                <span className="text-[#5B6B63]">{"// free:"}</span>{" "}
                <span className="text-[#C8D3CA]">live. no account required.</span>
              </li>
              <li>
                <span className="text-[#5B6B63]">{"// pro:"}</span>{" "}
                <span className="text-[#C8D3CA]">
                  live. 14-day free trial, no card required.
                </span>
              </li>
              <li>
                <span className="text-[#5B6B63]">{"// alpha:"}</span>{" "}
                <span className="text-[#C8D3CA]">
                  live. 14-day free trial, no card required.
                </span>
              </li>
              <li>
                <span className="text-[#5B6B63]">{"// refunds:"}</span>{" "}
                <span className="text-[#C8D3CA]">14 days after first payment, no questions.</span>
              </li>
              <li className="text-[#5B6B63]">
                {"// we do not take creator money. we do not sell data."}
              </li>
            </ol>
          </div>
        </section>

        {/* =============== CTA PROMPT =============== */}
        <section className="mb-16" aria-labelledby="select-title">
          <p className="text-[#5B6B63] text-xs uppercase tracking-[0.08em] mb-2">04 / select</p>
          <h2 id="select-title" className="sr-only">
            Choose a tier
          </h2>
          <p className="font-mono text-lg flex items-baseline gap-2 flex-wrap">
            <span className="text-[#3FD67A]">&gt;</span>
            <span className="text-[#3FD67A] font-bold">select_tier</span>
            <span className="text-[#5B6B63]">
              [<span className="text-[#C8D3CA]">free</span>|
              <span className="text-[#C8D3CA]">pro</span>|
              <span className="text-[#C8D3CA]">alpha</span>]
            </span>
            <BlinkCaret />
          </p>
          <nav
            aria-label="tier quick-select"
            className="mt-3 pl-6 flex flex-wrap gap-5 text-base"
          >
            <Link
              href="/"
              prefetch={false}
              className="text-[#C8D3CA] underline underline-offset-4 decoration-[rgba(200,211,202,0.25)] hover:text-[#3FD67A] hover:decoration-[#3FD67A]"
            >
              free
            </Link>
            <span aria-hidden="true" className="text-[#5B6B63]">
              |
            </span>
            <Link
              href="/api/checkout/pro?interval=monthly"
              prefetch={false}
              className="text-[#C8D3CA] underline underline-offset-4 decoration-[rgba(200,211,202,0.25)] hover:text-[#3FD67A] hover:decoration-[#3FD67A]"
            >
              pro
            </Link>
            <span aria-hidden="true" className="text-[#5B6B63]">
              |
            </span>
            <Link
              href="/api/checkout/alpha?interval=monthly"
              prefetch={false}
              className="text-[#C8D3CA] underline underline-offset-4 decoration-[rgba(200,211,202,0.25)] hover:text-[#3FD67A] hover:decoration-[#3FD67A]"
            >
              alpha
            </Link>
          </nav>
        </section>

        {/* =============== FAQ =============== */}
        <section aria-labelledby="faq-title">
          <p className="text-[#5B6B63] text-xs uppercase tracking-[0.08em] mb-2">05 / faq</p>
          <h2
            id="faq-title"
            className="font-mono font-bold text-xl mb-6"
          >
            <span className="text-[#5B6B63] mr-2">{"//"}</span>faq
          </h2>
          <div className="grid gap-7 font-mono">
            <FaqItem
              question="why a free tier?"
              answer="because the research surface is the product. paying for bespoke delivery (alerts, exports, api) is the real upgrade."
            />
            <FaqItem
              question="what happens after the 14-day trial?"
              answer="you downgrade to the free tier. your watchlists and history stay. alerts stop."
            />
            <FaqItem
              question="do you take sponsorships from tracked creators?"
              answer="no. never. this is the whole point."
            />
          </div>
        </section>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  Local subcomponents                                                */
/* ------------------------------------------------------------------ */

interface TierRowProps {
  readonly marker: string;
  readonly name: string;
  readonly price: string;
  readonly status: string;
  readonly statusTone: "active" | "muted";
  readonly recommended?: boolean;
  readonly ctaText: string;
  readonly ctaHref: string;
  readonly note: string;
  readonly annualHref?: string;
}

function TierRow({
  marker,
  name,
  price,
  status,
  statusTone,
  recommended = false,
  ctaText,
  ctaHref,
  note,
  annualHref,
}: TierRowProps) {
  const statusColor =
    statusTone === "active" ? "text-[#3FD67A]" : "text-[#5B6B63]";

  return (
    <li className="grid grid-cols-[2ch_11ch_minmax(40px,1fr)_9ch_minmax(40px,1fr)_7ch_1fr] items-baseline gap-x-3 pt-2.5 pb-0.5 sm:gap-x-2.5">
      <span
        aria-hidden="true"
        className={marker.trim() === ">" ? "text-[#3FD67A] font-bold" : "text-transparent"}
      >
        {marker}
      </span>
      <span className="text-[#C8D3CA] font-bold tracking-wide whitespace-nowrap">
        {name}
      </span>
      <span
        aria-hidden="true"
        className="text-[#5B6B63] tracking-widest overflow-hidden whitespace-nowrap -translate-y-[3px] select-none"
      >
        ..........................
      </span>
      <span className="text-ink-900 font-bold tabular-nums whitespace-nowrap">
        {price}
      </span>
      <span
        aria-hidden="true"
        className="text-[#5B6B63] tracking-widest overflow-hidden whitespace-nowrap -translate-y-[3px] select-none"
      >
        ...........
      </span>
      <span className={`${statusColor} font-bold tracking-wide whitespace-nowrap`}>
        [{status}]
      </span>
      <span className="text-[#5B6B63] whitespace-nowrap">
        {recommended && (
          <span className="text-[#3FD67A] font-bold tracking-wide mr-2">
            [RECOMMENDED]
          </span>
        )}
        <Link
          href={ctaHref}
          prefetch={false}
          className="text-[#3FD67A] underline underline-offset-[3px] decoration-[rgba(63,214,122,0.6)] hover:decoration-[#3FD67A]"
        >
          {ctaText}
        </Link>
        {annualHref && (
          <>
            <span className="text-[#5B6B63] mx-2">{"\u00b7"}</span>
            <Link
              href={annualHref}
              prefetch={false}
              className="text-[#5B6B63] underline underline-offset-[3px] decoration-[rgba(200,211,202,0.2)] hover:text-[#3FD67A]"
            >
              annual
            </Link>
          </>
        )}
      </span>
      <span className="col-span-7 text-[#5B6B63] text-xs pb-2.5 pl-0">
        <span className="text-[#5B6B63] mr-1.5">{"//"}</span>
        {note}
      </span>
    </li>
  );
}

function FaqItem({ question, answer }: { readonly question: string; readonly answer: string }) {
  return (
    <div>
      <p className="text-[#C8D3CA] font-medium text-sm mb-2 flex gap-2.5">
        <span aria-hidden="true" className="text-[#3FD67A]">
          &gt;
        </span>
        <span>{question}</span>
      </p>
      <p className="text-[#5B6B63] text-sm leading-7 pl-6">{answer}</p>
    </div>
  );
}

function BlinkCaret() {
  return (
    <span
      aria-hidden="true"
      className="inline-block w-2.5 h-5 bg-[#3FD67A] align-text-bottom animate-pulse motion-reduce:animate-none"
    />
  );
}
