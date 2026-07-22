# CallScore Runtime Drift, Ingestion, and CMO Recovery Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Replace stale Workplane model labels with the live Qwen3 contract, preserve and quarantine the mixed dirty tree, recover the nine classified transcript failures through canonical ingestion paths, and prove CMO candidates remain fail-closed until all canonical gates pass.

**Architecture:** Make minimum-diff, test-first changes around canonical status/diagnostic surfaces; do not rename durable legacy artifacts without a compatibility reader. Preserve the current mixed worktree as a hash-manifested, recoverable stash before changing source. Route any ingestion state change through the existing Workplane/LangGraph/worker path and treat CMO gate failures as blockers to repair or receipt-backed decisions, never as permission to bypass gates.

**Tech Stack:** TypeScript/Node 22, Node test runner, LangGraph, Zod, PostgreSQL read-only diagnostics, Docker Compose, yt-dlp/EJS/WPC, Hermes Kanban and receipts.

---

## Task routing

**Categories:** backend, data/ETL, ML runtime, testing, DevOps, observability, security/governance.

**Primary skills:** `callscore-canonical-runtime`, `devops/workplane-diagnostics`, `software-development/systematic-debugging`, `software-development/test-driven-development`, `github/committing-user-work-safely`.

**Supporting skills:** `data-pipeline`, `software-development/subagent-driven-development`, `software-development/parent-verification-of-agent-output`, `mcp/codebase-memory-mcp`.

**External-tool decision:** Composio/YouTube read tools are available as a diagnostic fallback, but CallScore's canonical ingestion recovery remains its own Workplane/LangGraph worker path. No direct provider write, public publish, outreach, spend, DB shell write, deploy, or infrastructure mutation is authorised by this plan.

## Live preflight facts

- Host: `hermes-agent-box`; Tailscale reachable to `omarslaptop-1`.
- H: drive: not mounted on this Linux host; not required for the HH fixes.
- Repo: `/opt/crypto-tuber-ranked`, branch `master`, pre-plan HEAD `a8f2194`.
- Dirty state: 48 tracked files plus untracked source/tests spanning multiple unrelated concerns.
- Live Ollama model: `qwen3:4b-instruct-2507-q4_K_M` only.
- Host yt-dlp: `2026.03.17`; host Python lacks `yt_dlp_ejs` and `curl_cffi`.
- Worker image contract: yt-dlp `2026.6.9`, `yt-dlp[default]`, EJS, WPC and bgutil provider plugins, Node runtime, Chromium.
- Compose worker contract already supplies `YTDLP_JS_RUNTIMES=node` and `YTDLP_REMOTE_COMPONENTS=1`.
- Canonical runtime: 51 agents/souls.

## Hard constraints

- Preserve all unrelated dirty work; no reset, clean, checkout-discard, or blind WIP commit.
- Never print or commit secrets, cookies, tokens, `.env.hermes`, or provider payloads.
- No direct SQL updates. Any transcript state mutation must be graph/worker-owned and receipted.
- No direct parent provider/public call. CMO candidates remain blocked unless canonical receipt, originality, media-v2, quality, cooldown, provider, rollback, and readback gates pass.
- Do not loosen canonical originality threshold or media receipt requirements.
- Public visual/media evidence must use website-alignment v2, branding v2, lockup-occlusion v1, and media-artifact v2.
- Preserve compatibility for historical Gemma-labelled artifacts, but do not expose Gemma/Qwen2.5 as the current Workplane contract.
- TDD is mandatory for source behaviour changes.

---

### Task 1: Preserve and clean the mixed working tree

**Objective:** Produce an immutable recovery bundle and labelled stash so the canonical checkout is clean without discarding or silently committing unrelated work.

**Files:**
- Create outside repo: `/srv/agents/hermes/profiles/callscore/artifacts/dirty-tree-quarantine/<UTC>/status.txt`
- Create outside repo: `/srv/agents/hermes/profiles/callscore/artifacts/dirty-tree-quarantine/<UTC>/tracked.patch`
- Create outside repo: `/srv/agents/hermes/profiles/callscore/artifacts/dirty-tree-quarantine/<UTC>/untracked-files.txt`
- Create outside repo: `/srv/agents/hermes/profiles/callscore/artifacts/dirty-tree-quarantine/<UTC>/untracked.tar.gz`
- Create outside repo: `/srv/agents/hermes/profiles/callscore/artifacts/dirty-tree-quarantine/<UTC>/sha256sums.txt`
- Create outside repo: `/srv/agents/hermes/profiles/callscore/artifacts/dirty-tree-quarantine/<UTC>/secret-scan.txt`

**Steps:**
1. Capture branch, HEAD, remotes, `git status --short`, `git diff --stat`, tracked patch, and untracked list.
2. Scan tracked patch and untracked text files for private keys, credential assignments, cookies, bearer tokens, and `.env` material without printing values.
3. Archive untracked files with exact relative paths.
4. Hash every recovery artifact.
5. Create labelled stash including untracked files: `pre-callscore-runtime-recovery-<UTC>`.
6. Verify `git status --short` is empty and the stash plus recovery bundle can reconstruct the pre-task tree.

**Acceptance:** clean repo; no file discarded; no secret value emitted; recovery bundle and stash identifier recorded.

---

### Task 2: Replace Workplane's stale model contract using TDD

**Objective:** Make live Workplane status describe the canonical Qwen3 local model while retaining explicitly labelled compatibility reads for historical Gemma artifacts.

**Files:**
- Modify: `tests/workplane-jobs.test.ts`
- Create or modify: `tests/workplane-qwen3-contract.test.ts`
- Modify: `src/lib/workplane-status.ts`
- Modify: `src/scripts/workplane-status.ts`
- Modify: `src/scripts/gemma-capacity-preflight.ts`
- Modify: `package.json`

**RED steps:**
1. Add a test asserting serialized Workplane status exposes `qwen3:4b-instruct-2507-q4_K_M` as the current model.
2. Add separate tests asserting current status keys/domain labels/action text contain no live `Gemma4`, `Qwen2.5`, or `qwen25` recommendation.
3. Add a compatibility test proving a historical Gemma receipt can still be read but is marked historical/legacy rather than current.
4. Run: `node --import tsx --test tests/workplane-jobs.test.ts tests/workplane-qwen3-contract.test.ts`.
5. Expected RED: stale Gemma-named fields/actions and Gemma4 default capacity model violate the new contract.

**GREEN steps:**
1. Introduce one exported canonical local-model contract constant using exact model `qwen3:4b-instruct-2507-q4_K_M`.
2. Expose current fields/domains as local-model/Qwen3 labels; keep deprecated aliases only where required for historical artifact reading.
3. Change capacity preflight default, receipt wording, next action, and current npm command to model-neutral/Qwen3 terminology. Keep the old npm alias as an explicit compatibility alias if tests or operators still invoke it.
4. Ensure Workplane action/reason/capability text says Qwen3, not Gemma/Qwen2.5.
5. Run focused tests, `npm run typecheck`, and the Workplane live status command.
6. Machine-check the resulting JSON for exact Qwen3 model and absence of stale live labels.

**Acceptance:** focused tests green; typecheck green; live status names the exact Qwen3 model; historical artifacts remain readable; no production-default or provider mutation occurs.

---

### Task 3: Diagnose and recover the nine transcript failures

**Objective:** Isolate the six bot-verification and three JS-runtime rows, prove the runtime divergence, and retry only through the canonical bounded worker path after a one-video canary passes.

**Files:**
- Modify if needed: `tests/transcript-extraction-methods.test.ts`
- Modify if needed: `tests/data-pipeline.test.ts`
- Modify if needed: `src/lib/transcript-extraction-methods.ts`
- Modify if needed: `src/scripts/backfill-transcripts.ts`
- Create if needed: `src/scripts/callscore-ytdlp-runtime-doctor.ts`
- Modify if needed: `Dockerfile.hermes`
- Modify if needed: `docker-compose.yml`
- Write receipts under: `.tmp/workflow-receipts/transcript_runtime_recovery/`

**Diagnostic steps:**
1. Run read-only SQL to list exact video IDs, providers, attempt timestamps, and error classes for the nine rows.
2. Compare host, isolated yt-dlp runtime, and running worker-container versions/capabilities.
3. Verify WPC provider health and selected method/binary without logging cookies/tokens.
4. Reproduce one representative JS-runtime row and one bot-verification row in no-write, one-video mode.

**RED/GREEN steps:**
1. If the selected production method can fall back to host `2026.03.17` or omit explicit Node/EJS/WPC args, add a failing regression for that exact seam.
2. Apply the smallest fix so `hh_ytdlp_ejs_wpc` selects the current EJS-capable runtime and emits Node/WPC/remote-component args with redacted diagnostics.
3. Run: `node --import tsx --test tests/transcript-extraction-methods.test.ts tests/data-pipeline.test.ts`.
4. Run one-video no-write canary for each failure class.
5. Only after canary success, enqueue/retry a bounded maximum of nine rows through Workplane/LangGraph/worker ownership. Do not issue direct SQL updates.
6. Re-run read-only classification and `npm run freshness:check`.

**Acceptance:** JS-runtime failures are zero for the retried cohort; bot-verification rows either recover or have an exact current WPC/cookie/provider blocker receipt; fresh-call ingestion remains active; no blind 25-video catch-up.

---

### Task 4: Verify and repair CMO candidate gate ownership

**Objective:** Ensure the newest X and LinkedIn candidates are truthfully classified by originality, canonical operational-package, media-v2, quality, and cooldown gates.

**Files/artifacts:**
- Read newest packages under `/srv/agents/hermes/profiles/callscore/orchestrators/cmo-live-owned-public/`.
- Use: `src/scripts/callscore-evaluate-canonical-package.ts`.
- Modify only if a code defect is reproduced: `src/lib/autonomy/canonical-operational-runtime.ts` and its focused tests.
- Write receipt: `/srv/agents/hermes/profiles/callscore/receipts/cmo-gate-recovery/<UTC>.json`.

**Steps:**
1. Resolve newest eligible full-channel candidate, not merely newest filename/mtime.
2. Recompute payload and artifact hashes.
3. Evaluate required receipts: editorial angle, platform fit, visual brief, visual QA, copy-visual coherence, same-shit memory, design bundle, website alignment v2, branding v2, lockup occlusion v1, media artifact v2.
4. Verify copy quality and strict originality threshold separately.
5. Verify cooldown using current receipt time, not historical report text.
6. If a validator/selection bug is found, write one RED test per behaviour, apply minimum fix, rerun adjacent graph/provider tests.
7. If the candidate itself is missing owner receipts, keep it blocked and re-arm the canonical specialist lane; do not parent-create receipts or publish.

**Acceptance:** each channel has a receipt-backed `approved`, `cooldown`, or exact blocker decision; no diagnostic-only candidate is described as publish-ready; no gate is weakened and no public mutation is performed by this maintenance task.

---

### Task 5: Integration verification and three-agent review

**Objective:** Prove the focused changes integrate with Workplane, ingestion, and CMO safety boundaries.

**Commands:**
- `git diff --check`
- `npm run typecheck`
- `node --import tsx --test tests/workplane-jobs.test.ts tests/workplane-qwen3-contract.test.ts`
- `node --import tsx --test tests/transcript-extraction-methods.test.ts tests/data-pipeline.test.ts`
- `node --import tsx --test tests/canonical-operational-runtime.test.ts tests/content-quality-gate-regression.test.ts tests/copy-originality-gate.test.ts`
- `npm test`
- `npm run workplane:status`
- `npm run freshness:check`
- `/usr/bin/python3 /srv/agents/hermes/scripts/callscore-canonical-agent-audit.py`

**Review lanes:**
1. Spec/contract reviewer: plan coverage and exact acceptance evidence.
2. Code/implementation reviewer: source, tests, compatibility and integration seams.
3. Security/risk reviewer: secrets, DB/provider/public mutation boundaries, receipt truthfulness.

**Acceptance:** all three review lanes PASS after remediation; parent reruns the commands and reads durable receipts directly.

---

### Task 6: Commit focused fixes and close with receipts

**Objective:** Leave a clean, reviewable repository and durable evidence.

**Steps:**
1. Commit Workplane model-contract changes separately from any ingestion code change.
2. Keep CMO receipt-only output outside source commits unless a validator defect required source/test changes.
3. Re-index codebase-memory after commits.
4. Verify branch/HEAD/status/stash/recovery bundle.
5. Write a final maintenance receipt with mutation flags and unresolved external blockers.

**Acceptance:** `git status --short` empty; unrelated work recoverable from named stash and hash-manifested bundle; focused commits have green tests; no unsupported success claim.
