import { NextRequest, NextResponse } from "next/server";
import { consensusSignalRowSchema, parseApiRows } from "@/lib/api-schemas";
import { query } from "@/lib/db";
import { noStoreHeaders } from "@/lib/http-cache";
import { requireAlphaApiAccess } from "@/lib/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAlphaApiAccess(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const rows = await query(
      `SELECT *
       FROM consensus_signals
       ORDER BY signal_date DESC
       LIMIT 100`,
    );
    return NextResponse.json(
      { data: parseApiRows(consensusSignalRowSchema, rows, "consensus_signal") },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed_to_load_consensus" },
      { status: 500, headers: noStoreHeaders() },
    );
  }
}
