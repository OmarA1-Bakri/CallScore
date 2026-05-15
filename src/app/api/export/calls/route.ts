import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { rowsToCsv } from "@/lib/csv";
import { getJudgmentWindowSql } from "@/lib/judgment-window";
import { getLiveCallPriceJoinSql } from "@/lib/live-call-pricing";
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
  "live_price",
  "live_return",
  "live_alpha",
  "live_price_at",
  "score",
] as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await requireSessionAccess("pro");
  if (session instanceof NextResponse) return session;

  const handle = request.nextUrl.searchParams.get("handle");
  const params: unknown[] = [];
  const clauses = [getJudgmentWindowSql("c")];
  if (handle) {
    params.push(handle);
    clauses.push(`cr.youtube_handle = $${params.length}`);
  }
  const where = `WHERE ${clauses.join(" AND ")}`;

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
       live_coin.close::float8 AS live_price,
       CASE
         WHEN c.price_at_call IS NOT NULL
          AND c.price_at_call <> 0
          AND live_coin.close IS NOT NULL
         THEN ((live_coin.close - c.price_at_call) / c.price_at_call) * 100
       END AS live_return,
       CASE
         WHEN c.price_at_call IS NOT NULL
          AND c.price_at_call <> 0
          AND c.btc_price_at_call IS NOT NULL
          AND c.btc_price_at_call <> 0
          AND live_coin.close IS NOT NULL
          AND live_btc.close IS NOT NULL
         THEN (((live_coin.close - c.price_at_call) / c.price_at_call) * 100)
            - (((live_btc.close - c.btc_price_at_call) / c.btc_price_at_call) * 100)
       END AS live_alpha,
       (to_timestamp(live_coin.open_time / 1000.0) AT TIME ZONE 'UTC')::text AS live_price_at,
       c.score
     FROM calls c
     JOIN creators cr ON cr.id = c.creator_id
     ${getLiveCallPriceJoinSql("c")}
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
