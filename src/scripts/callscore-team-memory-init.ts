#!/usr/bin/env node
import { initializeTeamMemoryVault } from "../lib/team-memory/team-memory-vault";

const rootArg = process.argv.find((arg) => arg.startsWith("--root="));
const root = rootArg ? rootArg.slice("--root=".length) : process.env.CALLSCORE_TEAM_MEMORY_ROOT;

const result = initializeTeamMemoryVault({ root });
console.log(JSON.stringify({
  ok: true,
  schema: "callscore.team_memory_init_receipt.v1",
  sqlite_path: result.sqlitePath,
  artifact_root: result.artifactRoot,
  schema_applied: result.schemaApplied,
}, null, 2));
