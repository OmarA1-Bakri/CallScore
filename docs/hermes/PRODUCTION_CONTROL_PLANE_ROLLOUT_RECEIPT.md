# CallScore Production Control-Plane Rollout Receipt

Generated: 2026-06-18T20:05:00Z
Operator: Hermes Agent
Repo: `/opt/crypto-tuber-ranked`
Canonical production domain: `https://call-score.com`
Production host: Netlify site `5bea28b8-e56d-4173-aee1-6c75efb64adb`
Production data source: HH PostgreSQL + HH Read API

## Outcome

Status: COMPLETE

CallScore control-plane upgrades are live in production. The rollout completed all phases:

1. final pre-production validation
2. production database backup
3. additive production migrations 022/023
4. GitHub push to `origin/master`
5. Netlify production deploy
6. live API smoke tests
7. production control-plane canary writes
8. recurring production shadow canary timer
9. final full validation receipt

No secrets, tokens, database URLs, cookies, or private credentials are included in this receipt.

## Final deployed commit

Final application commit before this receipt:

```text
639e726f88eeedf0acc9ec7adf32edc6495bcd86
```

Recent rollout commits:

```text
639e726 fix(callscore): support postgres control-plane writes and recursive lineage
4c5a364 feat(callscore): add production control plane canary runner
b28b0a2 fix(callscore): proxy workflow observability through HH read API
36f7794 test(callscore): add control plane e2e verification
91543c8 feat(callscore): add control plane observability
2aff425 feat(callscore): add deterministic scoring boundary
```

Git status at receipt time:

```text
## master...origin/master
```

## Production deploy evidence

Netlify production deploy for commit `639e726f88eeedf0acc9ec7adf32edc6495bcd86`:

```json
{
  "branch": "master",
  "commit_ref": "639e726f88eeedf0acc9ec7adf32edc6495bcd86",
  "context": "production",
  "created_at": "2026-06-18T19:54:44.496Z",
  "deploy_url": "http://master--call-score.netlify.app",
  "id": "6a344d04b0a5dd000834cb63",
  "published_at": "2026-06-18T19:56:38.497Z",
  "state": "ready",
  "url": "https://call-score.com"
}
```

Deploy poll log:

```text
.tmp/prod-rollout/netlify-deploy-poll-final-20260618T195458Z.log
```

## Database backup evidence

Production database backup was taken before applying migrations.

Canonical full backup:

```text
.tmp/prod-rollout/backups/callscore-prod-full-before-control-plane-20260618T193114Z.dump
sha256 ec8128e440aafb00bcd8bd93d087758d837dca9ebcbc45dcf869470857d5b2d9
```

Additional public/app-user backup:

```text
.tmp/prod-rollout/backups/callscore-prod-public-before-control-plane-20260618T192445Z.dump
sha256 91d34bf1d00964cc946e5b36058f882b91e6809eb68c76fac94b5970a1aa4187
```

Note: the earlier app-user dump at `callscore-prod-before-control-plane-20260618T192432Z.dump` had an empty checksum and was superseded by the full local superuser backup above.

## Migration evidence

Applied production migrations:

```text
migrations/022-workflow-control-plane.sql
migrations/023-artifact-chain.sql
```

Migration execution log:

```text
.tmp/prod-rollout/migrate-022-023-superuser-20260618T193438Z.log
```

Verified production tables:

```text
agent_invocations
approval_gates
artifact_links
artifacts
workflow_events
workflow_node_runs
workflow_runs
```

## Production APIs live

Final live smoke evidence:

```text
.tmp/prod-rollout/final-live-smoke-20260618T195708Z.log
.tmp/prod-rollout/final-production-validation-20260618T195837Z.log
```

Live endpoint checks from final validation:

```text
{"name":"health","ok":true,"status":200}
{"name":"workflows","ok":true,"run_count":3,"status":200}
{"name":"leaderboard","ok":true,"rows":42,"status":200}
live_smoke=ok
```

Additional API probe:

```text
{"ok":true,"source":"hh_read_api","status":200,"url":"https://call-score.com/api/health"}
{"ok":true,"run_count":3,"status":200,"url":"https://call-score.com/api/workflows?limit=3"}
```

New production read-only routes:

```text
GET https://call-score.com/api/workflows
GET https://call-score.com/api/workflows/[id]
GET https://call-score.com/api/calls/[id]/lineage
```

These routes are backed by the HH Read API proxy path for production-safe read access.

## Production control-plane canaries

Successful completed canary runs:

```text
240c2c83-74f3-4c77-bda8-8cf307e9c8f0 | prod-control-plane-canary-20260618T195747 | completed | 2026-06-18 20:57:47.228587+01
278612d8-6eca-43e5-88e9-10941328b3cf | prod-control-plane-canary-20260618T195131 | completed | 2026-06-18 20:51:31.675738+01
```

Receipts:

```text
.tmp/workflow-receipts/control-plane-canary/prod-control-plane-canary-20260618T195131.json
.tmp/workflow-receipts/control-plane-canary/prod-control-plane-canary-20260618T195747.json
```

Canary artifact lineage proved score-to-video chain:

```text
score_evaluation
price_resolution
transcript_segments
normalized_calls
transcript_raw
candidate_calls
video_metadata
```

Canary mutation scope:

```text
workflow/artifact/agent_invocation/approval_gate tables only
final_business_tables_mutated=false
```

One earlier canary attempt failed before the PostgreSQL JSON parameter fix and was explicitly marked failed:

```text
1adc0314-cafa-4931-bf97-b35aa8b17bf4 | prod-control-plane-canary-20260618T195035 | failed
cleanup log: .tmp/prod-rollout/cleanup-failed-canary-20260618T200105Z.log
reason: canary_aborted_before_pg_json_param_fix
```

## Recurring shadow mode enabled

Systemd timer:

```text
callscore-control-plane-canary.timer
ActiveState=active
UnitFileState=enabled
NextElapseUSecRealtime=Fri 2026-06-19 04:27:58 BST
```

Systemd service result:

```text
callscore-control-plane-canary.service
Result=success
ExecMainStatus=0
```

Timer unit:

```text
/etc/systemd/system/callscore-control-plane-canary.timer
```

Service unit:

```text
/etc/systemd/system/callscore-control-plane-canary.service
```

Cadence:

```text
Daily at 04:20 local time, randomized delay up to 10 minutes
```

## Final validation evidence

Final production validation log:

```text
.tmp/prod-rollout/final-production-validation-20260618T195837Z.log
```

Validation commands and results:

```text
npm run typecheck -> exit 0
npm run lint -> exit 0
npm test -> 705 tests, 705 pass, 0 fail
npm run build -> exit 0
live smoke -> ok
npm run verify:public -- --source live --base-url https://call-score.com -> ok
systemd shadow timer -> active/enabled
systemd shadow service -> success/0
```

Live public verify result:

```json
{
  "base_url": "https://call-score.com",
  "source": "live",
  "checks": [
    {
      "name": "live_health_ok",
      "ok": true,
      "detail": "ok=true, source=hh_read_api"
    },
    {
      "name": "live_leaderboard_meta_matches_rows",
      "ok": true,
      "detail": "api=36, rows=36"
    },
    {
      "name": "live_homepage_contains_nonzero_funnel_counts",
      "ok": true,
      "detail": "raw=16317, public=8032, ranked=42"
    }
  ],
  "ok": true
}
```

## Rollout fixes performed during production activation

The production rollout surfaced and fixed three real integration issues:

1. Netlify functions could not directly connect to HH-local PostgreSQL.
   - Fix: proxy `/api/workflows`, `/api/workflows/[id]`, and `/api/calls/[id]/lineage` through the HH Read API.
   - Commit: `b28b0a2 fix(callscore): proxy workflow observability through HH read API`

2. PostgreSQL JSON/JSONB parameters needed explicit JSON serialization outside the in-memory test executor.
   - Fix: serialize object/array parameters in the default control-plane repository executor.
   - Commit: `639e726 fix(callscore): support postgres control-plane writes and recursive lineage`

3. Call lineage API needed recursive lineage, not only direct entity artifacts.
   - Fix: recursive artifact lineage query in observability and HH Read API.
   - Commit: `639e726 fix(callscore): support postgres control-plane writes and recursive lineage`

Each fix was validated with typecheck, lint, targeted tests, build, redeploy, and live smoke tests before proceeding.

## Current production posture

Production status: full production control-plane system live.

What is live:

```text
- additive control-plane schema in production DB
- artifact chain / lineage storage
- video intelligence workflow runtime
- deterministic scoring boundary artifacts
- read-only production workflow observability APIs
- live production canary workflow receipts
- recurring daily shadow canary timer
- Netlify production deploy from master
- HH Read API support for control-plane read routes
```

What remains intentionally gated:

```text
- final business-table writes from the new workflow path
- public leaderboard mutation from control-plane artifacts
- Whop/payment/provider/customer mutations
- paid spend/API purchases
- email/DM/outreach sends
- destructive DB or infra actions
```

## Rollback notes

Application rollback:

```text
Redeploy a prior known-good Netlify production deploy or revert the rollout commits and push master.
```

Database rollback:

```text
The migrations were additive. Prefer leaving the new tables in place if rolling back app code.
Use the full backup only if a destructive DB rollback is explicitly required.
Canonical backup: .tmp/prod-rollout/backups/callscore-prod-full-before-control-plane-20260618T193114Z.dump
```

Timer rollback:

```bash
sudo systemctl disable --now callscore-control-plane-canary.timer
sudo systemctl reset-failed callscore-control-plane-canary.service
```

## Acceptance

Accepted as production-complete because:

```text
- production deployment is ready on Netlify
- live health endpoint is ok and sourced from HH Read API
- live workflow APIs return ok
- production control-plane schema exists
- two production canaries completed successfully
- recursive artifact lineage is queryable live
- recurring shadow canary timer is active and enabled
- full test suite passed: 705/705
- build passed
- live public verification passed
```
