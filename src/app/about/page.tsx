import Link from "next/link";
import type { Metadata } from "next";
import type { CSSProperties, ReactElement } from "react";
import BrandWordmark from "./BrandWordmark";

/* ------------------------------------------------------------------ */
/*  Metadata                                                           */
/* ------------------------------------------------------------------ */

export const metadata: Metadata = {
  title: "about — binary baron · crypto-tubers ranked",
  description:
    "Why I track every crypto YouTuber's call against real prices. No opinions, no sponsorships, no deletion. Public methodology, auditable data, founder-accountable.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "about — binary baron · crypto-tubers ranked",
    description:
      "Why I track every crypto YouTuber's call against real prices. No opinions, no sponsorships, no deletion. Public methodology, auditable data, founder-accountable.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "about — binary baron · crypto-tubers ranked",
    description:
      "Why I track every crypto YouTuber's call against real prices. No opinions, no sponsorships, no deletion. Public methodology, auditable data, founder-accountable.",
  },
};

/* ------------------------------------------------------------------ */
/*  Design tokens (inline, scoped to this page)                        */
/* ------------------------------------------------------------------ */

const TERMINAL_BG = "#0B0F0E";
const TERMINAL_SURFACE = "#121815";
const TERMINAL_TEXT = "#C8D3CA";
const TERMINAL_MUTED = "#5B6B63";
const TERMINAL_ACCENT = "#3FD67A";
const TERMINAL_RULE = "rgba(200, 211, 202, 0.08)";
const TERMINAL_RULE_STRONG = "rgba(200, 211, 202, 0.14)";

const pageStyle: CSSProperties = {
  background: TERMINAL_BG,
  color: TERMINAL_TEXT,
  fontFamily:
    "var(--font-jetbrains-mono), 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontFeatureSettings: '"ss01", "zero"',
  minHeight: "100vh",
};

const shellStyle: CSSProperties = {
  maxWidth: "980px",
  margin: "0 auto",
  padding: "0 24px",
};

const topbarStyle: CSSProperties = {
  borderBottom: `1px solid ${TERMINAL_RULE}`,
  background: "#0F1513",
};

const topbarInnerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "16px",
  padding: "14px 0",
  fontSize: "12px",
  letterSpacing: "0.02em",
};

const sectionLabelStyle: CSSProperties = {
  color: TERMINAL_MUTED,
  fontSize: "12px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  margin: "0 0 6px",
  fontWeight: 500,
};

const sectionTitleStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: "22px",
  letterSpacing: "-0.01em",
  color: TERMINAL_TEXT,
  margin: "0 0 28px",
};

const sectionStyle: CSSProperties = {
  marginBottom: "72px",
};

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

interface PremiseLine {
  readonly num: string;
  readonly text: string;
  readonly source: string;
}

const PREMISE_LINES: readonly PremiseLine[] = [
  {
    num: "01",
    text: "76% of influencer-endorsed tokens fail to deliver.",
    source: "[Arkham · Mar 2025]",
  },
  {
    num: "02",
    text: "Top crypto YouTubers are directionally correct ~22% of the time.",
    source: "[Finance Research Letters · 2024]",
  },
  {
    num: "03",
    text: "Influencer-tweeted tokens returned -19% over 3 months.",
    source: "[HBS · Pacelli]",
  },
  {
    num: "04",
    text: "160+ influencers on paid shill lists. <5 disclose ads.",
    source: "[ZachXBT audit]",
  },
] as const;

interface CreedItem {
  readonly text: string;
}

const CREED: readonly CreedItem[] = [
  { text: "I will not charge creators to appear in rankings." },
  { text: "I will not take sponsorships from tracked creators." },
  {
    text: "I will not re-score silently. Every methodology change goes in a public changelog.",
  },
  { text: "I will not hide my own mistakes." },
] as const;

interface DefenseItem {
  readonly num: string;
  readonly text: string;
}

const DEFENSE: readonly DefenseItem[] = [
  { num: "01", text: "Deterministic scoring — no opinion." },
  { num: "02", text: "Minimum-N threshold — anti-cherry-pick." },
  { num: "03", text: "Public methodology — exact formula, linked." },
  { num: "04", text: "Benchmark comparison — every score vs BTC." },
  {
    num: "05",
    text: "Accountability origin — why this exists, who I am.",
  },
] as const;

interface IdentityRow {
  readonly key: string;
  readonly value: string;
  readonly href?: string;
}

const IDENTITY_ROWS: readonly IdentityRow[] = [
  { key: "handle", value: "binary-baron" },
  {
    key: "project",
    value: "ai laboratory — independent tooling for evidence-based decisions",
  },
  { key: "contact", value: "/feedback", href: "/feedback" },
  { key: "verify", value: "/methodology", href: "/methodology" },
] as const;

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AboutPage(): ReactElement {
  return (
    <div style={pageStyle}>
      {/* ============== TOP STATUS STRIP ============== */}
      {/* Uses a plain <div>, not <header>/role="banner", because the
          single authoritative banner landmark lives in layout.tsx. */}
      <div style={topbarStyle}>
        <div style={{ ...shellStyle, ...topbarInnerStyle }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              flexWrap: "wrap",
            }}
          >
            <span style={{ display: "inline-flex", gap: "6px" }}>
              <span
                aria-hidden="true"
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: TERMINAL_RULE_STRONG,
                }}
              />
              <span
                aria-hidden="true"
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: TERMINAL_RULE_STRONG,
                }}
              />
              <span
                aria-label="live"
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: TERMINAL_ACCENT,
                  boxShadow: "0 0 6px rgba(63,214,122,0.5)",
                }}
              />
            </span>
            <div style={{ color: TERMINAL_TEXT }}>
              <span>CRYPTO-TUBER-RANKED</span>
              <span style={{ color: TERMINAL_MUTED, margin: "0 8px" }}>
                ::
              </span>
              <span style={{ color: TERMINAL_ACCENT }}>about</span>
              <span style={{ color: TERMINAL_MUTED, margin: "0 8px" }}>
                ::
              </span>
              <span style={{ color: TERMINAL_MUTED }}>
                maintained by binary-baron
              </span>
            </div>
          </div>
          <div style={{ color: TERMINAL_MUTED, fontSize: "12px" }}>
            last-updated{" "}
            <b style={{ color: TERMINAL_TEXT, fontWeight: 500 }}>2026-04-19</b>
          </div>
        </div>
      </div>

      {/* Page content wrapper — NOT a <main>; the layout owns the single
          <main> landmark. Using <div> avoids nested-landmark a11y issues. */}
      <div>
        <div style={shellStyle}>
          {/* ============== HERO ============== */}
          <section
            aria-labelledby="hero-title"
            style={{
              padding: "96px 0 80px",
              position: "relative",
              minHeight: "70vh",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <p
              style={{
                color: TERMINAL_MUTED,
                fontSize: "12px",
                letterSpacing: "0.04em",
                margin: "0 0 40px",
              }}
            >
              {"// a note from binary baron · apr 2026"}
            </p>
            <h1
              id="hero-title"
              style={{
                fontWeight: 700,
                fontSize: "clamp(48px, 9vw, 112px)",
                lineHeight: 1.05,
                letterSpacing: "-0.03em",
                margin: 0,
                color: TERMINAL_TEXT,
                maxWidth: "18ch",
              }}
            >
              I got tired of YouTubers being wrong, so I built a ledger.
            </h1>
            <p
              style={{
                color: TERMINAL_MUTED,
                fontSize: "12px",
                letterSpacing: "0.04em",
                margin: "80px 0 0",
                alignSelf: "flex-end",
              }}
            >
              ↓ keep reading
            </p>
          </section>

          {/* ============== PREMISE ============== */}
          <section aria-labelledby="premise-title" style={sectionStyle}>
            <p style={sectionLabelStyle}>01 / premise</p>
            <h2 id="premise-title" style={sectionTitleStyle}>
              <span style={{ color: TERMINAL_MUTED, marginRight: "10px" }}>
                {"//"}
              </span>
              the premise — sourced
            </h2>
            <div
              style={{
                fontSize: "13.5px",
                lineHeight: 1.9,
                padding: "4px 0",
              }}
            >
              <div
                style={{
                  color: TERMINAL_TEXT,
                  marginBottom: "18px",
                }}
              >
                <span style={{ color: TERMINAL_ACCENT, marginRight: "8px" }}>
                  $
                </span>
                cat premise.md
              </div>
              {PREMISE_LINES.map((line) => (
                <div
                  key={line.num}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "3ch 1fr auto",
                    columnGap: "14px",
                    alignItems: "baseline",
                    padding: "2px 0",
                  }}
                >
                  <span style={{ color: TERMINAL_MUTED }}>{line.num}</span>
                  <span style={{ color: TERMINAL_TEXT }}>
                    <span style={{ color: TERMINAL_MUTED, marginRight: "8px" }}>
                      ·
                    </span>
                    {line.text}
                  </span>
                  <span style={{ color: TERMINAL_MUTED, fontSize: "12px" }}>
                    {line.source}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* ============== WHAT THIS TRACKER DOES ============== */}
          <section aria-labelledby="tracker-title" style={sectionStyle}>
            <p style={sectionLabelStyle}>02 / scope</p>
            <h2 id="tracker-title" style={sectionTitleStyle}>
              <span style={{ color: TERMINAL_MUTED, marginRight: "10px" }}>
                {"//"}
              </span>
              what this tracker does
            </h2>
            <div
              style={{
                display: "grid",
                gap: "20px",
                maxWidth: "72ch",
                fontSize: "14.5px",
                lineHeight: 1.7,
                color: TERMINAL_TEXT,
              }}
            >
              <p style={{ margin: 0 }}>
                I score every altcoin call from 20 crypto YouTubers against
                Binance candle data — 18.7 million candles across 18 tracked
                coins. A call lands in the ledger the day the video drops; the
                score resolves 30 days later when the price has had time to
                move.
              </p>
              <p style={{ margin: 0 }}>
                The Alpha Score has five components — Direction (40), Alpha
                over BTC (25), Specificity (15), Regime Difficulty (10), Target
                Hit (10). The weights, the formula, the thresholds are all
                documented at{" "}
                <Link
                  href="/methodology"
                  style={{
                    color: TERMINAL_ACCENT,
                    textDecoration: "underline",
                    textUnderlineOffset: "3px",
                  }}
                >
                  /methodology
                </Link>
                . Nothing is hidden. Nothing is adjusted by hand.
              </p>
              <p style={{ margin: 0 }}>
                Here is the gap I am filling. Kaito, LunarCrush, DexCheck — all
                of them score social mindshare. They measure who is loud, not
                who is right. YouTube long-form, where the actual calls get
                made, is untapped. This tracker scores the calls themselves
                against price, not the creator&apos;s follower count.
              </p>
            </div>
          </section>

          {/* ============== CREED ============== */}
          <section aria-labelledby="creed-title" style={sectionStyle}>
            <p style={sectionLabelStyle}>03 / creed</p>
            <h2 id="creed-title" style={sectionTitleStyle}>
              <span style={{ color: TERMINAL_MUTED, marginRight: "10px" }}>
                {"//"}
              </span>
              what I will not do
            </h2>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "grid",
                gap: "12px",
              }}
            >
              {CREED.map((item) => (
                <li
                  key={item.text}
                  style={{
                    color: TERMINAL_TEXT,
                    fontSize: "14.5px",
                    lineHeight: 1.6,
                    display: "flex",
                    gap: "14px",
                  }}
                >
                  <span
                    style={{
                      color: TERMINAL_ACCENT,
                      flex: "0 0 auto",
                      width: "1ch",
                      fontWeight: 700,
                    }}
                  >
                    ·
                  </span>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* ============== IDENTITY ============== */}
          <section aria-labelledby="identity-title" style={sectionStyle}>
            <p style={sectionLabelStyle}>04 / identity</p>
            <h2 id="identity-title" style={sectionTitleStyle}>
              <span style={{ color: TERMINAL_MUTED, marginRight: "10px" }}>
                {"//"}
              </span>
              who is binary baron
            </h2>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "28px",
                flexWrap: "wrap",
                marginBottom: "32px",
              }}
            >
              <BrandWordmark
                accent={TERMINAL_ACCENT}
                surface={TERMINAL_SURFACE}
                rule={TERMINAL_RULE_STRONG}
              />
            </div>

            <div
              style={{
                fontSize: "14px",
                lineHeight: 2,
                maxWidth: "64ch",
              }}
            >
              {IDENTITY_ROWS.map((row) => (
                <div
                  key={row.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "12ch 1fr",
                    columnGap: "12px",
                    alignItems: "baseline",
                  }}
                >
                  <span style={{ color: TERMINAL_MUTED }}>{row.key}:</span>
                  {row.href ? (
                    <Link
                      href={row.href}
                      style={{
                        color: TERMINAL_ACCENT,
                        textDecoration: "underline",
                        textUnderlineOffset: "3px",
                      }}
                    >
                      {row.value}
                    </Link>
                  ) : (
                    <span style={{ color: TERMINAL_TEXT }}>{row.value}</span>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ============== CREDIBILITY DEFENSE ============== */}
          <section aria-labelledby="defense-title" style={sectionStyle}>
            <p style={sectionLabelStyle}>05 / defense</p>
            <h2 id="defense-title" style={sectionTitleStyle}>
              <span style={{ color: TERMINAL_MUTED, marginRight: "10px" }}>
                {"//"}
              </span>
              the five-move credibility defense
            </h2>
            <div
              style={{
                fontSize: "13.5px",
                lineHeight: 1.9,
                padding: "4px 0",
                color: TERMINAL_TEXT,
              }}
            >
              {DEFENSE.map((item) => (
                <div
                  key={item.num}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "3ch 1fr",
                    columnGap: "14px",
                    alignItems: "baseline",
                    padding: "2px 0",
                  }}
                >
                  <span style={{ color: TERMINAL_MUTED }}>{item.num}</span>
                  <span>
                    <span style={{ color: TERMINAL_MUTED, marginRight: "8px" }}>
                      ·
                    </span>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* ============== CTA FOOTER ============== */}
          <section
            aria-labelledby="cta-line"
            style={{
              margin: "80px 0 56px",
              padding: "28px 0 0",
              borderTop: `1px solid ${TERMINAL_RULE}`,
            }}
          >
            <p
              id="cta-line"
              style={{
                fontSize: "17px",
                color: TERMINAL_TEXT,
                fontWeight: 500,
                letterSpacing: "-0.005em",
                display: "flex",
                alignItems: "baseline",
                gap: "10px",
                flexWrap: "wrap",
                marginBottom: "18px",
              }}
            >
              <span style={{ color: TERMINAL_ACCENT }}>&gt;</span>
              <span>ready to see who actually beats the market?</span>
              <span style={{ color: TERMINAL_MUTED, fontWeight: 400 }}>
                [Y/n]
              </span>
              <span
                aria-hidden="true"
                className="bb-caret"
                style={{
                  display: "inline-block",
                  width: "10px",
                  height: "18px",
                  background: TERMINAL_ACCENT,
                  transform: "translateY(3px)",
                }}
              />
            </p>
            <div
              style={{
                display: "flex",
                gap: "12px",
                flexWrap: "wrap",
                paddingLeft: "22px",
              }}
            >
              <Link
                href="/"
                style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  padding: "10px 18px",
                  border: `1px solid ${TERMINAL_ACCENT}`,
                  color: TERMINAL_ACCENT,
                  letterSpacing: "0.02em",
                  textDecoration: "none",
                }}
              >
                Y · view leaderboard
              </Link>
              <Link
                href="/methodology"
                style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  padding: "10px 18px",
                  border: `1px solid ${TERMINAL_RULE_STRONG}`,
                  color: TERMINAL_TEXT,
                  letterSpacing: "0.02em",
                  textDecoration: "none",
                }}
              >
                n · read methodology
              </Link>
            </div>
          </section>
        </div>
      </div>

      {/* Scoped CSS for the blinking caret + reduced-motion override */}
      <style>{`
        @keyframes bb-blink {
          0%, 50% { opacity: 1; }
          50.01%, 100% { opacity: 0; }
        }
        .bb-caret {
          animation: bb-blink 1.05s steps(1, end) infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .bb-caret { animation: none; opacity: 1; }
        }
      `}</style>
    </div>
  );
}
