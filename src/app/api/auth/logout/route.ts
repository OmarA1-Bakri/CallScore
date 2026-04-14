import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

/**
 * GET /api/auth/logout
 * Destroys the session cookie and redirects to home.
 */
export async function GET(): Promise<NextResponse> {
  await destroySession();

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.NODE_ENV === "production"
      ? "https://cryptotuberranked.com"
      : "http://localhost:3000");

  return NextResponse.redirect(`${baseUrl}/`);
}
