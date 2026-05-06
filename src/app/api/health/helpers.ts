import { NextResponse } from "next/server";
import { query } from "@/lib/db";

type HealthQuery = <T>(text: string, params?: unknown[]) => Promise<T[]>;

export async function pingDatabase(queryFn: HealthQuery = query): Promise<void> {
  await queryFn<{ ok: number }>("SELECT 1 AS ok");
}

export async function buildHealthResponse(queryFn: HealthQuery = query): Promise<NextResponse> {
  try {
    await pingDatabase(queryFn);
    return NextResponse.json(
      { ok: true, db: "ok" },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, db: "unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
