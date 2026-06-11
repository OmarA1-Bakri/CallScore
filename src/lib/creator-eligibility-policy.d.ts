declare module "@/lib/creator-eligibility-policy.mjs" {
  export type ExclusionReason =
    | "EXCLUDED_MEDIA_NEWS_CHANNEL"
    | "EXCLUDED_CONTAMINATED_CALL_SOURCE"
    | "EXCLUDED_NON_TARGET_CREATOR"
    | "EXCLUDED_DUPLICATE_OR_ALIAS";

  export interface CreatorIdentityInput {
    readonly name?: unknown;
    readonly creator_name?: unknown;
    readonly display_name?: unknown;
    readonly youtube_handle?: unknown;
    readonly handle?: unknown;
    readonly creator_youtube_handle?: unknown;
    readonly youtube_channel_id?: unknown;
    readonly channel_id?: unknown;
    readonly creator_youtube_channel_id?: unknown;
    readonly aliases?: readonly unknown[];
    readonly creator_type?: unknown;
    readonly creatorType?: unknown;
    readonly exclusion_reason?: unknown;
    readonly exclusionReason?: unknown;
  }

  export interface NormalizedCreatorIdentity {
    readonly name: string;
    readonly compactName: string;
    readonly handle: string;
    readonly channelId: string;
    readonly aliases: readonly string[];
  }

  export interface CreatorExclusion {
    readonly excluded: boolean;
    readonly reason: ExclusionReason | string | null;
    readonly source: string | null;
  }

  export const EXCLUSION_REASONS: Record<string, ExclusionReason>;
  export const EXCLUDED_CREATOR_CLASSES: readonly string[];
  export const TARGET_CREATOR_CRITERIA: readonly string[];
  export function normalizeCreatorIdentity(row?: CreatorIdentityInput): NormalizedCreatorIdentity;
  export function isAltcoinDaily(row?: CreatorIdentityInput): boolean;
  export function getCreatorExclusion(row?: CreatorIdentityInput): CreatorExclusion;
  export function isExcludedCreator(row?: CreatorIdentityInput): boolean;
  export function getExclusionReason(row?: CreatorIdentityInput): ExclusionReason | string;
  export function isTargetCreatorClass(row?: CreatorIdentityInput): boolean;
}
