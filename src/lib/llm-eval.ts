export interface ConfusionCounts {
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
}

export interface ClassificationMetrics extends ConfusionCounts {
  readonly precision: number;
  readonly recall: number;
  readonly f1: number;
}

export interface ExtractionLike {
  readonly symbol: string;
  readonly direction: string;
  readonly raw_quote?: string | null;
}

export const FALSE_POSITIVE_BUCKETS = [
  "generic_asset_mention",
  "historical_recap",
  "sponsor_or_link",
  "unsupported_asset",
  "missing_direction",
  "quote_not_in_transcript",
] as const;

export type FalsePositiveBucket = (typeof FALSE_POSITIVE_BUCKETS)[number];

const VALID_DIRECTIONS = ["bullish", "bearish", "neutral"] as const;
const QUOTE_MIN_LENGTH = 20;

function safeRatio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function calculateClassificationMetrics(counts: ConfusionCounts): ClassificationMetrics {
  const precision = safeRatio(counts.truePositives, counts.truePositives + counts.falsePositives);
  const recall = safeRatio(counts.truePositives, counts.truePositives + counts.falseNegatives);
  return {
    ...counts,
    precision,
    recall,
    f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
  };
}

function extractionKey(call: ExtractionLike): string {
  return `${call.symbol.toUpperCase()}:${call.direction.toLowerCase()}`;
}

export function scoreExtractionSet(
  predicted: readonly ExtractionLike[],
  expected: readonly ExtractionLike[],
): ClassificationMetrics {
  const expectedCounts = new Map<string, number>();
  for (const call of expected) {
    const key = extractionKey(call);
    expectedCounts.set(key, (expectedCounts.get(key) ?? 0) + 1);
  }

  let truePositives = 0;
  let falsePositives = 0;
  for (const call of predicted) {
    const key = extractionKey(call);
    const remaining = expectedCounts.get(key) ?? 0;
    if (remaining > 0) {
      truePositives += 1;
      expectedCounts.set(key, remaining - 1);
    } else {
      falsePositives += 1;
    }
  }

  const falseNegatives = Array.from(expectedCounts.values()).reduce((sum, count) => sum + count, 0);
  return calculateClassificationMetrics({ truePositives, falsePositives, falseNegatives });
}

export function classifyFalsePositive(call: ExtractionLike): FalsePositiveBucket {
  const quote = (call.raw_quote ?? "").toLowerCase();
  if (/\b(sponsor|affiliate|link below|telegram|discord)\b/.test(quote)) return "sponsor_or_link";
  if (/\b(yesterday|last cycle|in 2021|back then|previous bull)\b/.test(quote)) return "historical_recap";
  if (!VALID_DIRECTIONS.includes(call.direction.toLowerCase() as (typeof VALID_DIRECTIONS)[number])) return "missing_direction";
  if (!/USDT$/i.test(call.symbol)) return "unsupported_asset";
  if (quote.length < QUOTE_MIN_LENGTH) return "quote_not_in_transcript";
  return "generic_asset_mention";
}
