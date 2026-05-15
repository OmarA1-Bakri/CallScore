import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { noStoreHeaders } from "@/lib/http-cache";
import { requireAlphaApiAccess } from "@/lib/premium";
import { creatorRowSchema, parseApiRow } from "@/lib/api-schemas";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAlphaApiAccess(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const creatorId = Number(id);
  if (!Number.isInteger(creatorId) || creatorId <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400, headers: noStoreHeaders() });
  }

  const rows = await query(
    `SELECT id, name, youtube_handle, youtube_channel_id, subscribers, focus, tier,
            total_calls, win_rate, avg_return, alpha_score, accuracy_rank, last_scraped_at
     FROM creators
     WHERE id = $1
     LIMIT 1`,
    [creatorId],
  );
  if (rows.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStoreHeaders() });
  const creator = parseApiRow(creatorRowSchema, rows[0], "v1 creator");
  return NextResponse.json({ data: creator }, { headers: noStoreHeaders() });
}
