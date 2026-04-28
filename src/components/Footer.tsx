import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="border-t border-ink-200 bg-ink-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Top section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <Image
                src="/logo-icon.png"
                alt="CryptoTubers Ranked"
                width={468}
                height={468}
                className="h-8 w-auto"
              />
              <div>
                <span className="text-ink-900 font-extrabold text-sm tracking-tight leading-none">
                  CryptoTubers
                </span>
                <span className="block text-accent font-bold text-[10px] tracking-[0.2em] uppercase leading-none mt-0.5">
                  Ranked
                </span>
              </div>
            </div>
            <p className="text-ink-500 text-sm leading-relaxed">
              We track, rank, and score the top 20 crypto YouTube influencers
              by the actual accuracy of their altcoin calls.
            </p>
          </div>

          {/* Links */}
          <div>
            <h2 className="text-ink-900 font-semibold text-sm mb-3">Navigate</h2>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/"
                  className="text-ink-500 hover:text-ink-700 transition-colors text-sm"
                >
                  Leaderboard
                </Link>
              </li>
              <li>
                <Link
                  href="/methodology"
                  className="text-ink-500 hover:text-ink-700 transition-colors text-sm"
                >
                  Methodology
                </Link>
              </li>
              <li>
                <Link
                  href="/pricing"
                  className="text-ink-500 hover:text-ink-700 transition-colors text-sm"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  href="/feedback"
                  className="text-ink-500 hover:text-ink-700 transition-colors text-sm"
                >
                  Give Feedback
                </Link>
              </li>
              <li>
                <Link
                  href="/about"
                  className="text-ink-500 hover:text-ink-700 transition-colors text-sm"
                >
                  About
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h2 className="text-ink-900 font-semibold text-sm mb-3">Legal</h2>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/terms"
                  className="text-ink-500 hover:text-ink-700 transition-colors text-sm"
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-ink-500 hover:text-ink-700 transition-colors text-sm"
                >
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="border-t border-ink-200 pt-6">
          <p className="text-ink-400 text-xs leading-relaxed mb-4">
            <strong className="text-ink-500">Financial Disclaimer:</strong>{" "}
            CRYPTO-TUBER RANKED is an informational analytics platform only. Nothing
            on this site constitutes financial advice, investment recommendations,
            or endorsements. Cryptocurrency investments are highly volatile and
            carry substantial risk of loss. Past performance of any creator does not
            guarantee future results. Always do your own research (DYOR) and consult
            a licensed financial advisor before making any investment decisions.
          </p>
          <p className="text-ink-400 text-xs">
            &copy; {new Date().getFullYear()} CRYPTO-TUBER RANKED. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
