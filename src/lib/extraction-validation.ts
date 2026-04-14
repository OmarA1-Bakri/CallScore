import { SYMBOL_NAMES, SYMBOL_TICKERS } from "./constants";
import type { Direction } from "./types";

const BULLISH_PATTERNS = [
  /\b(buy|buying|long|accumulate|accumulating|bullish|best buy|strong buy|great buy)\b/i,
  /\b(go(?:ing)? up|push up|move up|rip higher|heading higher|upside)\b/i,
  /\b(target|targets|hit|reach|go to|get to|towards)\b/i,
  /\b(undervalued|breakout|rally|pump|moon|higher high)\b/i,
];

const BEARISH_PATTERNS = [
  /\b(sell|selling|short|shorting|bearish|avoid|stay away)\b/i,
  /\b(go(?:ing)? down|break down|heading lower|drop|dump|collapse|crash)\b/i,
  /\b(overvalued|dead coin|dead project|rug)\b/i,
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
  const ambiguousTickerSymbols = new Set(["NEARUSDT", "ARUSDT", "LINKUSDT", "DOTUSDT"]);
  if (ticker && !ambiguousTickerSymbols.has(symbol)) aliases.add(ticker.toLowerCase());
  if (name) aliases.add(name.toLowerCase());
  aliases.add(symbol.replace("USDT", "").toLowerCase());

  if (symbol === "BTCUSDT") aliases.add("bitcoin");
  if (symbol === "ETHUSDT") aliases.add("ethereum");
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
  if (symbol === "NEARUSDT") {
    return /\bNEAR\b/.test(text) || text.toLowerCase().includes("near protocol");
  }
  if (symbol === "ARUSDT") {
    return /\bAR\b/.test(text) || text.toLowerCase().includes("arweave");
  }
  if (symbol === "LINKUSDT") {
    return /\bLINK\b/.test(text) || text.toLowerCase().includes("chainlink") || text.toLowerCase().includes("chain link");
  }
  if (symbol === "DOTUSDT") {
    return /\bDOT\b/.test(text) || text.toLowerCase().includes("polkadot");
  }

  const haystack = text.toLowerCase();
  return aliases.some((alias) => haystack.includes(alias.toLowerCase()));
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
  const excerpt = pickBestTranscriptExcerpt(
    input.transcript,
    sanitizeWhitespace(input.raw_quote ?? ""),
    aliases,
  );
  const reasons: string[] = [];
  const symbolSupported = hasSymbolSupport(excerpt, aliases, input.symbol);
  if (!symbolSupported) {
    reasons.push("excerpt does not clearly support the extracted asset");
  }

  const evidence = detectDirection(excerpt);
  let direction = input.direction;
  if (evidence.direction !== "neutral" && evidence.direction !== input.direction) {
    reasons.push(`excerpt direction reads ${evidence.direction}, not ${input.direction}`);
    direction = evidence.direction;
  }
  if (evidence.direction === "neutral") {
    reasons.push("excerpt does not contain a clear directional signal");
  }

  const targetPrice = normalizeTargetPrice(excerpt, input.target_price);
  if (input.target_price !== null && targetPrice === null) {
    reasons.push("target price looks like a macro figure or unsupported unit");
  }

  let confidence = 0.2;
  if (symbolSupported) confidence += 0.35;
  if (evidence.direction !== "neutral") confidence += 0.3;
  if (targetPrice !== null || input.target_price === null) confidence += 0.15;
  if (excerpt.length >= 40) confidence += 0.1;
  if ((input.extraction_confidence ?? 0) >= 0.8) confidence += 0.05;
  confidence = Math.min(1, confidence);

  const isValid =
    symbolSupported &&
    evidence.direction !== "neutral" &&
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
