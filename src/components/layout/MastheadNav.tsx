"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export interface MastheadNavItem {
  readonly href: string;
  readonly label: string;
  readonly match?: readonly string[];
}

const NAV_ITEMS: readonly MastheadNavItem[] = [
  { href: "/", label: "Leaderboard", match: ["/"] },
  { href: "/signals", label: "Signals", match: ["/signals"] },
  { href: "/calls", label: "Calls", match: ["/calls", "/call"] },
  { href: "/compare", label: "Compare", match: ["/compare"] },
  { href: "/dashboard", label: "Dashboard", match: ["/dashboard"] },
];

function isActive(pathname: string, item: MastheadNavItem): boolean {
  const matches = item.match ?? [item.href];
  return matches.some((match) => {
    if (match === "/") return pathname === "/";
    return pathname === match || pathname.startsWith(`${match}/`);
  });
}

export default function MastheadNav() {
  const pathname = usePathname();

  return (
    <nav className="app-nav" aria-label="Primary navigation">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={clsx(active && "on")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
