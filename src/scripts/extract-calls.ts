import * as fs from "fs";
import * as path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { query } from "../lib/db";
import { TRACKED_SYMBOLS, SYMBOL_NAMES, SYMBOL_TICKERS } from "../lib/constants";
import { computeSpecificity } from "../lib/scoring";
import type { Video, ExtractedCall } from "../lib/types";

function loadEnv(): void {
  if (process.env.NEON_DATABASE_URL && process.env.ANTHROPIC_API_KEY) return;
  const envPath = path.resolve(__dirname, "../../.env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx < 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function timestamp(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Build a lookup for coin name/ticker -> symbol
const COIN_LOOKUP: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const symbol of TRACKED_SYMBOLS) {
    map.set(symbol.toLowerCase(), symbol);
    const name = SYMBOL_NAMES[symbol];
    if (name) map.set(name.toLowerCase(), symbol);
    const ticker = SYMBOL_TICKERS[symbol];
    if (ticker) map.set(ticker.toLowerCase(), symbol);
  }
  // Common aliases
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

interface MentionResult {
  readonly symbol: string;
  readonly context: string;
  readonly is_actionable_guess: boolean;
}

interface ExtractionResult extends ExtractedCall {
  readonly extraction_confidence: number;
}

/**
 * Pass 1: Mention detection. Identify all mentions of tracked coins with context.
 */
async function detectMentions(
  client: Anthropic,
  transcript: string,
): Promise<readonly MentionResult[]> {
  // Truncate very long transcripts to avoid token limits
  const truncated = transcript.length > 30_000 ? transcript.slice(0, 30_000) : transcript;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are analyzing a crypto YouTube video transcript to find mentions of specific coins.

TRACKED COINS: ${SYMBOL_LIST_STR}

For each mention of any tracked coin, extract:
- symbol: the USDT pair (e.g., "SOLUSDT")
- context: ~50 words before and after the mention
- is_actionable_guess: boolean - does this seem like an actionable prediction/call (true) or just news/commentary (false)?

Examples of actionable: "I think SOL could hit $200", "Buy ETH here", "BTC is going to 100K"
Examples of NOT actionable: "SOL had a good day", "Bitcoin news today", "ETH launched an update"

Return a JSON array. If no tracked coins mentioned, return [].

TRANSCRIPT:
${truncated}

Respond ONLY with valid JSON array, no markdown fences.`,
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";

  try {
    // Try to extract JSON from the response
    const jsonStr = text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
    const parsed: unknown = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (m: unknown): m is { symbol: string; context: string; is_actionable_guess: boolean } =>
          typeof m === "object" &&
          m !== null &&
          "symbol" in m &&
          "context" in m &&
          "is_actionable_guess" in m,
      )
      .map((m) => ({
        symbol: COIN_LOOKUP.get(String(m.symbol).toLowerCase()) ?? String(m.symbol),
        context: String(m.context),
        is_actionable_guess: Boolean(m.is_actionable_guess),
      }))
      .filter((m) => TRACKED_SYMBOLS.includes(m.symbol as typeof TRACKED_SYMBOLS[number]));
  } catch {
    console.error(`[${timestamp()}] Failed to parse mention detection response`);
    return [];
  }
}

/**
 * Pass 2: Structured extraction for actionable mentions.
 */
async function extractCall(
  client: Anthropic,
  symbol: string,
  context: string,
): Promise<ExtractionResult | null> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are a crypto analyst extracting specific coin calls from a YouTube video transcript excerpt.

ONLY extract if this is a SPECIFIC ACTIONABLE call - not general commentary or news mention.

"I think SOL could go to $200" = EXTRACT (bullish, target $200)
"SOL had a good day" = DO NOT EXTRACT (just commentary)
"I'm buying SOL here" = EXTRACT (bullish, buy)

Extract:
{
  "symbol": "${symbol}",
  "direction": "bullish|bearish|neutral",
  "call_type": "buy|sell|hold|watch|avoid",
  "entry_price": null or number,
  "target_price": null or number,
  "stop_loss": null or number,
  "timeframe": "string or null",
  "confidence": "high|medium|low",
  "strategy_type": "technical_analysis|fundamental|narrative|contrarian",
  "raw_quote": "exact quote from context",
  "extraction_confidence": 0.0-1.0
}

If not actionable, return null.

CONTEXT:
${context}

Respond ONLY with valid JSON (object or null), no markdown fences.`,
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";

  try {
    const jsonStr = text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
    if (jsonStr === "null" || jsonStr === "") return null;

    const parsed: unknown = JSON.parse(jsonStr);
    if (typeof parsed !== "object" || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;
    if (!obj.direction || !obj.raw_quote) return null;

    const extractionConfidence = typeof obj.extraction_confidence === "number"
      ? obj.extraction_confidence
      : 0.5;

    return {
      symbol,
      direction: String(obj.direction) as ExtractedCall["direction"],
      call_type: String(obj.call_type || "watch") as ExtractedCall["call_type"],
      entry_price: typeof obj.entry_price === "number" ? obj.entry_price : null,
      target_price: typeof obj.target_price === "number" ? obj.target_price : null,
      stop_loss: typeof obj.stop_loss === "number" ? obj.stop_loss : null,
      timeframe: typeof obj.timeframe === "string" ? obj.timeframe : null,
      confidence: String(obj.confidence || "medium") as ExtractedCall["confidence"],
      strategy_type: String(obj.strategy_type || "narrative") as ExtractedCall["strategy_type"],
      raw_quote: String(obj.raw_quote),
      extraction_confidence: extractionConfidence,
    };
  } catch {
    console.error(`[${timestamp()}] Failed to parse extraction response for ${symbol}`);
    return null;
  }
}

async function processVideo(
  client: Anthropic,
  video: Video & { readonly creator_id: number },
): Promise<number> {
  if (!video.transcript || video.transcript.trim().length === 0) {
    return 0;
  }

  // Pass 1: Detect mentions
  const mentions = await detectMentions(client, video.transcript);
  await sleep(600);

  const actionableMentions = mentions.filter((m) => m.is_actionable_guess);
  if (actionableMentions.length === 0) {
    // Mark as extracted even if no calls found
    await query(
      "UPDATE videos SET calls_extracted = true, extraction_pass = extraction_pass + 1 WHERE id = $1",
      [video.id],
    );
    return 0;
  }

  let callCount = 0;

  // Pass 2: Extract structured calls for actionable mentions
  for (const mention of actionableMentions) {
    const result = await extractCall(client, mention.symbol, mention.context);
    await sleep(600);

    if (!result || result.extraction_confidence < 0.7) {
      continue;
    }

    const specificityScore = computeSpecificity({
      entry_price: result.entry_price,
      target_price: result.target_price,
      stop_loss: result.stop_loss,
      timeframe: result.timeframe,
    });

    const callDate = video.published_at ?? video.created_at;

    try {
      await query(
        `INSERT INTO calls (
          creator_id, video_id, symbol, direction, call_type,
          entry_price, target_price, stop_loss, timeframe,
          confidence, strategy_type, raw_quote,
          extraction_confidence, specificity_score, call_date
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12,
          $13, $14, $15
        )`,
        [
          video.creator_id,
          video.id,
          result.symbol,
          result.direction,
          result.call_type,
          result.entry_price,
          result.target_price,
          result.stop_loss,
          result.timeframe,
          result.confidence,
          result.strategy_type,
          result.raw_quote,
          result.extraction_confidence,
          specificityScore,
          callDate,
        ],
      );
      callCount++;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[${timestamp()}]   Insert call error: ${msg}`);
    }
  }

  // Mark video as extracted
  await query(
    "UPDATE videos SET calls_extracted = true, extraction_pass = extraction_pass + 1 WHERE id = $1",
    [video.id],
  );

  return callCount;
}

async function main(): Promise<void> {
  loadEnv();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "your-anthropic-api-key") {
    console.error(`[${timestamp()}] ERROR: ANTHROPIC_API_KEY not configured`);
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });

  console.log(`[${timestamp()}] Starting call extraction...`);

  // Fetch unprocessed videos (limit 100 per run for rate limiting)
  const videos = await query<Video & { creator_id: number }>(
    `SELECT v.*, v.creator_id
     FROM videos v
     WHERE v.calls_extracted = false
       AND v.transcript IS NOT NULL
       AND v.transcript_quality > 0.2
     ORDER BY v.published_at DESC
     LIMIT 100`,
  );

  console.log(`[${timestamp()}] Found ${videos.length} videos to process`);

  let totalCalls = 0;
  let processed = 0;

  for (const video of videos) {
    try {
      const calls = await processVideo(client, video);
      totalCalls += calls;
      processed++;
      console.log(
        `[${timestamp()}] [${processed}/${videos.length}] ${video.title}: ${calls} calls extracted`,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[${timestamp()}] Error processing video ${video.id}: ${msg}`);
      // Continue with next video
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
