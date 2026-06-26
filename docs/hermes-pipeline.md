# Netlify → HH pgsql → Hermes ML pipeline

Netlify is the canonical app host. O13/canonical-green changed scheduling: Netlify schedules are **alert-only** (`cron-alerts-scan`, `cron-alerts-send`). HH VM PostgreSQL/pgsql is the canonical primary database for durable runs/jobs/events and ML audit state. Neon remains backup/legacy compatibility only. Hermes/Hetzner runs graph-backed Docker/systemd workers that claim pgsql jobs with `FOR UPDATE SKIP LOCKED`.

> O13 supersession: direct Netlify data/ML/weekly schedules are absent and must not be reintroduced. Production refresh/worker operation routes through `npm run operating:goal` / wrappers recorded in `docs/ops/o13-production-entrypoint-inventory.md`.

## Deploy on Hermes

1. Copy `.env.hermes.example` to `.env.hermes` on the server and fill in pgsql/Ollama secrets.
2. Run migrations from a trusted environment:
   ```bash
   npm run db:migrate
   ```
3. Start the worker:
   ```bash
   docker compose up -d hermes-worker
   ```
4. Optional boot persistence:
   ```bash
   sudo cp ops/systemd/hermes-worker.service /etc/systemd/system/hermes-worker.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now hermes-worker
   ```

## Smoke check

```bash
docker compose --profile debug run --rm hermes-worker-once --dry-run
```

Dry-run enqueues a `hermes_smoke_test` job, claims it, writes job events, and exits without touching production call rows.
Worker stdout/stderr is JSONL structured logging with `event`, `worker_id`,
`job_id`, and `run_id` fields so production logs can be filtered by run.

## Netlify/Next endpoints

- `GET|POST /api/cron/ml/enqueue` is a legacy/manual enqueue route, not an active O13 Netlify schedule. Use graph-backed `refresh_data`/worker dispatch entrypoints for production scheduling.
- `GET /api/pipeline/status` requires `Authorization: Bearer $PIPELINE_STATUS_SECRET` (or `$CRON_SECRET`) and returns recent runs/jobs/events.
- `GET /api/pipeline/stats?limit=15` uses the same bearer auth and returns the holistic data inventory: creators, videos/transcripts, raw calls, confidence/scoring funnel, public eligibility, leaderboard freshness, candle coverage, consensus, and pipeline orchestration totals.
- `GET /api/pipeline/blockers?limit=25` uses the same bearer auth and returns the operating views for non-public calls: blocked by reason, symbol, creator, and pipeline stage.

## v1 safety boundary

The ML verifier is audit-only: it writes `ml_verification_runs` and pipeline events. It does not update `calls`; promotion remains a separate future workflow after holdout evals are trusted.

## Continuous data pipeline implementation/debug path

Use the continuous runner only as an implementation/debug path. In O13 production, data refresh is scheduled via graph-backed operating-goal wrappers; `data-pipeline-continuous` remains debug-profile only.

```bash
npm run pipeline:data:continuous -- --write --interval-minutes 30 -- \
  --limit-low-confidence-validations 500 \
  --limit-price-repairs 1000 \
  --limit-price-matches 1000 \
  --limit-ready-extract-videos 239 \
  --limit-llm-videos 100
```


The launch-readiness stage order is conversion-first, not transcript-first:

1. `low-confidence-validate` promotes only deterministic `PROMOTE` decisions from low-confidence score-ready calls; `REJECT` and `NEEDS_HUMAN_REVIEW` are recorded but not promoted.
2. `candles` refreshes market data for tracked symbols.
3. `price-repair` attaches nearest 1-minute `price_at_call` only within the bounded tolerance ladder: exact minute, ±5 minutes, then ±30 minutes. When local candles are missing, the bounded Binance fallback fetches and stores only the needed 1-minute candle instead of backfilling whole symbol histories.
4. `evaluation-backfill` runs the existing price/evaluation matcher for missing 7d/30d/90d returns and target hits, with the same bounded Binance fallback for missing historical candles.
5. `ready-extract` clears transcript-ready videos that have not yet been marked extracted.
6. Discovery, transcript scraping, shadow extraction, and shadow promotion run after the database-held inventory is converted.
7. `blocker-audit` and `symbol-funnel-audit` write audit artifacts that make LINK/NEAR/XRP and other conversion anomalies visible.

Useful one-off commands:

```bash
npm run audit:blockers -- --json --audit-out .tmp/callscore-pipeline/blockers.json
npm run audit:symbol-funnel -- --symbols LINKUSDT,NEARUSDT,XRPUSDT --json
npm run repair:price-at-call -- --limit 1000 --fetch-binance --write --audit-out .tmp/callscore-pipeline/price-repair.jsonl
npm run audit:recompute -- --score-ready-low-confidence --valid-only --limit 500 --summary --write
```

The runner wraps `src/scripts/run-data-pipeline.ts` and adds:

- a lock file at `.tmp/callscore-pipeline/continuous.lock` so only one loop runs at a time; stale files are removed when the recorded PID is no longer alive;
- per-cycle audit folders under `.tmp/callscore-pipeline/continuous/`;
- launch-speed defaults for shadow extraction (`glm-5.1` fallback, `2x2x2` lanes, model attempts `2`, gap `0`);
- safe write defaults: if no reviewed promotion video IDs are supplied, it automatically adds `--skip-shadow-promote` so unreviewed shadow diffs are not written into production calls;
- a 30-minute success interval and 10-minute failure retry interval by default.

For a one-cycle dry-run smoke check:

```bash
docker compose --profile debug run --rm data-pipeline-continuous-once
```

For a debug-profile continuous loop only, with explicit operator intent:

```bash
docker compose --profile debug up -d data-pipeline-continuous
```

Do not use `data-pipeline-continuous` as the default production scheduler.

Reviewed promotions remain explicit. Pass reviewed IDs after the second `--` when you intentionally want promotion in a cycle:

```bash
npm run pipeline:data:continuous -- --write --once -- \
  --shadow-promote-video-ids 15267,14687 \
  --shadow-allow-statuses new_calls,changed_calls
```
