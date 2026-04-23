/**
 * Local keyword-based call extraction — no API needed.
 * Scans transcripts for coin mentions + directional signals.
 * Designed for fast initial seed; weekly Gemini pipeline refines accuracy.
 */
import { query } from "../lib/db";
import { TRACKED_SYMBOLS, SYMBOL_NAMES, SYMBOL_TICKERS } from "../lib/constants";
import { computeSpecificity } from "../lib/scoring";
import {
  loadEnv,
  replaceStoredCallsForVideo,
  timestamp,
} from "./script-helpers";

// Build lookup: keyword → symbol
function buildCoinKeywords(): Map<string, string> {
  const map = new Map<string, string>();
  for (const symbol of TRACKED_SYMBOLS) {
    const name = SYMBOL_NAMES[symbol];
    if (name) map.set(name.toLowerCase(), symbol);
    const ticker = SYMBOL_TICKERS[symbol];
    if (ticker) map.set(ticker.toLowerCase(), symbol);
  }
  // Extra aliases
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
  map.set("injective", "INJUSDT");
  map.set("inj", "INJUSDT");
  map.set("sui", "SUIUSDT");
  map.set("pendle", "PENDLEUSDT");
  map.set("bnb", "BNBUSDT");
  map.set("binance coin", "BNBUSDT");
  map.set("xrp", "XRPUSDT");
  map.set("ripple", "XRPUSDT");
  return map;
}

const COIN_KEYWORDS = buildCoinKeywords();

const SHORT_TICKERS = new Set([
  "btc", "eth", "sol", "bnb", "xrp", "ada", "dot", "inj", "sui", "tao", "fet",
]);

const BULLISH_PATTERNS = [
  /\b(buy|buying|long|accumulate|load up|loading|bullish|moon|pump|rally|breakout|undervalued)\b/i,
  /\b(going up|go up|heading higher|push higher|run up|rip higher|massive upside)\b/i,
  /\b(100x|10x|5x|2x|double|triple|explode|skyrocket|parabolic)\b/i,
  /\b(best coin|top pick|gem|hidden gem|must buy|don't miss|sleeping giant)\b/i,
  /\bcould (?:hit|reach|go to|get to|see) \$?\d/i,
  /\btarget.{0,20}\$?\d/i,
  /\bprice.{0,15}(?:prediction|target).{0,15}\$?\d/i,
];

const BEARISH_PATTERNS = [
  /\b(sell|selling|short|shorting|bearish|dump|crash|collapse|drop)\b/i,
  /\b(going down|go down|heading lower|break down|falling|overvalued)\b/i,
  /\b(avoid|stay away|don't buy|do not buy|exit|get out)\b/i,
  /\b(rug pull|scam|ponzi|dead coin|dead project)\b/i,
];

const PRICE_PATTERN = /\$\s?(\d[\d,]*(?:\.\d+)?)\s?(?:k|K|thousand|million|M)?/g;

interface LocalCall {
  readonly symbol: string;
  readonly direction: "bullish" | "bearish" | "neutral";
  readonly call_type: "buy" | "sell" | "hold" | "watch" | "avoid";
  readonly confidence: "high" | "medium" | "low";
  readonly raw_quote: string;
  readonly target_price: number | null;
  readonly strategy_type: "technical_analysis" | "fundamental" | "narrative" | "contrarian";
}

function extractWindow(text: string, position: number, windowSize: number = 200): string {
  const start = Math.max(0, position - windowSize);
  const end = Math.min(text.length, position + windowSize);
  return text.slice(start, end);
}

function parsePrice(match: string): number {
  const cleaned = match.replace(/[$,\s]/g, "");
  let num = parseFloat(cleaned);
  if (/k|K|thousand/i.test(match)) num *= 1_000;
  if (/M|million/i.test(match)) num *= 1_000_000;
  return num;
}

function detectDirection(
  window: string,
): { direction: "bullish" | "bearish" | "neutral"; score: number } {
  let bullishScore = 0;
  let bearishScore = 0;

  for (const pattern of BULLISH_PATTERNS) {
    const matches = window.match(new RegExp(pattern.source, "gi"));
    if (matches) bullishScore += matches.length;
  }

  for (const pattern of BEARISH_PATTERNS) {
    const matches = window.match(new RegExp(pattern.source, "gi"));
    if (matches) bearishScore += matches.length;
  }

  if (bullishScore > bearishScore && bullishScore >= 2) {
    return { direction: "bullish", score: bullishScore };
  }
  if (bearishScore > bullishScore && bearishScore >= 2) {
    return { direction: "bearish", score: bearishScore };
  }
  if (bullishScore >= 1 || bearishScore >= 1) {
    return {
      direction: bullishScore >= bearishScore ? "bullish" : "bearish",
      score: Math.max(bullishScore, bearishScore),
    };
  }
  return { direction: "neutral", score: 0 };
}

function extractCallsFromTranscript(transcript: string): readonly LocalCall[] {
  const text = transcript.toLowerCase();
  const calls: LocalCall[] = [];
  const seenSymbols = new Set<string>();

  const entries = Array.from(COIN_KEYWORDS.entries());
  for (const [keyword, symbol] of entries) {
    // Skip very short keywords that produce false positives
    if (keyword.length <= 2 && !SHORT_TICKERS.has(keyword)) continue;

    // Find mentions in text
    const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (seenSymbols.has(symbol)) continue; // One call per symbol per video

      const window = extractWindow(transcript, match.index, 300);
      const { direction, score } = detectDirection(window);

      // Only extract if there's a clear directional signal (not just a mention)
      if (direction === "neutral" || score < 1) continue;

      // Look for price targets in the window
      let targetPrice: number | null = null;
      const priceRegex = new RegExp(PRICE_PATTERN.source, "g");
      const priceMatches: RegExpExecArray[] = [];
      let pm: RegExpExecArray | null;
      while ((pm = priceRegex.exec(window)) !== null) {
        priceMatches.push(pm);
      }
      if (priceMatches.length > 0) {
        for (const priceMatch of priceMatches) {
          const price = parsePrice(priceMatch[0]);
          if (price > 0 && price < 1_000_000) {
            targetPrice = price;
            break;
          }
        }
      }

      const confidence = score >= 3 ? "high" : score >= 2 ? "medium" : "low";
      const callType = direction === "bullish" ? "buy" : direction === "bearish" ? "sell" : "watch";

      // Extract a clean raw quote (trimmed window around the keyword)
      const quoteStart = Math.max(0, match.index - 100);
      const quoteEnd = Math.min(transcript.length, match.index + keyword.length + 100);
      const rawQuote = transcript.slice(quoteStart, quoteEnd).trim();

      calls.push({
        symbol,
        direction,
        call_type: callType,
        confidence,
        raw_quote: rawQuote.slice(0, 300),
        target_price: targetPrice,
        strategy_type: targetPrice ? "technical_analysis" : "narrative",
      });

      seenSymbols.add(symbol);
    }
  }

  return calls;
}

async function main(): Promise<void> {
  loadEnv();

  console.log(`[${timestamp()}] Starting LOCAL call extraction (keyword-based)...`);

  const videos = await query<{
    id: number;
    creator_id: number;
    title: string;
    transcript: string | null;
    published_at: string | null;
    created_at: string;
    transcript_quality: number;
  }>(
    `SELECT v.id, v.creator_id, v.title, v.transcript, v.published_at, v.created_at, v.transcript_quality
     FROM videos v
     WHERE v.calls_extracted = false
       AND v.transcript IS NOT NULL
       AND v.transcript_quality > 0.2
     ORDER BY v.published_at DESC`,
  );

  console.log(`[${timestamp()}] Found ${videos.length} videos to process`);

  let totalCalls = 0;
  let processed = 0;

  for (const video of videos) {
    if (!video.transcript) continue;

    const calls = extractCallsFromTranscript(video.transcript);
    const persistedCalls = calls.map((call) => ({
      symbol: call.symbol,
      direction: call.direction,
      call_type: call.call_type,
      entry_price: null,
      target_price: call.target_price,
      stop_loss: null,
      timeframe: null,
      confidence: call.confidence,
      strategy_type: call.strategy_type,
      raw_quote: call.raw_quote,
      extraction_confidence: 0.6,
      specificity_score: computeSpecificity({
        entry_price: null,
        target_price: call.target_price,
        stop_loss: null,
        timeframe: null,
      }),
    }));

    try {
      await replaceStoredCallsForVideo({
        creatorId: video.creator_id,
        videoId: video.id,
        callDate: video.published_at ?? video.created_at,
        calls: persistedCalls,
        markVideoExtracted: true,
      });
      totalCalls += calls.length;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[${timestamp()}]   Insert call error: ${msg}`);
      continue;
    }

    processed++;
    if (processed % 100 === 0 || calls.length > 0) {
      console.log(
        `[${timestamp()}] [${processed}/${videos.length}] ${video.title}: ${calls.length} calls`,
      );
    }
  }

  console.log(
    `[${timestamp()}] Extraction complete: ${processed} videos processed, ${totalCalls} calls extracted`,
  );
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] Fatal error:`, err);
  process.exit(1);
});
