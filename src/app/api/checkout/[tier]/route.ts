import { NextRequest, NextResponse } from "next/server";

const VALID_TIERS = ["pro", "alpha"] as const;
const VALID_INTERVALS = ["monthly", "annual"] as const;

type Tier = (typeof VALID_TIERS)[number];
type Interval = (typeof VALID_INTERVALS)[number];

function isTier(value: string): value is Tier {
  return (VALID_TIERS as readonly string[]).includes(value);
}

function isInterval(value: string): value is Interval {
  return (VALID_INTERVALS as readonly string[]).includes(value);
}

function noStoreHeaders(): Headers {
  const headers = new Headers();
  headers.set("cache-control", "no-store");
  return headers;
}

function envKey(tier: Tier, interval: Interval): string {
  return `WHOP_CHECKOUT_URL_${tier.toUpperCase()}_${interval.toUpperCase()}`;
}

function parseTierAndInterval(
  rawTier: string,
  request: NextRequest,
): { tier: Tier; interval: Interval } | { error: "invalid_tier" | "invalid_interval" } {
  const normalized = rawTier.toLowerCase();
  const [tierPart, intervalPart, extraPart] = normalized.split("-");
  const tier = tierPart;
  const intervalFromPath = intervalPart && !extraPart ? intervalPart : null;

  if (!isTier(tier)) return { error: "invalid_tier" };

  const rawInterval = (
    intervalFromPath ?? request.nextUrl.searchParams.get("interval") ?? "monthly"
  ).toLowerCase();

  if (!isInterval(rawInterval)) return { error: "invalid_interval" };

  return { tier, interval: rawInterval };
}

/**
 * Whop checkout session URLs are transient; forwarding a stale `session` query
 * can produce dead checkout pages. Absolute checkout URLs are normalized after
 * `URL.searchParams.delete("session")`; relative/non-absolute values are
 * returned trimmed and unchanged for local fallback compatibility.
 */
function sanitizeCheckoutUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();

  try {
    const url = new URL(trimmed);
    url.searchParams.delete("session");
    return url.toString();
  } catch {
    return trimmed;
  }
}

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tier: string }> },
): Promise<NextResponse> {
  const { tier: rawTier } = await params;
  const parsed = parseTierAndInterval(rawTier, request);

  if ("error" in parsed) {
    if (parsed.error === "invalid_tier") {
      return NextResponse.json(
        { error: "invalid_tier", valid: VALID_TIERS },
        { status: 400, headers: noStoreHeaders() },
      );
    }

    return NextResponse.json(
      { error: "invalid_interval", valid: VALID_INTERVALS },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const { tier, interval } = parsed;
  const key = envKey(tier, interval);
  const url = process.env[key];

  if (url && url.trim().length > 0) {
    const redirect = NextResponse.redirect(sanitizeCheckoutUrl(url), 303);
    redirect.headers.set("cache-control", "no-store");
    return redirect;
  }

  console.error(
    "[checkout] missing env var %s for tier=%s interval=%s",
    key,
    tier,
    interval,
  );

  const fallback = new URL(request.url);
  fallback.pathname = "/feedback";
  fallback.search = `?missing=checkout-url-${tier}-${interval}`;

  const redirect = NextResponse.redirect(fallback.toString(), 303);
  redirect.headers.set("cache-control", "no-store");
  return redirect;
}
