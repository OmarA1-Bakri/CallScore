import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret, cronUnauthorized } from "@/lib/cron";
import { createCronDeadlineSignal, withCronDeadline } from "../../deadline";
import { runAlertScan } from "@/lib/alert-jobs";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(request)) return cronUnauthorized();
  const hours = Number(request.nextUrl.searchParams.get("hours") ?? 6);
  const deadlineSignal = createCronDeadlineSignal();
  const deadlineResult = await withCronDeadline(runAlertScan(Number.isFinite(hours) ? hours : 6, { signal: deadlineSignal }), deadlineSignal);
  if (!deadlineResult.completed) {
    return NextResponse.json(
      { ok: false, deadline_exceeded: true, message: "alert scan exceeded cron deadline" },
      { status: 503 },
    );
  }
  const result = deadlineResult.value;
  return NextResponse.json({ ok: result.failures === 0, ...result }, { status: result.failures === 0 ? 200 : 500 });
}
