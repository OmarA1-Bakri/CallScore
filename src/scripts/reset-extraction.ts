/**
 * One-time script to reset extraction flags and clear old extracted calls.
 * Safe by default: prints the affected row counts unless both destructive flags are present.
 */
import { fileURLToPath } from "url";
import * as path from "path";
import { query } from "../lib/db";
import { loadEnv } from "./script-helpers";

export interface ResetExtractionArgs {
  readonly write: boolean;
  readonly confirmed: boolean;
}

export function parseResetExtractionArgs(argv: readonly string[]): ResetExtractionArgs {
  return {
    write: argv.includes("--write"),
    confirmed: argv.includes("--confirm-reset-extraction"),
  };
}

async function printCounts(): Promise<void> {
  const videos = await query<{ count: string }>("SELECT COUNT(*) as count FROM videos");
  const extractedVideos = await query<{ count: string }>(
    "SELECT COUNT(*) as count FROM videos WHERE calls_extracted = true",
  );
  const calls = await query<{ count: string }>("SELECT COUNT(*) as count FROM calls");
  console.log(`Videos in DB: ${videos[0].count}`);
  console.log(`Videos marked extracted: ${extractedVideos[0].count}`);
  console.log(`Calls in DB: ${calls[0].count}`);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseResetExtractionArgs(argv);

  if (!args.write || !args.confirmed) {
    console.log("DRY RUN: no rows were changed.");
    await printCounts();
    console.log(
      "To reset extraction state, rerun with: --write --confirm-reset-extraction",
    );
    return;
  }

  console.log("Deleting all calls...");
  await query("DELETE FROM calls");
  console.log("Resetting extraction flags on all videos...");
  await query("UPDATE videos SET calls_extracted = false, extraction_pass = 0");
  await printCounts();
  console.log("Ready for re-extraction.");
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
