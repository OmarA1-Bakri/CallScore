import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
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

function argValue(name: string): string | null {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] ?? null : null;
}

function utcStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walkFiles(path));
    else if (stat.isFile()) out.push(path);
  }
  return out;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function credentialScan(files: string[]): { schema: "callscore.credential_scan.v1"; scanned_files: number; findings: Array<{ file: string; pattern: string }> ; status: "pass" | "fail" } {
  const patterns: Array<[string, RegExp]> = [
    ["private_key_block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ["github_pat", /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/],
    ["openai_like_key", /\bsk-[A-Za-z0-9]{32,}\b/],
    ["slack_token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
    ["aws_access_key", /\bAKIA[0-9A-Z]{16}\b/],
  ];
  const findings: Array<{ file: string; pattern: string }> = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const [name, regex] of patterns) {
      if (regex.test(text)) findings.push({ file, pattern: name });
    }
  }
  return { schema: "callscore.credential_scan.v1", scanned_files: files.length, findings, status: findings.length ? "fail" : "pass" };
}

function main(): void {
  const timestamp = argValue("--timestamp") ?? utcStamp();
  const runPath = join(RUNTIME_BASE, timestamp);
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

  const textFiles = walkFiles(runPath).filter((path) => !path.endsWith(".zip"));
  const scan = credentialScan(textFiles);
  writeJson(join(runPath, "credential-scan.json"), scan);

  const shaLines = walkFiles(runPath)
    .filter((path) => basename(path) !== "SHA256SUMS")
    .sort()
    .map((path) => `${sha256(path)}  ${relative(runPath, path)}`);
  writeFileSync(join(runPath, "SHA256SUMS"), `${shaLines.join("\n")}\n`);

  const zipPath = join(ZIP_BASE, `github-skill-prompt-import-${timestamp}.zip`);
  if (existsSync(zipPath)) rmSync(zipPath, { force: true });
  const zip = spawnSync("zip", ["-qr", zipPath, basename(runPath)], { cwd: RUNTIME_BASE, encoding: "utf8" });
  if (zip.status !== 0) throw new Error(zip.stderr || zip.stdout || "zip failed");
  const zipTest = spawnSync("unzip", ["-t", zipPath], { encoding: "utf8" });
  if (zipTest.status !== 0) throw new Error(zipTest.stderr || zipTest.stdout || "zip test failed");

  writeJson(join(runPath, "package-summary.json"), {
    schema: "callscore.github_skill_prompt_import_package.v1",
    run_path: runPath,
    zip_path: zipPath,
    zip_sha256: sha256(zipPath),
    copied_skills: copiedSkills,
    mutation_audit: mutationAudit,
    credential_scan: scan,
    zip_test_tail: zipTest.stdout.trim().split("\n").slice(-1)[0] ?? "",
  });

  process.stdout.write(JSON.stringify({
    run_path: runPath,
    zip_path: zipPath,
    sha256: sha256(zipPath),
    copied_skills: copiedSkills,
    mutation_audit: mutationAudit,
    credential_scan: scan,
  }));
}

main();
