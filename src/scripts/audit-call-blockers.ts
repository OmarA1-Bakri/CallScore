import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getPipelineBlockerSnapshot,
  normalizePipelineBlockerLimit,
} from "../lib/pipeline-blockers";
import { loadEnv, timestamp } from "./script-helpers";

export interface AuditCallBlockersArgs {
  readonly limit: number;
  readonly json: boolean;
  readonly auditOut: string | null;
}

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || !argv[index + 1]) return null;
  return argv[index + 1];
}

export function parseAuditCallBlockersArgs(
  argv = process.argv.slice(2),
): AuditCallBlockersArgs {
  return {
    limit: normalizePipelineBlockerLimit(
      Number(argValue(argv, "--limit") ?? undefined),
    ),
    json: argv.includes("--json") || argv.includes("--summary"),
    auditOut: argValue(argv, "--audit-out"),
  };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseAuditCallBlockersArgs(argv);
  const snapshot = await getPipelineBlockerSnapshot({ limit: args.limit });
  if (args.auditOut) {
    mkdirSync(path.dirname(args.auditOut), { recursive: true });
    writeFileSync(args.auditOut, `${JSON.stringify(snapshot, null, 2)}\n`);
  }
  if (args.json) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }
  console.log(`[${timestamp()}] call blockers by reason`);
  for (const row of snapshot.calls_blocked_by_reason) {
    console.log(`${row.blocker}: ${row.calls} calls (${row.pipeline_stage})`);
  }
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  main().catch((error) => {
    console.error(`[${timestamp()}] Fatal error:`, error);
    process.exit(1);
  });
}
