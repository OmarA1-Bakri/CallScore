import { NextRequest, NextResponse } from "next/server";
import { getPipelineStatusSnapshot } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function authorized(request: NextRequest): boolean {
  const auth = request.headers.get("authorization");
  const secrets = [
    process.env.PIPELINE_STATUS_SECRET,
    process.env.CRON_SECRET,
  ].filter((secret): secret is string => Boolean(secret));
  return secrets.some((secret) => auth === `Bearer ${secret}`);
}

function limitFromRequest(request: NextRequest): number {
  const parsed = Number(request.nextUrl.searchParams.get("limit") ?? 20);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 20;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const snapshot = await getPipelineStatusSnapshot(limitFromRequest(request));
  return NextResponse.json(
    { ok: true, ...snapshot },
    { headers: { "cache-control": "no-store" } },
  );
}
