import Link from "next/link";
import {
  Check,
  X,
  Crown,
  Zap,
  BarChart3,
  ArrowLeft,
  ChevronDown,
} from "lucide-react";

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
    tagline: "See how the bottom 10 perform",
    features: [
      "Leaderboard ranks 11-20",
      "Basic creator profiles",
      "Call history (last 30 days)",
      "7-day delayed data",
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
    price: "$50",
    period: "/mo",
    tagline: "Unlock the consistent outperformers",
    features: [
      "Everything in Free",
      "Leaderboard ranks 6-10",
      "Full creator profiles",
      "Complete call history",
      "Real-time data updates",
      "Score breakdown analytics",
    ],
    cta: "Upgrade to Pro",
    highlighted: false,
    gradient: "from-brand-accent to-purple-400",
    borderColor: "border-brand-accent/30",
    ctaBg: "bg-brand-accent hover:bg-brand-accent/80 text-white",
    icon: Zap,
  },
  {
    name: "Elite",
    price: "$99",
    period: "/mo",
    tagline: "Full access + consensus signals",
    features: [
      "Everything in Pro",
      "Full leaderboard (ranks 1-20)",
      "Consensus signals",
      "Real-time alerts (coming soon)",
      "Score trend analytics",
      "API access (coming soon)",
      "Priority support",
    ],
    cta: "Go Elite",
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
  readonly elite: boolean | string;
}

const COMPARISON_FEATURES: readonly FeatureRow[] = [
  { feature: "Leaderboard Access", free: "Ranks 11-20", pro: "Ranks 6-20", elite: "All 20" },
  { feature: "Creator Profiles", free: "Basic", pro: "Full", elite: "Full" },
  { feature: "Call History", free: "30 days", pro: "Full", elite: "Full" },
  { feature: "Data Freshness", free: "7-day delay", pro: "Real-time", elite: "Real-time" },
  { feature: "Score Breakdown", free: false, pro: true, elite: true },
  { feature: "Performance Charts", free: false, pro: true, elite: true },
  { feature: "Consensus Signals", free: false, pro: false, elite: true },
  { feature: "Real-time Alerts", free: false, pro: false, elite: "Coming soon" },
  { feature: "API Access", free: false, pro: false, elite: "Coming soon" },
  { feature: "Priority Support", free: false, pro: false, elite: true },
] as const;

interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: "How do you calculate the Alpha Score?",
    answer:
      "The Alpha Score is a composite metric (0-100) based on five components: direction correctness (40pts), alpha over BTC returns (25pts), call specificity (15pts), market regime difficulty bonus (10pts), and target hit accuracy (10pts). Each creator's score is calculated from their actual call performance against real market data.",
  },
  {
    question: "How often is the data updated?",
    answer:
      "We scrape new videos daily and run the full scoring pipeline every 24 hours. Free users see data with a 7-day delay. Pro and Elite users get real-time updates as soon as new scores are computed.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes, you can cancel your subscription at any time. Your access will continue through the end of your current billing period. No refunds for partial months.",
  },
  {
    question: "What are consensus signals?",
    answer:
      "When 3 or more top-ranked creators independently call the same coin in the same direction within a 7-day window, we flag it as a consensus signal. Historically, these have been strong indicators. This feature is exclusive to Elite subscribers.",
  },
  {
    question: "Who are the 20 creators you track?",
    answer:
      "We track a curated list of 20 crypto YouTube influencers chosen for their consistent content output, significant audience size, and history of making specific altcoin calls. The list is reviewed quarterly.",
  },
] as const;

function getCheckoutUrl(tierName: string): string {
  if (tierName === "Elite") {
    const planId = process.env.WHOP_ELITE_PLAN_ID;
    return planId ? `https://whop.com/checkout/${planId}` : "#";
  }
  if (tierName === "Pro") {
    const planId = process.env.WHOP_PRO_PLAN_ID;
    return planId ? `https://whop.com/checkout/${planId}` : "#";
  }
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
          Choose Your Edge
        </h1>
        <p className="text-gray-400 max-w-xl mx-auto text-sm sm:text-base">
          The free tier shows you who is not beating the market. Paid tiers show
          you who is -- and how to use their signals.
        </p>
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
                    Most Popular
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
                    Elite
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
                      <FeatureValue value={row.elite} />
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
