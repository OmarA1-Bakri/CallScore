import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAlphaApiAccess } from "@/lib/premium";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAlphaApiAccess(request);
  if (auth instanceof NextResponse) return auth;
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 250);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(requestedLimit, 1000))
    : 250;
  const rows = await query(
    `SELECT c.*, cr.name AS creator_name, cr.youtube_handle
     FROM calls c
     JOIN creators cr ON cr.id = c.creator_id
     ORDER BY c.call_date DESC
     LIMIT $1`,
    [limit],
  );
  return NextResponse.json({ data: rows });
}
