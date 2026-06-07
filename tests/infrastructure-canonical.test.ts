import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();

test("canonical repo infra keeps Netlify config and no root Vercel config", () => {
  assert.equal(existsSync(join(repoRoot, "netlify.toml")), true);
  assert.equal(existsSync(join(repoRoot, "vercel.json")), false);
});

test("legacy infra supersession note documents provider boundaries", () => {
  const note = readFileSync(
    join(repoRoot, "docs/legacy-infra-superseded.md"),
    "utf8",
  );

  assert.match(note, /Netlify/);
  assert.match(note, /call-score\.com/);
  assert.match(note, /HH VM PostgreSQL\/pgsql/);
  assert.match(note, /Vercel is deprecated\/non-canonical/);
  assert.match(note, /Neon is backup\/legacy compatibility only/);
  assert.match(note, /does not mutate .*provider dashboard/i);
});
