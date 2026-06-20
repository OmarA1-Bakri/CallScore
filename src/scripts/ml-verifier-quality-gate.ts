import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  completePipelineJob,
  enqueuePipelineJob,
  type PipelineJob,
} from "../lib/pipeline";
import { query as defaultQuery } from "../lib/db";
import { runMlVerifierBatch, type MlVerifierMetrics } from "../lib/ml-verifier";
import { loadEnv } from "./script-helpers";

type QueryFn = <T>(text: string, params?: unknown[]) => Promise<T[]>;

export interface MlVerifierQualityGateArgs {
  readonly sampleSize: number;
  readonly minSampleSize: number;
  readonly minimumAgreementRate: number;
  readonly maxModelFailureRate: number;
  readonly workerId: string;
  readonly model?: string;
  readonly ollamaHost?: string;
}

export interface MlVerifierQualityGateReceipt {
  readonly workflow_name: "ml_verifier_quality_gate";
  readonly schema_version: "ml_verifier_quality_gate.v1";
  readonly run_id: string;
  readonly created_at: string;
  readonly result: "passed" | "deferred";
  readonly eligible_for_activation: boolean;
  readonly audit_only: true;
  readonly sample_size: number;
  readonly min_sample_size: number;
  readonly selected: number;
  readonly processed: number;
  readonly approved: number;
  readonly rejected: number;
  readonly review: number;
  readonly publish_ready: number;
  readonly suppressed: number;
  readonly non_founder_review: number;
  readonly founder_review_required: 0;
  readonly agreement_rate: number;
  readonly minimum_agreement_rate: number;
  readonly model_failure_rate: number;
  readonly max_model_failure_rate: number;
  readonly reason_code_counts: Record<string, number>;
  readonly prompt_version: string;
  readonly provider: string;
  readonly model: string;
  readonly blockers: readonly string[];
  readonly safety: {
    readonly public_ranking_impact_allowed: false;
    readonly production_mutation_performed: false;
    readonly writes_tracked_creators: false;
    readonly publishes_buyer_facing_rankings: false;
    readonly audit_table_writes_only: true;
  };
  readonly public_ranking_impact_allowed: false;
  readonly production_mutation_performed: false;
  readonly artifact_path: string;
}

const MODEL_FAILURE_REASON_CODES = new Set([
  "model_timeout",
  "malformed_model_output",
  "model_provider_error",
]);

function clampRate(raw: string | undefined, fallback: number, name: string): number {
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a number from 0 to 1`);
  }
  return value;
}

function boundedInt(raw: string | undefined, fallback: number, min: number, max: number, name: string): number {
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function argValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function parseMlVerifierQualityGateArgs(argv = process.argv.slice(2)): MlVerifierQualityGateArgs {
  return {
    sampleSize: boundedInt(argValue(argv, "--sample-size"), 20, 1, 50, "sample-size"),
    minSampleSize: boundedInt(argValue(argv, "--min-sample-size"), 20, 1, 50, "min-sample-size"),
    minimumAgreementRate: clampRate(argValue(argv, "--minimum-agreement-rate"), 0.9, "minimum-agreement-rate"),
    maxModelFailureRate: clampRate(argValue(argv, "--max-model-failure-rate"), 0.1, "max-model-failure-rate"),
    workerId: argValue(argv, "--worker-id") ?? "ml-verifier-quality-gate",
    model: argValue(argv, "--model"),
    ollamaHost: argValue(argv, "--ollama-host"),
  };
}

export function countCapturedVerifierReasons(): {
  observeSql: (sql: string, params?: unknown[]) => void;
  reasonCodeCounts: () => Record<string, number>;
  decisionCounts: () => Record<string, number>;
} {
  const reasonCounts: Record<string, number> = {};
  const decisionCounts: Record<string, number> = {};
  return {
    observeSql(sql: string, params: unknown[] = []) {
      if (!sql.includes("INSERT INTO ml_verification_runs")) return;
      const decision = typeof params[9] === "string" ? params[9] : "unknown";
      const reasonCode = typeof params[10] === "string" ? params[10] : "unknown";
      decisionCounts[decision] = (decisionCounts[decision] ?? 0) + 1;
      reasonCounts[reasonCode] = (reasonCounts[reasonCode] ?? 0) + 1;
    },
    reasonCodeCounts() {
      return { ...reasonCounts };
    },
    decisionCounts: () => ({ ...decisionCounts }),
  };
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number((numerator / denominator).toFixed(4));
}

export function buildMlVerifierQualityGateReceipt(input: {
  readonly runId: string;
  readonly metrics: MlVerifierMetrics;
  readonly reasonCodeCounts: Record<string, number>;
  readonly sampleSize: number;
  readonly minSampleSize: number;
  readonly minimumAgreementRate: number;
  readonly maxModelFailureRate: number;
  readonly receiptPath: string;
  readonly createdAt?: string;
}): MlVerifierQualityGateReceipt {
  const processed = Number(input.metrics.processed ?? 0);
  const modelFailures = Object.entries(input.reasonCodeCounts)
    .filter(([reasonCode]) => MODEL_FAILURE_REASON_CODES.has(reasonCode))
    .reduce((sum, [, count]) => sum + Number(count), 0);
  const agreementRate = ratio(Math.max(0, processed - modelFailures), processed);
  const modelFailureRate = ratio(modelFailures, processed);
  const blockers: string[] = [];

  if (input.sampleSize < input.minSampleSize || processed < input.minSampleSize) blockers.push("sample_size_below_minimum");
  if (agreementRate < input.minimumAgreementRate) blockers.push("agreement_rate_below_threshold");
  if (modelFailureRate > input.maxModelFailureRate) blockers.push("model_failure_rate_above_threshold");
  if (input.metrics.audit_only !== true) blockers.push("not_audit_only");
  if (input.metrics.founder_review_required !== 0) blockers.push("founder_review_required_nonzero");

  const eligible = blockers.length === 0;
  return {
    workflow_name: "ml_verifier_quality_gate",
    schema_version: "ml_verifier_quality_gate.v1",
    run_id: input.runId,
    created_at: input.createdAt ?? new Date().toISOString(),
    result: eligible ? "passed" : "deferred",
    eligible_for_activation: eligible,
    audit_only: true,
    sample_size: input.sampleSize,
    min_sample_size: input.minSampleSize,
    selected: input.metrics.selected,
    processed: input.metrics.processed,
    approved: input.metrics.approved,
    rejected: input.metrics.rejected,
    review: input.metrics.review,
    publish_ready: input.metrics.publish_ready,
    suppressed: input.metrics.suppressed,
    non_founder_review: input.metrics.non_founder_review,
    founder_review_required: 0,
    agreement_rate: agreementRate,
    minimum_agreement_rate: input.minimumAgreementRate,
    model_failure_rate: modelFailureRate,
    max_model_failure_rate: input.maxModelFailureRate,
    reason_code_counts: { ...input.reasonCodeCounts },
    prompt_version: input.metrics.prompt_version,
    provider: input.metrics.provider,
    model: input.metrics.model,
    blockers,
    safety: {
      public_ranking_impact_allowed: false,
      production_mutation_performed: false,
      writes_tracked_creators: false,
      publishes_buyer_facing_rankings: false,
      audit_table_writes_only: true,
    },
    public_ranking_impact_allowed: false,
    production_mutation_performed: false,
    artifact_path: input.receiptPath,
  };
}

function timestampForPath(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

function receiptPathForRun(runId: string, repoRoot = process.cwd()): string {
  return join(repoRoot, ".tmp", "workflow-receipts", "ml_verifier_quality_gate", `${runId}.json`);
}

async function markJobRunning(job: PipelineJob, workerId: string, queryFn: QueryFn): Promise<void> {
  await queryFn(
    `UPDATE pipeline_runs SET status = 'running', started_at = COALESCE(started_at, NOW()), updated_at = NOW() WHERE id = $1`,
    [job.run_id],
  );
  await queryFn(
    `UPDATE pipeline_jobs SET status = 'running', locked_by = $2, locked_at = NOW(), heartbeat_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [job.id, workerId],
  );
}

export async function runMlVerifierQualityGate(
  args = parseMlVerifierQualityGateArgs(),
  input: { readonly repoRoot?: string; readonly queryFn?: QueryFn } = {},
): Promise<MlVerifierQualityGateReceipt> {
  const queryFn = input.queryFn ?? defaultQuery;
  const runId = `ml-verifier-quality-gate-${timestampForPath()}`;
  const receiptPath = receiptPathForRun(runId, input.repoRoot);
  const { job } = await enqueuePipelineJob({
    runKey: runId,
    runType: "ml-verifier-quality-gate",
    jobType: "ml_verifier_batch",
    priority: 100,
    idempotencyKey: runId,
    maxAttempts: 1,
    payload: {
      batch_size: args.sampleSize,
      audit_only: true,
      quality_gate: true,
      queued_by: args.workerId,
      public_ranking_impact_allowed: false,
      production_mutation_allowed: false,
    },
  });
  await markJobRunning(job, args.workerId, queryFn);

  const counter = countCapturedVerifierReasons();
  const capturedQuery: QueryFn = async <T>(sql: string, params?: unknown[]): Promise<T[]> => {
    counter.observeSql(sql, params);
    return queryFn<T>(sql, params);
  };
  const previousModel = process.env.ML_VERIFIER_MODEL;
  const previousOllamaHost = process.env.OLLAMA_HOST;
  if (args.model) process.env.ML_VERIFIER_MODEL = args.model;
  if (args.ollamaHost) process.env.OLLAMA_HOST = args.ollamaHost;
  let metrics: MlVerifierMetrics;
  try {
    metrics = await runMlVerifierBatch(job, { queryFn: capturedQuery });
  } finally {
    if (previousModel === undefined) delete process.env.ML_VERIFIER_MODEL;
    else process.env.ML_VERIFIER_MODEL = previousModel;
    if (previousOllamaHost === undefined) delete process.env.OLLAMA_HOST;
    else process.env.OLLAMA_HOST = previousOllamaHost;
  }
  const receipt = buildMlVerifierQualityGateReceipt({
    runId,
    metrics,
    reasonCodeCounts: counter.reasonCodeCounts(),
    sampleSize: args.sampleSize,
    minSampleSize: args.minSampleSize,
    minimumAgreementRate: args.minimumAgreementRate,
    maxModelFailureRate: args.maxModelFailureRate,
    receiptPath,
  });
  mkdirSync(dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  await completePipelineJob(job, { ...metrics, quality_gate: { result: receipt.result, eligible_for_activation: receipt.eligible_for_activation, receipt_path: receiptPath } });
  return receipt;
}

async function main(): Promise<void> {
  loadEnv();
  const receipt = await runMlVerifierQualityGate(parseMlVerifierQualityGateArgs());
  console.log(JSON.stringify(receipt, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
