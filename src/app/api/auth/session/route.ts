import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

/**
 * GET /api/auth/session
 * Returns the current user's session info (tier, userId).
 * Used by client components to show login state.
 */
export async function GET(): Promise<NextResponse> {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ loggedIn: false, tier: "free" });
  }

  return NextResponse.json({
    loggedIn: true,
    tier: session.tier,
    userId: session.userId,
  });
}
