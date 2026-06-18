import type { CandidateCall, NormalizedCall } from "./types";

const MARKET_SYMBOLS: Readonly<Record<string, string>> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  SOL: "SOLUSDT",
  LINK: "LINKUSDT",
  DOGE: "DOGEUSDT",
  ADA: "ADAUSDT",
};

export function normalizeCalls(candidates: readonly CandidateCall[]): readonly NormalizedCall[] {
  return candidates.map((candidate) => {
    const marketSymbol = candidate.assetSymbol ? MARKET_SYMBOLS[candidate.assetSymbol] ?? null : null;
    const requiresApproval = candidate.status !== "accepted_call" || candidate.confidence < 0.7 || !marketSymbol;
    return {
      id: `normalized-${candidate.id.replace(/^candidate-/, "")}`,
      candidateCallId: candidate.id,
      status: marketSymbol ? candidate.status : "rejected_unsupported_asset",
      assetSymbol: candidate.assetSymbol,
      marketSymbol,
      direction: candidate.direction,
      thesis: candidate.thesis,
      timeframe: candidate.timeframe,
      target: candidate.target,
      stopLossOrInvalidation: candidate.stopLossOrInvalidation,
      evidenceSegmentId: candidate.segmentId,
      evidenceQuote: candidate.quote,
      confidence: candidate.confidence,
      requiresApproval,
      rejectionReason: marketSymbol ? candidate.rejectionReason : "unsupported_asset",
    };
  });
}
