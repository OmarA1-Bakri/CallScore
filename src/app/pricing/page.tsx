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
    "Free leaderboard for everyone. Pro analytics at $19/mo. Alpha signals at $49/mo. Find the crypto YouTubers who actually beat the market.",
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
    tagline: "Full leaderboard, see every rank",
    features: [
      "Complete leaderboard (all ranks)",
      "Creator profiles with basic stats",
      "Win rate, alpha score, total calls",
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
    price: "$19",
    period: "/mo",
    tagline: "Deep analytics on every creator",
    features: [
      "Everything in Free",
      "Full call-by-call history",
      "Score breakdown per call",
      "Performance charts over time",
      "Bull vs bear win rates",
      "Real-time data updates",
    ],
    cta: "Upgrade to Pro",
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
    tagline: "Actionable signals, not just rankings",
    features: [
      "Everything in Pro",
      "Bear & bull specialist rankings",
      "Contrarian signal alerts",
      "Consensus strength warnings",
      "Direction-specific leaderboards",
      "First-mover detection",
      "API access (coming soon)",
    ],
    cta: "Get Alpha",
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
  { feature: "Creator Profiles", free: "Basic", pro: "Full", alpha: "Full" },
  { feature: "Call History", free: false, pro: "Full", alpha: "Full" },
  { feature: "Score Breakdown per Call", free: false, pro: true, alpha: true },
  { feature: "Performance Charts", free: false, pro: true, alpha: true },
  { feature: "Data Freshness", free: "7-day delay", pro: "Real-time", alpha: "Real-time" },
  { feature: "Bull vs Bear Win Rates", free: false, pro: true, alpha: true },
  { feature: "Direction-Specific Rankings", free: false, pro: false, alpha: true },
  { feature: "Contrarian Signal Alerts", free: false, pro: false, alpha: true },
  { feature: "Consensus Strength Warnings", free: false, pro: false, alpha: true },
  { feature: "Bear/Bull Specialist Alerts", free: false, pro: false, alpha: true },
  { feature: "First-Mover Detection", free: false, pro: false, alpha: true },
  { feature: "API Access", free: false, pro: false, alpha: "Coming soon" },
] as const;

interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: "Why is the leaderboard free?",
    answer:
      "The leaderboard is the hook, not the product. Rankings tell you WHO is good -- but the real value is understanding WHEN to listen, in WHAT market conditions, and which signals to fade. That intelligence is what Pro and Alpha unlock.",
  },
  {
    question: "How do you calculate the Alpha Score?",
    answer:
      "Each call is scored on five components: direction correctness at 30 days (40pts), alpha over BTC returns (20pts), call specificity (15pts), market regime difficulty (10pts), and target hit accuracy (10pts). Scores are base-rate adjusted so bearish calls in bull markets earn more than easy consensus calls. Full details on our Methodology page.",
  },
  {
    question: "What are contrarian signals?",
    answer:
      "When a top-ranked creator calls the opposite direction of the crowd, we flag it. Our data shows contrarian calls score 3x higher than herd calls. Miles Deutscher, for example, has a 70% win rate when going against consensus. Alpha subscribers get alerts when these signals fire.",
  },
  {
    question: "What are consensus strength warnings?",
    answer:
      "When 3+ creators independently call the same coin in the same direction within a week, we analyze the signal strength. Counter-intuitively, unanimous agreement among creators is historically the weakest signal -- mixed opinions correlate with much higher accuracy. We surface this so you know when to be cautious.",
  },
  {
    question: "How often is the data updated?",
    answer:
      "We scrape new videos daily and run the full scoring pipeline every 24 hours. Free users see data with a 7-day delay. Pro and Alpha users get real-time updates as soon as new scores are computed.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes, you can cancel your subscription at any time. Your access will continue through the end of your current billing period.",
  },
  {
    question: "Only 1 of 19 beats buy-and-hold -- why should I subscribe?",
    answer:
      "That stat is the point. Most people follow 5-10 crypto YouTubers blindly. We show you which one actually generates alpha, who has an 85% win rate in bear markets, and when the crowd is about to be wrong. The value is not that everyone is great -- it is knowing who is and when.",
  },
] as const;

function getCheckoutUrl(tierName: string): string {
  if (tierName === "Alpha") {
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
          description="When a top creator goes against the crowd, they win 3x more often. We alert you the moment it happens."
        />
        <ValueProp
          icon={Shield}
          title="Consensus Warnings"
          description="When all creators agree, accuracy drops. Unanimous bullish consensus historically hits just 54%. We warn you."
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
