import Link from "next/link";

const NAV_LINKS = [
  { href: "/", label: "Leaderboard" },
  { href: "/signals", label: "Signals" },
  { href: "/calls", label: "Calls" },
  { href: "/compare", label: "Compare" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/methodology", label: "Methodology" },
  { href: "/pricing", label: "Pricing" },
] as const;

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/feedback", label: "Feedback" },
] as const;

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-in">
        <div className="footer-brand">
          <Link href="/" className="brand-wordmark" aria-label="CryptoTubers Ranked home">
            <span className="brand-main">CryptoTubers</span>
            <span className="brand-accent">Ranked</span>
          </Link>
          <p>
            Public performance analytics for crypto creator calls. Scores are informational,
            evidence-linked, and not financial advice.
          </p>
        </div>

        <nav aria-label="Footer navigation" className="footer-links">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>{link.label}</Link>
          ))}
        </nav>

        <nav aria-label="Legal navigation" className="footer-legal">
          {LEGAL_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>{link.label}</Link>
          ))}
        </nav>
      </div>
      <div className="site-disclaimer">
        <strong>Financial disclaimer:</strong> CryptoTubers Ranked is an informational
        analytics platform only. Nothing here is investment advice or an endorsement.
      </div>
    </footer>
  );
}
