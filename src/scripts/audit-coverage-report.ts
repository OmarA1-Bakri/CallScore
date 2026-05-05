import { fileURLToPath } from "url";
import * as path from "path";
import { query } from "../lib/db";
import {
  summarizeAuditCoverage,
  type AuditCoverageRow,
} from "../lib/audit-coverage";
import { loadEnv } from "./script-helpers";

function parseJsonFlag(): boolean {
  return process.argv.includes("--json");
}

async function loadRows(): Promise<AuditCoverageRow[]> {
  return query<AuditCoverageRow>(
    `SELECT
      id,
      symbol,
      raw_quote,
      extraction_confidence,
      call_date::text AS call_date,
      price_at_call,
      target_price,
      price_30d,
      price_90d,
      return_30d,
      hit_target
     FROM calls
     ORDER BY id ASC`,
  );
}

function printHuman(summary: ReturnType<typeof summarizeAuditCoverage>): void {
  console.log(`Total calls: ${summary.totalCalls}`);
  console.log("Score status:");
  for (const [status, count] of Object.entries(summary.scoreStatus)) {
    console.log(`  ${status}: ${count}`);
  }
  console.log("Confidence:");
  console.log(`  below scoring threshold: ${summary.confidence.belowThreshold}`);
  console.log(`  public-quality floor (>=0.8): ${summary.confidence.publicQuality}`);
  console.log("Ambiguous ticker risk:");
  console.log(`  total: ${summary.ambiguousTickerRisk.total}`);
  for (const [symbol, count] of Object.entries(summary.ambiguousTickerRisk.bySymbol)) {
    console.log(`  ${symbol}: ${count}`);
  }
  if (summary.ambiguousTickerRisk.sampleIds.length > 0) {
    console.log(`  sample call ids: ${summary.ambiguousTickerRisk.sampleIds.join(", ")}`);
  }
}

async function main(): Promise<void> {
  loadEnv();
  const rows = await loadRows();
  const summary = summarizeAuditCoverage(rows);
  if (parseJsonFlag()) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  printHuman(summary);
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
