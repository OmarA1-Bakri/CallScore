# CallScore FULL_AUTONOMOUS_BOUNDED_OWNED_GTM receipt

Generated: 2026-06-18T20:44:00Z
Operator: Hermes default profile
Mode: `FULL_AUTONOMOUS_BOUNDED_OWNED_GTM`

## Scope completed

1. Creator Growth Scout repaired.
   - Replaced stale LLM/Neon prompt path with deterministic script-only HH PostgreSQL cron.
   - Script: `/srv/agents/hermes/scripts/callscore-creator-growth-scout.sh`
   - Cron: `adf0644c9e8a` / `Creator Growth Scout` / `no_agent=true` / `deliver=local`
   - Manual receipt: `/opt/crypto-tuber-ranked/.tmp/workflow-receipts/creator_growth_scout/creator-growth-scout-20260618T203210Z.json`
   - Cron rerun status: `ok`

2. Whop-auto repaired.
   - Canonical Whop Auto tests: `259/259` pass in final validation.
   - Plugin healthcheck: `ok=true`, app `Hermes Whop Automation`, status `listed`.
   - Plugin tests: `259/259` pass after dependency restoration.
   - No Whop provider/product/plan/customer/payment/entitlement/webhook mutation performed.

3. Art of War Phase 10A/10B bounded-autonomy rails restored.
   - CLI now exposes:
     - `phase-10a-preflight`
     - `phase-10a-execute` (blocked-by-design; Hermes/Workplane dispatch only)
     - `channel-activation-preflight`
     - `dashboard`
     - `dashboard-preflight`
     - `dashboard-action-preflight`
     - `dashboard-agent-message`
     - `dashboard-approval`
   - Runtime artifacts restored under `/srv/agents/repos/Claude_Code_Automations/art-of-war/live/`.
   - Validation log: `/tmp/artofwar-final-autonomy-20260618T204056Z.log`
   - `phase-10a-preflight`: `ok=true`
   - `channel-activation-preflight`: `ok=true`
   - `dashboard-preflight`: `ok=true`
   - `validate-docs`: `ok=true`

4. Cron delivery cleaned.
   - Removed duplicate broken origin-delivery Whop job: `4eb79b1c91fe`.
   - Kept script-only Whop daily status job: `c5e8001d4429`, `last_status=ok`, `deliver=local`.
   - Retargeted autonomous CMO loop `9c03a6eea969` to `deliver=local` with explicit receipt/local-output policy.
   - Added agent heartbeat orchestrator cron: `0d03b3a83153`, every 60m, script-only, local delivery.

5. Agent autonomy ledger activated.
   - Migration applied to HH PostgreSQL: `migrations/024-agent-autonomy-ledger.sql`.
   - New tables:
     - `agent_instances`
     - `agent_heartbeats`
     - `channel_tasks`
     - `autonomy_events`
     - `channel_publications`
     - `approval_packets`
     - `experiment_memory`
     - `incidents`
   - Script: `src/scripts/callscore-agent-heartbeat.ts`
   - NPM script: `npm run agents:heartbeat`
   - Cron wrapper: `/srv/agents/hermes/scripts/callscore-agent-heartbeat.sh`
   - Manual heartbeat receipt: `/opt/crypto-tuber-ranked/.tmp/workflow-receipts/agent_heartbeat/agent-heartbeat-2026-06-18T20-39-48-473Z.json`
   - DB counts after final validation: `agent_instances=8`, `agent_heartbeats=16`, `channel_tasks=8`, `autonomy_events=16`.

## Live validation

Final app validation log:

`/opt/crypto-tuber-ranked/.tmp/prod-rollout/final-autonomy-validation-rerun-20260618T204141Z.log`

Results:

```text
npm run typecheck -> ok
npm run lint -> ok
npm test -> 705 tests, 705 pass, 0 fail
npm run build -> ok, compiled successfully
npm run workplane:status -> status=OK, automation_readiness=CONTROLLED_FULL
npm run verify:public -- --source live --base-url https://call-score.com -> ok=true
agent db counts -> 8 / 16 / 8 / 16
```

Art of War validation log:

`/tmp/artofwar-final-autonomy-20260618T204056Z.log`

Whop validation log:

`/tmp/whop-final-autonomy-20260618T204058Z.log`

## Active bounded-autonomy posture

Hermes remains the orchestrator of record. Channel-head agents now have durable HH PostgreSQL state, heartbeats, tasks, and receipts feeding into Hermes/Workplane oversight.

Allowed autonomous classes remain bounded:

- read-only scans and monitoring
- local draft generation
- evidence packet generation
- compliance/taste review
- safe owned organic public actions only when registry/policy/receipt checks pass
- Whop marketplace copy/assets and read-only provider health only
- receipts, rollback packets, and War Room reports

Restricted lanes remain fail-closed:

- paid spend, ads, boosts, paid APIs/SaaS/LLMs
- email, DM, newsletter, named-person outreach
- Whop pricing/product/customer/payment/entitlement/payout/provider/webhook mutation
- CRM/analytics/provider writes
- DB destructive writes, broad backfills, deploys, infra, credentials
- Gemma promotion into canonical calls
- non-owned public posting
- named negative creator claims, investment advice, performance guarantees

## Current caveat

Workplane still reports the transcript collector lane as monitored/cooldown-aware. That is not a system blocker. It remains bounded to avoid hammering providers after prior rate-limit/bot-verification signals.
