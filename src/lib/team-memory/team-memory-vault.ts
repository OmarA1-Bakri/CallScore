import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { TEAM_MEMORY_ARTIFACT_ROOT, TEAM_MEMORY_SCHEMA_SQL, TEAM_MEMORY_SQLITE_PATH } from "./team-memory-contract";

export interface ResolveTeamMemoryPathsInput {
  readonly root?: string;
}

export interface TeamMemoryPaths {
  readonly root: string;
  readonly sqlitePath: string;
  readonly artifactRoot: string;
}

export interface InitializeTeamMemoryVaultInput extends ResolveTeamMemoryPathsInput {
  readonly sqliteBin?: string;
}

export interface InitializeTeamMemoryVaultResult extends TeamMemoryPaths {
  readonly schemaApplied: true;
}

const DEFAULT_TEAM_MEMORY_ROOT = "/srv/agents/hermes/runtime/callscore-team-memory";

export function resolveTeamMemoryPaths(input: ResolveTeamMemoryPathsInput = {}): TeamMemoryPaths {
  if (input.root) {
    return {
      root: input.root,
      sqlitePath: join(input.root, "team-memory.sqlite"),
      artifactRoot: join(input.root, "artifacts"),
    };
  }

  return {
    root: DEFAULT_TEAM_MEMORY_ROOT,
    sqlitePath: TEAM_MEMORY_SQLITE_PATH,
    artifactRoot: TEAM_MEMORY_ARTIFACT_ROOT,
  };
}

export function initializeTeamMemoryVault(
  input: InitializeTeamMemoryVaultInput = {},
): InitializeTeamMemoryVaultResult {
  const paths = resolveTeamMemoryPaths(input);
  const sqliteBin = input.sqliteBin ?? "sqlite3";
  const schemaPath = join(paths.root, ".team-memory-schema.sql");

  mkdirSync(dirname(paths.sqlitePath), { recursive: true });
  mkdirSync(paths.artifactRoot, { recursive: true });
  writeFileSync(schemaPath, TEAM_MEMORY_SCHEMA_SQL, "utf8");

  const applied = spawnSync(sqliteBin, [paths.sqlitePath], {
    input: TEAM_MEMORY_SCHEMA_SQL,
    encoding: "utf8",
  });

  unlinkSync(schemaPath);

  if (applied.status !== 0) {
    throw new Error(
      `Failed to initialize team memory SQLite vault: ${applied.stderr || applied.stdout || `exit ${applied.status}`}`,
    );
  }

  return {
    ...paths,
    schemaApplied: true,
  };
}
