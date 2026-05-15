import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCreatorTier } from "@/lib/creator-tier";
import { hasAccess } from "@/lib/whop";
import { getUserTier } from "@/lib/whop-access";
import { serializeCalls } from "@/lib/public-serializer";
import { getRequestAuthContext } from "@/lib/auth";
import { getJudgmentWindowSql } from "@/lib/judgment-window";
import { callRowSchema, creatorRowSchema, creatorStatsRowSchema, parseApiRow, parseApiRows } from "@/lib/api-schemas";
import { getLiveCallPriceJoinSql, getLiveCallPriceSelectSql } from "@/lib/live-call-pricing";
import type { Creator, CreatorStats, Call, Tier } from "@/lib/types";

const VALID_SORT_FIELDS = ["date", "score", "return"] as const;
type SortField = (typeof VALID_SORT_FIELDS)[number];

const SORT_COLUMN_MAP: Record<SortField, string> = {
  date: "call_date DESC",
  score: "score DESC",
  return: "return_30d DESC NULLS LAST",
};

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
const DEFAULT_PAGE = 1;

function isValidSort(value: string): value is SortField {
  return (VALID_SORT_FIELDS as readonly string[]).includes(value);
}

function parsePositiveInt(
  value: string | null,
  fallback: number,
  max?: number,
): number {
  if (value === null) return fallback;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 1) return fallback;
  return max !== undefined ? Math.min(parsed, max) : parsed;
}

interface CountRow {
  readonly count: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id: idParam } = await params;
    const creatorId = parseInt(idParam, 10);

    if (isNaN(creatorId) || creatorId < 1) {
      return NextResponse.json(
        { error: "Invalid creator ID" },
        { status: 400 },
      );
    }

    // Fetch creator
    const rawCreators = await query<Creator>(
      `SELECT * FROM creators WHERE id = $1`,
      [creatorId],
    );

    if (rawCreators.length === 0) {
      return NextResponse.json(
        { error: "Creator not found" },
        { status: 404 },
      );
    }

    const creator = parseApiRow(creatorRowSchema, rawCreators[0], "creator");

    // Determine tier requirement based on rank
    const rank = creator.accuracy_rank ?? Infinity;
    const requiredTier: Tier = getCreatorTier(rank);

    // Check user access
    const auth = getRequestAuthContext(request);
    const userTier = auth.session?.tier ?? await getUserTier(auth.accessToken);

    if (!hasAccess(userTier, requiredTier)) {
      return NextResponse.json(
        {
          error: "Upgrade required",
          required_tier: requiredTier,
          current_tier: userTier,
        },
        { status: 403 },
      );
    }

    // Parse pagination and sort params
    const { searchParams } = request.nextUrl;
    const page = parsePositiveInt(
      searchParams.get("page"),
      DEFAULT_PAGE,
    );
    const limit = parsePositiveInt(
      searchParams.get("limit"),
      DEFAULT_LIMIT,
      MAX_LIMIT,
    );
    const sortParam = searchParams.get("sort") ?? "date";

    if (!isValidSort(sortParam)) {
      return NextResponse.json(
        {
          error: `Invalid sort field. Must be one of: ${VALID_SORT_FIELDS.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const offset = (page - 1) * limit;
    const orderClause = SORT_COLUMN_MAP[sortParam];

    // Fetch stats and calls in parallel
    const [statsRows, callRows, countRows] = await Promise.all([
      query<CreatorStats>(
        `SELECT * FROM creator_stats
         WHERE creator_id = $1 AND period = 'all_time'`,
        [creatorId],
      ),
      query<Call>(
        `SELECT c.*, ${getLiveCallPriceSelectSql()}
         FROM calls c
         ${getLiveCallPriceJoinSql("c")}
         WHERE c.creator_id = $1
           AND ${getJudgmentWindowSql("c")}
         ORDER BY ${orderClause}
         LIMIT $2 OFFSET $3`,
        [creatorId, limit, offset],
      ),
      query<CountRow>(
        `SELECT COUNT(*)::text AS count
         FROM calls
         WHERE creator_id = $1
           AND ${getJudgmentWindowSql("calls")}`,
        [creatorId],
      ),
    ]);

    const stats = statsRows.length > 0 ? parseApiRow(creatorStatsRowSchema, statsRows[0], "creator stats") : null;
    const total = parseInt(countRows[0]?.count ?? "0", 10);
    const parsedCalls = parseApiRows(callRowSchema, callRows, "creator calls");
    const serializedCalls = serializeCalls(parsedCalls);

    return NextResponse.json({
      data: {
        creator,
        stats,
        calls: serializedCalls,
      },
      meta: {
        pagination: {
          page,
          limit,
          total,
          has_more: offset + limit < total,
        },
        counts: {
          tracked_calls: total,
          scored_calls: stats?.total_calls ?? 0,
        },
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
