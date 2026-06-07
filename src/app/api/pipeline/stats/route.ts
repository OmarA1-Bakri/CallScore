import { NextRequest, NextResponse } from "next/server";
import {
  getPipelineStatsSnapshot,
  normalizePipelineStatsLimit,
} from "@/lib/pipeline-stats";

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
  return normalizePipelineStatsLimit(
    Number(request.nextUrl.searchParams.get("limit") ?? undefined),
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await getPipelineStatsSnapshot({
      limit: limitFromRequest(request),
    });
    return NextResponse.json(
      { ok: true, data: snapshot },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("[pipeline.stats.GET]", error);
    return NextResponse.json(
      { error: "pipeline_stats_unavailable" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
