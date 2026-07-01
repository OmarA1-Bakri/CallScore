# CallScore Daily Website Freshness Proof — 2026-07-01

Kanban: `callscore-channel-orchestrator-retask-20260701` / `t_57daf4b4`

## Verdict

Daily website freshness proof is now in place.

The live public site was verified directly, proof was written into the shared team memory artifact store, and a daily Hermes cron job was created to repeat the proof.

## Live proof from 2026-07-01

Command:

```bash
npm run verify:public -- --source live --base-url https://call-score.com --audit-out docs/ops/channel-head-orchestrator/receipts/live-public-surface-2026-07-01.json
```

Result:

```json
{
  "ok": true,
  "checks": [
    { "name": "live_health_ok", "ok": true, "detail": "ok=true, source=hh_read_api" },
    { "name": "live_leaderboard_meta_matches_rows", "ok": true, "detail": "api=37, rows=37" },
    { "name": "live_homepage_contains_nonzero_funnel_counts", "ok": true, "detail": "raw=16561, public=8152, ranked=42" }
  ]
}
```

Committed receipt:

```text
docs/ops/channel-head-orchestrator/receipts/live-public-surface-2026-07-01.json
```

Runtime latest proof:

```text
/srv/agents/hermes/runtime/callscore-team-memory/artifacts/website-freshness/latest.json
```

## Daily cron created

Cron job:

```text
job_id: c2beb943298c
name: CallScore live website freshness proof
schedule: 15 4 * * *
script: callscore-live-website-freshness-proof.sh
mode: no_agent=true
workdir: /opt/crypto-tuber-ranked
next_run_at: 2026-07-02T04:15:00+01:00
```

Cron wrapper:

```text
/srv/agents/hermes/profiles/callscore/scripts/callscore-live-website-freshness-proof.sh
```

Repo script:

```text
/opt/crypto-tuber-ranked/scripts/callscore-live-website-freshness-proof.sh
```

## What the job proves

Every day it verifies:

1. `https://call-score.com/api/health` returns ok.
2. live leaderboard API returns non-empty coherent rows.
3. homepage contains nonzero raw/public/ranked funnel counts.
4. proof JSON is written to shared team memory artifacts.

## Scope

This is read-only proof. It does not deploy, mutate providers, publish content, or write production data.

If the site is stale or broken, the cron exits nonzero so the freshness problem cannot silently pass.
