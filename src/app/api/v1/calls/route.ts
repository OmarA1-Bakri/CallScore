import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getJudgmentWindowSql } from "@/lib/judgment-window";
import { getLiveCallPriceJoinSql, getLiveCallPriceSelectSql } from "@/lib/live-call-pricing";
import { noStoreHeaders } from "@/lib/http-cache";
import { requireAlphaApiAccess } from "@/lib/premium";
import { serializeCalls } from "@/lib/public-serializer";
import { callRowSchema, parseApiRows } from "@/lib/api-schemas";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ component: "api-v1-calls" });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAlphaApiAccess(request);
  if (auth instanceof NextResponse) return auth;
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 250);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(requestedLimit, 1000))
    : 250;
  try {
    const rawRows = await query<unknown>(
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
    const rows = parseApiRows(callRowSchema, rawRows, "v1 calls");
    return NextResponse.json({ data: serializeCalls(rows) }, { headers: noStoreHeaders() });
  } catch (error) {
    logger.error("v1_calls_failed", {
      error: error instanceof Error ? error.message : String(error),
      limit,
    });
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: noStoreHeaders() },
    );
  }
}
