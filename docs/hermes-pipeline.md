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

## v1 safety boundary

The ML verifier is audit-only: it writes `ml_verification_runs` and pipeline events. It does not update `calls`; promotion remains a separate future workflow after holdout evals are trusted.
