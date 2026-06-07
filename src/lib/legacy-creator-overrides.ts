import { normalizeCreatorHandle } from "./global-creator-candidates";

export type LegacyCreatorOverrideStatus = "mixed_requires_audit" | "excluded_pending_review";

export interface LegacyCreatorOverride {
  readonly youtube_handle: string;
  readonly status: LegacyCreatorOverrideStatus;
  readonly reason: string;
  readonly source: string;
}

export const LEGACY_CREATOR_OVERRIDES: readonly LegacyCreatorOverride[] = [
  {
    youtube_handle: "@AltcoinDaily",
    status: "excluded_pending_review",
    reason:
      "Phase 1 audit found only 21.1% genuine creator-owned calls and 78.9% contaminated/non-owned/ambiguous calls",
    source: "callscore-altcoin-daily-audit-packet-2026-06-06",
  },
] as const;

const EXCLUDED_BUYER_FACING_HANDLES = new Set(
  LEGACY_CREATOR_OVERRIDES
    .filter((override) => override.status === "excluded_pending_review" || override.status === "mixed_requires_audit")
    .map((override) => normalizeCreatorHandle(override.youtube_handle))
    .filter((handle): handle is string => handle !== null),
);

export function isLegacyCreatorExcludedFromBuyerRankings(handle: string | null | undefined): boolean {
  const normalized = normalizeCreatorHandle(handle);
  return normalized !== null && EXCLUDED_BUYER_FACING_HANDLES.has(normalized);
}

export function getLegacyCreatorExclusionSql(alias = "c"): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) {
    throw new Error(`Unsafe SQL alias for legacy creator exclusion: ${alias}`);
  }
  const handles = Array.from(EXCLUDED_BUYER_FACING_HANDLES);
  if (handles.length === 0) return "TRUE";
  const quotedHandles = handles.map((handle) => `'${handle.replace(/'/g, "''")}'`).join(", ");
  return `LOWER(${alias}.youtube_handle) NOT IN (${quotedHandles})`;
}
