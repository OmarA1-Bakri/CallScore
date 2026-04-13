import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { auditExtraction } from "../lib/extraction-validation";
import { query } from "../lib/db";
import { recomputeAllStats } from "../lib/recompute-stats";
import { getCallScoreStatus } from "../lib/public-methodology";

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

function parseArgs(argv: readonly string[]): {
  readonly callId: number | null;
  readonly creatorHandle: string | null;
  readonly allLegacy: boolean;
  readonly write: boolean;
  readonly json: boolean;
} {
  let callId: number | null = null;
  let creatorHandle: string | null = null;
  let allLegacy = false;
  let write = false;
  let json = false;

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
    } else if (arg === "--write") {
      write = true;
    } else if (arg === "--json") {
      json = true;
    }
  }

  return { callId, creatorHandle, allLegacy, write, json };
}

function toConfidenceLabel(value: number): "high" | "medium" | "low" {
  if (value >= 0.9) return "high";
  if (value >= 0.7) return "medium";
  return "low";
}

function buildWhereClause(args: ReturnType<typeof parseArgs>): {
  readonly sql: string;
  readonly params: readonly unknown[];
} {
  if (args.callId !== null) {
    return { sql: "c.id = $1", params: [args.callId] };
  }
  if (args.creatorHandle !== null) {
    return { sql: "cr.youtube_handle = $1", params: [args.creatorHandle] };
  }
  if (args.allLegacy) {
    return { sql: "c.extraction_confidence = 0.6", params: [] };
  }
  throw new Error("Specify --call <id>, --creator <handle>, or --all-legacy");
}

async function loadAuditRows(args: ReturnType<typeof parseArgs>): Promise<AuditRow[]> {
  const where = buildWhereClause(args);
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
     ORDER BY c.id ASC`,
    [...where.params],
  );
}

export function analyzeAuditRows(rows: readonly AuditRow[]): AuditResult[] {
  return rows.map((row) => {
    const beforeStatus = getCallScoreStatus({
      extraction_confidence: row.extraction_confidence,
      call_date: row.call_date,
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
  const rows = await loadAuditRows(args);
  const results = analyzeAuditRows(rows);

  if (args.write && results.length > 0) {
    await applyAuditResults(results);
    await recomputeAllStats();
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
