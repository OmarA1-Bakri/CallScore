     1|# Crypto-Tuber Ranked
     2|
     3|Crypto-Tuber Ranked is an accuracy tracker for crypto YouTubers — it scrapes their videos, extracts their price calls with LLMs, matches each call against historical 1-minute candles, and ranks creators by an alpha score. This repo is a single Next.js 14 app (App Router, TypeScript) with the public site under [src/app/](src/app/), serverless-style API routes under [src/app/api/](src/app/api/), shared logic under [src/lib/](src/lib/), and the scrape/extract/match/score pipeline as standalone scripts under [src/scripts/](src/scripts/). Production storage is HH VM PostgreSQL/pgsql (`DATABASE_URL`/`POSTGRES_*`); Neon is backup/legacy compatibility only. Production deploys are on Netlify ([netlify.toml](netlify.toml)); Vercel is deprecated.
     4|
     5|---
     6|
     7|## Hard rules — non-negotiable, no exceptions
     8|
     9|Violating any of these can cause real damage: lost data, broken trust, shipped-broken work. Always follow.
    10|
    11|### 1. Ask Before Destructive Commands
    12|
    13|Never run irreversible or shared-state-changing commands without explicit permission. State the exact command, why you want to run it, and wait for an OK.
    14|
    15|Always require confirmation:
    16|
    17|- `git push --force` / `--force-with-lease`
    18|- `git reset --hard`, `git clean -fd`, `git checkout -- .`
    19|- `git merge`, `git rebase`, `git cherry-pick` onto shared branches (`master`, `integrate/*`)
    20|- `git branch -D`, deleting remote branches (`git push origin :branch`)
    21|- `git commit --amend` on already-pushed commits
    22|- `git tag -d` / force-pushing tags
    23|- `rm -rf`, `DROP TABLE`, `TRUNCATE`, or any migration that destroys/rewrites rows in production pgsql or Neon backup/legacy data
    24|- Re-running pipeline scripts that overwrite production data: `compute-scores`, `match-prices`, `audit-recompute`, `backfill-*`, `reextract-low-confidence-videos`, `promote-creator-candidates` against the prod `DATABASE_URL`
    25|- Anything touching production: Netlify deploys/promotes, environment-variable changes, pgsql role/schema changes, Neon branch deletes, DNS, Resend sender setup
    26|- Spending API quota on third parties (Gemini, Ollama Cloud, Firecrawl, SerpAPI, Whop, Resend) when the run is large or open-ended
    27|- Publishing packages, posting to GitHub/Slack/email, or anything visible to others
    28|
    29|Safe by default: read-only commands (`git status`, `git diff`, `git log`), local builds, `npm test`, `npm run lint`, `npm run typecheck`, and edits inside the working tree.
    30|
    31|If unsure whether a command is destructive — ask.
    32|
    33|### 2. Verify Before Reporting Complete
    34|
    35|Before reporting any task as complete, verify it actually works:
    36|
    37|- Run the tests, execute the script against a local/test DB, check the output yourself.
    38|- TypeScript: run `npm run typecheck` (`tsc --noEmit`) and fix every type error.
    39|- Builds: run `npm run build` and confirm Next.js compiles without errors.
    40|- Lint: run `npm run lint` for changes that touch UI/route files.
    41|- For pages and components, prefer the existing `tests/page-*-shape.test.ts` and `tests/pages-cross-cutting.test.ts` patterns — these are how the design lock and accessibility guardrails are enforced.
    42|
    43|If you cannot verify (no test exists, can't run the code, no DB available), say so explicitly. Don't imply success.
    44|
    45|Report outcomes faithfully:
    46|
    47|- If tests fail, say so with the relevant output. Never claim "all tests pass" when output shows failures.
    48|- Never suppress, simplify, or skip a failing check (test, lint, type error) to manufacture a green result.
    49|- Never characterize incomplete or broken work as done.
    50|- When something did pass or work, state it plainly. Don't hedge confirmed results with disclaimers, and don't re-verify things you already checked.
    51|
    52|The goal is an accurate report, not a defensive one.
    53|
    54|### 3. Think Before Coding
    55|
    56|Don't assume. Don't hide confusion. Surface tradeoffs.
    57|
    58|Before implementing:
    59|
    60|- State your assumptions explicitly. If uncertain, ask.
    61|- If multiple interpretations exist, present them — don't pick silently.
    62|- If a simpler approach exists, say so. Push back when warranted.
    63|- If something is unclear, stop. Name what's confusing. Ask.
    64|
    65|Specific traps in this codebase to slow down on:
    66|
    67|- **Returns are stored as percent, not ratio.** `computeReturn` in [src/lib/scoring.ts](src/lib/scoring.ts) already multiplies ×100. Don't re-multiply when displaying `return_30d`, `avg_return`, etc.
    68|- **`creator_stats` is never cleared.** `compute-scores` writes but doesn't delete; creators with zero matched calls keep stale values. Confirm whether your change needs a clearing step.
    69|- **`candles.open_time` is `bigint` (ms), not a timestamp.** Pass raw millisecond numbers to queries — never `new Date(ms).toISOString()`. See [CRYPTOTUBER-FIXES.md](CRYPTOTUBER-FIXES.md) §1.
    70|- **Design is locked to the editorial-terminal direction** in [.new-FE-design/](.new-FE-design/) and [docs/frontend-design-spec.md](docs/frontend-design-spec.md). UI tests in [tests/pages-cross-cutting.test.ts](tests/pages-cross-cutting.test.ts), [tests/components-no-lucide-decoration.test.ts](tests/components-no-lucide-decoration.test.ts), and [tests/components-no-rounded.test.ts](tests/components-no-rounded.test.ts) enforce no-phosphor, no-rounded-chrome, single-h1. Don't fight them.
    71|
    72|---
    73|
    74|## Medium rules — engineering quality
    75|
    76|Apply these by default. Push back if the user asks for something that violates one — but they can override with reason.
    77|
    78|### 4. Simplicity First
    79|
    80|Minimum code that solves the problem. Nothing speculative.
    81|
    82|- No features beyond what was asked.
    83|- No abstractions for single-use code.
    84|- No "flexibility" or "configurability" that wasn't requested.
    85|- No error handling for impossible scenarios.
    86|- If you write 200 lines and it could be 50, rewrite it.
    87|
    88|Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.
    89|
    90|### 5. Surgical Changes
    91|
    92|Touch only what you must. Clean up only your own mess.
    93|
    94|When editing existing code:
    95|
    96|- Don't "improve" adjacent code, comments, or formatting.
    97|- Don't refactor things that aren't broken.
    98|- Match existing style, even if you'd do it differently.
    99|- If you notice unrelated dead code, mention it — don't delete it.
   100|
   101|Decision rule: for every change you're about to make, check whether it traces back to what the user actually asked for. If it does, make it. If it doesn't, leave the file alone and surface the observation instead.
   102|
   103|This matters extra here because the repo has multiple in-flight branches (`integrate/*`, `chore/page-*`) and a partially superseded design system. Drive-by edits to pages, components, or token files frequently re-trigger the cross-cutting guardrail tests.
   104|
   105|### 6. Goal-Driven Execution
   106|
   107|Define success criteria. Loop until verified.
   108|
   109|Transform tasks into verifiable goals:
   110|
   111|- `"Add validation"` → "Write tests for invalid extractions, then make them pass"
   112|- `"Fix the bug"` → "Write a test that reproduces it, then make it pass"
   113|- `"Refactor X"` → "Ensure `npm test` and `npm run typecheck` pass before and after"
   114|- `"Update the page"` → "Run the page-shape test for that route plus `pages-cross-cutting.test.ts` and confirm both green"
   115|
   116|For UI testing, use the gstack `/browse` skill (or Playwright MCP) to verify how the page actually renders against the design spec — code review alone can't judge visuals against [docs/frontend-design-spec.md](docs/frontend-design-spec.md).
   117|
   118|For multi-step tasks, state a brief plan:
   119|
   120|```
   121|1. [Step] → verify: [check]
   122|2. [Step] → verify: [check]
   123|3. [Step] → verify: [check]
   124|```
   125|
   126|Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
   127|
   128|### 7. Track Features as a Visible Task List
   129|
   130|§6 is about defining what done looks like. §2 is about verifying it. This section is about making progress legible to the user.
   131|
   132|For any multi-file feature, externalize the task list — use the TodoWrite tool, not your head. The user should be able to glance at the list and know exactly where you are.
   133|
   134|- Create one task per file or concrete unit of work, not one per phase.
   135|- Status changes are how you communicate position: `in_progress` when you start the file, `completed` when you leave it. Update them as you work, not in a batch at the end.
   136|- Only one task should be `in_progress` at a time. If you genuinely paused one to start another, say so.
   137|- Discovered work → a new task in the list, not silent scope creep on the current one.
   138|- Blocked → keep the task `in_progress` and post the blocker. Don't reassign yourself elsewhere without telling the user.
   139|- Stale list = lying. If a task no longer applies, delete it with a reason. No abandoned `pending` items at the end.
   140|
   141|If the user can't tell from the list what you've finished and what's left, the list is broken — fix it before continuing.
   142|
   143|### 8. Learn From Corrections
   144|
   145|Persistent lessons live in the auto-memory at `~/.claude/projects/c--Users-albak-xdev-CallScore/memory/` (indexed by [MEMORY.md](../../.claude/projects/c--Users-albak-xdev-CallScore/memory/MEMORY.md)). Read it at the start of every task and follow the gotchas/feedback entries already recorded.
   146|
   147|When the user corrects a mistake you made:
   148|
   149|1. Apply the correction.
   150|2. Save a memory (type `feedback` or `gotcha`) so the same mistake doesn't recur. Include the **Why** and **How to apply** lines per the memory schema.
   151|3. Show the user the new entry before continuing.
   152|
   153|---
   154|
   155|## Low priority — references and conveniences
   156|
   157|Useful context. Skim once, refer back as needed.
   158|
   159|### 9. Environment
   160|
   161|- Platform: Windows 11. Shell defaults to bash via this harness — use Unix paths and `/dev/null`, not `NUL`. PowerShell is also available when you genuinely need a Windows-only command.
   162|- Runtime: Node 20.x (see `engines` in [package.json](package.json)).
   163|- Scripts run via `tsx` (`node --import tsx ...`) — there is no separate build step for `src/scripts/*`.
   164|- Tests run via `node --test` with `tsx` — no Jest/Vitest. See `npm test` in [package.json](package.json).
   165|- Tools assumed available: `git`, `gh`, `node`, `npm`. Do not assume `bun`, `pnpm`, `ripgrep`, `fd`, or `sd` are installed; use the built-in Grep/Glob tools instead of shelling out.
   166|
   167|### 10. Running the project
   168|
   169|Single Next.js app. Discover commands instead of memorizing them:
   170|
   171|```bash
   172|npm run                                  # list every script in package.json
   173|ls src/scripts/                          # all pipeline + audit scripts
   174|ls migrations/                           # ordered SQL migrations
   175|```
   176|
   177|Standard flows:
   178|
   179|- **Dev server**: `npm run dev` (Next.js on `localhost:3000`)
   180|- **Typecheck / lint / test / build**: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
   181|- **DB migrate**: `npm run db:migrate` (reads files from [migrations/](migrations/))
   182|- **Pipeline**: use the current entrypoint guide in [docs/current-pipeline-entrypoints.md](docs/current-pipeline-entrypoints.md). Prefer `discover:videos → scrape:v2 → extract:llm → match → score → consensus`; `npm run scrape` / `npm run extract` are legacy compatibility paths.
   183|- **Audits**: `npm run audit:recompute`, `npm run audit:coverage`, `npm run audit:global`.
   184|
   185|Required environment (read from `.env.local` for dev; from Netlify/HH runtime env in prod):
   186|
   187|- `DATABASE_URL` / `POSTGRES_*` — production pgsql connection settings. Neon URLs are backup/legacy compatibility only. Pipeline scripts will hit whichever DB this points at; double-check before running anything mutating.
   188|- `GEMINI_API_KEY` / `OLLAMA_API_KEY` (or `OLLAMA_TOKEN`) — used by `extract-calls*` scripts. Use the canonical `extract:llm` path in `docs/current-pipeline-entrypoints.md`; openrouter scripts (see `src/scripts/extract-calls-openrouter.ts` and `tests/extract-calls-openrouter.test.ts`) are retained only for legacy compatibility/test flows.
   189|- `RESEND_API_KEY` — alerts and feedback emails.
   190|- Optional integrations: Whop (`WHOP_*`), Firecrawl, SerpAPI for global creator discovery.
   191|
   192|Do not commit `.env*` files or echo their contents into chat output.
   193|
   194|### 11. Further rules
   195|
   196|- [docs/frontend-design-spec.md](docs/frontend-design-spec.md) — the live design spec. The design lock previously called out in memory ("Design Lock B Terminal") is **superseded** by the editorial-terminal direction described here. When the two disagree, this spec wins.
   197|- [.new-FE-design/](.new-FE-design/) — current design system source of truth (tokens, mocks).
   198|- [CRYPTOTUBER-FIXES.md](CRYPTOTUBER-FIXES.md) — historical bug list; some items are fixed, some aren't. Treat as context, not a TODO.
   199|- [docs/](docs/) — research notes, methodology, and global-creator candidate workups. Many are scratch; check the date and whether they're referenced from `src/` before treating any one as canonical.
   200|- [.claude/](.claude/) — local Claude Code settings, scheduled tasks, and worktrees.
   201|- Auto-memory at `~/.claude/projects/c--Users-albak-xdev-CallScore/memory/` — gotchas, feedback, and project state that persist across sessions. Always check before assuming.
   202|