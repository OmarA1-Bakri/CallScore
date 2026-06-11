import type { ReadApiLeaderboardContract } from "@/lib/home-read-api-contract";
import type { PublicCounts } from "@/lib/public-counts";
import type { Period } from "@/lib/types";

export interface HhHomePayload extends ReadApiLeaderboardContract<unknown> {
  readonly ok: boolean;
  readonly counts?: Partial<PublicCounts> | Record<string, unknown>;
  readonly publicCounts?: Partial<PublicCounts> | Record<string, unknown>;
  readonly leaderboard?: {
    readonly period?: Period | string;
    readonly rows?: readonly unknown[];
  };
}

export function getHhReadApiBase(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.HH_READ_API_BASE?.trim();
  if (!value) return null;
  return value.replace(/\/+$/, "");
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
