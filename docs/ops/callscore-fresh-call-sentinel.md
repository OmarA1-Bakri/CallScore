# Fresh-call sentinel safe cadence

This document wires the fresh-call discovery sentinel into the CallScore safe scheduler pattern without creating a live cron job in this task.

## Runtime wrapper

Wrapper path:

- `/srv/agents/hermes/scripts/callscore-fresh-call-sentinel-watch.sh`

Application entrypoint:

- `npm run sentinel:fresh-calls -- --limit 25 --since-days 14`

The wrapper is designed for Hermes `no_agent=true` cron semantics:

- success with no new work: empty stdout, exit 0;
- success with recommendations/blockers: JSON stdout containing counts and `receipt_path`, exit 0;
- command/env/DB failure: redacted stderr, non-zero exit.

## Environment handling

The wrapper uses the canonical CallScore HH env file by default:

- app dir: `/opt/crypto-tuber-ranked`
- env file: `/opt/crypto-tuber-ranked/.env.hermes`

It sources the env with stdout/stderr suppressed:

```bash
set -a
. "$ENV_FILE" >/dev/null 2>&1
set +a
```

It then unsets `NEON_DATABASE_URL` and defaults `DATABASE_PROVIDER=postgres` so the local HH PostgreSQL lane remains authoritative. The wrapper never prints raw env values. Failure output runs through a redactor for common DSN, bearer-token, and provider-key shapes before it reaches stderr or scheduler logs.

Useful safe overrides:

- `CALLSCORE_APP_DIR=/opt/crypto-tuber-ranked`
- `CALLSCORE_ENV_FILE=/opt/crypto-tuber-ranked/.env.hermes`
- `CALLSCORE_SCHEDULER_LOG_DIR=/srv/agents/hermes/logs/callscore-scheduler`
- `CALLSCORE_FRESH_CALL_SENTINEL_LIMIT=25`
- `CALLSCORE_FRESH_CALL_SENTINEL_SINCE_DAYS=14`
- `CALLSCORE_FRESH_CALL_SENTINEL_COOLDOWN_STATE=/opt/crypto-tuber-ranked/.tmp/laptop-collector/latest-state.json`

## Safety behavior

The sentinel is read-only against production data in this phase. It discovers fresh candidates and emits recommendations/receipts; it does not enqueue pipeline jobs or channel tasks.

The TypeScript sentinel enforces:

- bounded discovery SQL (`LIMIT`, recent `since-days` window);
- dedupe against current-run repeats;
- dedupe against existing calls/videos;
- dedupe against open `pipeline_jobs.idempotency_key` and `channel_tasks.idempotency_key` values with `status IN ('pending', 'running')`;
- transcript-provider cooldown suppression for candidates that would require laptop transcript collection;
- fail-closed blocked receipt for malformed source input;
- `production_mutation_performed=false`, `provider_mutation_performed=false`, and `external_send_performed=false` in every receipt.

## Receipt path

Each run writes a local workflow receipt under:

- `/opt/crypto-tuber-ranked/.tmp/workflow-receipts/fresh_call_sentinel/`

The wrapper logs scheduler stdout/stderr under:

- `/srv/agents/hermes/logs/callscore-scheduler/fresh-call-sentinel-YYYYMMDDTHHMMSSZ.log`

Receipts are mode `0600` and contain discovered/skipped/recommended counts, cooldown/duplicate counts, dedupe keys for recommendations, blocker state, and explicit no-mutation booleans.

## Proposed Hermes cron/no-agent registration plan

Do not create the cron from inside the wrapper or from a cron-run session. There is no recursive cron creation path.

Only after the operator/plan gate explicitly authorizes live cadence registration, create a script-only local-delivery cron similar to:

```text
cronjob(action="create",
  name="callscore-fresh-call-sentinel-watch",
  schedule="every 60m",
  script="/srv/agents/hermes/scripts/callscore-fresh-call-sentinel-watch.sh",
  no_agent=true,
  deliver="local",
  prompt="Script-only fresh-call sentinel watcher. Empty stdout is silent; non-empty stdout is the alert payload.",
  enabled_toolsets=["terminal"])
```

Expected no-agent behavior:

- empty stdout: scheduler sends nothing;
- non-empty stdout: scheduler delivers exactly the wrapper JSON alert;
- non-zero exit: scheduler sends an error alert so the failure cannot fail silently.

Actual cron creation was not performed by this P7 wiring task because the task acceptance criteria require a registration plan unless an explicit gate authorizes creation.

## Manual verification commands

From `/opt/crypto-tuber-ranked`:

```bash
bash -n /srv/agents/hermes/scripts/callscore-fresh-call-sentinel-watch.sh
/srv/agents/hermes/scripts/callscore-fresh-call-sentinel-watch.sh
node --import tsx --test tests/fresh-call-sentinel.test.ts tests/autonomy-contracts.test.ts
npm run typecheck
npm run hygiene:secrets
git diff --check
```

Expected wrapper output is empty when there are no new recommendations or blockers. If recommendations exist, the wrapper prints JSON with `discovered_count`, `skipped_duplicate_count`, `skipped_cooldown_count`, `recommended_count`, `enqueued_count`, `blockers`, `receipt_path`, and no-mutation booleans.
