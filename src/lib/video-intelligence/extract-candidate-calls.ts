import type { CallDirection, CandidateCall, CandidateCallStatus, TranscriptSegment } from "./types";

const ASSET_ALIASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(bitcoin|btc|xbt)\b/i, "BTC"],
  [/\b(ethereum|eth)\b/i, "ETH"],
  [/\b(solana|sol)\b/i, "SOL"],
  [/\b(chainlink|link)\b/i, "LINK"],
  [/\b(dogecoin|doge)\b/i, "DOGE"],
  [/\b(cardano|ada)\b/i, "ADA"],
];

const THIRD_PARTY = /\b(guest|analyst|newsletter|twitter|someone|they|he|she)\b/i;
const NEWS_CONTEXT = /\b(report|reported|news|headline|according to|rumor)\b/i;
const CREATOR_OWNED = /\b(i am|i'm|i’ll|i will|i would|we are|we're|my call|my target|i expect|i think|i'm buying|i am buying|i like|i avoid|i'm avoiding)\b/i;
const BULLISH = /\b(buy|buying|long|bullish|breaks? out|target|upside|accumulate|like)\b/i;
const BEARISH = /\b(short|bearish|avoid|breaks? down|downside|sell|drops?|loses|below)\b/i;
const TIMEFRAME = /\b(\d+\s*(?:day|days|week|weeks|month|months)|next\s+(?:week|month|quarter)|this\s+(?:week|month|quarter)|by\s+q[1-4])\b/i;
const LEVEL = /\b(?:target|toward|to|above|below|around|at|near|under|over)\s+\$?([0-9]+(?:\.[0-9]+)?\s*[kKmM]?)\b/i;
const INVALIDATION = /\b(?:invalidated|invalidation|stop|stop loss|loses|below)\s+\$?([0-9]+(?:\.[0-9]+)?\s*[kKmM]?)\b/i;

function assetFor(text: string): string | null {
  for (const [pattern, symbol] of ASSET_ALIASES) if (pattern.test(text)) return symbol;
  return null;
}

function directionFor(text: string): CallDirection | null {
  const bullish = BULLISH.test(text);
  const bearish = BEARISH.test(text);
  if (bullish && !bearish) return "bullish";
  if (bearish && !bullish) return "bearish";
  if (bullish && bearish) return /\bavoid|short|below|loses\b/i.test(text) ? "bearish" : "bullish";
  return null;
}

function firstMatch(text: string, pattern: RegExp): string | null {
  return pattern.exec(text)?.[1] ?? null;
}

function statusFor(text: string, asset: string | null, direction: CallDirection | null, creatorOwned: boolean): CandidateCallStatus {
  if (!asset) return /\b(link|near|dot|ar)\b/i.test(text) ? "rejected_unsupported_asset" : "rejected_non_call";
  if (THIRD_PARTY.test(text)) return "rejected_not_creator_owned";
  if (NEWS_CONTEXT.test(text) && !creatorOwned) return "rejected_news_or_aggregation";
  if (!creatorOwned) return "rejected_not_creator_owned";
  if (!direction) return "rejected_ambiguous";
  return "accepted_call";
}

function confidenceFor(status: CandidateCallStatus, text: string): number {
  if (status !== "accepted_call") return status === "rejected_ambiguous" ? 0.45 : 0.3;
  let confidence = 0.7;
  if (LEVEL.test(text)) confidence += 0.08;
  if (TIMEFRAME.test(text)) confidence += 0.07;
  if (INVALIDATION.test(text)) confidence += 0.05;
  if (/\bmaybe|might|could|if\b/i.test(text)) confidence -= 0.12;
  return Math.max(0.1, Math.min(0.95, Number(confidence.toFixed(2))));
}

export function extractCandidateCalls(segments: readonly TranscriptSegment[]): readonly CandidateCall[] {
  const calls: CandidateCall[] = [];

  for (const segment of segments) {
    const text = segment.text;
    const assetSymbol = assetFor(text);
    const direction = directionFor(text);
    const creatorOwned = CREATOR_OWNED.test(text) && !THIRD_PARTY.test(text);
    const status = statusFor(text, assetSymbol, direction, creatorOwned);
    const hasCallSignal = Boolean(assetSymbol && (direction || creatorOwned || THIRD_PARTY.test(text) || NEWS_CONTEXT.test(text)));
    if (!hasCallSignal && status === "rejected_non_call") continue;
    const confidence = confidenceFor(status, text);
    calls.push({
      id: `candidate-${String(calls.length + 1).padStart(3, "0")}`,
      segmentId: segment.id,
      quote: text,
      status,
      assetSymbol,
      direction: status === "accepted_call" ? direction : null,
      thesis: status === "accepted_call" ? text : null,
      timeframe: TIMEFRAME.exec(text)?.[0] ?? null,
      target: firstMatch(text, LEVEL),
      stopLossOrInvalidation: firstMatch(text, INVALIDATION),
      isCreatorOwned: creatorOwned,
      confidence,
      rejectionReason: status === "accepted_call" ? null : status,
    });
  }

  if (calls.length === 0) {
    calls.push({
      id: "candidate-001",
      segmentId: segments[0]?.id ?? "seg-000",
      quote: segments[0]?.text ?? "",
      status: "rejected_non_call",
      assetSymbol: null,
      direction: null,
      thesis: null,
      timeframe: null,
      target: null,
      stopLossOrInvalidation: null,
      isCreatorOwned: false,
      confidence: 0.2,
      rejectionReason: "no_forward_looking_market_call_detected",
    });
  }

  return calls;
}
