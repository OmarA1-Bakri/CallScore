# CallScore Canonical Green Remediation Plan

> **For Hermes:** Use task-router → writing-plans → kanban-orchestrator → test-driven-development → subagent-driven-development. Parent must verify all outputs directly.

**Goal:** Make CallScore canonical-green: 44 live agents schema-valid, authority-routed, tested, docs/skills/kanban aligned, and full gates passing.

**Architecture:** Keep O13 8-lane LangGraph operating graph. Fix the agent layer beneath it: live souls YAML must satisfy `ChannelHeadSoulsSchema`, all 44 YAML `agent_id`s must resolve through `routeDecision()`, and stale operational sources must stop misleading future sessions.

**Tech Stack:** TypeScript, Node test runner, Zod, LangGraph, Hermes Kanban, YAML docs, local HH runtime.

---

## Task Router Analysis

**Categories:** testing, backend, devops, documentation, observability/security gates
**Complexity:** High
**Execution machine:** HH Linux, repo `/opt/crypto-tuber-ranked`
**Primary skills:** test-driven-development, systematic-debugging, subagent-driven-development, kanban-orchestrator, parent-verification-of-agent-output
**Supporting skills:** github-operations, callscore-system-activation, callscore-autopilot, workplane-status

Library check:
- `kanban` found `kanban-orchestrator`, `kanban-worker`, `kanban-codex-lane`.
- no more specific `CallScore canonical green` entry found.

## Hard Constraints

- No DB writes except tests that only use fixtures/local temp state.
- No deploys.
- No service restarts unless explicitly needed and separately verified safe.
- No Whop/provider/customer/payment/public posting/email/DM mutations.
- No secrets printed.
- Live repo/files/tests/processes win over memory and skills.
- TDD for code/schema behavior: RED first, then GREEN.
- Parent verification required before final status.

## Required Tasks

### T0 — RED: Add canonical green regression tests

**Objective:** Prove current failures before fixing.

**Files:**
- Modify: `tests/action-authority.test.ts`
- Modify: `tests/decision-router.test.ts`
- Create or modify: nearest validation test for `ChannelHeadSoulsSchema` (prefer existing validation/ops test if present)

**Tests to add:**
1. Parse `docs/ops/callscore-channel-head-souls.yaml`; every agent validates with `ChannelHeadSoulsSchema`.
2. Every live `agent_id` has non-empty `authorityForAgent(agent_id)`.
3. Every live `agent_id` routed through `routeDecision()` does not include `unknown_agent_not_authorized`.

**RED commands:**
```bash
node --import tsx --test tests/action-authority.test.ts tests/decision-router.test.ts
node --import tsx --test <new-or-existing-souls-validation-test>
```
Expected before fixes: fail on 9 unknown authorities and 26 missing `memory_policy` / 8 missing `taste`.

### T1 — GREEN: Fix authority routing for all 44 live agents

**Objective:** Make all live `agent_id`s resolve to existing authority tiers without adding new tiers/handlers.

**Files:**
- Modify: `src/lib/autonomy/action-authority.ts`

**Likely fix:** Extend `inferClass()` known-pattern mapping and/or `AGENT_OVERRIDES` for these 9 IDs:
- `callscore-gemma-transcript-head` → `transcript_shadow`
- `callscore-channel-agent-worker-head` → `runtime_worker`
- `callscore-transcript-scraper-head` → `pipeline_scraper`
- `callscore-llm-extractor-head` → `pipeline_extractor`
- `callscore-price-matcher-head` → `pipeline_matcher`
- `callscore-consensus-head` → `pipeline_consensus`
- `callscore-ml-verifier-head` → `pipeline_verifier`
- `callscore-candle-refresher-head` → `pipeline_refresher`
- `callscore-candidate-admission-head` → `pipeline_admission`

**GREEN commands:**
```bash
node --import tsx --test tests/action-authority.test.ts tests/decision-router.test.ts
```

### T2 — GREEN: Make souls YAML satisfy Zod schema

**Objective:** Fill missing six-dimension fields, not weaken schema.

**Files:**
- Modify: `docs/ops/callscore-channel-head-souls.yaml`

**Required updates:**
- Add `soul.memory_policy` to 26 agents missing it.
- Add `soul.taste` to 8 control/runtime agents missing it.
- Keep bounded authority and gates intact.
- No new agents; count remains 44.

**GREEN commands:**
```bash
node --import tsx --test <souls-validation-test>
node --import tsx src/scripts/callscore-full-system-test.ts
```

### T3 — Sync live operational truth docs and skills

**Objective:** Remove stale instructions that can cause future wrong activation.

**Repo files to update:**
- `docs/ops/callscore-autonomy-upgrade-status.md`
- `docs/plans/2026-06-25-authority-based-decision-router.md`
- `docs/ops/callscore-full-autonomy-heartbeat-contract.md`
- `docs/hermes/FULL_AUTONOMOUS_BOUNDED_OWNED_GTM_RECEIPT.md`
- `docs/ops/callscore-gtm-agent-registry.json` / `.md` only if scope stays non-provider, docs-only, and clear that registry is lane-level vs 44-agent souls-level

**Hermes skill files to patch with `skill_manage`:**
- `callscore-autopilot/references/session-hooks-and-two-worker-topology.md`
- `callscore-startup/references/post-commit-verification.md`
- stale Neon/old repo references in creator-pipeline skills

**Verification:**
```bash
grep -R "26 agents\|26 souls\|16 agents\|8 agents\|8 channel heads\|834 / 838\|928 tests\|924+\|Neon Postgres" -n docs /srv/agents/hermes/skills 2>/dev/null | sed -n '1,240p'
```
Classify remaining historical mentions explicitly.

### T4 — Kanban/profile state reconciliation

**Objective:** Stop Kanban/profile artifacts from contradicting current O13/44-agent truth.

**Files/commands:**
- Inspect boards read-only first:
  - `/srv/agents/hermes/kanban/boards/callscore-autonomy-20260621/kanban.db`
  - `/srv/agents/hermes/kanban/boards/callscore-operating-graph-20260625/kanban.db`
- If corrupt/stale, archive or mark historical using Hermes kanban CLI, not raw sqlite mutation unless CLI cannot read.
- Add a current status receipt under repo docs if needed.

**Verification:**
```bash
hermes profile list
hermes kanban boards list
hermes kanban --board callscore-operating-graph-20260625 list
```

### T5 — Full parent verification

**Objective:** Prove canonical green from live system.

**Commands:**
```bash
git diff --check
npm run typecheck
npm run build
node --import tsx --test tests/ops-coverage.test.ts
node --import tsx --test tests/anti-over-governance.test.ts tests/action-authority.test.ts tests/decision-router.test.ts
node --import tsx src/scripts/callscore-full-system-test.ts
npm test
docker ps --filter label=com.docker.compose.project.config_files=/opt/crypto-tuber-ranked/docker-compose.yml --format '{{.Names}} {{.Label "com.docker.compose.service"}} {{.Status}}'
bash -lc 'set -a; source .env.hermes >/dev/null 2>&1; set +a; npm run workplane:status'
bash -lc 'set -a; source .env.hermes >/dev/null 2>&1; set +a; npm run freshness:check'
```

**Acceptance:**
- 44 agents, 44 unique.
- `ChannelHeadSoulsSchema` validates live YAML.
- `authorityForAgent()` non-empty for all 44 live IDs.
- `routeDecision()` has zero `unknown_agent_not_authorized` for all 44 live IDs.
- Full tests pass 1058/1058 or updated actual live count with zero failures.
- Full system 17/17.
- Typecheck/build pass.
- Runtime workers up: data-pipeline worker + channel-agent worker.
- Stale docs/skills either fixed or explicitly marked historical.
- Final commit made.

## Commit Plan

1. Commit this plan.
2. Create Kanban board/tasks.
3. Execute T0-T5.
4. Commit implementation/docs/skill-sync changes.
5. Parent final verification.
