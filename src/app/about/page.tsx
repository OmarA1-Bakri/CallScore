import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Target,
  Database,
  Video,
  BarChart3,
  TrendingUp,
  ArrowRight,
  Shield,
} from "lucide-react";
import { getPublicCounts } from "@/lib/public-counts";

export const metadata: Metadata = {
  title: "About - CryptoTubers Ranked",
  description:
    "We independently track and verify crypto YouTube calls against real market data using the published Alpha Score methodology.",
};

/* ------------------------------------------------------------------ */
/*  Static data                                                        */
/* ------------------------------------------------------------------ */

interface KeyFact {
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly value: string;
  readonly label: string;
  readonly color: string;
}

interface HowStep {
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly title: string;
  readonly description: string;
  readonly color: string;
}

const HOW_STEPS: readonly HowStep[] = [
  {
    icon: Video,
    title: "Extract Predictions",
    description:
      "We pull auto-generated subtitles from every new video and use AI to identify specific, actionable altcoin predictions.",
    color: "text-brand-red",
  },
  {
    icon: Database,
    title: "Match Against Real Prices",
    description:
      "Each prediction is matched against Binance OHLCV candle data across 18 tracked coins to measure actual price movement.",
    color: "text-blue-400",
  },
  {
    icon: BarChart3,
    title: "Compute Accuracy Scores",
    description:
      "We score every call on direction accuracy, alpha over Bitcoin, specificity, market regime difficulty, and target hit rate.",
    color: "text-brand-green",
  },
  {
    icon: TrendingUp,
    title: "Rank by Performance",
    description:
      "Creators are ranked by their average Alpha Score across all scored calls, updated daily as new data arrives.",
    color: "text-brand-gold",
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default async function AboutPage() {
  const counts = await getPublicCounts().catch(() => ({
    trackedCreators: 20,
    rankedCreators: 0,
    trackedCalls: 0,
    scoredCalls: 0,
    beatBtcCreators: 0,
  }));
  const keyFacts: readonly KeyFact[] = [
    {
      icon: Video,
      value: String(counts.trackedCreators),
      label: "Creators Tracked",
      color: "text-brand-red",
    },
    {
      icon: Target,
      value: counts.scoredCalls.toLocaleString(),
      label: "Calls Scored",
      color: "text-brand-green",
    },
    {
      icon: Database,
      value: "18.7M",
      label: "Candle Data Points",
      color: "text-blue-400",
    },
    {
      icon: BarChart3,
      value: "Daily",
      label: "Ranking Updates",
      color: "text-brand-gold",
    },
  ];

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

      {/* Page header */}
      <section className="text-center mb-16">
        <div className="inline-flex items-center gap-2 bg-brand-accent/10 border border-brand-accent/20 rounded-full px-4 py-1.5 mb-6">
          <Shield className="w-4 h-4 text-brand-accent" />
          <span className="text-brand-accent text-xs font-medium">
            Independent Analytics
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
          About{" "}
          <span className="text-gradient-gold">CryptoTubers Ranked</span>
        </h1>

        <p className="text-gray-400 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
          We independently track and verify the accuracy of crypto YouTube
          influencers&apos; altcoin predictions against real market data. No
          opinions, no bias -- just numbers.
        </p>
      </section>

      {/* Key facts */}
      <section className="mb-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {keyFacts.map((fact) => {
            const Icon = fact.icon;
            return (
              <div key={fact.label} className="glass-card p-5 text-center">
                <Icon className={`w-6 h-6 ${fact.color} mx-auto mb-3`} />
                <span className="text-gradient-gold font-bold text-2xl tabular-nums block">
                  {fact.value}
                </span>
                <span className="text-gray-500 text-xs mt-1 block">
                  {fact.label}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Why we exist */}
      <section className="mb-16">
        <div className="glass-card p-6 sm:p-8">
          <h2 className="text-white font-bold text-xl sm:text-2xl mb-4">
            Why We Exist
          </h2>
          <div className="space-y-4">
            <p className="text-gray-400 text-sm leading-relaxed">
              Most crypto influencer &quot;ratings&quot; are based on subscriber
              counts, engagement metrics, or popularity polls. None of these tell
              you whether the person&apos;s calls actually make money.
            </p>
            <p className="text-gray-400 text-sm leading-relaxed">
              We built CryptoTubers Ranked to answer the only question that
              matters:{" "}
              <span className="text-white font-semibold">
                when a crypto YouTuber says &quot;buy this coin,&quot; does it
                actually go up?
              </span>
            </p>
            <p className="text-gray-400 text-sm leading-relaxed">
              Every ranking on this platform is backed by verifiable data --
              real predictions extracted from real videos, scored against real
              price movements from Binance. We don&apos;t accept sponsorships
              from tracked creators and have zero incentive to inflate or deflate
              any score.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mb-16">
        <h2 className="text-white font-bold text-xl sm:text-2xl mb-2">
          How It Works
        </h2>
        <p className="text-gray-500 text-sm mb-8">
          From video upload to accuracy score in four steps
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {HOW_STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="glass-card p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-card border border-brand-border flex items-center justify-center shrink-0">
                    <span className="text-gray-500 text-xs font-bold">
                      {index + 1}
                    </span>
                  </div>
                  <Icon className={`w-5 h-5 ${step.color}`} />
                  <h3 className="text-white font-semibold text-sm">
                    {step.title}
                  </h3>
                </div>
                <p className="text-gray-400 text-xs leading-relaxed pl-11">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA: Methodology link */}
      <section className="text-center mb-8">
        <div className="glass-card p-8 sm:p-12 glow-gold">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-3">
            Want the full details?
          </h2>
          <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
            Our methodology page breaks down every formula, every weight, and
            every data source we use to compute scores.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/methodology"
              className="inline-flex items-center gap-2 bg-brand-gold hover:bg-brand-gold-dim text-brand-dark font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors"
            >
              Learn About Our Scoring Methodology
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/"
              className="bg-brand-card hover:bg-brand-card-hover text-white font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors border border-brand-border"
            >
              View Leaderboard
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
