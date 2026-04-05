import * as fs from "fs";
import * as path from "path";
import { getDb } from "../lib/db";

function loadEnv(): void {
  if (process.env.NEON_DATABASE_URL) return;
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

async function main(): Promise<void> {
  loadEnv();

  const schemaPath = path.resolve(__dirname, "../../schema.sql");
  if (!fs.existsSync(schemaPath)) {
    console.error(`[${timestamp()}] ERROR: schema.sql not found at ${schemaPath}`);
    process.exit(1);
  }

  const schemaSql = fs.readFileSync(schemaPath, "utf-8");

  // Split on semicolons to get individual statements, filtering empties
  const statements = schemaSql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  const db = getDb();

  console.log(`[${timestamp()}] Starting migration with ${statements.length} statements...`);

  let success = 0;
  let failed = 0;

  for (const statement of statements) {
    const preview = statement.replace(/\s+/g, " ").slice(0, 80);
    try {
      await db(`${statement};`);
      success++;
      console.log(`[${timestamp()}] OK: ${preview}...`);
    } catch (error: unknown) {
      failed++;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[${timestamp()}] FAIL: ${preview}...`);
      console.error(`  -> ${msg}`);
    }
  }

  console.log(`[${timestamp()}] Migration complete: ${success} succeeded, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] Fatal error:`, err);
  process.exit(1);
});
