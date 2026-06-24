# CallScore Pipeline Guard

Status: canonical pre-transition / pre-STORM / pre-Markov read-only guard.

Run from the runtime repo:

```bash
npm run pipeline:guard -- --out .tmp/callscore-pipeline/pipeline-guard-audit.json
```

The guard is read-only. It does not enqueue jobs, mutate pgsql, run migrations, call providers, or update public surfaces.

## Checks

- `creator_stats_30d`: flags the known trap where `creator_stats.30d` can be structurally empty because 30-day outcomes have not matured inside the same call-date window.
- `ml_promotion_state`: confirms whether ML verifier promotion has gone beyond dry-run.
- `transcript_collect_laptop`: keeps the laptop transcript lane separate from core score/candle health.
- `pending_candle_refresh`: detects queued candle refresh jobs.
- `daily_closes_lag`: compares `candle_daily_closes` freshness with the 1-minute candle lake.
- `ml_verifier_label_integrity`: flags verifier approvals whose reason code is not `valid_call`.
- `creator_news_channel_exclusion`: checks whether news/media channels are formally excluded from creator modelling.

## Rules

- Markov/trajectory work must not use `creator_stats.30d` blindly.
- `ml_verification_runs` are audit/eval evidence unless gated promotion evidence exists.
- News/media channels are context sources, not creator-reliability population members.
- Use raw calls/candles or refreshed derived closes before daily-regime modelling.


## Lean P0 policy modules

- Creator eligibility: `src/lib/creator-eligibility/creator-eligibility.ts` and `src/lib/creator-eligibility/news-channel-exclusions.ts`.
- Verifier label policy: `src/lib/ml-verifier-label-policy.ts`.
- Transition data policy: `src/lib/transition/transition-data-policy.ts`.

## Readiness classes

`pipeline:guard` emits four simple readiness classes:

- `core_pipeline_status` — whether the existing worker/data loop is healthy enough to operate.
- `transition_readiness` — whether trajectory work can proceed with explicit routing around warnings.
- `storm_readiness` — whether evidence-pack work can proceed with explicit routing around warnings.
- `public_publish_readiness` — stricter; public publish remains gated by evidence, provider, and safety requirements.

A warning is not a stop sign. It is a constraint to route around. A block is a stop sign.


## Creator transition intelligence

Read-only transition reports run with:

```bash
npm run transition:report -- --period monthly --from 2017-11-25 --to 2026-06-24 --out .tmp/transition/latest
```

The report uses raw `calls` plus creator eligibility policy. It does not use `creator_stats.30d`, raw verifier labels, stale daily closes, DB writes, public UI, or publishing.


## STORM evidence packs

Read-only STORM evidence packs run with:

```bash
npm run storm:evidence -- --transition-artifact .tmp/transition/latest/states.json --out .tmp/storm/latest
```

The pack uses transition artifacts plus raw `calls`/`videos`. It does not score creators, publish, call providers, use external web, or mutate DB. News/media remains context-only and unsupported/predictive claims are blocked in `claim_map.json` and `youtube_context.json`.
