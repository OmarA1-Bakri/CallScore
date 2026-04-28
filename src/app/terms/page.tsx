import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service - CryptoTubers Ranked",
  description:
    "Terms of service for CryptoTubers Ranked. Important disclaimers about financial information, data accuracy, and use of this platform.",
};

/* ------------------------------------------------------------------ */
/*  Static data                                                        */
/* ------------------------------------------------------------------ */

interface TermsSection {
  readonly title: string;
  readonly content: readonly string[];
}

const TERMS_SECTIONS: readonly TermsSection[] = [
  {
    title: "Service Description",
    content: [
      "CryptoTubers Ranked is an informational analytics platform that tracks and scores the accuracy of crypto YouTube influencers' altcoin predictions against real market data.",
      "We provide creator rankings, accuracy scores, and analytical data derived from publicly available YouTube content and cryptocurrency market data. The platform is offered on a free tier with optional paid subscriptions for deeper analytics.",
    ],
  },
  {
    title: "NOT Financial Advice",
    content: [
      "IMPORTANT: Nothing on this website constitutes financial advice, investment recommendations, or endorsements of any kind.",
      "CryptoTubers Ranked is strictly an informational analytics platform. The scores, rankings, and data presented are statistical analyses of historical predictions and should not be interpreted as recommendations to buy, sell, or hold any cryptocurrency.",
      "Cryptocurrency investments are highly volatile and carry substantial risk of loss, including the potential loss of your entire investment. Past performance of any creator, as measured by our scoring system, does not guarantee future results.",
      "You should always do your own research (DYOR) and consult a licensed financial advisor before making any investment decisions. We are not registered as a financial advisor, broker-dealer, or investment advisor with any regulatory authority.",
    ],
  },
  {
    title: "Data Accuracy Disclaimer",
    content: [
      "While we strive for the highest possible accuracy in our data collection and scoring methodology, we cannot guarantee that our data is free from errors.",
      "Predictions are extracted from YouTube transcripts using AI, which may occasionally misidentify or misinterpret a creator's statements. Price data is sourced from Binance and may contain gaps or discrepancies.",
      "Scores are computed using statistical methods that involve judgment calls about weighting and methodology. Different methodologies could produce different rankings. We publish our full methodology for transparency.",
      "If you believe any data point is inaccurate, please report it through our feedback page and we will investigate.",
    ],
  },
  {
    title: "Acceptable Use",
    content: [
      "You agree to use this platform only for lawful purposes. You may not:",
      "Scrape, crawl, or programmatically extract data from the platform without written permission.",
      "Use the platform's data to harass, defame, or target any tracked creator.",
      "Redistribute premium content to non-subscribers.",
      "Attempt to interfere with the platform's operation or security.",
    ],
  },
  {
    title: "Intellectual Property",
    content: [
      "The scoring methodology, algorithms, website design, and original content on CryptoTubers Ranked are our intellectual property.",
      "Creator names, channel names, and YouTube content referenced on this platform remain the property of their respective owners. Our use of this information is for analytical and informational purposes under fair use.",
      "You may reference or link to our public data with attribution. You may not reproduce substantial portions of our content without permission.",
    ],
  },
  {
    title: "Subscriptions and Payments",
    content: [
      "Premium subscriptions are processed through Whop. By purchasing a subscription, you also agree to Whop's terms of service.",
      "Subscription management, billing, refunds, and cancellations are handled through Whop's platform. Please refer to your Whop account for subscription inquiries.",
    ],
  },
  {
    title: "Limitation of Liability",
    content: [
      "To the maximum extent permitted by law, CryptoTubers Ranked, its operators, and affiliates shall not be liable for any direct, indirect, incidental, special, or consequential damages arising from:",
      "Your use of or reliance on any information provided on this platform.",
      "Any investment decisions made based on data, scores, or rankings from this platform.",
      "Errors, inaccuracies, or omissions in the data or scores.",
      "Service interruptions, downtime, or data loss.",
      "This platform is provided \"as is\" and \"as available\" without warranties of any kind, either express or implied.",
    ],
  },
  {
    title: "Changes to These Terms",
    content: [
      "We reserve the right to update these terms at any time. Changes will be reflected on this page with an updated revision date. Continued use of the platform after changes constitutes acceptance of the revised terms.",
      "For material changes, we will make reasonable efforts to notify users through the platform.",
    ],
  },
  {
    title: "Contact",
    content: [
      "For questions about these terms, contact us through our feedback page or email us at legal@cryptotuberranked.com.",
    ],
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-ink-500 hover:text-ink-700 text-sm mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Leaderboard
      </Link>

      {/* Page header */}
      <section className="mb-12">
        <h1 className="text-3xl sm:text-4xl font-bold text-ink-900 mb-3">
          Terms of Service
        </h1>
        <p className="text-ink-500 text-sm">
          Last updated: April 11, 2026
        </p>
        <p className="text-ink-600 text-sm mt-4 leading-relaxed">
          By accessing or using CryptoTubers Ranked (cryptotuberranked.com), you
          agree to be bound by these terms. If you do not agree to these terms,
          do not use the platform.
        </p>
      </section>

      {/* Financial disclaimer banner */}
      <section className="mb-8">
        <div className="glass-card p-5 border-l-2 border-accent">
          <p className="text-accent font-semibold text-sm mb-2">
            Financial Disclaimer
          </p>
          <p className="text-ink-600 text-xs leading-relaxed">
            CryptoTubers Ranked is an informational analytics platform only.
            Nothing on this site constitutes financial advice, investment
            recommendations, or endorsements. Cryptocurrency investments are
            highly volatile and carry substantial risk of loss. Always do your
            own research and consult a licensed financial advisor.
          </p>
        </div>
      </section>

      {/* Terms sections */}
      <div className="space-y-8">
        {TERMS_SECTIONS.map((section, index) => (
          <section key={section.title} className="glass-card p-6">
            <h2 className="text-ink-900 font-semibold text-base mb-4">
              {index + 1}. {section.title}
            </h2>
            <div className="space-y-3">
              {section.content.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 40)}
                  className="text-ink-600 text-sm leading-relaxed"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
