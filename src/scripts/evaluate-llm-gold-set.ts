import { readFileSync } from "node:fs";
import { createLogger } from "../lib/logger";
import {
  classifyFalsePositive,
  scoreExtractionSet,
  type ExtractionLike,
} from "../lib/llm-eval";

const logger = createLogger({ component: "evaluate-llm-gold-set" });

interface GoldRow {
  readonly expected: readonly ExtractionLike[];
  readonly predicted: readonly ExtractionLike[];
}

interface Args {
  readonly input: string | null;
}

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || index + 1 >= argv.length) return null;
  return argv[index + 1];
}

export function parseGoldEvalArgs(argv = process.argv.slice(2)): Args {
  return { input: argValue(argv, "--input") };
}

function readRows(input: string): readonly GoldRow[] {
  return readFileSync(input, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid JSON in ${input} at line ${index + 1}: ${message}`);
      }
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !Array.isArray((parsed as { expected?: unknown }).expected) ||
        !Array.isArray((parsed as { predicted?: unknown }).predicted)
      ) {
        throw new Error(`Invalid gold row in ${input} at line ${index + 1}: expected and predicted arrays are required`);
      }
      return parsed as GoldRow;
    });
}

export function evaluateGoldRows(rows: readonly GoldRow[]): Record<string, unknown> {
  const totals = rows.reduce(
    (acc, row) => {
      const metrics = scoreExtractionSet(row.predicted, row.expected);
      acc.truePositives += metrics.truePositives;
      acc.falsePositives += metrics.falsePositives;
      acc.falseNegatives += metrics.falseNegatives;
      for (const predicted of row.predicted) {
        const expectedMatch = row.expected.some((expected) => (
          expected.symbol.toUpperCase() === predicted.symbol.toUpperCase() &&
          expected.direction.toUpperCase() === predicted.direction.toUpperCase()
        ));
        if (!expectedMatch) {
          const bucket = classifyFalsePositive(predicted);
          acc.falsePositiveBuckets[bucket] = (acc.falsePositiveBuckets[bucket] ?? 0) + 1;
        }
      }
      return acc;
    },
    {
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
      falsePositiveBuckets: {} as Record<string, number>,
    },
  );
  const precision = totals.truePositives + totals.falsePositives === 0
    ? 0
    : totals.truePositives / (totals.truePositives + totals.falsePositives);
  const recall = totals.truePositives + totals.falseNegatives === 0
    ? 0
    : totals.truePositives / (totals.truePositives + totals.falseNegatives);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return {
    examples: rows.length,
    truePositives: totals.truePositives,
    falsePositives: totals.falsePositives,
    falseNegatives: totals.falseNegatives,
    precision,
    recall,
    f1,
    false_positive_buckets: totals.falsePositiveBuckets,
  };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseGoldEvalArgs(argv);
  if (!args.input) throw new Error("--input is required");
  logger.info("gold_eval_complete", evaluateGoldRows(readRows(args.input)));
}

if (require.main === module) {
  main().catch((error) => {
    logger.error("fatal_error", { error: error instanceof Error ? error.stack ?? error.message : String(error) });
    process.exit(1);
  });
}
