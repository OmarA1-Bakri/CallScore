import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy - CryptoTubers Ranked",
  description:
    "Privacy policy for CryptoTubers Ranked. Learn how we handle your data, what we collect, and how we protect your privacy.",
};

/* ------------------------------------------------------------------ */
/*  Static data                                                        */
/* ------------------------------------------------------------------ */

interface PolicySection {
  readonly title: string;
  readonly content: readonly string[];
}

const POLICY_SECTIONS: readonly PolicySection[] = [
  {
    title: "Information We Collect",
    content: [
      "We collect minimal data to operate and improve our platform:",
      "Analytics data: We use privacy-respecting analytics to understand how visitors use the site. This includes page views, referral sources, browser type, and approximate geographic location. We do not track individual users across sessions.",
      "Feedback submissions: When you submit feedback through our feedback page, we collect the content of your message and any contact information you voluntarily provide.",
      "Payment data: If you purchase a subscription, payment processing is handled entirely by Whop. We do not store credit card numbers or payment credentials on our servers.",
    ],
  },
  {
    title: "How We Use Your Information",
    content: [
      "We use collected information solely to:",
      "Operate and maintain the platform, including computing creator scores and rankings.",
      "Improve the user experience based on aggregate usage patterns.",
      "Respond to feedback and support requests.",
      "Process subscriptions through our payment provider (Whop).",
    ],
  },
  {
    title: "Data We Do NOT Collect",
    content: [
      "We do not require user accounts to access the free leaderboard.",
      "We do not sell, rent, or share your personal data with third parties for marketing purposes.",
      "We do not use targeted advertising.",
      "We do not build individual user profiles for ad targeting.",
    ],
  },
  {
    title: "Cookies",
    content: [
      "We use only essential cookies required for basic site functionality and analytics. We do not use tracking cookies for advertising or cross-site tracking.",
    ],
  },
  {
    title: "Third-Party Services",
    content: [
      "We use the following third-party services to operate the platform:",
      "Vercel: Hosting and deployment. Subject to Vercel's privacy policy.",
      "Neon: PostgreSQL database hosting for storing creator scores and call data. No personal user data is stored in this database.",
      "Whop: Payment processing for premium subscriptions. Subject to Whop's privacy policy.",
    ],
  },
  {
    title: "Data Retention",
    content: [
      "Analytics data is retained in aggregate form and is not tied to individual users.",
      "Feedback submissions are retained as long as needed to address your inquiry.",
      "Subscription data is managed by Whop according to their data retention policies.",
    ],
  },
  {
    title: "Your Rights",
    content: [
      "You may request deletion of any personal data we hold about you (such as feedback submissions) by contacting us at the email below.",
      "Since we do not require user accounts for the free tier, we hold minimal personal data for most visitors.",
    ],
  },
  {
    title: "Changes to This Policy",
    content: [
      "We may update this privacy policy from time to time. Changes will be reflected on this page with an updated revision date. Continued use of the site after changes constitutes acceptance of the revised policy.",
    ],
  },
  {
    title: "Contact",
    content: [
      "For privacy-related questions or data deletion requests, contact us through our feedback page or email us at privacy@cryptotuberranked.com.",
    ],
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>
        <p className="text-ink-500 text-sm">
          Last updated: April 11, 2026
        </p>
        <p className="text-ink-600 text-sm mt-4 leading-relaxed">
          CryptoTubers Ranked (&quot;we,&quot; &quot;us,&quot; &quot;our&quot;)
          operates the website at cryptotuberranked.com. This policy explains
          what data we collect, how we use it, and your rights regarding that
          data.
        </p>
      </section>

      {/* Policy sections */}
      <div className="space-y-8">
        {POLICY_SECTIONS.map((section, index) => (
          <section key={section.title} className="border border-ink-200 p-6">
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
