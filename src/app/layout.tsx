import type { Metadata, Viewport } from "next";
import type { ReactElement } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FloatingFeedbackButton from "@/components/FloatingFeedbackButton";
import { SITE_URL } from "@/lib/site";
import { serif, sans, mono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "CallScore — Market Calls, Measured",
  description:
    "Market calls scored against real price data. Public methodology, auditable history, no sponsorships.",
  metadataBase: new URL(SITE_URL),
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "CallScore — Market Calls, Measured",
    description:
      "Market calls scored against real price data. Public methodology, auditable history, no sponsorships.",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "CallScore",
    description:
      "Market calls scored against real price data. Public methodology, no sponsorships.",
    images: ["/opengraph-image"],
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
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <FloatingFeedbackButton />
      </body>
    </html>
  );
}
