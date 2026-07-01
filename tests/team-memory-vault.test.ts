import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { initializeTeamMemoryVault, resolveTeamMemoryPaths } from "../src/lib/team-memory/team-memory-vault";

test("initializeTeamMemoryVault creates shared SQLite vault and artifact tree", () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-team-memory-"));
  try {
    const paths = resolveTeamMemoryPaths({ root });
    assert.equal(paths.sqlitePath, join(root, "team-memory.sqlite"));
    assert.equal(paths.artifactRoot, join(root, "artifacts"));

    const result = initializeTeamMemoryVault({ root });
    assert.equal(result.sqlitePath, paths.sqlitePath);
    assert.equal(result.artifactRoot, paths.artifactRoot);
    assert.equal(existsSync(paths.sqlitePath), true);
    assert.equal(existsSync(paths.artifactRoot), true);

    const tables = execFileSync("sqlite3", [paths.sqlitePath, ".tables"], { encoding: "utf8" });
    assert.match(tables, /team_memory_assets/);
    assert.match(tables, /team_memory_receipts/);
    assert.match(tables, /team_memory_learning_events/);
    assert.match(tables, /team_memory_agent_messages/);
    assert.match(tables, /team_memory_agent_message_acks/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
