import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "CallScore — Track calls. Score outcomes. Find alpha.",
  description:
    "CallScore ranks crypto creators by historical, evidence-backed call performance.",
};

export default async function ExperiencePage({
  params,
}: {
  params: Promise<{ experienceId: string }>;
}): Promise<ReactElement> {
  await params;

  return (
    <div className="min-h-screen bg-ink-0">
      {/* HERO */}
      <section className="relative min-h-[calc(100vh-80px)] pb-8 desk:pb-12 overflow-hidden">
        <div
          className="absolute inset-x-[-32px] bottom-[-220px] h-[420px] opacity-40 pointer-events-none"
          style={{
            background:
              "repeating-radial-gradient(ellipse at center, rgba(201,162,75,0.28) 0 1px, transparent 1px 22px)",
            transform: "perspective(720px) rotateX(68deg)",
            transformOrigin: "50% 100%",
          }}
          aria-hidden="true"
        />
        <div className="relative max-w-page mx-auto px-4 tab:px-8 desk:px-10 pt-14 tab:pt-20 desk:pt-16">
          <div className="max-w-[760px] mx-auto text-center">
            <p
              className="inline-flex items-center gap-2 border border-accent/30 bg-accent/5 px-3 py-2 font-mono text-[12px] text-accent tracking-caps uppercase mb-6"
              style={{ borderRadius: 2 }}
            >
              <span className="h-1.5 w-1.5 bg-accent" style={{ borderRadius: 2 }} aria-hidden="true" />
              The standard for crypto calls
            </p>
            <h1 className="font-serif text-[48px] tab:text-[72px] desk:text-[96px] text-ink-900 font-normal tracking-tight leading-[0.88] text-balance mb-4">
              Market calls,{" "}
              <em className="italic font-normal text-accent">measured.</em>
            </h1>
            <h2 className="font-sans text-[16px] tab:text-[18px] text-ink-600 font-medium leading-relaxed max-w-[620px] mx-auto mb-8">
              The crypto market calls tracker that scores alpha against real price data.
            </h2>
            <p className="font-serif text-[21px] tab:text-[24px] text-ink-700 leading-relaxed max-w-[620px] mx-auto mb-8">
              Track crypto creators&apos; market calls against real price data.
              Score every eligible call. Rank signal, not noise.
            </p>
            <div className="flex flex-col tab:flex-row gap-3 justify-center mb-7">
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-3 bg-accent hover:bg-accent-dim text-ink-0 font-mono text-[13px] tracking-caps uppercase px-7 py-4 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
                style={{ borderRadius: 2 }}
              >
                View leaderboard
                <span aria-hidden="true">→</span>
              </Link>
              <Link
                href="/pricing"
                className="inline-flex justify-center border border-ink-300 text-ink-900 hover:border-accent/60 hover:text-accent font-mono text-[13px] tracking-caps uppercase px-7 py-4 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
                style={{ borderRadius: 2 }}
              >
                Explore pricing
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-ink-600 font-sans text-[16px] mb-4">
              <span className="inline-flex items-center gap-2">
                <span className="font-mono text-[11px] text-accent" aria-hidden="true">✓</span>
                Transparent
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="font-mono text-[11px] text-accent" aria-hidden="true">✓</span>
                Evidence-based
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="font-mono text-[11px] text-accent" aria-hidden="true">✓</span>
                Unbiased
              </span>
            </div>
            <p className="max-w-[560px] mx-auto font-mono text-[11px] uppercase tracking-caps text-ink-500">
              Every eligible score ties back to source calls, timestamped evidence,
              and the published price-window methodology.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
