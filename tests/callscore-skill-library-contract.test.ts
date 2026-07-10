import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import yaml from "js-yaml";

import { getAgentToolboxContract, isCanonicalAgentId } from "../src/lib/agent-toolbox-contract";

const PROFILE_SKILLS_ROOT = "/srv/agents/hermes/profiles/callscore/skills";
const SKILL_BASE = join(PROFILE_SKILLS_ROOT, "callscore-autopilot");
const skillsExist = existsSync(SKILL_BASE);

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

const REQUIRED_REFERENCE_FILES = [
  "references/platform-rules.md",
  "references/taste-rules.md",
  "references/negative-patterns.md",
  "references/examples-as-fixtures-only.md",
  "references/schemas/output.schema.json",
  "references/tests/regression-cases.json",
] as const;

const PROVENANCE_BASE = join(SKILL_BASE, "references/github-skill-prompt-import");
const REQUIRED_PROVENANCE_FILES = [
  "duplicate-merge-analysis.json",
  "duplicate-merge-analysis.md",
  "skill-source-map.json",
  "github-research-summary.md",
] as const;

function skillDir(skill: string): string {
  return join(SKILL_BASE, skill);
}

function readSkill(skill: string): { raw: string; frontmatter: Record<string, unknown>; body: string } {
  const path = join(skillDir(skill), "SKILL.md");
  assert.equal(existsSync(path), true, `missing ${path}`);
  const raw = readFileSync(path, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(match, `${skill} SKILL.md must have YAML frontmatter`);
  return { raw, frontmatter: yaml.load(match[1]) as Record<string, unknown>, body: match[2] };
}

describe("CallScore skill library contract", { skip: !skillsExist }, () => {

test("required CallScore channel skill folders exist with Hermes-compatible support files", () => {
  for (const skill of REQUIRED_SKILLS) {
    assert.equal(existsSync(join(skillDir(skill), "SKILL.md")), true, `${skill} missing SKILL.md`);
    for (const rel of REQUIRED_REFERENCE_FILES) {
      assert.equal(existsSync(join(skillDir(skill), rel)), true, `${skill} missing ${rel}`);
    }
  }
});

test("required CallScore skills declare canonical allowed agents and forbid parent/package harnesses", () => {
  for (const skill of REQUIRED_SKILLS) {
    const { frontmatter } = readSkill(skill);
    assert.equal(frontmatter.name, skill);
    const allowed = frontmatter.allowed_agents;
    assert.ok(Array.isArray(allowed) && allowed.length > 0, `${skill} must declare allowed_agents`);
    for (const agentId of allowed as string[]) {
      assert.equal(isCanonicalAgentId(agentId), true, `${skill} allowed non-canonical agent ${agentId}`);
      assert.doesNotMatch(agentId, /parent|package|harness|child$/i, `${skill} must not authorize harness/non-canonical child ids`);
    }
    const forbidden = String((frontmatter.forbidden_agents as unknown) ?? "");
    assert.match(forbidden, /parent repair harness/);
    assert.match(forbidden, /package generator/);
  }
});

test("skill frameworks contain constraints, not reusable final public copy", () => {
  const bannedPublicCopy = [
    /CallScore is live/i,
    /receipts over vibes/i,
    /evidence over hype/i,
    /scoreboard that shows its work/i,
    /not another leaderboard/i,
    /I hope this email finds you well/i,
  ];
  for (const skill of REQUIRED_SKILLS) {
    const { raw } = readSkill(skill);
    assert.match(raw, /Prompt grammar|Workflow|Quality bar|Anti-patterns/i, `${skill} missing framework sections`);
    assert.match(raw, /fixture|negative|non-public/i, `${skill} must label examples as fixtures/non-public`);
    for (const banned of bannedPublicCopy) {
      assert.doesNotMatch(raw, banned, `${skill} contains reusable public/slop phrase ${banned}`);
    }
  }
});

test("platform skill constraints are represented explicitly", () => {
  const x = readSkill("callscore-x-post-thread-comment").raw;
  assert.match(x, /<=\s*280|280 chars/i);
  assert.match(x, /proof object/i);
  assert.match(x, /target context/i);

  const linkedin = readSkill("callscore-linkedin-thought-leadership").raw;
  assert.match(linkedin, /thesis/i);
  assert.match(linkedin, /evidence/i);
  assert.match(linkedin, /operator|buyer/i);
  assert.match(linkedin, /expanded-X|expanded X|cross-post/i);

  const youtubeScript = readSkill("callscore-youtube-retention-script").raw;
  assert.match(youtubeScript, /title.*thumbnail.*expectation|thumbnail.*title.*expectation/is);
  assert.match(youtubeScript, /pattern interrupt/i);
  assert.match(youtubeScript, /claims\/evidence map|evidence map/i);

  const thumbnail = readSkill("callscore-youtube-thumbnail").raw;
  assert.match(thumbnail, /safe zones/i);
  assert.match(thumbnail, /mobile preview/i);
  assert.match(thumbnail, /compositor|text layer/i);

  const image = readSkill("callscore-social-proof-image").raw;
  assert.match(image, /subject|proof object/i);
  assert.match(image, /lighting/i);
  assert.match(image, /camera|lens|composition/i);
  assert.match(image, /exact text.*compositor|text layer/i);

  const video = readSkill("callscore-ai-video-prompting").raw;
  assert.match(video, /duration/i);
  assert.match(video, /camera movement|camera/i);
  assert.match(video, /motion/i);
  assert.match(video, /restrictions/i);

  const email = readSkill("callscore-cold-email-partnership").raw;
  assert.match(email, /peer/i);
  assert.match(email, /every sentence/i);
  assert.match(email, /AI\/sales tells|sales tells/i);

  const comment = readSkill("callscore-community-comment-reply").raw;
  assert.match(comment, /target context/i);
  assert.match(comment, /answer-first|answer first/i);
  assert.match(comment, /hidden pitch/i);
});

test("output schemas and regression cases parse for every required skill", () => {
  for (const skill of REQUIRED_SKILLS) {
    const schemaPath = join(skillDir(skill), "references/schemas/output.schema.json");
    const casesPath = join(skillDir(skill), "references/tests/regression-cases.json");
    assert.equal(existsSync(schemaPath), true, `${skill} missing output schema`);
    assert.equal(existsSync(casesPath), true, `${skill} missing regression cases`);
    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as { type?: string; required?: string[] };
    assert.equal(schema.type, "object", `${skill} schema must be JSON object schema`);
    assert.ok(Array.isArray(schema.required) && schema.required.includes("receipts_required"), `${skill} schema must require receipts_required`);
    const cases = JSON.parse(readFileSync(casesPath, "utf8")) as unknown[];
    assert.ok(Array.isArray(cases) && cases.length >= 3, `${skill} must have at least 3 regression cases`);
  }
});

test("skill import provenance files document merge decisions and source mapping", () => {
  for (const rel of REQUIRED_PROVENANCE_FILES) {
    assert.equal(existsSync(join(PROVENANCE_BASE, rel)), true, `missing provenance file ${rel}`);
  }

  const duplicateAnalysis = JSON.parse(readFileSync(join(PROVENANCE_BASE, "duplicate-merge-analysis.json"), "utf8")) as {
    no_final_public_copy: boolean;
    merge_decisions: Array<{ skill: string; decision: string; duplicate_of?: string | null }>;
  };
  assert.equal(duplicateAnalysis.no_final_public_copy, true);
  assert.equal(duplicateAnalysis.merge_decisions.length, REQUIRED_SKILLS.length);
  for (const skill of REQUIRED_SKILLS) {
    const decision = duplicateAnalysis.merge_decisions.find((entry) => entry.skill === skill);
    assert.ok(decision, `${skill} missing duplicate merge decision`);
    assert.match(decision.decision, /created|patched|merged/i);
  }

  const sourceMap = JSON.parse(readFileSync(join(PROVENANCE_BASE, "skill-source-map.json"), "utf8")) as {
    skills: Array<{ skill: string; source_patterns: string[]; active_skill_path: string; support_files: string[] }>;
  };
  assert.equal(sourceMap.skills.length, REQUIRED_SKILLS.length);
  for (const skill of REQUIRED_SKILLS) {
    const mapping = sourceMap.skills.find((entry) => entry.skill === skill);
    assert.ok(mapping, `${skill} missing source map entry`);
    assert.ok(mapping.source_patterns.length >= 2, `${skill} must map at least two source patterns`);
    assert.match(mapping.active_skill_path, new RegExp(`${skill}/SKILL\\.md$`));
    for (const rel of REQUIRED_REFERENCE_FILES) {
      assert.ok(mapping.support_files.includes(rel), `${skill} source map missing ${rel}`);
    }
  }

  const summary = readFileSync(join(PROVENANCE_BASE, "github-research-summary.md"), "utf8");
  assert.match(summary, /pattern-level provenance/i);
  assert.match(summary, /no final public copy/i);
});

test("regression fixtures encode platform-specific negative and edge cases", () => {
  const expectedFixtureSignals: Record<string, RegExp[]> = {
    "callscore-youtube-retention-script": [/retention/i, /evidence/i, /thumbnail/i],
    "callscore-youtube-packaging": [/title/i, /description/i, /thumbnail/i],
    "callscore-youtube-thumbnail": [/safe zone/i, /mobile/i, /text layer|compositor/i],
    "callscore-ai-video-prompting": [/duration/i, /motion|camera/i, /restriction/i],
    "callscore-social-proof-image": [/proof object|subject/i, /lighting|composition/i, /text layer|compositor/i],
    "callscore-x-post-thread-comment": [/280|thread|reply/i, /target context/i, /proof object/i],
    "callscore-linkedin-thought-leadership": [/thesis/i, /operator|buyer/i, /cross-post|expanded X/i],
    "callscore-linkedin-carousel-document": [/carousel|document/i, /slide/i, /operator|buyer/i],
    "callscore-social-hook-engine": [/hook/i, /anti-pattern|negative/i, /same-shit|original/i],
    "callscore-cold-email-partnership": [/peer/i, /sentence/i, /AI\/sales tells|sales tells/i],
    "callscore-community-comment-reply": [/answer-first|answer first/i, /hidden pitch/i, /target context/i],
    "callscore-copy-humanizer": [/AI-ism|generic/i, /specific/i, /human/i],
  };

  for (const [skill, signals] of Object.entries(expectedFixtureSignals)) {
    const casesPath = join(skillDir(skill), "references/tests/regression-cases.json");
    assert.equal(existsSync(casesPath), true, `${skill} missing regression cases`);
    const fixtureText = readFileSync(casesPath, "utf8");
    for (const signal of signals) {
      assert.match(fixtureText, signal, `${skill} fixtures missing platform signal ${signal}`);
    }
  }
});

test("canonical toolbox contracts assign skill frameworks to the correct agents", () => {
  const expected: Record<string, string[]> = {
    "callscore-youtube-script-agent": ["callscore-youtube-retention-script", "callscore-ai-video-prompting"],
    "callscore-youtube-packaging-agent": ["callscore-youtube-packaging"],
    "callscore-youtube-thumbnail-agent": ["callscore-youtube-thumbnail", "callscore-social-proof-image"],
    "callscore-youtube-publishing-agent": ["callscore-ai-video-prompting"],
    "callscore-youtube-commenting-agent": ["callscore-community-comment-reply"],
    "callscore-x-posting-agent": ["callscore-x-post-thread-comment", "callscore-social-hook-engine", "callscore-copy-humanizer"],
    "callscore-x-commenting-agent": ["callscore-community-comment-reply"],
    "callscore-x-image-agent": ["callscore-social-proof-image"],
    "callscore-linkedin-posting-agent": ["callscore-linkedin-thought-leadership", "callscore-linkedin-carousel-document", "callscore-social-hook-engine", "callscore-copy-humanizer"],
    "callscore-linkedin-commenting-agent": ["callscore-community-comment-reply"],
    "callscore-linkedin-image-agent": ["callscore-social-proof-image", "callscore-linkedin-carousel-document"],
    "callscore-email-partnership-drafts-head": ["callscore-cold-email-partnership", "callscore-copy-humanizer"],
    "callscore-cmo-head": ["callscore-social-hook-engine", "callscore-copy-humanizer"],
  };
  for (const [agentId, skills] of Object.entries(expected)) {
    const contract = getAgentToolboxContract(agentId);
    assert.ok(contract, `missing toolbox contract for ${agentId}`);
    for (const skill of skills) {
      assert.ok(contract.required_skills.includes(skill), `${agentId} missing required skill ${skill}`);
    }
  }
});

function runGenerator(timestamp: string): { status: number | null; stdout: string; stderr: string; output?: { run_path: string; zip_path: string; sha256: string; mutation_audit: { provider_public_mutation: boolean; public_publish: boolean; db_mutation: boolean; deploy_mutation: boolean; destructive_mutation: boolean }; credential_scan: { findings: unknown[] } } } {
  const scriptPath = join(process.cwd(), "src/scripts/generate-github-skill-prompt-import.ts");
  assert.equal(existsSync(scriptPath), true, "missing github skill prompt import generator");
  const result = spawnSync(process.execPath, ["--import", "tsx", scriptPath, "--timestamp", timestamp], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    output: result.status === 0 ? JSON.parse(result.stdout) : undefined,
  };
}

test("audit package generator emits no-mutation inspection bundle", () => {
  const result = runGenerator("test-smoke");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = result.output!;
  assert.equal(existsSync(output.run_path), true);
  assert.equal(existsSync(output.zip_path), true);
  assert.equal(output.mutation_audit.provider_public_mutation, false);
  assert.equal(output.mutation_audit.public_publish, false);
  assert.equal(output.mutation_audit.db_mutation, false);
  assert.equal(output.mutation_audit.deploy_mutation, false);
  assert.equal(output.mutation_audit.destructive_mutation, false);
  assert.deepEqual(output.credential_scan.findings, []);
});

test("audit package includes package and verification summaries inside ZIP and SHA manifest", () => {
  const result = runGenerator("summary-smoke");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = result.output!;
  const zipList = spawnSync("unzip", ["-l", output.zip_path], { encoding: "utf8" });
  assert.equal(zipList.status, 0, zipList.stderr || zipList.stdout);
  assert.match(zipList.stdout, /package-summary\.json/);
  assert.match(zipList.stdout, /verification-summary\.json/);
  const shaManifest = readFileSync(join(output.run_path, "SHA256SUMS"), "utf8");
  assert.match(shaManifest, /package-summary\.json/);
  assert.match(shaManifest, /verification-summary\.json/);
});

test("audit package generator is deterministic for the same safe timestamp", () => {
  const first = runGenerator("determinism-smoke");
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const second = runGenerator("determinism-smoke");
  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.equal(second.output!.sha256, first.output!.sha256);
});

test("audit package generator rejects unsafe timestamp path traversal before cleanup", () => {
  const bad = runGenerator("../escape");
  assert.notEqual(bad.status, 0, "path traversal timestamp must fail");
  assert.match(`${bad.stderr}${bad.stdout}`, /unsafe timestamp/i);
});

}); // describe("CallScore skill library contract"
