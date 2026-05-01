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
    <>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="tab:hidden text-ink-600 hover:text-ink-900"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-nav"
      >
        {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {open && (
        <nav
          id="mobile-nav"
          className="tab:hidden pb-4 space-y-2"
          aria-label="Mobile navigation"
        >
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="block text-ink-700 hover:text-ink-900 transition-colors text-sm font-medium py-2"
          >
            Leaderboard
          </Link>
          <Link
            href="/methodology"
            onClick={() => setOpen(false)}
            className="block text-ink-700 hover:text-ink-900 transition-colors text-sm font-medium py-2"
          >
            Methodology
          </Link>
          <Link
            href="/pricing"
            onClick={() => setOpen(false)}
            className="block text-ink-700 hover:text-ink-900 transition-colors text-sm font-medium py-2"
          >
            Pricing
          </Link>
          {loggedIn ? (
            <>
              <div className="py-2 text-xs text-ink-500 uppercase tracking-caps">
                Tier · {tier}
              </div>
              <Link
                href="/settings/alerts"
                onClick={() => setOpen(false)}
                className="block text-ink-700 hover:text-ink-900 transition-colors text-sm font-medium py-2"
              >
                Alerts
              </Link>
              {tier === "alpha" && (
                <>
                  <Link
                    href="/settings/api"
                    onClick={() => setOpen(false)}
                    className="block text-ink-700 hover:text-ink-900 transition-colors text-sm font-medium py-2"
                  >
                    API
                  </Link>
                  <Link
                    href="/settings/webhooks"
                    onClick={() => setOpen(false)}
                    className="block text-ink-700 hover:text-ink-900 transition-colors text-sm font-medium py-2"
                  >
                    Webhooks
                  </Link>
                </>
              )}
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  onClick={() => setOpen(false)}
                  className="block text-ink-600 hover:text-ink-900 transition-colors text-sm font-medium py-2"
                >
                  Logout
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/api/auth/whop"
                prefetch={false}
                onClick={() => setOpen(false)}
                className="block text-ink-700 hover:text-ink-900 transition-colors text-sm font-medium py-2"
              >
                Sign In
              </Link>
              <Link
                href="/pricing"
                onClick={() => setOpen(false)}
                className="inline-block bg-accent hover:bg-accent-dim text-ink-0 font-semibold text-sm px-4 py-2 transition-colors"
              >
                Get Access
              </Link>
            </>
          )}
        </nav>
      )}
    </>
  );
}
