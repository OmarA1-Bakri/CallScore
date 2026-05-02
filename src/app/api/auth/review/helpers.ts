import type { Tier } from "@/lib/types";

export const REVIEWABLE_TIERS: readonly Tier[] = ["pro", "alpha"];

export function normalizeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export function getReviewTier(value: string | null): Tier | null {
  if (value === "pro" || value === "alpha") return value;
  return null;
}
