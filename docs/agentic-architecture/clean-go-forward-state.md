# Agentic Architecture Clean Go-Forward State

Date: 2026-05-26
Canonical runtime host: `hermes-agent-box` / HH VM
Canonical runtime repo: `/opt/crypto-tuber-ranked`
WSL backup root: `/home/omar/backups/callscore-vm-canonical/`

> Infrastructure supersession note (2026-06-07): Netlify and call-score.com are
> canonical for hosting/scheduling; HH VM PostgreSQL/pgsql is the canonical
> primary database. Older Neon references below are legacy evidence from the
> 2026-05-26 repair and do not make Neon canonical.

## Target architecture

```text
HERMES (CEO Orchestrator)
├── Agentic Council
│   ├── CMO / MARKETING Pillar
│   │   ├── Content Creation
│   │   ├── Distribution
│   │   ├── Audience Growth
│   │   └── Brand
│   ├── WHOP Pillar
│   ├── WORKPLANE Pillar
│   └── CALLSCORE Product Pillar
└── Pipeline Worker (Docker, HH pgsql primary; Neon backup/legacy only)
```

## Operating cadence

Every new implementation phase uses this cadence:

1. `task-router` to classify the work and assign the right lane.
2. `ralplan` to write/update PRD and test-spec artifacts before implementation.
3. `Super-writing-plans` to turn the accepted plan into executable steps.
4. `superpowers` execution and verification skills for implementation discipline.

## Current clean state

- HH VM repo is the canonical runtime checkout.
- HH worker runs from Docker image `crypto-tuber-ranked-hermes-worker:latest` built from `/opt/crypto-tuber-ranked`.
- HH pgsql schema has the ML verifier reason-code lookup table and FK active; the May repair also recorded legacy Neon evidence.
- The stale `ml_verification_runs_reason_code_check` constraint is removed.
- Worker smoke jobs can be enqueued, claimed, and completed in dry-run mode.
- WSL checkout keeps the development mirror plus local backup snapshots.

## Verified evidence

Local WSL verification after fixes:

- Enumerated 59 `tests/**/*.test.ts` files.
- `node --import tsx --test <all enumerated test files>`: 450 pass, 0 fail.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run build`: exit 0.

HH verification after fixes:

- `/opt/crypto-tuber-ranked` on `master`, ahead of `origin/master` with the clean-state commits.
- Docker rebuild completed and `hermes-worker` restarted.
- Worker log emitted `worker_start` and `database_ok`.
- `docker compose --profile debug run --rm hermes-worker-once --dry-run` completed a `hermes_smoke_test` job.
- Container targeted tests for extraction defaults and dashboard route: 36 pass, 0 fail.
- Legacy Neon postflight query: `invalid_reason_codes = 0`.

Primary evidence logs live under `/home/omar/.omx/logs/` on WSL and HH, including:

- `callscore-wsl-full-verify-20260526T064747Z.log`
- `callscore-remote-smoke-after-fix-20260526T064943Z.log`
- `agentic-architecture-clean-go-forward-commands-20260526T062829Z.md`

## Rollback anchors

Before production repair/restart, the run captured:

- HH pre-canonical repo backup: `/opt/crypto-tuber-ranked.pre-canonical-20260526T063909Z`
- WSL rsync backup: `/home/omar/backups/callscore-vm-canonical/20260526T061241Z`
- Docker rollback image tag path: `/home/omar/.omx/logs/callscore-worker-rollback-image-tag.txt`
- Legacy Neon pre-repair schema dump: `/home/omar/.omx/logs/ml-verifier-reason-code-schema-before.sql`
- Production command log: `/home/omar/.omx/logs/agentic-architecture-clean-go-forward-commands-20260526T062829Z.md`

## Go-forward rules

- Treat `/opt/crypto-tuber-ranked` on HH as the runtime truth until a newer reviewed source commit is promoted.
- Keep WSL backups secret-safe: exclude private env files (`.env`, `.env.local`, `.env.hermes`, `.env.production*`) plus `node_modules/`, `.next/`, `.tmp/`, and `.vercel/`; keep tracked templates such as `.env.hermes.example`.
- Do not run schema repair without a fresh schema dump and command-log entry.
- Do not restart the worker without a Docker rollback tag or explicit rollback note.
- Do not mark a phase complete unless WSL tests/type/lint/build and HH smoke evidence are fresh for that phase.
- Keep Workplane gates explicit: `PUBLISH`, `SEND`, and `TRUST` actions must have filesystem-backed state and visible approval evidence.
