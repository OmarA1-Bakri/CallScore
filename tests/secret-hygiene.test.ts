import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkSecretHygiene } from "../src/scripts/check-secret-hygiene";

test("secret hygiene blocks local token artifacts without exposing values", () => {
  const root = join(tmpdir(), `secret-hygiene-${Date.now()}`);
  mkdirSync(join(root, ".tmp"), { recursive: true });
  writeFileSync(join(root, ".gitignore"), ".env\n.env.local\n.tmp/\n");
  writeFileSync(join(root, ".tmp/.apify-token.local"), "do-not-print");

  const result = checkSecretHygiene(root);

  assert.equal(result.ok, false);
  assert.deepEqual(result.forbiddenFiles, [".tmp/.apify-token.local"]);
  assert.deepEqual(result.missingGitignorePatterns, []);
});

test("secret hygiene passes when required ignore patterns exist and local token files are absent", () => {
  const root = join(tmpdir(), `secret-hygiene-${Date.now()}-clean`);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, ".gitignore"), ".env\n.env.local\n.tmp/\n");

  const result = checkSecretHygiene(root);

  assert.equal(result.ok, true);
  assert.deepEqual(result.forbiddenFiles, []);
  assert.deepEqual(result.missingGitignorePatterns, []);
});
