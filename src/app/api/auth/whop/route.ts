import { NextResponse } from "next/server";

const OAUTH_STATE_COOKIE_NAME = "ctr_oauth_state";
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

/**
 * GET /api/auth/whop
 * Redirects the user to Whop's OAuth authorization page.
 */
export async function GET(): Promise<NextResponse> {
  const clientId = process.env.WHOP_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json(
      { error: "Whop OAuth not configured" },
      { status: 500 },
    );
  }

  const redirectUri = getRedirectUri();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile email",
    state: generateState(),
  });

  const whopAuthUrl = `https://whop.com/oauth?${params.toString()}`;
  const response = NextResponse.redirect(whopAuthUrl);
  response.cookies.set(OAUTH_STATE_COOKIE_NAME, params.get("state")!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });
  return response;
}

function getRedirectUri(): string {
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.NODE_ENV === "production"
      ? "https://call-score.com"
      : "http://localhost:3000");

  return `${base}/api/auth/whop/callback`;
}

function generateState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
