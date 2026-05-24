# G10 Manual Sign-off Ledger

**Status:** BLOCKED — no manual sign-offs recorded yet.  
**Applies to:** first controlled CallScore Growth OS launch batch.  
**Stop rule:** no external/public/financial/production action before exact Workplane gate pass and Hermes/operator approval.

## Required approvals

| Approval | Required actor | Status | Evidence / signature reference | Notes |
|---|---|---|---|---|
| G0 scope lock acceptance | Verifier or product owner | PENDING | TBD | `GATE_STATUS.md` currently lists G0 as `in_review`. |
| G10 verifier sign-off | Verifier | PENDING | TBD | Must review M10 reports and this G10 evidence pack. |
| Operator launch approval | Operator/founder | PENDING | TBD | Must approve exact payload hashes and targets. |
| Trust asset approval | Verifier + operator | PENDING | TBD | Methodology, right-of-reply, correction, disclaimer, sample-size caveat, brand guide. |
| Rollback/emergency-stop acknowledgement | Operator/founder | PENDING | TBD | Must acknowledge `launch-batch/ROLLBACK_PLAN.md` and emergency-stop test evidence. |

## Sign-off record template

Copy one block per approval when a human sign-off is actually granted.

```text
Approval:
Actor:
Authority basis:
Decision: approved | rejected | changes_requested
Exact scope:
Evidence reviewed:
Payload hashes / targets covered, if any:
Timestamp UTC:
Signature / source reference:
Notes:
```

## Current decision

G10 must remain `IN_PROGRESS`/blocked until every required approval above is recorded.
