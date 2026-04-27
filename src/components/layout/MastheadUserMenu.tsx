"use client";

import Link from "next/link";
import { LogIn, LogOut } from "lucide-react";
import { useEffect, useState } from "react";

interface SessionInfo {
  readonly loggedIn: boolean;
  readonly tier: string;
  readonly userId?: string;
}

const DEFAULT_SESSION: SessionInfo = { loggedIn: false, tier: "free" };

function formatTier(tier: string): string {
  if (tier === "elite") return "alpha";
  if (tier === "pro") return "pro";
  if (tier === "team") return "team";
  return "free";
}

function shortUserId(userId: string | undefined): string {
  if (!userId) return "@user";
  if (userId.startsWith("@")) return userId;
  return `@${userId.slice(0, 10)}`;
}

export default function MastheadUserMenu() {
  const [session, setSession] = useState<SessionInfo>(DEFAULT_SESSION);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/session", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : DEFAULT_SESSION))
      .then((data: SessionInfo) => {
        if (!cancelled) setSession(data);
      })
      .catch(() => {
        if (!cancelled) setSession(DEFAULT_SESSION);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (session.loggedIn) {
    return (
      <div className="mast-user" aria-label="Signed-in account">
        <span className="mast-tier">{formatTier(session.tier)}</span>
        <span className="mast-user-id">signed in · {shortUserId(session.userId)}</span>
        <Link href="/api/auth/logout" className="mast-auth-link" aria-label="Sign out">
          <LogOut aria-hidden="true" size={14} strokeWidth={1.4} />
        </Link>
      </div>
    );
  }

  return (
    <div className="mast-user" aria-label="Authentication links">
      <Link href="/api/auth/whop" className="mast-auth-link">
        <LogIn aria-hidden="true" size={14} strokeWidth={1.4} />
        Sign in
      </Link>
      <Link href="/pricing" className="mast-cta">
        Get access
      </Link>
    </div>
  );
}
