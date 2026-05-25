import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "CallScore",
  description: "Track crypto creator calls against real price data.",
};

export default async function ExperiencePage({
  params,
}: {
  params: Promise<{ experienceId: string }>;
}): Promise<ReactElement> {
  const { experienceId } = await params;
  
  return (
    <div className="max-w-page mx-auto px-4 py-16 min-h-screen">
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="font-serif text-[48px] tab:text-[64px] text-ink-900 font-normal tracking-tight leading-[0.92] mb-6">
          Market calls, <em className="italic text-accent">measured.</em>
        </h1>
        <p className="font-serif text-[20px] text-ink-600 leading-relaxed mb-8">
          The crypto market calls tracker that scores alpha against real price data. 
          Creator rankings, historical accuracy, and transparent methodology.
        </p>
        <div className="flex flex-col tab:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-3 bg-accent hover:bg-accent-dim text-ink-0 font-mono text-[13px] tracking-caps uppercase px-7 py-4 transition-colors"
            style={{ borderRadius: 2 }}
          >
            View Leaderboard →
          </Link>
          <Link
            href="/pricing"
            className="inline-flex justify-center border border-ink-300 text-ink-900 hover:border-accent/60 hover:text-accent font-mono text-[13px] tracking-caps uppercase px-7 py-4 transition-colors"
            style={{ borderRadius: 2 }}
          >
            Upgrade
          </Link>
        </div>
        <p className="mt-8 font-mono text-[11px] text-ink-500 tracking-caps">
          Experience: {experienceId}
        </p>
      </div>
    </div>
  );
}
