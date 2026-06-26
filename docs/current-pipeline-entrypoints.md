# Current pipeline entrypoints

This repo has older scraper/extractor scripts kept for reproducibility. Use this
page to avoid accidentally choosing a superseded path.

## Canonical implementation sequence

These direct scripts are canonical building blocks. For production scheduling/operation, use O13 graph-backed `refresh_data` entrypoints and wrappers from `docs/ops/o13-production-entrypoint-inventory.md` instead of invoking this chain as an independent scheduler.

1. `npm run discover:videos`
2. `npm run scrape:v2`
3. `npm run extract:llm`
4. `npm run match`
5. `npm run score`
6. `npm run consensus`

After migration `008-candles-guardrails.sql` is applied and a candle audit is
clean, validate the legacy rows with:

```bash
npm run validate:candles -- --execute
```

Without `--execute`, the command only reports invalid `candles.open_time` rows.

For JSONL-first shadow extraction reviews, use:

```bash
npm run shadow:extract
npm run shadow:diff
npm run shadow:promote -- --confirm-run-id <run-id> --write --allow-statuses new_calls,changed_calls
```

`manual_review` shadow rows are intentionally not promotable.

## Legacy compatibility scripts

These compatibility wrappers remain so old runbooks fail safe while directing
operators to the canonical implementations:

- `src/scripts/scrape-transcripts.ts` redirects to `src/scripts/scrape-transcripts-v2.ts`
- `src/scripts/extract-calls.ts` redirects to `src/scripts/extract-calls-llm.ts`
- `src/scripts/extract-calls-batch.ts` redirects to `src/scripts/extract-calls-llm.ts` and ignores legacy cooldown flags

`npm run scrape`, `npm run extract`, and `npm run pipeline` now point at the
canonical v2/LLM/data-pipeline paths directly.

## Superseded design artifact

`audit-output/DESIGN-LOCK.md` was the old B Terminal design lock. It has been
stamped `SUPERSEDED`; use `docs/frontend-design-spec.md` as the canonical
Editorial Terminal reference.
