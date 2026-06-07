# Creator Admission Gate Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Prevent news/commentary/third-party channels from entering tracked creator promotion and suppress known contaminated legacy creators from buyer-facing rankings.

**Architecture:** Add code-only candidate admission metadata and fail-closed promotion evaluation before `TRACKED_CREATORS` writes. Add a small legacy override manifest for existing tracked creators and apply it only where buyer-facing leaderboard rows/counts are queried. No DB migrations, recompute, extraction, or deploy.

**Tech Stack:** TypeScript, Next.js App Router API routes, Node test runner.

---

### Task 1: Extend candidate admission metadata

**Objective:** Add non-DB candidate fields for creator-call sample review and rankability status.

**Files:**
- Modify: `src/lib/global-creator-candidates.ts`
- Test: `tests/global-creator-candidates.test.ts`

**Steps:**
1. Add `CREATOR_CALL_SAMPLE_STATUSES`, `CREATOR_RANKABILITY_STATUSES`, defaults, and types.
2. Add optional metadata fields to `GlobalCreatorCandidate`.
3. Validate explicit values when present; default missing values fail closed.
4. Test defaults are `not_reviewed` and `rejected`.

### Task 2: Harden promotion gate

**Objective:** Promotion requires `approved + creator_calls + high + rankable_caller + passed + handle + not tracked`.

**Files:**
- Modify: `src/scripts/promote-creator-candidates.ts`
- Test: `tests/global-creator-candidates.test.ts`

**Steps:**
1. Add `evaluatePromotionCandidate()` and reason list.
2. Use evaluation in `selectPromotionCandidates()`.
3. Print blocked candidates and reasons in dry-run/write output.
4. Test non-creator/news/education/macro, bad rankability, missing sample pass, and tracked handles are blocked.

### Task 3: Add legacy creator override

**Objective:** Suppress Altcoin Daily from buyer-facing rankings without DB mutation.

**Files:**
- Create: `src/lib/legacy-creator-overrides.ts`
- Test: `tests/legacy-creator-overrides.test.ts`

**Steps:**
1. Add `@AltcoinDaily` override with audit reason/source.
2. Export handle helper and SQL predicate helper.
3. Test audit basis and generated SQL.

### Task 4: Apply buyer-facing leaderboard filters and floors

**Objective:** Exclude legacy contaminated creators and enforce post-audit floors.

**Files:**
- Modify: `src/lib/leaderboard-eligibility.ts`
- Modify: `src/app/api/leaderboard/route.ts`
- Modify: `src/app/api/v1/leaderboard/route.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/lib/public-counts.ts`
- Modify: `src/scripts/leaderboard.ts`
- Modify: `src/lib/recompute-stats.ts`
- Test: `tests/public-integrity.test.ts`, `tests/legacy-creator-overrides.test.ts`

**Steps:**
1. Set all_time/12mo floor `25`, low-N `50`.
2. Set 90d floor `10`, low-N `20`.
3. Pass period to eligibility helper.
4. Add legacy exclusion predicate where `creators` is joined on buyer-facing surfaces.
5. Keep recompute scoped to floor only; no legacy DB rewrite.

### Task 5: Keep 30d non-buyer-facing

**Objective:** 30d stays API-only experimental, not a public selector.

**Files:**
- Modify: `src/components/PeriodFilter.tsx`
- Test: `tests/legacy-creator-overrides.test.ts`

**Steps:**
1. Remove 30d from buyer-facing period selector.
2. Keep API routes accepting `30d` for internal/API use.

### Task 6: Validate

**Commands:**
- `git diff --check`
- added-line secret scan with `git diff -U0`
- `npm run lint`
- `npm run typecheck`
- `node --import tsx --test tests/global-creator-candidates.test.ts tests/public-integrity.test.ts tests/legacy-creator-overrides.test.ts`
- `npm test`
- `npm run build`

**Expected:** All pass; no migrations; no DB mutation code added.
