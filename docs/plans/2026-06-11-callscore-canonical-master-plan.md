# CallScore Canonical Master Plan — Fully Updated With Merged Safety + Revenue-Ops Baseline Status

**Base plan date:** 2026-06-10
**Local update date:** 2026-06-11
**Status:** Active canonical execution plan
**Objective:** Move CallScore from live public app to certified autonomous commercial revenue system.

---

## 0. Strict Verdict

```text
CERTIFY AUTONOMOUS REVENUE: NO
```

The app is live, provider canonicality is mostly aligned, and the public homepage now has an HH read API data path. However, CallScore cannot be certified as an autonomous commercial revenue system while the public leaderboard can display stale, low-sample, excluded, or semantically unsafe creators as official ranked creators.

Canonical infrastructure remains:

- Canonical app repo: `OmarA1-Bakri/CallScore`
- Canonical branch: `master`
- Canonical hosting: Netlify
- Production domain: `https://call-score.com`
- Production DB primary: HH PostgreSQL / pgsql
- Public read path target: Netlify public app -> HH read API -> HH local PostgreSQL / pgsql
- Scheduled write path target: Netlify scheduled function -> secured HH enqueue endpoint -> HH local PostgreSQL / pgsql -> Hermes worker
- Deprecated host: Vercel
- Legacy DB: Neon backup compatibility only; not canonical and not to be restored as canonical

Previous P0 blocker from the earlier master plan:

- PR38 homepage HH-read hotfix merged but was not deployed because Netlify build failed during lint/type-check.

That blocker has been superseded by later provider work.

Current P0 blocker:

```text
PUBLIC LEADERBOARD DATA CONTRACT IS COMMERCIALLY UNSAFE.
```

Current meaning:

- PR39/provider work moved production beyond the earlier PR38 build blocker.
- `HH_READ_API_BASE` is set.
- Production can show HH-backed data.
- HH PostgreSQL target has been verified as local `callscore/public` on `::1:5432` via `callscore_app`.
- Global call volume is not the problem.
- The data contract downstream of the database is wrong:
  - official leaderboard ranks low-N creators;
  - stale/incomplete creators can rank highly;
  - `creator_stats.all_time` semantics are inconsistent;
  - 30d period appears structurally broken or badly defined;
  - exclusion policy is not consistently enforced;
  - read API serializes unsafe rows as official leaderboard data.

Autonomous revenue remains uncertified until this full chain is proven:

```text
Visitor
-> CallScore public app
-> trustworthy public leaderboard / product surface
-> Whop checkout
-> entitlement verification
-> HH pgsql-backed job/event pipeline
-> Hermes worker execution
-> scoring / matching / ML verification
-> Art of War growth loop
-> measured conversion feedback
```

---


### 0.1 2026-06-11 Data Pipeline / Website Data Recovery Certification Update

```text
END-TO-END DATA FRESHNESS CERTIFICATION: PARTIAL / EXTERNAL TRANSCRIPT CREDENTIAL REQUIRED
DATA/WORKER/FRESHNESS REMEDIATION COMPLETE: PARTIAL
HH READ API NATIVE BUCKET CONTRACT: CERTIFIED
PUBLIC HOMEPAGE SAFETY: CERTIFIED SAFE DISPLAY
SOURCE CREATOR_STATS RANK SAFETY: CERTIFIED AFTER 2026-06-11 RECOMPUTE
```

Runtime evidence captured on 2026-06-11:

- Repo/runtime path: `/opt/crypto-tuber-ranked`; recovery work merged through master `c459fc5448b27195231e2292a3be1706156b6b81`; slow-YT-DLP cadence patch is the next local patch from that base.
- Public HH read API serves native bucket keys for `all_time`, `12m`, `90d`, and `30d`.
- Native HH read API proof after recovery:
  - `leaderboard.rows == officialRankedRows` for public responses.
  - `officialRankedRows` has `unsafeOfficial = []`.
  - `30d` returns `officialRankedRows = []` and `emptyReason = PENDING_MATURITY`.
  - `all_time` official count remains 17 after source-safe recompute.
- Worker/service proof:
  - `callscore-enqueue.service`: active/running and restarted to load expanded enqueue types.
  - `callscore-read-api.service`: active/running with native bucket contract.
  - Docker Hermes worker was rebuilt/recreated from current code and is running.
  - Real non-smoke jobs `match_prices_batch` and `compute_scores` were created, claimed, and completed on 2026-06-11.
- DB writer privilege recovery:
  - Existing role `callscore_app` now has minimum application-path write privileges for `videos`, `calls`, `pipeline_jobs`, `pipeline_job_events`, and `creator_stats`.
  - `calls.DELETE` is intentionally granted because the existing extraction application path replaces stored calls for a video inside a transaction.
  - Required sequence `USAGE`/`SELECT` grants were applied for inserts.
  - No broad superuser/admin grant, ownership change, DROP, TRUNCATE, or manual business-data repair SQL was used.
- Pipeline recovery evidence:
  - RSS video discovery canary succeeded for `@CryptosRUs`.
  - Full RSS discovery catch-up ran across 196 creators and wrote 1,232 eligible video rows; `videos_total` is now 15,476 and latest video inserted is 2026-06-11.
  - A legacy transcript-provider constraint edge case was fixed and verified with `thatmartiniguy` RSS canary.
  - Transcript canary now records explicit `provider_credentials_missing` failures instead of silently leaving stale queue items.
  - Extraction canary inserted two calls through the application path.
  - Price-match canary matched the two mature extracted calls.
  - Source-safe `npm run score` recompute ran after catch-up; `creator_stats` updated on 2026-06-11.
- Source rank safety after recompute:
  - `30d` ranked rows: 0.
  - `all_time` ranked rows: 17; low-N official ranks: 0; zero-call official ranks: 0.
  - `90d` ranked rows: 17; low-N official ranks: 0; zero-call official ranks: 0.
  - Altcoin Daily official source ranks: 0.
- Freshness self-check:
  - `npm run freshness:check -- --read-api-base https://ops-bridge.call-score.com/api/read` reports current DB timestamps, non-smoke jobs, grants, source unsafe ranks, native read API status, and transcript provider warnings.
  - Current result is `WARN`, not `PASS`, because transcript provider credentials are absent and canary attempts are classified as `provider_credentials_missing`.

Remaining hard blocker before complete end-to-end freshness certification:

```text
A WORKING TRANSCRIPT PROVIDER CREDENTIAL/PATH IS REQUIRED.
```

Accepted provider paths:

1. `SERPAPI_API_KEY` or supported aliases (`SERPAPI_TOKEN`, `SERPAI_TOKEN`, `SERP_API_KEY`, `SERPAPI_KEY`) for the existing transcript waterfall.
2. A working approved yt-dlp cookies configuration via `YTDLP_COOKIES_PATH` / `YTDLP_COOKIES` or `YTDLP_COOKIES_FROM_BROWSER`.
3. A new approved transcript provider integration that can store transcripts without committing or printing secrets.

After provider access is supplied, rerun transcript catch-up, extraction catch-up, scoring, source-safe stats recompute, and API/homepage certification.



### 0.2 2026-06-11 Slow YT-DLP Transcript Cadence Update

```text
CANONICAL TRANSCRIPT PATH: SLOW YT-DLP
SLOW YT-DLP CODE SAFETY: PR #50 PATCH YES
DAILY PIPELINE TIMER: INSTALLED / ACTIVE / CERTIFIED
TRANSCRIPT ACQUISITION: BLOCKED BY YOUTUBE BOT VERIFICATION UNTIL COOKIE PATH IS PROVIDED
DATA/WORKER/FRESHNESS REMEDIATION: PARTIAL — EXACT COOKIE GATE REMAINS
```

Runtime evidence captured on 2026-06-11 after the PR #49 recovery baseline:

- Repo/runtime path: `/opt/crypto-tuber-ranked`; base master `c459fc5448b27195231e2292a3be1706156b6b81`; slow-YT-DLP cadence patch is PR #50.
- Slow transcript runner defaults are now intentionally conservative:
  - canonical provider path: `yt-dlp` subtitle/caption retrieval only; no video download; no playlist expansion;
  - default transcript batch limit: 25;
  - default transcript concurrency: 1;
  - default sleep interval: 20 seconds;
  - default max sleep interval: 60 seconds;
  - retry cooldown: 24 hours;
  - stale provider-block retry: 7 days;
  - lock file: `/tmp/callscore-slow-ytdlp-transcripts.lock`;
  - provider/rate-limit/bot errors stop the batch instead of hammering YouTube.
- Supported redacted credential paths remain:
  - `YTDLP_COOKIES_PATH=/absolute/path/to/youtube-cookies.txt`;
  - `YTDLP_COOKIES=<secure cookie file content via runtime env>`;
  - `YTDLP_COOKIES_FROM_BROWSER=<yt-dlp supported browser profile spec>`.
- A daily cadence is installed and active on HH:
  - systemd timer: `callscore-daily-pipeline.timer`;
  - service: `callscore-daily-pipeline.service`;
  - schedule: daily around 03:20 local time with randomized delay;
  - command: `npm run pipeline:daily -- --write --read-api-base https://ops-bridge.call-score.com/api/read --transcript-limit 25 --transcript-concurrency 1 --transcript-gap-ms 20000 --limit-creators 250 --limit-videos 10 --since-days 45 --extract-limit 50 --match-limit 500 --match-batch-size 100`;
  - environment: `.env.hermes` plus redacted runtime env;
  - non-overlap lock: `/tmp/callscore-daily-pipeline.lock`.
- Manual daily canary completed safely on 2026-06-11:
  - RSS discovery upserted bounded recent video rows;
  - slow-YT-DLP transcript canary attempted one current video and stopped on `bot_verification_required`;
  - extraction processed two eligible local videos and inserted two calls;
  - price matching ran on the bounded set;
  - `compute_scores` ran and refreshed `creator_stats`;
  - freshness check returned `WARN` with no blockers and explicit transcript warnings.
- Current DB proof after canary:
  - videos: 15,476; latest video inserted 2026-06-11 10:19:54+01;
  - raw calls: 16,027; latest call inserted 2026-06-11 10:54:25+01;
  - latest transcript attempt 2026-06-11 10:54:14+01;
  - latest transcript success remains 2026-05-25 16:01:08+01;
  - latest `creator_stats` update 2026-06-11 10:54:48+01;
  - source unsafe ranks: 0; Altcoin Daily official source ranks: 0.
- Public HH API proof after canary:
  - `all_time`: official 17, provisional 27, watchlist 100, stale 20, excluded 1, pending 0, `unsafeOfficial = []`;
  - `30d`: `emptyReason = PENDING_MATURITY`, official 0;
  - `leaderboard.rows == officialRankedRows`.

Exact remaining credential gate:

```text
YouTube currently rejects unauthenticated yt-dlp transcript canaries with bot verification.
Provide one approved runtime-only credential path without committing or printing secrets:

1. YTDLP_COOKIES_PATH=/absolute/path/to/youtube-cookies.txt
2. YTDLP_COOKIES_FROM_BROWSER=<yt-dlp supported browser spec available to the worker>
3. YTDLP_COOKIES=<redacted Netscape cookie file content via secure runtime env>

After this is supplied, rerun the same daily command with --transcript-limit 25, confirm at least one transcript success, then allow the daily drain to reduce the backlog safely.
```

Transcript backlog as of this update is visible in the freshness self-check. Current largest classes are pending/no transcript, legacy YouTube rate/captcha failures, transcript-disabled videos, and the new explicit `bot_verification_required` canary failures. The backlog is not to be cleared by a single large run; it must drain through the daily bounded slow-YT-DLP cadence.

---
## 1. Source Of Truth

This master plan incorporates:

- Earlier canonical plan dated 2026-06-10.
- PR #34, #35, #36, #37, #38 progress.
- Thread 2 provider update that PR39 moved production past the PR38 build blocker.
- HH enqueue endpoint implementation and Cloudflared route proof from Thread 1.
- Netlify scheduled wrapper migration to HH enqueue endpoint.
- PR37 response-contract remediation for the candles wrapper.
- HH read API proof and production `HH_READ_API_BASE` intent.
- Corrected HH PostgreSQL survivorship audit.
- Leaderboard root-cause / fix-readiness audit.
- Codex handover plan for leaderboard remediation.
- Operator product policy that Altcoin Daily is categorically excluded because it is a news/media channel, not a target creator.
- 2026-06-11 merged PR #40 read API/frontend safety contract (`b18cc9e`).
- 2026-06-11 merged PR #41 shared creator eligibility/exclusion policy (`5673c25`).
- 2026-06-11 merged PR #42 Whop-auto commerce certification pack (`8d9d9b2`).
- 2026-06-11 merged PR #44 homepage legacy HH compatibility restore (`ad942fdf`).
- 2026-06-11 merged PR #45 methodology/rubric certification audit and public-copy patch (`93e87d9`).
- 2026-06-11 merged PR #47 public count/copy clarification (`010eafef`).
- 2026-06-11 runtime certification: native HH read API buckets certified after `callscore-read-api.service` restart; PR #49 recovered DB writer privileges, RSS discovery, scoring, source-safe stats, and native buckets; PR #50 activates slow-YT-DLP daily cadence and remains blocked only by a working YouTube cookie/credential path.

Thread boundaries:

- Thread 1 owns HH VM, `/srv`, `/opt`, pgsql, systemd/Docker, Cloudflared/Tailscale, runtime proof.
- Thread 2 owns GitHub / Netlify / provider truth.
- Codex execution should operate on the canonical repo/worktree and produce reviewable patches.
- Any production DB mutation, recompute, migration, restart, deploy, Whop mutation, Cloudflare route mutation, or destructive git operation requires explicit approval.

---

## 2. Canonical Provider State

| Field | Value |
| --- | --- |
| Canonical app repo | `OmarA1-Bakri/CallScore` |
| Canonical branch | `master` |
| Canonical host | Netlify |
| Netlify site | `call-score` |
| Netlify site ID | `5bea28b8-e56d-4173-aee1-6c75efb64adb` |
| Production domain | `https://call-score.com` |
| Deprecated host | Vercel |
| Primary DB | HH PostgreSQL / pgsql |
| Legacy DB | Neon — backup compatibility only, not canonical |
| Public read API base intent | `https://ops-bridge.call-score.com/api/read` |

Provider state from latest project context:

- PR39 has been reported merged.
- Production has been reported live on commit `ba5d35918575a1416f86c31c9a4dbdd1f8c0184f`.
- Current production deploy has been reported as `6a28ece2eabc096dfaf96138`.
- `HH_READ_API_BASE` has been reported set to `https://ops-bridge.call-score.com/api/read`.
- Production shows data, but the operator reports the data is wrong.

Important certification note:

The above PR39/deploy facts were supplied in project context and should be verified by Thread 2 or provider tooling before final certification. The new blocker is not “does the homepage show data?” but “does the homepage show commercially safe, correctly classified data?”

Canonical language:

- Production DB primary: HH PostgreSQL / pgsql.
- Public website data path target: Netlify public app -> HH read API -> HH local PostgreSQL / pgsql.
- Scheduled write/enqueue path target: Netlify scheduled function -> secured HH enqueue endpoint -> HH local PostgreSQL / pgsql -> Hermes worker.

---

## 3. Historical Milestones — Preserved

### 3.1 PR #34 — Host Network

Title: Align Hermes worker networking with HH pgsql runtime
State: MERGED

Patch:

- `docker-compose.yml`
- `services.hermes-worker.network_mode: host`

Certification:

- `CERTIFY PR #34 MERGED: YES`
- `CERTIFY CANONICAL HOST NETWORK PATCH: YES`

### 3.2 PR #35 — Cron Secret Hardening

Title: Harden `CRON_SECRET` server-side env trim
State: MERGED

Patch:

- `src/lib/cron.ts`
- `tests/cron-auth.test.ts`

Certification:

- `CERTIFY CRON_SECRET SERVER-SIDE TRIM HARDENING: YES`
- `CERTIFY OLD NETLIFY RUNTIME CRON_SECRET MISMATCH AS CURRENT P0: NO — superseded`

### 3.3 HH Enqueue Endpoint And Cloud Route

Local service: `callscore-enqueue.service`
Local bind: `127.0.0.1:8788`
Endpoint: `POST /internal/callscore/enqueue`
Auth: `Authorization: Bearer <HH_ENQUEUE_SECRET>`

Cloudflared public route:

- `HH_ENQUEUE_URL: https://ops-bridge.call-score.com/internal/callscore/enqueue`
- Route behavior: `/internal/callscore/enqueue* -> http://127.0.0.1:8788`

Known local proof IDs:

- run id: `1871`
- job id: `1819`
- job type: `candle_refresh`
- final job status: `succeeded`
- event flow: enqueued, claimed, heartbeat, dispatch_started, dispatch_completed, completed
- HH pgsql counts changed: `pipeline_jobs 415 -> 416`, `pipeline_job_events 2490 -> 2496`

Certification:

- `CERTIFY HH ENQUEUE ENDPOINT LOCAL: YES`
- `CERTIFY HH PGSQL ENQUEUE LOCAL: YES`
- `CERTIFY HERMES WORKER LOOP LOCAL: YES`
- `CERTIFY PUBLIC ENDPOINT REACHABLE AND PROTECTED: YES`

### 3.4 PR #36 — Netlify Candles Wrapper To HH Enqueue

Title: Route candles schedule through HH enqueue endpoint
State: MERGED

Patch:

- `netlify/functions/cron-candles-enqueue.js`
- `tests/cron-candles-wrapper.test.ts`

Certification:

- `CERTIFY PR #36 MERGED: YES`
- `CERTIFY CANDLES WRAPPER ROUTED TO HH ENQUEUE IN CODE: YES`
- `CERTIFY PR36 PRODUCTION PROOF: NO — response-contract failure`

### 3.5 PR #37 — Netlify Response Contract Fix

Title: Return valid candles wrapper responses
State: MERGED
Production deploy ID from prior plan: `6a2861bef9546d0008719adc`
Deploy state: ready

Behavior:

- Success returns 200 JSON Response.
- HH non-2xx returns safe 502 JSON Response.
- Exception returns safe 500 JSON Response.
- Timeout returns safe 504 JSON Response.
- Preserves `HH_ENQUEUE_URL` and `HH_ENQUEUE_SECRET` usage.
- Preserves no direct DB write from Netlify wrapper.

Certification:

- `CERTIFY PR #37 MERGED: YES`
- `CERTIFY NETLIFY DEPLOY PR37 READY: YES`
- `CERTIFY RESPONSE CONTRACT PATCH DEPLOYED: YES`
- `CERTIFY FINAL CANDLES WRAPPER HH ENQUEUE PROOF AFTER PR37: NOT CERTIFIED IN THIS PLAN`

### 3.6 PR #38 — Homepage HH Read API Hotfix

Title: Use HH read API for homepage data
State: MERGED
Merge commit from prior plan: `a5c0cbc9445a7cdbd4b5dae191ed864b6a282421`

Patch:

- `src/lib/hh-read-api.ts`
- `src/app/page.tsx`

Original blocker:

- PR38 production deploy failed during lint/type-check.
- This blocker was later superseded by PR39/provider work.

Certification:

- `CERTIFY PR #38 MERGED: YES`
- `CERTIFY ORIGINAL PR38 DEPLOY READY: NO`
- `CERTIFY PR38 BUILD BLOCKER AS CURRENT P0: NO — superseded by leaderboard correctness blocker`

### 3.7 PR #39 — Homepage HH Read Path Live / Build Blocker Superseded

Reported provider state:

- PR39 merged.
- Production live on commit `ba5d35918575a1416f86c31c9a4dbdd1f8c0184f`.
- Production deploy reported as `6a28ece2eabc096dfaf96138`.
- `HH_READ_API_BASE` set.
- Production shows HH-backed data.

Current status:

- `CERTIFY PR39 PROVIDER STATE: REQUIRES THREAD 2 PROVIDER VERIFICATION`
- `CERTIFY HOMEPAGE SHOWS DATA: YES / reported`
- `CERTIFY HOMEPAGE DATA CORRECTNESS: NO`
- `CERTIFY PUBLIC LEADERBOARD COMMERCIAL TRUST: NO`

---

## 4. Verified Data Findings — Current P0 Basis

### 4.1 HH PostgreSQL Target Is Correct

Read-only SQL audit established:

- DB: `callscore`
- schema: `public`
- server: `::1`
- port: `5432`
- user: `callscore_app`

Verdict:

Wrong DB / Neon leakage is not the active explanation.

### 4.2 Global Call Volume Exists

Corrected global call survivorship:

- all-time raw calls: `16,023`
- 12m raw calls: `5,127`
- all-time confidence `>= 0.70`: `8,589`
- 12m confidence `>= 0.70`: `3,378`
- all-time `price_at_call` present: `15,745`
- 12m `price_at_call` present: `5,127`
- all-time `price_30d` present: `15,733`
- 12m `price_30d` present: `5,116`
- all-time `return_30d` present: `15,733`
- 12m `return_30d` present: `5,116`
- all-time `score > 0`: `7,947`
- 12m `score > 0`: `2,785`
- all-time public eligible: `7,947`
- 12m public eligible: `2,785`

Verdict:

Global ingestion/pricing/scoring is not empty. The product failure is downstream.

### 4.3 Alex Becker Stale / Low-N Official Rank Example

Corrected per-creator output:

- creator: `Alex Becker's Channel`
- handle: `@AlexBeckersChannel`
- videos_total: `268`
- videos_with_transcript: `268`
- videos_calls_extracted_true: `268`
- raw_calls: `614`
- raw_calls_12m: `41`
- confidence_ge_070: `298`
- confidence_ge_070_12m: `24`
- price_at_call_present: `610`
- price_at_call_present_12m: `41`
- public_eligible: `296`
- public_eligible_12m: `24`
- creator_stats_all_time_total_calls: `24`
- all_time_accuracy_rank: `1`
- latest_video_date: `2025-10-11`
- latest_call_date: `2025-10-11`
- stats_latest_updated_at: `2026-06-09`

Verdict:

Alex is stale/incomplete and low-N under the current stats sample, yet official rank #1.

Production impact:

A stale/incomplete creator can appear as official top creator.

### 4.4 Low-N Creators Are Ranked

Examples from corrected output:

- Alex Becker: `24` calls, rank `1`
- MoneyZG: `12` calls, rank `2`
- Crypto Inspector: `8` calls, rank `3`
- Bitcoin Expert India: `18` calls, rank `5`
- Blockchain Backer: `13` calls, rank `8`
- Shamon: `6` calls, rank `12`
- Taiki Maeda: `5` calls, rank `13`

Verdict:

`THRESHOLD_EXISTS_NOT_USED` or threshold is too low / not enforced by public API.

Production impact:

Commercially weak sample sizes are presented as official rankings.

### 4.5 `creator_stats.all_time` Semantics Are Inconsistent

Examples:

- Altcoin Daily: computed public eligible all-time `3,165` vs `creator_stats all_time total_calls 429`
- Discover Crypto: `872` vs `300`
- Crypto Banter: `813` vs `128`
- CryptosRUs: `602` vs `138`
- Alex Becker: `296` vs `24`
- VirtualBacon: `108` vs `25`

Verdict:

`creator_stats.period = 'all_time'` is not reliably all historical public-eligible calls.

Production impact:

“All-time” public ranking can be based on an unclear or filtered subset while presented as all-time.

### 4.6 Altcoin Daily Exclusion Failure

Current data:

- name: `Altcoin Daily`
- handle: `@AltcoinDaily`
- raw_calls: `6,822`
- public eligible all-time: `3,165`
- creator_stats_all_time_total_calls: `429`
- all_time_accuracy_rank: `19`

Canonical product policy:

Altcoin Daily is categorically excluded. It is a news/media channel, not a target creator.

Verdict:

- `EXCLUSION_NOT_USED_BY_STATS`
- `EXCLUSION_NOT_USED_BY_API`
- `IDENTITY_MISMATCH_RISK`

Production impact:

A known non-target news/media channel can appear in creator rankings.

### 4.7 30d Period Appears Structurally Broken

Many active creators show:

- `creator_stats_30d_total_calls = 0`
- `d30_accuracy_rank = null`

Likely issue:

The 30d period likely combines a recent call-date window with `return_30d` maturity, producing an empty or near-empty period.

Verdict:

`BROKEN_PERIOD_LOGIC / EMPTY_BY_DESIGN` until exact period helper is corrected.

Production impact:

30d public leaderboard can show empty, zero-call, or misleading ranking behavior.

---

## 5. Canonical Product Policy

### 5.1 Target Creator Definition

CallScore ranks accountable crypto creators / market callers, not generic crypto news, media, aggregation, or reporting channels.

Rankable creator criteria:

- individual or accountable creator identity;
- clear market opinion / call ownership;
- sufficient public-eligible call sample;
- fresh enough creator dataset;
- not excluded by product policy;
- not a news aggregation/media channel;
- not contaminated / ambiguous source.

### 5.2 Altcoin Daily Hard Exclusion

Canonical rule:

Altcoin Daily, in any identifier format, must never appear in creator rankings.

Reason:

Altcoin Daily is a crypto news / media / aggregation channel, not the type of individual creator or accountable market caller CallScore targets.

Identifier forms to exclude:

- Altcoin Daily
- altcoin daily
- `@AltcoinDaily`
- `@altcoindaily`
- AltcoinDaily
- altcoindaily
- known channel IDs linked to Altcoin Daily
- normalized equivalents

Altcoin Daily must not appear in:

- `officialRankedRows`
- `provisionalRows`
- `watchlistRows`
- homepage leaderboard
- `creator_stats` official ranking after stats-level fix
- future creator admission as rankable

Allowed only in admin/audit bucket:

- `excludedRows`
- reason: `EXCLUDED_MEDIA_NEWS_CHANNEL`

---

## 6. Current Root-Cause Chain

Confirmed chain:

```text
creator freshness / coverage is inconsistent
  -> creator_stats period semantics are inconsistent / unsafe
  -> ranking thresholds and exclusions are not enforced consistently
  -> read API serializes unsafe stats rows as official leaderboard data
  -> frontend shows commercially invalid leaderboard
```

Root cause:

A layered stats/read contract failure compounded by creator freshness gaps.

Confidence:

- High for read API failure.
- High for low-N ranking failure.
- High for Altcoin Daily exclusion failure.
- High for Alex freshness / stale ranking failure.
- Medium-high for `creator_stats` period semantics pending exact writer patch verification.

Unsafe public behavior:

The public leaderboard can show stale, low-sample, excluded, non-target, or semantically ambiguous creators as official ranked creators.

---

## 7. Current Execution Priority — Updated With 2026-06-11 Local Status

Old P0:

Fix PR38 build/type-check and deploy homepage HH read hotfix.

New P0:

Patch the HH read API / canonical read layer so unsafe rows cannot be exposed as official public rankings.

Updated order and current status:

| Priority | Work | Status |
| --- | --- | --- |
| P0A | Freeze and verify current state | Complete locally |
| P0B | Patch read API safety contract | Complete locally on branch `callscore/leaderboard-read-api-safety-contract` |
| P0C | Validate API buckets with no DB mutation | Unit/static validation complete; live/local API runtime validation pending |
| P0D | Restart read API only after explicit approval | Not approved / not done |
| P0E | Patch frontend to respect buckets | Local frontend display contract patch complete; unmerged, undeployed, and not production-certified |
| P0F | Deploy only after explicit approval | Not approved / not done |
| P1 | Canonical exclusion policy shared utility | LOCAL PATCH IN PROGRESS on `callscore/revenue-ops-baseline-plan-policy`; shared policy utility extracted; PR/merge pending |
| P2 | `creator_stats` period semantics and ranking writer correction | Pending |
| P3 | Stats recompute only after explicit approval | Pending |
| P4 | 30d redesign / disable official 30d | API-level disable complete locally; methodology redesign pending |
| P5 | Creator freshness repair | Pending |
| P6 | Identity normalization | Pending |
| P7 | Remaining public read API rollout beyond homepage | Pending |
| P8 | Controlled scheduled candles enqueue proof | Pending |
| P9 | Whop live commerce proof | Pending |
| P10 | Art of War autonomous growth loop certification | Pending |

---

## 8. Codex Workflow — Immediate Remediation Plan

### 8.1 Operating Rules For Codex

Codex must not:

- restart services;
- run migrations;
- recompute stats;
- rerun extraction;
- mutate production DB;
- change Netlify/Whop/Cloudflare;
- deploy to production;
- change secrets;
- perform destructive git operations.

Codex should:

- inspect code;
- create minimal patches;
- add tests;
- produce validation commands;
- keep changes reversible;
- avoid broad refactors;
- avoid recompute or production actions.

### 8.2 Phase 0 — Freeze And Inspect Current Repo

Required local freeze commands:

```bash
git rev-parse HEAD
git status --short
git branch --show-current
```

Required search:

```bash
grep -R "creator_stats\|accuracy_rank\|total_calls\|recomputeAllStats\|callscore-read-api\|Altcoin Daily\|legacy" -n src scripts . 2>/dev/null | head -200
```

Expected source areas:

- `src/scripts/callscore-read-api-server.mjs`
- `src/lib/recompute-stats.ts`
- `src/lib/public-methodology.ts`
- `src/lib/leaderboard-eligibility.ts`
- `src/lib/legacy-creator-overrides.ts`
- `src/scripts/compute-scores.ts`
- `src/scripts/pipeline-jobs.ts`
- `src/scripts/hermes-worker.ts`
- homepage leaderboard components

Mutation allowed:

No production mutation. Local code inspection only.

### 8.3 Phase 1 — Read API Safety Patch

Goal:

Stop unsafe rows being returned as official leaderboard entries.

Target:

- `src/scripts/callscore-read-api-server.mjs` or canonical equivalent endpoint feeding `/api/read/home?period=...`

Required API behavior:

Replace flat leaderboard response with buckets:

```js
{
  period,
  officialRankedRows,
  provisionalRows,
  watchlistRows,
  staleRows,
  excludedRows,
  pendingMaturityRows,
  emptyReason,
  counts: {
    publicEligibleCalls,
    officialRankedCreators,
    provisionalCreators,
    watchlistCreators,
    staleCreators,
    excludedCreators,
    pendingMaturityCreators
  }
}
```

Official ranked rules:

- `accuracy_rank IS NOT NULL`
- `total_calls >= official threshold`
- `total_calls > 0`
- creator is not excluded
- creator is not stale
- creator is target creator class
- period is valid

Initial thresholds:

- all_time official minimum: `50`
- 12m official minimum: `25`
- 90d official minimum: `10`
- 30d official leaderboard: disabled for now
- absolute floor: no official row below `25` unless period-specific approved exception exists

Hard exclusion:

Altcoin Daily in any identifier format.

Fix unsafe predicates:

Replace:

- `score IS NOT NULL`
- `extraction_confidence >= 0.65`

With:

- `score > 0`
- `extraction_confidence >= 0.70`

Reason:

`calls.score` defaults to 0, so `score IS NOT NULL` is invalid as a public scored-call predicate.

Acceptance criteria:

- No Altcoin Daily in `officialRankedRows`, `provisionalRows`, or `watchlistRows`.
- No Alex Becker official rank while stale/low-N.
- No official row with `total_calls < threshold`.
- No official row with null rank.
- No official row with zero calls.
- 30d returns no fake official leaderboard.
- Counts reflect buckets, not raw `creator_stats` rows.

Risk:

Low.

Approval before live use:

- code patch: yes
- read API restart: yes
- DB mutation: no
- recompute: no
- deploy: yes if pushing via Netlify/GitHub

### 8.4 Phase 2 — Frontend Display Contract

Goal:

Make UI consume bucketed API response safely.

Required behavior:

- official leaderboard uses `officialRankedRows` only.
- `excludedRows` hidden from public surfaces.
- `staleRows` not shown as official rank.
- `provisionalRows` not shown as official rank.
- `pendingMaturityRows` not shown as official rank.
- 30d period displays `emptyReason` / pending maturity state, not fake ranking.

Acceptance criteria:

- Homepage does not show low-N/stale/excluded rows as official ranks.
- Altcoin Daily invisible on public leaderboard.
- Alex Becker not shown as #1 unless refreshed and threshold-valid.
- 30d does not show fake zero-call official ranking.

Risk:

Low-medium.

Approval:

Frontend deploy required before production.

### 8.5 Phase 3 — Canonical Exclusion Policy

Goal:

Make product exclusions consistent across API, stats writer, frontend, and future admission.

New canonical exclusion type:

```ts
type ExclusionReason =
  | "EXCLUDED_MEDIA_NEWS_CHANNEL"
  | "EXCLUDED_CONTAMINATED_CALL_SOURCE"
  | "EXCLUDED_NON_TARGET_CREATOR"
  | "EXCLUDED_DUPLICATE_OR_ALIAS";
```

Normalization:

- lowercase
- trim
- remove leading `@`
- normalize whitespace
- compare display name
- compare handle
- compare channel ID if known
- compare aliases

Altcoin Daily canonical policy:

Excluded because it is a crypto news/media/aggregation channel, not a target accountable creator.

Apply to:

- read API
- frontend public filtering
- `creator_stats` rank assignment
- future creator admission
- admin/audit output

Risk:

Low for API-only enforcement. Medium when pushed into stats writer and recomputed.

### 8.6 Phase 4 — `creator_stats` Semantics Correction

Goal:

Make `creator_stats.period` explicit and truthful.

Required period definitions:

- `all_time`: all historical public-eligible calls
- `12m`: public-eligible calls within last 12 months
- `90d`: mature public-eligible calls in the defined 90d methodology
- `30d`: disabled or marked pending until redesigned

Public default:

`12m`

Reason:

- fresh enough for commercial relevance;
- large enough sample;
- less polluted by old market regimes.

Required writer behavior:

- calculate public eligible calls;
- calculate sample threshold;
- calculate rank eligibility;
- apply exclusion eligibility;
- apply freshness eligibility;
- assign rank only when `total_calls >= threshold` and not excluded and not stale and target creator;
- otherwise `accuracy_rank = null`.

Acceptance criteria:

For true all-time:

`creator_stats.total_calls = computed public eligible all-time calls`

For 12m:

`creator_stats.total_calls = computed public eligible 12m calls`

No overloaded `all_time` that secretly behaves like a filtered active window.

Risk:

Medium.

Approval:

- writer patch: yes
- worker restart: maybe
- stats recompute: yes
- DB mutation: yes via recompute

Do not execute recompute without explicit approval.

### 8.7 Phase 5 — Ranking Threshold Correction At Source

Goal:

Stop generating low-N official ranks in `creator_stats`.

Proposed official thresholds:

- all_time official: `50`
- 12m official: `25`
- 90d official: `10` or `15`
- 30d official: disabled

Provisional thresholds:

- all_time provisional: `10`
- 12m provisional: `10`
- 90d provisional: `5`

Validation SQL:

```sql
SELECT
  period,
  COUNT(*) FILTER (WHERE accuracy_rank IS NOT NULL) AS ranked,
  COUNT(*) FILTER (WHERE accuracy_rank IS NOT NULL AND total_calls < 25) AS ranked_lt_25
FROM creator_stats
GROUP BY period
ORDER BY period;
```

Expected after stats-level fix:

`ranked_lt_25 = 0`

Risk:

Medium.

Approval:

- stats writer patch: yes
- recompute: yes

### 8.8 Phase 6 — 30d Period Redesign

Problem:

Current 30d likely behaves like:

```text
calls made in last 30 days AND return_30d exists
```

That is structurally empty or near-empty because 30d returns require maturity.

Immediate fix:

Disable official 30d leaderboard:

```js
{
  period: "30d",
  officialRankedRows: [],
  emptyReason: "PENDING_MATURITY",
  pendingMaturityRows: [...]
}
```

Later option:

30d means calls that matured in the last 30 days.

Approximate window:

```sql
call_date between now() - interval '60 days' and now() - interval '30 days'
```

Do not switch to a shorter return horizon without methodology approval.

### 8.9 Phase 7 — Creator Freshness Repair

Goal:

Prevent stale or incomplete creator data from ranking.

Initial freshness rule:

Active creator is stale if `latest_video_date < now() - interval '180 days'`.

Required audit fields:

- creator
- latest_video_date
- latest_transcript_date
- latest_extracted_call_date
- latest_priced_call_date
- latest_scored_call_date
- latest_creator_stats_update
- latest_pipeline_job
- freshness_status

Alex Becker required behavior before repair:

Not official; reason = stale / low-N.

After repair, Alex can be official only if:

- fresh video inventory exists;
- transcripts exist;
- calls extracted;
- prices matched;
- scores computed;
- threshold met;
- not excluded.

Repair actions requiring approval:

- refresh videos;
- fetch transcripts;
- extract calls;
- match prices;
- score;
- recompute stats;
- validate API buckets.

Risk:

Medium-high.

### 8.10 Phase 8 — Identity Normalization

Goal:

Stop alias/handle/channel ID inconsistencies from breaking exclusions and presentation.

Future canonical fields:

- display_name
- normalized_name
- youtube_handle_normalized
- youtube_channel_id
- creator_type
- exclusion_reason
- alias list

Risk:

Medium.

This waits until read/API/stats safety is in place.

---

## 9. Validation Plan

### 9.1 Unit / Static Tests

Add or update tests for:

- `normalizeCreatorIdentity()`
- `isExcludedCreator()`
- `classifyLeaderboardRow()`
- official threshold gating
- stale gating
- 30d pending maturity behavior
- bucket counts
- read API response contract

Required fixtures:

- Altcoin Daily row
- Alex Becker stale low-N row
- MoneyZG low-N row
- valid official creator row
- 30d empty/pending maturity period
- null-rank row
- zero-call row

Expected:

- Altcoin Daily -> `excludedRows` only
- Alex stale/low-N -> `staleRows` or `provisionalRows`, not `officialRankedRows`
- MoneyZG low-N -> `provisionalRows`, not `officialRankedRows`
- valid creator -> `officialRankedRows`
- 30d -> `officialRankedRows = []`
- null-rank -> not official
- zero-call -> not official

### 9.2 API Validation After Patch

For each period:

- `all_time`
- `12m` if implemented
- `90d`
- `30d`

Validate:

- `officialRankedRows` contains no Altcoin Daily
- `officialRankedRows` contains no excluded creators
- `officialRankedRows` contains no stale creators
- `officialRankedRows` contains no low-N creators
- `officialRankedRows` contains no null-rank rows
- `officialRankedRows` contains no zero-call rows
- 30d returns `emptyReason` / pending maturity, not fake official ranks
- counts equal bucket counts

### 9.3 SQL Validation After Stats-Writer Fix And Approved Recompute

Low-N ranks:

```sql
SELECT
  period,
  COUNT(*) FILTER (WHERE accuracy_rank IS NOT NULL) AS ranked,
  COUNT(*) FILTER (WHERE accuracy_rank IS NOT NULL AND total_calls < 25) AS ranked_lt_25
FROM creator_stats
GROUP BY period
ORDER BY period;
```

Expected:

`ranked_lt_25 = 0`

Altcoin validation:

```sql
SELECT
  cs.period,
  cs.accuracy_rank,
  c.name,
  c.youtube_handle,
  cs.total_calls
FROM creator_stats cs
JOIN creators c ON c.id = cs.creator_id
WHERE cs.accuracy_rank IS NOT NULL
  AND (
    lower(c.name) LIKE '%altcoin daily%'
    OR lower(replace(c.youtube_handle, '@', '')) = 'altcoindaily'
  );
```

Expected:

`0 rows`

Alex validation:

```sql
SELECT
  c.name,
  c.youtube_handle,
  MAX(v.published_at) AS latest_video_date,
  MAX(ca.call_date) AS latest_call_date,
  cs.total_calls,
  cs.accuracy_rank
FROM creators c
LEFT JOIN videos v ON v.creator_id = c.id
LEFT JOIN calls ca ON ca.creator_id = c.id
LEFT JOIN creator_stats cs
  ON cs.creator_id = c.id
 AND cs.period = 'all_time'
WHERE c.name ILIKE '%Alex Becker%'
   OR c.youtube_handle = '@AlexBeckersChannel'
GROUP BY c.name, c.youtube_handle, cs.total_calls, cs.accuracy_rank;
```

Expected before repair:

Stale / not official.

Expected after repair:

Fresh `latest_video_date` and official only if threshold-valid.

---

## 10. Public Read API Rollout Beyond Homepage

This remains required but is demoted behind P0 leaderboard safety.

Known direct DB-read paths from prior audit:

- `src/app/creator/[handle]/page.tsx`
- `src/app/call/[id]/page.tsx`
- `src/lib/creator-handles.ts`
- `src/lib/public-counts.ts`
- `src/app/api/leaderboard/route.ts`
- `src/app/api/creator/[id]/route.ts`
- `src/app/api/consensus/route.ts`
- `src/app/api/v1/leaderboard/route.ts`
- `src/app/api/v1/creators/route.ts`
- `src/app/api/v1/creators/[id]/route.ts`
- `src/app/api/v1/calls/route.ts`
- `src/app/api/v1/consensus/route.ts`

Future read API migration targets:

- `GET /api/read/leaderboard`
- `GET /api/read/public-counts`
- `GET /api/read/creator/:handle`
- `GET /api/read/call/:id`
- `GET /api/read/v1/leaderboard`
- `GET /api/read/v1/creators`
- `GET /api/read/v1/creators/:id`
- `GET /api/read/v1/calls`
- `GET /api/read/v1/consensus`

Auth rule:

Public-safe endpoints may be unsigned if certified public-safe. Commercial/API-like reads should use server-side `HH_READ_SECRET` only, never exposed to browser.

---

## 11. Whop / Commerce Plan

Current status:

- Whop manifest clean: YES
- Whop env key readiness: YES
- Whop commerce live proof: PARTIAL / NOT FULLY CERTIFIED

Still required:

1. Verify Whop OAuth callback URL: `https://call-score.com/api/auth/whop/callback`
2. Verify checkout URLs for:
   - pro monthly
   - pro annual
   - alpha monthly
   - alpha annual
3. Verify user entitlement path with non-destructive test account or provider-safe proof.
4. Verify success/cancel routes resolve to canonical production domain.
5. Verify no stale development/provider URLs remain in Whop app settings.
6. Do not mutate pricing/payment/plans without explicit approval.

Certification target:

`CERTIFY WHOP COMMERCE LIVE: YES`

---

## 12. Art Of War / Autonomous Revenue Loop Plan

After leaderboard safety, homepage data, scheduled enqueue, and worker loop are proven:

1. Confirm Art of War control artifacts use canonical provider facts.
2. Confirm scheduled wrappers feed pgsql-backed pipeline jobs.
3. Confirm Hermes worker processes jobs to completion.
4. Confirm scoring/matching/ML verification produces trustworthy measurable output.
5. Confirm alerts/status surfaces reflect current pipeline state.
6. Confirm growth/control loop can produce measured conversion feedback.
7. Confirm no stale host/provider language in operator-facing docs.

Certification target:

`CERTIFY AUTONOMOUS REVENUE: YES` only when revenue path + worker loop + trustworthy product surface + growth loop are all proven.

---

## 13. Updated Certification Matrix

| Certification | Status |
| --- | --- |
| CERTIFY GITHUB CANONICALITY | YES / provider-directed |
| CANONICAL REPO | `OmarA1-Bakri/CallScore` |
| CANONICAL BRANCH | `master` |
| PR #34 MERGED | YES |
| PR #35 MERGED | YES |
| PR #36 MERGED | YES |
| PR #37 MERGED | YES |
| PR #38 MERGED | YES |
| PR #39 MERGED | REPORTED YES — needs provider recheck for final cert |
| CERTIFY NETLIFY HOST CANONICAL | YES |
| CERTIFY PR38 BUILD BLOCKER CURRENT | NO — superseded |
| CERTIFY HH_READ_API_BASE SET IN NETLIFY | REPORTED YES |
| CERTIFY HOMEPAGE SHOWS HH-BACKED DATA | REPORTED YES |
| CERTIFY HOMEPAGE DATA CORRECTNESS | NO |
| CERTIFY PUBLIC LEADERBOARD COMMERCIAL TRUST | NO |
| CERTIFY HH ENQUEUE ENDPOINT LOCAL | YES |
| CERTIFY HH ENQUEUE PUBLIC PROTECTED | YES |
| CERTIFY HH PGSQL LOCAL | YES |
| CERTIFY HERMES WORKER HEALTHY | YES |
| CERTIFY LOCAL WORKER LOOP FROM HH ENQUEUE | YES |
| CERTIFY PRODUCTION DB PRIMARY | YES — HH PostgreSQL / pgsql |
| CERTIFY NEON CANONICAL | NO |
| CERTIFY RAW POSTGRES EXPOSED | NO |
| CERTIFY GLOBAL CALL VOLUME EXISTS | YES |
| CERTIFY CREATOR_STATS SEMANTICS SAFE | NO |
| CERTIFY LOW-N RANKING BLOCKED | MERGED READ/API + HOMEPAGE PATCH YES via PR #40; PRODUCTION NOT CERTIFIED |
| CERTIFY ALTCOIN DAILY EXCLUDED FROM RANKINGS | MERGED READ/API + HOMEPAGE PATCH YES via PR #40; SHARED POLICY MERGED YES via PR #41; STATS-WRITER/PRODUCTION NOT CERTIFIED |
| CERTIFY 30D PERIOD SAFE | MERGED READ/API DISABLE YES via PR #40; PRODUCTION NOT CERTIFIED; METHODOLOGY REDESIGN PENDING |
| CERTIFY READ API SAFE BUCKET CONTRACT | MERGED YES via PR #40 (`b18cc9e`); DEPLOYED REQUIRES VERIFICATION; PRODUCTION NOT CERTIFIED |
| CERTIFY FRONTEND SAFE BUCKET DISPLAY | MERGED YES via PR #40 (`b18cc9e`); HOMEPAGE USES `officialRankedRows`; DEPLOYED REQUIRES VERIFICATION; PRODUCTION NOT CERTIFIED |
| CERTIFY WHOP MANIFEST CLEAN | YES |
| CERTIFY WHOP COMMERCE ENV READY | YES |
| CERTIFY WHOP COMMERCE LIVE | PARTIAL; WHOP-AUTO CERTIFICATION PACK MERGED YES via PR #42; PROVIDER PROOF REQUIRED |
| CERTIFY PROVIDER DRIFT CLOSED | NO |
| CERTIFY AUTONOMOUS REVENUE | NO |

---

## 14. Next Operator Action — Updated After Local Patch

Original next Codex task from the 2026-06-10 plan:

```text
Create the read API safety patch only.
```

Current local status:

This task is complete locally on branch:

```text
callscore/leaderboard-read-api-safety-contract
```

Changed files for local read API safety patch:

- `src/lib/leaderboard-safety.mjs`
- `src/scripts/callscore-read-api-server.mjs`
- `tests/leaderboard-safety.test.mjs`

Changed files for local frontend display contract patch:

- `src/app/page.tsx`
- `src/lib/home-read-api-contract.ts`
- `src/lib/leaderboard-safety.d.ts`
- `tests/home-read-api-contract.test.ts`

Local behavior summary:

- Bucketed read API contract implemented locally.
- `leaderboard.rows` now serializes safe `officialRankedRows` only.
- Homepage now reads official rows from `officialRankedRows` explicitly and does not treat compatibility `leaderboard.rows` as the primary frontend contract.
- Homepage direct-DB fallback is bucketed through the same safety contract before rendering official rows.
- Altcoin Daily hard-excluded from public ranking buckets.
- Low-N, stale, null-rank, zero-call, and excluded rows cannot be official locally.
- 30d official leaderboard disabled as pending maturity.
- Read API count predicate fixed to `score > 0` and `extraction_confidence >= 0.70`.

Validation completed locally:

- `node --test tests/leaderboard-safety.test.mjs`: PASS, 11/11.
- `node --check src/scripts/callscore-read-api-server.mjs && node --check src/lib/leaderboard-safety.mjs`: PASS.
- `node --import tsx --test tests/home-read-api-contract.test.ts`: PASS, 5/5.
- `node --import tsx --test tests/home-read-api-contract.test.ts tests/page-home-shape.test.ts tests/leaderboard-shape.test.ts`: PASS, 17/17.
- `npm test`: PASS.
- `npm run lint`: PASS.
- `git diff --cached --check`: PASS.
- `npm run typecheck`: FAILS on pre-existing/out-of-scope missing `dotenv` / `googleapis` dependency/type issues and an implicit `any` in `src/lib/youtube.ts`.
- `npm run build`: FAILS on the same pre-existing typecheck blocker.

Independent review:

- Code review: APPROVE, zero blocking issues.
- Architecture review: CLEAR, zero blocking issues.
- Non-blocking future hardening: replace public `SELECT *` call responses with explicit allowlists.

Production action status:

No DB mutation, recompute, migration, extraction rerun, service restart, deploy, Netlify change, Whop change, Cloudflare change, secret change, or destructive git operation was performed.

Next required operator/provider actions before certification:

1. Review local patch.
2. Resolve or explicitly waive pre-existing typecheck/build blocker.
3. Approve merge/deploy/restart path if desired.
4. After approved live update, validate `/api/read/home` buckets against HH read API.
5. Certify production only from provider/runtime evidence, not from local patch existence.

Recommended validation after approved live rollout:

```bash
curl -s "https://ops-bridge.call-score.com/api/read/home?period=all_time" | jq '{
  period,
  emptyReason,
  counts,
  officialNames: [.officialRankedRows[].name],
  provisionalNames: [.provisionalRows[].name],
  watchlistNames: [.watchlistRows[].name],
  staleNames: [.staleRows[].name],
  excludedNames: [.excludedRows[].name],
  unsafeOfficial: [
    .officialRankedRows[]
    | select(
        (.total_calls // .totalCalls // 0) < 25
        or ((.accuracy_rank // .accuracyRank) == null)
        or ((.name // "" | ascii_downcase) | contains("altcoin daily"))
        or ((.youtube_handle // .handle // "" | ascii_downcase) | contains("altcoindaily"))
      )
  ]
}'
```

Expected:

- `unsafeOfficial = []`
- Altcoin Daily absent from `officialRankedRows`, `provisionalRows`, `watchlistRows`, and `leaderboard.rows`
- Altcoin Daily present only in `excludedRows` if present
- Alex Becker absent from `officialRankedRows` while stale/low-N
- MoneyZG absent from `officialRankedRows` while low-N
- Crypto Inspector absent from `officialRankedRows` while low-N
- 30d `officialRankedRows = []`
- 30d `emptyReason = "PENDING_MATURITY"`

---

## 15. Non-Negotiable Safety Rules

Do not:

- print secrets
- print connection strings
- dump raw env JSON
- run migrations
- mutate DB
- recompute stats
- rerun extraction
- deploy without approval
- restart services without approval
- mutate Whop pricing/payment/plans without approval
- merge without approval
- reset `/opt` blindly
- merge/rebase divergent HH local master blindly
- restore Neon as canonical
- expose raw PostgreSQL
- set Netlify `DATABASE_URL` / `POSTGRES_URL` to HH localhost
- use Tailscale-only URLs from Netlify
- add `next.config` lint/type suppression without explicit approval
- silently change methodology

Do:

- move directly
- keep evidence redacted
- certify only what is proven
- keep HH pgsql as canonical DB language
- use Thread 1 for HH runtime/DB proof
- use Thread 2 for provider proof
- prefer minimal, reversible, auditable actions
- stop public damage before recomputing data machinery
- keep Altcoin Daily categorically excluded from creator rankings

---

## 16. Codex Handover Summary

The immediate problem is not missing call data. HH PostgreSQL has `16,023` raw calls, `7,947` all-time public eligible calls, and `2,785` 12m public eligible calls.

The current product failure is that stale, low-N, excluded, and semantically unsafe `creator_stats` rows are serialized as official public leaderboard ranks.

The first patch must be the read API safety contract:

- bucket rows into `officialRankedRows`, `provisionalRows`, `watchlistRows`, `staleRows`, `excludedRows`, `pendingMaturityRows`;
- enforce official thresholds;
- exclude Altcoin Daily in every identifier format;
- block stale creators from official ranking;
- block null-rank and zero-call official rows;
- disable official 30d ranking for now;
- fix counts so they reflect public/bucketed eligibility, not raw `creator_stats` rows;
- replace unsafe predicates: `score IS NOT NULL` and confidence `>= 0.65`.

2026-06-11 local update:

The first patch has been implemented locally and staged. It remains non-production until reviewed, approved, merged/deployed/restarted through the proper provider/runtime channels, and validated against live HH read API output.

Do not recompute stats as part of this first fix.

After this patch, update the frontend to respect the new buckets. Then move exclusion logic into a canonical shared policy. Only after explicit approval should stats writer semantics, recompute, 30d redesign, creator freshness repair, or identity normalization be executed.

Altcoin Daily is categorically excluded because it is a news/media channel, not a target creator. It must never appear in creator rankings.

---

## 17. Follow-Up PR Order After This Patch

### P1: Frontend Display Contract

- Homepage consumes `officialRankedRows` only for official rankings.
- Other buckets rendered separately or hidden by product decision.
- Excluded rows hidden from public leaderboard.
- Stale/provisional/pending maturity rows not displayed as official rank.

### P2: Shared Canonical Exclusion Policy

- Move exclusion logic into shared canonical policy utility.
- Use across read API, frontend public filtering, `creator_stats` rank assignment, future creator admission, and admin/audit output.

### P3: `creator_stats` Period Semantics And Ranking Writer

- `all_time = all historical public-eligible calls`.
- `12m = public-eligible calls within last 12 months`.
- `90d = mature public-eligible calls in defined 90d methodology`.
- `30d = disabled or pending until redesigned`.
- Assign `accuracy_rank` only when threshold/exclusion/freshness/target gates pass.
- Requires approval before recompute.

### P4: Stats Recompute After Explicit Approval

- Validate low-N ranks are gone.
- Validate Altcoin Daily has no `accuracy_rank`.

### P5: 30d Redesign

- Preferred later option: calls that matured in last 30 days.
- Approximate window: `call_date between now() - interval '60 days' and now() - interval '30 days'`.
- Do not sneak in 7d horizon without methodology approval.

### P6: Creator Freshness Repair

- Refresh videos, transcripts, call extraction, prices, scores, recompute only after explicit approval.

### P7: Identity Normalization

- `display_name`
- `normalized_name`
- `youtube_handle_normalized`
- `youtube_channel_id`
- `creator_type`
- `exclusion_reason`
- alias list


---

## 17A. Post-PR40 Merge Update — 2026-06-11

PR #40, **Add leaderboard read API safety and frontend bucket contract**, has been merged to `master`.

- Merge commit: `b18cc9e05187da3c85a3768ece7a26cb51338633`
- Branch commit: `a3f9ddb94016fc8f3e4818e1faaf827131431fb1`
- Status: MERGED YES
- Canonical host deploy status: REQUIRES VERIFICATION
- Production HH read API runtime status: REQUIRES VERIFICATION
- Production public leaderboard certification: NO — not certified until live `/api/read/home` and homepage checks pass.

Validation before merge:

- `git diff --cached --check` — pass
- `node --test tests/leaderboard-safety.test.mjs` — pass
- `node --import tsx --test tests/home-read-api-contract.test.ts tests/page-home-shape.test.ts tests/leaderboard-shape.test.ts` — pass
- `npm test` — pass
- `npm run lint` — pass
- `npm run typecheck` — pass after installing already-declared dependencies locally
- `npm run build` — pass
- `node --check src/scripts/callscore-read-api-server.mjs` — pass
- `node --check src/lib/leaderboard-safety.mjs` — pass

Provider status observed before merge:

- Netlify deploy preview for PR #40: success (`https://deploy-preview-40--call-score.netlify.app`)
- Vercel status: failing because account is blocked; Vercel remains deprecated and non-canonical.

Important certification boundary:

PR #40 productionizes the code path in git, but does **not** by itself certify runtime production behavior. Certification still requires provider/runtime proof that the production frontend and HH read API are running the merged code and that live responses satisfy the bucket contract.


## 17B. Shared Creator Eligibility Policy Merge Update — 2026-06-11

PR #41, **Centralize creator ranking eligibility policy**, has been merged to `master`.

- Merge commit: `5673c256f8c3ab12126162fd283e7652d98ed759`
- Branch commit: `0df49cff58f2f0f1e31e27f30805c534a4ef2efc`
- Status: MERGED YES
- Canonical host deploy status: REQUIRES VERIFICATION
- Production runtime certification: not applicable for stats-writer until a future writer patch consumes the policy and an approved recompute is performed.

Merged scope:

- Added `src/lib/creator-eligibility-policy.mjs` as the canonical shared product policy utility.
- Added `src/lib/creator-eligibility-policy.d.ts` for TypeScript consumers.
- Moved Altcoin Daily and non-target/news/media/aggregation/contaminated/duplicate/ambiguous creator exclusion logic out of leaderboard-specific code.
- Kept `src/lib/leaderboard-safety.mjs` as the read/API classifier while importing and re-exporting shared policy functions for compatibility.
- Added `tests/creator-eligibility-policy.test.mjs`.

Validation before merge:

- `node --test tests/creator-eligibility-policy.test.mjs tests/leaderboard-safety.test.mjs` — pass
- `node --import tsx --test tests/home-read-api-contract.test.ts tests/page-home-shape.test.ts tests/leaderboard-shape.test.ts` — pass
- `npm test` — pass
- `npm run lint` — pass
- `npm run typecheck` — pass
- `npm run build` — pass
- `node --check src/lib/creator-eligibility-policy.mjs` — pass
- `node --check src/lib/leaderboard-safety.mjs` — pass

Provider status observed before merge:

- Netlify deploy preview for PR #41: success (`https://deploy-preview-41--call-score.netlify.app`)
- Vercel status: failing because account is blocked; Vercel remains deprecated and non-canonical.

Status boundary:

- Shared policy: MERGED YES
- Production read/API/UI behavior: still requires live endpoint/homepage certification after deployment.
- Stats-writer enforcement: not yet; future patch must consume this policy in rank assignment before approved recompute.

## 17C. Whop-Auto Certification Pack Merge Update — 2026-06-11

PR #42, **Add Whop-auto commerce certification pack**, has been merged to `master`.

- Merge commit: `8d9d9b24185c40790bdd894b5cc8b09a8a514760`
- Branch commit: `32262ee7886644fb56d38130eaeece1f482f44ab`
- Status: MERGED YES
- Canonical host deploy status: REQUIRES VERIFICATION
- Live Whop provider proof: REQUIRES VERIFICATION

Merged scope:

- Added `docs/ops/whop-auto-certification.md` as the non-mutating Whop commerce-live proof pack.
- Extended checkout route tests so all four revenue plan checkout URLs are covered: pro monthly, pro annual, alpha monthly, alpha annual.
- Added Whop webhook route tests for unsigned rejection, signed JSON acknowledgement, and invalid JSON rejection.
- Added a certification-pack test that keeps required Whop proof points anchored in docs.

Validation before merge:

- `node --import tsx --test tests/checkout-route.test.ts tests/whop-webhook-route.test.ts tests/whop-certification-pack.test.ts tests/whop-oauth.test.ts tests/auth.test.ts tests/premium.test.ts tests/post-checkout-ux.test.ts tests/site-url.test.ts` — pass
- `git diff --check` — pass
- `npm test` — pass
- `npm run lint` — pass
- `npm run typecheck` — pass
- `npm run build` — pass

Provider status observed before merge:

- Netlify deploy preview for PR #42: success (`https://deploy-preview-42--call-score.netlify.app`)
- Vercel status: failing because account is blocked; Vercel remains deprecated and non-canonical.

Status boundary:

- Certification pack: MERGED YES
- Live Whop dashboard settings: not provider-certified by this repo patch
- Live checkout URLs: not provider-certified by this repo patch
- Live entitlement: not provider-certified by this repo patch
- Whop pricing/product/plan/payment settings: not mutated



## 17D. Homepage Legacy HH Compatibility Restore — 2026-06-11

PR #44, **Restore homepage data from legacy HH read payload**, has been merged to `master`.

- Merge commit: `ad942fdf0579d11faf6a93b4063fdd78a4a6c507`
- Status: MERGED YES
- Production homepage status: VERIFIED HTTP 200 after merge
- Native HH read API bucket status: NO — live HH read API still returns legacy flat `leaderboard.rows`
- Homepage safety status: DEPLOYED / REPORTED SAFE through compatibility bucketing

Verified live behavior after PR #44:

- Homepage returns HTTP 200.
- Homepage shows creators again; safe examples visible include Cilinix Crypto, Crypto Rover, CryptosRUs, Lark Davis, Discover Crypto, and Crypto Banter.
- Unsafe examples are absent from the public official leaderboard: Altcoin Daily, Alex Becker, MoneyZG, Crypto Inspector.
- “No official ranked creators” no longer appears.

Important boundary:

- The homepage is currently safe because it re-buckets legacy HH rows before rendering.
- The HH read API runtime still needs native bucketed contract deployment/restart/certification.
- The compatibility path must not be removed until `officialRankedRows`, `provisionalRows`, `watchlistRows`, `staleRows`, `excludedRows`, and `pendingMaturityRows` are served natively by HH read API in production.

## 17E. Methodology / Rubric Certification Update — 2026-06-11

PR #45, **Clarify CallScore methodology and creator rank contract**, has been merged to `master`.

- Merge commit: `93e87d9bc9b649b421571f0314fa6def290fddd1`
- Branch commit: `e0bf4a8429f8e0f7daf8a78bb9c4fb91ba1d77b2`
- Status: MERGED YES
- Canonical host deploy status: REQUIRES VERIFICATION
- Production methodology-page certification: DEPLOYED REQUIRES VERIFICATION

Scope:

- Audited implemented call scoring, creator ranking, read API safety, homepage compatibility, and public methodology copy.
- Added `docs/methodology-rubric-certification.md` as the current methodology audit and approval-gated v2 plan.
- Added `src/lib/methodology-rubric.ts` to define public methodology states, official thresholds, current ranking method, and v2 recommendation without changing production ranking behavior.
- Updated `/methodology` copy to distinguish Call Score from Creator Rank Score and to document official/provisional/watchlist/stale/excluded/pending-maturity states.
- Added `tests/methodology-rubric.test.ts`.

Current methodology verdict:

```text
17 official creators: ACCEPTABLE WITH PRODUCT COPY CHANGES.
```

Reason:

A small official leaderboard is commercially acceptable when official ranking is explicitly presented as a strict eligibility state rather than the full tracked-creator universe. Live HH legacy all_time payload has 100 rows. Frontend compatibility bucketing classifies:

- officialRankedRows: 17
- provisionalRows: 29
- watchlistRows: 53
- excludedRows: 1
- staleRows: 0, because legacy HH payload does not include freshness fields
- pendingMaturityRows: 0 for all_time

Known methodology gaps:

- HH read API runtime still does not serve native buckets.
- `creator_stats.alpha_score` currently stores average 0–100 Call Score despite legacy naming.
- Stats writer thresholds are not aligned with read/UI safety thresholds.
- Score lifecycle and score value are still conflated in writer/count paths because stored `score = 0` can mean unscored placeholder.
- 30d official ranking remains disabled and methodology redesign is approval-gated.
- Creator-owned call attribution needs first-class lifecycle/policy support before methodology v2 certification.

Certification deltas:

| Certification | Status |
| --- | --- |
| Call scoring methodology | PARTIAL — implemented and now documented more accurately; lifecycle/value split pending |
| Creator ranking methodology | PARTIAL — read/UI eligibility strict; stats writer/source alignment pending |
| 17 official creator explanation | MERGED YES via PR #45 — documented from live HH compatibility bucketing |
| Public methodology page accuracy | MERGED YES via PR #45 (`93e87d9`); deploy/certification pending |
| Score lifecycle vs score value | NO / APPROVAL-GATED — requires schema/writer/recompute plan |
| Native HH read API bucket contract | MERGED CODE; RUNTIME NOT CERTIFIED |
| Homepage compatibility bucketing | DEPLOYED / REPORTED SAFE; keep until native HH buckets are live |
| 30d methodology | APPROVAL-GATED; official ranking disabled |

Approval gates remain unchanged: no production DB mutation, migration, stats recompute, extraction rerun, HH restart, provider mutation, or methodology-changing live ranking recompute without explicit approval.



## 17F. End-To-End Data Freshness And Worker Certification — 2026-06-11

Status: READ-ONLY CERTIFICATION COMPLETE / DATA FRESHNESS NOT CERTIFIED.

Scope:

- Repo/worktree inspected on `master` at `15233ab06ca12b4b137bddd5181a057a19a12ff1`.
- HH runtime inspected read-only: systemd status, process list, Docker status/log tail, public HH read API, public homepage, and SELECT-only PostgreSQL audit.
- No production DB mutation, migration, recompute, extraction rerun, enqueue, restart, deploy, provider change, secret change, or destructive git operation was performed.

Runtime/service findings:

- `callscore-enqueue.service`: active/running since 2026-06-09 18:37:22 BST.
- `callscore-read-api.service`: active/running since 2026-06-09 20:29:00 BST, but live public route still returns the legacy flat `leaderboard.rows` contract.
- `hermes-worker.service`: systemd wrapper active/exited; Docker container and `node --import tsx src/scripts/hermes-worker.ts --poll-ms 15000` process are running.
- Worker DB connectivity proof: Docker log shows `worker_start` and `database_ok` on 2026-06-11 05:49:37Z.
- Queue proof: latest persisted pipeline job/event is job `1819`, `candle_refresh`, succeeded at 2026-06-09 17:37:33Z. No newer persisted pipeline job was found.

HH PostgreSQL findings:

- DB identity: `callscore` / `public` on `::1:5432` via `callscore_app`.
- Creators in DB: 197 total, 178 with videos, 95 with calls, 84 with positive creator_stats.
- Videos: 14,611 total; latest published video 2026-05-31T23:16:01Z; latest inserted video 2026-06-01T00:00:24Z.
- Video freshness: 145 creators fresh within 30d, 154 within 90d, 158 within 180d, 39 stale/missing by latest video date.
- Transcripts: 9,299 videos with transcript; latest transcript attempt 2026-06-03T07:18:51Z; only 3 of 1,353 videos published in the last 30 days have transcripts/extraction complete.
- Calls: 16,023 raw calls; latest call date 2026-05-15T00:00:00Z; latest call insert 2026-05-25T03:05:35Z.
- Scoring: 8,589 calls meet extraction confidence `>= 0.70`; 7,947 calls meet the temporary public predicate `score > 0 AND extraction_confidence >= 0.70`; latest public-scored call date 2026-05-08T19:14:38Z; latest public-scored insert 2026-05-25T03:04:45Z.
- `creator_stats`: latest update 2026-06-09T02:05:37Z. `all_time` has 197 rows, 58 ranked rows, 33 rows with `total_calls >= 25`, 113 zero-call rows, and 139 null-rank rows. `30d` has 197 rows, 0 ranked rows, and all rows zero-call/null-rank.

Current public read/API findings:

- `https://ops-bridge.call-score.com/api/read/home?period=all_time|12m|90d|30d` returns HTTP 200 but still exposes legacy keys only: `ok`, `counts`, `leaderboard`.
- Native bucket keys are not present in the HH runtime response.
- Legacy `counts` are stale/unsafe in runtime: `publicScoredCalls=16023`, `scoredCalls=16023`, `confidencePassCalls=14801`, matching the old `score IS NOT NULL` / `extraction_confidence >= 0.65` semantics rather than the merged safety predicate.
- Homepage remains safe because Netlify frontend compatibility bucketing reclassifies legacy rows before rendering official rankings.

17 official creator explanation from HH DB + current classifier:

For `all_time` creator_stats rows, applying the current safety classifier with DB freshness fields produces:

- total rows: 197
- officialRankedRows: 17
- provisionalRows: 27
- watchlistRows: 132
- staleRows: 20
- excludedRows: 1
- pendingMaturityRows: 0
- publicEligibleCalls represented by classified creator_stats rows: 2,357

The official set is small because official rows must be non-excluded, non-stale, non-null-rank, above the all-time threshold of 50 calls, and above the hard floor of 25 calls. The largest exclusion examples remain correct:

- Altcoin Daily is excluded by policy but still has `creator_stats` ranks at source for all_time/90d, so source-writer and recompute repair remain required.
- Alex Becker is stale and low-N, therefore not official.
- MoneyZG, Crypto Inspector, and other low-N ranked source rows are provisional/watchlist, not official.

Verdict on 17 official creators:

`PARTIAL / NOT FINAL-CERTIFIED`.

The 17-count is methodologically valid under the current read/UI safety gates, but end-to-end data freshness is not certified. Recent videos are not consistently converting into transcripts/extractions/calls/scores, and the HH read API runtime is still legacy. The official count may be correct as a safety output, but it is not yet certified as a complete current-market coverage output.

Public count mismatch resolution:

- Homepage `197 creators tracked` is DB-derived from HH PostgreSQL `COUNT(*) FROM creators`.
- Methodology-page `123` was the repo-maintained static seed/admission baseline from `TRACKED_CREATOR_COUNT`.
- Public copy should not label the seed-list count as live tracked creators. It is now labelled as `creator seed list` with explanatory copy.
- OpenGraph static card removed stale scored-call style counting and now avoids fake live-count claims.

Updated certification deltas:

| Certification | Status |
| --- | --- |
| Worker process running | YES — Docker/node worker process running and DB connection OK |
| Scheduled jobs current today | NO — latest persisted job was 2026-06-09T17:37:27Z |
| Videos fresh today | PARTIAL — latest video inserted 2026-06-01; latest published 2026-05-31 |
| Transcripts fresh today | NO — latest transcript attempt 2026-06-03; 30d transcript/extraction coverage is 3/1,353 |
| Calls fresh today | NO — latest call inserted 2026-05-25; latest call date 2026-05-15 |
| Scoring fresh today | NO — latest public-scored call insert 2026-05-25 |
| `creator_stats` fresh today | PARTIAL — latest stats update 2026-06-09, but source semantics still unsafe and source ranks include excluded/low-N rows |
| HH read API native bucket contract | NO — runtime still legacy flat `leaderboard.rows` |
| Homepage current data safe | YES for public official rendering through compatibility bucketing |
| Homepage current data freshness certified | NO |
| 17 official creators acceptable | PARTIAL — methodologically safe, not complete-market certified |
| Public counts/copy consistency | LOCAL PATCH YES — methodology seed-list label and OpenGraph static count claim corrected |

Required next hard target:

`Pipeline Freshness Recovery Plan` — after explicit approval, repair the stopped/stale upstream pipeline without recompute-by-surprise: prove scheduler enqueue cadence, restore transcript/extraction job production, then run an approval-gated freshness catch-up and separately approval-gated stats recompute.

Approval gates remain unchanged: no production DB mutation, migration, stats recompute, extraction rerun, enqueue, HH restart, provider mutation, or methodology-changing live ranking recompute without explicit approval.


## 18. Next UltraGoal — Revenue-Operations Certification Bridge

### Title

`UltraGoal: Revenue-Operations Certification Bridge`

### One-Sentence Definition

Move CallScore from local leaderboard/read/UI safety patches to an approval-gated, production-certified product surface plus a ready-to-execute commerce, data-correction, and autonomous-operations certification layer.

### Why This Is The Correct Next Goal

The project has crossed the first local safety threshold: unsafe leaderboard rows are blocked in code, and the homepage contract is locally patched to consume `officialRankedRows`. The next meaningful move is not another isolated UI tweak. It is a certification bridge that proves the product surface in production, locks the database/data contract plan, prepares the stats-writer repair without unauthorized recompute, and opens the Whop / Art of War / Hermes operational proof track.

This goal unlocks:

- trustworthy public leaderboard certification;
- production read API / homepage correctness proof;
- a documented and approval-ready stats semantics repair path;
- shared creator eligibility/exclusion policy;
- Whop commerce-live proof;
- autonomous operations workflows for data refresh, safety checks, revenue events, and growth feedback.

### Detailed Scope

#### A. Leaderboard Correctness Certification

- Review and merge the local read API safety contract only after explicit approval.
- Productionize the HH read API safety contract only after explicit approval.
- Verify `/api/read/home?period=all_time`, `12m`, `90d`, and `30d`.
- Confirm `leaderboard.rows` contains only `officialRankedRows`.
- Confirm homepage official rankings use only `officialRankedRows`.
- Confirm Altcoin Daily is absent from public ranking buckets and appears only in `excludedRows` if present.
- Confirm stale, low-N, null-rank, zero-call, and pending-maturity rows are never official.
- Confirm counts match bucketed/public-safe data.

#### B. Frontend Display Contract

- Keep homepage and leaderboard UI on the bucketed API response.
- Keep `provisionalRows`, `staleRows`, `watchlistRows`, `pendingMaturityRows`, and `excludedRows` out of official ranking components.
- Keep 30d in pending-maturity / unavailable state until methodology is redesigned.
- Remove or rewrite public UI language that overclaims unsafe ranking semantics.

#### C. Database And Data Correctness Certification

- Verify HH PostgreSQL / pgsql is still the canonical production DB.
- Verify no Neon fallback or provider drift is active in production paths.
- Document current `creator_stats` period semantics exactly as observed.
- Decide the stats-writer repair scope without recompute.
- Prepare the approved next plan for:
  - period semantics;
  - official/provisional thresholds;
  - exclusion enforcement;
  - freshness gates;
  - rank nulling for ineligible creators.
- Provide validation SQL and expected results.
- Do not recompute stats without explicit approval.

#### D. Canonical Exclusion And Creator Eligibility Policy

- Move Altcoin Daily and future exclusions into a shared canonical policy utility.
- Define target creator eligibility:
  - accountable creator identity;
  - own market opinion / call ownership;
  - sufficient public-eligible sample;
  - freshness;
  - not contaminated, duplicated, or ambiguous.
- Define non-target classes:
  - news/media channels;
  - aggregators;
  - contaminated call sources;
  - duplicate/alias identities;
  - ambiguous/non-accountable creators.

#### E. 30d Methodology

- Keep official 30d leaderboard disabled.
- Document future choices without changing methodology silently.
- Preferred later design: “calls matured in the last 30 days.”
- Do not introduce shorter return horizons without explicit methodology approval.

#### F. Whop-Auto Revenue Path

- Verify Whop checkout flows.
- Verify entitlement verification.
- Verify gated product behavior.
- Verify success/cancel routes.
- Verify no stale provider URLs remain.
- Verify autonomous Whop event handling where applicable.
- Define exact proof for `CERTIFY WHOP COMMERCE LIVE: YES` and `CERTIFY WHOP-AUTO: YES`.

#### G. Art Of War Autonomous Growth Loop

Prove the loop design and approval boundaries for:

- campaign generation;
- audience targeting;
- content / offer iteration;
- conversion measurement;
- feedback into product/growth strategy;
- operator approval gates for spend, provider mutation, messaging, and public launch;
- no unsafe autonomous spend or provider mutation without approval.

#### H. Agentic Workflow Operationalization

Define, test, or prepare operating playbooks for:

- scheduled data refresh;
- Hermes worker execution;
- scoring / matching / ML verification;
- read API health;
- leaderboard safety checks;
- Whop entitlement checks;
- revenue event logging;
- alerting;
- daily/weekly certification reports;
- regression detection;
- recovery playbooks.

---

## 19. Definition Of Done For The Next UltraGoal

The `Revenue-Operations Certification Bridge` is done when all are true:

1. Local patches for read API safety and frontend safe bucket display are PR-ready and reviewed.
2. Production rollout instructions exist with explicit approval gates for merge, deploy, and read API restart.
3. Non-production validation commands are complete and passing except documented pre-existing typecheck/build blockers.
4. Production validation checklist exists for all read API periods.
5. Database/provider certification checklist confirms HH pgsql canonicality and identifies any provider drift.
6. Stats-writer correction plan is precise enough to implement, with no recompute performed.
7. Shared eligibility/exclusion policy patch plan is ready.
8. 30d remains disabled as official and has a documented future methodology decision.
9. Whop commerce-live proof checklist is execution-ready.
10. Art of War autonomous growth loop proof checklist is execution-ready.
11. Agentic operations workflow map exists with owners, checks, alerts, and recovery playbooks.
12. Updated certification matrix separates local, unmerged, deployed, reported, and production-certified states.

---

## 20. Phase-By-Phase Execution Plan

### Phase 1 — Patch Review And Merge Readiness

**Objective:** Make existing local patches PR-ready without production action.

**Exact actions:**

- Review staged changes.
- Split into coherent commits/PR sections if desired:
  - read API safety contract;
  - frontend display contract;
  - canonical plan update.
- Resolve or document pre-existing typecheck/build blockers.
- Run targeted tests and lint.

**Allowed:** local inspection, local edits, tests, lint, typecheck/build attempts, PR description drafting.

**Forbidden:** push, merge, deploy, restart, provider mutation, DB mutation, recompute.

**Likely touched files:**

- `src/lib/leaderboard-safety.mjs`
- `src/scripts/callscore-read-api-server.mjs`
- `src/app/page.tsx`
- `src/lib/home-read-api-contract.ts`
- `src/lib/leaderboard-safety.d.ts`
- `tests/leaderboard-safety.test.mjs`
- `tests/home-read-api-contract.test.ts`
- `docs/plans/2026-06-11-callscore-canonical-master-plan.md`

**Validation commands:**

```bash
node --test tests/leaderboard-safety.test.mjs
node --import tsx --test tests/home-read-api-contract.test.ts tests/page-home-shape.test.ts tests/leaderboard-shape.test.ts
npm test
npm run lint
npm run typecheck
npm run build
git diff --cached --check
```

**Expected outputs:** targeted tests, `npm test`, lint, and diff check pass; typecheck/build either pass or fail only on documented pre-existing blockers.

**Approval gate:** explicit approval before push/merge/deploy/restart.

**Rollback plan:** revert local commits or branch; no production rollback because no production action in this phase.

**Certification criteria:** `READ API SAFE BUCKET CONTRACT: LOCAL PATCH YES`; `FRONTEND SAFE BUCKET DISPLAY: LOCAL PATCH YES`.

### Phase 2 — Approval-Gated Production Rollout Plan

**Objective:** Prepare exact production rollout without executing it.

**Exact actions:**

- Produce merge/deploy/restart checklist.
- Identify who owns Thread 1 runtime restart and Thread 2 provider deploy proof.
- Define pre/post checks.
- Define rollback steps.

**Allowed:** documentation, command drafting, dry-run-safe local checks.

**Forbidden:** actual merge, deploy, restart, provider mutation.

**Validation commands after approval only:**

```bash
curl -s "https://ops-bridge.call-score.com/api/read/home?period=all_time" | jq '.period,.counts,.officialRankedRows,.excludedRows'
curl -s "https://ops-bridge.call-score.com/api/read/home?period=12m" | jq '.period,.counts,.officialRankedRows,.excludedRows'
curl -s "https://ops-bridge.call-score.com/api/read/home?period=90d" | jq '.period,.counts,.officialRankedRows,.excludedRows'
curl -s "https://ops-bridge.call-score.com/api/read/home?period=30d" | jq '.period,.emptyReason,.officialRankedRows,.pendingMaturityRows'
```

**Expected outputs:** unsafe official rows array is empty; 30d official rows empty with `PENDING_MATURITY`.

**Approval gate:** explicit approval for merge/deploy/restart.

**Rollback plan:** revert deployment to previous Netlify deploy and restart prior HH read API service version if needed.

**Certification criteria:** production read API and homepage evidence captured.

### Phase 3 — Database / Stats Semantics Audit Plan

**Objective:** Move from read-layer mitigation to source-of-truth repair plan without mutation.

**Exact actions:**

- Write read-only SQL audit pack for:
  - HH DB identity;
  - `creator_stats` periods;
  - low-N official ranks;
  - Altcoin Daily rank leakage;
  - stale creator official ranks;
  - 30d emptiness.
- Document observed semantics and required writer changes.
- Prepare stats-writer PR plan.

**Allowed:** read-only SQL, code inspection, docs, tests.

**Forbidden:** recompute, migrations, write SQL, extraction/rerun.

**Validation SQL:**

```sql
SELECT current_database(), current_schema(), inet_server_addr(), inet_server_port(), current_user;

SELECT period,
       COUNT(*) FILTER (WHERE accuracy_rank IS NOT NULL) AS ranked,
       COUNT(*) FILTER (WHERE accuracy_rank IS NOT NULL AND total_calls < 25) AS ranked_lt_25,
       COUNT(*) FILTER (WHERE total_calls = 0) AS zero_call_rows
FROM creator_stats
GROUP BY period
ORDER BY period;

SELECT cs.period, cs.accuracy_rank, c.name, c.youtube_handle, cs.total_calls
FROM creator_stats cs
JOIN creators c ON c.id = cs.creator_id
WHERE lower(c.name) LIKE '%altcoin daily%'
   OR lower(replace(c.youtube_handle, '@', '')) = 'altcoindaily';
```

**Expected outputs:** audit evidence, no mutation, exact repair scope.

**Approval gate:** explicit approval before stats-writer implementation or recompute.

**Rollback plan:** not applicable for read-only audit; any future writer patch must include rollback/recompute recovery plan.

**Certification criteria:** `CREATOR_STATS SEMANTICS SAFE` remains NO until writer patch + approved recompute are proven.

### Phase 4 — Shared Creator Eligibility Policy Patch

**Objective:** Make exclusions and creator eligibility consistent across read API, frontend, stats writer, and future admission.

**Exact actions:**

- Add shared policy utility.
- Move Altcoin Daily exclusion there.
- Add target/non-target creator classifications.
- Update read API safety helper to use shared policy.
- Add tests.

**Allowed:** local code/tests.

**Forbidden:** DB schema changes or recompute.

**Likely touched files:**

- `src/lib/creator-eligibility-policy.ts`
- `src/lib/leaderboard-safety.mjs`
- `tests/creator-eligibility-policy.test.ts`
- existing public integrity tests as needed

**Validation commands:**

```bash
node --import tsx --test tests/creator-eligibility-policy.test.ts
node --test tests/leaderboard-safety.test.mjs
npm test
npm run lint
```

**Certification criteria:** `ALTCOIN DAILY EXCLUDED FROM RANKINGS: LOCAL SHARED POLICY YES; PR/MERGE PENDING; PRODUCTION TBD`.

### Phase 5 — Whop Commerce Certification Pack

**Objective:** Define and collect safe proof needed for commerce-live certification.

**Exact actions:**

- Verify checkout URL inventory.
- Verify OAuth callback target.
- Verify success/cancel routes.
- Verify entitlement checks and gated behavior.
- Verify no stale provider URLs.
- Define Whop event handling proof.

**Allowed:** read-only/provider-safe inspection if credentials/tools are approved; local code inspection; checklist creation.

**Forbidden:** product/plan/price mutation, checkout mutation, webhook mutation, production customer-impacting tests without approval.

**Certification criteria:** `WHOP COMMERCE LIVE: YES` only after non-destructive proof or explicitly approved test transaction path.

### Phase 6 — Autonomous Operations And Art Of War Proof Map

**Objective:** Define the autonomous revenue operating system without unsafe autonomy.

**Exact actions:**

- Inventory scheduled jobs and Hermes worker proof requirements.
- Define daily/weekly safety checks.
- Define leaderboard regression checks.
- Define revenue event logging and alerts.
- Define Art of War campaign generation and feedback loop with approval gates.

**Allowed:** docs, local scripts/tests, dry-run checks.

**Forbidden:** autonomous spend, public posting, provider mutation, customer messaging without approval.

**Certification criteria:** `ART OF WAR LOOP: PARTIAL/READY FOR APPROVED DRY RUN`; `AUTONOMOUS REVENUE: NO` until full chain is proven.

---

## 21. Validation Command Pack

Local safe validation:

```bash
git status --short
git diff --cached --check
node --test tests/leaderboard-safety.test.mjs
node --import tsx --test tests/home-read-api-contract.test.ts tests/page-home-shape.test.ts tests/leaderboard-shape.test.ts
npm test
npm run lint
npm run typecheck
npm run build
```

Read API validation after approved rollout:

```bash
for period in all_time 12m 90d 30d; do
  curl -s "https://ops-bridge.call-score.com/api/read/home?period=${period}" | jq '{
    period,
    emptyReason,
    counts,
    officialCount: (.officialRankedRows | length),
    unsafeOfficial: [
      .officialRankedRows[]
      | select(
          (.total_calls // .totalCalls // 0) < 25
          or ((.accuracy_rank // .accuracyRank) == null)
          or ((.name // "" | ascii_downcase) | contains("altcoin daily"))
          or ((.youtube_handle // .handle // "" | ascii_downcase) | contains("altcoindaily"))
        )
    ],
    excludedNames: [.excludedRows[].name]
  }'
done
```

Database read-only audit after explicit approval for read-only SQL access:

```sql
SELECT current_database(), current_schema(), inet_server_addr(), inet_server_port(), current_user;

SELECT period,
       COUNT(*) FILTER (WHERE accuracy_rank IS NOT NULL) AS ranked,
       COUNT(*) FILTER (WHERE accuracy_rank IS NOT NULL AND total_calls < 25) AS ranked_lt_25
FROM creator_stats
GROUP BY period
ORDER BY period;
```

---

## 22. Approval Gates

Explicit approval is required before:

- pushing or merging branches;
- Netlify deploy or deploy promotion;
- HH read API restart;
- production DB mutation;
- migrations;
- stats recompute;
- extraction/transcript/video refresh reruns;
- Whop product/plan/price/checkout/webhook mutation;
- Cloudflare/DNS/secrets changes;
- public campaign launch, customer messaging, or paid spend;
- autonomous growth-loop execution that changes external state.

---

## 23. Risks And Non-Blocking Follow-Ups

### Current risks

- HH read API runtime still serves legacy flat `leaderboard.rows`; native bucket contract is merged in repo but not runtime-certified.
- Homepage compatibility bucketing is live/reported safe, but must remain until HH native buckets are certified.
- Methodology/rubric certification is local patch only until PR merge/deploy.
- `creator_stats` semantics remain unsafe at source until writer patch and approved recompute.
- Score lifecycle and score value remain conflated in writer/count paths.
- 30d methodology remains undefined beyond “official disabled.”
- Whop commerce proof is partial.
- Art of War loop is not certified.

### Non-blocking follow-ups

- Replace public `SELECT *` responses with explicit allowlists.
- Add automated canary test for read API buckets.
- Add scheduled leaderboard safety report.
- Add revenue event audit trail.
- Add daily certification summary artifact.

---

## 24. Updated Certification Matrix — Operational Bridge View

| Certification | Status |
| --- | --- |
| Canonical repo / branch | YES — `OmarA1-Bakri/CallScore` / `master`; recovery patch branch `callscore/data-pipeline-full-recovery` |
| Netlify production | YES canonical; latest deploy/provider status requires Thread 2 recheck after PR merge |
| `HH_READ_API_BASE` | REPORTED YES / VERIFIED VIA PUBLIC READ API — final provider env recheck still Thread 2 |
| HH PostgreSQL / pgsql | CERTIFIED — local HH PostgreSQL `callscore` via `callscore_app` on `::1:5432` |
| Neon canonical | NO |
| DB writer privileges | RECOVERED/CERTIFIED — minimum grants applied to `callscore_app` for pipeline application paths |
| Transcript provider path | BLOCKED BY COOKIE/BOT VERIFICATION — slow YT-DLP is canonical and code-supported; canary without a working cookie path records `bot_verification_required` |
| Scheduler/job cadence | INSTALLED / ACTIVE / CERTIFIED — `callscore-daily-pipeline.timer` runs bounded RSS discovery, slow transcripts, extraction, matching, scoring, and freshness check daily; Netlify wrapper cadence remains separate provider verification |
| Worker active processing | CERTIFIED — real `match_prices_batch` and `compute_scores` jobs completed on 2026-06-11; Docker worker rebuilt from current code |
| Video discovery freshness | RECOVERED — RSS catch-up wrote 1,232 eligible rows; latest video inserted 2026-06-11; 148 creators fresh within 30d |
| Transcript freshness | BLOCKED BY COOKIE — attempts run today through slow YT-DLP and classify `bot_verification_required`; transcript success remains stale until a working cookie path is supplied |
| Call extraction freshness | PARTIAL RECOVERED — daily canary inserted two calls through app path; full transcript-driven catch-up depends on working YT-DLP cookies |
| Price matching/scoring freshness | PARTIAL RECOVERED — canary matched mature calls; source-safe recompute ran 2026-06-11 |
| `creator_stats` source safety | CERTIFIED — recompute produced 0 Altcoin Daily official ranks, 0 low-N official ranks, 0 zero-call official ranks, 30d official rows 0 |
| Read API safety contract | CERTIFIED — native HH runtime bucket keys live publicly; `leaderboard.rows` is a safe alias |
| Homepage leaderboard correctness | CERTIFIED SAFE DISPLAY; current-data certification remains PARTIAL until transcript catch-up completes |
| Frontend bucket display | CERTIFIED SAFE; consumes native buckets and retains compatibility fallback |
| Altcoin Daily exclusion | CERTIFIED in read/API/UI and source `creator_stats` after recompute |
| Low-N ranking block | CERTIFIED in read/API/UI and source `creator_stats` after recompute |
| 30d safety | CERTIFIED as `PENDING_MATURITY`; methodology redesign remains APPROVAL-GATED |
| Official creator count | 17 after latest canary/recompute — unchanged because no new transcript success; accepted as current strict-source output pending slow-YT-DLP cookie recovery |
| Website count correctness | PARTIAL — public API counts safe; final current-coverage count certification requires transcript catch-up |
| Freshness self-check | PR #50 PATCH YES / WARN — command reports grants, jobs, daily timer status, transcript backlog/status, timestamps, source unsafe ranks, native buckets, and exact YT-DLP bot/cookie warnings |
| Whop commerce | PARTIAL; WHOP-AUTO CERTIFICATION PACK MERGED YES via PR #42; PROVIDER PROOF REQUIRED |
| Whop-auto | PARTIAL; LIVE PROVIDER PROOF REQUIRED after data freshness blocker is removed |
| Art of War loop | NO / NOT CERTIFIED |
| Data freshness certification | PARTIAL — DB writer/video discovery/worker/source ranks/daily cadence recovered; slow-YT-DLP transcript success remains blocked by cookie/bot verification |
| Autonomous revenue | NO |

---

## 25. Next Codex Prompt For First Implementation Step Under This UltraGoal

```text
$ultragoal Revenue-Operations Certification Bridge — Phase 1 Patch Review And Merge Readiness

Work in the canonical CallScore repo/worktree on branch callscore/leaderboard-read-api-safety-contract.

Goal: make the existing local read API safety and frontend bucket-display patches PR-ready without any production-impacting action.

Scope:
- inspect staged changes;
- keep read API safety, frontend bucket display, and canonical plan update separated in the report;
- resolve only local code/test issues directly caused by these patches;
- do not fix unrelated pipeline/youtube typecheck blockers unless explicitly approved;
- add or adjust focused tests only if needed;
- produce exact PR summary and validation evidence.

Run:
- git status --short
- git diff --cached --check
- node --test tests/leaderboard-safety.test.mjs
- node --import tsx --test tests/home-read-api-contract.test.ts tests/page-home-shape.test.ts tests/leaderboard-shape.test.ts
- npm test
- npm run lint
- npm run typecheck
- npm run build

Do not:
- mutate production DB;
- run migrations;
- recompute stats;
- rerun extraction;
- restart services;
- deploy;
- change Netlify, Whop, Cloudflare, DNS, secrets, or infrastructure;
- push, merge, rebase, reset, or perform destructive git operations.

Deliver:
- changed files;
- behavior summary;
- test results;
- known pre-existing blockers;
- approval gates for merge/deploy/restart;
- rollback plan;
- certification matrix delta.
```
