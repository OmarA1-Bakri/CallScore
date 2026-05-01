import Link from "next/link";
import Image from "next/image";
import { Crown } from "lucide-react";
import type { ReactElement } from "react";
import { getSession } from "@/lib/auth";
import MobileMenu from "./MobileMenu";

export default async function Header(): Promise<ReactElement> {
  const session = await getSession();
  const loggedIn = session !== null;
  const tier = session?.tier ?? "free";

  return (
    <header className="sticky top-0 z-masthead bg-ink-0/90 backdrop-blur-bar border-b border-ink-250">
      <div className="max-w-page mx-auto px-4 tab:px-6 desk:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2.5 group"
            aria-label="CallScore home"
          >
            <Image
              src="/logo-icon.png"
              alt=""
              aria-hidden="true"
              width={468}
              height={468}
              className="h-10 w-auto group-hover:scale-[1.04] transition-transform"
              priority
            />
            <div className="hidden tab:block">
              <span className="text-ink-900 font-extrabold text-base tracking-tight leading-none">
                CallScore
              </span>
              <span className="block text-accent font-bold text-[11px] tracking-[0.2em] uppercase leading-none mt-0.5">
                Measured
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav
            className="hidden tab:flex items-center gap-8"
            aria-label="Primary navigation"
          >
            <Link
              href="/"
              className="text-ink-700 hover:text-ink-900 transition-colors text-sm font-medium"
            >
              Leaderboard
            </Link>
            <Link
              href="/methodology"
              className="text-ink-700 hover:text-ink-900 transition-colors text-sm font-medium"
            >
              Methodology
            </Link>
            <Link
              href="/pricing"
              className="text-ink-700 hover:text-ink-900 transition-colors text-sm font-medium"
            >
              Pricing
            </Link>

            {loggedIn ? (
              <div className="flex items-center gap-3">
                <Link
                  href="/settings/alerts"
                  className="text-ink-700 hover:text-ink-900 transition-colors text-sm"
                >
                  Alerts
                </Link>
                {tier === "alpha" && (
                  <Link
                    href="/settings/api"
                    className="text-ink-700 hover:text-ink-900 transition-colors text-sm"
                  >
                    API
                  </Link>
                )}
                <TierBadge tier={tier} />
                <form action="/api/auth/logout" method="post">
                  <button
                    type="submit"
                    className="text-ink-600 hover:text-ink-900 transition-colors text-sm"
                  >
                    <span className="hidden desk:inline">Logout</span>
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/api/auth/whop"
                  prefetch={false}
                  className="text-ink-700 hover:text-ink-900 transition-colors text-sm"
                >
                  Sign In
                </Link>
                <Link
                  href="/pricing"
                  className="bg-accent hover:bg-accent-dim text-ink-0 font-semibold text-sm px-4 py-2 transition-colors"
                >
                  Get Access
                </Link>
              </div>
            )}
          </nav>

          {/* Mobile menu (client island) */}
          <MobileMenu loggedIn={loggedIn} tier={tier} />
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/*  Tier badge                                                         */
/* ------------------------------------------------------------------ */

function TierBadge({ tier }: { readonly tier: string }): ReactElement {
  if (tier === "alpha") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-accent/20 text-accent border border-accent/30">
        <Crown className="w-3 h-3" />
        Alpha
      </span>
    );
  }

  if (tier === "pro") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-new/20 text-new border border-new/30">
        <span aria-hidden="true">★</span>
        Pro
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-ink-100 text-ink-600 border border-ink-300">
      Free
    </span>
  );
}
