import type { Metadata, Viewport } from "next";
import type { ReactElement } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FloatingFeedbackButton from "@/components/FloatingFeedbackButton";
import StructuredData from "@/components/StructuredData";
import ConversionAnalyticsBootstrap from "@/components/ConversionAnalyticsBootstrap";
import { SITE_URL } from "@/lib/site";
import { serif, sans, mono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "CallScore — Crypto Creator Accuracy Tracker",
    template: "%s | CallScore",
  },
  description:
    "CallScore tracks public crypto creator market calls, scores predictions against real price data, and ranks creators by alpha, accuracy, consistency, and self-correction.",
  keywords: [
    "CallScore",
    "crypto creator accuracy tracker",
    "crypto market calls tracker",
    "crypto YouTuber accuracy",
    "crypto influencer rankings",
    "crypto prediction tracker",
    "crypto alpha tracker",
    "market call scoring",
    "creator accountability",
    "crypto leaderboard",
    "crypto call history",
    "crypto backtesting",
    "crypto alerts API",
  ],
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "CallScore — Crypto Creator Accuracy Tracker",
    description:
      "Track crypto creator market calls against real price data. Transparent scoring, creator rankings, methodology, alerts, backtests, API access, and webhooks.",
    type: "website",
    url: SITE_URL,
    siteName: "CallScore",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "CallScore — Crypto Creator Accuracy Tracker",
    description:
      "Track crypto creator market calls against real price data. Transparent scoring, creator rankings, methodology, alerts, backtests, API access, and webhooks.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0B",
};

interface RootLayoutProps {
  readonly children: React.ReactNode;
}

export default function RootLayout({
  children,
}: RootLayoutProps): ReactElement {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable} dark`}>
      <body className="min-h-screen flex flex-col bg-ink-0 text-ink-700 font-sans">
        <StructuredData />
        <ConversionAnalyticsBootstrap />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <FloatingFeedbackButton />
      </body>
    </html>
  );
}
