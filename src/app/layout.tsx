import type { Metadata, Viewport } from "next";
import { Inter_Tight, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FloatingFeedbackButton from "@/components/FloatingFeedbackButton";
import "./globals.css";

const serif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Inter_Tight({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CRYPTO-TUBER RANKED — Who Actually Beats The Market?",
  description:
    "We track, rank, and score the top 20 crypto YouTube influencers by the actual accuracy of their altcoin calls.",
  metadataBase: new URL("https://cryptotuberranked.com"),
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "CRYPTO-TUBER RANKED — Who Actually Beats The Market?",
    description:
      "We track, rank, and score the top 20 crypto YouTube influencers by the actual accuracy of their altcoin calls.",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "CRYPTO-TUBER RANKED",
    description:
      "We track, rank, and score the top 20 crypto YouTube influencers by the actual accuracy of their altcoin calls.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0B",
};

interface RootLayoutProps {
  readonly children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable} dark`}>
      <body className="font-sans bg-ink-0 text-ink-700 min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <FloatingFeedbackButton />
      </body>
    </html>
  );
}
