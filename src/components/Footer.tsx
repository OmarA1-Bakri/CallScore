import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="border-t border-brand-border bg-brand-dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Top section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Image
                src="/logo.png"
                alt="CryptoTubers Ranked"
                width={140}
                height={80}
                className="h-10 w-auto"
              />
            </div>
            <p className="text-gray-500 text-sm leading-relaxed">
              We track, rank, and score the top 20 crypto YouTube influencers
              by the actual accuracy of their altcoin calls.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-white font-semibold text-sm mb-3">Navigate</h4>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/"
                  className="text-gray-500 hover:text-gray-300 transition-colors text-sm"
                >
                  Leaderboard
                </Link>
              </li>
              <li>
                <Link
                  href="/methodology"
                  className="text-gray-500 hover:text-gray-300 transition-colors text-sm"
                >
                  Methodology
                </Link>
              </li>
              <li>
                <Link
                  href="/pricing"
                  className="text-gray-500 hover:text-gray-300 transition-colors text-sm"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  href="/feedback"
                  className="text-gray-500 hover:text-gray-300 transition-colors text-sm"
                >
                  Give Feedback
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-white font-semibold text-sm mb-3">Legal</h4>
            <ul className="space-y-2">
              <li>
                <span className="text-gray-500 text-sm">Terms of Service</span>
              </li>
              <li>
                <span className="text-gray-500 text-sm">Privacy Policy</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="border-t border-brand-border pt-6">
          <p className="text-gray-600 text-xs leading-relaxed mb-4">
            <strong className="text-gray-500">Financial Disclaimer:</strong>{" "}
            CRYPTO-TUBER RANKED is an informational analytics platform only. Nothing
            on this site constitutes financial advice, investment recommendations,
            or endorsements. Cryptocurrency investments are highly volatile and
            carry substantial risk of loss. Past performance of any creator does not
            guarantee future results. Always do your own research (DYOR) and consult
            a licensed financial advisor before making any investment decisions.
          </p>
          <p className="text-gray-600 text-xs">
            &copy; {new Date().getFullYear()} CRYPTO-TUBER RANKED. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
