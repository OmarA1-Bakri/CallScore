import type { Metadata, Viewport } from "next";
import type { ReactElement } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FloatingFeedbackButton from "@/components/FloatingFeedbackButton";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

/* added by W4 for /about terminal aesthetic — exposes font-mono via CSS var */
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "CRYPTO-TUBER RANKED — Who Actually Beats The Market?",
  description:
    "Every altcoin call from 20 crypto YouTubers, scored against 18.7M Binance candles. Public methodology, auditable data, no sponsorships.",
  metadataBase: new URL("https://cryptotuberranked.com"),
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "CRYPTO-TUBER RANKED — Who Actually Beats The Market?",
    description:
      "Every altcoin call from 20 crypto YouTubers, scored against 18.7M Binance candles. Public methodology, auditable data, no sponsorships.",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "CRYPTO-TUBER RANKED",
    description:
      "Altcoin calls from 20 crypto YouTubers, scored against 18.7M Binance candles. Public methodology, no sponsorships.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
};

interface RootLayoutProps {
  readonly children: React.ReactNode;
}

export default function RootLayout({
  children,
}: RootLayoutProps): ReactElement {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} dark`}
    >
      <body className={`${inter.className} min-h-screen flex flex-col`}>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <FloatingFeedbackButton />
      </body>
    </html>
  );
}
