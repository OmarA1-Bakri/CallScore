import Link from "next/link";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { EditorialSection, MetaStrip, Chip } from "@/components/primitives";
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
  { name: "Score", detail: "5 components → 0–100" },
  { name: "Rank", detail: "Avg Alpha across scored calls" },
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
    how: "Bullish call + price up at 30d (or vice versa).",
  },
  {
    label: "Alpha over BTC",
    max: SCORE_WEIGHTS.alpha,
    how: `Each 1% excess return = ${(SCORE_WEIGHTS.alpha / 10).toFixed(1)}pt, capped at ${SCORE_WEIGHTS.alpha}.`,
  },
  {
    label: "Specificity",
    max: SCORE_WEIGHTS.specificity,
    how: "Entry, target, stop-loss, timeframe (¼ each).",
  },
  {
    label: "Regime difficulty",
    max: SCORE_WEIGHTS.regime,
    how: "Bullish in bear / bearish in bull = max.",
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

// Alpha-Score thresholds per current `compute-scores` output. S/A/B/C
// banding is the public dev-pack contract for tier badges.
const TIERS: readonly TierRow[] = [
  { tier: "S", range: "70 – 100", read: "Elite — beats BTC consistently with high specificity." },
  { tier: "A", range: "55 – 69",  read: "Strong — directional edge, partial specificity." },
  { tier: "B", range: "40 – 54",  read: "Mixed — directional hit but thin alpha." },
  { tier: "C", range: "0 – 39",   read: "Underperforming — frequent misses or low-conviction." },
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
        className="inline-flex items-center gap-1.5 font-mono text-[10px] text-ink-500 hover:text-ink-700 tracking-caps uppercase mt-8 mb-8"
      >
        <span aria-hidden="true">←</span> Leaderboard
      </Link>

      {/* HERO */}
      <section className="pb-12 border-b border-ink-250">
        <div className="font-mono text-[10px] text-ink-500 tracking-caps uppercase mb-4">
          Methodology · Public
        </div>
        <h1 className="font-serif text-[34px] tab:text-[44px] desk:text-[52px] text-ink-900 font-medium tracking-tight leading-[1.05] text-balance max-w-[880px] mb-5">
          How we score.{" "}
          <em className="italic font-normal text-accent">In public.</em>
        </h1>
        <p className="font-serif text-[19px] text-ink-700 leading-relaxed max-w-[760px]">
          One formula, five components, capped 0–100. Every score reproducible
          from the published pipeline.{" "}
          <em className="italic text-accent">If a number looks wrong, audit me.</em>
        </p>
        <MetaStrip
          cells={[
            { k: "components", v: "5" },
            { k: "candles", v: "18.7M" },
            { k: "creators tracked", v: TRACKED_CREATOR_COUNT },
            {
              k: "extraction floor",
              v: `${Math.round(EXTRACTION_CONFIDENCE_THRESHOLD * 100)}%`,
            },
          ]}
        />
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
              <div className="font-mono text-[10px] text-ink-500 tracking-caps uppercase mb-1">
                step {String(i + 1).padStart(2, "0")}
              </div>
              <div className="font-serif text-[18px] text-ink-900 font-medium leading-tight mb-1">
                {step.name}
              </div>
              <div className="font-mono text-[11px] text-ink-600 leading-relaxed">
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
        <table className="w-full font-mono text-[12px]">
          <thead>
            <tr className="border-b border-ink-250">
              <th className="text-left text-[10px] text-ink-500 tracking-caps uppercase font-normal py-2">
                Component
              </th>
              <th className="text-right text-[10px] text-ink-500 tracking-caps uppercase font-normal py-2 w-20">
                Max
              </th>
              <th className="text-left text-[10px] text-ink-500 tracking-caps uppercase font-normal py-2 pl-6">
                How it&apos;s earned
              </th>
            </tr>
          </thead>
          <tbody>
            {SCORE_ROWS.map((c) => (
              <tr key={c.label} className="border-b border-ink-200">
                <td className="py-3 font-serif text-[14px] text-ink-900">{c.label}</td>
                <td className="py-3 text-right tabular-nums text-ink-700">{c.max}</td>
                <td className="py-3 pl-6 text-ink-600 leading-relaxed">{c.how}</td>
              </tr>
            ))}
            <tr>
              <td className="py-3 font-serif text-[14px] text-ink-900 font-medium">
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
        <p className="font-serif text-[15px] text-ink-700 leading-relaxed mb-5 max-w-[680px]">
          Calls on these tickers are matched against minute-grained Binance
          candles. Anything outside this universe is logged but not scored.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {TRACKED_COINS.map((coin) => (
            <Chip key={coin}>{coin}</Chip>
          ))}
        </div>
      </EditorialSection>

      {/* 04 — tier ranges */}
      <EditorialSection
        index="04"
        title={<>Tier <em className="italic text-accent">ranges</em>.</>}
        meta={<>S / A / B / C bands</>}
      >
        <table className="w-full font-mono text-[12px]">
          <thead>
            <tr className="border-b border-ink-250">
              <th className="text-left text-[10px] text-ink-500 tracking-caps uppercase font-normal py-2 w-16">
                Tier
              </th>
              <th className="text-left text-[10px] text-ink-500 tracking-caps uppercase font-normal py-2 w-32">
                Alpha range
              </th>
              <th className="text-left text-[10px] text-ink-500 tracking-caps uppercase font-normal py-2 pl-6">
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
                <td className="py-3 pl-6 font-serif text-[14px] text-ink-700 leading-relaxed">
                  {t.read}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EditorialSection>

      {/* 05 — audit me */}
      <EditorialSection
        index="05"
        title={<><em className="italic text-accent">Audit</em> me.</>}
        meta={<>Reproducible · open source</>}
      >
        <div className="font-serif text-[16px] text-ink-700 leading-relaxed max-w-[680px] space-y-4">
          <p>
            The recompute pipeline is reproducible. Every score traces to a
            transcript line, a Binance candle range, and a deterministic
            formula. There is no hand-tuned weighting per creator.
          </p>
          <p>
            Disagree with a number? The source is published; clone it, rerun
            the score, and tell us where it diverges.
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
    <p className="font-mono text-[12px] text-ink-600 not-italic">
      <Link
        href="https://github.com/dave-builder/crypto-tuber-ranked"
        className="text-accent hover:underline underline-offset-4"
      >
        View the source
      </Link>
      <span className="text-ink-400" aria-hidden="true"> · </span>
      <a
        href="mailto:dave.shipsbuilds@proton.me?subject=CryptoTubers%20Ranked%20-%20score%20dispute"
        className="text-accent hover:underline underline-offset-4"
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

