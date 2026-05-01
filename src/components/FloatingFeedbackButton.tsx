import Link from "next/link";
import type { ReactElement } from "react";

export default function FloatingFeedbackButton(): ReactElement {
  return (
    <Link
      href="/feedback"
      className="fixed bottom-6 right-6 z-toast inline-flex items-center gap-2 px-3 py-2 border border-accent-dim bg-ink-50/90 backdrop-blur-bar text-accent font-mono text-[12px] tracking-caps uppercase hover:bg-accent-low transition-colors"
      style={{ borderRadius: 2 }}
      aria-label="Send feedback"
    >
      <span aria-hidden="true">?</span>
      <span>Feedback</span>
    </Link>
  );
}
