# O13 Parent Receipt Audit

Generated: 2026-06-26T02:12Z

Scope: parent verification of the production-entrypoint cutover receipts referenced by `docs/ops/o13-production-entrypoint-inventory.md`. This audit intentionally targets the cutover/proof receipts named in the inventory, not every fixture or negative-test receipt under `.tmp/workflow-receipts/`.

## Result

PASS.

- Inventory-referenced collect receipts: 13
- Audited receipts found: 13
- Missing receipts: 0
- Goals covered: `alerts`, `dispatch_worker_once`, `evidence_research`, `monitor`, `produce_video`, `refresh_data`, `revenue_now`, `trust_review`
- Mutation-flag inconsistency blockers: 0
- Secret-pattern hits in audited JSON: 0
- Referenced summary artifacts with `secret_redaction_applied:true`: all

Machine-readable audit artifact:

- `.tmp/o13-proofs/o13-parent-receipt-audit.json`

## Audited receipt ids

| Goal | Receipt id |
|---|---|
| monitor | `op-monitor-collect_receipts-3cd531449c7593c7` |
| dispatch_worker_once | `op-dispatch_worker_once-collect_receipts-d87a766f7f971e7d` |
| refresh_data | `op-refresh_data-collect_receipts-66030fb156febad0` |
| produce_video | `op-produce_video-collect_receipts-343c00bb50d73133` |
| produce_video | `op-produce_video-collect_receipts-00f6e77337efceac` |
| revenue_now | `op-revenue_now-collect_receipts-96d5fe84807b3a97` |
| revenue_now | `op-revenue_now-collect_receipts-86a970dbb10ff2c9` |
| evidence_research | `op-evidence_research-collect_receipts-1de8d309105a0645` |
| alerts | `op-alerts-collect_receipts-05c0caaa6ece10f6` |
| alerts | `op-alerts-collect_receipts-700d3fc89ec4b499` |
| trust_review | `op-trust_review-collect_receipts-45aef337c212f944` |
| refresh_data | `op-refresh_data-collect_receipts-0d6857e26e34f61a` |
| dispatch_worker_once | `op-dispatch_worker_once-collect_receipts-1b40f07a8cf41172` |

## Audit checks

The parent audit script checked:

1. Every inventory-referenced `op-*-collect_receipts-*` artifact exists under `.tmp/workflow-receipts/callscore_operating_graph/`.
2. Each referenced summary/receipt parses as JSON.
3. Referenced summaries carry `secret_redaction_applied:true`.
4. No referenced receipt has a `mutation_flags_inconsistent:*` blocker.
5. Referenced JSON text has no obvious unredacted credential patterns: bearer tokens, API-key/secret/password/cookie/token assignments, GitHub PATs, OpenAI-style `sk-*` keys, or Postgres URLs.
6. Goal coverage spans the intended O5-O12 operating domains used by the production entrypoint cutover.

## Notes

The raw receipt directory also contains intentional fixture and negative-test receipts, including tests that create mutating or inconsistent flags to prove fail-closed behavior. Those are not production cutover receipts and are excluded from this inventory-targeted audit.
