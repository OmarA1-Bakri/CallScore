import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getHhReadApiBase } from "@/lib/hh-read-api";

type HealthQuery = <T>(text: string, params?: unknown[]) => Promise<T[]>;
type HealthFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

interface HealthOptions {
  readonly readApiBase?: string | null;
  readonly fetchFn?: HealthFetch;
}

export async function pingDatabase(queryFn: HealthQuery = query): Promise<void> {
  await queryFn("SELECT 1 AS ok");
}

export async function pingReadApi(
  readApiBase: string,
  fetchFn: HealthFetch = fetch,
): Promise<void> {
  const url = new URL(`${readApiBase.replace(/\/+$/, "")}/leaderboard`);
  url.searchParams.set("period", "12m");
  url.searchParams.set("limit", "1");
  const headers = new Headers({ Accept: "application/json" });
  const readSecret = process.env.HH_READ_SECRET?.trim();
  if (readSecret) headers.set("Authorization", ["Bearer", readSecret].join(" "));

  const response = await fetchFn(url, {
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`read API probe returned HTTP ${response.status}`);
  }
}

export async function buildHealthResponse(
  queryFn: HealthQuery = query,
  options: HealthOptions = {},
): Promise<NextResponse> {
  const readApiBase = options.readApiBase ?? getHhReadApiBase();
  try {
    if (readApiBase) {
      await pingReadApi(readApiBase, options.fetchFn);
      return NextResponse.json(
        { ok: true, db: "ok", source: "hh_read_api" },
        { status: 200, headers: { "cache-control": "no-store" } },
      );
    }

    await pingDatabase(queryFn);
    return NextResponse.json(
      { ok: true, db: "ok" },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("health_check_failed", err);
    return NextResponse.json(
      { ok: false, db: "unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
