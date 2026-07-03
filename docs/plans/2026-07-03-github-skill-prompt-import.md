# GitHub Skill Prompt Import Implementation Plan

> **For Hermes:** Use task-router, subagent-driven-development, and test-driven-development. Parent session must verify every claim with live tool output.

**Goal:** Build CallScore reusable channel-agent skill frameworks from public GitHub prompt/skill patterns without importing final public copy, and wire those skills to the canonical 51-agent toolbox contract.

**Architecture:** Skills live under the active CallScore Hermes profile at `/srv/agents/hermes/profiles/callscore/skills`. The repo owns validation, toolbox skill assignment deltas, generators, audit/package scripts, and regression tests. Runtime scripts remain conductors; canonical agents remain authors.

**Tech Stack:** Hermes skills, TypeScript, Node test runner, js-yaml, bash/Python packaging helpers, CallScore canonical toolbox contract.

---

## Live pre-flight evidence

- Repo: `/opt/crypto-tuber-ranked`
- Branch: `master`
- Baseline pushed commit before this plan: `1e37f8fcba590435ac51e4762f7fed8a87553355`
- Codebase-memory project: `opt-crypto-tuber-ranked`
- Codebase-memory status: `ready`, 10,625 nodes, 22,974 edges
- Required hooks verified executable: post-commit, post-merge, post-checkout, post-rewrite
- Baseline tests before this sprint:
  - `node --import tsx --test tests/agent-toolbox-contract.test.ts tests/canonical-operational-runtime.test.ts tests/graph-only-external-mutation.test.ts` -> pass, 40/40
  - `npm run typecheck` -> pass
  - `npm test` -> pass, 1291/1291

## Hard constraints

- No provider/public mutation.
- No live publishing.
- No external sends.
- No DB/deploy/destructive mutation.
- No credentials or secrets in skill files, fixtures, tests, packages, or logs.
- No final public posts, emails, thumbnails, videos, or scripts from this task.
- No reusable final public copy imported from GitHub.
- No new canonical agents.
- No non-canonical child-agent IDs.
- Scripts may conduct, validate, package, and audit only; agents author originals later.
- Exact text in image/video skill frameworks must route through compositor/text layer, not model-generated text.

## Expected files

Repo files:
- `docs/plans/2026-07-03-github-skill-prompt-import.md`
- `src/lib/agent-toolbox-contract.ts`
- `src/scripts/generate-github-skill-prompt-import.ts`
- `tests/callscore-skill-library-contract.test.ts`

Profile skill files under `/srv/agents/hermes/profiles/callscore/skills/callscore-autopilot/` or a more specific existing owner after duplicate analysis:
- SKILL.md for each created skill or patched existing skill
- `references/platform-rules.md`
- `references/taste-rules.md`
- `references/negative-patterns.md`
- `references/examples-as-fixtures-only.md`
- `references/schemas/output.schema.json`
- `references/tests/regression-cases.json`

Runtime package:
- `/srv/agents/hermes/runtime/channel-head-orchestrator/github-skill-prompt-import/<timestamp>/`
- `/srv/agents/hermes/runtime/channel-head-orchestrator/inspection-packages/github-skill-prompt-import-<timestamp>.zip`

## Task 1: RED tests for skill-library contract

**Objective:** Add failing tests that prove the skill library does not exist / is not wired yet.

**Files:**
- Create: `tests/callscore-skill-library-contract.test.ts`

**Steps:**
1. Write tests that expect the required skills or documented merge targets to exist under `/srv/agents/hermes/profiles/callscore/skills`.
2. Test frontmatter has `allowed_agents` and only canonical agent IDs.
3. Test required reference files exist under `references/`.
4. Test output schemas and regression cases are present.
5. Test X/LinkedIn/YouTube/image/video/email/comment constraints are represented in skill text and fixtures.
6. Test `src/lib/agent-toolbox-contract.ts` exposes/assigns required skill names.
7. Run the test and verify RED.

Expected RED: missing skill files and/or missing toolbox assignments.

## Task 2: Implement skill templates and duplicate/merge analysis

**Objective:** Create deterministic framework skills and provenance files without final public copy.

**Files:**
- Create/update profile skill folders under active CallScore profile.
- Runtime package files under `github-skill-prompt-import/<timestamp>/`.

**Steps:**
1. Inspect existing skills and write `duplicate-merge-analysis.json/md`.
2. Create only non-duplicate skills; patch/extend existing skills if they already own the behavior.
3. For each skill, write SKILL.md with valid YAML frontmatter and the required sections.
4. Add platform rules, taste rules, negative patterns, fixtures-only examples, output schema, regression cases.
5. Write `skill-source-map.json` and `github-research-summary.md` with pattern-level provenance only.
6. Do not include publishable final copy.

Expected GREEN for existence/content tests after Task 2 except toolbox wiring.

## Task 3: Wire skill assignments into toolbox contract

**Objective:** Make canonical agent toolbox contracts list the new framework skill IDs for the right canonical agents.

**Files:**
- Modify: `src/lib/agent-toolbox-contract.ts`
- Update tests: `tests/agent-toolbox-contract.test.ts` if needed

**Steps:**
1. Write/keep a RED assertion that YouTube/X/LinkedIn/Email/Community agents expose the new skill IDs.
2. Add skill IDs to the relevant channel/child contracts.
3. Ensure no forbidden parent harness/non-canonical agent can receive them as authoring authority.
4. Run focused tests.

Expected GREEN: skill-to-agent assignment table validates.

## Task 4: Build audit/package generator

**Objective:** Produce a self-contained no-mutation inspection package.

**Files:**
- Create: `src/scripts/generate-github-skill-prompt-import.ts`

**Steps:**
1. Generate the runtime output directory.
2. Copy/record skill files and reference files.
3. Write source map, skill assignment delta, test summary placeholders, mutation audit, credential scan, and SHA256SUMS.
4. Build ZIP under inspection-packages.
5. Test ZIP integrity and SHA256.

Expected GREEN: package exists, zip test passes, credential scan has zero real findings.

## Task 5: Full verification, commit, push

**Objective:** Parent-verify everything and push final repo changes.

**Verification commands:**
- `node --import tsx --test tests/callscore-skill-library-contract.test.ts tests/agent-toolbox-contract.test.ts`
- `npm run typecheck`
- `npm test`
- `python3 - <<'PY' ... credential scan ... PY`
- `unzip -t <zip>`
- `git diff --check`

**Acceptance criteria:**
- RED was captured before implementation.
- All required skills exist or have documented merge targets.
- All allowed_agents are canonical 51 IDs.
- No final public copy or copied reusable GitHub text is embedded.
- Exact text in media is compositor/text-layer only.
- Toolbox assignments are canonical and tested.
- Package has mutation audit, credential scan, SHA256, and zip test.
- Repo changes are committed and pushed to GitHub.
