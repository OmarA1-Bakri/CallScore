# CallScore Loop Engineering Contract

Status: canonical dry-run/local-write contract
Scope: `/opt/crypto-tuber-ranked` Workplane model
Initial track: transcript extraction precision

## Purpose

The Loop Engineering Kernel is the reusable method behind CallScore improvement loops. It turns a bounded source set into an evaluated candidate, classifies failures, records metrics, writes a receipt, and returns the next safe action.

The first implementation is local-write only. It can create reports and receipts, but it cannot perform live surface changes or promote the extractor.

## Canonical loop shape

```text
LoopContract
→ source artifacts
→ existing evaluator / benchmark / ML idle primitive
→ failure taxonomy
→ LoopReceipt
→ next safe action
```

## Required LoopContract fields

| Field | Meaning |
|---|---|
| `loop_id` | Stable loop identifier, for example `callscore_extraction_precision_loop`. |
| `track` | Product/control track such as `transcript_extraction`, `art_of_war`, `whop_conversion`, or `creator_trust`. |
| `objective` | What the loop is trying to improve. |
| `source_data` | Fixtures, shadow outputs, diffs, campaign receipts, or other local artifacts. |
| `allowed_mutations` | For the first kernel: local `.tmp` artifact writes only. |
| `forbidden_mutations` | Any action outside the local receipt/report envelope. |
| `metric` | The primary metric and direction. |
| `max_iterations` | Bounded iteration cap. No endless autonomous mutation. |
| `verifier_stack` | Gates that must emit pass/fail/failure class. |
| `approval_policy` | Explicit approval requirements before any promotion or live action. |
| `stop_conditions` | Conditions that stop the loop and force review. |

## First implementation: extraction loop

The first loop reuses the existing CallScore ML/eval primitives:

- `data/eval/call-extraction-fixtures.jsonl`
- `src/scripts/evaluate-llm-gold-set.ts`
- `src/scripts/benchmark-local-extractors.ts`
- `src/scripts/ml-idle-improve.ts`
- `src/lib/llm-eval.ts`

The kernel must not duplicate those evaluators. It wraps them with contract, failure classification, receipt, and Workplane status.

## Required safety invariants

Every `LoopReceipt` must record all external/live effect flags as `false`, including public action, provider action, commerce action, production mutation, extractor default change, production data write permission, production call write permission, and ranking impact permission.

## Promotion rule

A loop can recommend promotion review. It cannot perform promotion. Extractor default changes require explicit operator approval, a promotion review artifact, and a receipt.
