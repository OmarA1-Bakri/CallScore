import { SYMBOL_NAMES, SYMBOL_TICKERS } from "./constants";
import type { Direction } from "./types";

const BULLISH_PATTERNS = [
  /\b(buy|buying|long|accumulate|accumulating|bullish|best buy|strong buy|great buy)\b/i,
  /\b(go(?:ing)? up|push up|move up|rip higher|heading higher|upside|next leg up)\b/i,
  /\b(target|targets|hit|reach|go to|get to|towards)\b/i,
  /\b(undervalued|break(?:ing)?\s*out|breakout|rally|pump|moon|higher high)\b/i,
  /\b(make|makes|making|made)\s+(?:a\s+)?(?:massive\s+)?comeback\b/i,
  /\b(best time to be positioned|positioned in|positioning in)\b/i,
  /\b(all[-\s]?time high|all[-\s]?time highs|record high|record highs|new high|new highs)\b/i,
  /\b(load(?:ing)? up on|loaded up on|big bag|high conviction)\b/i,
  /\b(best performers?|top performers?|outperform(?:ed|ing)?|perform(?:s|ing)? really well|do(?:ing)? pretty good|pretty strong|bounce(?:d|s|ing)? (?:pretty )?hard|ripping)\b/i,
  /\b(recover(?:y|ed|ing)?|rebound(?:ed|ing)?|brought up)\b/i,
];

const AMBIGUOUS_SYMBOL_SUPPORT: Partial<Record<string, RegExp>> = {
  LINKUSDT: /(?:\bchain\s?link\b|\$LINK\b)/i,
  NEARUSDT: /(?:\bNEAR\s+Protocol\b|\$NEAR\b)/i,
  DOTUSDT: /(?:\bPolkadot\b|\$DOT\b)/i,
  ARUSDT: /(?:\bArweave\b|\$AR\b)/i,
};

const BEARISH_PATTERNS = [
  /\b(sell|selling|short|shorting|bearish|avoid|stay away)\b/i,
  /\b(go(?:ing)? down|break down|heading lower|drop|dropped|dropping|dump|collapse|crash)\b/i,
  /\b(overvalued|dead coin|dead project|rug)\b/i,
  /\b(decline|declines|declining|capitulatory|at risk|shooting star|sell pressure|bear market|downside)\b/i,
  /\b(dead|underperform(?:ed|ing)?|weakness)\b/i,
];

const ACTIONABLE_WATCH_PATTERNS = [
  /\b(support|resistance|level|zone|range|hold(?:s|ing)?|break(?:s|ing)?|breakout|breakdown|accumulation|accumulate|watch|wait|entry|long|short|profit book|take profit)\b/i,
  /\b(correction|correct|dump|pump|rally|reversal|liquidity grab|fake\s?out|consolidat(?:e|ing|ion))\b/i,
  /(?:सपोर्ट|रेजिस्टेंस|लेवल|ज़ोन|जोन|रेंज|होल्ड|ब्रेक|लॉन्ग|शॉर्ट|प्रॉफिट\s*बुक|अक्यूमुलेट|करेक्शन|रिकवर|पॉजिटिव\s*मूवमेंट|वेट)/i,
  /(?:supporto|resistenza|livello|zona|range|rompere|rottura|rialzo|ribasso|accumulazione|debolezza)/i,
  /(?:support|resisten|area|range|dump|koreksi|reversal|breakout|breakdown|potensi|tunggu|akumulasi)/i,
];

const TARGET_CONTEXT_PATTERN =
  /\b(target|targets|hit|reach|go to|get to|move to|towards|to)\b/i;
const MACRO_UNIT_PATTERN = /\b(trillion|billion|million|tn|bn|mn)\b/i;
const PRICE_PATTERN =
  /\$?\s?(\d[\d,]*(?:\.\d+)?)\s*(k|K|m|M|b|B|thousand|million|billion|trillion)?/g;

export interface ExtractionAuditInput {
  readonly symbol: string;
  readonly direction: Direction;
  readonly target_price: number | null;
  readonly raw_quote: string | null;
  readonly transcript?: string | null;
  readonly extraction_confidence?: number;
}

export interface ExtractionAuditResult {
  readonly isValid: boolean;
  readonly normalizedConfidence: number;
  readonly direction: Direction;
  readonly targetPrice: number | null;
  readonly excerpt: string;
  readonly reasons: readonly string[];
}

interface DirectionEvidence {
  readonly bullish: number;
  readonly bearish: number;
  readonly direction: Direction;
}

function buildSymbolAliases(symbol: string): readonly string[] {
  const aliases = new Set<string>();
  const ticker = SYMBOL_TICKERS[symbol];
  const name = SYMBOL_NAMES[symbol];
  const isAmbiguousTicker = symbol in AMBIGUOUS_SYMBOL_SUPPORT;
  if (ticker && !isAmbiguousTicker) aliases.add(ticker.toLowerCase());
  if (name) aliases.add(name.toLowerCase());
  if (!isAmbiguousTicker) aliases.add(symbol.replace("USDT", "").toLowerCase());

  if (symbol === "BTCUSDT") {
    aliases.add("bitcoin");
    aliases.add("बिटकॉइन");
  }
  if (symbol === "ETHUSDT") {
    aliases.add("ethereum");
    aliases.add("इथेरियम");
  }
  if (symbol === "SOLUSDT") aliases.add("solana");
  if (symbol === "DOGEUSDT") aliases.add("dogecoin");
  if (symbol === "LINKUSDT") aliases.add("chainlink");
  if (symbol === "TAOUSDT") aliases.add("bittensor");
  if (symbol === "FETUSDT") aliases.add("fetch.ai");
  if (symbol === "NEARUSDT") aliases.add("near protocol");

  return Array.from(aliases);
}

function countPatternHits(text: string, patterns: readonly RegExp[]): number {
  return patterns.reduce((sum, pattern) => {
    const matches = text.match(new RegExp(pattern.source, "gi"));
    return sum + (matches?.length ?? 0);
  }, 0);
}

function detectDirection(text: string): DirectionEvidence {
  const bullish = countPatternHits(text, BULLISH_PATTERNS);
  const bearish = countPatternHits(text, BEARISH_PATTERNS);

  if (bullish === 0 && bearish === 0) {
    return { bullish, bearish, direction: "neutral" };
  }
  if (bullish >= bearish) {
    return { bullish, bearish, direction: "bullish" };
  }
  return { bullish, bearish, direction: "bearish" };
}

function sanitizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeForQuoteMatch(text: string): string {
  return sanitizeWhitespace(text).toLowerCase();
}

function rawQuoteIsSupportedByTranscript(
  transcript: string | null | undefined,
  rawQuote: string,
): boolean {
  const normalizedQuote = normalizeForQuoteMatch(rawQuote);
  if (!transcript || transcript.trim().length === 0) return true;
  if (normalizedQuote.length < 24) return false;

  const normalizedTranscript = normalizeForQuoteMatch(transcript);
  if (normalizedTranscript.includes(normalizedQuote)) return true;

  // Allow minor trailing differences, but do not allow prompt/example leakage.
  const quotePrefix = normalizedQuote.slice(0, Math.min(120, normalizedQuote.length));
  return quotePrefix.length >= 32 && normalizedTranscript.includes(quotePrefix);
}

function extractWindow(text: string, index: number, radius = 180): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return sanitizeWhitespace(text.slice(start, end));
}

function pickBestTranscriptExcerpt(
  transcript: string | null | undefined,
  rawQuote: string,
  aliases: readonly string[],
): string {
  if (!transcript || transcript.trim().length === 0) {
    return sanitizeWhitespace(rawQuote);
  }

  const normalizedTranscript = transcript.toLowerCase();
  const normalizedQuote = rawQuote.toLowerCase().slice(0, 120);
  if (normalizedQuote.length > 24) {
    const quoteIndex = normalizedTranscript.indexOf(normalizedQuote);
    if (quoteIndex >= 0) {
      return extractWindow(transcript, quoteIndex);
    }
  }

  let bestExcerpt = sanitizeWhitespace(rawQuote);
  let bestScore = -1;

  for (const alias of aliases) {
    const index = normalizedTranscript.indexOf(alias.toLowerCase());
    if (index < 0) continue;
    const excerpt = extractWindow(transcript, index);
    const evidence = detectDirection(excerpt);
    const score = evidence.bullish + evidence.bearish;
    if (score > bestScore) {
      bestScore = score;
      bestExcerpt = excerpt;
    }
  }

  return bestExcerpt;
}

function hasSymbolSupport(
  text: string,
  aliases: readonly string[],
  symbol: string,
): boolean {
  const ambiguousSymbolSupport = AMBIGUOUS_SYMBOL_SUPPORT[symbol];
  if (ambiguousSymbolSupport) {
    return ambiguousSymbolSupport.test(text);
  }

  const haystack = text.toLowerCase();
  return aliases.some((alias) => haystack.includes(alias.toLowerCase()));
}

export function hasExplicitSymbolSupport(symbol: string, text: string): boolean {
  return hasSymbolSupport(text, buildSymbolAliases(symbol), symbol);
}

function hasActionableWatchEvidence(text: string): boolean {
  return countPatternHits(text, ACTIONABLE_WATCH_PATTERNS) > 0;
}

function normalizeTargetPrice(text: string, targetPrice: number | null): number | null {
  if (!text) return targetPrice;

  let match: RegExpExecArray | null;
  const candidates: number[] = [];
  const lower = text.toLowerCase();

  while ((match = PRICE_PATTERN.exec(text)) !== null) {
    const fullMatch = match[0];
    const unit = match[2] ?? "";
    const before = lower.slice(Math.max(0, match.index - 24), match.index + fullMatch.length + 24);
    if (!TARGET_CONTEXT_PATTERN.test(before)) continue;
    if (MACRO_UNIT_PATTERN.test(before) || MACRO_UNIT_PATTERN.test(unit)) continue;

    let price = parseFloat(match[1].replace(/,/g, ""));
    if (unit === "k" || unit === "K" || /thousand/i.test(unit)) {
      price *= 1_000;
    }
    if (unit === "m" || unit === "M" || /million/i.test(unit)) {
      continue;
    }
    if (unit === "b" || unit === "B" || /billion/i.test(unit)) {
      continue;
    }
    if (price > 0) candidates.push(price);
  }

  if (candidates.length > 0) return candidates[0];

  if (targetPrice === null) return null;
  if (MACRO_UNIT_PATTERN.test(lower)) return null;
  return targetPrice;
}

export function auditExtraction(input: ExtractionAuditInput): ExtractionAuditResult {
  const aliases = buildSymbolAliases(input.symbol);
  const rawQuote = sanitizeWhitespace(input.raw_quote ?? "");
  const quoteSupported = rawQuoteIsSupportedByTranscript(input.transcript, rawQuote);
  const excerpt = pickBestTranscriptExcerpt(
    input.transcript,
    rawQuote,
    aliases,
  );
  const reasons: string[] = [];
  if (!quoteSupported) {
    reasons.push("raw quote is not present in transcript");
  }
  const symbolSupported = hasSymbolSupport(excerpt, aliases, input.symbol);
  if (!symbolSupported) {
    reasons.push("excerpt does not clearly support the extracted asset");
  }

  const evidence = detectDirection(excerpt);
  const actionableWatch = hasActionableWatchEvidence(excerpt);
  let direction = input.direction;
  if (evidence.direction !== "neutral" && evidence.direction !== input.direction) {
    direction = evidence.direction;
    if (input.direction !== "neutral") {
      reasons.push(`excerpt direction reads ${evidence.direction}, not ${input.direction}`);
    }
  }
  if (evidence.direction === "neutral" && !actionableWatch) {
    reasons.push("excerpt does not contain a clear directional or actionable watch signal");
  }

  const targetPrice = normalizeTargetPrice(excerpt, input.target_price);
  if (input.target_price !== null && targetPrice === null) {
    reasons.push("target price looks like a macro figure or unsupported unit");
  }

  let confidence = 0.2;
  if (symbolSupported) confidence += 0.35;
  if (evidence.direction !== "neutral" || actionableWatch) confidence += 0.3;
  if (targetPrice !== null || input.target_price === null) confidence += 0.15;
  if (excerpt.length >= 40) confidence += 0.1;
  if ((input.extraction_confidence ?? 0) >= 0.8) confidence += 0.05;
  confidence = Math.min(1, confidence);

  const isValid =
    quoteSupported &&
    symbolSupported &&
    (evidence.direction !== "neutral" || actionableWatch) &&
    reasons.length === 0;

  return {
    isValid,
    normalizedConfidence: isValid ? Math.max(confidence, 0.8) : Math.min(confidence, 0.69),
    direction,
    targetPrice,
    excerpt,
    reasons,
  };
}
