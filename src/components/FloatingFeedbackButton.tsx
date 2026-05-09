import Link from "next/link";
import type { ReactElement } from "react";

export default function FloatingFeedbackButton(): ReactElement {
  return (
    <Link
      href="/feedback"
      className="fixed bottom-4 right-4 z-toast inline-flex h-11 w-11 items-center justify-center border border-accent-dim bg-ink-50/90 font-mono text-[12px] uppercase tracking-caps text-accent backdrop-blur-bar transition-colors hover:bg-accent-low tab:bottom-6 tab:right-6 tab:h-auto tab:w-auto tab:gap-2 tab:px-3 tab:py-2"
      style={{ borderRadius: 2 }}
      aria-label="Send feedback"
    >
      <span aria-hidden="true">?</span>
      <span className="hidden tab:inline">Feedback</span>
    </Link>
  );
}
