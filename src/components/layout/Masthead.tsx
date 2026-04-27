import Link from "next/link";
import MastheadNav from "./MastheadNav";
import MastheadUserMenu from "./MastheadUserMenu";

export default function Masthead() {
  return (
    <header className="mast">
      <div className="mast-in">
        <Link href="/" className="brand-wordmark" aria-label="CryptoTubers Ranked home">
          <span className="brand-main">CryptoTubers</span>
          <span className="brand-accent">Ranked</span>
        </Link>
        <MastheadNav />
        <div className="mast-actions">
          <span className="cmd-k" aria-hidden="true">⌘K</span>
          <MastheadUserMenu />
        </div>
      </div>
    </header>
  );
}
