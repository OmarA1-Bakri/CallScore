import { NextRequest, NextResponse } from "next/server";
import {
  getPipelineBlockerSnapshot,
  normalizePipelineBlockerLimit,
} from "@/lib/pipeline-blockers";

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
  return normalizePipelineBlockerLimit(
    Number(request.nextUrl.searchParams.get("limit") ?? undefined),
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await getPipelineBlockerSnapshot({
      limit: limitFromRequest(request),
    });
    return NextResponse.json(
      { ok: true, data: snapshot },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("[pipeline.blockers.GET]", error);
    return NextResponse.json(
      { error: "pipeline_blockers_unavailable" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
