"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";

interface MobileMenuProps {
  readonly loggedIn: boolean;
  readonly tier: string;
}

export default function MobileMenu({
  loggedIn,
  tier,
}: MobileMenuProps): ReactElement {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative desk:hidden">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="text-ink-600 hover:text-ink-900"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-nav"
      >
        {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {open && (
        <nav
          id="mobile-nav"
          className="absolute right-0 top-11 z-popover w-[min(82vw,280px)] border border-ink-250 bg-ink-0 p-3 shadow-popover"
          aria-label="Mobile navigation"
        >
          <Link
            href="/#leaderboard"
            onClick={() => setOpen(false)}
            className="block border-b border-ink-150 py-3 font-mono text-mono-sm uppercase tracking-caps text-ink-600 transition-colors hover:text-ink-900"
          >
            LEADERBOARD
          </Link>
          <Link
            href="/methodology"
            onClick={() => setOpen(false)}
            className="block border-b border-ink-150 py-3 font-mono text-mono-sm uppercase tracking-caps text-ink-600 transition-colors hover:text-ink-900"
          >
            METHODOLOGY
          </Link>
          <Link
            href="/pricing"
            onClick={() => setOpen(false)}
            className="block border-b border-ink-150 py-3 font-mono text-mono-sm uppercase tracking-caps text-ink-600 transition-colors hover:text-ink-900"
          >
            PRICING
          </Link>
          {loggedIn ? (
            <>
              <div className="border-b border-ink-150 py-3 font-mono text-mono-xs uppercase tracking-kicker text-accent">
                TIER · {tier}
              </div>
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="block border-b border-ink-150 py-3 font-mono text-mono-sm uppercase tracking-caps text-ink-600 transition-colors hover:text-ink-900"
              >
                ACCOUNT
              </Link>
              {tier === "alpha" && (
                <Link
                  href="/backtest"
                  onClick={() => setOpen(false)}
                  className="block border-b border-ink-150 py-3 font-mono text-mono-sm uppercase tracking-caps text-ink-600 transition-colors hover:text-ink-900"
                >
                  ALPHA LAB
                </Link>
              )}
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  onClick={() => setOpen(false)}
                  className="block w-full py-3 text-left font-mono text-mono-sm uppercase tracking-caps text-ink-600 transition-colors hover:text-ink-900"
                >
                  LOGOUT
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/api/auth/whop"
                prefetch={false}
                onClick={() => setOpen(false)}
                className="block border-b border-ink-150 py-3 font-mono text-mono-sm uppercase tracking-caps text-ink-600 transition-colors hover:text-ink-900"
              >
                SIGN IN
              </Link>
              <Link
                href="/pricing"
                onClick={() => setOpen(false)}
                className="mt-3 inline-block border border-accent/60 bg-transparent px-3.5 py-2 font-mono text-mono-sm uppercase tracking-caps text-accent transition-colors hover:border-accent hover:bg-accent-low"
              >
                GET ACCESS
              </Link>
            </>
          )}
        </nav>
      )}
    </div>
  );
}
