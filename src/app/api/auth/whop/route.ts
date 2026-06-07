import { NextRequest, NextResponse } from "next/server";
import {
  getCanonicalWhopAuthUrl,
  getWhopOAuthBaseUrl,
  getWhopOAuthCallbackUrl,
} from "@/lib/whop-oauth";

const OAUTH_STATE_COOKIE_NAME = "ctr_oauth_state";
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

/**
 * GET /api/auth/whop
 * Redirects the user to Whop's OAuth authorization page.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const canonicalAuthUrl = getCanonicalWhopAuthUrl();
  const enforceCanonicalHost =
    process.env.NODE_ENV === "production" || Boolean(process.env.WHOP_OAUTH_BASE_URL);
  if (
    enforceCanonicalHost &&
    (request.headers.get("host") ?? request.nextUrl.host) !== new URL(getWhopOAuthBaseUrl()).host
  ) {
    return NextResponse.redirect(canonicalAuthUrl, { status: 307 });
  }

  const clientId = process.env.WHOP_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json(
      { error: "Whop OAuth not configured" },
      { status: 500 },
    );
  }

  const redirectUri = getWhopOAuthCallbackUrl();

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

function generateState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
