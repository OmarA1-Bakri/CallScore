"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";

export default function FloatingFeedbackButton() {
  return (
    <Link
      href="/feedback"
      aria-label="Give Feedback"
      className="fixed bottom-6 right-6 z-40 flex items-center justify-center w-12 h-12 rounded-full bg-accent hover:bg-accent-dim text-ink-0 shadow-lg transition-all duration-200 hover:scale-110 glow-gold"
    >
      <MessageCircle className="w-5 h-5" />
    </Link>
  );
}
