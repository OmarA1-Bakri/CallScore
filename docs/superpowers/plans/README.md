# Frontend Editorial-Terminal Migration — Plan Index

Three sequential phases, each its own plan, designed for **subagent-driven development in git worktrees**. Each phase produces shippable software on its own and unlocks the next.

| Phase | Plan | Status | Scope | Parallelism |
|---|---|---|---|---|
| 1 | [2026-04-29-frontend-foundation-pass.md](2026-04-29-frontend-foundation-pass.md) | ✅ shipped | Tokens, fonts, breakpoints, Server Component header, codemods | mostly sequential |
| 2 | [2026-04-29-frontend-component-pass.md](2026-04-29-frontend-component-pass.md) | drafted | Editorial primitives, Leaderboard, AlphaScoreBadge, TierGate, PeriodFilter, FloatingFeedbackButton, lucide audit, glass-card sweep | T1 sequential, T2–T6 parallel, T7+T8 sequential |
| 3 | [2026-04-29-frontend-page-pass.md](2026-04-29-frontend-page-pass.md) | drafted | `/`, `/about`, `/pricing`, `/methodology`, `/creator/[handle]`, `/call/[id]` rebuilds + cross-cutting guardrails | T1–T6 fully parallel, T7 sequential |

---

## Worktree convention

All plans use `.worktrees/<task-name>/` (already gitignored). Per-worktree lifecycle:

```bash
# Create
git worktree add .worktrees/<name> -b chore/<branch> integrate/gtm-seo-legal-auth-hardening
cd .worktrees/<name>

# Subagent works here — runs:
npm test && npm run typecheck && npm run lint && npm run build
git push -u origin chore/<branch>

# Orchestrator merges and cleans up
cd ../..
git checkout integrate/gtm-seo-legal-auth-hardening
git merge --no-ff chore/<branch> -m "Merge chore/<branch> into integration"
git worktree remove .worktrees/<name>
git branch -d chore/<branch>
```

## Subagent dispatch overview

```
Phase 1 (DONE — landed via inline execution Apr 28):
  T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9
  (sequential, single subagent)

Phase 2 (READY for dispatch):
  T1 (primitives) — sequential
  ┌──────┬──────┬──────┬──────┐
  T2     T3     T4     T5     T6 — five parallel subagents
  └──────┴──────┴──────┴──────┘
  T7 + T8 (sweep) — sequential, single subagent
  T9 (orchestrator)

Phase 3 (READY for dispatch after Phase 2 lands):
  T0 (orchestrator helper)
  ┌──────┬──────┬──────┬──────┬──────┐
  T1     T2     T3     T4     T5     T6 — six parallel subagents
  └──────┴──────┴──────┴──────┴──────┘
  T7 (cross-cutting guardrails) — sequential
```

## Test-suite growth checkpoints

| Milestone | Expected `npm test` count |
|---|---|
| Pre-Phase 1 baseline | 148 |
| End of Phase 1 (current) | 160 |
| End of Phase 2 | ≥ 185 |
| End of Phase 3 | ≥ 215 |

Numbers grow because each task adds 1–5 guardrail `test()` blocks. **Counts are minimums** — `node --test` reports `test()` block count, not assertion count, so consolidating tests can lower the number without losing coverage. If the count drops, inspect the diff for deleted guardrails before assuming regression.

## Reference docs

Canonical visual targets live in:
- [docs/frontend-design-spec.md](../../frontend-design-spec.md) — written spec
- [.tmp/dev-archive/](../../../.tmp/dev-archive/) — extracted dev-pack HTML mockups (9 files, screen by screen)

Each plan task points at the specific dev-pack file the subagent should read for visual reference.

## How to dispatch

When ready to start Phase 2:

1. Verify Phase 1 is on `integrate/gtm-seo-legal-auth-hardening`:
   ```bash
   git log --oneline | grep -E "wire next/font|spec contract|brand-\* alias"
   ```
2. Read `2026-04-29-frontend-component-pass.md` Task 1 (sequential primitives).
3. Hand the Task 1 "Subagent prompt" + Steps to a fresh subagent in worktree mode.
4. After Task 1 merges, dispatch Tasks 2–6 in parallel (five subagents at once).
5. After all five merge, run Tasks 7+8 in one subagent.
6. Run Task 9 yourself as orchestrator.

Same pattern for Phase 3, with the addition of Task 0 (orchestrator-creates `tests/page-helpers.ts`) before the parallel dispatch.

## Phase boundaries (don't cross them mid-plan)

- **Phase 2 must not** rewrite page composition. Component rebuilds only. Pages still use the old composition until Phase 3.
- **Phase 3 must not** modify shared components. If a Phase 3 task wants to change a component, that's a Phase 4 — file a follow-up.
- **Phase 1 is locked.** Don't add token migrations to Phases 2 or 3 — codemod sweeps belong in their own plan.
