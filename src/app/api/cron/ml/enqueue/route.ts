import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized, verifyCronSecret } from "@/lib/cron";
import { enqueueNightlyMlVerifierJob } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function readBatchSize(request: NextRequest): Promise<number> {
  const fromQuery = request.nextUrl.searchParams.get("batch_size");
  if (fromQuery) return positiveInt(fromQuery, 250);

  if (request.method !== "POST") return 250;
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return 250;

  const body = await request.json().catch(() => ({})) as { batch_size?: unknown; batchSize?: unknown };
  return positiveInt(body.batch_size ?? body.batchSize, 250);
}

async function enqueue(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(request)) return cronUnauthorized();

  const batchSize = await readBatchSize(request);
  const { run, job } = await enqueueNightlyMlVerifierJob({ batchSize });

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
