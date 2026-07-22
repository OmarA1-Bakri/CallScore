import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const LEADERBOARD_SENTINEL_V2_SNAPSHOT_SCHEMA = "callscore.sentinel.leaderboard_snapshot.v2" as const;
export const LEADERBOARD_SENTINEL_V2_RECEIPT_SCHEMA = "callscore.sentinel.read_only_scan_receipt.v2" as const;
export const LEADERBOARD_SENTINEL_MAX_ROWS = 100 as const;

export interface LeaderboardSentinelRow {
  readonly creator_id: number;
  readonly creator_name: string;
  readonly period: string;
  readonly rank: number | null;
  readonly alpha_score: number | null;
  readonly effective_n: number | null;
  readonly total_calls: number | null;
  readonly updated_at: string | null;
}

export interface LeaderboardSentinelOperational {
  readonly latest_pipeline_status: string | null;
  readonly latest_pipeline_finished_at: string | null;
  readonly failed_pipeline_runs_24h: number;
  readonly failed_pipeline_jobs_24h: number;
  readonly active_pipeline_jobs: number;
  readonly pending_transcripts: number;
  readonly failed_transcripts: number;
}

export interface LeaderboardSentinelSnapshotSection {
  readonly period: "12m" | "all_time";
  readonly source_row_count: number;
  readonly retained_row_count: number;
  readonly coverage_limit: typeof LEADERBOARD_SENTINEL_MAX_ROWS;
  readonly coverage_complete_for_available_population: boolean;
  readonly rows: readonly LeaderboardSentinelRow[];
}

export interface LeaderboardSentinelSnapshotV2 {
  readonly schema: typeof LEADERBOARD_SENTINEL_V2_SNAPSHOT_SCHEMA;
  readonly generated_at_utc: string;
  readonly snapshot_hash: string;
  readonly public_leaderboard: LeaderboardSentinelSnapshotSection;
  readonly internal_leaderboard: LeaderboardSentinelSnapshotSection;
  readonly operational: LeaderboardSentinelOperational | null;
  readonly mutation_flags: {
    readonly db_write_performed: false;
    readonly provider_mutation_performed: false;
    readonly external_mutation_performed: false;
  };
}

export interface LeaderboardRankChange {
  readonly creator_id: number;
  readonly creator_name: string;
  readonly previous_rank: number;
  readonly current_rank: number;
  readonly delta: number;
}

export interface LeaderboardScoreMovement {
  readonly creator_id: number;
  readonly creator_name: string;
  readonly previous_score: number;
  readonly current_score: number;
  readonly delta: number;
}

export interface LeaderboardEntryChange {
  readonly creator_id: number;
  readonly creator_name: string;
  readonly rank: number | null;
  readonly alpha_score: number | null;
}

export interface LeaderboardSectionChanges {
  readonly rank_changes: readonly LeaderboardRankChange[];
  readonly score_movements: readonly LeaderboardScoreMovement[];
  readonly new_entrants: readonly LeaderboardEntryChange[];
  readonly exits: readonly LeaderboardEntryChange[];
}

export interface LeaderboardSentinelAlert {
  readonly severity: "INFO" | "AMBER" | "RED";
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface LeaderboardSentinelReceiptV2 {
  readonly schema: typeof LEADERBOARD_SENTINEL_V2_RECEIPT_SCHEMA;
  readonly status: "GREEN_NO_CHANGES" | "AMBER_CHANGES_OR_ANOMALIES" | "RED_INTEGRITY_OR_PIPELINE_FAILURE";
  readonly workflow_status: "READ_ONLY_SCAN_COMPLETED" | "READ_ONLY_SCAN_BOOTSTRAPPED";
  readonly agent: "callscore-sentinel";
  readonly mode: "READ_ONLY_NO_MUTATION";
  readonly generated_at_utc: string;
  readonly mutation_flags: LeaderboardSentinelSnapshotV2["mutation_flags"];
  readonly changes_detected: {
    readonly baseline_status: "bootstrapped_no_prior_v2" | "compared_to_prior_v2";
    readonly comparison_coverage: "full_retained_top_100" | "no_prior_v2_baseline";
    readonly public_12m: LeaderboardSectionChanges;
    readonly internal_all_time: LeaderboardSectionChanges;
  };
  readonly alerts: readonly LeaderboardSentinelAlert[];
  readonly blockers: readonly string[];
  readonly next_action: string;
  readonly snapshot_path: string;
  readonly previous_snapshot_path: string | null;
}

interface BuildInput {
  readonly generatedAt: string;
  readonly publicRows: readonly LeaderboardSentinelRow[];
  readonly internalRows: readonly LeaderboardSentinelRow[];
  readonly previousSnapshot: LeaderboardSentinelSnapshotV2 | null;
  readonly scoreMovementThreshold?: number;
  readonly operational: LeaderboardSentinelOperational | null;
}

interface PersistInput extends Omit<BuildInput, "previousSnapshot"> {
  readonly outputRoot: string;
}

export interface LeaderboardSentinelV2Result {
  readonly snapshot: LeaderboardSentinelSnapshotV2;
  readonly receipt: LeaderboardSentinelReceiptV2;
}

const NO_MUTATION_FLAGS = {
  db_write_performed: false,
  provider_mutation_performed: false,
  external_mutation_performed: false,
} as const;

function finiteNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function rounded(value: number): number {
  return Number(value.toFixed(12));
}

function stableHash(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function retainedRows(rows: readonly LeaderboardSentinelRow[]): readonly LeaderboardSentinelRow[] {
  return [...rows]
    .sort((left, right) => {
      const leftRank = finiteNumber(left.rank) ? left.rank : Number.MAX_SAFE_INTEGER;
      const rightRank = finiteNumber(right.rank) ? right.rank : Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || left.creator_id - right.creator_id;
    })
    .slice(0, LEADERBOARD_SENTINEL_MAX_ROWS);
}

function section(period: "12m" | "all_time", rows: readonly LeaderboardSentinelRow[]): LeaderboardSentinelSnapshotSection {
  const retained = retainedRows(rows);
  return {
    period,
    source_row_count: rows.length,
    retained_row_count: retained.length,
    coverage_limit: LEADERBOARD_SENTINEL_MAX_ROWS,
    coverage_complete_for_available_population: rows.length <= LEADERBOARD_SENTINEL_MAX_ROWS,
    rows: retained,
  };
}

function emptyChanges(): LeaderboardSectionChanges {
  return { rank_changes: [], score_movements: [], new_entrants: [], exits: [] };
}

function compareRows(
  current: readonly LeaderboardSentinelRow[],
  previous: readonly LeaderboardSentinelRow[] | null,
  scoreMovementThreshold: number,
): LeaderboardSectionChanges {
  if (!previous) return emptyChanges();
  const currentMap = new Map(current.map((item) => [item.creator_id, item]));
  const previousMap = new Map(previous.map((item) => [item.creator_id, item]));
  const rankChanges: LeaderboardRankChange[] = [];
  const scoreMovements: LeaderboardScoreMovement[] = [];
  const newEntrants: LeaderboardEntryChange[] = [];
  const exits: LeaderboardEntryChange[] = [];

  for (const currentRow of current) {
    const prior = previousMap.get(currentRow.creator_id);
    if (!prior) {
      newEntrants.push({ creator_id: currentRow.creator_id, creator_name: currentRow.creator_name, rank: currentRow.rank, alpha_score: currentRow.alpha_score });
      continue;
    }
    if (finiteNumber(currentRow.rank) && finiteNumber(prior.rank) && currentRow.rank !== prior.rank) {
      rankChanges.push({
        creator_id: currentRow.creator_id,
        creator_name: currentRow.creator_name,
        previous_rank: prior.rank,
        current_rank: currentRow.rank,
        delta: prior.rank - currentRow.rank,
      });
    }
    if (finiteNumber(currentRow.alpha_score) && finiteNumber(prior.alpha_score)) {
      const delta = rounded(currentRow.alpha_score - prior.alpha_score);
      if (Math.abs(delta) >= scoreMovementThreshold) {
        scoreMovements.push({
          creator_id: currentRow.creator_id,
          creator_name: currentRow.creator_name,
          previous_score: prior.alpha_score,
          current_score: currentRow.alpha_score,
          delta,
        });
      }
    }
  }

  for (const prior of previous) {
    if (!currentMap.has(prior.creator_id)) {
      exits.push({ creator_id: prior.creator_id, creator_name: prior.creator_name, rank: prior.rank, alpha_score: prior.alpha_score });
    }
  }

  return {
    rank_changes: rankChanges.sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta) || left.creator_id - right.creator_id),
    score_movements: scoreMovements.sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta) || left.creator_id - right.creator_id),
    new_entrants: newEntrants.sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER)),
    exits: exits.sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER)),
  };
}

function anomalyAlerts(
  publicSection: LeaderboardSentinelSnapshotSection,
  internalSection: LeaderboardSentinelSnapshotSection,
  operational: LeaderboardSentinelOperational | null,
  generatedAt: string,
): LeaderboardSentinelAlert[] {
  const alerts: LeaderboardSentinelAlert[] = [];
  for (const [label, current] of [["public_12m", publicSection], ["internal_all_time", internalSection]] as const) {
    const rankCounts = new Map<number, number>();
    let invalidMetricRows = 0;
    let lowEffectiveSampleRows = 0;
    for (const item of current.rows) {
      if (finiteNumber(item.rank)) rankCounts.set(item.rank, (rankCounts.get(item.rank) ?? 0) + 1);
      if (!finiteNumber(item.alpha_score) || !finiteNumber(item.rank)) invalidMetricRows += 1;
      if (finiteNumber(item.effective_n) && item.effective_n < 30) lowEffectiveSampleRows += 1;
    }
    const duplicateRanks = [...rankCounts.entries()].filter(([, count]) => count > 1).map(([rank]) => rank);
    if (duplicateRanks.length > 0) {
      alerts.push({ severity: "RED", code: "DUPLICATE_RANKS", message: `${label} contains duplicate ranks.`, details: { section: label, ranks: duplicateRanks } });
    }
    if (invalidMetricRows > 0) {
      alerts.push({ severity: "RED", code: "INVALID_METRIC_ROWS", message: `${label} contains non-finite or missing rank/score metrics.`, details: { section: label, count: invalidMetricRows } });
    }
    if (lowEffectiveSampleRows > 0) {
      alerts.push({ severity: "AMBER", code: "LOW_EFFECTIVE_SAMPLE", message: `${label} contains creators with effective_n below 30.`, details: { section: label, count: lowEffectiveSampleRows } });
    }
    if (current.source_row_count === 0) {
      alerts.push({ severity: "RED", code: "LEADERBOARD_EMPTY", message: `${label} has no ranked creators.`, details: { section: label } });
    } else if (current.source_row_count < LEADERBOARD_SENTINEL_MAX_ROWS) {
      alerts.push({ severity: "INFO", code: "RANKED_POPULATION_BELOW_100", message: `${label} has ${current.source_row_count} ranked creators; snapshot still retains complete available population.`, details: { section: label, ranked_count: current.source_row_count, missing_to_100: LEADERBOARD_SENTINEL_MAX_ROWS - current.source_row_count } });
    }
  }

  if (!operational) {
    alerts.push({ severity: "RED", code: "OPERATIONAL_STATE_MISSING", message: "Pipeline operational state is unavailable." });
  } else {
    if (!operational.latest_pipeline_status) {
      alerts.push({ severity: "RED", code: "LATEST_PIPELINE_STATUS_MISSING", message: "Latest scoring pipeline status is missing." });
    } else if (operational.latest_pipeline_status !== "succeeded") {
      alerts.push({ severity: "RED", code: "LATEST_PIPELINE_NOT_SUCCEEDED", message: `Latest scoring pipeline status is ${operational.latest_pipeline_status}.` });
    }
    const generatedMs = Date.parse(generatedAt);
    const finishedMs = Date.parse(operational.latest_pipeline_finished_at ?? "");
    if (!Number.isFinite(finishedMs)) {
      alerts.push({ severity: "RED", code: "LATEST_PIPELINE_FINISH_MISSING", message: "Latest scoring pipeline completion time is missing or invalid." });
    } else if (Number.isFinite(generatedMs) && generatedMs - finishedMs > 6 * 60 * 60_000) {
      alerts.push({ severity: "RED", code: "LATEST_PIPELINE_STALE", message: "Latest scoring pipeline completion is older than six hours.", details: { latest_pipeline_finished_at: operational.latest_pipeline_finished_at } });
    }
    if (operational.active_pipeline_jobs > 0) {
      alerts.push({ severity: "AMBER", code: "PIPELINE_JOBS_ACTIVE", message: "Pipeline jobs remain active during the sentinel scan.", details: { active_pipeline_jobs: operational.active_pipeline_jobs } });
    }
    if (operational.failed_pipeline_runs_24h > 0 || operational.failed_pipeline_jobs_24h > 0) {
      alerts.push({ severity: "RED", code: "PIPELINE_FAILURES_24H", message: "Pipeline failures detected in last 24 hours.", details: { failed_pipeline_runs_24h: operational.failed_pipeline_runs_24h, failed_pipeline_jobs_24h: operational.failed_pipeline_jobs_24h } });
    }
    if (operational.pending_transcripts > 1000 || operational.failed_transcripts > 1000) {
      alerts.push({ severity: "AMBER", code: "TRANSCRIPT_BACKLOG_HIGH", message: "Transcript pending/failed population exceeds monitoring threshold.", details: { pending_transcripts: operational.pending_transcripts, failed_transcripts: operational.failed_transcripts } });
    }
  }
  return alerts;
}

function hasChanges(changes: LeaderboardSectionChanges): boolean {
  return changes.rank_changes.length > 0 || changes.score_movements.length > 0 || changes.new_entrants.length > 0 || changes.exits.length > 0;
}

export function buildLeaderboardSentinelV2(input: BuildInput): LeaderboardSentinelV2Result {
  const publicLeaderboard = section("12m", input.publicRows);
  const internalLeaderboard = section("all_time", input.internalRows);
  const snapshotBody = {
    schema: LEADERBOARD_SENTINEL_V2_SNAPSHOT_SCHEMA,
    generated_at_utc: input.generatedAt,
    public_leaderboard: publicLeaderboard,
    internal_leaderboard: internalLeaderboard,
    operational: input.operational,
    mutation_flags: NO_MUTATION_FLAGS,
  } as const;
  const snapshot: LeaderboardSentinelSnapshotV2 = {
    ...snapshotBody,
    snapshot_hash: stableHash(snapshotBody),
  };
  const threshold = input.scoreMovementThreshold ?? 0.5;
  const publicChanges = compareRows(publicLeaderboard.rows, input.previousSnapshot?.public_leaderboard.rows ?? null, threshold);
  const internalChanges = compareRows(internalLeaderboard.rows, input.previousSnapshot?.internal_leaderboard.rows ?? null, threshold);
  const alerts = anomalyAlerts(publicLeaderboard, internalLeaderboard, input.operational, input.generatedAt);
  if (hasChanges(publicChanges) || hasChanges(internalChanges)) {
    alerts.unshift({
      severity: "AMBER",
      code: "LEADERBOARD_CHANGES_DETECTED",
      message: "Rank, score, entrant, or exit changes detected against prior v2 snapshot.",
      details: {
        public_rank_changes: publicChanges.rank_changes.length,
        internal_rank_changes: internalChanges.rank_changes.length,
        public_score_movements: publicChanges.score_movements.length,
        internal_score_movements: internalChanges.score_movements.length,
      },
    });
  }
  const hasRed = alerts.some((item) => item.severity === "RED");
  const hasAmberOrChanges = alerts.some((item) => item.severity === "AMBER") || hasChanges(publicChanges) || hasChanges(internalChanges);
  const baselineStatus = input.previousSnapshot ? "compared_to_prior_v2" : "bootstrapped_no_prior_v2";
  const receipt: LeaderboardSentinelReceiptV2 = {
    schema: LEADERBOARD_SENTINEL_V2_RECEIPT_SCHEMA,
    status: hasRed ? "RED_INTEGRITY_OR_PIPELINE_FAILURE" : hasAmberOrChanges ? "AMBER_CHANGES_OR_ANOMALIES" : "GREEN_NO_CHANGES",
    workflow_status: input.previousSnapshot ? "READ_ONLY_SCAN_COMPLETED" : "READ_ONLY_SCAN_BOOTSTRAPPED",
    agent: "callscore-sentinel",
    mode: "READ_ONLY_NO_MUTATION",
    generated_at_utc: input.generatedAt,
    mutation_flags: NO_MUTATION_FLAGS,
    changes_detected: {
      baseline_status: baselineStatus,
      comparison_coverage: input.previousSnapshot ? "full_retained_top_100" : "no_prior_v2_baseline",
      public_12m: publicChanges,
      internal_all_time: internalChanges,
    },
    alerts,
    blockers: [],
    next_action: hasRed ? "route integrity or pipeline failure to owning gated workflow; keep sentinel read-only" : "continue scheduled read-only scans and retain every top-100 snapshot",
    snapshot_path: "",
    previous_snapshot_path: null,
  };
  return { snapshot, receipt };
}

function safeTimestamp(value: string): string {
  return value.replace(/[:.]/g, "-");
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function atomicJson(path: string, value: unknown): void {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

export function persistLeaderboardSentinelV2(input: PersistInput): LeaderboardSentinelV2Result {
  const snapshotDir = join(input.outputRoot, "snapshots");
  const receiptDir = join(input.outputRoot, "receipts");
  mkdirSync(snapshotDir, { recursive: true, mode: 0o700 });
  mkdirSync(receiptDir, { recursive: true, mode: 0o700 });
  const latestSnapshotPath = join(input.outputRoot, "latest-snapshot.json");
  const latestReceiptPath = join(input.outputRoot, "latest-receipt.json");
  const previousSnapshot = readJson<LeaderboardSentinelSnapshotV2>(latestSnapshotPath);
  const previousReceipt = readJson<LeaderboardSentinelReceiptV2>(latestReceiptPath);
  const built = buildLeaderboardSentinelV2({ ...input, previousSnapshot });
  const stamp = `${safeTimestamp(input.generatedAt)}-${built.snapshot.snapshot_hash.slice(0, 12)}`;
  const snapshotPath = join(snapshotDir, `leaderboard-snapshot-${stamp}.json`);
  const receiptPath = join(receiptDir, `sentinel-scan-${stamp}.json`);
  const receipt: LeaderboardSentinelReceiptV2 = {
    ...built.receipt,
    snapshot_path: snapshotPath,
    previous_snapshot_path: previousReceipt?.snapshot_path || null,
  };
  atomicJson(snapshotPath, built.snapshot);
  atomicJson(receiptPath, receipt);
  atomicJson(latestSnapshotPath, built.snapshot);
  atomicJson(latestReceiptPath, receipt);
  return { snapshot: built.snapshot, receipt };
}
