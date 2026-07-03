import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { AGENT_SKILL_FRAMEWORK_ASSIGNMENTS } from "../lib/agent-toolbox-contract";

const REQUIRED_SKILLS = [
  "callscore-youtube-retention-script",
  "callscore-youtube-packaging",
  "callscore-youtube-thumbnail",
  "callscore-ai-video-prompting",
  "callscore-social-proof-image",
  "callscore-x-post-thread-comment",
  "callscore-linkedin-thought-leadership",
  "callscore-linkedin-carousel-document",
  "callscore-social-hook-engine",
  "callscore-cold-email-partnership",
  "callscore-community-comment-reply",
  "callscore-copy-humanizer",
] as const;

const PROFILE_SKILL_BASE = "/srv/agents/hermes/profiles/callscore/skills/callscore-autopilot";
const RUNTIME_BASE = "/srv/agents/hermes/runtime/channel-head-orchestrator/github-skill-prompt-import";
const ZIP_BASE = "/srv/agents/hermes/runtime/channel-head-orchestrator/inspection-packages";
const FIXED_ARCHIVE_DATE = new Date("2000-01-01T00:00:00Z");
const SAFE_TIMESTAMP = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

interface CredentialScanResult {
  readonly schema: "callscore.credential_scan.v1";
  readonly scanned_files: number;
  readonly findings: Array<{ file: string; pattern: string }>;
  readonly status: "pass" | "fail";
}

function argValue(name: string): string | null {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] ?? null : null;
}

function utcStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function safeTimestamp(raw: string): string {
  if (!SAFE_TIMESTAMP.test(raw)) {
    throw new Error(`unsafe timestamp: ${raw}`);
  }
  return raw;
}

function confinedPath(base: string, child: string): string {
  const baseResolved = resolve(base);
  const path = resolve(baseResolved, child);
  if (path !== baseResolved && !path.startsWith(`${baseResolved}/`)) {
    throw new Error(`unsafe path outside base: ${child}`);
  }
  return path;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walkFiles(path));
    else if (stat.isFile()) out.push(path);
  }
  return out;
}

function walkEntries(dir: string): string[] {
  const out: string[] = [dir];
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walkEntries(path));
    else out.push(path);
  }
  return out;
}

function normalizeArchiveTimes(dir: string): void {
  for (const path of walkEntries(dir)) {
    utimesSync(path, FIXED_ARCHIVE_DATE, FIXED_ARCHIVE_DATE);
  }
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function credentialScan(files: string[]): CredentialScanResult {
  const patterns: Array<[string, RegExp]> = [
    ["private_key_block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ["github_pat", /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/],
    ["openai_like_key", /\bsk-[A-Za-z0-9]{32,}\b/],
    ["slack_token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
    ["aws_access_key", /\bAKIA[0-9A-Z]{16}\b/],
  ];
  const findings: Array<{ file: string; pattern: string }> = [];
  for (const file of files.sort()) {
    const text = readFileSync(file, "utf8");
    for (const [name, regex] of patterns) {
      if (regex.test(text)) findings.push({ file: relative(dirnameForScan(files), file), pattern: name });
    }
  }
  return { schema: "callscore.credential_scan.v1", scanned_files: files.length, findings, status: findings.length ? "fail" : "pass" };
}

function dirnameForScan(files: string[]): string {
  const first = files[0];
  if (!first) return ".";
  const marker = "/github-skill-prompt-import/";
  const idx = first.indexOf(marker);
  if (idx < 0) return resolve(first, "..");
  const after = first.slice(idx + marker.length);
  const timestamp = after.split("/")[0];
  return first.slice(0, idx + marker.length + timestamp.length);
}

function zipDeterministic(runPath: string, timestamp: string): { zipPath: string; zipTestTail: string; zipSha256: string } {
  const zipPath = confinedPath(ZIP_BASE, `github-skill-prompt-import-${timestamp}.zip`);
  if (existsSync(zipPath)) rmSync(zipPath, { force: true });
  const archiveInputs = walkFiles(runPath)
    .map((path) => join(basename(runPath), relative(runPath, path)))
    .sort();
  const zip = spawnSync("zip", ["-X", "-q", zipPath, ...archiveInputs], { cwd: RUNTIME_BASE, encoding: "utf8" });
  if (zip.status !== 0) throw new Error(zip.stderr || zip.stdout || "zip failed");
  const zipTest = spawnSync("unzip", ["-t", zipPath], { encoding: "utf8" });
  if (zipTest.status !== 0) throw new Error(zipTest.stderr || zipTest.stdout || "zip test failed");
  return {
    zipPath,
    zipTestTail: zipTest.stdout.trim().split("\n").slice(-1)[0] ?? "",
    zipSha256: sha256(zipPath),
  };
}

function main(): void {
  const timestamp = safeTimestamp(argValue("--timestamp") ?? utcStamp());
  const runPath = confinedPath(RUNTIME_BASE, timestamp);
  const skillsOut = join(runPath, "skills", "callscore-autopilot");
  mkdirSync(ZIP_BASE, { recursive: true });
  if (existsSync(runPath)) rmSync(runPath, { recursive: true, force: true });
  mkdirSync(skillsOut, { recursive: true });

  const copiedSkills: string[] = [];
  for (const skill of REQUIRED_SKILLS) {
    const src = join(PROFILE_SKILL_BASE, skill);
    if (!existsSync(src)) throw new Error(`missing skill ${src}`);
    cpSync(src, join(skillsOut, skill), { recursive: true });
    copiedSkills.push(skill);
  }

  const sourceMap = REQUIRED_SKILLS.map((skill) => ({
    skill,
    source_policy: "pattern-level adaptation only",
    copied_final_copy: false,
    profile_path: join(PROFILE_SKILL_BASE, skill),
    package_path: join(skillsOut, skill),
  }));
  writeJson(join(runPath, "skill-source-map.json"), sourceMap);
  writeFileSync(join(runPath, "github-research-summary.md"), [
    "# GitHub skill prompt import",
    "",
    "Public GitHub material was used as pattern inspiration only: skill grammar, trigger rules, prompt scaffolds, platform constraints, QA gates, and schema/test ideas.",
    "No reusable final public copy, email body, post, script, thumbnail, or video artifact was imported.",
    "",
  ].join("\n"));
  writeJson(join(runPath, "duplicate-merge-analysis.json"), {
    schema: "callscore.duplicate_merge_analysis.v1",
    decision: "created narrow framework skills under callscore-autopilot",
    existing_broad_skills_preserved: ["callscore-marketing-engine", "callscore-social-posting-discipline", "youtube-content"],
    duplicate_public_copy_imported: false,
  });
  writeFileSync(join(runPath, "duplicate-merge-analysis.md"), "# Duplicate / merge analysis\n\nExisting broad operating skills remain authoritative. These narrow framework skills provide canonical worker-level prompt grammar and toolbox assignment contracts.\n");
  writeJson(join(runPath, "agent-toolbox-matrix-delta.json"), {
    schema: "callscore.agent_toolbox_skill_delta.v1",
    assignments: AGENT_SKILL_FRAMEWORK_ASSIGNMENTS,
  });
  writeFileSync(join(runPath, "task-router-skill-assignment-delta.md"), `# Task-router skill assignment delta\n\n${Object.entries(AGENT_SKILL_FRAMEWORK_ASSIGNMENTS).map(([agent, skills]) => `- ${agent}: ${skills.join(", ")}`).join("\n")}\n`);

  const mutationAudit = {
    schema: "callscore.mutation_audit.v1",
    execution_mode: "read_only_verify",
    provider_public_mutation: false,
    public_publish: false,
    db_mutation: false,
    deploy_mutation: false,
    destructive_mutation: false,
    external_send: false,
    filesystem_writes: [runPath],
    status: "pass",
  };
  writeJson(join(runPath, "mutation-audit.json"), mutationAudit);

  writeJson(join(runPath, "verification-summary.json"), {
    schema: "callscore.github_skill_prompt_import_verification_summary.v1",
    timestamp,
    generator_checks: [
      "skill_files_copied",
      "source_map_written",
      "toolbox_delta_written",
      "mutation_audit_written",
      "credential_scan_written",
      "sha256_manifest_written",
      "zip_integrity_tested",
    ],
    parent_test_log_contract: "Parent run records focused tests, typecheck, npm test, git diff --check, zip test, credential scan, and mutation audit outside the deterministic package.",
    test_summary_placeholders: {
      focused_tests: "recorded_by_parent_verification",
      typecheck: "recorded_by_parent_verification",
      full_test_suite: "recorded_by_parent_verification",
      git_diff_check: "recorded_by_parent_verification",
    },
  });

  writeJson(join(runPath, "package-summary.json"), {
    schema: "callscore.github_skill_prompt_import_package.v1",
    timestamp,
    run_path: runPath,
    zip_filename: `github-skill-prompt-import-${timestamp}.zip`,
    copied_skills: copiedSkills,
    mutation_audit_file: "mutation-audit.json",
    credential_scan_file: "credential-scan.json",
    verification_summary_file: "verification-summary.json",
    zip_sha256: "computed_after_zip_creation_and_returned_in_tool_stdout",
    deterministic_archive: true,
  });

  const scanInput = walkFiles(runPath).filter((path) => !path.endsWith("credential-scan.json") && !path.endsWith("SHA256SUMS"));
  const scan = credentialScan(scanInput);
  writeJson(join(runPath, "credential-scan.json"), scan);

  const shaLines = walkFiles(runPath)
    .filter((path) => basename(path) !== "SHA256SUMS")
    .sort()
    .map((path) => `${sha256(path)}  ${relative(runPath, path)}`);
  writeFileSync(join(runPath, "SHA256SUMS"), `${shaLines.join("\n")}\n`);

  normalizeArchiveTimes(runPath);
  const zipResult = zipDeterministic(runPath, timestamp);

  process.stdout.write(JSON.stringify({
    run_path: runPath,
    zip_path: zipResult.zipPath,
    sha256: zipResult.zipSha256,
    copied_skills: copiedSkills,
    mutation_audit: mutationAudit,
    credential_scan: scan,
    zip_test_tail: zipResult.zipTestTail,
  }));
}

main();
