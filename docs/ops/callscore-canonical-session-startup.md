# CallScore Canonical Session Startup

Date: 2026-06-15
Status: canonical startup protocol for future Hermes sessions on HH/default profile

This document is the standard boot checklist for CallScore / Hermes / Art of War / Whop Auto sessions. It exists so future sessions start from the same canonical evidence instead of rediscovering ownership, gates, skills, or runtime posture.

## Standard skill bundle

Preferred slash command in interactive Hermes sessions:

```text
/callscore-standard
```

Bundle file:

```text
/srv/agents/hermes/skill-bundles/callscore-standard.yaml
```

The bundle loads:

- `callscore-autopilot` — CallScore resume, Workplane, GTM registry, gates, receipts.
- `workplane-status` — runtime/readiness/status model.
- `task-router` — route tasks to skills/plugins/agents.
- `headroom` — context compression/retrieval operating rules.
- `agent-memory-vault` — agentmemory / durable memory-vault workflow.
- `github-operations` — GitHub/PR/CI state without inventing remote facts.
- `committing-user-work-safely` — protect repo history and dirty worktrees.

Alias bundle:

```text
/agentmemory
```

This loads `agent-memory-vault` for users/operators who ask for `/agentmemory`.

## Mandatory docs to read before CallScore execution

Read these in order before reporting readiness, running GTM, changing registry state, or mutating docs/code:

1. `AGENTS.md`
2. `README.md`
3. `docs/handovers/2026-06-14-hermes-agent-callscore-activation.md`
4. `docs/ops/callscore-gtm-agent-registry.json`
5. `docs/ops/callscore-gtm-agent-registry.md`
6. `docs/architecture/callscore-gtm-agent-registry.mmd`
7. `docs/ops/callscore-canonical-skill-register.md`
8. `docs/ops/callscore-canonical-subagent-roster.md`
9. `docs/ops/callscore-canonical-env-manifest.md` — redacted manifest only; never treat it as a secret source.
10. `docs/youtube-automation/FINAL_COMPLETION_REPORT.md` and `docs/youtube-automation/IMPLEMENTATION_LEDGER.md` when the task touches YouTube/video automation.

If a task is specifically visual/architecture-facing, also read:

- `docs/ops/callscore-agentic-workplane-full-system.html`
- `docs/architecture/callscore-agentic-platform.md`
- `docs/architecture/callscore-agentic-platform.mmd`

## Minimum live checks

Safe/read-only checks:

```bash
cd /opt/crypto-tuber-ranked
git status --short
git rev-parse --short HEAD
git branch --show-current
git diff --check
npm run workplane:status || npm run workplane
npm run pipeline:guard -- --out .tmp/callscore-pipeline/session-start-pipeline-guard.json
python3 -m json.tool docs/ops/callscore-gtm-agent-registry.json >/tmp/callscore-gtm-agent-registry.session-start.validated.json
node --import tsx --test tests/gtm-agent-registry.test.ts
```

If Workplane/freshness/audit commands need local env, source it without printing values:

```bash
set -a; . ./.env.hermes >/dev/null 2>&1; set +a
```

Never print env values, DB URLs, auth headers, tokens, cookies, private keys, credential-bearing remotes, or provider secrets.

## Canonical state assumptions

- Readiness model: `CONTROLLED_FULL` when Workplane reports core production healthy with only monitored/fail-closed restricted lanes remaining.
- Customer-facing production domain: `https://call-score.com`.
- Canonical hosting: Netlify. Vercel is stale/non-production evidence unless explicitly investigating compatibility.
- Canonical data source: local HH PostgreSQL plus HH Read API. Neon is backup/legacy compatibility only.
- Transcript lane: Omar laptop over Tailscale with laptop-side browser cookies and laptop-side `yt-dlp`; HH direct `yt-dlp`/ASR/VPN lanes are diagnostic/future fallback only.
- GTM registry JSON is source of truth for channel, owner, supporting agents, provider, allowed actions, forbidden actions, gate, receipt, rollback, readiness, and next safe action.
- Canonical subagents/workflow agents are first-class workforce; cron/status checks/registries are control rails, not agents.
- Canonical YouTube private publishing command: `npm run video:mcp-proof -- artifacts/video-jobs/<jobId>/state.json`. This uses Hermes MCP → Composio MCP through `src/video/composio/private_provider_helper.py` and writes `mcp-youtube-publish-result.json` in the job artifact directory.

## Gate posture

Safe without further approval when scoped and validated:

- Read docs/configs/receipts.
- Run status checks and validation commands.
- Run dry-runs.
- Generate drafts and approval packets.
- Run read-only Composio/Whop/Art of War inventory or preflight.
- Update docs/registry/handover when evidence changes, then validate.

Allowed by default only when registry row and policy say `READY_PUBLIC_OWNED`:

- Owned CallScore organic public posts/listing-copy/page content that is zero-cost, non-financial, non-secret, non-destructive, owned/managed, no email/DM/outreach, no provider/customer/payment/DB/deploy/infra mutation, and passes public messaging policy.
- A post-execution receipt is mandatory.

Fail-closed without exact gate + receipt + rollback:

- Email/DM/outreach/newsletter sends.
- Non-owned public posting.
- Paid spend/ads/boosts/APIs/LLMs/SaaS.
- CRM/analytics/provider writes.
- Whop pricing/product/customer/payment/entitlement/payout/provider mutation.
- DB writes, deployment, infra/webhook mutation.
- Credential rotation, destructive action, secret exposure.
- Named creator accusations, legal/compliance claims, investment advice, guarantees, or private-data claims.

## Headroom standard

Load `headroom` for CallScore sessions, but use it only under its safety rules:

- Use for huge logs/tool output/RAG/context pressure.
- Do not compress secrets, raw personal/payment data, cookies, service-account JSON, API keys, tokens, DB URLs, or auth headers.
- Do not make final exact claims from compressed summaries; retrieve/read raw evidence first.
- Do not globally route Hermes through a Headroom proxy without checking active provider/model config and rollback.
- Prefer excluding `read_file` and `headroom_retrieve` from proxy compression.
- On HH, port `8787` is commonly occupied; use `18787` for smoke tests unless intentionally reconfiguring services.

## Agentmemory standard

Load `/agentmemory` or `agent-memory-vault` when the session involves durable memory, long-term handover, identity, project conventions, or end-of-session consolidation.

Rules:

- Persist durable project conventions and reusable workflows, not temporary task progress.
- Do not save secrets, tokens, raw credentials, DB URLs, private keys, cookies, or customer/payment data.
- Use the canonical docs and skill register as source-of-truth for CallScore facts; do not let memory override current registry/Workplane evidence.
- After complex/iterative work, update relevant skills or canonical docs rather than relying only on short-term memory.

## Verification before final answer

Before claiming the session is aligned:

```bash
python3 -m json.tool docs/ops/callscore-gtm-agent-registry.json >/tmp/callscore-gtm-agent-registry.session-final.validated.json
node --import tsx --test tests/gtm-agent-registry.test.ts
git diff --check
```

For documentation-only changes, also scan edited docs for obvious secret-like strings before final response.
