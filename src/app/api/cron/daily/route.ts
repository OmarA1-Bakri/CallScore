import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  CONSENSUS_MIN_CREATORS,
  CONSENSUS_WINDOW_DAYS,
} from "@/lib/constants";

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

interface AffectedRow {
  readonly count: string;
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
    const oneDayAgo = Date.now() - 86_400_000;
    return lastScraped < oneDayAgo;
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

  // Recompute all_time stats for each creator
  await query<AffectedRow>(
    `INSERT INTO creator_stats (creator_id, period, total_calls, win_rate,
      avg_return_7d, avg_return_30d, avg_return_90d, avg_alpha_30d,
      best_call_id, worst_call_id, hit_rate, most_called_symbol,
      strategy_consistency, specificity_avg, alpha_score, updated_at)
    SELECT
      c.id AS creator_id,
      'all_time' AS period,
      COUNT(cl.id) AS total_calls,
      COALESCE(AVG(CASE WHEN cl.correct_direction THEN 1.0 ELSE 0.0 END), 0) AS win_rate,
      COALESCE(AVG(cl.return_7d), 0) AS avg_return_7d,
      COALESCE(AVG(cl.return_30d), 0) AS avg_return_30d,
      COALESCE(AVG(cl.return_90d), 0) AS avg_return_90d,
      COALESCE(AVG(cl.alpha_30d), 0) AS avg_alpha_30d,
      (SELECT id FROM calls WHERE creator_id = c.id ORDER BY score DESC LIMIT 1) AS best_call_id,
      (SELECT id FROM calls WHERE creator_id = c.id ORDER BY score ASC LIMIT 1) AS worst_call_id,
      COALESCE(AVG(CASE WHEN cl.hit_target THEN 1.0 ELSE 0.0 END), 0) AS hit_rate,
      (SELECT symbol FROM calls WHERE creator_id = c.id
       GROUP BY symbol ORDER BY COUNT(*) DESC LIMIT 1) AS most_called_symbol,
      COALESCE(1.0 - STDDEV_POP(cl.score) / NULLIF(AVG(cl.score), 0), 0) AS strategy_consistency,
      COALESCE(AVG(cl.specificity_score), 0) AS specificity_avg,
      COALESCE(AVG(cl.score), 0) AS alpha_score,
      NOW() AS updated_at
    FROM creators c
    LEFT JOIN calls cl ON cl.creator_id = c.id
    GROUP BY c.id
    ON CONFLICT (creator_id, period)
    DO UPDATE SET
      total_calls = EXCLUDED.total_calls,
      win_rate = EXCLUDED.win_rate,
      avg_return_7d = EXCLUDED.avg_return_7d,
      avg_return_30d = EXCLUDED.avg_return_30d,
      avg_return_90d = EXCLUDED.avg_return_90d,
      avg_alpha_30d = EXCLUDED.avg_alpha_30d,
      best_call_id = EXCLUDED.best_call_id,
      worst_call_id = EXCLUDED.worst_call_id,
      hit_rate = EXCLUDED.hit_rate,
      most_called_symbol = EXCLUDED.most_called_symbol,
      strategy_consistency = EXCLUDED.strategy_consistency,
      specificity_avg = EXCLUDED.specificity_avg,
      alpha_score = EXCLUDED.alpha_score,
      updated_at = EXCLUDED.updated_at`,
  );

  // Repeat for 90d and 30d periods
  for (const periodConfig of [
    { period: "90d", days: 90 },
    { period: "30d", days: 30 },
  ] as const) {
    await query<AffectedRow>(
      `INSERT INTO creator_stats (creator_id, period, total_calls, win_rate,
        avg_return_7d, avg_return_30d, avg_return_90d, avg_alpha_30d,
        best_call_id, worst_call_id, hit_rate, most_called_symbol,
        strategy_consistency, specificity_avg, alpha_score, updated_at)
      SELECT
        c.id AS creator_id,
        $1 AS period,
        COUNT(cl.id) AS total_calls,
        COALESCE(AVG(CASE WHEN cl.correct_direction THEN 1.0 ELSE 0.0 END), 0) AS win_rate,
        COALESCE(AVG(cl.return_7d), 0) AS avg_return_7d,
        COALESCE(AVG(cl.return_30d), 0) AS avg_return_30d,
        COALESCE(AVG(cl.return_90d), 0) AS avg_return_90d,
        COALESCE(AVG(cl.alpha_30d), 0) AS avg_alpha_30d,
        (SELECT id FROM calls WHERE creator_id = c.id
         AND call_date >= NOW() - make_interval(days => $2)
         ORDER BY score DESC LIMIT 1) AS best_call_id,
        (SELECT id FROM calls WHERE creator_id = c.id
         AND call_date >= NOW() - make_interval(days => $2)
         ORDER BY score ASC LIMIT 1) AS worst_call_id,
        COALESCE(AVG(CASE WHEN cl.hit_target THEN 1.0 ELSE 0.0 END), 0) AS hit_rate,
        (SELECT symbol FROM calls WHERE creator_id = c.id
         AND call_date >= NOW() - make_interval(days => $2)
         GROUP BY symbol ORDER BY COUNT(*) DESC LIMIT 1) AS most_called_symbol,
        COALESCE(1.0 - STDDEV_POP(cl.score) / NULLIF(AVG(cl.score), 0), 0) AS strategy_consistency,
        COALESCE(AVG(cl.specificity_score), 0) AS specificity_avg,
        COALESCE(AVG(cl.score), 0) AS alpha_score,
        NOW() AS updated_at
      FROM creators c
      LEFT JOIN calls cl ON cl.creator_id = c.id
        AND cl.call_date >= NOW() - make_interval(days => $2)
      GROUP BY c.id
      ON CONFLICT (creator_id, period)
      DO UPDATE SET
        total_calls = EXCLUDED.total_calls,
        win_rate = EXCLUDED.win_rate,
        avg_return_7d = EXCLUDED.avg_return_7d,
        avg_return_30d = EXCLUDED.avg_return_30d,
        avg_return_90d = EXCLUDED.avg_return_90d,
        avg_alpha_30d = EXCLUDED.avg_alpha_30d,
        best_call_id = EXCLUDED.best_call_id,
        worst_call_id = EXCLUDED.worst_call_id,
        hit_rate = EXCLUDED.hit_rate,
        most_called_symbol = EXCLUDED.most_called_symbol,
        strategy_consistency = EXCLUDED.strategy_consistency,
        specificity_avg = EXCLUDED.specificity_avg,
        alpha_score = EXCLUDED.alpha_score,
        updated_at = EXCLUDED.updated_at`,
      [periodConfig.period, periodConfig.days],
    );
  }

  return {
    step: "recompute_stats",
    status: "completed",
    message: "Stats recomputed for all periods",
    duration_ms: Date.now() - start,
  };
}

async function stepUpdateRankings(): Promise<StepResult> {
  const start = Date.now();

  // Update accuracy_rank in creator_stats using a window function
  await query<AffectedRow>(
    `UPDATE creator_stats cs
     SET accuracy_rank = ranked.rn
     FROM (
       SELECT id, ROW_NUMBER() OVER (
         PARTITION BY period
         ORDER BY alpha_score DESC
       ) AS rn
       FROM creator_stats
     ) ranked
     WHERE cs.id = ranked.id`,
  );

  // Sync ranks back to creators table from all_time stats
  await query<AffectedRow>(
    `UPDATE creators c
     SET accuracy_rank = cs.accuracy_rank,
         total_calls = cs.total_calls,
         win_rate = cs.win_rate,
         avg_return = cs.avg_return_30d,
         alpha_score = cs.alpha_score
     FROM creator_stats cs
     WHERE cs.creator_id = c.id
       AND cs.period = 'all_time'`,
  );

  // Update creator tiers based on new rankings
  await query<AffectedRow>(
    `UPDATE creators
     SET tier = CASE
       WHEN accuracy_rank BETWEEN 1 AND 5 THEN 'elite'
       WHEN accuracy_rank BETWEEN 6 AND 10 THEN 'pro'
       ELSE 'free'
     END`,
  );

  return {
    step: "update_rankings",
    status: "completed",
    message: "Rankings and tiers updated",
    duration_ms: Date.now() - start,
  };
}

async function stepDetectConsensus(): Promise<StepResult> {
  const start = Date.now();

  // Find symbols where N+ top creators made calls in the same direction
  // within the consensus window
  await query<AffectedRow>(
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
      AND c.accuracy_rank IS NOT NULL
      AND c.accuracy_rank <= 10
    GROUP BY cl.symbol, cl.direction
    HAVING COUNT(DISTINCT cl.creator_id) >= $2
    ON CONFLICT DO NOTHING`,
    [CONSENSUS_WINDOW_DAYS, CONSENSUS_MIN_CREATORS],
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
