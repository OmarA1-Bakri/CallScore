import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { auditExtraction } from "../lib/extraction-validation";
import { query } from "../lib/db";
import { recomputeAllStats } from "../lib/recompute-stats";
import {
  EXTRACTION_CONFIDENCE_THRESHOLD,
  getCallScoreStatus,
  getScoreReadyIgnoringConfidenceSql,
} from "../lib/public-methodology";

export interface AuditRecomputeArgs {
  readonly callId: number | null;
  readonly creatorHandle: string | null;
  readonly allLegacy: boolean;
  readonly scoreReadyLowConfidence: boolean;
  readonly validOnly: boolean;
  readonly write: boolean;
  readonly json: boolean;
  readonly summary: boolean;
  readonly limit: number | null;
  readonly startAfterId: number | null;
}

interface AuditRow {
  readonly id: number;
  readonly creator_id: number;
  readonly video_id: number;
  readonly symbol: string;
  readonly direction: "bullish" | "bearish" | "neutral";
  readonly target_price: number | null;
  readonly raw_quote: string | null;
  readonly extraction_confidence: number;
  readonly confidence: string | null;
  readonly call_date: string;
  readonly price_at_call: number | null;
  readonly price_30d: number | null;
  readonly price_90d: number | null;
  readonly return_30d: number | null;
  readonly hit_target: boolean | null;
  readonly transcript: string | null;
  readonly creator_name: string;
  readonly youtube_handle: string;
}

interface AuditResult {
  readonly id: number;
  readonly creator: string;
  readonly symbol: string;
  readonly before: {
    readonly direction: string;
    readonly target_price: number | null;
    readonly extraction_confidence: number;
    readonly score_status: string;
  };
  readonly after: {
    readonly direction: string;
    readonly target_price: number | null;
    readonly extraction_confidence: number;
    readonly score_status: string;
    readonly excerpt: string;
  };
  readonly reasons: readonly string[];
}

const LOW_CONFIDENCE_READY_BATCH_SIZE = 500;

function loadEnv(): void {
  if (process.env.NEON_DATABASE_URL) return;
  const root = path.resolve(__dirname, "../..");
  const envPath = fs.existsSync(path.join(root, ".env.local"))
    ? path.join(root, ".env.local")
    : path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx < 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function positiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

export function parseArgs(argv: readonly string[]): AuditRecomputeArgs {
  let callId: number | null = null;
  let creatorHandle: string | null = null;
  let allLegacy = false;
  let scoreReadyLowConfidence = false;
  let validOnly = false;
  let write = false;
  let json = false;
  let summary = false;
  let limit: number | null = null;
  let startAfterId: number | null = null;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--call" && argv[index + 1]) {
      callId = parseInt(argv[index + 1], 10);
      index++;
    } else if (arg === "--creator" && argv[index + 1]) {
      creatorHandle = argv[index + 1];
      index++;
    } else if (arg === "--all-legacy") {
      allLegacy = true;
    } else if (arg === "--score-ready-low-confidence") {
      scoreReadyLowConfidence = true;
    } else if (arg === "--valid-only") {
      validOnly = true;
    } else if (arg === "--write") {
      write = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--summary") {
      summary = true;
    } else if (arg === "--limit") {
      limit = positiveInt(argv[index + 1]);
      index++;
    } else if (arg === "--start-after-id") {
      startAfterId = positiveInt(argv[index + 1]);
      index++;
    }
  }

  return {
    callId,
    creatorHandle,
    allLegacy,
    scoreReadyLowConfidence,
    validOnly,
    write,
    json,
    summary,
    limit,
    startAfterId,
  };
}

function toConfidenceLabel(value: number): "high" | "medium" | "low" {
  if (value >= 0.9) return "high";
  if (value >= 0.7) return "medium";
  return "low";
}

export function buildWhereClause(args: AuditRecomputeArgs): {
  readonly sql: string;
  readonly params: readonly unknown[];
} {
  let sql: string;
  const params: unknown[] = [];

  if (args.callId !== null) {
    params.push(args.callId);
    sql = `c.id = $${params.length}`;
  } else if (args.creatorHandle !== null) {
    params.push(args.creatorHandle);
    sql = `cr.youtube_handle = $${params.length}`;
  } else if (args.scoreReadyLowConfidence) {
    sql = [
      `c.extraction_confidence < ${EXTRACTION_CONFIDENCE_THRESHOLD}`,
      getScoreReadyIgnoringConfidenceSql("c"),
    ].join(" AND ");
  } else if (args.allLegacy) {
    sql = "c.extraction_confidence = 0.6";
  } else {
    throw new Error("Specify --call <id>, --creator <handle>, --all-legacy, or --score-ready-low-confidence");
  }

  if (args.startAfterId !== null) {
    params.push(args.startAfterId);
    sql = `(${sql}) AND c.id > $${params.length}`;
  }

  return { sql, params };
}

async function loadAuditRows(args: AuditRecomputeArgs): Promise<AuditRow[]> {
  const where = buildWhereClause(args);
  const params = [...where.params];
  const limitClause = args.limit !== null
    ? `LIMIT $${params.push(args.limit)}`
    : "";
  return query<AuditRow>(
    `SELECT
      c.id,
      c.creator_id,
      c.video_id,
      c.symbol,
      c.direction,
      c.target_price,
      c.raw_quote,
      c.extraction_confidence,
      c.confidence,
      c.call_date::text AS call_date,
      c.price_at_call,
      c.price_30d,
      c.price_90d,
      c.return_30d,
      c.hit_target,
      v.transcript,
      cr.name AS creator_name,
      cr.youtube_handle
     FROM calls c
     JOIN videos v ON v.id = c.video_id
     JOIN creators cr ON cr.id = c.creator_id
     WHERE ${where.sql}
     ORDER BY c.id ASC
     ${limitClause}`,
    params,
  );
}

export function analyzeAuditRows(rows: readonly AuditRow[]): AuditResult[] {
  return rows.map((row) => {
    const beforeStatus = getCallScoreStatus({
      extraction_confidence: row.extraction_confidence,
      call_date: row.call_date,
      price_at_call: row.price_at_call,
      target_price: row.target_price,
      price_30d: row.price_30d,
      price_90d: row.price_90d,
      return_30d: row.return_30d,
      hit_target: row.hit_target,
    });

    const audit = auditExtraction({
      symbol: row.symbol,
      direction: row.direction,
      target_price: row.target_price,
      raw_quote: row.raw_quote,
      transcript: row.transcript,
      extraction_confidence: row.extraction_confidence,
    });

    const afterStatus = getCallScoreStatus({
      extraction_confidence: audit.normalizedConfidence,
      call_date: row.call_date,
      price_at_call: row.price_at_call,
      target_price: audit.targetPrice,
      price_30d: row.price_30d,
      price_90d: row.price_90d,
      return_30d: row.return_30d,
      hit_target: row.hit_target,
      invalid_extraction: !audit.isValid,
    });

    return {
      id: row.id,
      creator: row.creator_name,
      symbol: row.symbol,
      before: {
        direction: row.direction,
        target_price: row.target_price,
        extraction_confidence: row.extraction_confidence,
        score_status: beforeStatus,
      },
      after: {
        direction: audit.direction,
        target_price: audit.targetPrice,
        extraction_confidence: audit.normalizedConfidence,
        score_status: afterStatus,
        excerpt: audit.excerpt,
      },
      reasons: audit.reasons,
    };
  });
}

export async function applyAuditResults(results: readonly AuditResult[]): Promise<void> {
  const batchSize = 250;
  for (let index = 0; index < results.length; index += batchSize) {
    const batch = results.slice(index, index + batchSize);
    await query(
      `UPDATE calls SET
        direction = bulk.direction::text,
        target_price = bulk.target_price::float8,
        raw_quote = bulk.raw_quote::text,
        extraction_confidence = bulk.extraction_confidence::float8,
        confidence = bulk.confidence::text,
        score = 0
       FROM unnest(
         $1::int[],
         $2::text[],
         $3::float8[],
         $4::text[],
         $5::float8[],
         $6::text[]
       ) AS bulk(id, direction, target_price, raw_quote, extraction_confidence, confidence)
       WHERE calls.id = bulk.id`,
      [
        batch.map((result) => result.id),
        batch.map((result) => result.after.direction),
        batch.map((result) => result.after.target_price),
        batch.map((result) => result.after.excerpt),
        batch.map((result) => result.after.extraction_confidence),
        batch.map((result) => toConfidenceLabel(result.after.extraction_confidence)),
      ],
    );
  }
}

export function filterWritableResults(
  results: readonly AuditResult[],
  args: Pick<AuditRecomputeArgs, "validOnly">,
): AuditResult[] {
  if (!args.validOnly) return [...results];
  return results.filter((result) => result.reasons.length === 0);
}

export function summarizeAuditResults(results: readonly AuditResult[]): {
  readonly total: number;
  readonly valid: number;
  readonly invalid: number;
  readonly wouldBecomeScored: number;
  readonly byAfterConfidence: Record<string, number>;
} {
  const byAfterConfidence: Record<string, number> = {};
  let valid = 0;
  let wouldBecomeScored = 0;
  for (const result of results) {
    if (result.reasons.length === 0) valid += 1;
    if (result.after.score_status === "scored") wouldBecomeScored += 1;
    const key = result.after.extraction_confidence.toFixed(2);
    byAfterConfidence[key] = (byAfterConfidence[key] ?? 0) + 1;
  }
  return {
    total: results.length,
    valid,
    invalid: results.length - valid,
    wouldBecomeScored,
    byAfterConfidence,
  };
}

export function shouldProcessInBatches(args: AuditRecomputeArgs): boolean {
  return args.scoreReadyLowConfidence && args.limit === null;
}

function printHuman(results: readonly AuditResult[]): void {
  for (const result of results) {
    console.log(
      `#${result.id} ${result.creator} ${result.symbol} ` +
      `${result.before.direction}/${result.before.extraction_confidence.toFixed(2)} -> ` +
      `${result.after.direction}/${result.after.extraction_confidence.toFixed(2)} ` +
      `[${result.after.score_status}]`,
    );
    if (result.before.target_price !== result.after.target_price) {
      console.log(
        `  target: ${result.before.target_price ?? "--"} -> ${result.after.target_price ?? "--"}`,
      );
    }
    if (result.reasons.length > 0) {
      console.log(`  notes: ${result.reasons.join("; ")}`);
    }
  }
}

async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.write && args.scoreReadyLowConfidence && !args.validOnly) {
    throw new Error("--score-ready-low-confidence --write requires --valid-only");
  }

  const results: AuditResult[] = [];
  const writableResults: AuditResult[] = [];
  if (shouldProcessInBatches(args)) {
    let startAfterId = args.startAfterId;
    while (true) {
      const batchArgs: AuditRecomputeArgs = {
        ...args,
        limit: LOW_CONFIDENCE_READY_BATCH_SIZE,
        startAfterId,
      };
      const rows = await loadAuditRows(batchArgs);
      if (rows.length === 0) break;
      const batchResults = analyzeAuditRows(rows);
      const batchWritableResults = filterWritableResults(batchResults, args);
      results.push(...batchResults);
      writableResults.push(...batchWritableResults);
      if (args.write && batchWritableResults.length > 0) {
        await applyAuditResults(batchWritableResults);
      }
      startAfterId = rows.at(-1)?.id ?? startAfterId;
      if (rows.length < LOW_CONFIDENCE_READY_BATCH_SIZE) break;
    }
  } else {
    const rows = await loadAuditRows(args);
    results.push(...analyzeAuditRows(rows));
    writableResults.push(...filterWritableResults(results, args));
    if (args.write && writableResults.length > 0) {
      await applyAuditResults(writableResults);
    }
  }

  if (args.write && writableResults.length > 0) {
    await recomputeAllStats();
  }

  if (args.summary) {
    console.log(JSON.stringify({
      ...summarizeAuditResults(results),
      write: args.write,
      writable: writableResults.length,
      start_after_id: args.startAfterId,
      limit: args.limit,
    }, null, 2));
    return;
  }

  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  printHuman(results);
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
