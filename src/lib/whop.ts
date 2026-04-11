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
 * Leaderboard visibility tier.
 *
 * The full leaderboard is FREE — it's the viral hook that drives
 * organic traffic and social sharing. Paywalling rank numbers kills
 * virality for zero incremental revenue.
 *
 * Paid tiers gate the INTELLIGENCE layer:
 *   Pro  ($19/mo) — creator deep dives, call history, charts
 *   Alpha ($49/mo) — bear/bull alerts, contrarian signals, consensus
 *
 * All ranks return "free" so nothing is blurred on the homepage.
 */
export function getCreatorTier(_rank: number): Tier {
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
