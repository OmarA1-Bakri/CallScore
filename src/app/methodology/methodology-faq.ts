export interface MethodologyFaq {
  readonly question: string;
  readonly answer: string;
}

export const METHODOLOGY_FAQS: readonly MethodologyFaq[] = [
  {
    question: "What counts as a scored call?",
    answer: "An eligible call must describe an actionable market view, clear the public extraction-confidence floor, refer to a supported asset, and have enough matched price evidence to complete the scoring lifecycle.",
  },
  {
    question: "When is a call mature enough to score?",
    answer: "A call becomes mature only after its required market-outcome window closes and the matching candle evidence is available. Open calls remain tracked, but they are not presented as resolved evidence.",
  },
  {
    question: "Why can a creator be tracked but not officially ranked?",
    answer: "Tracking records available calls. Official ranking applies separate sample-size, freshness, exclusion, and eligibility rules, so a creator can have a public record without meeting the current leaderboard contract.",
  },
  {
    question: "How can a score be audited?",
    answer: "Trace the call to its source transcript and timestamp, verify the matched Binance candle window, confirm its lifecycle state, and recompute the documented score components without creator-specific adjustments.",
  },
] as const;

export const methodologyFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: METHODOLOGY_FAQS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
} as const;
