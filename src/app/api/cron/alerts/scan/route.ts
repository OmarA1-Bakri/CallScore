import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret, cronUnauthorized } from "@/lib/cron";
import { createCronDeadlineSignal, withCronDeadline } from "../../deadline";
import { runAlertScan } from "@/lib/alert-jobs";

export const runtime = "nodejs";

async function enqueue(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(request)) return cronUnauthorized();
  const hours = Number(request.nextUrl.searchParams.get("hours") ?? 6);
  const deadlineSignal = createCronDeadlineSignal();
  const deadlineResult = await withCronDeadline(
    (signal) => runAlertScan(Number.isFinite(hours) ? hours : 6, { signal }),
    deadlineSignal,
  );
  if (!deadlineResult.completed) {
    return NextResponse.json(
      { ok: false, deadline_exceeded: true, message: "alert scan exceeded cron deadline" },
      { status: 503 },
    );
  }
  const result = deadlineResult.value;
  return NextResponse.json({ ok: result.failures === 0, ...result }, { status: result.failures === 0 ? 200 : 500 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return enqueue(request);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return enqueue(request);
}
