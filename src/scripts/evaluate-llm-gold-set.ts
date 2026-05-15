import { readFileSync } from "node:fs";
import { createLogger } from "../lib/logger";
import {
  classifyFalsePositive,
  scoreExtractionSet,
  type ExtractionLike,
} from "../lib/llm-eval";

const logger = createLogger({ component: "evaluate-llm-gold-set" });

interface GoldRow {
  readonly id?: string | number;
  readonly expected: readonly ExtractionLike[];
  readonly predicted: readonly ExtractionLike[];
}

interface Args {
  readonly input: string | null;
}

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || !argv[index + 1]) return null;
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
    .map((line) => JSON.parse(line) as GoldRow);
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
          expected.direction.toLowerCase() === predicted.direction.toLowerCase()
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
  return {
    examples: rows.length,
    ...scoreExtractionSet(
      Array.from({ length: totals.truePositives + totals.falsePositives }, (_, index) => ({
        symbol: index < totals.truePositives ? `TP${index}USDT` : `FP${index}USDT`,
        direction: "bullish",
      })),
      Array.from({ length: totals.truePositives + totals.falseNegatives }, (_, index) => ({
        symbol: `TP${index}USDT`,
        direction: "bullish",
      })),
    ),
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
