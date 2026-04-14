import type { Metadata } from "next";
import Link from "next/link";
import {
  Check,
  X,
  Crown,
  Zap,
  BarChart3,
  ArrowLeft,
  ChevronDown,
  Radar,
  TrendingDown,
  Shield,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Pricing — CryptoTubers Ranked",
  description:
    "Public beta pricing and roadmap for CryptoTubers Ranked.",
  alternates: { canonical: "/pricing" },
};

interface TierConfig {
  readonly name: string;
  readonly price: string;
  readonly period: string;
  readonly tagline: string;
  readonly features: readonly string[];
  readonly cta: string;
  readonly highlighted: boolean;
  readonly gradient: string;
  readonly borderColor: string;
  readonly ctaBg: string;
  readonly icon: React.ComponentType<{ className?: string }>;
}

const TIERS: readonly TierConfig[] = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    tagline: "All public research surfaces stay open",
    features: [
      "Complete leaderboard (all ranks)",
      "Creator profiles and call history",
      "Per-call Alpha Score breakdowns",
      "Win rate, Alpha Score, and scored-call totals",
    ],
    cta: "Get Started",
    highlighted: false,
    gradient: "from-gray-400 to-gray-500",
    borderColor: "border-brand-border",
    ctaBg: "bg-brand-card hover:bg-brand-card-hover text-white border border-brand-border",
    icon: BarChart3,
  },
  {
    name: "Pro",
    price: "$19",
    period: "/mo",
    tagline: "Reserved for upcoming premium workflows",
    features: [
      "Everything in Free",
      "Premium workflows are being rebuilt",
      "Future account-linked exports",
      "Future saved screens and notifications",
      "Priority feedback access while premium is in beta",
    ],
    cta: "Join Pro Waitlist",
    highlighted: false,
    gradient: "from-brand-accent to-purple-400",
    borderColor: "border-brand-accent/30",
    ctaBg: "bg-brand-accent hover:bg-brand-accent/80 text-white",
    icon: Zap,
  },
  {
    name: "Alpha",
    price: "$49",
    period: "/mo",
    tagline: "Future delivery layer for alerts and API access",
    features: [
      "Everything in Pro",
      "Future signal delivery products",
      "Future API and webhook access",
      "Future premium alerting surfaces",
      "Early access to private-alpha experiments",
    ],
    cta: "Join Alpha Waitlist",
    highlighted: true,
    gradient: "from-brand-gold to-yellow-400",
    borderColor: "border-brand-gold/30",
    ctaBg: "bg-brand-gold hover:bg-brand-gold-dim text-brand-dark",
    icon: Crown,
  },
] as const;

interface FeatureRow {
  readonly feature: string;
  readonly free: boolean | string;
  readonly pro: boolean | string;
  readonly alpha: boolean | string;
}

const COMPARISON_FEATURES: readonly FeatureRow[] = [
  { feature: "Full Leaderboard (All Ranks)", free: true, pro: true, alpha: true },
  { feature: "Creator Profiles", free: "Full", pro: "Full", alpha: "Full" },
  { feature: "Call History", free: true, pro: true, alpha: true },
  { feature: "Score Breakdown per Call", free: true, pro: true, alpha: true },
  { feature: "Performance Charts", free: true, pro: true, alpha: true },
  { feature: "Data Freshness", free: "After each public recompute", pro: "Premium roadmap", alpha: "Premium roadmap" },
  { feature: "Premium Workflows", free: "Public beta only", pro: "Planned", alpha: "Planned" },
  { feature: "Alerts and API", free: false, pro: "Planned", alpha: "Planned" },
] as const;

interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: "Why is the leaderboard free?",
    answer:
      "Because the public research surface is the product right now. The leaderboard, creator pages, call history, and score breakdowns stay open while we rebuild the premium delivery layer.",
  },
  {
    question: "How do you calculate the Alpha Score?",
    answer:
      "Each call is scored on five public components: direction correctness at 30 days (40pts), alpha over BTC at 30 days (25pts), specificity (15pts), market regime difficulty (10pts), and target hit within 90 days (10pts). There is no hidden normalization or confidence multiplier on the public Alpha Score.",
  },
  {
    question: "What are contrarian signals?",
    answer:
      "They are situations where a creator calls the opposite direction of the crowd. We study those cases publicly today; delivery-oriented premium tooling for them is still on the roadmap.",
  },
  {
    question: "What are consensus strength warnings?",
    answer:
      "When multiple creators independently call the same coin in the same direction within a short window, we analyze that cluster. The public site already shows the raw research; premium warning surfaces are planned, not shipped.",
  },
  {
    question: "How often is the data updated?",
    answer:
      "We scrape new videos daily and rerun the scoring pipeline after new extraction and market-data backfills complete. Public pages reflect the latest completed recompute.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes, you can cancel your subscription at any time. Your access will continue through the end of your current billing period.",
  },
  {
    question: "If the public site is free, what are Pro and Alpha for?",
    answer:
      "For now, they are roadmap tiers rather than unique public-site unlocks. We will only market premium workflows once the delivery surfaces are live and materially different from the public dataset.",
  },
] as const;

function getCheckoutUrl(tierName: string): string {
  if (tierName === "Alpha" || tierName === "Pro") return "/feedback";
  return "/";
}

export default function PricingPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-300 text-sm mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Leaderboard
      </Link>

      {/* Header */}
      <section className="text-center mb-12">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
          The Leaderboard Is Free.
          <br />
          <span className="text-gradient-gold">The Intelligence Is Not.</span>
        </h1>
        <p className="text-gray-400 max-w-xl mx-auto text-sm sm:text-base">
          Rankings show you who is good. Alpha signals show you who to listen to
          today, in this market, for this trade.
        </p>
      </section>

      {/* Value props */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
        <ValueProp
          icon={TrendingDown}
          title="Bear Market Specialists"
          description="Miles Deutscher: #19 overall, but #1 in bear markets with 85% win rate. Know who to follow when it matters most."
        />
        <ValueProp
          icon={Radar}
          title="Contrarian Signals"
          description="When a top creator goes against the crowd, those calls often matter more. Public data shows the pattern; premium delivery tooling is still in roadmap mode."
        />
        <ValueProp
          icon={Shield}
          title="Consensus Warnings"
          description="When all creators agree, accuracy can drop. The public site shows the underlying consensus research; warning-specific premium UX is still planned."
        />
      </section>

      {/* Pricing cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
        {TIERS.map((tier) => {
          const Icon = tier.icon;

          return (
            <div
              key={tier.name}
              className={`relative rounded-xl border p-6 ${tier.borderColor} ${
                tier.highlighted
                  ? "bg-brand-card glow-gold"
                  : "bg-brand-card/50"
              }`}
            >
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="badge-elite text-xs px-3 py-1">
                    Best Value
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2 mb-4">
                <Icon className="w-5 h-5 text-gray-400" />
                <span
                  className={`font-bold bg-gradient-to-r ${tier.gradient} bg-clip-text text-transparent`}
                >
                  {tier.name}
                </span>
              </div>

              <div className="mb-2">
                <span className="text-4xl font-bold text-white">
                  {tier.price}
                </span>
                <span className="text-gray-500 text-sm">{tier.period}</span>
              </div>

              <p className="text-gray-400 text-sm mb-6">{tier.tagline}</p>

              <Link
                href={getCheckoutUrl(tier.name)}
                className={`block text-center font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors mb-6 ${tier.ctaBg}`}
              >
                {tier.cta}
              </Link>

              <ul className="space-y-2.5">
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-gray-300 text-sm"
                  >
                    <Check className="w-4 h-4 text-brand-green shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      {/* Feature comparison */}
      <section className="mb-16">
        <h2 className="text-white font-bold text-xl text-center mb-8">
          Feature Comparison
        </h2>
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border">
                  <th className="text-left text-gray-500 text-xs font-medium uppercase tracking-wider px-4 py-3">
                    Feature
                  </th>
                  <th className="text-center text-gray-500 text-xs font-medium uppercase tracking-wider px-4 py-3">
                    Free
                  </th>
                  <th className="text-center text-xs font-medium uppercase tracking-wider px-4 py-3 text-brand-accent">
                    Pro
                  </th>
                  <th className="text-center text-xs font-medium uppercase tracking-wider px-4 py-3 text-brand-gold">
                    Alpha
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_FEATURES.map((row) => (
                  <tr
                    key={row.feature}
                    className="border-b border-brand-border/50 table-row-hover"
                  >
                    <td className="px-4 py-3 text-gray-300">{row.feature}</td>
                    <td className="px-4 py-3 text-center">
                      <FeatureValue value={row.free} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <FeatureValue value={row.pro} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <FeatureValue value={row.alpha} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-2xl mx-auto mb-16">
        <h2 className="text-white font-bold text-xl text-center mb-8">
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          {FAQ_ITEMS.map((item) => (
            <FaqCard key={item.question} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}

function FeatureValue({ value }: { readonly value: boolean | string }) {
  if (value === true) {
    return <Check className="w-4 h-4 text-brand-green mx-auto" />;
  }
  if (value === false) {
    return <X className="w-4 h-4 text-gray-600 mx-auto" />;
  }
  return <span className="text-gray-300 text-xs">{value}</span>;
}

function FaqCard({ item }: { readonly item: FaqItem }) {
  return (
    <details className="glass-card group" open={false}>
      <summary className="flex items-center justify-between cursor-pointer p-4 text-white font-medium text-sm list-none">
        {item.question}
        <ChevronDown className="w-4 h-4 text-gray-500 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4 text-gray-400 text-sm leading-relaxed">
        {item.answer}
      </div>
    </details>
  );
}

function ValueProp({
  icon: Icon,
  title,
  description,
}: {
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-3 mb-2">
        <Icon className="w-5 h-5 text-brand-gold" />
        <h2 className="text-white font-semibold text-sm">{title}</h2>
      </div>
      <p className="text-gray-400 text-xs leading-relaxed">{description}</p>
    </div>
  );
}
