# CallScore System Stabilization Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Bring the live CallScore/Hermes/Workplane system back into alignment with the intended architecture without destructive cleanup, production deploys, DB writes outside approved pipeline scripts, provider mutations, or secret exposure.

**Architecture:** HHVM remains canonical for DB, scoring, candles, orchestration, Workplane, Gemma/Ollama, and public surface. OmarLaptop remains the residential transcript acquisition lane. Workplane is the command rail; named subagents/workflows are the workforce; gates/receipts/rollback protect mutations.

**Tech Stack:** Node/TypeScript, PowerShell laptop collector, HH PostgreSQL, systemd, Docker, Workplane, Hermes, Ollama/Gemma, Netlify public surface.

---

## Task Router Classification

Categories: devops, data, backend, ml, security, testing, documentation, crypto, observability.
Complexity: High.
Execution mode: continue-to-end for verified safe local docs/code/test fixes; fail-closed for production deploys, DB writes outside approved scripts, Whop/provider/customer/payment mutations, paid spend, credential changes, service restarts, destructive cleanup.

Primary skills:
- `callscore-autopilot`
- `workplane-status`
- `systematic-debugging`
- `subagent-driven-development`
- `writing-plans`
- `parent-verification-of-agent-output`
- `docker-management`

Supporting skills:
- `crypto-tuber-ranked-creator-pipeline`
- `github-operations`
- `committing-user-work-safely`
- `agent-memory-vault`
- `headroom`

## Current Live Facts Verified 2026-06-18

- `/opt/crypto-tuber-ranked` is active repo, branch `master`, HEAD `cc4371c`, tracked tree initially clean.
- HH Control Bridge active at `127.0.0.1:8787`; `/mcp` works with MCP Accept headers; `8811` not active.
- Netlify is the customer-facing public surface, backed by HH Read API / HH PostgreSQL as production truth.
- `callscore-daily-pipeline.timer` active; service uses `.env.hermes` and `npm run pipeline:daily -- --write ...`. HH direct `yt-dlp` is currently functioning but remains classified as fallback/diagnostic relative to the intended OmarLaptop residential transcript lane until the pipeline ledger explicitly approves otherwise.
- Workplane `status=OK`, `automation_readiness=CONTROLLED_FULL`.
- Public verify live passes against `https://call-score.com` with HH read API and 36 leaderboard rows.
- Core data path works: candle refresh, match prices, compute scores succeeded; candles latest `2026-06-18 15:45:00+01`.
- Transcript lane is degraded but not core-failed: backlog remains; HH yt-dlp daily updated 21 and failed 4 no-captions in latest checked run; laptop lane is still important.
- Gemma/Ollama is HH-local and available on `127.0.0.1:11434`; `callscore-gemma4-extractor:latest` exists.
- Two host cloudflared processes plus one Docker cloudflared tunnel are present; this is drift risk only until classified.
- Canonical laptop collector lacks the requested `-SshTransport native|wsl` mode.

---

## Task 1: Parent live health receipt

**Objective:** Capture a safe, no-secret evidence packet showing what is working and what remains degraded.

**Files:**
- Create: `.tmp/workflow-receipts/system_stabilization/<run-id>.json`

**Steps:**
1. Source `.env.hermes` without printing values.
2. Run `npm run workplane:status`, `npm run freshness:check`, `npm run verify:public -- --source live --base-url https://call-score.com`.
3. Query recent `pipeline_runs` and candle/call/transcript counts using `psql`, printing only counts/status/metrics.
4. Record bridge/service/Docker health with restricted no-secret commands only: no bridge write tools, no `docker inspect` environment dumps, no broad service logs, no credential-bearing process args, no `/srv/whop-auto/secrets` traversal.
5. Treat cloudflared duplicate processes as `classify_before_cleanup`; do not restart/kill/reconfigure them.

**Verification:**
- Receipt JSON validates with `python3 -m json.tool`.
- No secret-like strings are present in the receipt.

## Task 2: Add WSL SSH transport support to laptop collector

**Objective:** Make the canonical Windows laptop collector support both native Windows OpenSSH and WSL SSH transport, matching the intended OmarLaptop architecture without replacing the current script.

**Files:**
- Modify: `scripts/windows/run-transcript-collector.ps1`
- Modify: `tests/laptop-collector-script.test.ts`

**Required behavior:**
- Add parameter: `[ValidateSet("native", "wsl")][string]$SshTransport = "native"`.
- Add parameter: `[string]$WslDistro = "Ubuntu"`.
- Add parameter: `[string]$WslUser = "omar"`.
- Native mode keeps current `ssh` / `scp` behavior.
- WSL mode invokes `wsl.exe -d $WslDistro -u $WslUser ssh ...` and `wsl.exe -d $WslDistro -u $WslUser scp ...`.
- Preserve `BatchMode=yes`, `StrictHostKeyChecking=accept-new`, `-i`, `-p`, and `-P` behavior.
- Error messages must include transport mode and not include secret values.
- Do not change transcript limits, Workplane semantics, ingestion behavior, cooldown behavior, or failure classification.

**TDD steps:**
1. Add static tests asserting new parameters and WSL command construction exist.
2. Run `node --import tsx --test tests/laptop-collector-script.test.ts`; expected pre-implementation failure if tests are added first.
3. Implement minimal transport abstraction.
4. Rerun `node --import tsx --test tests/laptop-collector-script.test.ts`; expected pass.
5. Run adjacent tests: `node --import tsx --test tests/transcript-extraction-methods.test.ts tests/workplane-dispatch.test.ts tests/workplane-jobs.test.ts`.
6. Run `npm run typecheck`.

## Task 3: Add first-pass system index and drift ledger

**Objective:** Preserve the verified system map and mark migration/cleanup status without creating a new repo or copying files.

**Files:**
- Create: `docs/system-index/system-map.md`
- Create: `docs/system-index/directory-ledger.yaml`
- Create: `docs/system-index/service-ledger.yaml`
- Create: `docs/system-index/pipeline-ledger.yaml`
- Create: `docs/system-index/migration-ledger.yaml`
- Create: `docs/system-index/verification-ledger.yaml`

**Required content:**
- Classify `/opt/crypto-tuber-ranked`, `/srv/whop-auto`, `/srv/agents/repos/Claude_Code_Automations`, `/srv/agents/hh-control-bridge`, systemd units, Docker containers, Tailscale/cloudflared, laptop transcript lane, Gemma/Ollama lane.
- Each item includes path, plane, role, entry points, initiated by, connects to, reads, writes, mutation risk, secrets risk, owner/subagent, current status, tests, receipts, rollback path, migration status, approved_for_inclusion=false unless explicitly proven.
- Cloudflared duplicate process drift must be documented as `classify_before_cleanup`.
- `.tmp` must be marked as evidence-bearing; never delete wholesale.

**Verification:**
- YAML parses with Python/PyYAML if available or Ruby/Python fallback; otherwise use lightweight syntax checks.
- Docs contain no env values, DB URLs, tokens, cookies, or private keys.

## Task 4: Run three-reviewer validation

**Objective:** Validate the plan/implementation through independent lenses before declaring the system fixed.

**Reviewers:**
1. Spec/contract reviewer: checks against intended architecture and old handover claims.
2. Pipeline/code reviewer: checks data pipeline, laptop collector, tests, Workplane/Gemma assumptions.
3. Security/risk reviewer: checks secrets, destructive actions, provider gates, cloudflared drift, migration safety.

**Verification:**
- Parent session reads reviewer summaries.
- Parent verifies claims directly with commands/files.
- Any critical/important gaps are fixed or explicitly classified as gated/unresolved.

## Task 5: Final parent verification

**Objective:** Prove the system is working the way it is meant to work after safe fixes.

**Commands:**
```bash
git diff --check
node --import tsx --test tests/laptop-collector-script.test.ts tests/transcript-extraction-methods.test.ts tests/workplane-dispatch.test.ts tests/workplane-jobs.test.ts
npm run typecheck
set -a; . ./.env.hermes >/dev/null 2>&1; set +a
npm run workplane:status
npm run freshness:check
npm run verify:public -- --source live --base-url https://call-score.com
python3 -m json.tool docs/ops/callscore-gtm-agent-registry.json >/tmp/callscore-gtm-agent-registry.session-final.validated.json
node --import tsx --test tests/gtm-agent-registry.test.ts
```

**Completion criteria:**
- Core production health remains OK/CONTROLLED_FULL.
- Public site verification passes.
- Core data path has recent successful candle/match/score evidence.
- Laptop collector supports intended native/WSL SSH modes and tests pass.
- System index exists and marks cleanup/migration as unapproved until tested.
- No restricted production mutations were performed.
