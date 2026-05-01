import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAlphaApiAccess } from "@/lib/premium";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAlphaApiAccess(request);
  if (auth instanceof NextResponse) return auth;
  const rows = await query(
    `SELECT *
     FROM consensus_signals
     ORDER BY signal_date DESC
     LIMIT 100`,
  );
  return NextResponse.json({ data: rows });
}
