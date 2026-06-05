import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { getUserTier } from "@/lib/whop-access";
import { getWhopOAuthBaseUrl, getWhopOAuthCallbackUrl } from "@/lib/whop-oauth";

const OAUTH_STATE_COOKIE_NAME = "ctr_oauth_state";

/**
 * GET /api/auth/whop/callback
 * Handles the OAuth callback from Whop.
 * Exchanges the authorization code for an access token,
 * checks the user's subscription tier, and creates a session.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");
  const storedState = request.cookies.get(OAUTH_STATE_COOKIE_NAME)?.value;

  const baseUrl = getWhopOAuthBaseUrl();

  const redirectWithStateClear = (path: string): NextResponse => {
    const response = NextResponse.redirect(`${baseUrl}${path}`);
    response.cookies.set(OAUTH_STATE_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  };

  // Handle OAuth errors
  if (error) {
    console.error("Whop OAuth error:", error);
    return redirectWithStateClear(`/?auth_error=${error}`);
  }

  if (!code) {
    return redirectWithStateClear("/?auth_error=no_code");
  }

  if (!state || !storedState || state !== storedState) {
    return redirectWithStateClear("/?auth_error=invalid_state");
  }

  try {
    // Exchange code for access token
    const tokenData = await exchangeCodeForToken(code, baseUrl);

    if (!tokenData.access_token) {
      console.error("No access token in response:", tokenData);
      return redirectWithStateClear("/?auth_error=no_token");
    }

    // Get user info from Whop
    const userInfo = await fetchWhopUser(tokenData.access_token);

    // Check subscription tier
    const tier = await getUserTier(tokenData.access_token, userInfo.id ?? null);

    // Create session
    await createSession(
      userInfo.id ?? "unknown",
      tier,
      tokenData.access_token,
    );

    // Redirect to home (or pricing if free tier to encourage upgrade)
    const redirectTo = tier === "free" ? "/pricing" : "/";
    return redirectWithStateClear(redirectTo);
  } catch (err) {
    console.error("OAuth callback error:", err);
    return redirectWithStateClear("/?auth_error=callback_failed");
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

interface TokenResponse {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in: number;
  readonly refresh_token?: string;
  readonly scope?: string;
}

async function exchangeCodeForToken(
  code: string,
  baseUrl: string,
): Promise<TokenResponse> {
  const clientId = process.env.WHOP_CLIENT_ID;
  const clientSecret = process.env.WHOP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("WHOP_CLIENT_ID and WHOP_CLIENT_SECRET are required");
  }

  const response = await fetch("https://api.whop.com/api/v5/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getWhopOAuthCallbackUrl(),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }

  return response.json();
}

interface WhopUser {
  readonly id: string;
  readonly email?: string;
  readonly username?: string;
}

async function fetchWhopUser(accessToken: string): Promise<WhopUser> {
  const response = await fetch("https://api.whop.com/api/v5/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    return { id: "unknown" };
  }

  return response.json();
}
