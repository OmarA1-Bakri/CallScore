import { query } from "../lib/db";
import { DEFAULT_ML_VERIFIER_MODEL, DEFAULT_ML_VERIFIER_PROVIDER, ML_VERIFIER_PROMPT_VERSION } from "../lib/ml-verifier";
import { loadEnv, timestamp } from "./script-helpers";

const CRITICAL_REJECT_REASONS = new Set([
  "generic_word",
  "asset_not_supported",
  "direction_not_supported",
  "quote_not_in_transcript",
]);
const AMBIGUOUS_SYMBOLS = new Set(["LINKUSDT", "NEARUSDT", "DOTUSDT", "ARUSDT"]);

interface Args {
  readonly baselinePromptVersion: string;
  readonly candidatePromptVersion: string;
  readonly provider: string;
  readonly model: string;
  readonly limit: number;
  readonly write: boolean;
}

interface EvalRow {
  readonly call_id: number | null;
  readonly label: "approve" | "reject" | "review";
  readonly label_reason_code: string | null;
  readonly symbol: string | null;
  readonly baseline_decision: "approve" | "reject" | "review" | null;
  readonly candidate_decision: "approve" | "reject" | "review" | null;
}

export interface EvalMetrics {
  readonly total: number;
  readonly precision: number;
  readonly ambiguous_false_positive_rate: number;
  readonly recovered_valid_calls: number;
  readonly critical_holdout_regressions: number;
}

export interface EvalComparison {
  readonly baseline: EvalMetrics;
  readonly candidate: EvalMetrics;
  readonly accepted: boolean;
  readonly acceptance_reasons: readonly string[];
}

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || !argv[index + 1]) return null;
  return argv[index + 1];
}

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function parseMlAutoresearchArgs(argv = process.argv.slice(2)): Args {
  return {
    baselinePromptVersion: argValue(argv, "--baseline-prompt-version") ?? ML_VERIFIER_PROMPT_VERSION,
    candidatePromptVersion: argValue(argv, "--candidate-prompt-version") ?? argValue(argv, "--prompt-version") ?? ML_VERIFIER_PROMPT_VERSION,
    provider: argValue(argv, "--provider") ?? process.env.ML_VERIFIER_PROVIDER ?? DEFAULT_ML_VERIFIER_PROVIDER,
    model: argValue(argv, "--model") ?? process.env.ML_VERIFIER_MODEL ?? DEFAULT_ML_VERIFIER_MODEL,
    limit: positiveInt(argValue(argv, "--limit"), 500),
    write: argv.includes("--write") && !argv.includes("--dry-run"),
  };
}

function computeMetrics(rows: readonly EvalRow[], decisionKey: "baseline_decision" | "candidate_decision"): EvalMetrics {
  let approvePredictions = 0;
  let trueApprovePredictions = 0;
  let ambiguousFalsePositives = 0;
  let ambiguousRejectLabels = 0;
  let recoveredValidCalls = 0;
  let criticalHoldoutRegressions = 0;

  for (const row of rows) {
    const decision = row[decisionKey];
    const isAmbiguous = row.symbol !== null && AMBIGUOUS_SYMBOLS.has(row.symbol);
    const isCriticalReject = row.label === "reject" && CRITICAL_REJECT_REASONS.has(row.label_reason_code ?? "");

    if (decision === "approve") {
      approvePredictions += 1;
      if (row.label === "approve") trueApprovePredictions += 1;
      if (row.label === "approve") recoveredValidCalls += 1;
      if (isAmbiguous && row.label === "reject") ambiguousFalsePositives += 1;
      if (isCriticalReject) criticalHoldoutRegressions += 1;
    }

    if (isAmbiguous && row.label === "reject") ambiguousRejectLabels += 1;
  }

  return {
    total: rows.length,
    precision: approvePredictions === 0 ? 1 : trueApprovePredictions / approvePredictions,
    ambiguous_false_positive_rate: ambiguousRejectLabels === 0 ? 0 : ambiguousFalsePositives / ambiguousRejectLabels,
    recovered_valid_calls: recoveredValidCalls,
    critical_holdout_regressions: criticalHoldoutRegressions,
  };
}

export function compareEvalMetrics(rows: readonly EvalRow[]): EvalComparison {
  const baseline = computeMetrics(rows, "baseline_decision");
  const candidate = computeMetrics(rows, "candidate_decision");
  const acceptanceReasons: string[] = [];

  if (candidate.precision < baseline.precision) acceptanceReasons.push("precision_regressed");
  if (candidate.ambiguous_false_positive_rate > baseline.ambiguous_false_positive_rate) {
    acceptanceReasons.push("ambiguous_false_positive_rate_regressed");
  }
  if (candidate.recovered_valid_calls <= baseline.recovered_valid_calls) {
    acceptanceReasons.push("recovered_valid_calls_not_improved");
  }
  if (candidate.critical_holdout_regressions > 0) acceptanceReasons.push("critical_holdout_regressions");

  return {
    baseline,
    candidate,
    accepted: acceptanceReasons.length === 0,
    acceptance_reasons: acceptanceReasons.length === 0 ? ["candidate_passed_v1_gates"] : acceptanceReasons,
  };
}

async function loadEvalRows(args: Args): Promise<EvalRow[]> {
  return query<EvalRow>(
    `SELECT
       e.call_id,
       e.label,
       e.reason_code AS label_reason_code,
       c.symbol,
       baseline.decision AS baseline_decision,
       candidate.decision AS candidate_decision
     FROM ml_training_examples e
     LEFT JOIN calls c ON c.id = e.call_id
     LEFT JOIN ml_verification_runs baseline
       ON baseline.call_id = e.call_id
      AND baseline.prompt_version = $1
     LEFT JOIN ml_verification_runs candidate
       ON candidate.call_id = e.call_id
      AND candidate.prompt_version = $2
     WHERE e.split = 'holdout'
     ORDER BY e.created_at DESC
     LIMIT $3`,
    [args.baselinePromptVersion, args.candidatePromptVersion, args.limit],
  );
}

async function storeCandidateVersion(args: Args, comparison: EvalComparison): Promise<void> {
  await query(
    `INSERT INTO ml_model_versions (
       task, provider, model, prompt_version, active, baseline, eval_metrics, accepted_at
     )
     VALUES ('ml_verifier', $1, $2, $3, $4, false, $5::jsonb, CASE WHEN $4 THEN NOW() ELSE NULL END)
     ON CONFLICT (task, prompt_version) DO UPDATE
       SET provider = EXCLUDED.provider,
           model = EXCLUDED.model,
           active = EXCLUDED.active,
           eval_metrics = EXCLUDED.eval_metrics,
           accepted_at = EXCLUDED.accepted_at`,
    [
      args.provider,
      args.model,
      args.candidatePromptVersion,
      comparison.accepted,
      JSON.stringify(comparison),
    ],
  );
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseMlAutoresearchArgs(argv);
  const rows = await loadEvalRows(args);
  const comparison = compareEvalMetrics(rows);

  console.log(JSON.stringify({ ts: timestamp(), write: args.write, ...comparison }, null, 2));

  if (args.write) {
    await storeCandidateVersion(args, comparison);
    console.log(`[${timestamp()}] Stored candidate prompt version ${args.candidatePromptVersion}; accepted=${comparison.accepted}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[${timestamp()}] ml-autoresearch fatal error: ${message}`);
    process.exit(1);
  });
}
