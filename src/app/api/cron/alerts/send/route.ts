import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret, cronUnauthorized } from "@/lib/cron";
import { createCronDeadlineSignal, withCronDeadline } from "../../deadline";
import { runAlertsOperatingGraph } from "@/lib/workplane/alert-cron-operating";

export const runtime = "nodejs";

async function enqueue(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(request)) return cronUnauthorized();
  const batch = Number(request.nextUrl.searchParams.get("batch") ?? process.env.ALERTS_CLAIM_BATCH ?? 500);
  const maxItems = Number.isFinite(batch) ? batch : 500;
  const deadlineSignal = createCronDeadlineSignal();
  const deadlineResult = await withCronDeadline(
    (signal) => runAlertsOperatingGraph({ source: "send", maxItems, signal }),
    deadlineSignal,
  );
  if (!deadlineResult.completed) {
    return NextResponse.json(
      { ok: false, deadline_exceeded: true, message: "alert send operating graph exceeded cron deadline" },
      { status: 503 },
    );
  }
  const result = deadlineResult.value;
  return NextResponse.json(result, { status: result.graph_status === "failed" ? 500 : 200 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return enqueue(request);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return enqueue(request);
}
