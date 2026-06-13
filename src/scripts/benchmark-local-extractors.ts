import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { performance } from "perf_hooks";
import { loadEnv, timestamp } from "./script-helpers";

type Status =
  | "accepted_call"
  | "rejected_non_call"
  | "rejected_not_creator_owned"
  | "rejected_news_or_aggregation"
  | "rejected_ambiguous"
  | "rejected_invalid_json"
  | "rejected_unsupported_asset";

type Direction = "bullish" | "bearish" | "neutral" | null;
type Ownership =
  | "creator_own_call"
  | "guest_call"
  | "quoted_external_call"
  | "news_report"
  | "aggregation"
  | "unknown";
type BenchmarkSchema = "eval" | "production";

export interface ExpectedCall {
  readonly asset_symbol: string;
  readonly direction: Exclude<Direction, null>;
  readonly ownership?: Ownership;
  readonly is_creator_owned?: boolean;
  readonly entry_contains?: string;
  readonly target_contains?: string;
  readonly timeframe_contains?: string;
  readonly invalidation_contains?: string;
}

export interface ExpectedRejection {
  readonly status: Status;
  readonly ownership?: Ownership;
}

export interface Fixture {
  readonly id: string;
  readonly source_type: string;
  readonly transcript_text: string;
  readonly expected_behavior: string;
  readonly expected_calls: readonly ExpectedCall[];
  readonly expected_rejections: readonly ExpectedRejection[];
  readonly expected_public_eligible: boolean;
  readonly notes?: string;
}

export interface NormalizedExtraction {
  readonly status: Status;
  readonly quote: string | null;
  readonly asset_symbol: string | null;
  readonly direction: Direction;
  readonly call_type:
    | "directional"
    | "price_target"
    | "risk_warning"
    | "range_prediction"
    | null;
  readonly thesis: string | null;
  readonly timeframe: string | null;
  readonly entry_reference: string | null;
  readonly target: string | null;
  readonly stop_loss_or_invalidation: string | null;
  readonly ownership: Ownership;
  readonly is_creator_owned: boolean;
  readonly confidence: number;
  readonly rejection_reason: string | null;
}

export interface BenchmarkConfig {
  readonly model: string;
  readonly promptVariant: PromptVariant;
}

export interface ProductionExtraction {
  readonly symbol: string;
  readonly direction: "bullish" | "bearish" | "neutral";
  readonly call_type: "buy" | "sell" | "hold" | "watch" | "avoid";
  readonly entry_price: number | null;
  readonly target_price: number | null;
  readonly stop_loss: number | null;
  readonly timeframe: string | null;
  readonly confidence: "high" | "medium" | "low";
  readonly strategy_type:
    | "technical_analysis"
    | "fundamental"
    | "narrative"
    | "contrarian";
  readonly raw_quote: string;
  readonly extraction_confidence: number;
}

type PromptVariant =
  | "shared-baseline"
  | "gemma-optimized"
  | "qwen-optimized"
  | "modelfile-user";

const STATUSES: readonly Status[] = [
  "accepted_call",
  "rejected_non_call",
  "rejected_not_creator_owned",
  "rejected_news_or_aggregation",
  "rejected_ambiguous",
  "rejected_invalid_json",
  "rejected_unsupported_asset",
];
const OWNERSHIPS: readonly Ownership[] = [
  "creator_own_call",
  "guest_call",
  "quoted_external_call",
  "news_report",
  "aggregation",
  "unknown",
];
const DIRECTIONS = ["bullish", "bearish", "neutral", null] as const;
const CALL_TYPES = [
  "directional",
  "price_target",
  "risk_warning",
  "range_prediction",
  null,
] as const;
const PRODUCTION_CALL_TYPES = [
  "buy",
  "sell",
  "hold",
  "watch",
  "avoid",
] as const;
const PRODUCTION_CONFIDENCE = ["high", "medium", "low"] as const;
const PRODUCTION_STRATEGY_TYPES = [
  "technical_analysis",
  "fundamental",
  "narrative",
  "contrarian",
] as const;
const EVAL_SUPPORTED_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "DOGEUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "LINKUSDT",
  "NEARUSDT",
  "DOTUSDT",
  "ARUSDT",
  "RENDERUSDT",
] as const;
const PRODUCTION_SUPPORTED_SYMBOLS = [
  ...EVAL_SUPPORTED_SYMBOLS,
  "AVAXUSDT",
  "SUIUSDT",
] as const;

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || !argv[index + 1]) return null;
  return argv[index + 1];
}

function hasFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

export function readBenchmarkSchema(value: string | null): BenchmarkSchema {
  if (value === null || value === "" || value === "eval") return "eval";
  if (value === "production") return "production";
  throw new Error(
    `Unsupported benchmark schema '${value}'. Expected eval or production.`,
  );
}

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseConfig(input: string): BenchmarkConfig {
  const separator = input.lastIndexOf("@");
  if (separator <= 0)
    throw new Error(`Invalid config '${input}'. Expected model@prompt-variant`);
  const model = input.slice(0, separator);
  const promptVariant = input.slice(separator + 1) as PromptVariant;
  if (
    ![
      "shared-baseline",
      "gemma-optimized",
      "qwen-optimized",
      "modelfile-user",
    ].includes(promptVariant)
  ) {
    throw new Error(`Invalid prompt variant '${promptVariant}'`);
  }
  return { model, promptVariant };
}

export function loadFixtures(filePath: string): Fixture[] {
  return readFileSync(filePath, "utf8")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parsed = JSON.parse(line) as Fixture;
      if (!parsed.id || !parsed.transcript_text)
        throw new Error(`Fixture line ${index + 1} missing id/transcript_text`);
      return parsed;
    });
}

function extractionSchemaText(): string {
  return `Return a JSON array only. No markdown. No prose. Each array item must exactly use this schema:
{
  "status": "accepted_call" | "rejected_non_call" | "rejected_not_creator_owned" | "rejected_news_or_aggregation" | "rejected_ambiguous" | "rejected_invalid_json" | "rejected_unsupported_asset",
  "quote": string | null,
  "asset_symbol": string | null,
  "direction": "bullish" | "bearish" | "neutral" | null,
  "call_type": "directional" | "price_target" | "risk_warning" | "range_prediction" | null,
  "thesis": string | null,
  "timeframe": string | null,
  "entry_reference": string | null,
  "target": string | null,
  "stop_loss_or_invalidation": string | null,
  "ownership": "creator_own_call" | "guest_call" | "quoted_external_call" | "news_report" | "aggregation" | "unknown",
  "is_creator_owned": boolean,
  "confidence": number from 0 to 1,
  "rejection_reason": string | null
}
Use exact enum values only. Enum values must be quoted JSON strings. Use JSON null for missing values, never the string "null". Never output alternate labels such as accepted, rejected, rejected_quoted_external_call, buy, sell, long, short, creator, guest, or analyst.
Each array element must be a JSON object using braces, never an array of key/value strings.`;
}

export function buildPrompt(
  variant: PromptVariant,
  fixture: Fixture,
): { readonly system?: string; readonly user: string } {
  const sharedRules = `${extractionSchemaText()}
Only extract forward-looking, measurable crypto market calls for supported assets: ${EVAL_SUPPORTED_SYMBOLS.join(", ")}.
Only creator-owned calls can use status accepted_call with confidence >= 0.70.
Reject news, aggregation, guest calls, quoted third-party calls, retrospective claims, jokes, vague hype, and generic subtitle fragments.
For no-call/rejected cases, return one rejected_* object rather than inventing a trade.
If unsure, reject or use confidence below 0.70.
Never treat generic words such as link, near, dot, or ar as coin tickers unless the transcript clearly means Chainlink, NEAR Protocol, Polkadot, or Arweave.
Transcript:\n${fixture.transcript_text}`;

  if (variant === "modelfile-user") {
    return {
      user: `Extract CallScore normalized call objects from this transcript. Return JSON array only.\nTranscript:\n${fixture.transcript_text}`,
    };
  }

  if (variant === "gemma-optimized") {
    return {
      system: `You are CallScore's strict transcript-to-call extraction engine. Think internally, but output final JSON array only. Prefer precise rejection over unsafe extraction. Preserve creator-owned distinction. Never promote third-party, guest, news, aggregation, or vague hype into accepted_call.`,
      user: `${extractionSchemaText()}
Decision policy:
1. If the creator personally makes a measurable forward-looking market call, output accepted_call.
2. If a named third party, guest, analyst group, newsletter, or media source makes the call, reject it with ownership quoted_external_call, guest_call, news_report, or aggregation.
3. If the text is price/news context without creator advice, reject_non_call.
4. If hype lacks levels/timeframe/action, reject_ambiguous or confidence < 0.70.
5. Include numeric levels as strings in entry_reference, target, and stop_loss_or_invalidation.
6. For named third-party calls use status rejected_not_creator_owned and ownership quoted_external_call exactly.
7. For guest calls use status rejected_not_creator_owned and ownership guest_call exactly.
8. For analyst/newsletter/Twitter/media aggregation use status rejected_news_or_aggregation and ownership aggregation exactly.
9. For generic subtitle fragments with words like link, near, dot, or ar but no explicit crypto asset, use rejected_unsupported_asset.
10. For creator-owned risk warnings like "avoid DOGE if it loses 12, drop toward 8 next month", use accepted_call, bearish, risk_warning, target "8", invalidation "12", timeframe "next month".
11. For "cautious on Bitcoin below 90k", set entry_reference to "below 90k".
12. Return [] only if the transcript is empty; otherwise return at least one accepted or rejected object.
Supported assets: ${EVAL_SUPPORTED_SYMBOLS.join(", ")}.
Transcript:\n${fixture.transcript_text}`,
    };
  }

  if (variant === "qwen-optimized") {
    return {
      system: `Return only JSON array. No markdown. No explanation. Use the exact schema. If unsure, reject.`,
      user: `Task: classify this transcript as CallScore crypto calls.
Output must start with [ and end with ].
Allowed statuses: accepted_call, rejected_non_call, rejected_not_creator_owned, rejected_news_or_aggregation, rejected_ambiguous, rejected_invalid_json, rejected_unsupported_asset.
Rules:
- If the creator says I think, I am buying, I would avoid, or for my own portfolio and gives level/target/time/risk => accepted_call.
- For accepted_call: ownership must be creator_own_call and is_creator_owned true.
- News price context with no advice => rejected_non_call, ownership news_report.
- Named outside person says/calls/predicts => rejected_not_creator_owned, ownership quoted_external_call.
- Guest says / my guest says / not mine => rejected_not_creator_owned, ownership guest_call.
- Analysts, newsletters, Twitter, media repeat forecasts => rejected_news_or_aggregation, ownership aggregation.
- Vague hype with no measurable level/time/action => rejected_ambiguous.
- Generic words link/near/dot/ar without explicit crypto asset => rejected_unsupported_asset.
- confidence >= 0.70 only for accepted_call. Rejections use confidence 0.10 to 0.60.
Exact enum values:
status = accepted_call | rejected_non_call | rejected_not_creator_owned | rejected_news_or_aggregation | rejected_ambiguous | rejected_invalid_json | rejected_unsupported_asset
ownership = creator_own_call | guest_call | quoted_external_call | news_report | aggregation | unknown
direction = bullish | bearish | neutral | null
call_type = directional | price_target | risk_warning | range_prediction | null
Use object braces for each item, never nested arrays or key/value string arrays.
Schema keys: status, quote, asset_symbol, direction, call_type, thesis, timeframe, entry_reference, target, stop_loss_or_invalidation, ownership, is_creator_owned, confidence, rejection_reason.
Example accepted: [{"status":"accepted_call","quote":"I am buying SOL around 150, target 220 over 60 days, invalidated below 130","asset_symbol":"SOLUSDT","direction":"bullish","call_type":"price_target","thesis":"creator is buying SOL","timeframe":"60 days","entry_reference":"150","target":"220","stop_loss_or_invalidation":"130","ownership":"creator_own_call","is_creator_owned":true,"confidence":0.85,"rejection_reason":null}]
Example rejected guest: [{"status":"rejected_not_creator_owned","quote":"my guest says ADA can double","asset_symbol":"ADAUSDT","direction":null,"call_type":null,"thesis":null,"timeframe":null,"entry_reference":null,"target":null,"stop_loss_or_invalidation":null,"ownership":"guest_call","is_creator_owned":false,"confidence":0.3,"rejection_reason":"guest call, not creator owned"}]
Transcript: ${fixture.transcript_text}`,
    };
  }

  return {
    system:
      "You are CallScore's local transcript-to-call extractor. Return JSON array only. No markdown. No prose.",
    user: sharedRules,
  };
}

export function extractJsonArrayText(text: string): string {
  const trimmed = text
    .trim()
    .replace(/^```json?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return trimmed;
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1).trim();
  throw new Error("Model response did not contain a JSON array");
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.length || trimmed.toLowerCase() === "null") return null;
  return trimmed;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function confidenceValue(value: unknown): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  )
    return value;
  return null;
}

export function validateExtraction(item: unknown): {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly value?: NormalizedExtraction;
} {
  const errors: string[] = [];
  if (typeof item !== "object" || item === null || Array.isArray(item))
    return { ok: false, errors: ["not_object"] };
  const record = item as Record<string, unknown>;
  const status = record.status as Status;
  if (!STATUSES.includes(status)) errors.push("invalid_status");
  const ownership = record.ownership as Ownership;
  if (!OWNERSHIPS.includes(ownership)) errors.push("invalid_ownership");
  const direction = record.direction as Direction;
  if (!DIRECTIONS.includes(direction)) errors.push("invalid_direction");
  const callType = record.call_type as NormalizedExtraction["call_type"];
  if (!CALL_TYPES.includes(callType)) errors.push("invalid_call_type");
  const isCreatorOwned = booleanValue(record.is_creator_owned);
  if (isCreatorOwned === null) errors.push("invalid_is_creator_owned");
  const confidence = confidenceValue(record.confidence);
  if (confidence === null) errors.push("invalid_confidence");
  const assetSymbol = textOrNull(record.asset_symbol);
  if (assetSymbol !== null && !(EVAL_SUPPORTED_SYMBOLS as readonly string[]).includes(assetSymbol))
    errors.push("unsupported_asset_symbol");
  if (status === "accepted_call") {
    if (!assetSymbol) errors.push("accepted_missing_asset");
    if (!direction) errors.push("accepted_missing_direction");
    if (ownership !== "creator_own_call" || isCreatorOwned !== true)
      errors.push("accepted_not_creator_owned");
    if (confidence !== null && confidence < 0.7)
      errors.push("accepted_low_confidence");
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    value: {
      status,
      quote: textOrNull(record.quote),
      asset_symbol: assetSymbol,
      direction,
      call_type: callType,
      thesis: textOrNull(record.thesis),
      timeframe: textOrNull(record.timeframe),
      entry_reference: textOrNull(record.entry_reference),
      target: textOrNull(record.target),
      stop_loss_or_invalidation: textOrNull(record.stop_loss_or_invalidation),
      ownership,
      is_creator_owned: isCreatorOwned as boolean,
      confidence: confidence as number,
      rejection_reason: textOrNull(record.rejection_reason),
    },
  };
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Number.NaN;
}

function numberToText(value: number | null): string | null {
  return value === null ? null : String(value);
}

function productionConfidenceToNumber(
  value: ProductionExtraction["confidence"],
): number {
  if (value === "high") return 0.9;
  if (value === "medium") return 0.75;
  return 0.5;
}

function productionCallTypeToEval(
  value: ProductionExtraction["call_type"],
): NormalizedExtraction["call_type"] {
  if (value === "avoid") return "risk_warning";
  if (value === "buy" || value === "sell") return "price_target";
  return "directional";
}

export function validateProductionExtraction(item: unknown): {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly value?: ProductionExtraction;
  readonly normalized?: NormalizedExtraction;
} {
  const errors: string[] = [];
  if (typeof item !== "object" || item === null || Array.isArray(item))
    return { ok: false, errors: ["not_object"] };
  const record = item as Record<string, unknown>;
  const symbol =
    typeof record.symbol === "string" ? record.symbol.toUpperCase() : "";
  if (!(PRODUCTION_SUPPORTED_SYMBOLS as readonly string[]).includes(symbol)) errors.push("unsupported_symbol");
  const direction = record.direction as ProductionExtraction["direction"];
  if (!DIRECTIONS.filter(Boolean).includes(direction))
    errors.push("invalid_direction");
  const callType = record.call_type as ProductionExtraction["call_type"];
  if (!PRODUCTION_CALL_TYPES.includes(callType))
    errors.push("invalid_call_type");
  const entryPrice = numberOrNull(record.entry_price);
  const targetPrice = numberOrNull(record.target_price);
  const stopLoss = numberOrNull(record.stop_loss);
  if (Number.isNaN(entryPrice)) errors.push("invalid_entry_price");
  if (Number.isNaN(targetPrice)) errors.push("invalid_target_price");
  if (Number.isNaN(stopLoss)) errors.push("invalid_stop_loss");
  const timeframe = textOrNull(record.timeframe);
  const confidence = record.confidence as ProductionExtraction["confidence"];
  if (!PRODUCTION_CONFIDENCE.includes(confidence))
    errors.push("invalid_confidence");
  const strategyType =
    record.strategy_type as ProductionExtraction["strategy_type"];
  if (!PRODUCTION_STRATEGY_TYPES.includes(strategyType))
    errors.push("invalid_strategy_type");
  const rawQuote = textOrNull(record.raw_quote);
  if (!rawQuote) errors.push("missing_raw_quote");
  const extractionConfidence = confidenceValue(record.extraction_confidence);
  if (extractionConfidence === null)
    errors.push("invalid_extraction_confidence");
  if (errors.length > 0) return { ok: false, errors };
  const value: ProductionExtraction = {
    symbol,
    direction,
    call_type: callType,
    entry_price: entryPrice,
    target_price: targetPrice,
    stop_loss: stopLoss,
    timeframe,
    confidence,
    strategy_type: strategyType,
    raw_quote: rawQuote as string,
    extraction_confidence: extractionConfidence as number,
  };
  const normalizedEntry =
    value.call_type === "avoid" ? null : numberToText(value.entry_price);
  const normalizedInvalidation = numberToText(
    value.stop_loss ?? (value.call_type === "avoid" ? value.entry_price : null),
  );
  return {
    ok: true,
    errors: [],
    value,
    normalized: {
      status: "accepted_call",
      quote: value.raw_quote,
      asset_symbol: value.symbol,
      direction: value.direction,
      call_type: productionCallTypeToEval(value.call_type),
      thesis: null,
      timeframe: value.timeframe,
      entry_reference: normalizedEntry,
      target: numberToText(value.target_price),
      stop_loss_or_invalidation: normalizedInvalidation,
      ownership: "creator_own_call",
      is_creator_owned: true,
      confidence: productionConfidenceToNumber(value.confidence),
      rejection_reason: null,
    },
  };
}

export function validateExtractionForSchema(
  item: unknown,
  schema: BenchmarkSchema,
): {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly value?: NormalizedExtraction;
} {
  if (schema === "eval") return validateExtraction(item);
  const result = validateProductionExtraction(item);
  return { ok: result.ok, errors: result.errors, value: result.normalized };
}
function contains(
  haystack: string | null,
  needle: string | undefined,
): boolean {
  if (!needle) return true;
  return (haystack ?? "").toLowerCase().includes(needle.toLowerCase());
}

function expectedCallMatched(
  expected: ExpectedCall,
  calls: readonly NormalizedExtraction[],
): boolean {
  return calls.some(
    (call) =>
      call.status === "accepted_call" &&
      call.asset_symbol === expected.asset_symbol &&
      call.direction === expected.direction &&
      (!expected.ownership || call.ownership === expected.ownership) &&
      (expected.is_creator_owned === undefined ||
        call.is_creator_owned === expected.is_creator_owned) &&
      contains(call.entry_reference, expected.entry_contains) &&
      contains(call.target, expected.target_contains) &&
      contains(call.timeframe, expected.timeframe_contains) &&
      contains(call.stop_loss_or_invalidation, expected.invalidation_contains),
  );
}

function expectedRejectionMatched(
  expected: ExpectedRejection,
  calls: readonly NormalizedExtraction[],
): boolean {
  if (calls.length === 0) return true;
  return calls.some(
    (call) =>
      call.status === expected.status &&
      (!expected.ownership || call.ownership === expected.ownership),
  );
}

export function scoreFixture(
  fixture: Fixture,
  values: readonly NormalizedExtraction[],
  parseOk: boolean,
  schemaOk: boolean,
): {
  readonly pass: boolean;
  readonly falsePositive: boolean;
  readonly ownershipPass: boolean;
  readonly obviousRecall: boolean;
  readonly quotedRejectionPass: boolean;
  readonly reasons: readonly string[];
} {
  const reasons: string[] = [];
  if (!parseOk) reasons.push("invalid_json_array");
  if (!schemaOk) reasons.push("schema_invalid");
  const accepted = values.filter((value) => value.status === "accepted_call");
  const highConfidencePublic = accepted.filter(
    (value) =>
      value.confidence >= 0.7 &&
      value.is_creator_owned &&
      value.ownership === "creator_own_call",
  );
  const falsePositive =
    fixture.expected_public_eligible === false &&
    highConfidencePublic.length > 0;
  if (falsePositive) reasons.push("high_confidence_false_positive");
  const missingExpected = fixture.expected_calls.filter(
    (expected) => !expectedCallMatched(expected, values),
  );
  if (missingExpected.length > 0)
    reasons.push(
      `missing_expected_calls:${missingExpected.map((item) => item.asset_symbol).join(",")}`,
    );
  const missingRejections = fixture.expected_rejections.filter(
    (expected) => !expectedRejectionMatched(expected, values),
  );
  if (missingRejections.length > 0)
    reasons.push(
      `missing_expected_rejections:${missingRejections.map((item) => item.status).join(",")}`,
    );
  const ownershipPass = values.every(
    (value) =>
      value.status !== "accepted_call" ||
      (value.ownership === "creator_own_call" && value.is_creator_owned),
  );
  if (!ownershipPass) reasons.push("ownership_failed");
  const obviousRecall =
    fixture.expected_calls.length === 0 || missingExpected.length === 0;
  const quotedRejectionPass =
    !fixture.source_type.includes("quoted") ||
    (accepted.length === 0 && !falsePositive);
  return {
    pass:
      parseOk &&
      schemaOk &&
      !falsePositive &&
      missingExpected.length === 0 &&
      missingRejections.length === 0 &&
      ownershipPass,
    falsePositive,
    ownershipPass,
    obviousRecall,
    quotedRejectionPass,
    reasons,
  };
}

async function callOllama(input: {
  readonly host: string;
  readonly model: string;
  readonly prompt: ReturnType<typeof buildPrompt>;
  readonly timeoutMs: number;
  readonly numPredict: number;
}): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const messages = [
      ...(input.prompt.system
        ? [{ role: "system", content: input.prompt.system }]
        : []),
      { role: "user", content: input.prompt.user },
    ];
    const response = await fetch(`${input.host.replace(/\/+$/, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        stream: false,
        messages,
        keep_alive: "10m",
        options: {
          temperature: 0,
          num_predict: input.numPredict,
        },
      }),
      signal: controller.signal,
    });
    const body = (await response.json()) as {
      message?: { content?: unknown };
      error?: unknown;
    };
    if (!response.ok)
      throw new Error(
        `Ollama HTTP ${response.status}: ${String(body.error ?? "unknown")}`,
      );
    const content = body.message?.content;
    if (typeof content !== "string")
      throw new Error("Ollama response missing message.content");
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

export async function runBenchmark(input: {
  readonly fixtures: readonly Fixture[];
  readonly configs: readonly BenchmarkConfig[];
  readonly host: string;
  readonly timeoutMs: number;
  readonly numPredict: number;
  readonly schema: BenchmarkSchema;
}): Promise<Record<string, unknown>> {
  const rows = [] as Record<string, unknown>[];
  for (const config of input.configs) {
    for (const fixture of input.fixtures) {
      const started = performance.now();
      let rawOutput = "";
      let parseOk = false;
      let schemaOk = false;
      let validated: NormalizedExtraction[] = [];
      let parseError: string | null = null;
      let schemaErrors: readonly string[] = [];
      try {
        rawOutput = await callOllama({
          host: input.host,
          model: config.model,
          prompt: buildPrompt(config.promptVariant, fixture),
          timeoutMs: input.timeoutMs,
          numPredict: input.numPredict,
        });
        const jsonText = extractJsonArrayText(rawOutput);
        const parsed = JSON.parse(jsonText) as unknown;
        parseOk = Array.isArray(parsed);
        if (parseOk) {
          const checks = (parsed as unknown[]).map((item) =>
            validateExtractionForSchema(item, input.schema),
          );
          schemaErrors = checks.flatMap((check) => check.errors);
          schemaOk = checks.every((check) => check.ok);
          validated = checks.flatMap((check) =>
            check.value ? [check.value] : [],
          );
        }
      } catch (error) {
        parseError = error instanceof Error ? error.message : String(error);
      }
      const score = scoreFixture(fixture, validated, parseOk, schemaOk);
      rows.push({
        model: config.model,
        prompt_variant: config.promptVariant,
        schema: input.schema,
        fixture_id: fixture.id,
        source_type: fixture.source_type,
        latency_ms: Math.round(performance.now() - started),
        raw_output: rawOutput,
        parsed_json_array: parseOk,
        schema_valid: schemaOk,
        schema_errors: schemaErrors,
        extracted_call_count: validated.filter(
          (item) => item.status === "accepted_call",
        ).length,
        rejected_count: validated.filter(
          (item) => item.status !== "accepted_call",
        ).length,
        confidence_distribution: validated.map((item) => item.confidence),
        markdown_leak: /```/.test(rawOutput),
        prose_leak: rawOutput.trim().startsWith("[")
          ? false
          : rawOutput.trim().length > 0,
        ownership_pass: score.ownershipPass,
        false_positive: score.falsePositive,
        obvious_recall: score.obviousRecall,
        quoted_rejection_pass: score.quotedRejectionPass,
        pass: score.pass,
        failure_reasons: score.reasons,
        parse_error: parseError,
        normalized: validated,
      });
      console.log(JSON.stringify(rows[rows.length - 1]));
    }
  }
  const summaries = input.configs.map((config) => {
    const configRows = rows.filter(
      (row) =>
        row.model === config.model &&
        row.prompt_variant === config.promptVariant,
    );
    const fixtureCount = configRows.length || 1;
    const acceptedCalls = configRows.reduce(
      (sum, row) => sum + Number(row.extracted_call_count ?? 0),
      0,
    );
    const rejectedCalls = configRows.reduce(
      (sum, row) => sum + Number(row.rejected_count ?? 0),
      0,
    );
    const avgLatency = Math.round(
      configRows.reduce((sum, row) => sum + Number(row.latency_ms ?? 0), 0) /
        fixtureCount,
    );
    const validJson = configRows.filter((row) => row.parsed_json_array).length;
    const schemaPass = configRows.filter((row) => row.schema_valid).length;
    const falsePositives = configRows.filter(
      (row) => row.false_positive,
    ).length;
    const ownershipPass = configRows.filter((row) => row.ownership_pass).length;
    const obviousRecall = configRows.filter((row) => row.obvious_recall).length;
    const quotedRejection = configRows.filter(
      (row) => row.quoted_rejection_pass,
    ).length;
    const passed = configRows.filter((row) => row.pass).length;
    return {
      model: config.model,
      prompt_variant: config.promptVariant,
      schema: input.schema,
      fixture_count: configRows.length,
      passed_fixtures: passed,
      valid_json: validJson,
      valid_json_rate: validJson / fixtureCount,
      schema_pass: schemaPass,
      schema_pass_rate: schemaPass / fixtureCount,
      false_positives: falsePositives,
      creator_ownership_pass: ownershipPass,
      creator_ownership_pass_rate: ownershipPass / fixtureCount,
      obvious_call_recall: obviousRecall,
      obvious_call_recall_rate: obviousRecall / fixtureCount,
      quoted_call_rejection: quotedRejection,
      accepted_calls: acceptedCalls,
      rejected_calls: rejectedCalls,
      average_latency_ms: avgLatency,
      quality_gate_pass:
        validJson / fixtureCount >= 0.95 &&
        schemaPass / fixtureCount >= 0.95 &&
        falsePositives === 0 &&
        passed === configRows.length &&
        avgLatency <= 60_000,
      verdict:
        validJson / fixtureCount >= 0.95 &&
        schemaPass / fixtureCount >= 0.95 &&
        falsePositives === 0 &&
        passed === configRows.length &&
        avgLatency <= 60_000
          ? "candidate_pass"
          : "not_ready",
    };
  });
  return {
    generated_at: timestamp(),
    dry_run: true,
    host: input.host,
    schema: input.schema,
    fixture_count: input.fixtures.length,
    configs: input.configs,
    summaries,
    rows,
  };
}

function printTable(summaries: readonly Record<string, unknown>[]): void {
  console.log(
    "\nmodel\tprompt\tfixtures\tvalid_json\tschema\tfalse_pos\townership\trecall\taccepted\trejected\tavg_ms\tverdict",
  );
  for (const row of summaries) {
    console.log(
      [
        row.model,
        row.prompt_variant,
        row.fixture_count,
        row.valid_json,
        row.schema_pass,
        row.false_positives,
        row.creator_ownership_pass,
        row.obvious_call_recall,
        row.accepted_calls,
        row.rejected_calls,
        row.average_latency_ms,
        row.verdict,
      ].join("\t"),
    );
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const fixturesPath =
    argValue(argv, "--fixtures") ?? "data/eval/call-extraction-fixtures.jsonl";
  const configInput = argValue(argv, "--configs") ?? argValue(argv, "--models");
  if (!configInput)
    throw new Error("--configs model@prompt,model@prompt is required");
  const configs = configInput
    .split(",")
    .map((item) => parseConfig(item.trim()));
  const host =
    argValue(argv, "--host") ??
    process.env.OLLAMA_HOST ??
    "http://127.0.0.1:11434";
  const timeoutMs = positiveInt(argValue(argv, "--timeout-ms"), 60_000);
  const numPredict = positiveInt(argValue(argv, "--num-predict"), 900);
  const out = argValue(argv, "--out");
  const schema = readBenchmarkSchema(argValue(argv, "--schema"));
  const fixtures = loadFixtures(fixturesPath);
  if (!hasFlag(argv, "--dry-run")) {
    console.log(
      "[benchmark-local-extractors] no DB writes are implemented; running dry-run benchmark.",
    );
  }
  const result = await runBenchmark({
    fixtures,
    configs,
    host,
    timeoutMs,
    numPredict,
    schema,
  });
  printTable(result.summaries as Record<string, unknown>[]);
  if (out) {
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`wrote ${out}`);
  }
}

if (process.argv[1]?.endsWith("benchmark-local-extractors.ts")) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
    process.exit(1);
  });
}
