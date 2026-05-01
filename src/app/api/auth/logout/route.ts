import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

/**
 * POST /api/auth/logout
 * Destroys the session cookie and redirects to home.
 */
export async function POST(): Promise<NextResponse> {
  await destroySession();

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.NODE_ENV === "production"
      ? "https://call-score.com"
      : "http://localhost:3000");

  return NextResponse.redirect(`${baseUrl}/`, 303);
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: "Method not allowed" },
    {
      status: 405,
      headers: { Allow: "POST" },
    },
  );
}
