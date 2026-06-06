import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { noStoreHeaders } from "@/lib/http-cache";
import { requireAlphaApiAccess } from "@/lib/premium";
import {
  getLeaderboardEligibilitySql,
  getLeaderboardSampleThreshold,
} from "@/lib/leaderboard-eligibility";
import { getCallEligibilitySql } from "@/lib/public-methodology";
import {
  CREATOR_JUDGMENT_WINDOW_DAYS,
  CREATOR_JUDGMENT_WINDOW_LABEL,
  RECENT_PUBLIC_SCORING_MATURITY_NOTE,
  getJudgmentWindowSql,
} from "@/lib/judgment-window";
import type { Period } from "@/lib/types";
import { leaderboardQueryRowSchema, parseApiRows } from "@/lib/api-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LatestPublicCallDateRow {
  readonly latest_public_call_date: string | null;
}

const GATED_PERIODS = [
  { period_token: "90d", display_window_label: "90 days", required_tier: "pro" },
] as const;

function getWindowDays(period: Period): number {
  if (period === "90d") return 90;
  if (period === "30d") return 30;
  return CREATOR_JUDGMENT_WINDOW_DAYS;
}

function getDisplayWindowLabel(period: Period): string {
  if (period === "90d") return "90 days";
  if (period === "30d") return "30 days · internal experimental sample view";
  return CREATOR_JUDGMENT_WINDOW_LABEL;
}

function getWindowRange(period: Period): { readonly window_start: string; readonly window_end: string } {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd);
  windowStart.setUTCDate(windowStart.getUTCDate() - getWindowDays(period));
  return {
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAlphaApiAccess(request);
  if (auth instanceof NextResponse) return auth;
  const periodParam = request.nextUrl.searchParams.get("period") ?? "all_time";
  if (!["all_time", "90d", "30d"].includes(periodParam)) {
    return NextResponse.json({ error: "invalid_period" }, { status: 400, headers: noStoreHeaders() });
  }
  const period = periodParam as Period;
  const sampleThreshold = getLeaderboardSampleThreshold(period);
  const leaderboardEligibleSql = getLeaderboardEligibilitySql("cs", period);
  const rawRows = await query(
    `SELECT cs.*, c.name, c.youtube_handle
     FROM creator_stats cs
     JOIN creators c ON c.id = cs.creator_id
     WHERE cs.period = $1
       AND ${leaderboardEligibleSql}
     ORDER BY cs.accuracy_rank ASC NULLS LAST`,
    [period],
  );
  const rows = parseApiRows(leaderboardQueryRowSchema, rawRows, "v1 leaderboard");
  const latestPublicCallRows = await query<LatestPublicCallDateRow>(
    `SELECT MAX(c.call_date)::text AS latest_public_call_date
     FROM calls c
     WHERE ${getCallEligibilitySql("c")}
       AND ${getJudgmentWindowSql("c")}`,
  );
  const latestPublicCallDate = latestPublicCallRows[0]?.latest_public_call_date ?? null;
  const windowRange = getWindowRange(period);
  return NextResponse.json(
    {
      data: rows,
      meta: {
        total: rows.length,
        period,
        period_token: period,
        display_window_label: getDisplayWindowLabel(period),
        min_public_scored_calls: sampleThreshold.min_public_scored_calls,
        low_n_warning_calls: sampleThreshold.low_n_warning_calls,
        sample_floor_label: sampleThreshold.sample_floor_label,
        window_days: getWindowDays(period),
        window_start: windowRange.window_start,
        window_end: windowRange.window_end,
        latest_public_call_date: latestPublicCallDate,
        freshness_notes: [RECENT_PUBLIC_SCORING_MATURITY_NOTE],
        gated_periods: GATED_PERIODS,
        data_maturity_note: RECENT_PUBLIC_SCORING_MATURITY_NOTE,
      },
    },
    { headers: noStoreHeaders() },
  );
}
