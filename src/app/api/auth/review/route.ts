import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createSession } from "@/lib/auth";
import { REVIEWABLE_TIERS, getReviewTier, normalizeNextPath } from "./helpers";

export const dynamic = "force-dynamic";

function timingSafeTokenEqual(provided: string | null, expected: string): boolean {
  if (provided === null) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  const comparable = providedBuffer.length === expectedBuffer.length
    ? providedBuffer
    : Buffer.alloc(expectedBuffer.length);
  if (providedBuffer.length === expectedBuffer.length) {
    providedBuffer.copy(comparable);
  }
  return crypto.timingSafeEqual(comparable, expectedBuffer) && providedBuffer.length === expectedBuffer.length;
}

function trustedBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.call-score.com";
  try {
    return new URL(configured).origin;
  } catch {
    return "https://www.call-score.com";
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const reviewToken = process.env.REVIEW_ACCESS_TOKEN;

  if (!reviewToken || reviewToken.length < 32) {
    return NextResponse.json({ error: "review_login_disabled" }, { status: 404 });
  }

  const { searchParams } = request.nextUrl;
  const token = searchParams.get("token");
  const tier = getReviewTier(searchParams.get("tier"));

  if (!timingSafeTokenEqual(token, reviewToken)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!tier || !REVIEWABLE_TIERS.includes(tier)) {
    return NextResponse.json(
      { error: "invalid_tier", allowed_tiers: REVIEWABLE_TIERS },
      { status: 400 },
    );
  }

  await createSession(`review-${tier}`, tier, `review:${tier}`);

  const nextPath = normalizeNextPath(searchParams.get("next"));
  return NextResponse.redirect(new URL(nextPath, trustedBaseUrl()), 303);
}
