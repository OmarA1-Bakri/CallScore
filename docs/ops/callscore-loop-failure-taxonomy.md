# CallScore Loop Failure Taxonomy

Status: canonical taxonomy for Loop Engineering Kernel v1
Scope: dry-run/local-write loops in `/opt/crypto-tuber-ranked`

## Core failure classes

| Failure class | Meaning |
|---|---|
| `missing_fixture` | Required fixture/eval input is absent. |
| `malformed_artifact` | Shadow, diff, fixture, or report artifact cannot be parsed. |
| `json_valid_rate_below_threshold` | JSON validity is below gate. |
| `schema_pass_rate_below_threshold` | Output shape does not satisfy the extraction contract. |
| `parser_errors_present` | Parser errors exist in artifacts. |
| `unreviewed_high_confidence_diff` | Shadow output changed important calls without review. |
| `no_accepted_calls` | Run produced no accepted calls, so quality signal is weak. |
| `metric_regression` | Candidate output worsened the tracked metric. |
| `approval_missing` | Metrics may be clean, but promotion approval is absent. |
| `unsafe_mutation_requested` | A loop attempted or requested an out-of-envelope action. |
| `no_progress` | Loop produced no meaningful improvement or actionable failure. |

## Extraction-specific priority

CallScore prioritizes precision over recall. False positives, quote support errors, creator-ownership mistakes, and unsupported claims are trust failures.

A missed call is acceptable. A wrongly attributed or wrongly scored call is not.

## Stop conditions

- same failure class repeats three times;
- unsafe action requested;
- approval missing for promotion;
- metrics regress;
- evaluator artifacts are missing or malformed;
- production side effect requested.

## Forbidden outcomes

The kernel may only create local reports and receipts until a separate gated workflow approves a live action.
