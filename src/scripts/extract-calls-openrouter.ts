import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { query } from "../lib/db";
import { auditExtractedCallCandidates, normalizeExtractedCalls } from "../lib/ai-extraction";
import { TRACKED_SYMBOLS } from "../lib/constants";
import type { CallType, Direction, StrategyType, Video } from "../lib/types";
import { loadEnv, replaceStoredCallsForVideo, sleep, timestamp } from "./script-helpers";

const DEFAULT_MODEL = "google/gemma-4-31b-it:free";
const DEFAULT_FALLBACK_MODEL = "google/gemma-4-31b-it";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_TRANSCRIPT_CHARS = 8_000;
const DEFAULT_CHUNK_CHARS = MAX_TRANSCRIPT_CHARS;
const DEFAULT_CHUNK_OVERLAP = 500;
const DEFAULT_MAX_CHUNKS = 100;
const MAX_ALLOWED_CHUNKS = 100;

interface OpenRouterArgs {
  readonly creatorHandle: string | null;
  readonly videoIds: readonly number[];
  readonly includeExtracted: boolean;
  readonly debugRaw: boolean;
  readonly model: string;
  readonly fallbackModel: string | null;
  readonly limit: number;
  readonly gapMs: number;
  readonly dryRun: boolean;
  readonly write: boolean;
  readonly auditOut: string | null;
  readonly chunkChars: number;
  readonly chunkOverlap: number;
  readonly maxChunks: number;
}

interface ChunkSettings {
  readonly chunkChars: number;
  readonly chunkOverlap: number;
  readonly maxChunks: number;
}

export interface TranscriptChunk {
  readonly index: number;
  readonly total: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

interface OpenRouterCandidate {
  readonly symbol: string;
  readonly direction: Direction;
  readonly call_type: CallType;
  readonly entry_price: number | null;
  readonly target_price: number | null;
  readonly stop_loss: number | null;
  readonly timeframe: string | null;
  readonly confidence: "high" | "medium" | "low";
  readonly strategy_type: StrategyType;
  readonly raw_quote: string;
  readonly extraction_confidence: number;
}

type PendingVideo = Video & { creator_id: number; creator_name: string; youtube_handle: string };

function argValue(argv: readonly string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  if (i < 0 || !argv[i + 1]) return null;
  return argv[i + 1];
}

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function positiveIntList(value: string | null): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((parsed) => Number.isInteger(parsed) && parsed > 0);
}

function sanitizeChunkSettings(settings: Partial<ChunkSettings>): ChunkSettings {
  const chunkChars = positiveInt(settings.chunkChars == null ? null : String(settings.chunkChars), DEFAULT_CHUNK_CHARS);
  const maxChunksInput = positiveInt(settings.maxChunks == null ? null : String(settings.maxChunks), DEFAULT_MAX_CHUNKS);
  const maxChunks = Math.min(maxChunksInput, MAX_ALLOWED_CHUNKS);
  let chunkOverlap = positiveInt(settings.chunkOverlap == null ? null : String(settings.chunkOverlap), DEFAULT_CHUNK_OVERLAP);
  if (chunkOverlap >= chunkChars) {
    chunkOverlap = DEFAULT_CHUNK_OVERLAP < chunkChars ? DEFAULT_CHUNK_OVERLAP : Math.max(0, chunkChars - 1);
  }
  return { chunkChars, chunkOverlap, maxChunks };
}

export function parseOpenRouterExtractionArgs(argv = process.argv.slice(2)): OpenRouterArgs {
  const write = argv.includes("--write");
  const chunkSettings = sanitizeChunkSettings({
    chunkChars: positiveInt(argValue(argv, "--chunk-chars"), DEFAULT_CHUNK_CHARS),
    chunkOverlap: positiveInt(argValue(argv, "--chunk-overlap"), DEFAULT_CHUNK_OVERLAP),
    maxChunks: positiveInt(argValue(argv, "--max-chunks"), DEFAULT_MAX_CHUNKS),
  });
  return {
    creatorHandle: argValue(argv, "--creator"),
    videoIds: positiveIntList(argValue(argv, "--video-ids")),
    includeExtracted: argv.includes("--include-extracted"),
    debugRaw: argv.includes("--debug-raw"),
    model: argValue(argv, "--model") ?? DEFAULT_MODEL,
    fallbackModel: argValue(argv, "--fallback-model") ?? DEFAULT_FALLBACK_MODEL,
    limit: positiveInt(argValue(argv, "--limit"), 10),
    gapMs: positiveInt(argValue(argv, "--gap-ms"), 5_000),
    write,
    dryRun: !write || argv.includes("--dry-run"),
    auditOut: argValue(argv, "--audit-out"),
    ...chunkSettings,
  };
}

export function extractJsonArrayText(text: string): string {
  const trimmed = text.trim().replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return trimmed;

  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1).trim();

  throw new Error("OpenRouter response did not contain a JSON array");
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function parseCandidates(text: string): OpenRouterCandidate[] {
  const parsed: unknown = JSON.parse(extractJsonArrayText(text));
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      symbol: String(item.symbol ?? "").trim(),
      direction: readEnum(String(item.direction ?? "neutral"), ["bullish", "bearish", "neutral"], "neutral"),
      call_type: readEnum(String(item.call_type ?? "watch"), ["buy", "sell", "hold", "watch", "avoid"], "watch"),
      entry_price: readNumber(item.entry_price),
      target_price: readNumber(item.target_price),
      stop_loss: readNumber(item.stop_loss),
      timeframe: typeof item.timeframe === "string" && item.timeframe.trim() ? item.timeframe.trim() : null,
      confidence: readEnum(String(item.confidence ?? "medium"), ["high", "medium", "low"], "medium"),
      strategy_type: readEnum(
        String(item.strategy_type ?? "narrative"),
        ["technical_analysis", "fundamental", "narrative", "contrarian"],
        "narrative",
      ),
      raw_quote: String(item.raw_quote ?? "").trim(),
      extraction_confidence: Math.max(0, Math.min(1, readNumber(item.extraction_confidence) ?? 0.5)),
    }))
    .filter((item) => item.symbol.length > 0 && item.raw_quote.length > 0);
}

function inferPrimarySymbol(title: string | null | undefined, transcript: string): string | null {
  const text = `${title ?? ""}\n${transcript.slice(0, 1000)}`.toLowerCase();
  const pairs: Array<[string, RegExp]> = [
    ["BTCUSDT", /\b(bitcoin|btc)\b/i],
    ["ETHUSDT", /\b(ethereum|eth)\b/i],
    ["SOLUSDT", /\b(solana|sol)\b/i],
    ["LINKUSDT", /\b(chainlink|link)\b/i],
    ["AVAXUSDT", /\b(avalanche|avax)\b/i],
    ["XRPUSDT", /\bxrp\b/i],
    ["DOGEUSDT", /\b(dogecoin|doge)\b/i],
    ["ADAUSDT", /\b(cardano|ada)\b/i],
    ["SUIUSDT", /\bsui\b/i],
  ];
  return pairs.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

export function splitTranscriptIntoChunks(transcript: string, settings: ChunkSettings): TranscriptChunk[] {
  const safe = sanitizeChunkSettings(settings);
  if (transcript.length <= safe.chunkChars) {
    return [{ index: 0, total: 1, start: 0, end: transcript.length, text: transcript }];
  }

  const chunks: Array<Omit<TranscriptChunk, "total">> = [];
  const step = Math.max(1, safe.chunkChars - safe.chunkOverlap);
  let start = 0;
  while (start < transcript.length && chunks.length < safe.maxChunks) {
    const end = Math.min(transcript.length, start + safe.chunkChars);
    chunks.push({ index: chunks.length, start, end, text: transcript.slice(start, end) });
    if (end >= transcript.length) break;
    start += step;
  }

  const total = chunks.length;
  return chunks.map((chunk) => ({ ...chunk, total }));
}

export function openRouterPrompt(
  transcript: string,
  title?: string | null,
  chunk?: TranscriptChunk,
  fullTranscriptForHints = transcript,
): string {
  const symbols = TRACKED_SYMBOLS.join(", ");
  const primarySymbol = inferPrimarySymbol(title, fullTranscriptForHints);
  const symbolHint = primarySymbol ? `Primary symbol hint: use ${primarySymbol} for the main coin if the transcript supports it.\n` : "";
  const chunkContext = chunk
    ? `Transcript chunk: ${chunk.index + 1} of ${chunk.total} (offsets ${chunk.start}-${chunk.end})\n`
    : "Transcript chunk: 1 of 1 (offsets 0-${transcript.length})\n";
  return `Extract crypto trading calls from this transcript chunk. Be more intelligent than a strict regex. Return ONLY a JSON array.

Video title: ${title ?? "unknown"}
${symbolHint}Allowed symbols: ${symbols}

Use the video title and transcript to map coin names/tickers to allowed symbols. Name mapping examples only: Bitcoin/BTC -> BTCUSDT, Ethereum/ETH -> ETHUSDT, Solana/SOL -> SOLUSDT, Chainlink/LINK -> LINKUSDT.

WHAT COUNTS AS A CALL:
- A creator gives an actionable directional view, trade idea, accumulation zone, avoid/sell warning, breakout/breakdown scenario, support/resistance level to watch, target, stop, or portfolio action for a tracked coin.
- Chart scenarios count if they contain a coin + direction/condition/level, even if phrased as "if", "watch", "wait for", "more likely", "support", "resistance", "accumulate", "long", "short", "profit book", "avoid", or "don't hold".
- A call can be bullish, bearish, or neutral/watch. Do not require a full entry+target+stop setup.
- Preserve the exact original-language evidence quote. Do not translate the quote. Do not invent prices.

POSITIVE EXAMPLES - EXTRACT THESE:
1. Quote: "if Bitcoin holds above 80,000 then we can see the next leg up"
   Output: {"symbol":"BTCUSDT","direction":"bullish","call_type":"watch","entry_price":80000,"target_price":null,"stop_loss":null,"timeframe":null,"confidence":"medium","strategy_type":"technical_analysis","raw_quote":"if Bitcoin holds above 80,000 then we can see the next leg up","extraction_confidence":0.85}
2. Quote: "my personal view is 50 to 70k is a good zone to accumulate Bitcoin"
   Output: {"symbol":"BTCUSDT","direction":"bullish","call_type":"buy","entry_price":60000,"target_price":null,"stop_loss":null,"timeframe":"accumulation zone","confidence":"medium","strategy_type":"narrative","raw_quote":"my personal view is 50 to 70k is a good zone to accumulate Bitcoin","extraction_confidence":0.9}
3. Quote: "Solana needs to break above 90 91 and then we can rally higher"
   Output: {"symbol":"SOLUSDT","direction":"bullish","call_type":"watch","entry_price":91,"target_price":null,"stop_loss":null,"timeframe":null,"confidence":"medium","strategy_type":"technical_analysis","raw_quote":"Solana needs to break above 90 91 and then we can rally higher","extraction_confidence":0.9}
4. Quote: "मैंने Bitcoin में 74,000 के आस-पास profit book किया था, फिर again long किया"
   Output: {"symbol":"BTCUSDT","direction":"bullish","call_type":"buy","entry_price":74000,"target_price":null,"stop_loss":null,"timeframe":null,"confidence":"medium","strategy_type":"technical_analysis","raw_quote":"मैंने Bitcoin में 74,000 के आस-पास profit book किया था, फिर again long किया","extraction_confidence":0.85}
5. Quote: "don't long term hold Dogecoin; wait for volume to die and then a short can be made"
   Output: {"symbol":"DOGEUSDT","direction":"bearish","call_type":"avoid","entry_price":null,"target_price":null,"stop_loss":null,"timeframe":null,"confidence":"medium","strategy_type":"technical_analysis","raw_quote":"don't long term hold Dogecoin; wait for volume to die and then a short can be made","extraction_confidence":0.8}
6. Quote: "Bitcoin masih ada potensi untuk dump lagi ke area 50 ribuan"
   Output: {"symbol":"BTCUSDT","direction":"bearish","call_type":"watch","entry_price":null,"target_price":50000,"stop_loss":null,"timeframe":null,"confidence":"medium","strategy_type":"technical_analysis","raw_quote":"Bitcoin masih ada potensi untuk dump lagi ke area 50 ribuan","extraction_confidence":0.85}

NEGATIVE EXAMPLES - DO NOT EXTRACT:
- News only: "BlackRock filed an ETF" with no creator prediction/trade view.
- Education only: "Bitcoin is decentralized".
- Macro only without tracked coin action: "liquidity is improving".
- Promo/description: "join the link in description" is NOT LINKUSDT.
- Generic words: "near the support", "dot on the chart", "AR glasses" are NOT NEARUSDT/DOTUSDT/ARUSDT unless the quote explicitly says NEAR Protocol/Polkadot/Arweave or ticker with crypto context.
- Historical-only examples unless the creator clearly says they would do it again or it remains active.
- A quote that lacks exact coin/ticker evidence unless the video title and surrounding transcript clearly establish the coin being analyzed.

Each item must use this shape:
{"symbol":"${primarySymbol ?? "SOLUSDT"}","direction":"bullish|bearish|neutral","call_type":"buy|sell|hold|watch|avoid","entry_price":number|null,"target_price":number|null,"stop_loss":number|null,"timeframe":"string|null","confidence":"high|medium|low","strategy_type":"technical_analysis|fundamental|narrative|contrarian","raw_quote":"exact quote from transcript containing the coin context and directional signal; no ellipses","extraction_confidence":0.0-1.0}

If there are no actionable tracked-coin calls, return [].

Transcript chunk metadata:
${chunkContext}
Transcript chunk text:
${transcript}`;
}

async function callOpenRouter(model: string, transcript: string, title?: string | null, chunk?: TranscriptChunk, fullTranscript?: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_BASE_URL ?? "https://crypto-tuber-ranked.local",
        "X-Title": "crypto-tuber-ranked",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: openRouterPrompt(transcript, title, chunk, fullTranscript ?? transcript) }],
        temperature: 0,
        max_tokens: 2000,
        reasoning: model.includes("gemini-2.5-pro")
          ? { effort: "medium", exclude: true }
          : { effort: "none", exclude: true },
      }),
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`OpenRouter ${model} request timed out after 60000ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`OpenRouter ${model} HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  const parsed: unknown = JSON.parse(body);
  const content = (parsed as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error(`OpenRouter ${model} response missing message content: ${body.trim().slice(0, 500)}`);
  return content;
}

interface ChunkExtractionAudit {
  readonly chunk: TranscriptChunk;
  readonly model: string;
  readonly rawText: string;
  readonly candidates: readonly OpenRouterCandidate[];
  readonly audited: ReturnType<typeof auditExtractedCallCandidates>;
}

interface ExtractionResult {
  readonly model: string;
  readonly rawText: string;
  readonly candidates: readonly OpenRouterCandidate[];
  readonly audited: ReturnType<typeof auditExtractedCallCandidates>;
  readonly calls: ReturnType<typeof normalizeExtractedCalls>;
  readonly chunks: readonly ChunkExtractionAudit[];
  readonly chunkSettings: ChunkSettings;
}

async function extractChunkWithModelFallback(
  args: OpenRouterArgs,
  chunk: TranscriptChunk,
  fullTranscript: string,
  title?: string | null,
): Promise<ChunkExtractionAudit> {
  const models = [args.model, ...(args.fallbackModel && args.fallbackModel !== args.model ? [args.fallbackModel] : [])];
  let lastError: unknown = null;
  const validationTranscript = title ? `${title}\n${fullTranscript}` : fullTranscript;

  for (const model of models) {
    try {
      const text = await callOpenRouter(model, chunk.text, title, chunk, fullTranscript);
      const candidates = parseCandidates(text);
      if (args.debugRaw) {
        console.log(`[${timestamp()}] raw ${model} chunk ${chunk.index + 1}/${chunk.total}: ${text.slice(0, 2000)}`);
        console.log(`[${timestamp()}] parsed candidates chunk ${chunk.index + 1}/${chunk.total}: ${JSON.stringify(candidates).slice(0, 2000)}`);
      }
      const audited = auditExtractedCallCandidates(validationTranscript, candidates);
      return { chunk, model, rawText: text, candidates, audited };
    } catch (error: unknown) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${timestamp()}] model ${model} failed on chunk ${chunk.index + 1}/${chunk.total}: ${message}`);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function extractWithModelFallback(args: OpenRouterArgs, transcript: string, title?: string | null): Promise<ExtractionResult> {
  const chunks = splitTranscriptIntoChunks(transcript, args);
  const chunkResults: ChunkExtractionAudit[] = [];

  for (const chunk of chunks) {
    chunkResults.push(await extractChunkWithModelFallback(args, chunk, transcript, title));
  }

  const candidates = chunkResults.flatMap((result) => [...result.candidates]);
  const validationTranscript = title ? `${title}\n${transcript}` : transcript;
  const audited = auditExtractedCallCandidates(validationTranscript, candidates);
  const calls = normalizeExtractedCalls(validationTranscript, candidates);
  return {
    model: Array.from(new Set(chunkResults.map((result) => result.model))).join(","),
    rawText: chunkResults.map((result) => result.rawText).join("\n"),
    candidates,
    audited,
    calls,
    chunks: chunkResults,
    chunkSettings: {
      chunkChars: args.chunkChars,
      chunkOverlap: args.chunkOverlap,
      maxChunks: args.maxChunks,
    },
  };
}

async function loadPendingVideos(args: OpenRouterArgs): Promise<PendingVideo[]> {
  const params: unknown[] = [];
  const filters: string[] = ["v.transcript IS NOT NULL", "v.transcript_quality > 0.2"];

  if (!args.includeExtracted && args.videoIds.length === 0) {
    filters.push("v.calls_extracted = false");
  }

  if (args.creatorHandle) {
    params.push(args.creatorHandle);
    filters.push(`c.youtube_handle = $${params.length}`);
  }

  if (args.videoIds.length > 0) {
    params.push(args.videoIds);
    filters.push(`v.id = ANY($${params.length}::int[])`);
  }

  params.push(args.limit);

  return query<PendingVideo>(
    `SELECT v.*, v.creator_id, c.name as creator_name, c.youtube_handle
     FROM videos v
     JOIN creators c ON c.id = v.creator_id
     WHERE ${filters.join(" AND ")}
     ORDER BY v.published_at DESC NULLS LAST, v.id DESC
     LIMIT $${params.length}`,
    params,
  );
}

function appendAuditRecord(args: OpenRouterArgs, video: PendingVideo, result: ExtractionResult): void {
  if (!args.auditOut) return;
  mkdirSync(dirname(args.auditOut), { recursive: true });
  const record = {
    ts: timestamp(),
    model: result.model,
    video: {
      id: video.id,
      creator_id: video.creator_id,
      creator_name: video.creator_name,
      youtube_handle: video.youtube_handle,
      title: video.title,
      published_at: video.published_at,
    },
    candidate_count: result.candidates.length,
    accepted_count: result.calls.length,
    chunk_settings: result.chunkSettings,
    chunk_summary: {
      transcript_length: video.transcript?.length ?? 0,
      chunk_count: result.chunks.length,
      covered_until_offset: result.chunks.at(-1)?.chunk.end ?? 0,
      reached_transcript_end: (result.chunks.at(-1)?.chunk.end ?? 0) >= (video.transcript?.length ?? 0),
      processed_offsets: result.chunks.map((item) => ({
        index: item.chunk.index,
        total: item.chunk.total,
        start: item.chunk.start,
        end: item.chunk.end,
        text_length: item.chunk.text.length,
        model: item.model,
        raw_candidate_count: item.candidates.length,
        accepted_candidate_count: item.audited.filter((candidate) => candidate.isValid).length,
      })),
    },
    chunks: result.chunks.map((item) => ({
      chunk: {
        index: item.chunk.index,
        total: item.chunk.total,
        start: item.chunk.start,
        end: item.chunk.end,
        text_length: item.chunk.text.length,
      },
      model: item.model,
      raw_candidate_count: item.candidates.length,
      accepted_candidate_count: item.audited.filter((candidate) => candidate.isValid).length,
      candidates: item.audited.map((candidate) => ({
        raw: candidate.candidate,
        normalized: candidate.normalized,
        is_valid: candidate.isValid,
        validation_notes: candidate.validation_notes,
      })),
    })),
    candidates: result.audited.map((item) => ({
      raw: item.candidate,
      normalized: item.normalized,
      is_valid: item.isValid,
      validation_notes: item.validation_notes,
    })),
    accepted_calls: result.calls,
  };
  appendFileSync(args.auditOut, `${JSON.stringify(record)}\n`);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseOpenRouterExtractionArgs(argv);
  const videos = await loadPendingVideos(args);
  console.log(
    `[${timestamp()}] OpenRouter extract ${args.write ? "WRITE" : "DRY-RUN"}: videos=${videos.length}, model=${args.model}, fallback=${args.fallbackModel ?? "none"}`,
  );

  let processed = 0;
  let totalCalls = 0;
  let failed = 0;
  for (let index = 0; index < videos.length; index += 1) {
    const video = videos[index];
    let result: ExtractionResult;
    try {
      result = await extractWithModelFallback(args, video.transcript ?? "", video.title);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${timestamp()}] FAIL video ${video.id} (${video.creator_name}): ${message}`);
      continue;
    }
    const calls = result.calls;
    appendAuditRecord(args, video, result);
    if (args.write) {
      await replaceStoredCallsForVideo({
        creatorId: video.creator_id,
        videoId: video.id,
        callDate: video.published_at ?? video.created_at,
        calls,
        markVideoExtracted: true,
      });
    }
    processed += 1;
    totalCalls += calls.length;
    console.log(`[${timestamp()}] [${index + 1}/${videos.length}] ${video.creator_name} :: video ${video.id} -> ${calls.length} calls`);
    if (index < videos.length - 1 && args.gapMs > 0) await sleep(args.gapMs);
  }

  console.log(`[${timestamp()}] OpenRouter extract complete: ${processed}/${videos.length} videos, ${totalCalls} calls, ${failed} failed`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[${timestamp()}] Fatal error:`, err);
    process.exit(1);
  });
}
