import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret, cronUnauthorized } from "@/lib/cron";
import { createCronDeadlineSignal, withCronDeadline } from "../../deadline";
import { runAlertSend } from "@/lib/alert-jobs";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(request)) return cronUnauthorized();
  const batch = Number(request.nextUrl.searchParams.get("batch") ?? process.env.ALERTS_CLAIM_BATCH ?? 500);
  const deadlineSignal = createCronDeadlineSignal();
  const deadlineResult = await withCronDeadline(runAlertSend(Number.isFinite(batch) ? batch : 500, { signal: deadlineSignal }), deadlineSignal);
  if (!deadlineResult.completed) {
    return NextResponse.json(
      { ok: false, deadline_exceeded: true, message: "alert send exceeded cron deadline" },
      { status: 503 },
    );
  }
  const result = deadlineResult.value;
  return NextResponse.json({ ok: result.failed === 0, ...result }, { status: result.failed === 0 ? 200 : 500 });
}
