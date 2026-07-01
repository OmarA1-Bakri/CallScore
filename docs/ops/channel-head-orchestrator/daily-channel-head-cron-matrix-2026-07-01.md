# CallScore Daily Channel-Head Cron Matrix — 2026-07-01

Kanban: `callscore-channel-orchestrator-retask-20260701` / `t_5b14f53b`

## Verdict

The correct model is one chronological intelligence spine, not independent blind platform crons.

Daily order:

1. Data freshness.
2. Markov creator trajectory intelligence.
3. Learning digest.
4. CMO editorial brief.
5. Visual/media packet.
6. YouTube/Whop/product packages.
7. Platform-native execution windows: X, LinkedIn, Reddit, community.
8. Midday learning synthesis.
9. PM engagement/follow-up.
10. Reviewer/safety/trust closeout.

## Existing Hermes cron coverage observed

Existing active jobs already cover pieces of the spine:

| Area | Existing job | Schedule | Status/role |
| --- | --- | --- | --- |
| candles | `callscore-core-candles operating graph` | `*/15 * * * *` | live data input |
| match | `callscore-core-match operating graph` | `30 3 * * *` | daily match pass |
| scores | `callscore-core-scores operating graph` | `45 3 * * *` | daily score pass |
| CMO | `CallScore twice-daily genuine social CMO loop` | `0 9,17 * * *` | twice-daily CMO packet |
| cooldown | `CallScore CMO cooldown catch-up watcher` | every 5m | catch-up loop |
| heartbeat | `CallScore agent heartbeat orchestrator` | every 60m | agent state heartbeat |
| board | `CallScore autonomy board dispatcher` | every 2m | Kanban progression |
| video | `Video scheduler operating graph` | `0 8 * * *` | YouTube/video schedule |
| video | `Video queue consumer operating graph` | every 5m | video queue worker |
| engagement | `CallScore engagement discovery scheduler` | `0 */2 * * *` | read-only profile/opportunity discovery |
| engagement | `CallScore engagement executor graph-owned` | `10 */2 * * *` | graph-owned engagement executor |
| Whop | `whop-daily-status` | `0 8 * * *` | read-only Whop status |
| website | `CallScore live website freshness proof` | `15 4 * * *` | live call-score.com proof, added in this implementation |
| codebase | `codebase-memory re-index watch` | every 60m | indexed-code awareness; currently last status error but MCP index is available |
| vault | `callscore-vault-hourly-sync` | every 60m | vault sync |

## Required daily channel-head cadence

### 03:00-04:00 — Data/Freshness

Owner: data channel head.

Must:
- refresh/verify candles, match, scores.
- prove live website/API data is fresh.
- write freshness receipt to shared team memory.

Current coverage:
- candles/match/scores cron exists.
- live website freshness proof cron now exists.

### 04:00-04:30 — Markov / Creator Trajectory

Owner: Markov/data science channel head.

Must:
- consume scored creator transitions.
- classify hot streak/cold streak/recovering/deteriorating/stable/volatile/stale.
- emit watchlist, anomalies, story candidates.
- write machine-readable results to SQL memory vault.

Gap:
- dedicated Markov daily cron still needed.

### 05:00 — Learning Digest

Owner: learning channel head.

Must:
- read yesterday’s assets, engagement, blocked receipts, experiments.
- read Markov outputs.
- write `learning_event.v1`, `learning_delta.v1`, `agent_performance_ledger.v1`, `experiment_result.v1` where applicable.
- update SQL memory vault.

Gap:
- dedicated learning digest cron still needed.

### 06:00 — CMO Editorial Brief

Owner: CMO channel head.

Must:
- choose daily thesis from data + Markov + learning + discourse.
- assign channel-native angles to X, LinkedIn, Reddit, YouTube, Whop.
- block if no real take.

Current coverage:
- CMO twice-daily packet exists at 09:00 and 17:00.

Gap:
- earlier daily editorial brief should feed platform heads before AM execution.

### 07:00 — Visual / Media Packet

Owner: visual/media through existing canonical owners, not new agents.

Must:
- create visual briefs/assets only when needed.
- write visual brief/QA/coherence receipts.

Gap:
- packet should be generated as part of CMO/campaign tasklist, not a new standing agent.

### 08:00 — YouTube Package

Owner: YouTube production cluster.

Must:
- script/package/thumbnail/publish package/analytics receipts.
- publish only if all YouTube gates pass.

Current coverage:
- video scheduler and video queue consumer exist.

### 08:30 — Whop/Product Window

Owner: Whop/commercial channel.

Must:
- produce copy/assets/FAQ/objection handling.
- no payment/product/customer/provider mutation without explicit gate.

Current coverage:
- Whop daily status exists.

### 09:00 — X AM Window

Owner: X channel head.

Must produce concrete outcome:
- original post if gates pass, or blocked/cooldown/final-draft receipt if not.
- 10-20 value comments when graph-owned engagement lane is permitted.
- discover profiles/topics to follow/watch.
- write findings/patterns to SQL memory vault.

Current coverage:
- CMO 09:00 packet.
- engagement discovery/executor every 2 hours.

Gap:
- X-specific channel-head tasklist should bind CMO angle + engagement/discovery + memory update.

### 10:30 — LinkedIn AM Window

Owner: LinkedIn channel head.

Must:
- one professional post if gates pass.
- 5-10 value comments.
- discover B2B people/orgs/topics.
- write objections/language to SQL memory vault.

### 12:00 — Reddit Window

Owner: Reddit channel head.

Must:
- discussion-first.
- 5-10 useful comments where rules allow.
- post only if community/rules/flair/owned-profile gates pass.
- write subreddit rules, questions, sentiment, objections to memory.

### 14:00 — Community / Whop / Support Intel

Owner: community + Whop + trust.

Must:
- collect support questions, objections, conversion friction.
- write non-public assets/learnings.

### 15:00 — Learning Midday Synthesis

Owner: learning channel head.

Must:
- merge morning platform findings.
- update SQL memory vault.
- feed PM channel heads.

### 17:00 — X PM Window

Owner: X channel head.

Must:
- second primary X window.
- original post if gates pass or blocked/cooldown receipt.
- 10-20 value comments if allowed.
- discovery and memory update.

Current coverage:
- CMO 17:00 packet.

### 18:00 — LinkedIn PM / Follow-up

Owner: LinkedIn channel head.

Must:
- post only if AM skipped or content warrants PM timing.
- otherwise comment/follow-up and memory update.

### 20:00 — Reddit / Community PM

Owner: Reddit/community.

Must:
- discussion follow-up.
- answer comments.
- collect objections.
- no promotional spam.

### 21:00 — Optional X Third Window

Owner: X channel head.

Only if:
- market/discourse signal is high, or
- earlier X run blocked/cooldown.

Not a blind quota.

### 22:00 — Reviewer / Safety / Trust Closeout

Owner: reviewer/safety/trust/compliance.

Must:
- verify receipts.
- check quality/originality/platform fit.
- catch spam patterns.
- queue next-day fixes.

## Missing cron classes

Still needed:

1. `callscore-channel-head-scheduler` — every 10-15m; script-only; launches one tmux channel-head lane by default; hard max 3.
2. `callscore-channel-task-planner` — daily 05:45; builds due channel tasklist from data/Markov/learning/cadence.
3. `callscore-markov-trajectory-daily` — daily 04:00; writes creator trajectory intelligence to SQL memory.
4. `callscore-learning-digest` — daily 05:00 and 15:00; writes learning deltas and channel guidance.
5. `callscore-channel-quality-review` — daily 22:00; verifies receipts/output and queues fixes.

## Quality loops that must apply to every channel head

Every platform run must write:

- input/context refs.
- draft/output artifact refs.
- platform-fit receipt.
- originality/same-shit memory receipt.
- visual/media receipts when media involved.
- provider/public path receipt or blocked/cooldown receipt.
- engagement/discovery findings.
- learning event/update into SQL memory.
- parent/reviewer verification status.

## Advice

This is the right architecture.

Do not make each channel cron independent. Keep one chronological spine and use the tmux scheduler to execute due channel-head tasks under caps.

X should run at least twice daily and optionally three times, but the invariant is concrete value + memory update, not blind posting quota.
