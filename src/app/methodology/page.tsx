import Link from "next/link";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { EditorialSection, MetaStrip, Chip } from "@/components/primitives";
import {
  EXTRACTION_CONFIDENCE_THRESHOLD,
  SCORE_WEIGHTS,
} from "@/lib/public-methodology";
import { TRACKED_CREATOR_COUNT } from "@/lib/tracked-creators";
import {
  CALL_SCORE_LIFECYCLE_STATES,
  CREATOR_RANKING_STATES,
  CURRENT_CREATOR_RANKING_METHOD,
  OFFICIAL_CREATOR_THRESHOLDS,
  RECOMMENDED_CREATOR_RANK_SCORE_V2,
} from "@/lib/methodology-rubric";

export const metadata: Metadata = {
  title: "Methodology — CallScore",
  description:
    "Our scoring methodology: public Call Score components, creator ranking eligibility, bucket states, and current methodology limits.",
  alternates: { canonical: "/methodology" },
};

/* ------------------------------------------------------------------ */
/*  Static data                                                        */
/* ------------------------------------------------------------------ */

const TRACKED_COINS = [
  "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE",
  "ADA", "AVAX", "DOT", "LINK", "TAO", "RENDER",
  "FET", "NEAR", "AR", "INJ", "SUI", "PENDLE",
] as const;

interface PipelineStep {
  readonly name: string;
  readonly detail: string;
}

const PIPELINE_STEPS: readonly PipelineStep[] = [
  { name: "Scrape", detail: "Auto-generated subtitles, daily" },
  { name: "Extract", detail: "AI identifies actionable predictions" },
  { name: "Match", detail: "Each call ↔ Binance candles" },
  { name: "Score", detail: "5 components → 0–100 Call Score" },
  { name: "Rank", detail: "Creator Rank Score + eligibility buckets" },
] as const;

interface ScoreRow {
  readonly label: string;
  readonly max: number;
  readonly how: string;
}

const SCORE_ROWS: readonly ScoreRow[] = [
  {
    label: "Direction correct",
    max: SCORE_WEIGHTS.direction,
    how: "30d move must clear the direction threshold: bullish > +2%, bearish < -2%, neutral within ±10%.",
  },
  {
    label: "Alpha over BTC",
    max: SCORE_WEIGHTS.alpha,
    how: `BTC-relative 30d alpha contributes up to ${SCORE_WEIGHTS.alpha} points; current implementation floors negative alpha at 0 in the public 0–100 score.`,
  },
  {
    label: "Specificity",
    max: SCORE_WEIGHTS.specificity,
    how: "Entry, target, stop-loss, and timeframe can each add credit; current data is mostly target-driven.",
  },
  {
    label: "Regime difficulty",
    max: SCORE_WEIGHTS.regime,
    how: "Contrarian calls receive more credit through the stored regime_difficulty field.",
  },
  {
    label: "Target hit",
    max: SCORE_WEIGHTS.target,
    how: "Stated target reached within 90d.",
  },
] as const;

interface TierRow {
  readonly tier: string;
  readonly range: string;
  readonly read: string;
}

// Call Score thresholds for S/A/B/C public tier badges.
const TIERS: readonly TierRow[] = [
  { tier: "S", range: "70 – 100", read: "Elite individual-call score, not a guarantee of creator rank." },
  { tier: "A", range: "55 – 69",  read: "Strong call-level outcome with directional edge." },
  { tier: "B", range: "40 – 54",  read: "Mixed call-level result; some edge but incomplete score components." },
  { tier: "C", range: "0 – 39",   read: "Weak call-level result or insufficient component evidence." },
] as const;

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function MethodologyPage(): ReactElement {
  return (
    <div className="max-w-page mx-auto px-4 tab:px-6 desk:px-8">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 font-mono text-[11px] text-ink-500 hover:text-ink-700 tracking-caps uppercase mt-8 mb-8"
      >
        <span aria-hidden="true">←</span> Leaderboard
      </Link>

      {/* HERO */}
      <section className="pb-12 border-b border-ink-250">
        <div className="font-mono text-[11px] text-ink-500 tracking-caps uppercase mb-4">
          Methodology · Public
        </div>
        <h1 className="font-serif text-[35px] tab:text-[45px] desk:text-[53px] text-ink-900 font-medium tracking-tight leading-[1.05] text-balance max-w-[880px] mb-5">
          How we score.{" "}
          <em className="italic font-normal text-accent">In public.</em>
        </h1>
        <p className="font-serif text-[20px] text-ink-700 leading-relaxed max-w-[760px]">
          Call Score is a 0–100 score for one matured market call. Creator
          ranking is a separate eligibility-and-ranking contract that uses
          sample size, exclusions, freshness, and bucket states before anyone
          appears as official.{" "}
          <em className="italic text-accent">If a number looks wrong, audit me.</em>
        </p>
        <MetaStrip
          cells={[
            { k: "components", v: "5" },
            { k: "candles", v: "18.7M" },
            { k: "creator seed list", v: TRACKED_CREATOR_COUNT },
            {
              k: "extraction floor",
              v: `${Math.round(EXTRACTION_CONFIDENCE_THRESHOLD * 100)}%`,
            },
          ]}
        />
        <p className="mt-4 max-w-[760px] font-mono text-[11px] uppercase tracking-caps text-ink-500">
          The seed-list count is the repo-maintained creator admission baseline. The homepage tracked-creator count is live HH PostgreSQL coverage and may be higher after runtime ingestion.
        </p>
      </section>

      {/* 01 — pipeline */}
      <EditorialSection
        index="01"
        title={<>The <em className="italic text-accent">pipeline</em>.</>}
        meta={<>Scrape → Extract → Match → Score → Rank</>}
      >
        <ol className="grid grid-cols-1 tab:grid-cols-5 gap-4">
          {PIPELINE_STEPS.map((step, i) => (
            <li key={step.name} className="border-t border-ink-250 pt-3">
              <div className="font-mono text-[11px] text-ink-500 tracking-caps uppercase mb-1">
                step {String(i + 1).padStart(2, "0")}
              </div>
              <div className="font-serif text-[19px] text-ink-900 font-medium leading-tight mb-1">
                {step.name}
              </div>
              <div className="font-mono text-[12px] text-ink-600 leading-relaxed">
                {step.detail}
              </div>
            </li>
          ))}
        </ol>
      </EditorialSection>

      {/* 02 — score */}
      <EditorialSection
        index="02"
        title={<>The <em className="italic text-accent">score</em>.</>}
        meta={
          <>
            5 components · max 100 ·{" "}
            <span className="text-ink-700">
              floor {Math.round(EXTRACTION_CONFIDENCE_THRESHOLD * 100)}%
            </span>
          </>
        }
      >
        <table className="w-full font-mono text-[13px]">
          <thead>
            <tr className="border-b border-ink-250">
              <th className="text-left text-[11px] text-ink-500 tracking-caps uppercase font-normal py-2">
                Component
              </th>
              <th className="text-right text-[11px] text-ink-500 tracking-caps uppercase font-normal py-2 w-20">
                Max
              </th>
              <th className="text-left text-[11px] text-ink-500 tracking-caps uppercase font-normal py-2 pl-6">
                How it&apos;s earned
              </th>
            </tr>
          </thead>
          <tbody>
            {SCORE_ROWS.map((c) => (
              <tr key={c.label} className="border-b border-ink-200">
                <td className="py-3 font-serif text-[15px] text-ink-900">{c.label}</td>
                <td className="py-3 text-right tabular-nums text-ink-700">{c.max}</td>
                <td className="py-3 pl-6 text-ink-600 leading-relaxed">{c.how}</td>
              </tr>
            ))}
            <tr>
              <td className="py-3 font-serif text-[15px] text-ink-900 font-medium">
                Total
              </td>
              <td className="py-3 text-right tabular-nums text-accent font-medium">
                {SCORE_ROWS.reduce((sum, r) => sum + r.max, 0)}
              </td>
              <td className="py-3 pl-6 text-ink-500 leading-relaxed">
                Sum of components, no rescaling.
              </td>
            </tr>
          </tbody>
        </table>
      </EditorialSection>

      {/* 03 — tracked coins */}
      <EditorialSection
        index="03"
        title={<>Tracked <em className="italic text-accent">coins</em>.</>}
        meta={<>{TRACKED_COINS.length} symbols · Binance OHLCV</>}
      >
        <p className="font-serif text-[16px] text-ink-700 leading-relaxed mb-5 max-w-[680px]">
          Calls on these tickers are matched against minute-grained Binance
          candles. Anything outside this universe is logged but not scored.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {TRACKED_COINS.map((coin) => (
            <Chip key={coin}>{coin}</Chip>
          ))}
        </div>
      </EditorialSection>

      {/* 04 — rank contract */}
      <EditorialSection
        index="04"
        title={<>Creator <em className="italic text-accent">rank</em> contract.</>}
        meta={<>official / provisional / watchlist / stale / excluded</>}
      >
        <div className="grid grid-cols-1 tab:grid-cols-2 gap-6">
          <div>
            <h3 className="font-serif text-[21px] text-ink-900 font-medium mb-2">
              Call Score ≠ Creator Rank Score
            </h3>
            <p className="font-serif text-[16px] text-ink-700 leading-relaxed mb-4">
              Call Score scores one matured prediction. Creator Rank Score ranks a creator
              only after official eligibility gates pass. The current writer stores average
              Call Score in <code className="font-mono text-[13px]">{CURRENT_CREATOR_RANKING_METHOD.scoreField}</code>,
              then orders by score, win rate, sample size, and creator id. The legacy column
              name is misleading: it is not raw average alpha.
            </p>
            <ul className="font-mono text-[12px] text-ink-600 leading-relaxed space-y-1">
              {CURRENT_CREATOR_RANKING_METHOD.rankOrder.map((rule) => (
                <li key={rule}>→ {rule}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-serif text-[21px] text-ink-900 font-medium mb-2">
              Official thresholds
            </h3>
            <table className="w-full font-mono text-[12px]">
              <tbody>
                {Object.entries(OFFICIAL_CREATOR_THRESHOLDS).map(([period, rule]) => (
                  <tr key={period} className="border-b border-ink-200">
                    <td className="py-2 text-ink-900">{rule.label}</td>
                    <td className="py-2 text-ink-700">
                      {rule.officialEnabled
                        ? `${rule.officialMinCalls}+ official calls`
                        : `disabled: ${rule.emptyReason}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="font-serif text-[15px] text-ink-700 leading-relaxed mt-4">
              The 30d official leaderboard stays disabled until the maturity methodology is
              redesigned. Current safe behavior is <code className="font-mono text-[13px]">PENDING_MATURITY</code>,
              not a fake zero-call ranking.
            </p>
          </div>
        </div>
      </EditorialSection>

      {/* 05 — creator states */}
      <EditorialSection
        index="05"
        title={<>Creator <em className="italic text-accent">states</em>.</>}
        meta={<>public-safe buckets</>}
      >
        <div className="grid grid-cols-1 tab:grid-cols-2 desk:grid-cols-3 gap-4">
          {CREATOR_RANKING_STATES.map((state) => (
            <div key={state.state} className="border-t border-ink-250 pt-3">
              <div className="font-mono text-[11px] text-ink-500 tracking-caps uppercase mb-1">
                {state.bucket}
              </div>
              <h3 className="font-serif text-[19px] text-ink-900 font-medium mb-1">
                {state.label}
              </h3>
              <p className="font-serif text-[15px] text-ink-700 leading-relaxed">
                {state.definition}
              </p>
            </div>
          ))}
        </div>
      </EditorialSection>

      {/* 06 — lifecycle */}
      <EditorialSection
        index="06"
        title={<>Score <em className="italic text-accent">lifecycle</em>.</>}
        meta={<>status is separate from value</>}
      >
        <p className="font-serif text-[16px] text-ink-700 leading-relaxed mb-5 max-w-[760px]">
          A real scored call can eventually have a value of 0. The long-term
          methodology separates score lifecycle from score value. Today some
          writer/count paths still use stored score 0 as an unscored placeholder,
          so the read layer is conservative until a schema/recompute migration is approved.
        </p>
        <ol className="grid grid-cols-1 tab:grid-cols-2 gap-4">
          {CALL_SCORE_LIFECYCLE_STATES.map((state, i) => (
            <li key={state.state} className="border-t border-ink-250 pt-3">
              <div className="font-mono text-[11px] text-ink-500 tracking-caps uppercase mb-1">
                state {String(i + 1).padStart(2, "0")} · {state.state}
              </div>
              <div className="font-serif text-[18px] text-ink-900 font-medium mb-1">
                {state.label}
              </div>
              <div className="font-serif text-[15px] text-ink-700 leading-relaxed">
                {state.definition}
              </div>
            </li>
          ))}
        </ol>
      </EditorialSection>

      {/* 07 — tier ranges */}
      <EditorialSection
        index="07"
        title={<>Call-score <em className="italic text-accent">bands</em>.</>}
        meta={<>S / A / B / C bands</>}
      >
        <table className="w-full font-mono text-[13px]">
          <thead>
            <tr className="border-b border-ink-250">
              <th className="text-left text-[11px] text-ink-500 tracking-caps uppercase font-normal py-2 w-16">
                Tier
              </th>
              <th className="text-left text-[11px] text-ink-500 tracking-caps uppercase font-normal py-2 w-32">
                Score range
              </th>
              <th className="text-left text-[11px] text-ink-500 tracking-caps uppercase font-normal py-2 pl-6">
                Reading
              </th>
            </tr>
          </thead>
          <tbody>
            {TIERS.map((t) => (
              <tr key={t.tier} className="border-b border-ink-200">
                <td className="py-3">
                  <Chip tone={tierTone(t.tier)}>{t.tier}</Chip>
                </td>
                <td className="py-3 tabular-nums text-ink-700">{t.range}</td>
                <td className="py-3 pl-6 font-serif text-[15px] text-ink-700 leading-relaxed">
                  {t.read}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EditorialSection>

      {/* 08 — methodology v2 */}
      <EditorialSection
        index="08"
        title={<>Methodology <em className="italic text-accent">v2</em>.</>}
        meta={<>approval-gated</>}
      >
        <div className="font-serif text-[16px] text-ink-700 leading-relaxed max-w-[760px] space-y-4">
          <p>
            Current official rankings are intentionally conservative. The next formula should
            use a sample-adjusted Creator Rank Score rather than a noisy raw average, but that
            change requires explicit methodology approval and an approved stats recompute.
          </p>
          <p className="font-mono text-[13px] text-ink-600 not-italic">
            {RECOMMENDED_CREATOR_RANK_SCORE_V2.sampleAdjustedFormula}
          </p>
          <ul className="font-mono text-[12px] text-ink-600 leading-relaxed space-y-1">
            {RECOMMENDED_CREATOR_RANK_SCORE_V2.components.map((component) => (
              <li key={component.label}>
                {component.weight}% · {component.label}
              </li>
            ))}
          </ul>
        </div>
      </EditorialSection>

      {/* 09 — audit me */}
      <EditorialSection
        index="09"
        title={<><em className="italic text-accent">Audit</em> me.</>}
        meta={<>Reproducible · source available for audit on request</>}
      >
        <div className="font-serif text-[17px] text-ink-700 leading-relaxed max-w-[680px] space-y-4">
          <p>
            The recompute pipeline is designed to be reproducible. Every public
            score should trace to a transcript line, a Binance candle range, a
            lifecycle status, and a deterministic formula. There is no
            hand-tuned weighting per creator.
          </p>
          <p>
            Disagree with a number? Request the audit trail, rerun the score
            against the documented formula, and tell us where it diverges.
          </p>
          <AuditLinks />
        </div>
      </EditorialSection>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function AuditLinks(): ReactElement {
  return (
    <p className="font-mono text-[13px] text-ink-600 not-italic">
      <span className="text-ink-500">Source repository currently private</span>
      <span className="text-ink-600" aria-hidden="true"> · </span>
      <a
        href="mailto:dave.shipsbuilds@proton.me?subject=CryptoTubers%20Ranked%20-%20score%20dispute"
        className="text-accent underline decoration-accent/60 underline-offset-4 hover:decoration-accent"
      >
        flag a wrong score
      </a>
    </p>
  );
}

type ChipTone = "accent" | "pos" | "new" | "warn" | "neg" | "neutral";

function tierTone(tier: string): ChipTone {
  switch (tier) {
    case "S":
      return "accent";
    case "A":
      return "pos";
    case "B":
      return "new";
    case "C":
      return "neg";
    default:
      return "neutral";
  }
}
