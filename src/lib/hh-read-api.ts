import { getOfficialRankedReadApiRows, type ReadApiLeaderboardContract } from "@/lib/home-read-api-contract";
import type { PublicCounts } from "@/lib/public-counts";
import { toReadApiLeaderboardContract } from "@/lib/leaderboard-safety.mjs";
import type { Call, Creator, CreatorStats, Period } from "@/lib/types";

export interface HhHomePayload extends ReadApiLeaderboardContract<unknown> {
  readonly ok: boolean;
  readonly counts?: Partial<PublicCounts> | Record<string, unknown>;
  readonly publicCounts?: Partial<PublicCounts> | Record<string, unknown>;
  readonly leaderboard?: {
    readonly period?: Period | string;
    readonly rows?: readonly unknown[];
  };
}

export interface HhCreatorPayload<
  TCreator extends Partial<Creator> = Creator,
  TStats extends Partial<CreatorStats> = CreatorStats,
  TCall extends Partial<Call> = Call,
> {
  readonly ok: true;
  readonly creator: TCreator;
  readonly stats: TStats | null;
  readonly calls: readonly TCall[];
}

export function getHhReadApiBase(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.HH_READ_API_BASE?.trim();
  if (!value) return null;
  return value.replace(/\/+$/, "");
}


export function getHhOfficialLeaderboardRows<Row>(
  payload: ReadApiLeaderboardContract<unknown> | null | undefined,
  period: Period,
): readonly Row[] {
  const officialRows = getOfficialRankedReadApiRows(payload);
  if (officialRows.length > 0) return officialRows as readonly Row[];

  const compatibilityRows = payload?.leaderboard?.rows;
  if (!Array.isArray(compatibilityRows)) return [];

  const safeContract = toReadApiLeaderboardContract(period, compatibilityRows, {
    period,
    requireFreshnessProof: false,
  }) as ReadApiLeaderboardContract<unknown>;
  return getOfficialRankedReadApiRows(safeContract) as readonly Row[];
}

export async function fetchHhHome(period: Period, limit = 100): Promise<HhHomePayload | null> {
  const base = getHhReadApiBase();
  if (!base) return null;

  const url = new URL(`${base}/home`);
  url.searchParams.set("period", period);
  url.searchParams.set("limit", String(limit));

  const headers = new Headers({ Accept: "application/json" });
  const readSecret = process.env.HH_READ_SECRET?.trim();
  if (readSecret) {
    headers.set("Authorization", ["Bearer", readSecret].join(" "));
  }

  const response = await fetch(url, {
    headers,
    next: { revalidate: 60 },
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as HhHomePayload;
  return payload?.ok === true ? payload : null;
}

export async function fetchHhCreator<
  TCreator extends Partial<Creator> = Creator,
  TStats extends Partial<CreatorStats> = CreatorStats,
  TCall extends Partial<Call> = Call,
>(
  handle: string,
  period: Period = "all_time",
  limit = 50,
): Promise<HhCreatorPayload<TCreator, TStats, TCall> | null> {
  const base = getHhReadApiBase();
  if (!base) return null;

  const normalized = handle.trim().replace(/^@+/, "");
  if (!normalized) return null;

  const url = new URL(`${base}/creator/${encodeURIComponent(normalized)}`);
  url.searchParams.set("period", period);
  url.searchParams.set("limit", String(limit));

  const headers = new Headers({ Accept: "application/json" });
  const readSecret = process.env.HH_READ_SECRET?.trim();
  if (readSecret) {
    headers.set("Authorization", ["Bearer", readSecret].join(" "));
  }

  const response = await fetch(url, {
    headers,
    next: { revalidate: 60 },
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as HhCreatorPayload<TCreator, TStats, TCall>;
  return payload?.ok === true && payload.creator ? payload : null;
}
