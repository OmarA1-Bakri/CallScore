import { hasExplicitSymbolSupport } from "./extraction-validation";
import {
  EXTRACTION_CONFIDENCE_THRESHOLD,
  getCallScoreStatus,
  type CallScoreStatus,
} from "./public-methodology";

export interface AuditCoverageRow {
  readonly id: number;
  readonly symbol: string;
  readonly raw_quote: string | null;
  readonly extraction_confidence: number;
  readonly call_date: string;
  readonly target_price: number | null;
  readonly price_30d: number | null;
  readonly price_90d: number | null;
  readonly return_30d: number | null;
  readonly hit_target: boolean | null;
}

export interface AuditCoverageSummary {
  readonly totalCalls: number;
  readonly scoreStatus: Record<CallScoreStatus, number>;
  readonly confidence: {
    readonly belowThreshold: number;
    readonly publicQuality: number;
  };
  readonly ambiguousTickerRisk: {
    readonly total: number;
    readonly bySymbol: Record<string, number>;
    readonly sampleIds: readonly number[];
  };
}

const AMBIGUOUS_SYMBOLS = new Set(["LINKUSDT", "NEARUSDT", "DOTUSDT", "ARUSDT"]);

function emptyStatusCounts(): Record<CallScoreStatus, number> {
  return {
    scored: 0,
    excluded_confidence: 0,
    invalid_extraction: 0,
    pending_horizon: 0,
  };
}

export function summarizeAuditCoverage(
  rows: readonly AuditCoverageRow[],
  now: Date = new Date(),
): AuditCoverageSummary {
  const scoreStatus = emptyStatusCounts();
  const ambiguousBySymbol: Record<string, number> = {};
  const ambiguousSampleIds: number[] = [];
  let belowThreshold = 0;
  let publicQuality = 0;

  for (const row of rows) {
    const status = getCallScoreStatus(row, now);
    scoreStatus[status]++;

    if (row.extraction_confidence < EXTRACTION_CONFIDENCE_THRESHOLD) belowThreshold++;
    if (row.extraction_confidence >= 0.8) publicQuality++;

    if (
      AMBIGUOUS_SYMBOLS.has(row.symbol) &&
      !hasExplicitSymbolSupport(row.symbol, row.raw_quote ?? "")
    ) {
      ambiguousBySymbol[row.symbol] = (ambiguousBySymbol[row.symbol] ?? 0) + 1;
      if (ambiguousSampleIds.length < 20) ambiguousSampleIds.push(row.id);
    }
  }

  return {
    totalCalls: rows.length,
    scoreStatus,
    confidence: {
      belowThreshold,
      publicQuality,
    },
    ambiguousTickerRisk: {
      total: Object.values(ambiguousBySymbol).reduce((sum, count) => sum + count, 0),
      bySymbol: ambiguousBySymbol,
      sampleIds: ambiguousSampleIds,
    },
  };
}
