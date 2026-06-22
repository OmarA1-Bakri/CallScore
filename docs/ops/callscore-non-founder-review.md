# CallScore non-founder review queue

Purpose: route ambiguous trust decisions to a bounded non-founder review surface instead of Omar/founder review.

Decision artifact shape:
- `decision`: stays `review` until resolved.
- `risk_class`: usually `public_claim_risk` for ambiguous public scoring/claim decisions.
- `reason_codes`: copied from the trust decision, e.g. `medium_confidence_non_founder_review`.
- `evidence`: workflow artifact / approval gate / receipt references with URI and summary.
- `recommended_action`: `request_more_evidence`, `keep_suppressed`, or `approve_publish`.
- `source_workflow`, `source_workflow_run_id`, `source_run_id`: link the queue item back to the workflow/run that produced it.
- `expires_at` or `reconsider_after`: prevents indefinite ambiguous queue state.

Local persistence:
- Queue items are JSON artifacts under `.tmp/workflow-receipts/non_founder_review_queue/<review_item_id>.json` by default.
- The path is local-only and mode `0600` when written by the library.
- The queue is intentionally not an email, DM, provider, Whop, DB, deploy, or public publishing surface.

Library entry points:
- `createNonFounderReviewItem(decision, options)`
- `writeNonFounderReviewItem(item, root?)`
- `readNonFounderReviewQueue({ root?, status? })`
- `resolveNonFounderReviewItem({ review_item_id, action, resolved_by, gate_receipt_id?, notes?, root? })`

CLI examples:

```bash
# List open review items from the local repo queue.
node --import tsx src/scripts/callscore-non-founder-review.ts --status open

# Create from a serialized trust decision or trust decision input JSON file.
node --import tsx src/scripts/callscore-non-founder-review.ts \
  --create \
  --decision-json .tmp/example-trust-decision.json \
  --due-at 2026-06-22T12:00:00.000Z \
  --expires-at 2026-06-28T12:00:00.000Z \
  --source-workflow video_intelligence_workflow \
  --source-workflow-run-id workflow-run-1 \
  --source-run-id pipeline-run-1

# Resolve by keeping suppressed; no founder escalation and no provider send.
node --import tsx src/scripts/callscore-non-founder-review.ts \
  --resolve review-1 \
  --action keep_suppressed \
  --resolved-by trust-ops-reviewer \
  --notes "Evidence remains ambiguous; keep suppressed."

# Approve publish only when a NON_FOUNDER_TRUST_REVIEW gate receipt exists.
node --import tsx src/scripts/callscore-non-founder-review.ts \
  --resolve review-1 \
  --action approve_publish \
  --resolved-by trust-ops-reviewer \
  --gate-receipt-id non-founder-gate-receipt-1
```

Safety notes:
- Founder escalation is always `false` for routine ambiguity.
- `approve_publish` resolution requires explicit `NON_FOUNDER_TRUST_REVIEW` gate evidence and only records a review artifact; downstream promotion/public scoring must still consume that gate evidence explicitly.
- Suppress/review items remain excluded from public scoring until a gated resolver artifact says otherwise.
- Named negative creator claims, legal/compliance claims, investment advice, and unsupported performance claims should not enter this queue; they fail closed via suppression.
- No secrets should be embedded in evidence summaries, URIs, notes, or receipt IDs.
