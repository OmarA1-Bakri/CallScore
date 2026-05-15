import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { noStoreHeaders } from "@/lib/http-cache";
import { requireAlphaApiAccess } from "@/lib/premium";
import { creatorRowSchema, parseApiRows } from "@/lib/api-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAlphaApiAccess(request);
  if (auth instanceof NextResponse) return auth;
  const rawRows = await query(
    `SELECT id, name, youtube_handle, youtube_channel_id, subscribers, focus, tier,
            total_calls, win_rate, avg_return, alpha_score, accuracy_rank, last_scraped_at
     FROM creators
     ORDER BY accuracy_rank ASC NULLS LAST, name ASC`,
  );
  const rows = parseApiRows(creatorRowSchema, rawRows, "v1 creators");
  return NextResponse.json({ data: rows }, { headers: noStoreHeaders() });
}
