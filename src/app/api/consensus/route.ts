import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserTier } from "@/lib/whop";
import { getRequestAuthContext } from "@/lib/auth";
import type { ConsensusSignal } from "@/lib/types";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

interface ConsensusQueryRow extends ConsensusSignal {
  readonly creator_names: readonly string[];
}

function parsePositiveInt(
  value: string | null,
  fallback: number,
  max: number,
): number {
  if (value === null) return fallback;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Elite-only endpoint
    const auth = getRequestAuthContext(request);
    const userTier = auth.session?.tier ?? await getUserTier(auth.accessToken);

    if (userTier !== "elite") {
      return NextResponse.json(
        {
          error: "Elite subscription required",
          required_tier: "elite",
          current_tier: userTier,
        },
        { status: 403 },
      );
    }

    const { searchParams } = request.nextUrl;
    const limit = parsePositiveInt(
      searchParams.get("limit"),
      DEFAULT_LIMIT,
      MAX_LIMIT,
    );

    const rows = await query<ConsensusQueryRow>(
      `SELECT cs.*,
        array_agg(c.name ORDER BY c.name) AS creator_names
      FROM consensus_signals cs
      CROSS JOIN LATERAL unnest(cs.creator_ids) AS cid
      JOIN creators c ON c.id = cid
      GROUP BY cs.id
      ORDER BY cs.signal_date DESC
      LIMIT $1`,
      [limit],
    );

    return NextResponse.json({
      data: {
        signals: rows,
      },
      meta: {
        count: rows.length,
        limit,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
