import type { Tier } from "./types";

const TIER_LEVELS: Record<Tier, number> = {
  free: 0,
  pro: 1,
  alpha: 2,
};

export function normalizeTier(value: unknown): Tier {
  if (value === "pro") return "pro";
  if (value === "alpha" || value === "elite") return "alpha";
  return "free";
}

export function hasAccess(userTier: unknown, requiredTier: unknown): boolean {
  return TIER_LEVELS[normalizeTier(userTier)] >= TIER_LEVELS[normalizeTier(requiredTier)];
}

/**
 * Leaderboard visibility tier.
 *
 * The public research surface stays open: leaderboard, creator pages,
 * call history, and per-call score breakdowns all remain visible.
 *
 * Premium tiers are reserved for future delivery workflows, not for
 * hiding the public methodology or public history.
 */
export function getCreatorTier(_rank: number): Tier {
  return "free";
}

function whopApiBase(): string {
  return process.env.WHOP_API_BASE_URL ?? "https://api.whop.com";
}

function alphaPlanId(): string | undefined {
  return process.env.WHOP_ALPHA_PLAN_ID ?? process.env.WHOP_ELITE_PLAN_ID;
}

function isAccessGranted(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  return record.has_access === true || record.access === true || record.access_level === "customer" || record.access_level === "admin";
}

async function checkUserAccess(
  resourceId: string | undefined,
  accessToken: string,
  userId?: string | null,
): Promise<boolean> {
  if (!resourceId) return false;

  const apiKey = process.env.WHOP_API_KEY;
  const base = whopApiBase().replace(/\/$/, "");
  const url =
    apiKey && userId
      ? `${base}/users/${encodeURIComponent(userId)}/access/${encodeURIComponent(resourceId)}`
      : `https://access.api.whop.com/check/${encodeURIComponent(resourceId)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey && userId ? apiKey : accessToken}`,
    },
  });

  if (!response.ok) return false;
  return isAccessGranted(await response.json());
}

/**
 * Verify a user's subscription tier via Whop API.
 * Returns the highest active tier found.
 */
export async function getUserTier(
  accessToken: string | null,
  userId?: string | null,
): Promise<Tier> {
  if (!accessToken) return "free";

  try {
    if (await checkUserAccess(alphaPlanId(), accessToken, userId)) return "alpha";
    if (await checkUserAccess(process.env.WHOP_PRO_PLAN_ID, accessToken, userId)) return "pro";
  } catch {
    return "free";
  }

  return "free";
}
