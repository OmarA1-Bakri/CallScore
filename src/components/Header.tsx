import Link from "next/link";
import { Crown } from "lucide-react";
import type { ReactElement } from "react";
import { getSession } from "@/lib/auth";
import CallScoreBrand from "./CallScoreBrand";
import MobileMenu from "./MobileMenu";

export default async function Header(): Promise<ReactElement> {
  const session = await getSession();
  const loggedIn = session !== null;
  const tier = session?.tier ?? "free";

  return (
    <header className="sticky top-0 z-masthead bg-ink-0/90 backdrop-blur-bar border-b border-ink-250">
      <div className="max-w-page mx-auto px-4 tab:px-6 desk:px-8">
        <div className="flex h-16 items-center justify-between tab:h-[72px]">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2.5 group"
              aria-label="CallScore home"
            >
              <CallScoreBrand />
            </Link>
          </div>

          {/* Desktop nav */}
          <nav
            className="hidden desk:flex items-center gap-6 font-mono text-mono-sm uppercase tracking-caps"
            aria-label="Primary navigation"
          >
            <Link
              href="/#leaderboard"
              className="border-b border-transparent py-1 text-ink-500 transition-colors hover:border-accent/60 hover:text-ink-900"
            >
              LEADERBOARD
            </Link>
            <Link
              href="/methodology"
              className="border-b border-transparent py-1 text-ink-500 transition-colors hover:border-accent/60 hover:text-ink-900"
            >
              METHODOLOGY
            </Link>
            <Link
              href="/pricing"
              className="border-b border-transparent py-1 text-ink-500 transition-colors hover:border-accent/60 hover:text-ink-900"
            >
              PRICING
            </Link>

            {loggedIn ? (
              <div className="flex items-center gap-6 border-l border-ink-250 pl-8">
                <TierBadge tier={tier} />
                <Link
                  href="/settings"
                  className="border-b border-transparent py-1 text-ink-500 transition-colors hover:border-accent/60 hover:text-ink-900"
                >
                  ACCOUNT
                </Link>
                <form action="/api/auth/logout" method="post">
                  <button
                    type="submit"
                    className="border-b border-transparent py-1 text-ink-500 transition-colors hover:border-accent/60 hover:text-ink-900"
                  >
                    <span className="hidden desk:inline">LOGOUT</span>
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex items-center gap-8 border-l border-ink-250 pl-8">
                <Link
                  href="/api/auth/whop"
                  prefetch={false}
                  className="border-b border-transparent py-1 text-ink-500 transition-colors hover:border-accent/60 hover:text-ink-900"
                >
                  SIGN IN
                </Link>
                <Link
                  href="/pricing"
                  className="border border-accent/60 bg-transparent px-3.5 py-2 text-accent transition-colors hover:border-accent hover:bg-accent-low focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  GET ACCESS
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
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap border border-accent/30 bg-accent/20 px-2.5 py-1 font-mono text-mono-sm font-semibold uppercase tracking-caps text-accent">
        <Crown className="w-3 h-3" />
        ALPHA
      </span>
    );
  }

  if (tier === "pro") {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap border border-new/30 bg-new/20 px-2.5 py-1 font-mono text-mono-sm font-semibold uppercase tracking-caps text-new">
        <span aria-hidden="true">★</span>
        PRO
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap border border-ink-300 bg-ink-100 px-2.5 py-1 font-mono text-mono-sm font-medium uppercase tracking-caps text-ink-600">
      FREE
    </span>
  );
}
