import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout";
import { MetricCard } from "@/components/composites";
import { Badge } from "@/components/primitives";
import { EXTRACTION_CONFIDENCE_THRESHOLD, SCORE_WEIGHTS } from "@/lib/public-methodology";
import { TRACKED_CREATOR_COUNT } from "@/lib/tracked-creators";

export const metadata: Metadata = {
  title: "Methodology | CryptoTubers Ranked",
  description: "How CryptoTubers Ranked extracts, validates, and scores public crypto creator calls.",
  alternates: { canonical: "/methodology" },
};

const COMPONENTS = [
  ["Direction", SCORE_WEIGHTS.direction, "Did the asset move in the called direction after 30 days?"],
  ["Alpha", SCORE_WEIGHTS.alpha, "How much did the asset outperform BTC over the same 30 day window?"],
  ["Specificity", SCORE_WEIGHTS.specificity, "Did the call include entry, target, stop, and timeframe detail?"],
  ["Regime", SCORE_WEIGHTS.regime, "Was the call made in a harder market regime?"],
  ["Target", SCORE_WEIGHTS.target, "Did price hit the declared target within the public horizon?"],
] as const;

const STEPS = [
  ["Collect", "Track creator videos and transcripts from the approved public creator set."],
  ["Extract", "Identify coin, direction, dates, price levels, confidence, and quote evidence."],
  ["Validate", "Reject low-confidence or malformed extractions before public scoring."],
  ["Score", "Wait for horizons to mature, compare against BTC, then publish component scores."],
] as const;

export default function MethodologyPage() {
  const totalWeight = COMPONENTS.reduce((sum, [, weight]) => sum + weight, 0);

  return (
    <PageShell>
      <section className="method-hero">
        <div>
          <p className="shell-kicker">Methodology</p>
          <h1>One public formula. Evidence first. No hidden popularity boost.</h1>
          <p className="shell-lede">Every public Alpha Score is built from call-level extraction, validation, price outcomes, and BTC-relative alpha. Subscriber count does not score a creator.</p>
        </div>
        <Badge tone="accent">public formula</Badge>
      </section>

      <section className="method-metrics" aria-label="Methodology summary">
        <MetricCard kicker="Creators" label="Tracked set" value={String(TRACKED_CREATOR_COUNT)} detail="Approved public creator universe." />
        <MetricCard kicker="Gate" label="Extraction confidence" value={`${Math.round(EXTRACTION_CONFIDENCE_THRESHOLD * 100)}%`} detail="Below this threshold, calls are public but unscored." />
        <MetricCard kicker="Score" label="Total points" value={String(totalWeight)} detail="Component weights sum to the public Alpha Score." />
      </section>

      <section className="method-flow" aria-label="Scoring pipeline">
        {STEPS.map(([label, copy], index) => (
          <article key={label}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h2>{label}</h2>
            <p>{copy}</p>
          </article>
        ))}
      </section>

      <section className="method-components" aria-label="Score components">
        <div className="method-section-head"><p className="shell-kicker">Alpha Score components</p><Link href="/calls">inspect calls</Link></div>
        {COMPONENTS.map(([label, weight, copy]) => (
          <article key={label}>
            <div><strong>{weight}</strong><span>pts</span></div>
            <h2>{label}</h2>
            <p>{copy}</p>
          </article>
        ))}
      </section>

      <section className="method-disclosures">
        <article><h2>What counts</h2><p>Specific public calls with an asset, direction, date, and enough extraction confidence to survive validation.</p></article>
        <article><h2>What does not</h2><p>Vibes, subscriber count, sponsorships, generic market commentary, or calls that have not reached a scoring horizon.</p></article>
        <article><h2>Why BTC-relative</h2><p>Crypto beta can make everyone look correct in a rally. Alpha asks whether a creator beat the benchmark.</p></article>
      </section>
    </PageShell>
  );
}
