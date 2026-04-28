import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Database,
  Video,
  Brain,
  Crosshair,
  TrendingUp,
  Target,
  Shield,
  BarChart3,
  ChevronRight,
  Eye,
  Clock,
  Filter,
  Award,
  Layers,
  Activity,
} from "lucide-react";
import {
  EXTRACTION_CONFIDENCE_THRESHOLD,
  SCORE_WEIGHTS,
} from "@/lib/public-methodology";
import { TRACKED_CREATOR_COUNT } from "@/lib/tracked-creators";

export const metadata: Metadata = {
  title: "Methodology — How We Score Crypto YouTubers | CryptoTubers Ranked",
  description:
    "Our scoring methodology: one public Alpha Score formula, confidence-gated extraction, and real market-data verification.",
  alternates: { canonical: "/methodology" },
};

/* ------------------------------------------------------------------ */
/*  Static data used across the page                                  */
/* ------------------------------------------------------------------ */

const TRACKED_COINS: readonly string[] = [
  "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE",
  "ADA", "AVAX", "DOT", "LINK", "TAO", "RENDER",
  "FET", "NEAR", "AR", "INJ", "SUI", "PENDLE",
] as const;

interface ScoreComponent {
  readonly label: string;
  readonly maxPoints: number;
  readonly color: string;
  readonly bgColor: string;
  readonly borderColor: string;
  readonly description: string;
}

const SCORE_COMPONENTS: readonly ScoreComponent[] = [
  {
    label: "Direction Correct",
    maxPoints: SCORE_WEIGHTS.direction,
    color: "text-pos",
    bgColor: "bg-pos",
    borderColor: "border-pos/30",
    description:
      `Did the price go the direction they called at 30 days? Bullish call + price went up = ${SCORE_WEIGHTS.direction} points. Wrong direction = 0 points.`,
  },
  {
    label: "Alpha Over BTC",
    maxPoints: SCORE_WEIGHTS.alpha,
    color: "text-blue-400",
    bgColor: "bg-blue-400",
    borderColor: "border-blue-400/30",
    description:
      `How much did the coin outperform Bitcoin over 30 days? Each 1% of alpha = ${(SCORE_WEIGHTS.alpha / 10).toFixed(1)} points, capped at ${SCORE_WEIGHTS.alpha}.`,
  },
  {
    label: "Specificity",
    maxPoints: SCORE_WEIGHTS.specificity,
    color: "text-accent",
    bgColor: "bg-accent",
    borderColor: "border-accent/30",
    description:
      `How precise was the call? Entry price (${(SCORE_WEIGHTS.specificity / 4).toFixed(2)} pts), target price (${(SCORE_WEIGHTS.specificity / 4).toFixed(2)} pts), stop-loss (${(SCORE_WEIGHTS.specificity / 4).toFixed(2)} pts), timeframe (${(SCORE_WEIGHTS.specificity / 4).toFixed(2)} pts).`,
  },
  {
    label: "Regime Difficulty",
    maxPoints: SCORE_WEIGHTS.regime,
    color: "text-orange-400",
    bgColor: "bg-orange-400",
    borderColor: "border-orange-400/30",
    description:
      `How hard was this call given market conditions? Bullish call in a bear market = ${SCORE_WEIGHTS.regime} points. Bullish in a bull market = 1 point.`,
  },
  {
    label: "Target Hit",
    maxPoints: SCORE_WEIGHTS.target,
    color: "text-accent",
    bgColor: "bg-accent",
    borderColor: "border-accent/30",
    description:
      `Did the price actually hit their stated target within 90 days? Yes = ${SCORE_WEIGHTS.target} points. No = 0 points.`,
  },
] as const;

interface PipelineStep {
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly label: string;
  readonly detail: string;
  readonly color: string;
}

const PIPELINE_STEPS: readonly PipelineStep[] = [
  {
    icon: Video,
    label: "Scrape",
    detail: `Auto-generated subtitles pulled daily from ${TRACKED_CREATOR_COUNT} creators`,
    color: "text-neg",
  },
  {
    icon: Brain,
    label: "Extract",
    detail: "AI identifies specific, actionable predictions from transcripts",
    color: "text-accent",
  },
  {
    icon: Crosshair,
    label: "Match",
    detail: "Each call is matched against 18.7M candle rows from Binance",
    color: "text-blue-400",
  },
  {
    icon: BarChart3,
    label: "Score",
    detail: "Alpha Score computed from 5 weighted components (0-100)",
    color: "text-pos",
  },
  {
    icon: Award,
    label: "Rank",
    detail: "Creators ranked by average Alpha Score across all scored calls",
    color: "text-accent",
  },
] as const;

interface RankingMetric {
  readonly label: string;
  readonly description: string;
  readonly icon: React.ComponentType<{ className?: string }>;
}

const RANKING_METRICS: readonly RankingMetric[] = [
  {
    label: "Alpha Score",
    description: "Average Alpha Score across all scored calls. This is the primary ranking metric.",
    icon: BarChart3,
  },
  {
    label: "Win Rate",
    description: "Percentage of calls where the direction was correct at 30 days.",
    icon: Target,
  },
  {
    label: "Alpha",
    description: "Average excess return over Bitcoin at 30 days across all calls.",
    icon: TrendingUp,
  },
] as const;

interface TierInfo {
  readonly name: string;
  readonly range: string;
  readonly badge: string;
}

const TIERS: readonly TierInfo[] = [
  { name: "Alpha", range: "Signals & Intelligence", badge: "badge-elite" },
  { name: "Pro", range: "Deep Analytics", badge: "badge-pro" },
  { name: "Free", range: "Full Leaderboard", badge: "badge-free" },
] as const;

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function MethodologyPage() {
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
        <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-full px-4 py-1.5 mb-6">
          <Eye className="w-4 h-4 text-accent" />
          <span className="text-accent text-xs font-medium">
            Full Transparency
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
          How We Score{" "}
          <span className="text-gradient-gold">Every Call</span>
        </h1>

        <p className="text-gray-400 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
          We show you exactly how scores are calculated so you can evaluate our
          methodology. No black boxes. Every formula, every weight, every data
          source -- laid out right here.
        </p>
      </section>

      {/* Pipeline visual */}
      <section className="mb-16">
        <SectionHeader
          title="How Rankings Work"
          subtitle="From video to verdict in 5 steps"
        />
        <PipelineVisual />
      </section>

      {/* Data Sources */}
      <section className="mb-16">
        <SectionHeader
          title="Data Sources"
          subtitle="What feeds the accuracy scoring"
        />
        <DataSourcesGrid />
      </section>

      {/* Alpha Score Formula */}
      <section className="mb-16">
        <SectionHeader
          title="The Alpha Score"
          subtitle="A weighted composite from 0 to 100"
        />
        <AlphaScoreFormula />
      </section>

      {/* Score Components Detail */}
      <section className="mb-16">
        <SectionHeader
          title="Score Components"
          subtitle="What each piece measures and why it matters"
        />
        <ScoreComponentCards />
      </section>

      {/* Creator Rankings */}
      <section className="mb-16">
        <SectionHeader
          title="Creator Rankings"
          subtitle="How individual call scores become creator rankings"
        />
        <CreatorRankingsSection />
      </section>

      {/* Statistical Rigor */}
      <section className="mb-16">
        <SectionHeader
          title="Statistical Rigor"
          subtitle="We don't just rank -- we quantify our confidence"
        />
        <StatisticalRigorSection />
      </section>

      {/* Transparency section */}
      <section className="mb-16">
        <SectionHeader
          title="Our Transparency Commitment"
          subtitle="What we believe you deserve to know"
        />
        <TransparencySection />
      </section>

      {/* CTA */}
      <section className="text-center mb-8">
        <div className="glass-card p-8 sm:p-12 glow-gold">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-3">
            Ready to see who actually beats the market?
          </h2>
          <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
            Now that you know how we score, check the leaderboard to see the results.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/"
              className="bg-accent hover:bg-accent-dim text-ink-0 font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors"
            >
              View Leaderboard
            </Link>
            <Link
              href="/pricing"
              className="bg-ink-100 hover:bg-ink-150 text-white font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors border border-ink-200"
            >
              See Pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reusable sub-components (co-located, single file)                 */
/* ------------------------------------------------------------------ */

function SectionHeader({
  title,
  subtitle,
}: {
  readonly title: string;
  readonly subtitle: string;
}) {
  return (
    <div className="mb-8">
      <h2 className="text-white font-bold text-xl sm:text-2xl">{title}</h2>
      <p className="text-gray-500 text-sm mt-1">{subtitle}</p>
    </div>
  );
}

/* ---------- Pipeline Visual ---------- */

function PipelineVisual() {
  return (
    <div className="glass-card p-6 sm:p-8">
      {/* Desktop: horizontal */}
      <div className="hidden md:flex items-start justify-between gap-2">
        {PIPELINE_STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={step.label} className="flex items-start flex-1">
              <div className="flex flex-col items-center text-center flex-1">
                <div className="w-14 h-14 rounded-xl bg-ink-100 border border-ink-200 flex items-center justify-center mb-3">
                  <Icon className={`w-6 h-6 ${step.color}`} />
                </div>
                <span className="text-white font-semibold text-sm mb-1">
                  {step.label}
                </span>
                <span className="text-gray-500 text-xs leading-relaxed max-w-[160px]">
                  {step.detail}
                </span>
              </div>
              {index < PIPELINE_STEPS.length - 1 && (
                <ChevronRight className="w-5 h-5 text-ink-200 mt-4 shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: vertical */}
      <div className="md:hidden space-y-4">
        {PIPELINE_STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={step.label} className="flex items-start gap-4">
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 rounded-lg bg-ink-100 border border-ink-200 flex items-center justify-center">
                  <Icon className={`w-5 h-5 ${step.color}`} />
                </div>
                {index < PIPELINE_STEPS.length - 1 && (
                  <div className="w-px h-6 bg-ink-200 mt-2" />
                )}
              </div>
              <div className="pt-1.5">
                <span className="text-white font-semibold text-sm">
                  {step.label}
                </span>
                <p className="text-gray-500 text-xs mt-0.5">{step.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Data Sources ---------- */

function DataSourcesGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Market Data */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-pos/10 border border-pos/20 flex items-center justify-center">
            <Database className="w-5 h-5 text-pos" />
          </div>
          <h3 className="text-white font-semibold">Market Data</h3>
        </div>

        <div className="space-y-3 mb-5">
          <DataPoint label="Candle Rows" value="18.7 Million" />
          <DataPoint label="Source" value="Binance OHLCV" />
          <DataPoint label="Timespan" value="April 2024 - Present" />
          <DataPoint label="Coins Tracked" value="18" />
        </div>

        <div className="border-t border-ink-200 pt-4">
          <p className="text-gray-500 text-xs mb-2.5 font-medium uppercase tracking-wider">
            Tracked Coins
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TRACKED_COINS.map((coin) => (
              <span
                key={coin}
                className="text-[10px] font-medium text-gray-400 bg-ink-100 border border-ink-200 rounded px-1.5 py-0.5"
              >
                {coin}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* YouTube Transcripts */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-neg/10 border border-neg/20 flex items-center justify-center">
            <Video className="w-5 h-5 text-neg" />
          </div>
          <h3 className="text-white font-semibold">YouTube Transcripts</h3>
        </div>

        <div className="space-y-3 mb-5">
          <DataPoint label="Creators" value={`${TRACKED_CREATOR_COUNT} Tracked`} />
          <DataPoint label="Source" value="Auto-generated subtitles" />
          <DataPoint label="Frequency" value="Scraped daily" />
          <DataPoint label="Coverage" value="Every new upload" />
        </div>

        <div className="border-t border-ink-200 pt-4">
          <p className="text-gray-500 text-xs leading-relaxed">
            We pull auto-generated subtitles from every new video uploaded by our
            tracked creators. This captures the full spoken content for analysis.
          </p>
        </div>
      </div>

      {/* AI Extraction */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Brain className="w-5 h-5 text-accent" />
          </div>
          <h3 className="text-white font-semibold">AI Extraction</h3>
        </div>

        <div className="space-y-3 mb-5">
          <DataPoint label="Task" value="Call Identification" />
          <DataPoint label="Filters" value="Actionable predictions only" />
          <DataPoint
            label="Confidence"
            value={`> ${(EXTRACTION_CONFIDENCE_THRESHOLD * 100).toFixed(0)}% threshold`}
          />
          <DataPoint label="Output" value="Structured call data" />
        </div>

        <div className="border-t border-ink-200 pt-4">
          <p className="text-gray-500 text-xs leading-relaxed">
            AI parses transcripts to identify specific, actionable predictions --
            not general commentary. Only calls with confidence above {(EXTRACTION_CONFIDENCE_THRESHOLD * 100).toFixed(0)}% are counted.
          </p>
        </div>
      </div>
    </div>
  );
}

function DataPoint({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500 text-xs">{label}</span>
      <span className="text-gray-300 text-xs font-medium">{value}</span>
    </div>
  );
}

/* ---------- Alpha Score Formula ---------- */

function AlphaScoreFormula() {
  const totalMax = SCORE_COMPONENTS.reduce((sum, c) => sum + c.maxPoints, 0);

  return (
    <div className="glass-card p-6 sm:p-8">
      {/* Formula text */}
      <div className="mb-6 text-center">
        <p className="text-gray-400 text-sm mb-2">
          Each individual call is scored on this formula:
        </p>
        <p className="text-white font-mono text-sm sm:text-base">
          <span className="text-pos">Direction</span>{" "}
          <span className="text-gray-600">+</span>{" "}
          <span className="text-blue-400">Alpha</span>{" "}
          <span className="text-gray-600">+</span>{" "}
          <span className="text-accent">Specificity</span>{" "}
          <span className="text-gray-600">+</span>{" "}
          <span className="text-orange-400">Regime</span>{" "}
          <span className="text-gray-600">+</span>{" "}
          <span className="text-accent">Target</span>{" "}
          <span className="text-gray-600">=</span>{" "}
          <span className="text-white font-bold">Alpha Score</span>
        </p>
      </div>

      {/* Stacked bar */}
      <div className="mb-4">
        <div className="flex h-10 sm:h-12 rounded-lg overflow-hidden border border-ink-200">
          {SCORE_COMPONENTS.map((comp) => {
            const widthPercent = (comp.maxPoints / totalMax) * 100;
            return (
              <div
                key={comp.label}
                className={`${comp.bgColor} flex items-center justify-center relative group`}
                style={{ width: `${widthPercent}%` }}
                title={`${comp.label}: ${comp.maxPoints} pts`}
              >
                <span className="text-ink-0 font-bold text-[10px] sm:text-xs">
                  {comp.maxPoints}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
        {SCORE_COMPONENTS.map((comp) => (
          <div key={comp.label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-sm ${comp.bgColor}`} />
            <span className="text-gray-400 text-xs">
              {comp.label}{" "}
              <span className="text-gray-500">({comp.maxPoints})</span>
            </span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="text-gray-300 text-xs font-semibold">
            = {totalMax} max
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Score Component Cards ---------- */

function ScoreComponentCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {SCORE_COMPONENTS.map((comp) => (
        <div
          key={comp.label}
          className={`glass-card p-5 border-l-2 ${comp.borderColor}`}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className={`font-semibold text-sm ${comp.color}`}>
              {comp.label}
            </h3>
            <span className="text-white font-bold text-lg tabular-nums">
              {comp.maxPoints}
              <span className="text-gray-600 text-xs font-normal ml-0.5">pts</span>
            </span>
          </div>

          {/* Mini progress bar showing max */}
          <div className="h-1.5 bg-ink-200 rounded-full overflow-hidden mb-3">
            <div
              className={`h-full rounded-full ${comp.bgColor}`}
              style={{ width: `${(comp.maxPoints / 100) * 100}%` }}
            />
          </div>

          <p className="text-gray-400 text-xs leading-relaxed">
            {comp.description}
          </p>
        </div>
      ))}

      {/* Total card */}
      <div className="glass-card p-5 border-l-2 border-white/20 flex flex-col justify-center">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm text-white">Total Maximum</h3>
          <span className="text-gradient-gold font-bold text-2xl tabular-nums">
            100
          </span>
        </div>
        <p className="text-gray-500 text-xs leading-relaxed">
          A perfect score means correct direction, maximum alpha over BTC, full
          specificity with entry/target/stop/timeframe, difficult regime, and
          target hit.
        </p>
      </div>
    </div>
  );
}

/* ---------- Creator Rankings ---------- */

function CreatorRankingsSection() {
  return (
    <div className="space-y-6">
      {/* Aggregation metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {RANKING_METRICS.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="glass-card p-5">
              <div className="flex items-center gap-3 mb-2">
                <Icon className="w-5 h-5 text-accent" />
                <h3 className="text-white font-semibold text-sm">
                  {metric.label}
                </h3>
              </div>
              <p className="text-gray-400 text-xs leading-relaxed">
                {metric.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* Ranking periods and tiers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Ranking periods */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <Clock className="w-5 h-5 text-accent" />
            <h3 className="text-white font-semibold text-sm">
              Ranking Periods
            </h3>
          </div>
          <p className="text-gray-400 text-xs leading-relaxed mb-4">
            Rankings are recomputed daily across three time windows as new videos
            are published and new price data arrives.
          </p>
          <div className="space-y-2">
            {(["All Time", "90 Days", "30 Days"] as const).map((period) => (
              <div
                key={period}
                className="flex items-center gap-2 bg-ink-100 border border-ink-200 rounded-lg px-3 py-2"
              >
                <Activity className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-gray-300 text-xs font-medium">
                  {period}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Tier system */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <Layers className="w-5 h-5 text-accent" />
            <h3 className="text-white font-semibold text-sm">
              Tier System
            </h3>
          </div>
          <p className="text-gray-400 text-xs leading-relaxed mb-4">
            The public research surface is free. Premium delivery workflows are
            roadmap items and are not required to view creator history or
            per-call score breakdowns.
          </p>
          <div className="space-y-2">
            {TIERS.map((tier) => (
              <div
                key={tier.name}
                className="flex items-center justify-between bg-ink-100 border border-ink-200 rounded-lg px-3 py-2"
              >
                <span className={tier.badge}>{tier.name}</span>
                <span className="text-gray-400 text-xs">{tier.range}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Statistical Rigor ---------- */

function StatisticalRigorSection() {
  const rigorItems: readonly {
    readonly stat: string;
    readonly label: string;
    readonly detail: string;
  }[] = [
    {
      stat: "5,000",
      label: "Bootstrap Resamples",
      detail:
        "We resample the entire dataset 5,000 times to compute 95% confidence intervals for every rank. Top 5 creators overlap -- we tell you that honestly.",
    },
    {
      stat: "0.95+",
      label: "Spearman Stability",
      detail:
        "Every formula weight was perturbed by +/-25%. Rankings remained stable (Spearman > 0.95) across all variations. The formula is robust, not fragile.",
    },
    {
      stat: "1.4%",
      label: "ICC (Signal Strength)",
      detail:
        "Only 1.4% of call-level score variance is between creators. The rest is market noise. This is why we need thousands of calls to separate skill from luck.",
    },
    {
      stat: "3x",
      label: "Contrarian Edge",
      detail:
        "Calls that go against peer consensus score 3x higher on average. This is a statistically significant pattern across 4,600+ scored calls.",
    },
    {
      stat: "18.7M",
      label: "Candle Data Points",
      detail:
        "Every call is matched against Binance OHLCV candle data across 18 coins. No estimates, no approximations -- real prices at call date and evaluation windows.",
    },
    {
      stat: "136+",
      label: "Analysis Iterations",
      detail:
        "The scoring formula has been stress-tested across 136+ statistical analyses: bootstrap, Bayesian estimation, regime splits, decay curves, and more.",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {rigorItems.map((item) => (
        <div key={item.label} className="glass-card p-5">
          <div className="mb-3">
            <span className="text-gradient-gold font-bold text-2xl tabular-nums">
              {item.stat}
            </span>
          </div>
          <h3 className="text-white font-semibold text-sm mb-1">
            {item.label}
          </h3>
          <p className="text-gray-400 text-xs leading-relaxed">
            {item.detail}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ---------- Transparency ---------- */

function TransparencySection() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <TransparencyCard
        icon={Eye}
        title="Open Formula"
        description="We show you exactly how scores are calculated so you can evaluate our methodology. No proprietary magic -- just math."
      />
      <TransparencyCard
        icon={Filter}
        title="AI Confidence Filter"
        description={`The extraction AI identifies what qualifies as an actionable call vs. just commentary. Only calls with confidence above ${(EXTRACTION_CONFIDENCE_THRESHOLD * 100).toFixed(0)}% are counted.`}
      />
      <TransparencyCard
        icon={Crosshair}
        title="Per-Call Transparency"
        description="Users can see each creator's individual calls and exactly how they were scored -- direction, alpha, specificity, regime, and target."
      />
      <TransparencyCard
        icon={Clock}
        title="Daily Updates"
        description="Rankings update daily as new videos are published and new price data arrives. You always see the latest state of the data."
      />
      <TransparencyCard
        icon={Shield}
        title="No Conflicts"
        description="We do not accept sponsorships from tracked creators. Rankings are purely data-driven. We have zero incentive to inflate or deflate any creator's score."
      />
      <TransparencyCard
        icon={Database}
        title="Verifiable Data"
        description="Market data comes directly from Binance. YouTube transcripts are from public auto-generated subtitles. Both are independently verifiable."
      />
    </div>
  );
}

function TransparencyCard({
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
        <Icon className="w-5 h-5 text-accent" />
        <h3 className="text-white font-semibold text-sm">{title}</h3>
      </div>
      <p className="text-gray-400 text-xs leading-relaxed">{description}</p>
    </div>
  );
}
