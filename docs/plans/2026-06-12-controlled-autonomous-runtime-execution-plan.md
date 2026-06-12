# CallScore Controlled Autonomous Runtime Execution Plan — 2026-06-12

## Target
Move CallScore from private growth intelligence / partial autonomy to controlled autonomous runtime readiness without production contamination.

## Safety invariants
- No Gemma production calls.
- No production extractor default change.
- No creator_stats mutation from shadow output.
- No Whop live pricing/product/payment/customer/entitlement mutation.
- No public Art of War publishing/outreach/spend.
- No 25-video transcript batches.
- No secrets/cookies/tokens in logs, docs, or commits.

## Work slices
1. Freeze HH state and public safety evidence.
2. Audit existing workplane/job/status surfaces; update existing files only.
3. Run bounded laptop transcript collector loop; stop blind retry after repeated 0/5.
4. Certify post-ingest state only if useful transcripts land.
5. Align Gemma local Modelfile with production shadow extraction schema; keep shadow-only.
6. Run bounded Gemma shadow + ML idle report.
7. Verify Whop-auto read-only/dry-run readiness.
8. Run Art of War private dry-run report and update private campaign artifacts.
9. Extend unified workplane status so Hermes can choose safe next action and approval-gated action.
10. Add promotion review evidence without auto-promotion.
11. Validate and merge through PR if files changed.

## Acceptance
- Workplane status is JSON and covers transcript, Gemma, ML, Whop, Art of War, Claude automations, gates, revenue status.
- Collector evidence is recorded: successes or exact blocker.
- Gemma promotion remains HOLD unless gates pass.
- Private Art of War artifacts exist; public actions blocked.
- Tests/lint/typecheck/build/hygiene pass.
