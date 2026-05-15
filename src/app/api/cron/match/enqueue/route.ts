import { NextRequest, NextResponse } from "next/server";
import { createCronDeadlineSignal, withCronDeadline } from "../../deadline";
import { cronUnauthorized, verifyCronSecret } from "@/lib/cron";
import { enqueueMatchPricesBatchJob } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonNegativeInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

async function getBody(request: NextRequest): Promise<{
  limit?: unknown;
  batch_size?: unknown;
  batchSize?: unknown;
  start_after_id?: unknown;
  startAfterId?: unknown;
}> {
  const contentType = request.headers.get("content-type") ?? "";
  if (request.method !== "POST" || !contentType.includes("application/json")) return {};
  return request.json().catch(() => ({})) as Promise<{
    limit?: unknown;
    batch_size?: unknown;
    batchSize?: unknown;
    start_after_id?: unknown;
    startAfterId?: unknown;
  }>;
}

async function enqueue(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(request)) return cronUnauthorized();

  const body = await getBody(request);
  const limit = positiveInt(request.nextUrl.searchParams.get("limit") ?? body.limit, 1000);
  const batchSize = positiveInt(
    request.nextUrl.searchParams.get("batch_size") ?? body.batch_size ?? body.batchSize,
    200,
  );
  const startAfterId = nonNegativeInt(
    request.nextUrl.searchParams.get("start_after_id") ?? body.start_after_id ?? body.startAfterId,
    0,
  );
  const deadlineResult = await withCronDeadline(
    (signal) => enqueueMatchPricesBatchJob({ limit, batchSize, startAfterId, signal }),
    createCronDeadlineSignal(),
  );
  if (!deadlineResult.completed) {
    return NextResponse.json(
      { ok: false, deadline_exceeded: true, message: "Match prices enqueue exceeded cron deadline" },
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
