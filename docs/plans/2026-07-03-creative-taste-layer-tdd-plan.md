# CallScore Creative Taste Layer TDD Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task after three-agent plan validation passes.

**Goal:** Add a graph-owned creative/taste gate that prevents safe-but-drab CallScore public artifacts from being treated as production-ready.

**Architecture:** Upgrade existing canonical owners first: CMO as Creative Director/Taste Manager, Art of War strategist as Angle Editor, opportunity research as reference scout, channel heads as writers, existing image/YouTube thumbnail agents as visual workers, reviewer head as final taste/receipt auditor. Do not add new agents in this slice. Add typed gates/receipts and RED/GREEN tests so boring, generic, clipped, or evidence-free content is blocked before public handoff.

**Tech Stack:** TypeScript, Node test runner, tsx, existing Workplane/LangGraph operating graph, canonical public artifact provenance, social originality gate, content quality gate.

---

## Task-router classification

**Categories:** testing, backend, frontend/design, ml/llm workflow, documentation, observability/governance.

**Complexity:** High.

**Primary skills:** task-router, writing-plans, subagent-driven-development, test-driven-development, callscore-canonical-runtime, parent-verification-of-agent-output.

**Supporting skills:** social-media/callscore-social-posting-discipline, marketing/callscore-marketing-engine, mlops/langgraph-workplane, media/youtube-content, github/committing-user-work-safely.

## Hard constraints

- No live public/provider/social mutation.
- No DB writes, deploys, Whop/payment/customer/provider mutation, or secrets.
- Do not add new agents in this first slice.
- Existing owners must be upgraded/remapped first.
- New agent creation is allowed only after a failing receipt proves no existing owner can absorb the function.
- No direct parent publish/provider calls.
- Any public-ready artifact must remain graph-owned and receipt-backed.
- Strict TDD: every behavior starts with RED, then minimal GREEN.
- Do not stage or overwrite unrelated dirty files currently in the repo.

## Existing dirty checkout caveat

As of plan creation, the checkout already has unrelated modified/untracked files. This plan must stage only its own files unless the user explicitly approves broader staging.

## Expected files for first slice

Create:
- `src/lib/workplane/creative-taste-gate.ts`
- `tests/creative-taste-gate.test.ts`

Modify, if tests justify it:
- `src/lib/workplane/public-artifact-provenance.ts`
- `tests/public-artifact-provenance.test.ts`
- `src/lib/workplane/social-originality-gate.ts`
- `tests/content-quality-gate-regression.test.ts`

Do not modify graph wiring until the standalone gate is green and reviewed.

## Acceptance criteria for first slice

- New creative taste gate exports `evaluateCreativeTasteGate(input)`.
- Gate returns `{ ok, blocker_codes, warnings, score, max_score, dimension_scores }`.
- Generic product manifesto is blocked.
- Missing concrete evidence/live seed is blocked.
- Repeated `receipts > vibes` style scaffold is blocked when overused.
- Mock/clipped/draft-disclaimer visual is blocked for production/public-ready visual artifacts.
- YouTube production package without full script and rendered thumbnail proof is blocked.
- Draft/test artifacts can still be classified as non-public without claiming production readiness.
- Public artifact provenance can require taste receipts for public-ready owned-public artifacts without weakening existing canonical receipt requirements.
- Relevant tests pass in parent session.

## Verification commands

Run after each relevant task:

```bash
node --import tsx --test tests/creative-taste-gate.test.ts
node --import tsx --test tests/public-artifact-provenance.test.ts tests/content-quality-gate-regression.test.ts tests/social-originality-gate.test.ts
npm run typecheck
/usr/bin/python3 /srv/agents/hermes/scripts/callscore-canonical-agent-audit.py
```

Full regression when first slice is complete:

```bash
npm test
npm run typecheck
```

---

## Task 0: Plan validation and kanban setup

**Objective:** Validate this plan before implementation and create a durable task chain.

**Files:**
- Create: `docs/plans/2026-07-03-creative-taste-layer-tdd-plan.md`

**Steps:**
1. Save this plan.
2. Stage and commit only this plan file if safe.
3. Create kanban tasks for Task 1 through Task 6 with parent dependencies.
4. Dispatch three plan reviewers:
   - spec/contract reviewer;
   - implementation/code reviewer;
   - security/risk reviewer.
5. Do not implement until plan validation has no blocking findings, or parent-equivalent validation patches this plan.

**Verification:**
- `git diff --cached --name-only` shows only this plan file before commit.
- `hermes kanban list --board callscore-creative-taste` shows dependency chain.

---

## Task 1: RED tests for creative taste gate hard blockers

**Objective:** Add failing tests that define the creative/taste gate behavior.

**Files:**
- Create: `tests/creative-taste-gate.test.ts`

**Step 1: Write failing tests**

Tests should import `evaluateCreativeTasteGate` from `../src/lib/workplane/creative-taste-gate` and assert blockers for:

1. `generic_product_manifesto_blocked`
2. `concrete_evidence_required`
3. `overused_receipts_vibes_scaffold`
4. `mock_or_placeholder_visual_blocked`
5. `visual_render_proof_required`
6. `public_draft_disclaimer_blocked`
7. `youtube_full_script_required`
8. `youtube_rendered_thumbnail_required`

**Step 2: Run RED**

```bash
node --import tsx --test tests/creative-taste-gate.test.ts
```

Expected: FAIL because `src/lib/workplane/creative-taste-gate.ts` does not exist.

---

## Task 2: GREEN minimal creative taste gate implementation

**Objective:** Implement only enough gate logic to pass Task 1 tests.

**Files:**
- Create: `src/lib/workplane/creative-taste-gate.ts`
- Test: `tests/creative-taste-gate.test.ts`

**Implementation requirements:**
- Export type `CreativeTasteGateDecision`.
- Export function `evaluateCreativeTasteGate(input: Record<string, unknown>): CreativeTasteGateDecision`.
- Use defensive parsing only; no external calls.
- Return deterministic blockers and score.
- Keep no provider/public mutation path.

**Step 1: Run GREEN target**

```bash
node --import tsx --test tests/creative-taste-gate.test.ts
```

Expected: PASS.

**Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS or only documented unrelated pre-existing failure. If unrelated failure appears, classify clearly and run focused tests.

---

## Task 3: RED/GREEN production-ready pass case

**Objective:** Prove the taste gate does not block strong, evidence-backed, rendered public artifacts.

**Files:**
- Modify: `tests/creative-taste-gate.test.ts`
- Modify: `src/lib/workplane/creative-taste-gate.ts`

**RED behavior:**
Add a test where a production-ready X or LinkedIn artifact includes:
- concrete creator/call/stat evidence;
- non-generic channel-native copy;
- rendered visual proof path and sha256;
- no draft disclaimer;
- visual class allowed;
- taste receipts present.

Run test and verify it fails until implementation supports pass case.

**GREEN behavior:**
Update scoring/required fields so the strong artifact passes.

**Verification:**
```bash
node --import tsx --test tests/creative-taste-gate.test.ts
```

---

## Task 4: RED/GREEN provenance integration for taste receipts

**Objective:** Require taste receipts before public-ready owned-public artifacts can be approved, without weakening existing provenance rules.

**Files:**
- Modify: `src/lib/workplane/public-artifact-provenance.ts`
- Modify: `tests/public-artifact-provenance.test.ts`

**RED behavior:**
Add tests proving:
- public-ready owned-public artifact without `taste_brief_receipt_id` is blocked;
- without `taste_critique_receipt_id` is blocked;
- without `creative_package_approval_receipt_id` is blocked;
- blocked/draft/context-only artifacts still fail public readiness and are not silently promoted;
- existing visual receipt blockers remain intact.

**GREEN behavior:**
Add taste receipt checks only for generated public artifacts intended as publish candidates.

**Verification:**
```bash
node --import tsx --test tests/public-artifact-provenance.test.ts
node --import tsx --test tests/creative-taste-gate.test.ts
```

---

## Task 5: RED/GREEN content quality regression coverage

**Objective:** Ensure existing quality gate regressions capture the latest drab-output failures from the tmux review package.

**Files:**
- Modify: `tests/content-quality-gate-regression.test.ts`
- Modify only if needed: `/srv/agents/hermes/scripts/callscore-content-quality-gate.py`

**RED behavior:**
Add regression tests for:
- draft/test disclaimer in public copy;
- text-only thought leadership without media proof;
- clipped/mock visual metadata if represented in packet;
- repeated generic evidence slogan.

**GREEN behavior:**
Update the quality gate only if the tests show a real gap not already covered by `creative-taste-gate.ts`.

**Verification:**
```bash
node --import tsx --test tests/content-quality-gate-regression.test.ts
```

---

## Task 6: Parent verification and three-agent review

**Objective:** Verify implementation directly and with independent reviewers before claiming completion.

**Files:**
- All changed files from Tasks 1-5.

**Steps:**
1. Inspect diff directly.
2. Run focused tests:
   ```bash
   node --import tsx --test tests/creative-taste-gate.test.ts tests/public-artifact-provenance.test.ts tests/content-quality-gate-regression.test.ts tests/social-originality-gate.test.ts
   ```
3. Run `npm run typecheck`.
4. Run canonical agent audit.
5. Dispatch three reviewers: spec, implementation, security/risk.
6. Patch any blocker and rerun gates.
7. Commit focused implementation only if verification is clean.

**Completion criteria:**
- Parent session reproduces all claimed tests.
- Three review lanes PASS or parent-equivalent review remediates all findings.
- No public/provider mutations occurred.
- Git diff is focused and excludes unrelated dirty files.
