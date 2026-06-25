import { query as defaultQuery } from "./db";

export type HardeningStatus = "pass" | "warn" | "block";
export type ReadinessStatus = "green" | "warn" | "blocked";

type QueryFn = <T>(text: string, params?: unknown[]) => Promise<T[]>;

export interface HardeningCheck {
  readonly id: string;
  readonly status: HardeningStatus;
  readonly summary: string;
  readonly metrics: Record<string, unknown>;
  readonly next_action: string;
}

export interface PipelineGuardAudit {
  readonly generated_at: string;
  readonly checks: readonly HardeningCheck[];
  readonly overall_status: HardeningStatus;
  readonly core_pipeline_status: ReadinessStatus;
  readonly transition_readiness: ReadinessStatus;
  readonly storm_readiness: ReadinessStatus;
  readonly public_publish_readiness: ReadinessStatus;
  readonly markov_readiness?: ReadinessStatus;
}

function maxStatus(statuses: readonly HardeningStatus[]): HardeningStatus {
  if (statuses.includes("block")) return "block";
  if (statuses.includes("warn")) return "warn";
  return "pass";
}


function statusFor(checks: readonly HardeningCheck[], id: string): HardeningStatus | null {
  return checks.find((check) => check.id === id)?.status ?? null;
}

function readinessFromChecks(checks: readonly HardeningCheck[], warnIds: readonly string[], blockIds: readonly string[] = []): ReadinessStatus {
  if (blockIds.some((id) => statusFor(checks, id) === "block")) return "blocked";
  if (warnIds.some((id) => statusFor(checks, id) !== "pass")) return "warn";
  return "green";
}

export function derivePipelineReadinessClasses(checks: readonly HardeningCheck[]): Pick<PipelineGuardAudit, "core_pipeline_status" | "transition_readiness" | "storm_readiness" | "public_publish_readiness" | "markov_readiness"> {
  return {
    core_pipeline_status: readinessFromChecks(checks, ["pending_candle_refresh"]),
    transition_readiness: readinessFromChecks(checks, ["creator_stats_30d", "ml_verifier_label_integrity", "daily_closes_lag", "creator_news_channel_exclusion"]),
    storm_readiness: readinessFromChecks(checks, ["ml_verifier_label_integrity", "creator_news_channel_exclusion", "transcript_collect_laptop"]),
    public_publish_readiness: readinessFromChecks(checks, ["creator_stats_30d", "ml_promotion_state", "transcript_collect_laptop", "daily_closes_lag", "ml_verifier_label_integrity", "creator_news_channel_exclusion", "pending_candle_refresh"]),
    markov_readiness: readinessFromChecks(checks, ["transition_state_coverage"], ["markov_sparsity_block"]),
  };
}

function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

interface CreatorStatsRiskRow {
  readonly stats_rows: string | number;
  readonly max_total_calls: string | number | null;
  readonly matured_recent_calls: string | number;
  readonly matured_recent_creators: string | number;
}

export async function auditCreatorStats30d(queryFn: QueryFn): Promise<HardeningCheck> {
  const [row] = await queryFn<CreatorStatsRiskRow>(`
    WITH period_stats AS (
      SELECT COUNT(*) AS stats_rows, COALESCE(MAX(total_calls), 0) AS max_total_calls
      FROM creator_stats
      WHERE period = '30d'
    ), matured_recent AS (
      SELECT COUNT(*) AS matured_recent_calls, COUNT(DISTINCT creator_id) AS matured_recent_creators
      FROM calls
      WHERE call_date >= NOW() - INTERVAL '60 days'
        AND call_date < NOW() - INTERVAL '30 days'
        AND price_at_call IS NOT NULL
        AND return_30d IS NOT NULL
        AND price_30d IS NOT NULL
        AND extraction_confidence >= 0.7
        AND (target_price IS NULL OR (call_date <= NOW() - INTERVAL '90 days' AND price_90d IS NOT NULL AND hit_target IS NOT NULL))
    )
    SELECT period_stats.stats_rows::text, period_stats.max_total_calls::text,
           matured_recent.matured_recent_calls::text, matured_recent.matured_recent_creators::text
    FROM period_stats CROSS JOIN matured_recent
  `);
  const statsRows = num(row?.stats_rows);
  const maxTotalCalls = num(row?.max_total_calls);
  const maturedRecentCalls = num(row?.matured_recent_calls);
  const status: HardeningStatus = statsRows > 0 && maxTotalCalls === 0 ? "warn" : "pass";
  return {
    id: "creator_stats_30d",
    status,
    summary: status === "warn"
      ? "creator_stats.30d is present but empty; do not use it for transition modelling."
      : "creator_stats.30d has non-zero call coverage.",
    metrics: {
      stats_rows: statsRows,
      max_total_calls: maxTotalCalls,
      matured_recent_calls: maturedRecentCalls,
      matured_recent_creators: num(row?.matured_recent_creators),
    },
    next_action: status === "warn"
      ? "Derive Markov/trajectory windows from raw calls, or redefine 30d stats as a matured recent cohort before using it."
      : "Safe to inspect 30d stats, but still prefer raw-call snapshots for transition backtests.",
  };
}

interface PromotionStateRow {
  readonly status: string | null;
  readonly count: string | number;
}

export async function auditMlPromotionState(queryFn: QueryFn): Promise<HardeningCheck> {
  const rows = await queryFn<PromotionStateRow>(`
    SELECT status, COUNT(*)::text AS count
    FROM ml_promotion_audit
    GROUP BY status
    ORDER BY status
  `);
  const byStatus = Object.fromEntries(rows.map((row) => [row.status ?? "unknown", num(row.count)]));
  const succeeded = byStatus.succeeded ?? 0;
  const status: HardeningStatus = succeeded > 0 ? "pass" : "warn";
  return {
    id: "ml_promotion_state",
    status,
    summary: succeeded > 0
      ? "ML promotion has at least one successful gated write."
      : "ML verifier promotion has not gone live beyond dry-run/block states.",
    metrics: byStatus,
    next_action: succeeded > 0
      ? "Keep promotion gated and monitor audit rows."
      : "Treat ml_verification_runs as audit/eval evidence only; do not train or mutate from promoted labels until a gated promotion canary exists.",
  };
}

interface TranscriptJobStateRow {
  readonly status: string;
  readonly count: string | number;
  readonly latest_updated_at: string | null;
}

export async function auditTranscriptLane(queryFn: QueryFn): Promise<HardeningCheck> {
  const rows = await queryFn<TranscriptJobStateRow>(`
    SELECT status, COUNT(*)::text AS count, MAX(updated_at)::text AS latest_updated_at
    FROM pipeline_jobs
    WHERE type = 'transcript_collect_laptop'
    GROUP BY status
    ORDER BY status
  `);
  const byStatus = Object.fromEntries(rows.map((row) => [row.status, num(row.count)]));
  const failed = byStatus.failed ?? 0;
  const status: HardeningStatus = failed > 0 ? "warn" : "pass";
  return {
    id: "transcript_collect_laptop",
    status,
    summary: failed > 0
      ? "Laptop transcript collection has failed jobs; keep this lane monitored/cooldown-bound."
      : "Laptop transcript collection has no failed jobs in pipeline_jobs.",
    metrics: { by_status: byStatus, latest_updated_at: rows.map((row) => row.latest_updated_at).filter(Boolean).sort().at(-1) ?? null },
    next_action: failed > 0
      ? "Do not make transcript collection a hard blocker for scoring/Markov; route to callscore-gemma-transcript-head and cooldown-aware workplane checks."
      : "Continue monitoring transcript collection separately from scored-call/candle health.",
  };
}

interface CandleJobRow {
  readonly pending: string | number;
  readonly oldest_pending_at: string | null;
}

interface DailyCloseLagRow {
  readonly latest_candle_day: string | null;
  readonly latest_daily_close_day: string | null;
  readonly lag_days: string | number | null;
}

export async function auditCandleRefreshAndDailyCloses(queryFn: QueryFn): Promise<readonly HardeningCheck[]> {
  const [job] = await queryFn<CandleJobRow>(`
    SELECT COUNT(*) FILTER (WHERE status = 'pending')::text AS pending,
           MIN(created_at) FILTER (WHERE status = 'pending')::text AS oldest_pending_at
    FROM pipeline_jobs
    WHERE type = 'candle_refresh'
  `);
  const [lag] = await queryFn<DailyCloseLagRow>(`
    SELECT MAX(to_timestamp(open_time / 1000.0)::date)::text AS latest_candle_day,
           (SELECT MAX(day)::text FROM candle_daily_closes) AS latest_daily_close_day,
           (MAX(to_timestamp(open_time / 1000.0)::date) - (SELECT MAX(day) FROM candle_daily_closes))::text AS lag_days
    FROM candles
  `);
  const pending = num(job?.pending);
  const lagDays = num(lag?.lag_days);
  return [
    {
      id: "pending_candle_refresh",
      status: pending > 0 ? "warn" : "pass",
      summary: pending > 0 ? "There are pending candle_refresh jobs." : "No pending candle_refresh jobs.",
      metrics: { pending, oldest_pending_at: job?.oldest_pending_at ?? null },
      next_action: pending > 0
        ? "Let Hermes worker claim it, or run a bounded worker-once after confirming no other worker owns the queue."
        : "No action required.",
    },
    {
      id: "daily_closes_lag",
      status: lagDays > 2 ? "warn" : "pass",
      summary: lagDays > 2
        ? "candle_daily_closes lags the one-minute candle lake; avoid daily-close regime modelling until refreshed or use raw candles."
        : "candle_daily_closes is close enough to the minute candle lake for daily modelling.",
      metrics: {
        latest_candle_day: lag?.latest_candle_day ?? null,
        latest_daily_close_day: lag?.latest_daily_close_day ?? null,
        lag_days: lagDays,
      },
      next_action: lagDays > 2
        ? "Use raw candles/hourly candles for Markov features or run the derived-close refresh after explicit DB-write approval."
        : "Daily close features can be considered, with normal freshness checks.",
    },
  ];
}

interface VerifierAnomalyRow {
  readonly anomalous_approvals: string | number;
  readonly total_approvals: string | number;
}

interface VerifierAnomalyBreakdownRow {
  readonly reason_code: string;
  readonly count: string | number;
}

export async function auditMlVerifierAnomalies(queryFn: QueryFn): Promise<HardeningCheck> {
  const [summary] = await queryFn<VerifierAnomalyRow>(`
    SELECT COUNT(*) FILTER (WHERE decision = 'approve' AND reason_code <> 'valid_call')::text AS anomalous_approvals,
           COUNT(*) FILTER (WHERE decision = 'approve')::text AS total_approvals
    FROM ml_verification_runs
  `);
  const breakdown = await queryFn<VerifierAnomalyBreakdownRow>(`
    SELECT reason_code, COUNT(*)::text AS count
    FROM ml_verification_runs
    WHERE decision = 'approve' AND reason_code <> 'valid_call'
    GROUP BY reason_code
    ORDER BY COUNT(*) DESC, reason_code ASC
  `);
  const anomalous = num(summary?.anomalous_approvals);
  const status: HardeningStatus = anomalous > 0 ? "warn" : "pass";
  return {
    id: "ml_verifier_label_integrity",
    status,
    summary: status === "warn"
      ? "ML verifier contains approve rows with non-valid reason codes; do not treat verifier labels as clean training truth."
      : "No anomalous approve/non-valid verifier labels found.",
    metrics: {
      anomalous_approvals: anomalous,
      total_approvals: num(summary?.total_approvals),
      breakdown: Object.fromEntries(breakdown.map((row) => [row.reason_code, num(row.count)])),
    },
    next_action: status === "warn"
      ? "Add a label-cleaning view/rule before training; only approve+valid_call with evidence should be positive labels."
      : "Verifier labels can be used with normal audit caveats.",
  };
}

interface CreatorTaxonomyColumnRow {
  readonly column_name: string;
}

interface NewsCandidateRow {
  readonly candidate_news_channels: string | number;
  readonly with_calls: string | number;
  readonly ranked_snapshot: string | number;
}

export async function auditCreatorEligibilityTaxonomy(queryFn: QueryFn): Promise<HardeningCheck> {
  const columns = await queryFn<CreatorTaxonomyColumnRow>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'creators'
      AND column_name IN ('entity_type', 'is_news_channel', 'eligible_for_creator_scoring')
    ORDER BY column_name
  `);
  const [news] = await queryFn<NewsCandidateRow>(`
    SELECT COUNT(*)::text AS candidate_news_channels,
           COUNT(*) FILTER (WHERE total_calls > 0)::text AS with_calls,
           COUNT(*) FILTER (WHERE accuracy_rank IS NOT NULL)::text AS ranked_snapshot
    FROM creators
    WHERE lower(COALESCE(focus, '')) LIKE '%news%'
       OR lower(COALESCE(focus, '')) LIKE '%journalism%'
       OR lower(COALESCE(focus, '')) LIKE '%headline%'
       OR lower(COALESCE(focus, '')) LIKE '%media%'
  `);
  const hasFormalColumns = columns.length === 3;
  const candidateNews = num(news?.candidate_news_channels);
  const rankedSnapshot = num(news?.ranked_snapshot);
  const status: HardeningStatus = !hasFormalColumns || rankedSnapshot > 0 ? "warn" : "pass";
  return {
    id: "creator_news_channel_exclusion",
    status,
    summary: status === "warn"
      ? "Creator taxonomy does not yet fully enforce news-channel exclusion from creator modelling."
      : "Creator taxonomy has formal exclusion columns and no candidate news channels ranked in snapshot.",
    metrics: {
      formal_columns_present: columns.map((row) => row.column_name),
      candidate_news_channels: candidateNews,
      candidate_news_with_calls: num(news?.with_calls),
      candidate_news_ranked_snapshot: rankedSnapshot,
    },
    next_action: "Before Markov/STORM productization, use an explicit eligibility filter: creator/caller only, not news/media; add formal columns or a reviewed exclusion manifest.",
  };
}

export async function auditMarkovReadiness(queryFn: QueryFn): Promise<HardeningCheck> {
  const [row] = await queryFn<{ transition_creators: string | number; total_observations: string | number; sparse_rows: string | number }>(`
    WITH counted AS (
      SELECT creator_id, COUNT(*) AS obs
      FROM transition_state_records
      GROUP BY creator_id
    ), sparse AS (
      SELECT state, COUNT(*) AS cnt
      FROM transition_state_records
      GROUP BY state
      HAVING COUNT(*) < 10
    )
    SELECT
      COUNT(DISTINCT creator_id)::text AS transition_creators,
      COUNT(*)::text AS total_observations,
      (SELECT COUNT(*) FROM sparse)::text AS sparse_rows
    FROM transition_state_records
  `);
  const totalObs = num(row?.total_observations);
  const sparseRowCount = num(row?.sparse_rows);
  const creatorCount = num(row?.transition_creators);

  let status: HardeningStatus = "block";
  let summary = "No transition state records found — cannot build Markov matrix.";
  let nextAction = "Run transition-state-classifier first to produce transition state records.";

  if (totalObs >= 200 && sparseRowCount === 0) {
    status = "pass";
    summary = `Markov readiness: ${totalObs} observations across ${creatorCount} creators, no sparse rows.`;
    nextAction = "Markov matrix can be built reliably. Run markov-head for trajectory predictions.";
  } else if (totalObs >= 50) {
    status = "warn";
    summary = `Markov readiness: ${totalObs} observations, ${sparseRowCount} sparse states — treat predictions as preliminary.`;
    nextAction = sparseRowCount > 0
      ? "Increase transition snapshot cadence to fill sparse states before relying on Markov predictions."
      : "Continue monitoring; more observations improve prediction accuracy.";
  } else if (totalObs > 0) {
    status = "warn";
    summary = `Markov readiness: only ${totalObs} observations — insufficient for reliable transition matrix.`;
    nextAction = "Run more transition snapshots (weekly/monthly) until 50+ observations accumulate.";
  }

  return {
    id: "transition_state_coverage",
    status,
    summary,
    metrics: {
      total_observations: totalObs,
      creator_count: creatorCount,
      sparse_state_rows: sparseRowCount,
    },
    next_action: nextAction,
  };
}

export async function runPipelineGuardAudit(
  queryFn: QueryFn = defaultQuery,
  now = new Date(),
): Promise<PipelineGuardAudit> {
  const checks: HardeningCheck[] = [];
  checks.push(await auditCreatorStats30d(queryFn));
  checks.push(await auditMlPromotionState(queryFn));
  checks.push(await auditTranscriptLane(queryFn));
  checks.push(...await auditCandleRefreshAndDailyCloses(queryFn));
  checks.push(await auditMlVerifierAnomalies(queryFn));
  checks.push(await auditCreatorEligibilityTaxonomy(queryFn));
  checks.push(await auditMarkovReadiness(queryFn));
  const readiness = derivePipelineReadinessClasses(checks);
  return {
    generated_at: now.toISOString(),
    checks,
    overall_status: maxStatus(checks.map((check) => check.status)),
    ...readiness,
  };
}
