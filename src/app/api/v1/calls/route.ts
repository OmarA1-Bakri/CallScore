import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getJudgmentWindowSql } from "@/lib/judgment-window";
import { getLiveCallPriceJoinSql, getLiveCallPriceSelectSql } from "@/lib/live-call-pricing";
import { requireAlphaApiAccess } from "@/lib/premium";
import { serializeCalls } from "@/lib/public-serializer";
import type { Call } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAlphaApiAccess(request);
  if (auth instanceof NextResponse) return auth;
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 250);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(requestedLimit, 1000))
    : 250;
  const rows = await query<Call>(
    `SELECT c.*, cr.name AS creator_name, cr.youtube_handle,
       ${getLiveCallPriceSelectSql()}
     FROM calls c
     JOIN creators cr ON cr.id = c.creator_id
     ${getLiveCallPriceJoinSql("c")}
     WHERE ${getJudgmentWindowSql("c")}
     ORDER BY c.call_date DESC
     LIMIT $1`,
    [limit],
  );
  return NextResponse.json({ data: serializeCalls(rows) });
}
