import Link from "next/link";
import type { ReactElement } from "react";

interface WordmarkProps {
  readonly href?: string;
  readonly size?: "sm" | "md";
}

export default function Wordmark({
  href = "/",
  size = "md",
}: WordmarkProps): ReactElement {
  const fontSize = size === "sm" ? "text-[14px]" : "text-[17px]";
  return (
    <Link
      href={href}
      className={`font-serif font-medium ${fontSize} text-ink-900 tracking-tight leading-none inline-flex items-baseline`}
      aria-label="CryptoTubers Ranked home"
    >
      CTR
      <span className="text-ink-500 mx-1.5">·</span>
      <em className="italic font-normal text-accent">credibility that ranks</em>
    </Link>
  );
}
