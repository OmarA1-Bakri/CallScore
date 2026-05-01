import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAlphaApiAccess } from "@/lib/premium";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAlphaApiAccess(request);
  if (auth instanceof NextResponse) return auth;
  const rows = await query(
    `SELECT id, name, youtube_handle, youtube_channel_id, subscribers, focus,
            total_calls, win_rate, avg_return, alpha_score, accuracy_rank, last_scraped_at
     FROM creators
     ORDER BY accuracy_rank ASC NULLS LAST, name ASC`,
  );
  return NextResponse.json({ data: rows });
}
