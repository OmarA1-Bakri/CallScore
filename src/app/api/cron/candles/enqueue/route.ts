import { NextRequest, NextResponse } from "next/server";
import { createCronDeadlineSignal, withCronDeadline } from "../../deadline";
import { cronUnauthorized, verifyCronSecret } from "@/lib/cron";
import { enqueueCandleRefreshJob } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getQuerySymbols(request: NextRequest): readonly string[] | undefined {
  const value = request.nextUrl.searchParams.get("symbols");
  if (!value) return undefined;
  return value.split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
}

async function getBody(request: NextRequest): Promise<{ symbols?: unknown; max_requests_per_symbol?: unknown }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (request.method !== "POST" || !contentType.includes("application/json")) return {};
  return request.json().catch(() => ({})) as Promise<{ symbols?: unknown; max_requests_per_symbol?: unknown }>;
}

async function enqueue(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(request)) return cronUnauthorized();

  const body = await getBody(request);
  const bodySymbols = Array.isArray(body.symbols)
    ? body.symbols.filter((symbol): symbol is string => typeof symbol === "string")
    : undefined;
  const symbols = getQuerySymbols(request) ?? bodySymbols;
  const maxRequestsPerSymbol = positiveInt(
    request.nextUrl.searchParams.get("max_requests_per_symbol") ?? body.max_requests_per_symbol,
    25,
  );
  const deadlineResult = await withCronDeadline(
    (signal) => enqueueCandleRefreshJob({ symbols, maxRequestsPerSymbol, signal }),
    createCronDeadlineSignal(),
  );
  if (!deadlineResult.completed) {
    return NextResponse.json(
      { ok: false, deadline_exceeded: true, message: "Candle refresh enqueue exceeded cron deadline" },
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
