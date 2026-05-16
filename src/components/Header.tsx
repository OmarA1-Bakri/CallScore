import Link from "next/link";
import { Crown } from "lucide-react";
import type { ReactElement } from "react";
import { getSession } from "@/lib/auth";
import CallScoreBrand from "./CallScoreBrand";
import MobileMenu from "./MobileMenu";

export default async function Header(): Promise<ReactElement> {
  const session = await getSession();
  const tier = session?.tier ?? "free";

  return (
    <header className="sticky top-0 z-masthead bg-ink-0/90 backdrop-blur-bar border-b border-ink-250">
      <div className="max-w-page mx-auto px-4 tab:px-6 desk:px-8">
        <div className="flex h-16 items-center justify-between tab:h-[72px]">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2.5 group"
            aria-label="CallScore home"
          >
            <CallScoreBrand />
          </Link>

          {/* Desktop nav */}
          <nav
            className="hidden desk:flex items-center gap-5 font-mono text-mono-sm uppercase tracking-caps"
            aria-label="Primary navigation"
          >
            <Link
              href="/#leaderboard"
              className="border-b border-transparent py-1 text-ink-500 transition-colors hover:border-accent/60 hover:text-ink-900"
            >
              LEADERBOARD
            </Link>
            <Link
              href="/backtest"
              className="border-b border-transparent py-1 text-ink-500 transition-colors hover:border-accent/60 hover:text-ink-900"
            >
              BACKTEST
            </Link>
            <Link
              href="/alerts"
              className="border-b border-transparent py-1 text-ink-500 transition-colors hover:border-accent/60 hover:text-ink-900"
            >
              ALERTS
            </Link>
            <Link
              href="/webhooks"
              className="border-b border-transparent py-1 text-ink-500 transition-colors hover:border-accent/60 hover:text-ink-900"
            >
              WEBHOOKS
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

            <div className="flex items-center gap-5 border-l border-ink-250 pl-6">
              <TierBadge tier={tier} />
              {session && (
                <Link
                  href="/settings"
                  className="border-b border-transparent py-1 text-ink-500 transition-colors hover:border-accent/60 hover:text-ink-900"
                >
                  ACCOUNT
                </Link>
              )}
              {tier === "free" && (
                <Link
                  href="/pricing"
                  className="border border-accent/60 bg-transparent px-3.5 py-2 text-accent transition-colors hover:border-accent hover:bg-accent-low focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  GET ACCESS
                </Link>
              )}
            </div>
          </nav>

          {/* Mobile menu (client island) */}
          <MobileMenu authenticated={Boolean(session)} tier={tier} />
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
