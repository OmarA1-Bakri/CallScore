# Vercel → Neon → Hermes ML pipeline

Vercel only schedules and observes. Neon stores durable runs/jobs/events and ML audit state. Hermes/Hetzner runs the long-lived Docker worker that claims Neon jobs with `FOR UPDATE SKIP LOCKED`.

## Deploy on Hermes

1. Copy `.env.hermes.example` to `.env.hermes` on the server and fill in Neon/Ollama secrets.
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

## Vercel endpoints

- `GET|POST /api/cron/ml/enqueue` requires `Authorization: Bearer $CRON_SECRET` and queues one idempotent nightly `ml_verifier_batch` job.
- `GET /api/pipeline/status` requires `Authorization: Bearer $PIPELINE_STATUS_SECRET` (or `$CRON_SECRET`) and returns recent runs/jobs/events.
- `GET /api/pipeline/stats?limit=15` uses the same bearer auth and returns the holistic data inventory: creators, videos/transcripts, raw calls, confidence/scoring funnel, public eligibility, leaderboard freshness, candle coverage, consensus, and pipeline orchestration totals.

## v1 safety boundary

The ML verifier is audit-only: it writes `ml_verification_runs` and pipeline events. It does not update `calls`; promotion remains a separate future workflow after holdout evals are trusted.

## Continuous data pipeline

Use the continuous runner when the launch data pipeline should keep cycling without overlapping itself:

```bash
npm run pipeline:data:continuous -- --write --interval-minutes 30 -- \
  --limit-llm-videos 100 \
  --limit-price-matches 1000
```

The runner wraps `src/scripts/run-data-pipeline.ts` and adds:

- a lock file at `.tmp/callscore-pipeline/continuous.lock` so only one loop runs at a time;
- per-cycle audit folders under `.tmp/callscore-pipeline/continuous/`;
- launch-speed defaults for shadow extraction (`glm-5.1` fallback, `2x2x2` lanes, model attempts `2`, gap `0`);
- safe write defaults: if no reviewed promotion video IDs are supplied, it automatically adds `--skip-shadow-promote` so unreviewed shadow diffs are not written into production calls;
- a 30-minute success interval and 10-minute failure retry interval by default.

For a one-cycle dry-run smoke check:

```bash
docker compose --profile debug run --rm data-pipeline-continuous-once
```

For continuous operation on Hermes:

```bash
docker compose up -d data-pipeline-continuous
```

Reviewed promotions remain explicit. Pass reviewed IDs after the second `--` when you intentionally want promotion in a cycle:

```bash
npm run pipeline:data:continuous -- --write --once -- \
  --shadow-promote-video-ids 15267,14687 \
  --shadow-allow-statuses new_calls,changed_calls
```

