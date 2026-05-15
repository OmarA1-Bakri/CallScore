import { NextRequest, NextResponse } from "next/server";
import { createCronDeadlineSignal, withCronDeadline } from "../../deadline";
import { cronUnauthorized, verifyCronSecret } from "@/lib/cron";
import { enqueueComputeScoresJob } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function enqueue(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(request)) return cronUnauthorized();

  const deadlineResult = await withCronDeadline(
    (signal) => enqueueComputeScoresJob({ signal }),
    createCronDeadlineSignal(),
  );
  if (!deadlineResult.completed) {
    return NextResponse.json(
      { ok: false, deadline_exceeded: true, message: "Compute scores enqueue exceeded cron deadline" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const { run, job } = deadlineResult.value;
  return NextResponse.json(
    {
      ok: true,
      run: { id: run.id, run_key: run.run_key, type: run.type, status: run.status },
      job: { id: job.id, type: job.type, status: job.status, payload: job.payload, attempts: job.attempts },
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return enqueue(request);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return enqueue(request);
}
