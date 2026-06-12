import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildRunId, type ShadowDiffRecord, type ShadowExtractedCallRecord } from "../lib/shadow-extraction";
import { timestamp } from "./script-helpers";

interface Args {
  readonly shadowIn: string | null;
  readonly diffIn: string | null;
  readonly fixtures: string;
  readonly out: string;
}

interface MlIdleImproveReport {
  readonly record_type: "ml_idle_improvement_report";
  readonly ts: string;
  readonly run_id: string;
  readonly inputs: {
    readonly shadow_in: string | null;
    readonly diff_in: string | null;
    readonly fixtures: string;
  };
  readonly metrics: {
    readonly shadow_records: number;
    readonly fixture_records: number;
    readonly json_valid_rate: number;
    readonly schema_pass_rate: number;
    readonly parser_error_count: number;
    readonly accepted_calls: number;
    readonly rejected_or_no_call_records: number;
    readonly high_confidence_calls: number;
    readonly diff_status_counts: Record<string, number>;
  };
  readonly promotion_gate: {
    readonly json_valid_ge_95: boolean;
    readonly schema_pass_ge_95: boolean;
    readonly no_parser_errors: boolean;
    readonly no_unreviewed_high_confidence_diffs: boolean;
    readonly approval_recorded: false;
    readonly eligible_for_write_canary: false;
    readonly reasons: readonly string[];
  };
  readonly suggestions: readonly string[];
  readonly next_fixture_targets: readonly string[];
  readonly production_default_changed: false;
}

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || !argv[index + 1]) return null;
  return argv[index + 1];
}

export function latestShadowArtifact(root = ".tmp/shadow-extraction"): string | null {
  if (!existsSync(root)) return null;
  const candidates = readdirSync(root)
    .filter((name) => name.endsWith(".jsonl") && !name.includes(".diff"))
    .map((name) => join(root, name));
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.localeCompare(a))[0] ?? null;
}

export function parseMlIdleImproveArgs(argv = process.argv.slice(2)): Args {
  const shadowIn = argValue(argv, "--shadow-in") ?? latestShadowArtifact();
  return {
    shadowIn,
    diffIn: argValue(argv, "--diff-in"),
    fixtures: argValue(argv, "--fixtures") ?? "data/eval/call-extraction-fixtures.jsonl",
    out: argValue(argv, "--out") ?? `.tmp/ml-idle-improve/${buildRunId("ml-idle")}.json`,
  };
}

function readJsonl<T>(filePath: string | null): T[] {
  if (!filePath || !existsSync(filePath)) return [];
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function countBy<T extends string>(values: readonly T[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

export function buildMlIdleImproveReport(args: Args, runId = buildRunId("ml-idle")): MlIdleImproveReport {
  const shadow = readJsonl<ShadowExtractedCallRecord>(args.shadowIn).filter((row) => row.record_type === "shadow_extraction");
  const diffs = readJsonl<ShadowDiffRecord>(args.diffIn).filter((row) => row.record_type === "shadow_diff");
  const fixtures = readJsonl<Record<string, unknown>>(args.fixtures);

  const parserErrorCount = shadow.reduce((sum, row) => sum + (row.parser_errors?.length ?? (row.error ? 1 : 0)), 0);
  const parserMessages = shadow.flatMap((row) => [...(row.parser_errors ?? []), ...(row.error ? [row.error] : [])]);
  const arrayShapeErrors = parserMessages.filter((message) => /JSON array|did not contain/i.test(message)).length;
  const validJson = shadow.filter((row) => !row.error && parserErrorCount >= 0).length;
  const schemaPass = shadow.filter((row) => row.schema_valid === true && !row.error).length;
  const acceptedCalls = shadow.reduce((sum, row) => sum + row.accepted_count, 0);
  const highConfidenceCalls = shadow.reduce((sum, row) => sum + (row.confidence_distribution?.high_confidence_count ?? 0), 0);
  const riskyDiffs = diffs.filter((row) => ["new_calls", "changed_calls", "manual_review"].includes(row.status));

  const jsonValidRate = shadow.length === 0 ? 0 : validJson / shadow.length;
  const schemaPassRate = shadow.length === 0 ? 0 : schemaPass / shadow.length;
  const reasons: string[] = [];
  if (jsonValidRate < 0.95) reasons.push("json_valid_rate_below_95");
  if (schemaPassRate < 0.95) reasons.push("schema_pass_rate_below_95");
  if (parserErrorCount > 0) reasons.push("parser_errors_present");
  if (riskyDiffs.length > 0 && highConfidenceCalls > 0) reasons.push("unreviewed_high_confidence_shadow_diffs");
  reasons.push("manual_or_eval_approval_not_recorded");

  const suggestions: string[] = [];
  if (parserErrorCount > 0) suggestions.push("Add parser-cleaning fixtures from failed Gemma shadow outputs before any write canary.");
  if (arrayShapeErrors > 0) suggestions.push("Align Gemma shadow prompt/Modelfile with the production extractor schema or add reviewed array-wrapper repair fixtures; current failures include non-array/non-production-schema output.");
  if (riskyDiffs.length > 0) suggestions.push("Prioritize manual review of new/changed shadow calls and convert disagreements into known-good/known-bad fixtures.");
  if (acceptedCalls === 0) suggestions.push("Sample more likely market-call transcripts before judging recall; current shadow artifact contains no accepted calls.");
  suggestions.push("Keep Gemma in shadow mode until promotion gates and approval evidence are recorded.");

  return {
    record_type: "ml_idle_improvement_report",
    ts: timestamp(),
    run_id: runId,
    inputs: { shadow_in: args.shadowIn, diff_in: args.diffIn, fixtures: args.fixtures },
    metrics: {
      shadow_records: shadow.length,
      fixture_records: fixtures.length,
      json_valid_rate: jsonValidRate,
      schema_pass_rate: schemaPassRate,
      parser_error_count: parserErrorCount,
      accepted_calls: acceptedCalls,
      rejected_or_no_call_records: shadow.filter((row) => row.accepted_count === 0).length,
      high_confidence_calls: highConfidenceCalls,
      diff_status_counts: countBy(diffs.map((row) => row.status)),
    },
    promotion_gate: {
      json_valid_ge_95: jsonValidRate >= 0.95,
      schema_pass_ge_95: schemaPassRate >= 0.95,
      no_parser_errors: parserErrorCount === 0,
      no_unreviewed_high_confidence_diffs: !(riskyDiffs.length > 0 && highConfidenceCalls > 0),
      approval_recorded: false,
      eligible_for_write_canary: false,
      reasons,
    },
    suggestions,
    next_fixture_targets: [
      "rule extractor false positives",
      "Gemma-vs-rule disagreement cases",
      "laptop-ingested transcripts with no accepted calls",
      "known high-quality creator-owned calls",
      "news/aggregation/quoted-third-party negatives",
    ],
    production_default_changed: false,
  };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseMlIdleImproveArgs(argv);
  const report = buildMlIdleImproveReport(args);
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ out: args.out, ...report }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
