import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const script = join(repoRoot, "scripts/apply-callscore-hermes-patch.py");
const manifest = join(repoRoot, "ops/hermes-runtime-patches/bitwarden-zero-ttl-cache/manifest.json");
const ownedPatch = join(repoRoot, "ops/hermes-runtime-patches/bitwarden-zero-ttl-cache/bitwarden-zero-ttl-cache.patch");
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

function run(args: string[]) {
  return spawnSync("python3", [script, ...args], { cwd: repoRoot, encoding: "utf8" });
}

function initGitRuntime(root: string, content = "value = 'before'\n") {
  const target = join(root, "runtime");
  mkdirSync(join(target, "agent"), { recursive: true });
  writeFileSync(join(target, "agent/example.py"), content);
  for (const args of [
    ["init", "-q", target],
    ["-C", target, "config", "user.name", "CallScore Test"],
    ["-C", target, "config", "user.email", "callscore-test@example.invalid"],
    ["-C", target, "add", "agent/example.py"],
    ["-C", target, "commit", "-q", "-m", "fixture"],
    ["-C", target, "gc", "--prune=now"],
  ]) {
    const result = spawnSync("git", args, { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  const commit = spawnSync("git", ["-C", target, "rev-parse", "HEAD"], { encoding: "utf8" });
  const tree = spawnSync("git", ["-C", target, "rev-parse", "HEAD^{tree}"], { encoding: "utf8" });
  assert.equal(commit.status, 0, commit.stderr || commit.stdout);
  assert.equal(tree.status, 0, tree.stderr || tree.stdout);
  return { target, commit: commit.stdout.trim(), tree: tree.stdout.trim() };
}

test("CallScore owns a pinned Hermes zero-TTL cache patch", () => {
  const result = run(["--manifest", manifest, "--verify-manifest"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.owner, "OmarA1-Bakri/CallScore");
  assert.equal(parsed.upstream_commit, "b91aade17683a551e6c8e633fe5407d07354b16e");
  assert.match(parsed.patch_sha256, /^[0-9a-f]{64}$/);

  assert.deepEqual(parsed.target_paths, [
    "agent/secret_sources/bitwarden.py",
    "tests/test_bitwarden_secrets.py",
  ]);
});

test("owned Hermes patch is syntactically valid for git apply", () => {
  const result = spawnSync("git", ["apply", "--numstat", ownedPatch], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /^12\s+4\s+agent\/secret_sources\/bitwarden\.py$/m);
  assert.match(result.stdout, /^29\s+0\s+tests\/test_bitwarden_secrets\.py$/m);
});

test("CallScore scopes patch-format blank-line whitespace handling to owned patch artifacts", () => {
  const result = spawnSync("git", ["check-attr", "whitespace", "--", ownedPatch], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /whitespace: -blank-at-eol$/m);
});

test("CallScore patch installer verifies and applies a bounded patch", () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-hermes-patch-"));
  const { target, commit, tree } = initGitRuntime(root);
  const bundle = join(root, "bundle");
  mkdirSync(bundle, { recursive: true });
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
      upstream_commit: commit,
      upstream_tree: tree,
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
  const { target, commit, tree } = initGitRuntime(root);
  const bundle = join(root, "bundle");
  mkdirSync(bundle, { recursive: true });
  writeFileSync(join(target, "one"), "after\n");
  writeFileSync(join(target, "two"), "before\n");
  writeFileSync(join(bundle, "change.patch"), "placeholder\n");
  writeFileSync(join(bundle, "manifest.json"), JSON.stringify({
    schema: "callscore.hermes_runtime_patch.v1",
    owner: "OmarA1-Bakri/CallScore",
    upstream_repository: "NousResearch/hermes-agent",
    upstream_commit: commit,
    upstream_tree: tree,
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

test("manifest rejects malformed or bypassable Git anchors", () => {
  const source = JSON.parse(readFileSync(manifest, "utf8"));
  const root = mkdtempSync(join(tmpdir(), "callscore-hermes-bad-anchor-"));
  const patchPath = join(root, source.patch_file);
  writeFileSync(patchPath, readFileSync(ownedPatch));
  for (const [field, value] of [
    ["upstream_commit", "test-commit"],
    ["upstream_tree", "not-a-tree"],
  ] as const) {
    const bad = { ...source, [field]: value };
    const path = join(root, `${field}.json`);
    writeFileSync(path, JSON.stringify(bad));
    const result = run(["--manifest", path, "--verify-manifest"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /40-character hexadecimal Git object ID/);
  }
});

test("patch installer fails closed on commit and tree anchor mismatches", () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-hermes-anchor-mismatch-"));
  const { target, commit, tree } = initGitRuntime(root);
  const bundle = join(root, "bundle");
  mkdirSync(bundle);
  writeFileSync(join(bundle, "change.patch"), "placeholder\n");
  const base = {
    schema: "callscore.hermes_runtime_patch.v1",
    owner: "OmarA1-Bakri/CallScore",
    upstream_repository: "NousResearch/hermes-agent",
    upstream_commit: commit,
    upstream_tree: tree,
    patch_file: "change.patch",
    patch_sha256: sha("placeholder\n"),
    target_files: [{ path: "agent/example.py", before_sha256: sha("value = 'before'\n"), after_sha256: sha("value = 'after'\n") }],
  };
  for (const [field, value, expected] of [
    ["upstream_commit", "0".repeat(40), /runtime Git anchor mismatch/],
    ["upstream_tree", "f".repeat(40), /runtime Git anchor mismatch/],
  ] as const) {
    const path = join(bundle, `${field}.json`);
    writeFileSync(path, JSON.stringify({ ...base, [field]: value }));
    const result = run(["--manifest", path, "--runtime-repo", target, "--check"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expected);
  }
});

test("patch installer refuses target symlinks that escape the runtime", () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-hermes-target-symlink-"));
  const { target, commit, tree } = initGitRuntime(root);
  const bundle = join(root, "bundle");
  const protectedPath = join(root, "protected.py");
  mkdirSync(bundle);
  writeFileSync(protectedPath, "value = 'before'\n");
  symlinkSync(protectedPath, join(target, "agent/link.py"));
  const patchText =
    "diff --git a/agent/link.py b/agent/link.py\n" +
    "--- a/agent/link.py\n" +
    "+++ b/agent/link.py\n" +
    "@@ -1 +1 @@\n" +
    "-value = 'before'\n" +
    "+value = 'after'\n";
  writeFileSync(join(bundle, "change.patch"), patchText);
  writeFileSync(join(bundle, "manifest.json"), JSON.stringify({
    schema: "callscore.hermes_runtime_patch.v1",
    owner: "OmarA1-Bakri/CallScore",
    upstream_repository: "NousResearch/hermes-agent",
    upstream_commit: commit,
    upstream_tree: tree,
    patch_file: "change.patch",
    patch_sha256: sha(patchText),
    target_files: [{
      path: "agent/link.py",
      before_sha256: sha("value = 'before'\n"),
      after_sha256: sha("value = 'after'\n"),
    }],
  }));
  const result = run(["--manifest", join(bundle, "manifest.json"), "--runtime-repo", target, "--apply"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unsafe target path/);
  assert.equal(readFileSync(protectedPath, "utf8"), "value = 'before'\n");
});

test("CallScore runtime applicator does not spawn commands or own gateway control-plane files", () => {
  const source = readFileSync(script, "utf8");
  assert.doesNotMatch(source, /^import subprocess$/m);
  assert.doesNotMatch(source, /\bsubprocess\./);
  assert.doesNotMatch(source, /os\.posix_spawn\(/);
  assert.doesNotMatch(source, /\/usr\/bin\/git/);
  assert.doesNotMatch(source, /\bctypes\b/);
  assert.equal(existsSync(join(repoRoot, "ops/systemd/hermes-callscore-gateway.service")), false);
  assert.equal(existsSync(join(repoRoot, "scripts/install-callscore-hermes-gateway-unit.py")), false);
});

test("package scripts expose only CallScore-owned Hermes runtime patch gates", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  assert.match(pkg.scripts["hermes:runtime:verify"], /apply-callscore-hermes-patch\.py[\s\S]*--check/);
  assert.match(pkg.scripts["hermes:runtime:apply"], /apply-callscore-hermes-patch\.py[\s\S]*--apply/);
  assert.equal(pkg.scripts["hermes:gateway:unit:check"], undefined);
  assert.equal(pkg.scripts["hermes:gateway:unit:install"], undefined);
});
