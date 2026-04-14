import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  TRACKED_SYMBOLS,
  SYMBOL_NAMES,
  SYMBOL_TICKERS,
} from "./constants";
import { auditExtraction } from "./extraction-validation";
import { computeSpecificity } from "./scoring";
import type { CallType, ExtractedCall, StrategyType } from "./types";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 5_000;
const MAX_TRANSCRIPT_CHARS = 24_000;

export interface ExtractedCallCandidate extends ExtractedCall {
  readonly extraction_confidence: number;
}

export interface NormalizedExtractedCall extends ExtractedCall {
  readonly extraction_confidence: number;
  readonly specificity_score: number;
  readonly validation_notes: readonly string[];
}

const COIN_LOOKUP: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const symbol of TRACKED_SYMBOLS) {
    map.set(symbol.toLowerCase(), symbol);
    const name = SYMBOL_NAMES[symbol];
    if (name) map.set(name.toLowerCase(), symbol);
    const ticker = SYMBOL_TICKERS[symbol];
    if (ticker) map.set(ticker.toLowerCase(), symbol);
  }
  map.set("bitcoin", "BTCUSDT");
  map.set("btc", "BTCUSDT");
  map.set("ethereum", "ETHUSDT");
  map.set("eth", "ETHUSDT");
  map.set("solana", "SOLUSDT");
  map.set("sol", "SOLUSDT");
  map.set("doge", "DOGEUSDT");
  map.set("dogecoin", "DOGEUSDT");
  map.set("cardano", "ADAUSDT");
  map.set("ada", "ADAUSDT");
  map.set("polkadot", "DOTUSDT");
  map.set("dot", "DOTUSDT");
  map.set("chainlink", "LINKUSDT");
  map.set("link", "LINKUSDT");
  map.set("avalanche", "AVAXUSDT");
  map.set("avax", "AVAXUSDT");
  map.set("bittensor", "TAOUSDT");
  map.set("tao", "TAOUSDT");
  map.set("render", "RENDERUSDT");
  map.set("rndr", "RENDERUSDT");
  map.set("fetch", "FETUSDT");
  map.set("fetch.ai", "FETUSDT");
  map.set("fet", "FETUSDT");
  map.set("near", "NEARUSDT");
  map.set("near protocol", "NEARUSDT");
  map.set("arweave", "ARUSDT");
  map.set("ar", "ARUSDT");
  map.set("injective", "INJUSDT");
  map.set("inj", "INJUSDT");
  map.set("sui", "SUIUSDT");
  map.set("pendle", "PENDLEUSDT");
  map.set("bnb", "BNBUSDT");
  map.set("binance coin", "BNBUSDT");
  map.set("xrp", "XRPUSDT");
  map.set("ripple", "XRPUSDT");
  return map;
})();

const SYMBOL_LIST_STR = TRACKED_SYMBOLS.map(
  (s) => `${SYMBOL_TICKERS[s]} (${SYMBOL_NAMES[s]}, ${s})`,
).join(", ");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampConfidence(value: number): "high" | "medium" | "low" {
  if (value >= 0.9) return "high";
  if (value >= 0.7) return "medium";
  return "low";
}

function normalizeSymbol(symbol: string): string | null {
  const normalized = COIN_LOOKUP.get(symbol.toLowerCase()) ?? symbol.toUpperCase();
  return TRACKED_SYMBOLS.includes(normalized as typeof TRACKED_SYMBOLS[number])
    ? normalized
    : null;
}

function sanitizeJson(text: string): string {
  return text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
}

function buildPrompt(transcript: string): string {
  const truncated =
    transcript.length > MAX_TRANSCRIPT_CHARS
      ? transcript.slice(0, MAX_TRANSCRIPT_CHARS)
      : transcript;

  return `You are extracting all actionable crypto calls from a YouTube transcript.

Return a JSON array. Each item must describe one actionable call for a tracked coin.

TRACKED COINS: ${SYMBOL_LIST_STR}

Rules:
- Only include actionable predictions or trade ideas.
- Ignore general news, market commentary, and historical examples.
- The coin must be explicitly supported by the quote.
- Keep raw_quote as the shortest exact transcript excerpt that proves the call.
- target_price must be a literal asset price target. Do not convert macro figures like "$12 trillion" into a price target.
- If the direction is unclear, do not include the call.
- If multiple mentions for the same coin exist, include only the strongest actionable one.

Return each item in this shape:
{
  "symbol": "BTCUSDT",
  "direction": "bullish|bearish|neutral",
  "call_type": "buy|sell|hold|watch|avoid",
  "entry_price": null or number,
  "target_price": null or number,
  "stop_loss": null or number,
  "timeframe": "string or null",
  "confidence": "high|medium|low",
  "strategy_type": "technical_analysis|fundamental|narrative|contrarian",
  "raw_quote": "exact excerpt",
  "extraction_confidence": 0.0-1.0
}

If there are no actionable tracked-coin calls, return [].

TRANSCRIPT:
${truncated}`;
}

export function createGeminiModel(): ReturnType<GoogleGenerativeAI["getGenerativeModel"]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: GEMINI_MODEL });
}

export async function geminiGenerate(
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  prompt: string,
): Promise<string> {
  let attempt = 0;
  let backoff = INITIAL_BACKOFF_MS;

  while (attempt <= MAX_RETRIES) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const isRateLimit =
        message.includes("429") || message.includes("RESOURCE_EXHAUSTED");
      if (!isRateLimit) throw error;

      attempt++;
      if (attempt > MAX_RETRIES) {
        throw new Error(`Gemini rate limit exceeded after ${MAX_RETRIES} retries`);
      }
      await sleep(Math.min(backoff, 120_000));
      backoff *= 2;
    }
  }

  throw new Error("Unreachable retry loop");
}

function parseCandidates(text: string): ExtractedCallCandidate[] {
  const json = sanitizeJson(text);
  if (json === "" || json === "null") return [];
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => {
      const symbol = typeof item.symbol === "string" ? normalizeSymbol(item.symbol) : null;
      if (!symbol) return null;
      return {
        symbol,
        direction: String(item.direction || "neutral") as ExtractedCallCandidate["direction"],
        call_type: String(item.call_type || "watch") as CallType,
        entry_price: typeof item.entry_price === "number" ? item.entry_price : null,
        target_price: typeof item.target_price === "number" ? item.target_price : null,
        stop_loss: typeof item.stop_loss === "number" ? item.stop_loss : null,
        timeframe: typeof item.timeframe === "string" ? item.timeframe : null,
        confidence: String(item.confidence || "medium") as ExtractedCallCandidate["confidence"],
        strategy_type: String(item.strategy_type || "narrative") as StrategyType,
        raw_quote: String(item.raw_quote || "").trim(),
        extraction_confidence:
          typeof item.extraction_confidence === "number"
            ? item.extraction_confidence
            : 0.5,
      };
    })
    .filter((item): item is ExtractedCallCandidate => item !== null && item.raw_quote.length > 0);
}

export function normalizeExtractedCalls(
  transcript: string,
  candidates: readonly ExtractedCallCandidate[],
): NormalizedExtractedCall[] {
  const bySymbol = new Map<string, NormalizedExtractedCall>();

  for (const candidate of candidates) {
    const audit = auditExtraction({
      symbol: candidate.symbol,
      direction: candidate.direction,
      target_price: candidate.target_price,
      raw_quote: candidate.raw_quote,
      transcript,
      extraction_confidence: candidate.extraction_confidence,
    });

    const specificityScore = computeSpecificity({
      entry_price: candidate.entry_price,
      target_price: audit.targetPrice,
      stop_loss: candidate.stop_loss,
      timeframe: candidate.timeframe,
    });

    const normalized: NormalizedExtractedCall = {
      symbol: candidate.symbol,
      direction: audit.direction,
      call_type: candidate.call_type,
      entry_price: candidate.entry_price,
      target_price: audit.targetPrice,
      stop_loss: candidate.stop_loss,
      timeframe: candidate.timeframe,
      confidence: clampConfidence(audit.normalizedConfidence),
      strategy_type: candidate.strategy_type,
      raw_quote: audit.excerpt,
      extraction_confidence: audit.normalizedConfidence,
      specificity_score: specificityScore,
      validation_notes: audit.reasons,
    };

    if (!audit.isValid) continue;

    const existing = bySymbol.get(normalized.symbol);
    if (!existing || normalized.extraction_confidence > existing.extraction_confidence) {
      bySymbol.set(normalized.symbol, normalized);
    }
  }

  return Array.from(bySymbol.values());
}

export async function extractCallsFromTranscript(
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  transcript: string,
): Promise<NormalizedExtractedCall[]> {
  const text = await geminiGenerate(model, buildPrompt(transcript));
  const candidates = parseCandidates(text);
  return normalizeExtractedCalls(transcript, candidates);
}
