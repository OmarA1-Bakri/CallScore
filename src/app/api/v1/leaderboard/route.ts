import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAlphaApiAccess } from "@/lib/premium";
import { getLeaderboardEligibilitySql } from "@/lib/leaderboard-eligibility";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAlphaApiAccess(request);
  if (auth instanceof NextResponse) return auth;
  const period = request.nextUrl.searchParams.get("period") ?? "all_time";
  if (!["all_time", "90d", "30d"].includes(period)) {
    return NextResponse.json({ error: "invalid_period" }, { status: 400 });
  }
  const leaderboardEligibleSql = getLeaderboardEligibilitySql("cs");
  const rows = await query(
    `SELECT cs.*, c.name, c.youtube_handle
     FROM creator_stats cs
     JOIN creators c ON c.id = cs.creator_id
     WHERE cs.period = $1
       AND ${leaderboardEligibleSql}
     ORDER BY cs.accuracy_rank ASC NULLS LAST`,
    [period],
  );
  return NextResponse.json({ data: rows });
}
