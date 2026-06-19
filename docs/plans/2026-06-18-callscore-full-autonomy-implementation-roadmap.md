# CallScore Full Autonomy Implementation Roadmap

Target mode: `FULL_AUTONOMOUS_BOUNDED_OWNED_GTM`

This roadmap turns the design in `docs/plans/2026-06-18-callscore-full-autonomy-channel-heads.md` into implementation phases with acceptance gates.

## Principle

Do not create another cron-shaped theatre layer. Full autonomy requires independent channel-head agents with soul, heartbeat, durable state, receipts, kill-switches, rollback, and policy enforcement.

## Phase 0 — Current safe baseline

Status: current state.

Capabilities already present:
- core data pipeline loops;
- Workplane status/gate model;
- GTM registry;
- canonical subagent roster;
- transcript cooldown posture;
- initial system ledger;
- channel-head soul and heartbeat design artifacts.

Acceptance:
- Workplane remains `OK`.
- Public verify passes.
- No unrestricted public/financial/provider/deploy mutation is introduced.

## Phase 1 — Contract artifacts and registry alignment

Files:
- `docs/ops/callscore-channel-head-souls.yaml`
- `docs/ops/callscore-full-autonomy-heartbeat-contract.md`
- `docs/ops/callscore-canonical-subagent-roster.md`
- `docs/plans/2026-06-18-callscore-full-autonomy-channel-heads.md`

Tasks:
- Keep channel-head souls versioned.
- Map every GTM channel row to a channel-head owner.
- Add future registry fields for `autonomy_mode`, `kill_switch_ref`, `policy_hash`, `max_posts_per_day`, and `budget_cap`.

Acceptance:
- YAML validates.
- Every channel-head has identity, mission, authority, memory policy, cadence, stop conditions.
- Restricted lanes remain gated.

## Phase 2 — Autonomy state schema

Tasks:
- Add migration for:
  - `agent_instances`
  - `agent_heartbeats`
  - `channel_tasks`
  - `autonomy_events`
  - `channel_publications`
  - `approval_packets`
  - `experiment_memory`
  - `incidents`
- Add TS models/helpers under `src/lib/autonomy/`.
- Add replay/idempotency helpers.

Acceptance:
- Migration has dry-run review and explicit approval before production DB mutation.
- Unit tests cover heartbeat write/read, stale lease reset, event append, idempotency block, replay dedupe.
- Missing kill-switch state blocks dispatch.

## Phase 3 — Supervisor and heartbeat CLI

Tasks:
- Create `src/scripts/autonomy-supervisor.ts`.
- Create `src/scripts/agent-heartbeat.ts`.
- Add scripts:
  - `autonomy:status`
  - `autonomy:heartbeat`
  - `autonomy:supervisor:once`
- Implement channel pause/degrade/dead state transitions.

Acceptance:
- Supervisor runs read-only by default.
- Missed-heartbeat simulation pauses dispatch.
- Global/per-channel kill switch blocks external actions.
- War Room status reports shipped/blocked/gated/heartbeat/kill-switch state.

## Phase 4 — Evidence broker

Tasks:
- Create `src/lib/autonomy/evidence-broker.ts`.
- Generate source-spanned evidence packets from HH Read API / HH Postgres public-safe rows.
- Assign evidence levels E0-E5.
- Block weak/stale evidence for public claims.

Acceptance:
- Every public claim maps to source span/hash.
- E0/E1 block; E2 draft-only; E3 aggregate/positive only; E4 named positive/neutral only; E5 gated.
- Public content cannot bypass data sentinel.

## Phase 5 — Dry-run channel-head runtime

Initial heads:
- `callscore-data-pipeline-sentinel`
- `callscore-compliance-linter-head`
- `callscore-artofwar-strategist`
- `callscore-x-linkedin-growth-head`
- `callscore-community-drops-head`
- `callscore-whop-commerce-head`

Tasks:
- Implement runtime wrappers that load the soul YAML and GTM registry.
- Each agent wakes, reads inputs, writes heartbeat, emits draft/blocked/sleep receipt.
- No external mutation.

Acceptance:
- All heads emit heartbeat packets.
- All external-action attempts downgrade to dry-run/blocked.
- Seven-day dry-run can start.

## Phase 6 — Adapter interfaces

Tasks:
- Define adapter interface: `health`, `dry_run`, `preflight`, `dispatch`, `readback`, `monitor`, `rollback`, `redact`, `idempotency_key`.
- Implement read-only/dry-run adapters first.
- Use Composio first for connected X/LinkedIn/Discord/etc where appropriate.

Acceptance:
- Adapter health/readback works without mutation.
- Provider errors do not retry external mutation.
- Idempotency reservations block duplicate payloads.

## Phase 7 — Controlled live canaries

Scope:
- one owned-public organic channel at a time;
- zero spend;
- Class A only;
- exact payload hash;
- preflight and rollback plan recorded.

Acceptance:
- Full receipt chain exists:
  1. candidate
  2. evidence
  3. risk review
  4. compliance
  5. preflight
  6. publish attempt
  7. provider ack
  8. readback verification
  9. monitoring
  10. War Room report
- First canary has no trust incident.
- Kill-switch and rollback drills pass.

## Phase 8 — Promotion to bounded full autonomy

Promotion criteria:
- 7 consecutive dry-run days.
- 100% risk golden pass.
- 100% missing-caveat block behavior.
- 100% named-negative gate behavior.
- 0 duplicate publish attempts in replay.
- 0 unsupported public claims.
- Postgres-first receipt ledger deployed and replay-tested.
- Heartbeat/watchdog failure drill passes.
- Kill-switch drill passes.
- Rollback drill passes.
- Channel adapter/auth verified in controlled mode.
- Transcript/source cooldown enforcement proven.
- Per-channel autonomous policy exists in registry.
- First controlled live pilot per channel completes without incident.
- War Room reports include shipped, blocked, gated, rollback, heartbeat, and kill-switch state.
- Operator approval receipt exists for promotion.

Result:
- Set allowed channel rows to `autonomy_mode: full_autonomous_bounded`.
- Start with only owned X/LinkedIn or owned Telegram/Discord.
- Leave sends/spend/Whop financial/provider/DB/deploy/credentials gated.

## Phase 9 — Learning loop

Tasks:
- Ingest metrics from X/LinkedIn/Discord/Telegram/PostHog/Whop read-only sources.
- Update `experiment_memory`.
- Generate daily War Room and weekly learning report.
- Adjust templates/cadence within caps.

Acceptance:
- Every autonomous action has measured outcome or explicit no-data reason.
- Agents learn from metrics but cannot expand their own authority.
- Policy changes require explicit review.

## Next executable task

Implement Phase 1 validation and Phase 2 schema plan in a separate implementation branch/worktree. Do not apply production DB migrations or start persistent agents until schema and drills are reviewed.

---

# 2026-06-19 Addendum — No-Founder Autonomous Trust Engine Workflows

This addendum answers the no-founder autonomy prompt and upgrades this existing roadmap instead of creating a parallel plan. It is implementation-ready, but it deliberately reuses the existing CallScore substrate first:

- Existing operational queue: `pipeline_runs`, `pipeline_jobs`, `pipeline_job_events`.
- Existing workflow ledger: `workflow_runs`, `workflow_node_runs`, `workflow_events`, `artifacts`, `artifact_links`, `agent_invocations`, `approval_gates`.
- Existing autonomy ledger: `agent_instances`, `agent_heartbeats`, `channel_tasks`, `autonomy_events`, `channel_publications`, `approval_packets`, `experiment_memory`, `incidents`.
- Existing product tables: `creators`, `videos`, `calls`, `candles`, `creator_stats`, `consensus_signals`, `feedback_reports`.
- Existing scripts: `discover:videos:rss-api`, `backfill:transcripts`, `extract:llm`, `match`, `score`, `pipeline:daily`, `pipeline:worker`, `freshness:check`, `verify:public`, `audit:pipeline`, `agents:heartbeat`.
- Existing public surfaces: leaderboard APIs, creator APIs, methodology page, public verification script.

Design invariant: ongoing workflows must not require Omar. Low-confidence work is suppressed, delayed, or routed to a non-founder review queue. Founder involvement is only product direction, rare strategy change, passive reporting, or emergency shutdown.

## Section 1 — Ranked autonomy backlog: top 10 workflows

| Rank | Workflow | Autonomy level | Commercial value | Founder involvement reduced | Required inputs | Outputs | Trigger | Confidence thresholds | Suppression rules | Escalation | Human role | Founder involvement required | Complexity | MVP |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Autonomous call extraction + validity classification | Suppress-on-uncertainty autonomous | Converts raw creator content into the product asset: verified calls | Removes manual call review/valid-vague decisions | `videos.transcript`, source metadata, extractor prompt/profile, supported-symbol list | `calls`, `ml_verification_runs`, `artifacts:candidate_calls/normalized_calls/validation_report` | queue + schedule | extraction >=0.78 publishable; 0.60-0.78 review/suppress; <0.60 suppress | no quote span, no timestamp, ambiguous asset/direction, vague claim, guest/news report | non-founder review queue for medium confidence + high impact only | data QA operator/reviewer | No | medium | Upgrade `extract:llm`, `ml-verifier`, `video_intelligence_workflow` to write suppression artifacts and never require approval by Omar |
| 2 | Autonomous market snapshotting + outcome resolution | Fully autonomous | Turns calls into measurable outcomes and proof | Removes daily monitoring and outcome resolution | `calls`, `candles`, symbol map, call_date, horizons | price snapshots, returns, alpha, hit_target, resolved outcome artifacts | schedule + queue | exact candle within tolerance; fallback tolerance <= configured max; outcome confidence >=0.95 | no market data, symbol mismatch, stale candle, missing call timestamp | none; suppress until data exists | none | No | low | Extend existing `refresh:candles`, `match`, `repair:price-at-call`, `score` path |
| 3 | Autonomous CallScore calculation + leaderboard publishing | Suppress-on-uncertainty autonomous | Core public trust surface and reason to buy/share | Removes score/leaderboard approval | resolved calls, scoring policy, sample-size floor, anomaly report | `creator_stats`, leaderboard API, score artifacts, audit receipt | schedule + event after score run | score confidence: effective_n >=30 MVP, >=100 strong, CI band shown; anomaly score < threshold | insufficient sample, scoring drift, unresolved dispute, anomaly, low evidence quality | non-founder review for high reputational movement anomaly | trust/review operator only when needed | No | medium | Use `compute-scores.ts`, `creator_stats`, `verify:public`; add publication gate artifact |
| 4 | Autonomous public creator profiles + SEO pages | Autonomous with non-founder review | Distribution, trust, and conversion pages at scale | Removes profile writing/updates | creator metadata, scored calls, evidence links, methodology fragments | creator profile JSON/page, SEO page artifacts, change receipts | event + weekly | profile publish >=0.85 evidence completeness; named negative language risk must be low | no scored sample floor, disputed creator, missing archive/evidence, impersonation risk | non-founder review queue for named/high-impact copy | content QA/reviewer | No | medium | Reuse `/api/creator/[id]`, public serializer, existing pages; generate artifacts first |
| 5 | Autonomous anomaly detection + rollback/suppression | Fully autonomous for suppression; non-founder review for restoration | Protects trust and lowers incident cost | Removes daily failure monitoring | pipeline metrics, score deltas, publication logs, provider health | incidents, suppression flags, rollback tasks, passive report | schedule + event | hard anomaly thresholds; confidence >=0.90 to auto-suppress | any severe drift, duplicate publish, evidence-chain break, market-data gap | non-founder restoration review | ops/trust operator | No | medium | Extend `freshness:check`, `audit:pipeline`, `incidents`, `channel_tasks` |
| 6 | Autonomous source discovery + transcript ingestion | Suppress-on-uncertainty autonomous | Increases creator/source coverage | Removes manual source/video collection | watchlists, RSS/API results, creator source config | `videos`, transcript worklist, pipeline jobs | schedule | source identity >=0.90; duplicate confidence >=0.95 | creator/source ambiguous, rate-limit, transcript provider cooldown, private source | none except persistent source ambiguity to non-founder queue | data ops reviewer optional | No | low | Use `discover:videos:rss-api`, `backfill:transcripts`, transcript worklist |
| 7 | Autonomous weekly reports + proof assets | Fully autonomous for aggregate; non-founder review for high-risk named | Marketing and retention loop | Removes weekly report writing | leaderboard deltas, score artifacts, public methodology, images | report artifacts, share cards, owned public posts | weekly schedule | aggregate claims >=0.90; named claims >=0.95 | low sample, disputed creator, unsupported trend, missing caveat | non-founder content review for sensitive named claims | content QA operator | No | low | Reuse social image packet, channel_publications, artifacts |
| 8 | Autonomous badges/shareable proof assets | Fully autonomous for positive/neutral badges | Creator-led distribution and proof loop | Removes manual asset generation | creator_scores, evidence level, sample-size/reliability band | badge image, badge URL, embed metadata, receipt | event after score/profile update | reliability band at least `provisional`; evidence >=E3 | unresolved dispute, low sample, negative/defamatory framing | none; suppress | none | No | medium | Generate badge artifacts off `creator_stats` and `artifacts` |
| 9 | Autonomous dispute intake + correction workflow | Autonomous with non-founder review | Trust moat and legal/reputation safety | Removes founder dispute triage | web form/email, disputed call/profile, evidence chain | dispute record, recheck artifact, corrected score/profile or queue item | event-based | auto-correct only if evidence error confidence >=0.95 | identity unverified, ambiguous evidence, legal threat, unresolved proof | non-founder trust queue | trust operator/reviewer | No | medium | Use `feedback_reports`, `incidents`, `artifacts`, add dispute view/table only if needed |
| 10 | Autonomous creator/community outbound generation | Draft-only autonomous until policy-send passes | Acquisition/revenue without manual drafting | Removes copywriting/list building, not final regulated sends | creator profiles, high-fit targets, approved templates, suppression list | outreach targets/messages, approval packet, send queue | weekly + event | target fit >=0.80, message policy >=0.95, evidence support >=0.90 | DNC/suppression hit, unverifiable recipient, claims risk, paid/DM gate missing | non-founder go/no-go send queue, never Omar | growth operator | No | medium | Reuse `channel_tasks`, `approval_packets`, Composio only after send policy exists |

## Section 2 — Top 5 workflows to implement first

Weighted score = 35% founder-involvement reduction + 25% commercial value + 20% trust/evidence value + 10% speed + 10% distribution potential. Scores are 1-10.

| Rank | Workflow | Founder reduction | Commercial | Trust/evidence | Speed | Distribution | Weighted score | Why first |
|---:|---|---:|---:|---:|---:|---:|---:|---|
| 1 | Call extraction + validity classification | 10 | 10 | 10 | 7 | 6 | 9.20 | Product truth starts here; it removes the most founder judgment |
| 2 | Market snapshotting + outcome resolution | 9 | 9 | 10 | 9 | 5 | 8.80 | Mostly exists; upgrades proof and reliability fast |
| 3 | CallScore calculation + leaderboard publishing | 9 | 10 | 9 | 8 | 8 | 9.00 | Converts scored calls into the public product and conversion surface |
| 4 | Creator profiles + SEO pages | 8 | 9 | 8 | 7 | 10 | 8.35 | Creates scalable acquisition and proof pages |
| 5 | Anomaly detection + rollback/suppression | 9 | 7 | 10 | 7 | 4 | 8.00 | Lets the machine run without Omar watching failures |

Implementation order is 1 -> 2 -> 3 -> 5 -> 4 if risk-first, or 1 -> 2 -> 3 -> 4 -> 5 if growth-first. Recommended: risk-first for no-founder autonomy.

## Section 3 — Implementation-ready designs for selected top 5

### 3.1 Autonomous call extraction + validity classification

Purpose: transform transcripts/posts into structured, evidence-backed calls while suppressing vague/unsafe claims automatically.

Trigger: `pipeline_jobs.type in ('extract_calls','verify_call','video_intelligence')`, scheduled daily backfill, event when transcript arrives.

Input sources: `videos`, transcript text, creator metadata, supported symbols, `llm_gold_examples`, existing extractor profiles, existing `ml_verifier` candidates, `workflow artifacts`.

Output artifacts: `candidate_calls`, `normalized_calls`, `validation_report`, `ml_verification_runs`, accepted rows in `calls`, suppressed/rejected artifacts, audit events.

Database tables: existing `videos`, `calls`, `ml_verification_runs`, `ml_training_examples`, `pipeline_jobs`, `workflow_runs`, `artifacts`, `artifact_links`; do not add new tables for MVP.

Queue/job design:
1. `discover:videos:rss-api` inserts/updates `videos`.
2. transcript job fills `videos.transcript`.
3. enqueue `video_intelligence_workflow` with idempotency `video:<youtube_video_id>:extract:v1`.
4. nodes: segment transcript -> extract candidates -> normalize -> validate evidence -> persist or suppress.
5. medium/high-risk items write review item as `workflow_runs.status='blocked'` plus artifact; do not ask Omar.

Agent prompts: use Prompt 1-4 below. Production extraction is structured JSON only. Deterministic validators run before and after LLM output.

Deterministic rules:
- Reject third-party quoted calls unless creator explicitly endorses.
- Reject news reports, generic market commentary, educational explanations, historic recap.
- Require source timestamp: video published_at and quote span.
- Require asset, direction, call_date, raw_quote, evidence span.
- Specific target/timeframe is not mandatory for tracking but increases specificity; absence may exclude from high-confidence/public pages.

Confidence scoring:
- extraction_confidence = 0.35 quote_span + 0.20 asset + 0.20 direction + 0.10 timestamp + 0.10 ownership + 0.05 specificity.
- publishable call: >=0.78 and deterministic validators pass.
- review/suppress: 0.60-0.78 depending reputational risk.
- suppress: <0.60 or any hard missing evidence.

Suppression logic: suppress if no quote span, unsupported/ambiguous ticker, no creator ownership, ambiguous direction, no timestamp, deleted source without archive, or LLM malformed after retries.

Error handling: malformed LLM output writes `ml_verification_runs.reason_code='malformed_model_output'`; provider timeout writes `model_timeout`; no production state change besides audit artifacts.

Retry logic: max 2 model attempts with different timeout; deterministic parser retry only; no infinite retries. Failed videos requeue with exponential backoff and max 3 attempts.

Non-founder review: only medium-confidence/high-impact items go to `review_queue` implemented initially as `workflow_runs.status='blocked'`, `approval_gates.gate_type='non_founder_trust_review'`, `artifacts.artifact_type='review_packet'`.

Security/compliance: no private data; do not print transcripts in logs beyond bounded evidence spans; redaction on model payload artifacts where needed.

Test cases:
- direct call with ticker/direction/quote accepted.
- guest says a call, creator reports it -> rejected.
- vague “SOL looks good” -> ambiguous/suppressed.
- unsupported ticker/generic word LINK/NEAR false positive -> rejected or review.
- missing transcript -> job failed with retryable error.
- malformed LLM output -> no call row, audit artifact exists.

MVP steps:
1. Add tests around `video_intelligence_workflow` for suppression outcomes.
2. Extend `validateEvidence()` to emit publish/suppress/review decision and score components.
3. Bridge accepted normalized calls into current `calls` insert path; keep suppressed candidates as artifacts.
4. Add CLI wrapper `pipeline:worker:once` job type support only if current worker lacks it.
5. Verify with `npm run typecheck && node --import tsx --test tests/video-intelligence-workflow.test.ts tests/ml-verifier.test.ts`.

### 3.2 Autonomous market snapshotting + outcome resolution

Purpose: resolve measurable outcomes without human monitoring.

Trigger: scheduled `refresh:candles`, `match`, `score`; event when a call reaches 7/30/90-day maturity.

Input sources: `calls`, `candles`, `regime_history`, market provider adapter, BTC benchmark candles.

Output artifacts: price-at-call snapshot, 7/30/90d snapshots, returns, alpha, hit_target, outcome confidence artifact, updated `calls` fields.

Database tables: existing `candles`, `calls`, `pipeline_jobs`, `pipeline_job_events`, `artifacts`, `artifact_links`; requested `market_snapshots` and `resolved_outcomes` map to artifacts/views first.

Queue/job design:
- daily job enqueues mature-call resolution batches by horizon.
- each job claims calls where horizon elapsed and price field null.
- idempotency key `call:<id>:resolve:<horizon>:v1`.
- resolution writes artifact, then updates call fields only if snapshot confidence >=0.95.

Deterministic rules:
- Use candle closest to call timestamp within tolerance for entry.
- Use daily close/open policy already enforced by candle guardrail tests.
- BTC benchmark required for alpha; if BTC missing, outcome not score-ready.
- If both target and stop-loss can be hit with coarse OHLC and sequence is unknown, choose conservative result or mark uncertain.

Confidence scoring:
- 1.0 exact candle/symbol/timestamp match.
- 0.95 accepted tolerance repair.
- <0.95 suppress scoring until repaired.

Suppression: no market data, ambiguous symbol mapping, impossible price movement, source timestamp missing, or horizon not elapsed.

Error handling/retry: market provider failure is non-blocking; job writes retry event and continues other symbols. Max retries 3, then incident low/medium depending batch size.

Non-founder review: none for missing data; suppress. Trust reviewer only for repeated provider/system anomaly.

Tests: candle lookup boundary, BTC alpha missing suppresses score, target/stop conflict conservative, idempotent rerun, provider failure continues batch.

MVP steps: extend existing `match-prices`/`repair-price-at-call` receipts; add outcome artifact type to `artifacts`; add tests around `scoring-boundary` and `match-prices`.

### 3.3 Autonomous CallScore calculation + leaderboard publishing

Purpose: produce public scores and leaderboards from resolved calls with reliability bands and anomaly gates.

Trigger: after successful outcome resolution, daily `score`, weekly leaderboard refresh.

Inputs: score-ready calls, methodology config, sample floor, anomaly check, unresolved disputes, creator metadata.

Outputs: `creator_stats`, leaderboard API response, score explanation artifacts, publication decision artifact.

Tables: existing `creator_stats`, `calls`, `creators`, `workflow_runs`, `artifacts`, `incidents`; requested `creator_scores` and `leaderboards` can be views over `creator_stats` and artifacts for MVP.

Queue/job design:
- `score_compute` pipeline job recomputes stats in temp/transaction.
- `score_anomaly_check` compares rank/score deltas to last artifact.
- `publish_leaderboard_decision` flips public surface only if gate passes; current API already reads DB, so the “publish” step is score visibility eligibility, not deploy.

Deterministic rules:
- minimum effective_n >=30 for MVP visibility; label <100 as provisional.
- exclude ambiguous/low-confidence calls.
- show reliability bands; avoid overclaiming precise rank when confidence intervals overlap.
- score formula versioned in artifact; never silently change methodology.

Confidence scoring:
- reliability_band = insufficient (<30), provisional (30-99), strong (100-299), robust (300+).
- leaderboard publish confidence = min(data_freshness, extraction_quality, market_resolution, anomaly_pass, sample_reliability).

Suppression: unresolved dispute, severe score movement without explanation, freshness fail, sample below floor, methodology hash mismatch, evidence-chain break.

Error/retry: score job writes failed pipeline event; last good leaderboard remains visible; no partial leaderboard overwrite.

Non-founder review: only for high-reputational-impact rank movement with medium confidence. No Omar.

Tests: score formula snapshot, creator_stats transaction idempotent, low sample hidden, anomaly suppresses, public API excludes disputed/low confidence.

MVP steps: add `score_publication_decision` artifact; add `creator_stats` anomaly comparison; update methodology copy to explicitly describe reliability bands.

### 3.4 Autonomous anomaly detection + rollback/suppression

Purpose: keep the system operating without daily founder monitoring while fail-closing trust risks.

Trigger: hourly light, daily deep, after pipeline run, before publication.

Inputs: Workplane status, `freshness:check`, `audit:pipeline`, public verify, pipeline failure rates, score deltas, provider states, channel publication receipts.

Outputs: `incidents`, `autonomy_events`, suppress flags, channel task blocks, passive summary.

Tables: existing `incidents`, `autonomy_events`, `pipeline_job_events`, `channel_tasks`, `channel_publications`, `workflow_events`.

Queue/job design:
- `anomaly_scan_light`: health/freshness/public verify.
- `anomaly_scan_deep`: score deltas, evidence-chain sampling, stale source coverage.
- `rollback_or_suppress`: creates block tasks and marks affected publications/pages suppressed when deterministic threshold met.

Deterministic rules:
- Workplane not OK blocks public publishing.
- public verify fail blocks SEO/leaderboard publish.
- score movement > configured band creates incident; movement + evidence gap suppresses.
- provider timeout during publish never retries mutation automatically.

Confidence: anomaly confidence >=0.90 auto-suppresses; 0.70-0.90 creates review packet; <0.70 logs info only.

Suppression: severe anomaly, duplicate payload, evidence missing, market data unavailable, unresolved dispute, policy drift.

Retry: scans retry 3x for network-only errors; no retry for policy/logic failures.

Non-founder review: restoration queue, not suppression queue. Machine can suppress; humans restore.

Tests: stale Workplane blocks publish, public verify fail suppresses pages, duplicate publish idempotency, provider timeout no retry, restoration requires review.

MVP steps: extend `callscore-freshness-check.ts` and `audit-pipeline-readiness.ts` to emit incident payloads; write tests for incident creation and channel task blocking.

### 3.5 Autonomous creator profiles + SEO pages

Purpose: turn verified scores/evidence into discoverable public pages that update without founder writing/review.

Trigger: event after score update; weekly full rebuild; dispute resolution event.

Inputs: creators, creator_stats, eligible calls, evidence artifacts, methodology fragments, profile template, SEO policy.

Outputs: profile JSON, SEO metadata, static/dynamic page artifacts, internal links, share asset, suppression reason if blocked.

Tables: existing `creators`, `creator_stats`, `calls`, `artifacts`; requested `seo_pages` can be an artifact/view first, table later when needed.

Queue/job design:
- `creator_profile_generate` per eligible creator.
- `seo_page_policy_check` deterministic + LLM linter.
- `seo_page_publish_decision` writes artifact. Public page reads only publishable profiles.

Deterministic rules:
- Use templates and method fragments; LLM may summarize but cannot invent claims.
- Negative claims require high evidence and neutral wording; otherwise aggregate-only.
- Every numeric claim must map to DB query or artifact ID.
- Pages carry reliability band and “not financial advice”.

Confidence: profile publish >=0.85; numeric claim evidence >=0.95; narrative summary >=0.80 and policy pass.

Suppression: low sample, unresolved dispute, impersonation risk, missing evidence, high negative claim risk, stale data.

Non-founder review: high-impact named profile copy with medium confidence; routine pages publish/suppress automatically.

Tests: profile generated from fixture DB, no unsupported metric, low sample suppressed, disputed creator suppressed, SEO page has canonical metadata and methodology caveats.

MVP steps: add profile artifact generator using existing serializers; expose behind current creator routes; add public verification for top N creator pages.

## Section 4 — Autonomous operating loop

Daily loop:
1. Source discovery: run existing `discover:videos:rss-api`; enqueue transcript jobs; respect provider cooldown.
2. Ingest: update `videos`, transcript status, pipeline events.
3. Extract: run extraction workflow on transcript-ready videos.
4. Validate: evidence verifier/classifier emits accepted/suppressed/review artifacts.
5. Snapshot: refresh candles and match price-at-call/mature horizons.
6. Resolve: compute returns, alpha, target outcomes for matured calls.
7. Score: recompute score-ready calls and creator_stats.
8. Profiles: regenerate profiles for changed creators; suppress if policy/evidence fails.
9. Anomalies: run freshness, pipeline audit, public verify, evidence-chain sample.
10. Log: every action writes pipeline event + workflow/artifact/autonomy event.

Weekly loop:
1. Generate leaderboards and creator deltas with reliability bands.
2. Generate public aggregate report and creator-level profile changes.
3. Generate SEO page artifacts and internal-link updates.
4. Generate shareable assets/badges for qualifying creators.
5. Generate outreach campaigns as draft/review-queue items; no Omar.
6. Generate paid-audit prospects based on creator/community fit.
7. Send passive founder summary only: shipped, suppressed, incidents, revenue opportunities.

Monthly loop:
1. Recalculate reliability bands and score drift.
2. Compare methodology metrics to current assumptions; if changed materially, draft methodology update artifact.
3. Archive old evidence to immutable storage while preserving hashes.
4. Identify monetisation opportunities: creators with high demand, disputes, communities needing paid proof reports.
5. Generate paid proof-of-performance reports for eligible creators/communities.
6. Run rollback/restore review queue aging and SLA report.

## Section 5 — No-founder escalation model

Decision hierarchy:
1. High confidence + low risk: publish automatically.
2. Medium confidence + low risk: publish with conservative label, limited visibility, or provisional band.
3. Low confidence: suppress automatically.
4. High reputational impact + medium confidence: non-founder review queue.
5. Evidence missing: do not score.
6. Ambiguous call: classify ambiguous and exclude from performance score.
7. Creator dispute: automated intake -> evidence re-check -> recalculate if error proven -> unresolved to non-founder review queue -> never Omar.

Review queue implementation: use existing `workflow_runs.status='blocked'`, `approval_gates.gate_type='non_founder_trust_review'`, `artifacts.artifact_type='review_packet'`, and optionally a later `review_queue` view/table for admin UI. The reviewer role is “Trust Ops Reviewer”, “Data QA Reviewer”, or “Growth Operator”; never founder.

## Section 6 — Core database schema

Minimum-diff schema stance: do not duplicate existing tables. Where the prompt names a canonical table, either map it to an existing table/view now or add an additive table later only when the existing substrate cannot express the state.

| Prompt table | Use existing first | Key columns/types | Indexes | Relationships | Retention | Audit |
|---|---|---|---|---|---|---|
| creators | `creators` | id serial PK, name text, youtube_handle unique, channel_id text, tier text, stats fields, created_at timestamptz | unique youtube_handle; id | videos/calls/creator_stats FK | indefinite | profile changes via artifact/events |
| sources | add view over `creators` + future source config artifact | source_id text, creator_id int, platform text, handle/url text, confidence double, status text | platform+handle, creator_id | creators | keep active + history artifacts | source identity artifact |
| raw_posts | use `videos` for YouTube; future additive for non-video | id, creator_id, platform, external_id, url, title/body/transcript, published_at, raw_json jsonb | platform+external_id unique; creator_id+published_at | creators | raw text archived by evidence policy | raw artifact hash |
| extracted_calls | `calls` | symbol, direction, prices, timeframe, raw_quote, extraction_confidence, specificity_score, call_date | creator/date, symbol, score, confidence partial | creators/videos | indefinite if public; suppressed as artifacts | call_evidence + workflow artifacts |
| call_evidence | `artifacts` + `artifact_links`; optional future table | call_id, source_artifact_id, quote_span, transcript_offsets, archive_uri, sha256, confidence | call_id, sha256 | calls/videos/artifacts | indefinite hash, archive per policy | immutable artifact |
| market_snapshots | `candles` + price fields; optional view | symbol, timestamp/open_time, open/high/low/close, provider, confidence | symbol+open_time unique | calls via symbol/time | provider retention + derived immutable | snapshot artifact |
| resolved_outcomes | `calls` fields + outcome artifact | call_id, horizon, price, return, alpha, hit_target, confidence | call_id+horizon | calls/candles | indefinite | outcome artifact/link |
| creator_scores | `creator_stats` | creator_id, period, win_rate, alpha, alpha_score, effective_n, wilson_lb, sharpe_ratio, updated_at | creator_id+period unique; period+rank | creators/calls | indefinite snapshots as artifacts | score artifact/version |
| leaderboards | view/artifact over `creator_stats` | leaderboard_id, period, generated_at, rows jsonb, methodology_hash, publish_status | period+generated_at | creator_scores | keep published snapshots forever | publication decision artifact |
| reports | `artifacts` initially | report_type, period, json/storage_uri, sha256, status | type+created | leaderboards/profiles | keep published; drafts TTL 180d | artifact immutable |
| badges | `artifacts` + future table if public embed needed | creator_id, badge_type, reliability_band, image_uri, embed_json, sha256 | creator_id+badge_type | creator_scores | keep current + snapshots | badge artifact |
| disputes | use `feedback_reports` + `incidents`; future `disputes` | dispute_id, creator_id, call_id, claimant, status, evidence, decision | status+created, creator_id | calls/profiles | indefinite for resolved; PII redacted | dispute packet artifacts |
| review_queue | view over `approval_gates`/blocked workflows | review_id, queue, risk_class, entity, status, assigned_to, due_at | status+due, risk+created | workflow_runs/artifacts | closed items 2y+ | reviewer action events |
| audit_logs | existing `pipeline_job_events`, `workflow_events`, `autonomy_events` | event_type, status, detail jsonb, created_at | type+created, entity indexes | all ledgers | append-only | canonical audit trail |
| outreach_targets | use `channel_tasks`/artifacts first | target_id, platform, creator/community, fit_score, suppression_state, source | status+fit | creators/reports | suppressions indefinite | target artifact |
| outreach_messages | use `approval_packets` + `channel_tasks` | message_id, target_id, body, policy_score, send_status, payload_hash | target/status, payload_hash unique | outreach_targets | drafts TTL 180d; sent indefinite | exact payload hash |
| seo_pages | artifacts + existing Next routes | page_path, entity_type, entity_id, metadata jsonb, status, canonical_url | path unique, entity | creators/leaderboards | current + published snapshots | SEO artifact |
| system_events | existing `autonomy_events`, `workflow_events` | event_type, source, detail, created_at | source/type/time | all | append-only | system audit |

Additive migrations should only introduce physical tables for `raw_posts`, `disputes`, `review_queue`, `seo_pages`, `badges`, or `outreach_*` after an existing-table/view MVP proves the need.

## Section 7 — Agent prompt library

All prompts return strict JSON, include `confidence` 0-1, `suppression_required`, `suppression_reason`, and `evidence_refs`. Invalid output means suppress/retry; never publish by default.

### Prompt 1: Call extraction agent
Role: evidence-first crypto call extractor. Task: extract only creator-owned measurable calls from transcript segments.
Input schema: `{video_id, creator, published_at, transcript_segments:[{id,start,end,text}], supported_symbols}`.
Output schema: `{calls:[{symbol,direction,raw_quote,segment_ids,target_price,stop_loss,timeframe,ownership,confidence,reason}]}`.
Rules: extract creator-owned calls only; no guest/news/education; quote must appear verbatim.
Refusal/suppression: no quote, no direction, unsupported symbol, third-party call.
Valid example: `{"symbol":"SOL","direction":"bullish","raw_quote":"I think SOL goes to 200 this cycle","ownership":"creator_own_call","confidence":0.86}`.
Invalid example: extracting “my guest likes SOL” as creator call.

### Prompt 2: Call validity classifier
Role: strict validator. Task: approve/reject/review extracted calls.
Input: candidate call + transcript span + metadata.
Output: `{decision:'approve|reject|review', reason_code, confidence, recommended_extraction_confidence, evidence_span}`.
Rules: require asset, direction, timestamp, ownership, evidence span.
Suppress: quote not in transcript, non-actionable, generic word, missing evidence.
Valid: reject `LINK` when context means hyperlink.
Invalid: approve because “sounds bullish” without quote.

### Prompt 3: Ambiguity classifier
Role: ambiguity detector. Task: classify vague/ambiguous calls.
Input: candidate call, surrounding text, supported symbol map.
Output: `{ambiguity:'none|asset|direction|timeframe|ownership|measurement', exclude_from_score:boolean, confidence}`.
Rules: ambiguity excludes performance score unless resolved by deterministic evidence.
Suppress: ambiguous asset/direction/ownership.
Valid: “it could go either way” -> exclude.
Invalid: infer direction from sentiment alone.

### Prompt 4: Evidence verifier
Role: evidence auditor. Task: verify all claims have source spans.
Input: artifact/call/profile/report claims + evidence refs.
Output: `{verified_claims, failed_claims, evidence_level:'E0'..'E5', confidence}`.
Rules: every numeric/named claim maps to source span/hash.
Suppress: missing source, stale evidence, deleted source without archive.
Valid: aggregate count from SQL artifact.
Invalid: “top creator” without leaderboard artifact.

### Prompt 5: Outcome resolver
Role: deterministic outcome explainer. Task: explain resolved market outcomes from snapshots; do not fetch or invent prices.
Input: call, market snapshots, BTC benchmark, horizon.
Output: `{resolved:boolean, horizon, return_pct, alpha_pct, correct_direction, hit_target, confidence, reason}`.
Rules: use provided prices only; mark unresolved if missing.
Suppress: market data unavailable or symbol mismatch.
Valid: unresolved due missing BTC candle.
Invalid: approximating price from memory.

### Prompt 6: Score explainer
Role: methodology explainer. Task: produce public-safe score explanation.
Input: score components, reliability band, evidence refs.
Output: `{summary, bullets, caveats, confidence, publishable}`.
Rules: no investment advice; no guarantees; mention reliability band.
Suppress: low sample, unresolved dispute, missing methodology hash.
Valid: “provisional band, 43 calls”.
Invalid: “this creator is guaranteed skilled”.

### Prompt 7: Creator profile generator
Role: neutral profile writer. Task: generate creator profile from verified stats.
Input: creator, stats, representative calls, caveats.
Output: `{title, summary, strengths, limitations, metrics, seo, confidence}`.
Rules: use only supplied metrics; neutral wording; include sample size.
Suppress: disputed/low sample/missing evidence.
Valid: “ranked on 126 score-ready calls”.
Invalid: defamatory labels or invented biography.

### Prompt 8: Leaderboard report generator
Role: aggregate report writer. Task: generate weekly leaderboard report.
Input: leaderboard rows, deltas, methodology, evidence hash.
Output: `{headline, sections, charts_needed, claims, confidence}`.
Rules: emphasize methodology/reliability; no investment advice.
Suppress: freshness fail, anomaly, low sample for named claims.
Valid: aggregate top movers with caveats.
Invalid: “follow these creators to profit”.

### Prompt 9: SEO page generator
Role: SEO-safe technical copywriter. Task: create page copy for creator/asset/call/leaderboard pages.
Input: entity data, verified claims, keywords, caveats.
Output: `{slug,title,meta_description,h1,body_sections,structured_data,confidence}`.
Rules: no keyword stuffing; no unsupported claims; no defamatory phrasing.
Suppress: impersonation risk, unresolved dispute, missing evidence.
Valid: “CallScore tracks public calls from X”.
Invalid: “X scams followers”.

### Prompt 10: Creator outreach generator
Role: compliant growth drafter. Task: draft outreach only from approved evidence.
Input: target, reason, allowed claims, suppression list state.
Output: `{subject, body, evidence_refs, policy_score, send_allowed:false}`.
Rules: default send_allowed false until automated policy/send gate exists; no pressure, no legal threats.
Suppress: DNC, uncertain identity, negative claim risk.
Valid: draft right-of-reply invitation.
Invalid: automated accusation or paid upsell from weak evidence.

### Prompt 11: Dispute triage agent
Role: trust operations triager. Task: classify dispute and decide auto-correction/review/suppress.
Input: dispute, claimant evidence, current evidence chain.
Output: `{category, decision:'auto_correct|reject|review|suppress_pending', confidence, required_actions}`.
Rules: auto-correct only if error proven >=0.95; otherwise review/suppress.
Suppress: unresolved dispute on affected public page if material.
Valid: wrong source timestamp proven -> auto-correct.
Invalid: ignore credible dispute.

### Prompt 12: Anomaly detection agent
Role: conservative incident analyst. Task: classify anomalies and recommend suppress/continue/review.
Input: metrics, deltas, logs, previous baselines.
Output: `{severity, anomaly_type, confidence, action:'continue|suppress|review|rollback', reason}`.
Rules: machine may suppress; restoration requires review.
Suppress: evidence-chain break, public verify fail, severe score drift.
Valid: suppress leaderboard after unexplained 80% rank churn.
Invalid: publish despite failed public verify.

## Section 8 — Scoring logic

Single-call score should be risk-adjusted, evidence-aware, and reliability-banded. Existing `computePublicScore` already covers direction, alpha, specificity, regime, target. Upgrade it by versioning the formula and adding explicit drawdown, evidence quality, ambiguity penalty, recency/consistency at creator aggregation level.

Formula:

`call_score = confidence_multiplier * (direction_component + risk_adjusted_return_component + specificity_component + drawdown_component + time_to_target_component + evidence_component - ambiguity_penalty)`

Recommended MVP weights:
- Directional accuracy: 30 points.
- Risk-adjusted return / alpha vs BTC: 25 points, capped [-20,+25].
- Specificity: 10 points.
- Drawdown control: 10 points.
- Time-to-target: 5 points.
- Evidence quality: 10 points.
- Regime difficulty / market context: 10 points.
- Ambiguity penalty: 0 to -40; hard ambiguous excludes score.

Creator score:
`creator_score = weighted_mean(call_score, reliability_weight, recency_weight) * consistency_multiplier * sample_reliability_multiplier`

Reliability:
- effective_n < 30: not ranked.
- 30-99: provisional.
- 100-299: strong.
- 300+: robust.
- Wilson lower bound or bootstrap band shown publicly; do not overstate exact ranks.

Recency weighting: default equal-weight until predictive testing proves recency improves out-of-sample reliability. If used, cap recency multiplier to avoid gaming.

Edge cases: neutral calls use separate band; target + stop both touched uses conservative result; missing BTC suppresses alpha; deleted source without archive suppresses; unresolved dispute suppresses affected call/profile score.

Gaming risks and anti-gaming:
- Vague calls: excluded or ambiguity penalty.
- Spam volume: effective_n uses quality-weighted calls and duplicate/topic clustering.
- Easy BTC-only calls: alpha and asset-diversity context shown.
- Always-bullish herd behavior: base-rate/regime adjustment and consistency analysis.
- Retrospective edits/deletes: archive/hash evidence; deleted without archive suppressed.

Rules for excluding vague calls: no measurable asset, no direction, no timestamp, no ownership, no quote, or purely entertainment/news/education.

## Section 9 — Autonomous publishing rules

Automatically publish a call page when: evidence level >=E3, extraction >=0.78, timestamp exists, asset/direction measurable, market data available or status is clearly “pending outcome”, no unresolved dispute, no anomaly, source archived/hashable.

Automatically publish a creator profile when: effective_n >=30, profile evidence completeness >=0.85, no unresolved identity/dispute issue, reliability band displayed, no unsupported negative language.

Automatically publish a creator score when: score-ready calls >=30, methodology hash current, anomaly pass, disputes clear, CI/reliability band included.

Automatically publish a leaderboard when: Workplane OK, public verify pass, creator_stats recompute succeeded, anomaly pass, at least minimum rows eligible, methodology hash current.

Automatically publish a weekly report when: aggregate evidence >=0.90, no public verify/freshness fail, named claims meet high-confidence threshold, generated assets pass policy.

Automatically publish a badge when: creator profile is publishable, reliability band shown, badge claim is positive/neutral and evidence-backed, no dispute.

Automatically publish an SEO page when: page entity publishable, canonical metadata validates, all claims have evidence refs, no impersonation/dispute/anomaly.

Outreach email/message: do not live-send in MVP. Generate draft/approval packet automatically. Live send only after future non-founder send policy exists, suppression/DNC passes, evidence/policy >=0.95, and a non-founder operator queue is active.

Must suppress when: missing evidence, low extraction confidence, no timestamp, ambiguous asset, ambiguous direction, no measurable target/invalidation/timeframe for high-confidence claims, deleted source without archive, potential impersonation, unresolved creator dispute, market data unavailable for score claims, suspicious anomaly, public verify fail, Workplane not OK, provider cooldown, or policy-linter block.

## Section 10 — Implementation roadmap

Phase 1: Autonomous evidence-backed scoring MVP.
- Build tasks: upgrade video_intelligence validation, suppression artifacts, outcome artifacts, score publication decision.
- Dependencies: existing pipeline queue, candles, calls, artifacts.
- Complexity: medium.
- Acceptance: no call requires Omar; low confidence suppressed; score-ready calls resolved; tests pass.
- Tests: extractor, verifier, outcome, score boundary, idempotency.
- Failure modes: provider timeout, malformed model output, missing candles.
- Monitoring: pipeline events, incidents, freshness, model error rate.

Phase 2: Autonomous creator profiles and leaderboards.
- Build tasks: reliability bands, profile artifact generation, leaderboard publish decision, public verify expansion.
- Dependencies: Phase 1 score artifacts.
- Complexity: medium.
- Acceptance: profiles/leaderboards update without founder review or suppress safely.
- Tests: low-sample suppression, dispute suppression, SEO metadata, API shape.
- Monitoring: rank churn, profile generation errors, public verify.

Phase 3: Autonomous reports, SEO pages, and share assets.
- Build tasks: weekly report artifact, SEO page artifacts, badge/share card generator, owned-public publication preflight.
- Dependencies: profile/leaderboard artifacts.
- Complexity: medium.
- Acceptance: aggregate reports publish automatically; named/high-risk items suppress/review.
- Tests: report claims evidence refs, image generation, policy linter.
- Monitoring: publication receipts, readback verification.

Phase 4: Autonomous creator outreach and monetisation.
- Build tasks: prospect scoring, paid audit report generator, outreach draft packets, non-founder send queue.
- Dependencies: profiles, badges, reports, dispute policy.
- Complexity: medium-high.
- Acceptance: drafts/prospects generated without Omar; no sends without send-policy gate.
- Tests: DNC suppression, message policy, payload hash idempotency.
- Monitoring: target queue, conversion metrics, blocked reasons.

Phase 5: Autonomous dispute handling and review operations.
- Build tasks: dispute intake, evidence recheck, auto-correction, non-founder review UI/queue, restoration flow.
- Dependencies: evidence artifacts and public pages.
- Complexity: high.
- Acceptance: disputes never route to Omar; proven errors auto-correct; unresolved suppress/review.
- Tests: valid dispute auto-correct, weak dispute reject/review, profile suppression, audit chain.
- Monitoring: dispute SLA, correction count, unresolved risk.

## Section 11 — Minimal technical stack recommendation

Backend: keep Next.js/TypeScript with existing API routes and scripts. Do not introduce a new backend service yet.
Database: keep HH PostgreSQL as source of truth; use additive migrations only after view/artifact MVP fails.
Queue: keep `pipeline_jobs`; use `channel_tasks` for channel/GTM autonomy.
Scheduler: keep systemd timers + Hermes cron + existing npm scripts; consolidate only after recurring failures.
LLM orchestration: keep structured prompts in TypeScript modules and model runs audited in `agent_invocations`/`ml_verification_runs`; deterministic validators before/after LLM.
Vector/search: defer; use Postgres full-text/trigram or artifact search first. Add vector only if profile/report search needs it.
Market data abstraction: keep `candles` provider abstraction; add provider status/error artifacts, not new infra.
Evidence archival: artifact hash + storage_uri; archive raw source pages/transcripts where public claims depend on them.
Observability: existing `freshness:check`, `audit:pipeline`, Workplane, `incidents`, `autonomy_events`; add dashboards later.
Deployment: Netlify for app, HH for workers/Postgres. No Vercel.
Admin/review interface: start with API/view over `approval_gates`/blocked workflows; build minimal internal page only when non-founder reviewers exist.

## Section 12 — Final recommended build order

1. Build autonomous call extraction + validity classification.
- Why now: removes the biggest founder-judgment risk.
- Unlocks: clean call corpus, evidence artifacts, score trust.
- Do not build yet: broad source expansion or outreach.
- Can fake/stub: non-founder UI as blocked workflow rows.
- Production-grade day one: suppression rules, quote-span evidence, idempotency, audit logs.

2. Build market snapshotting + outcome resolution artifacts.
- Why now: mostly existing and essential for scoring.
- Unlocks: resolved outcomes, alpha, risk metrics.
- Do not build yet: complex paid reports.
- Can fake/stub: physical `market_snapshots` table as view/artifact.
- Production-grade day one: candle matching, BTC benchmark, missing-data suppression.

3. Build CallScore calculation + leaderboard publish gate.
- Why now: converts data into user-visible trust product.
- Unlocks: profiles, badges, reports, acquisition loops.
- Do not build yet: exact rank overclaiming or new formula churn.
- Can fake/stub: leaderboard snapshot table using artifacts over `creator_stats`.
- Production-grade day one: sample floor, reliability bands, anomaly suppression.

4. Build anomaly detection + automatic suppression.
- Why now: no-founder operations require the system to fail closed without Omar watching.
- Unlocks: safe autonomous publishing and fewer trust incidents.
- Do not build yet: enterprise incident suite.
- Can fake/stub: review UI via existing approval_gates/workflow artifacts.
- Production-grade day one: suppress-before-restore, no retry after provider mutation failure, public verify gate.

5. Build creator profiles + SEO pages.
- Why now: creates distribution and monetisable proof surfaces after scoring is reliable.
- Unlocks: organic acquisition, creator badges, paid audit upsell.
- Do not build yet: outbound live sends, community dispute forum, public API product.
- Can fake/stub: static page artifact generation before full CMS.
- Production-grade day one: claim evidence mapping, dispute suppression, neutral wording, canonical metadata.

Immediate next executable task: upgrade the existing `video_intelligence_workflow` and `ml-verifier` path to produce explicit `publish|suppress|review` decisions as artifacts, with tests proving low-confidence/vague/high-risk calls never require Omar and never reach public scoring.
