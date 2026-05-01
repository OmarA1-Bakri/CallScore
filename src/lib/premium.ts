import { NextResponse } from "next/server";
import { getSession, getRequestAuthContext, type Session } from "./auth";
import { verifyApiKey, type ApiKeyAuth } from "./api-keys";
import { getUserTier, hasAccess } from "./whop";
import type { Tier } from "./types";

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export function upgradeRequired(requiredTier: Tier): NextResponse {
  return NextResponse.json(
    { error: "upgrade_required", required_tier: requiredTier, upgrade_url: "/pricing" },
    { status: 402 },
  );
}

export async function requireSessionAccess(
  requiredTier: Tier,
): Promise<Session | NextResponse> {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!hasAccess(session.tier, requiredTier)) return upgradeRequired(requiredTier);
  return session;
}

export async function requireAlphaApiAccess(request: {
  readonly headers: Headers;
  readonly cookies: { get(name: string): { readonly value: string } | undefined };
}): Promise<ApiKeyAuth | Session | NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ctr_alpha_")) {
    const apiAuth = await verifyApiKey(authHeader.slice(7));
    if (!apiAuth) return unauthorized();
    return apiAuth;
  }

  const auth = getRequestAuthContext(request);
  const tier = auth.session?.tier ?? (await getUserTier(auth.accessToken, auth.session?.userId));
  if (!hasAccess(tier, "alpha")) return upgradeRequired("alpha");
  return auth.session ?? { userId: "bearer", tier, accessToken: auth.accessToken ?? "", exp: 0 };
}
