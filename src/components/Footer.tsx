import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="border-t border-ink-200 bg-ink-0">
      <div className="max-w-page mx-auto px-4 tab:px-6 desk:px-8 py-12">
        {/* Top section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div>
            <Image
              src="/brand/binary-baron-footer-transparent-tight.png"
              alt="Binary Baron"
              width={703}
              height={499}
              className="h-[86px] w-[122px] object-contain object-left opacity-70"
              unoptimized
            />
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
          <details className="group mb-4">
            <summary className="cursor-pointer list-none text-xs leading-relaxed text-ink-400">
              <strong className="text-ink-500">Financial Disclaimer:</strong>{" "}
              CallScore is an informational analytics platform only.
              <span className="ml-2 font-mono uppercase tracking-caps text-accent">
                Read full disclaimer
              </span>
            </summary>
            <p className="mt-3 text-xs leading-relaxed text-ink-400">
              Nothing on this site constitutes financial advice, investment
              recommendations, or endorsements. Cryptocurrency investments are
              highly volatile and carry substantial risk of loss. Past performance
              of any creator does not guarantee future results. Always do your own
              research (DYOR) and consult a licensed financial advisor before
              making any investment decisions.
            </p>
          </details>
          <div className="border-t border-ink-150 pt-5">
            <p className="text-ink-400 text-xs">
              &copy; {new Date().getFullYear()} CallScore. All rights
              reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
