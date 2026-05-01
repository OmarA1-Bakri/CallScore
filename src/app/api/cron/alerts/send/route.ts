import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret, cronUnauthorized } from "@/lib/cron";
import { runAlertSend } from "@/lib/alert-jobs";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(request)) return cronUnauthorized();
  const batch = Number(request.nextUrl.searchParams.get("batch") ?? process.env.ALERTS_CLAIM_BATCH ?? 500);
  const result = await runAlertSend(Number.isFinite(batch) ? batch : 500);
  return NextResponse.json({ ok: result.failed === 0, ...result }, { status: result.failed === 0 ? 200 : 500 });
}
