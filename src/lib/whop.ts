import type { Tier } from "./types";

const TIER_LEVELS: Record<Tier, number> = {
  free: 0,
  pro: 1,
  alpha: 2,
};

const TIER_ALIASES: Record<string, Tier> = {
  alpha: "alpha",
  elite: "alpha",
  pro: "pro",
};

export function normalizeTier(value: unknown): Tier {
  return typeof value === "string"
    ? TIER_ALIASES[value.trim().toLowerCase()] ?? "free"
    : "free";
}

export function hasAccess(userTier: unknown, requiredTier: unknown): boolean {
  return (
    TIER_LEVELS[normalizeTier(userTier)] >=
    TIER_LEVELS[normalizeTier(requiredTier)]
  );
}
