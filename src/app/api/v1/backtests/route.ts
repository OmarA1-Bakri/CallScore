import { NextRequest, NextResponse } from "next/server";
import { findCreatorByHandle } from "@/lib/creator-handles";
import { runBacktest } from "@/lib/backtest";
import { defaultBacktestRange, parseIsoDateAsEndOfDay, parseIsoDateAsStartOfDay } from "@/lib/backtest-params";
import { requireAlphaApiAccess } from "@/lib/premium";
import type { Creator } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAlphaApiAccess(request);
  if (auth instanceof NextResponse) return auth;

  const handle = request.nextUrl.searchParams.get("handle");
  if (!handle) return NextResponse.json({ error: "handle_required" }, { status: 400 });

  const creator = await findCreatorByHandle<Creator>(handle);
  if (!creator) return NextResponse.json({ error: "creator_not_found" }, { status: 404 });

  const now = new Date();
  const defaults = defaultBacktestRange(now);
  const startDate = parseIsoDateAsStartOfDay(request.nextUrl.searchParams.get("start")) ?? defaults.start;
  const endDate = parseIsoDateAsEndOfDay(request.nextUrl.searchParams.get("end")) ?? defaults.end;
  const capital = Number(request.nextUrl.searchParams.get("capital") ?? 1000);

  const result = await runBacktest({
    creatorId: creator.id,
    startDate,
    endDate,
    initialCapital: Number.isFinite(capital) ? capital : 1000,
    strategy: "equal_weight",
  });

  return NextResponse.json({ data: result });
}
