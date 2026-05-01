import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret, cronUnauthorized } from "@/lib/cron";
import { runAlertScan } from "@/lib/alert-jobs";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(request)) return cronUnauthorized();
  const hours = Number(request.nextUrl.searchParams.get("hours") ?? 6);
  const result = await runAlertScan(Number.isFinite(hours) ? hours : 6);
  return NextResponse.json({ ok: result.failures === 0, ...result }, { status: result.failures === 0 ? 200 : 500 });
}
