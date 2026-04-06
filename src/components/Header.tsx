"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { useState } from "react";

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-brand-dark/80 backdrop-blur-xl border-b border-brand-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center group">
            <Image
              src="/logo.png"
              alt="CryptoTubers Ranked"
              width={280}
              height={160}
              className="h-14 w-auto group-hover:scale-[1.02] transition-transform"
              priority
            />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            <Link
              href="/"
              className="text-gray-400 hover:text-white transition-colors text-sm font-medium"
            >
              Leaderboard
            </Link>
            <Link
              href="/methodology"
              className="text-gray-400 hover:text-white transition-colors text-sm font-medium"
            >
              Methodology
            </Link>
            <Link
              href="/pricing"
              className="text-gray-400 hover:text-white transition-colors text-sm font-medium"
            >
              Pricing
            </Link>
            <Link
              href="/pricing"
              className="bg-brand-gold hover:bg-brand-gold-dim text-brand-dark font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
            >
              Get Access
            </Link>
          </nav>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen((prev) => !prev)}
            className="md:hidden text-gray-400 hover:text-white"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <nav className="md:hidden pb-4 space-y-2">
            <Link
              href="/"
              onClick={() => setMobileOpen(false)}
              className="block text-gray-400 hover:text-white transition-colors text-sm font-medium py-2"
            >
              Leaderboard
            </Link>
            <Link
              href="/methodology"
              onClick={() => setMobileOpen(false)}
              className="block text-gray-400 hover:text-white transition-colors text-sm font-medium py-2"
            >
              Methodology
            </Link>
            <Link
              href="/pricing"
              onClick={() => setMobileOpen(false)}
              className="block text-gray-400 hover:text-white transition-colors text-sm font-medium py-2"
            >
              Pricing
            </Link>
            <Link
              href="/pricing"
              onClick={() => setMobileOpen(false)}
              className="inline-block bg-brand-gold hover:bg-brand-gold-dim text-brand-dark font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
            >
              Get Access
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
