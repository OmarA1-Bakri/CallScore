import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { query } from "@/lib/db";
import {
  CONSENSUS_MIN_CREATORS,
  CONSENSUS_WINDOW_DAYS,
} from "@/lib/constants";
import { EXTRACTION_CONFIDENCE_THRESHOLD } from "@/lib/public-methodology";
import { recomputeAllStats } from "@/lib/recompute-stats";
import { createCronDeadlineSignal, isCronDeadlineExceeded, throwIfCronDeadlineExceeded } from "../deadline";

export interface StepResult {
  readonly step: string;
  readonly status: "completed" | "skipped";
  readonly message: string;
  readonly duration_ms: number;
}

interface CreatorRow {
  readonly id: number;
  readonly name: string;
  readonly youtube_channel_id: string | null;
  readonly last_scraped_at: string | null;
}

const CREATOR_STALE_THRESHOLD_DAYS = 7;
const CREATOR_STALE_THRESHOLD_MS = CREATOR_STALE_THRESHOLD_DAYS * 86_400_000;

function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const provided = Buffer.from(authHeader.slice(7), "utf8");
  const expected = Buffer.from(cronSecret, "utf8");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

async function stepCheckStaleCreators(signal?: AbortSignal): Promise<StepResult> {
  const start = Date.now();

  throwIfCronDeadlineExceeded(signal);
  const creators = await query<CreatorRow>(
    `SELECT id, name, youtube_channel_id, last_scraped_at
     FROM creators
     WHERE youtube_channel_id IS NOT NULL
     ORDER BY last_scraped_at ASC NULLS FIRST`,
  );

  throwIfCronDeadlineExceeded(signal);

  const staleCreators = creators.filter((c) => {
    if (c.last_scraped_at === null) return true;
    const lastScraped = new Date(c.last_scraped_at).getTime();
    return lastScraped < Date.now() - CREATOR_STALE_THRESHOLD_MS;
  });

  return {
    step: "check_stale_creators",
    status: "completed",
    message: `Detected ${staleCreators.length} stale creators; scraping should be run separately.`,
    duration_ms: Date.now() - start,
  };
}

async function stepRecomputeStats(signal?: AbortSignal): Promise<StepResult> {
  const start = Date.now();
  throwIfCronDeadlineExceeded(signal);
  await recomputeAllStats();
  throwIfCronDeadlineExceeded(signal);

  return {
    step: "recompute_stats",
    status: "completed",
    message: "Stats recomputed for all periods",
    duration_ms: Date.now() - start,
  };
}

async function stepUpdateRankings(signal?: AbortSignal): Promise<StepResult> {
  const start = Date.now();
  throwIfCronDeadlineExceeded(signal);

  return {
    step: "update_rankings",
    status: "skipped",
    message: "No ranking sync implemented in this job; skipped.",
    duration_ms: Date.now() - start,
  };
}

async function stepDetectConsensus(signal?: AbortSignal): Promise<StepResult> {
  const start = Date.now();

  throwIfCronDeadlineExceeded(signal);
  await query(
    `INSERT INTO consensus_signals (
      symbol, direction, creator_count, creator_ids, call_ids,
      signal_date, price_at_signal, created_at
    )
    WITH eligible_calls AS (
      SELECT cl.id, cl.symbol, cl.direction, cl.creator_id, cl.call_date, cl.price_at_call
      FROM calls cl
      JOIN creators c ON c.id = cl.creator_id
      WHERE cl.call_date >= NOW() - make_interval(days => $1)
        AND cl.direction IN ('bullish', 'bearish')
        AND cl.extraction_confidence >= $3
        AND c.accuracy_rank IS NOT NULL
        AND c.accuracy_rank <= 10
    ), latest_prices AS (
      SELECT DISTINCT ON (symbol, direction)
        symbol, direction, price_at_call
      FROM eligible_calls
      WHERE price_at_call IS NOT NULL
      ORDER BY symbol, direction, call_date DESC, id DESC
    )
    SELECT
      cl.symbol,
      cl.direction,
      COUNT(DISTINCT cl.creator_id) AS creator_count,
      array_agg(DISTINCT cl.creator_id) AS creator_ids,
      array_agg(cl.id) AS call_ids,
      MAX(cl.call_date) AS signal_date,
      lp.price_at_call AS price_at_signal,
      NOW() AS created_at
    FROM eligible_calls cl
    LEFT JOIN latest_prices lp
      ON lp.symbol = cl.symbol
     AND lp.direction = cl.direction
    GROUP BY cl.symbol, cl.direction, lp.price_at_call
    HAVING COUNT(DISTINCT cl.creator_id) >= $2
    -- consensus_signals has no unique constraint today, so this clause is a
    -- defensive no-op. Kept for forward-compatibility with a future unique
    -- index on (symbol, direction, signal_date::date).
    ON CONFLICT DO NOTHING`,
    [CONSENSUS_WINDOW_DAYS, CONSENSUS_MIN_CREATORS, EXTRACTION_CONFIDENCE_THRESHOLD],
  );

  throwIfCronDeadlineExceeded(signal);

  return {
    step: "detect_consensus",
    status: "completed",
    message: "Consensus signals checked",
    duration_ms: Date.now() - start,
  };
}

type WeeklyStep = (signal?: AbortSignal) => Promise<StepResult>;

interface WeeklyCronOptions {
  readonly deadlineSignal?: AbortSignal;
  readonly steps?: readonly WeeklyStep[];
  readonly now?: () => number;
}

const defaultWeeklySteps: readonly WeeklyStep[] = [
  stepCheckStaleCreators,
  stepRecomputeStats,
  stepUpdateRankings,
  stepDetectConsensus,
];

function deadlineExceededResponse(
  stepsCompleted: StepResult[],
  durationMs: number,
): NextResponse {
  return NextResponse.json(
    {
      error: "Cron deadline exceeded",
      data: {
        success: false,
        deadline_exceeded: true,
        steps_completed: stepsCompleted,
        duration_ms: durationMs,
      },
    },
    { status: 503 },
  );
}

export async function runWeeklyCron(
  request: NextRequest,
  options: WeeklyCronOptions = {},
): Promise<NextResponse> {
  const now = options.now ?? Date.now;
  const startTime = now();
  const deadlineSignal = options.deadlineSignal ?? createCronDeadlineSignal();
  const steps = options.steps ?? defaultWeeklySteps;

  const stepsCompleted: StepResult[] = [];

  try {
    if (!verifyCronSecret(request)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    for (const step of steps) {
      if (isCronDeadlineExceeded(deadlineSignal)) {
        return deadlineExceededResponse(stepsCompleted, now() - startTime);
      }

      stepsCompleted.push(await step(deadlineSignal));
    }

    return NextResponse.json({
      data: {
        success: true,
        steps_completed: stepsCompleted,
        duration_ms: now() - startTime,
      },
    });
  } catch (error: unknown) {
    if (isCronDeadlineExceeded(deadlineSignal)) {
      return deadlineExceededResponse(stepsCompleted, now() - startTime);
    }

    const message =
      error instanceof Error ? error.message : "Cron job failed";
    return NextResponse.json(
      {
        error: message,
        data: {
          success: false,
          duration_ms: now() - startTime,
        },
      },
      { status: 500 },
    );
  }
}
