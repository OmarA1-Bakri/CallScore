import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized, verifyCronSecret } from "@/lib/cron";
import { enqueueNightlyMlVerifierJob } from "@/lib/pipeline";
import { createCronDeadlineSignal, withCronDeadline } from "../../deadline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DEFAULT_BATCH_SIZE = 250;

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function readBatchSize(request: NextRequest): Promise<number> {
  const rawBatchSize = getQueryBatchSize(request) ?? await getBodyBatchSize(request);
  return positiveInt(rawBatchSize, DEFAULT_BATCH_SIZE);
}

function getQueryBatchSize(request: NextRequest): string | null {
  return request.nextUrl.searchParams.get("batch_size");
}

async function getBodyBatchSize(request: NextRequest): Promise<unknown> {
  if (!hasJsonBody(request)) return null;
  const body = await request.json().catch(() => ({})) as { batch_size?: unknown; batchSize?: unknown };
  return body.batch_size ?? body.batchSize ?? null;
}

function hasJsonBody(request: NextRequest): boolean {
  const contentType = request.headers.get("content-type") ?? "";
  return request.method === "POST" && contentType.includes("application/json");
}

async function enqueue(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(request)) return cronUnauthorized();

  const batchSize = await readBatchSize(request);
  const deadlineSignal = createCronDeadlineSignal();
  const deadlineResult = await withCronDeadline(
    (signal) => enqueueNightlyMlVerifierJob({ batchSize, signal }),
    deadlineSignal,
  );
  if (!deadlineResult.completed) {
    return NextResponse.json(
      { ok: false, deadline_exceeded: true, message: "ML enqueue exceeded cron deadline" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  const { run, job } = deadlineResult.value;

  return NextResponse.json(
    {
      ok: true,
      run: {
        id: run.id,
        run_key: run.run_key,
        type: run.type,
        status: run.status,
      },
      job: {
        id: job.id,
        type: job.type,
        status: job.status,
        payload: job.payload,
        attempts: job.attempts,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return enqueue(request);
}

// Vercel Cron invokes route handlers with GET, while manual/debug callers may
// use the POST contract documented in the pipeline plan. Keep both paths wired
// to the same protected enqueue operation.
export async function GET(request: NextRequest): Promise<NextResponse> {
  return enqueue(request);
}
