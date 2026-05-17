# Crypto-Tuber Ranked

Crypto-Tuber Ranked is an accuracy tracker for crypto YouTubers — it scrapes their videos, extracts their price calls with LLMs, matches each call against historical 1-minute candles, and ranks creators by an alpha score. This repo is a single Next.js 14 app (App Router, TypeScript) with the public site under [src/app/](src/app/), serverless-style API routes under [src/app/api/](src/app/api/), shared logic under [src/lib/](src/lib/), and the scrape/extract/match/score pipeline as standalone scripts under [src/scripts/](src/scripts/). Storage is Neon Postgres ([schema.sql](schema.sql) + [migrations/](migrations/)); deploys are on Vercel ([vercel.json](vercel.json)).

---

## Hard rules — non-negotiable, no exceptions

Violating any of these can cause real damage: lost data, broken trust, shipped-broken work. Always follow.

### 1. Ask Before Destructive Commands

Never run irreversible or shared-state-changing commands without explicit permission. State the exact command, why you want to run it, and wait for an OK.

Always require confirmation:

- `git push --force` / `--force-with-lease`
- `git reset --hard`, `git clean -fd`, `git checkout -- .`
- `git merge`, `git rebase`, `git cherry-pick` onto shared branches (`master`, `integrate/*`)
- `git branch -D`, deleting remote branches (`git push origin :branch`)
- `git commit --amend` on already-pushed commits
- `git tag -d` / force-pushing tags
- `rm -rf`, `DROP TABLE`, `TRUNCATE`, or any migration that destroys/rewrites rows in Neon
- Re-running pipeline scripts that overwrite production data: `compute-scores`, `match-prices`, `audit-recompute`, `backfill-*`, `reextract-low-confidence-videos`, `promote-creator-candidates` against the prod `DATABASE_URL`
- Anything touching production: Vercel deploys/promotes, environment-variable changes, Neon branch deletes, DNS, Resend sender setup
- Spending API quota on third parties (Gemini, Ollama Cloud, Firecrawl, SerpAPI, Whop, Resend) when the run is large or open-ended
- Publishing packages, posting to GitHub/Slack/email, or anything visible to others

Safe by default: read-only commands (`git status`, `git diff`, `git log`), local builds, `npm test`, `npm run lint`, `npm run typecheck`, and edits inside the working tree.

If unsure whether a command is destructive — ask.

### 2. Verify Before Reporting Complete

Before reporting any task as complete, verify it actually works:

- Run the tests, execute the script against a local/test DB, check the output yourself.
- TypeScript: run `npm run typecheck` (`tsc --noEmit`) and fix every type error.
- Builds: run `npm run build` and confirm Next.js compiles without errors.
- Lint: run `npm run lint` for changes that touch UI/route files.
- For pages and components, prefer the existing `tests/page-*-shape.test.ts` and `tests/pages-cross-cutting.test.ts` patterns — these are how the design lock and accessibility guardrails are enforced.

If you cannot verify (no test exists, can't run the code, no DB available), say so explicitly. Don't imply success.

Report outcomes faithfully:

- If tests fail, say so with the relevant output. Never claim "all tests pass" when output shows failures.
- Never suppress, simplify, or skip a failing check (test, lint, type error) to manufacture a green result.
- Never characterize incomplete or broken work as done.
- When something did pass or work, state it plainly. Don't hedge confirmed results with disclaimers, and don't re-verify things you already checked.

The goal is an accurate report, not a defensive one.

### 3. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

Specific traps in this codebase to slow down on:

- **Returns are stored as percent, not ratio.** `computeReturn` in [src/lib/scoring.ts](src/lib/scoring.ts) already multiplies ×100. Don't re-multiply when displaying `return_30d`, `avg_return`, etc.
- **`creator_stats` is never cleared.** `compute-scores` writes but doesn't delete; creators with zero matched calls keep stale values. Confirm whether your change needs a clearing step.
- **`candles.open_time` is `bigint` (ms), not a timestamp.** Pass raw millisecond numbers to queries — never `new Date(ms).toISOString()`. See [CRYPTOTUBER-FIXES.md](CRYPTOTUBER-FIXES.md) §1.
- **Design is locked to the editorial-terminal direction** in [.new-FE-design/](.new-FE-design/) and [docs/frontend-design-spec.md](docs/frontend-design-spec.md). UI tests in [tests/pages-cross-cutting.test.ts](tests/pages-cross-cutting.test.ts), [tests/components-no-lucide-decoration.test.ts](tests/components-no-lucide-decoration.test.ts), and [tests/components-no-rounded.test.ts](tests/components-no-rounded.test.ts) enforce no-phosphor, no-rounded-chrome, single-h1. Don't fight them.

---

## Medium rules — engineering quality

Apply these by default. Push back if the user asks for something that violates one — but they can override with reason.

### 4. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 5. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

Decision rule: for every change you're about to make, check whether it traces back to what the user actually asked for. If it does, make it. If it doesn't, leave the file alone and surface the observation instead.

This matters extra here because the repo has multiple in-flight branches (`integrate/*`, `chore/page-*`) and a partially superseded design system. Drive-by edits to pages, components, or token files frequently re-trigger the cross-cutting guardrail tests.

### 6. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- `"Add validation"` → "Write tests for invalid extractions, then make them pass"
- `"Fix the bug"` → "Write a test that reproduces it, then make it pass"
- `"Refactor X"` → "Ensure `npm test` and `npm run typecheck` pass before and after"
- `"Update the page"` → "Run the page-shape test for that route plus `pages-cross-cutting.test.ts` and confirm both green"

For UI testing, use the gstack `/browse` skill (or Playwright MCP) to verify how the page actually renders against the design spec — code review alone can't judge visuals against [docs/frontend-design-spec.md](docs/frontend-design-spec.md).

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

### 7. Track Features as a Visible Task List

§6 is about defining what done looks like. §2 is about verifying it. This section is about making progress legible to the user.

For any multi-file feature, externalize the task list — use the TodoWrite tool, not your head. The user should be able to glance at the list and know exactly where you are.

- Create one task per file or concrete unit of work, not one per phase.
- Status changes are how you communicate position: `in_progress` when you start the file, `completed` when you leave it. Update them as you work, not in a batch at the end.
- Only one task should be `in_progress` at a time. If you genuinely paused one to start another, say so.
- Discovered work → a new task in the list, not silent scope creep on the current one.
- Blocked → keep the task `in_progress` and post the blocker. Don't reassign yourself elsewhere without telling the user.
- Stale list = lying. If a task no longer applies, delete it with a reason. No abandoned `pending` items at the end.

If the user can't tell from the list what you've finished and what's left, the list is broken — fix it before continuing.

### 8. Learn From Corrections

Persistent lessons live in the auto-memory at `~/.claude/projects/c--Users-albak-xdev-crypto-tuber-ranked/memory/` (indexed by [MEMORY.md](../../.claude/projects/c--Users-albak-xdev-crypto-tuber-ranked/memory/MEMORY.md)). Read it at the start of every task and follow the gotchas/feedback entries already recorded.

When the user corrects a mistake you made:

1. Apply the correction.
2. Save a memory (type `feedback` or `gotcha`) so the same mistake doesn't recur. Include the **Why** and **How to apply** lines per the memory schema.
3. Show the user the new entry before continuing.

---

## Low priority — references and conveniences

Useful context. Skim once, refer back as needed.

### 9. Environment

- Platform: Windows 11. Shell defaults to bash via this harness — use Unix paths and `/dev/null`, not `NUL`. PowerShell is also available when you genuinely need a Windows-only command.
- Runtime: Node 20.x (see `engines` in [package.json](package.json)).
- Scripts run via `tsx` (`node --import tsx ...`) — there is no separate build step for `src/scripts/*`.
- Tests run via `node --test` with `tsx` — no Jest/Vitest. See `npm test` in [package.json](package.json).
- Tools assumed available: `git`, `gh`, `node`, `npm`. Do not assume `bun`, `pnpm`, `ripgrep`, `fd`, or `sd` are installed; use the built-in Grep/Glob tools instead of shelling out.

### 10. Running the project

Single Next.js app. Discover commands instead of memorizing them:

```bash
npm run                                  # list every script in package.json
ls src/scripts/                          # all pipeline + audit scripts
ls migrations/                           # ordered SQL migrations
```

Standard flows:

- **Dev server**: `npm run dev` (Next.js on `localhost:3000`)
- **Typecheck / lint / test / build**: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
- **DB migrate**: `npm run db:migrate` (reads files from [migrations/](migrations/))
- **Pipeline**: use the current entrypoint guide in [docs/current-pipeline-entrypoints.md](docs/current-pipeline-entrypoints.md). Prefer `discover:videos → scrape:v2 → extract:llm → match → score → consensus`; `npm run scrape` / `npm run extract` are legacy compatibility paths.
- **Audits**: `npm run audit:recompute`, `npm run audit:coverage`, `npm run audit:global`.

Required environment (read from `.env.local` for dev; from Vercel env in prod):

- `DATABASE_URL` — Neon Postgres connection string. Pipeline scripts will hit whichever DB this points at; double-check before running anything mutating.
- `GEMINI_API_KEY` / `OLLAMA_API_KEY` (or `OLLAMA_TOKEN`) — used by `extract-calls*` scripts. Ollama Cloud is the default LLM provider. OpenRouter scripts (see `src/scripts/extract-calls-openrouter.ts` and `tests/extract-calls-openrouter.test.ts`) are retained for compatibility with legacy extraction/test flows but are deprecated and not the primary path.
- `RESEND_API_KEY` — alerts and feedback emails.
- Optional integrations: Whop (`WHOP_*`), Firecrawl, SerpAPI for global creator discovery.

Do not commit `.env*` files or echo their contents into chat output.

### 11. Further rules

- [docs/frontend-design-spec.md](docs/frontend-design-spec.md) — the live design spec. The design lock previously called out in memory ("Design Lock B Terminal") is **superseded** by the editorial-terminal direction described here. When the two disagree, this spec wins.
- [.new-FE-design/](.new-FE-design/) — current design system source of truth (tokens, mocks).
- [CRYPTOTUBER-FIXES.md](CRYPTOTUBER-FIXES.md) — historical bug list; some items are fixed, some aren't. Treat as context, not a TODO.
- [docs/](docs/) — research notes, methodology, and global-creator candidate workups. Many are scratch; check the date and whether they're referenced from `src/` before treating any one as canonical.
- [.claude/](.claude/) — local Claude Code settings, scheduled tasks, and worktrees.
- Auto-memory at `~/.claude/projects/c--Users-albak-xdev-crypto-tuber-ranked/memory/` — gotchas, feedback, and project state that persist across sessions. Always check before assuming.
