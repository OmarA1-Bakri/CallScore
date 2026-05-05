import * as fs from "fs";
import * as path from "path";
import { query } from "../lib/db";
import { analyzeAuditRows, applyAuditResults } from "./audit-recompute";
import { recomputeAllStats } from "../lib/recompute-stats";
import { recomputeDerivedFields } from "./rescore-derived";

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

async function clearPrematureHorizons(): Promise<void> {
  await query(
    `UPDATE calls SET
      price_7d = NULL,
      btc_price_7d = NULL,
      return_7d = NULL,
      alpha_7d = NULL
     WHERE call_date > NOW() - INTERVAL '7 days'`,
  );

  await query(
    `UPDATE calls SET
      price_30d = NULL,
      btc_price_30d = NULL,
      return_30d = NULL,
      alpha_30d = NULL,
      correct_direction = NULL,
      score = 0
     WHERE call_date > NOW() - INTERVAL '30 days'`,
  );

  await query(
    `UPDATE calls SET
      price_90d = NULL,
      btc_price_90d = NULL,
      return_90d = NULL,
      alpha_90d = NULL,
      hit_target = NULL,
      score = 0
     WHERE call_date > NOW() - INTERVAL '90 days'`,
  );
}

async function loadLegacyRowsBatch(
  lastId: number,
  limit: number,
): Promise<AuditRow[]> {
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
      WHERE c.extraction_confidence = 0.6
       AND c.id > $1
     ORDER BY c.id ASC
     LIMIT $2`,
    [lastId, limit],
  );
}

async function main(): Promise<void> {
  loadEnv();

  console.log("Clearing premature horizon fields...");
  await clearPrematureHorizons();

  console.log("Re-auditing legacy low-confidence calls from source transcripts...");
  let processed = 0;
  let lastId = 0;
  const batchSize = 200;
  while (true) {
    const legacyRows = await loadLegacyRowsBatch(lastId, batchSize);
    if (legacyRows.length === 0) break;
    const auditResults = analyzeAuditRows(legacyRows);
    await applyAuditResults(auditResults);
    processed += auditResults.length;
    lastId = legacyRows[legacyRows.length - 1].id;
    console.log(`  processed ${processed} legacy calls (last id ${lastId})`);
  }

  console.log("Recomputing derived outcome fields...");
  await recomputeDerivedFields();

  console.log("Recomputing scores and creator stats...");
  await recomputeAllStats();

  console.log(
    `Public integrity backfill complete. ${processed} legacy calls re-audited.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
