import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  CONSENSUS_MIN_CREATORS,
  CONSENSUS_WINDOW_DAYS,
} from "@/lib/constants";
import { EXTRACTION_CONFIDENCE_THRESHOLD } from "@/lib/public-methodology";
import { recomputeAllStats } from "@/lib/recompute-stats";

export const maxDuration = 300;

interface StepResult {
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

function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  return authHeader.slice(7) === cronSecret;
}

async function stepCheckNewVideos(): Promise<StepResult> {
  const start = Date.now();

  const creators = await query<CreatorRow>(
    `SELECT id, name, youtube_channel_id, last_scraped_at
     FROM creators
     WHERE youtube_channel_id IS NOT NULL
     ORDER BY last_scraped_at ASC NULLS FIRST`,
  );

  const staleCreators = creators.filter((c) => {
    if (c.last_scraped_at === null) return true;
    const lastScraped = new Date(c.last_scraped_at).getTime();
    const oneWeekAgo = Date.now() - 7 * 86_400_000;
    return lastScraped < oneWeekAgo;
  });

  return {
    step: "check_new_videos",
    status: "skipped",
    message: `Found ${staleCreators.length} creators needing scrape. Run scraper script separately.`,
    duration_ms: Date.now() - start,
  };
}

async function stepRecomputeStats(): Promise<StepResult> {
  const start = Date.now();
  await recomputeAllStats();

  return {
    step: "recompute_stats",
    status: "completed",
    message: "Stats recomputed for all periods",
    duration_ms: Date.now() - start,
  };
}

async function stepUpdateRankings(): Promise<StepResult> {
  const start = Date.now();

  return {
    step: "update_rankings",
    status: "completed",
    message: "Rankings synced from the shared public methodology pipeline",
    duration_ms: Date.now() - start,
  };
}

async function stepDetectConsensus(): Promise<StepResult> {
  const start = Date.now();

  // Find symbols where N+ top creators made calls in the same direction
  // within the consensus window
  await query(
    `INSERT INTO consensus_signals (
      symbol, direction, creator_count, creator_ids, call_ids,
      signal_date, price_at_signal, created_at
    )
    SELECT
      cl.symbol,
      cl.direction,
      COUNT(DISTINCT cl.creator_id) AS creator_count,
      array_agg(DISTINCT cl.creator_id) AS creator_ids,
      array_agg(cl.id) AS call_ids,
      MAX(cl.call_date) AS signal_date,
      (SELECT cl2.price_at_call FROM calls cl2
       WHERE cl2.symbol = cl.symbol
       ORDER BY cl2.call_date DESC LIMIT 1) AS price_at_signal,
      NOW() AS created_at
    FROM calls cl
    JOIN creators c ON c.id = cl.creator_id
    WHERE cl.call_date >= NOW() - make_interval(days => $1)
      AND cl.direction IN ('bullish', 'bearish')
      AND cl.extraction_confidence >= $3
      AND c.accuracy_rank IS NOT NULL
      AND c.accuracy_rank <= 10
    GROUP BY cl.symbol, cl.direction
    HAVING COUNT(DISTINCT cl.creator_id) >= $2
    ON CONFLICT DO NOTHING`,
    [CONSENSUS_WINDOW_DAYS, CONSENSUS_MIN_CREATORS, EXTRACTION_CONFIDENCE_THRESHOLD],
  );

  return {
    step: "detect_consensus",
    status: "completed",
    message: "Consensus signals checked",
    duration_ms: Date.now() - start,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    if (!verifyCronSecret(request)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const stepsCompleted: StepResult[] = [];

    // Step 1: Check for new videos (logs only -- scraping runs separately)
    const videoResult = await stepCheckNewVideos();
    stepsCompleted.push(videoResult);

    // Step 2: Recompute stats
    const statsResult = await stepRecomputeStats();
    stepsCompleted.push(statsResult);

    // Step 3: Update rankings
    const rankingResult = await stepUpdateRankings();
    stepsCompleted.push(rankingResult);

    // Step 4: Detect consensus
    const consensusResult = await stepDetectConsensus();
    stepsCompleted.push(consensusResult);

    return NextResponse.json({
      data: {
        success: true,
        steps_completed: stepsCompleted,
        duration_ms: Date.now() - startTime,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Cron job failed";
    return NextResponse.json(
      {
        error: message,
        data: {
          success: false,
          duration_ms: Date.now() - startTime,
        },
      },
      { status: 500 },
    );
  }
}
