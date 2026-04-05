import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "CRYPTO-TUBER RANKED — Who Actually Beats The Market?",
  description:
    "We track, rank, and score the top 20 crypto YouTube influencers by the actual accuracy of their altcoin calls.",
  metadataBase: new URL("https://cryptotuberranked.com"),
  openGraph: {
    title: "CRYPTO-TUBER RANKED — Who Actually Beats The Market?",
    description:
      "We track, rank, and score the top 20 crypto YouTube influencers by the actual accuracy of their altcoin calls.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CRYPTO-TUBER RANKED",
    description:
      "We track, rank, and score the top 20 crypto YouTube influencers by the actual accuracy of their altcoin calls.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
};

interface RootLayoutProps {
  readonly children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body className={`${inter.className} min-h-screen flex flex-col`}>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
