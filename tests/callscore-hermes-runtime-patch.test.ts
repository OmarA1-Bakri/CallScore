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
const gatewayUnit = join(repoRoot, "ops/systemd/hermes-callscore-gateway.service");
const unitInstaller = join(repoRoot, "scripts/install-callscore-hermes-gateway-unit.py");
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
  assert.equal(parsed.patch_sha256, "e44e3216e8b139c1122630170ec5036485dfd844978fd8569c4267cfc8032ed8");
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
  assert.match(result.stdout, /^4\s+0\s+agent\/secret_sources\/bitwarden\.py$/m);
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

test("canonical CallScore gateway applies the owned Hermes patch before startup", () => {
  assert.equal(existsSync(gatewayUnit), true, "repo-owned CallScore gateway unit must exist");
  const unit = readFileSync(gatewayUnit, "utf8");
  assert.match(unit, /^WorkingDirectory=\/opt\/crypto-tuber-ranked$/m);
  assert.match(
    unit,
    /^ExecStartPre=\/usr\/bin\/python3 \/opt\/crypto-tuber-ranked\/scripts\/apply-callscore-hermes-patch\.py --manifest \/opt\/crypto-tuber-ranked\/ops\/hermes-runtime-patches\/bitwarden-zero-ttl-cache\/manifest\.json --runtime-repo \/srv\/agents\/hermes\/hermes-agent --apply$/m,
  );
  assert.match(unit, /^Environment="HERMES_HOME=\/srv\/agents\/hermes\/profiles\/callscore"$/m);
  assert.match(unit, /^ExecStart=\/home\/omar\/\.local\/bin\/callscore gateway run --accept-hooks$/m);
  assert.ok(unit.indexOf("ExecStartPre=") < unit.indexOf("ExecStart="));
});

test("gateway unit installer verifies drift and never restarts the live gateway", () => {
  assert.equal(existsSync(unitInstaller), true, "guarded gateway unit installer must exist");
  const root = mkdtempSync(join(tmpdir(), "callscore-gateway-unit-"));
  const destination = join(root, "hermes-callscore-gateway.service");

  let result = spawnSync("python3", [unitInstaller, "--source", gatewayUnit, "--destination", destination, "--check"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).state, "missing");

  result = spawnSync("python3", [unitInstaller, "--source", gatewayUnit, "--destination", destination, "--install", "--no-daemon-reload"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).state, "installed");
  assert.equal(readFileSync(destination, "utf8"), readFileSync(gatewayUnit, "utf8"));

  result = spawnSync("python3", [unitInstaller, "--source", gatewayUnit, "--destination", destination, "--check"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).state, "current");

  const installer = readFileSync(unitInstaller, "utf8");
  assert.doesNotMatch(installer, /\bsystemctl\b[^\n]*(?:restart|start|stop|enable|disable)\b/);
});

test("gateway unit installer keeps the canonical user-systemd destination under profile HOME", () => {
  const fakeHome = mkdtempSync(join(tmpdir(), "callscore-profile-home-"));
  const passwdHome = spawnSync(
    "python3",
    ["-c", "import os,pwd; print(pwd.getpwuid(os.getuid()).pw_dir)"],
    { encoding: "utf8", env: { ...process.env, HOME: fakeHome } },
  );
  assert.equal(passwdHome.status, 0, passwdHome.stderr || passwdHome.stdout);
  const result = spawnSync("python3", [unitInstaller, "--source", gatewayUnit, "--check"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, HOME: fakeHome },
  });
  assert.notEqual(result.status, null);
  const payload = JSON.parse(result.status === 0 ? result.stdout : result.stderr);
  assert.equal(
    payload.destination,
    join(passwdHome.stdout.trim(), ".config/systemd/user/hermes-callscore-gateway.service"),
  );
  assert.equal(payload.destination.startsWith(fakeHome), false);
});

test("Python runtime installers invoke only fixed absolute executables without subprocess or a shell", () => {
  for (const path of [script, unitInstaller]) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /^import subprocess$/m);
    assert.doesNotMatch(source, /\bsubprocess\./);
    assert.doesNotMatch(source, /shell\s*=\s*True/);
    assert.match(source, /os\.posix_spawn\(/);
  }
  assert.match(readFileSync(script, "utf8"), /GIT_EXECUTABLE = "\/usr\/bin\/git"/);
  assert.match(readFileSync(unitInstaller, "utf8"), /SYSTEMCTL_EXECUTABLE = "\/usr\/bin\/systemctl"/);
});

test("gateway unit installer refuses a symlink destination", () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-gateway-symlink-"));
  const protectedFile = join(root, "protected");
  const destination = join(root, "hermes-callscore-gateway.service");
  writeFileSync(protectedFile, "do-not-overwrite\n");
  symlinkSync(protectedFile, destination);

  const result = spawnSync(
    "python3",
    [unitInstaller, "--source", gatewayUnit, "--destination", destination, "--install", "--no-daemon-reload"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unsafe destination|refusing unsafe destination/);
  assert.equal(readFileSync(protectedFile, "utf8"), "do-not-overwrite\n");
});

test("package scripts expose explicit Hermes runtime and gateway unit gates", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  assert.match(pkg.scripts["hermes:runtime:verify"], /apply-callscore-hermes-patch\.py[\s\S]*--check/);
  assert.match(pkg.scripts["hermes:runtime:apply"], /apply-callscore-hermes-patch\.py[\s\S]*--apply/);
  assert.match(pkg.scripts["hermes:gateway:unit:check"], /install-callscore-hermes-gateway-unit\.py[\s\S]*--check/);
  assert.match(pkg.scripts["hermes:gateway:unit:install"], /install-callscore-hermes-gateway-unit\.py[\s\S]*--install/);
});
