import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const script = join(repoRoot, "scripts/apply-callscore-hermes-patch.py");
const manifest = join(repoRoot, "ops/hermes-runtime-patches/bitwarden-zero-ttl-cache/manifest.json");
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

function run(args: string[]) {
  return spawnSync("python3", [script, ...args], { cwd: repoRoot, encoding: "utf8" });
}

test("CallScore owns a pinned Hermes zero-TTL cache patch", () => {
  const result = run(["--manifest", manifest, "--verify-manifest"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.owner, "OmarA1-Bakri/CallScore");
  assert.equal(parsed.upstream_commit, "1d3d021282098261ce2ad224a76d97d89b16188c");
  assert.equal(parsed.patch_sha256, "6a140ef6664fdfe30b643760e358bffca8c7cba0de4d616430a5b2decaf978d6");
  assert.deepEqual(parsed.target_paths, [
    "agent/secret_sources/bitwarden.py",
    "tests/test_bitwarden_secrets.py",
  ]);
});

test("CallScore patch installer verifies and applies a bounded patch", () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-hermes-patch-"));
  const target = join(root, "runtime");
  const bundle = join(root, "bundle");
  mkdirSync(join(target, "agent"), { recursive: true });
  mkdirSync(bundle, { recursive: true });
  writeFileSync(join(target, "agent/example.py"), "value = 'before'\n");
  writeFileSync(
    join(bundle, "change.patch"),
    "diff --git a/agent/example.py b/agent/example.py\n" +
      "--- a/agent/example.py\n" +
      "+++ b/agent/example.py\n" +
      "@@ -1 +1 @@\n" +
      "-value = 'before'\n" +
      "+value = 'after'\n",
  );
  const patchBytes = readFileSync(join(bundle, "change.patch"));
  writeFileSync(
    join(bundle, "manifest.json"),
    JSON.stringify({
      schema: "callscore.hermes_runtime_patch.v1",
      owner: "OmarA1-Bakri/CallScore",
      upstream_repository: "NousResearch/hermes-agent",
      upstream_commit: "test-commit",
      upstream_tree: "test-tree",
      patch_file: "change.patch",
      patch_sha256: sha(patchBytes),
      target_files: [{
        path: "agent/example.py",
        before_sha256: sha("value = 'before'\n"),
        after_sha256: sha("value = 'after'\n"),
      }],
    }),
  );

  let result = run(["--manifest", join(bundle, "manifest.json"), "--runtime-repo", target, "--check"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).state, "ready_to_apply");

  result = run(["--manifest", join(bundle, "manifest.json"), "--runtime-repo", target, "--apply"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(readFileSync(join(target, "agent/example.py"), "utf8"), "value = 'after'\n");
  assert.equal(JSON.parse(result.stdout).state, "applied");

  result = run(["--manifest", join(bundle, "manifest.json"), "--runtime-repo", target, "--check"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).state, "already_applied");
});

test("CallScore patch installer fails closed on mixed target state", () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-hermes-patch-mixed-"));
  const target = join(root, "runtime");
  const bundle = join(root, "bundle");
  mkdirSync(target, { recursive: true });
  mkdirSync(bundle, { recursive: true });
  writeFileSync(join(target, "one"), "after\n");
  writeFileSync(join(target, "two"), "before\n");
  writeFileSync(join(bundle, "change.patch"), "placeholder\n");
  writeFileSync(join(bundle, "manifest.json"), JSON.stringify({
    schema: "callscore.hermes_runtime_patch.v1",
    owner: "OmarA1-Bakri/CallScore",
    upstream_repository: "NousResearch/hermes-agent",
    upstream_commit: "test-commit",
    upstream_tree: "test-tree",
    patch_file: "change.patch",
    patch_sha256: sha("placeholder\n"),
    target_files: [
      { path: "one", before_sha256: sha("before\n"), after_sha256: sha("after\n") },
      { path: "two", before_sha256: sha("before\n"), after_sha256: sha("after\n") },
    ],
  }));

  const result = run(["--manifest", join(bundle, "manifest.json"), "--runtime-repo", target, "--check"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /mixed_or_unknown/);
});
