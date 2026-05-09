import Link from "next/link";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { EditorialSection, MetaStrip } from "@/components/primitives";

const TITLE = "About — CallScore";
const DESCRIPTION =
  "Why CallScore tracks market calls against real prices. No opinions, no sponsorships, no deletion.";
const LINK_CLASS = "text-accent underline decoration-accent/60 underline-offset-4 hover:decoration-accent";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/about" },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

interface PremiseLine {
  readonly claim: string;
  readonly source: string;
}

const PREMISE: readonly PremiseLine[] = [
  { claim: "76% of influencer-endorsed tokens fail to deliver.", source: "Arkham · Mar 2025" },
  { claim: "Top crypto YouTubers are directionally correct ~22% of the time.", source: "Finance Research Letters · 2024" },
  { claim: "Influencer-tweeted tokens returned −19% over 3 months.", source: "HBS · Pacelli" },
  { claim: "We score who admits when they're wrong. No other tracker does.", source: "self-correction index" },
];

export default function AboutPage(): ReactElement {
  return (
    <div className="max-w-page mx-auto px-4 tab:px-6 desk:px-8">
      <section className="pb-12 border-b border-ink-250">
        <h1 className="font-serif text-[35px] tab:text-[45px] desk:text-[53px] text-ink-900 font-medium tracking-tight leading-[1.05] text-balance max-w-[880px] mb-5">
          Why CallScore exists.{" "}
          <em className="italic font-normal text-accent">Market calls, measured.</em>
        </h1>
        <p className="font-serif text-[20px] text-ink-700 leading-relaxed max-w-[760px]">
          No opinions. No sponsorships. Public methodology.
          <em className="italic text-accent"> Founder-accountable.</em>
        </p>
        <MetaStrip
          cells={[
            { k: "started", v: "2026" },
            { k: "tracked", v: "20" },
            { k: "scored against", v: "18.7M candles" },
            {
              k: "audit me",
              v: (
                <Link
                  href="mailto:dave.shipsbuilds@proton.me"
                  className={LINK_CLASS}
                >
                  contact
                </Link>
              ),
            },
          ]}
        />
      </section>

      <EditorialSection
        index="01"
        title={
          <>
            The <em className="italic text-accent">premise</em>, sourced.
          </>
        }
      >
        <ul className="border-y border-ink-150">
          {PREMISE.map((p, i) => (
            <li
              key={p.source}
              className={`flex flex-col tab:flex-row tab:items-baseline tab:justify-between gap-1 px-4 py-3 ${
                i > 0 ? "border-t border-ink-150" : ""
              }`}
            >
              <span className="font-serif text-[15px] text-ink-700">{p.claim}</span>
              <span className="font-mono text-[11px] text-ink-500 tracking-wide whitespace-nowrap">
                [{p.source}]
              </span>
            </li>
          ))}
        </ul>
      </EditorialSection>

      <EditorialSection
        index="02"
        title={
          <>
            What this <em className="italic text-accent">is</em>.
          </>
        }
      >
        <Prose>
          <p>
            <b>An accuracy tracker.</b> Every eligible altcoin call from 20 crypto
            YouTubers, scored against 18.7M Binance candles. Five-component Alpha Score,
            published methodology, recompute pipeline open to inspection.
          </p>
          <p>
            <b>An honesty index.</b> Self-correction signal: who explicitly admits when a
            call goes wrong, scored separately from raw accuracy. Most trackers reward
            survivorship; we don&apos;t.
          </p>
          <p>
            <b>A consensus monitor.</b> When ≥3 ranked creators converge on the same call
            within a window, we surface the signal. Diverse-by-construction, not echo-chamber.
          </p>
        </Prose>
      </EditorialSection>

      <EditorialSection
        index="03"
        title={
          <>
            What this <em className="italic text-accent">isn&apos;t</em>.
          </>
        }
      >
        <Prose>
          <p>
            <b>Not financial advice.</b> Past performance doesn&apos;t predict future returns.
            Crypto is volatile and you can lose everything. Always DYOR.
          </p>
          <p>
            <b>Not an endorsement.</b> Ranking #1 doesn&apos;t mean a creator is right about
            the next call. The score is a measurement, not a recommendation.
          </p>
          <p>
            <b>Not picking sides.</b> Bullish and bearish calls scored on the same axes.
            Self-correction credit awarded for honest reversals regardless of direction.
          </p>
        </Prose>
      </EditorialSection>

      <EditorialSection
        index="04"
        title={
          <>
            Founder <em className="italic text-accent">accountability</em>.
          </>
        }
      >
        <Prose>
          <p>
            Built by <b>Omar Albakri</b>. The code is auditable, the methodology is public,
            and the data pipeline is reproducible. If a creator&apos;s score looks wrong, send a
            recompute request and we&apos;ll trace it from transcript to candle.
          </p>
          <p>
            <Link
              href="/methodology"
              className={LINK_CLASS}
            >
              Read the full methodology
            </Link>
            {" · "}
            <a
              href="mailto:dave.shipsbuilds@proton.me"
              className={LINK_CLASS}
            >
              contact
            </a>
          </p>
        </Prose>
      </EditorialSection>
    </div>
  );
}

function Prose({ children }: { readonly children: ReactElement | ReactElement[] }): ReactElement {
  return (
    <div className="font-serif text-[17px] text-ink-700 leading-relaxed space-y-4 max-w-[680px]">
      {children}
    </div>
  );
}
