import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { rowsToCsv } from "@/lib/csv";
import { requireSessionAccess } from "@/lib/premium";

export const runtime = "nodejs";

const HEADERS = [
  "call_id",
  "creator",
  "youtube_handle",
  "symbol",
  "direction",
  "call_type",
  "call_date",
  "entry_price",
  "target_price",
  "return_30d",
  "alpha_30d",
  "score",
] as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await requireSessionAccess("pro");
  if (session instanceof NextResponse) return session;

  const handle = request.nextUrl.searchParams.get("handle");
  const params: unknown[] = [];
  let where = "";
  if (handle) {
    params.push(handle);
    where = "WHERE cr.youtube_handle = $1";
  }

  const rows = await query<Record<string, unknown>>(
    `SELECT
       c.id AS call_id,
       cr.name AS creator,
       cr.youtube_handle,
       c.symbol,
       c.direction,
       c.call_type,
       c.call_date,
       c.entry_price,
       c.target_price,
       c.return_30d,
       c.alpha_30d,
       c.score
     FROM calls c
     JOIN creators cr ON cr.id = c.creator_id
     ${where}
     ORDER BY c.call_date DESC
     LIMIT 5000`,
    params,
  );
  const csv = rowsToCsv(HEADERS, rows);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="crypto-tuber-calls${handle ? `-${handle.replace(/[^a-z0-9_-]/gi, "")}` : ""}.csv"`,
      "cache-control": "no-store",
    },
  });
}
