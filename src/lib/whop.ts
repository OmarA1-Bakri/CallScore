import type { Tier } from "./types";

const TIER_LEVELS: Record<Tier, number> = {
  free: 0,
  pro: 1,
  elite: 2,
};

export function hasAccess(userTier: Tier, requiredTier: Tier): boolean {
  return TIER_LEVELS[userTier] >= TIER_LEVELS[requiredTier];
}

/**
 * Dynamic tier gating based on actual rank.
 * Top 5 = elite, next 5 = pro, rest = free.
 * This is the key differentiator: tiers shift as rankings change.
 */
export function getCreatorTier(rank: number): Tier {
  if (rank >= 1 && rank <= 5) return "elite";
  if (rank >= 6 && rank <= 10) return "pro";
  return "free";
}

/**
 * Verify a user's subscription tier via Whop API.
 * Returns the highest active tier found.
 */
export async function getUserTier(accessToken: string | null): Promise<Tier> {
  if (!accessToken) return "free";

  const apiKey = process.env.WHOP_API_KEY;
  if (!apiKey) return "free";

  try {
    const response = await fetch(
      "https://api.whop.com/api/v5/me/has_access",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) return "free";

    const data = await response.json();
    const products = data?.products ?? [];

    const elitePlanId = process.env.WHOP_ELITE_PLAN_ID;
    const proPlanId = process.env.WHOP_PRO_PLAN_ID;

    for (const product of products) {
      if (product.id === elitePlanId) return "elite";
    }
    for (const product of products) {
      if (product.id === proPlanId) return "pro";
    }

    return "free";
  } catch {
    return "free";
  }
}
