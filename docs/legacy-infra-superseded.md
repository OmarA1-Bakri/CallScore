# Superseded Vercel/Neon infrastructure references

Status: canonical guidance for repository-local infrastructure cleanup.
Last updated: 2026-06-07.

CallScore production infrastructure is:

- Hosting and scheduled functions: Netlify, serving call-score.com.
- Primary database: HH VM PostgreSQL/pgsql.
- Long-running jobs: Hermes/Hetzner worker.

Vercel is deprecated/non-canonical for this repository. Do not add a root `vercel.json`, Vercel cron config, Vercel project settings, or Vercel deployment evidence to this repo. Historical docs may mention Vercel only as superseded context.

Neon is backup/legacy compatibility only. Existing code may retain `NEON_DATABASE_URL` fallback and `@neondatabase/serverless` adapter compatibility until a separate database-adapter migration removes them safely. Historical docs may mention Neon only as superseded context unless they explicitly describe backup/legacy fallback.

This cleanup is repository-only. It does not mutate Netlify, Vercel, Neon, Whop, DNS, HH pgsql, or any provider dashboard.
