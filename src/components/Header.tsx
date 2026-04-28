"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu, X, LogIn, LogOut, Crown, Zap } from "lucide-react";
import { useState, useEffect } from "react";

interface SessionInfo {
  readonly loggedIn: boolean;
  readonly tier: string;
  readonly userId?: string;
}

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [session, setSession] = useState<SessionInfo>({
    loggedIn: false,
    tier: "free",
  });

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data: SessionInfo) => setSession(data))
      .catch(() => {
        /* stay as free */
      });
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-ink-0/80 backdrop-blur-xl border-b border-ink-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <Image
              src="/logo-icon.png"
              alt="CryptoTubers Ranked"
              width={468}
              height={468}
              className="h-10 w-auto group-hover:scale-[1.04] transition-transform"
              priority
            />
            <div className="hidden sm:block">
              <span className="text-white font-extrabold text-base tracking-tight leading-none">
                CryptoTubers
              </span>
              <span className="block text-accent font-bold text-[11px] tracking-[0.2em] uppercase leading-none mt-0.5">
                Ranked
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            <Link
              href="/"
              className="text-gray-300 hover:text-white transition-colors text-sm font-medium"
            >
              Leaderboard
            </Link>
            <Link
              href="/methodology"
              className="text-gray-300 hover:text-white transition-colors text-sm font-medium"
            >
              Methodology
            </Link>
            <Link
              href="/pricing"
              className="text-gray-300 hover:text-white transition-colors text-sm font-medium"
            >
              Pricing
            </Link>

            {session.loggedIn ? (
              <div className="flex items-center gap-3">
                <TierBadge tier={session.tier} />
                <Link
                  href="/api/auth/logout"
                  className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-1.5"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden lg:inline">Logout</span>
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/api/auth/whop"
                  prefetch={false}
                  className="text-gray-300 hover:text-white transition-colors text-sm flex items-center gap-1.5"
                >
                  <LogIn className="w-4 h-4" />
                  Sign In
                </Link>
                <Link
                  href="/pricing"
                  className="bg-accent hover:bg-accent-dim text-ink-0 font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
                >
                  Get Access
                </Link>
              </div>
            )}
          </nav>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen((prev) => !prev)}
            className="md:hidden text-gray-400 hover:text-white"
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <nav className="md:hidden pb-4 space-y-2">
            <Link
              href="/"
              onClick={() => setMobileOpen(false)}
              className="block text-gray-300 hover:text-white transition-colors text-sm font-medium py-2"
            >
              Leaderboard
            </Link>
            <Link
              href="/methodology"
              onClick={() => setMobileOpen(false)}
              className="block text-gray-300 hover:text-white transition-colors text-sm font-medium py-2"
            >
              Methodology
            </Link>
            <Link
              href="/pricing"
              onClick={() => setMobileOpen(false)}
              className="block text-gray-300 hover:text-white transition-colors text-sm font-medium py-2"
            >
              Pricing
            </Link>

            {session.loggedIn ? (
              <>
                <div className="py-2">
                  <TierBadge tier={session.tier} />
                </div>
                <Link
                  href="/api/auth/logout"
                  onClick={() => setMobileOpen(false)}
                  className="block text-gray-400 hover:text-white transition-colors text-sm font-medium py-2"
                >
                  Logout
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/api/auth/whop"
                  prefetch={false}
                  onClick={() => setMobileOpen(false)}
                  className="block text-gray-300 hover:text-white transition-colors text-sm font-medium py-2"
                >
                  Sign In
                </Link>
                <Link
                  href="/pricing"
                  onClick={() => setMobileOpen(false)}
                  className="inline-block bg-accent hover:bg-accent-dim text-ink-0 font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
                >
                  Get Access
                </Link>
              </>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/*  Tier badge                                                         */
/* ------------------------------------------------------------------ */

function TierBadge({ tier }: { readonly tier: string }) {
  if (tier === "elite") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-accent/20 text-accent border border-accent/30">
        <Crown className="w-3 h-3" />
        Alpha
      </span>
    );
  }

  if (tier === "pro") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-accent/20 text-accent border border-accent/30">
        <Zap className="w-3 h-3" />
        Pro
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-800 text-gray-400 border border-gray-700">
      Free
    </span>
  );
}
