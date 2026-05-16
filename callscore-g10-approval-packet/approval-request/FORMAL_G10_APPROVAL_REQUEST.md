# Formal G10 Approval Request — CallScore Growth OS Controlled Launch

**Request status:** PENDING HUMAN APPROVAL  
**Requested decision:** approve / reject / request changes  
**Scope:** G0 scope lock acceptance, trust asset approval, exact payload/target approval, and final G10 release sign-off for the draft-only controlled launch pack.  
**Safety rule:** no publish/send/spend/production mutation/live third-party call/money movement may occur before Workplane gate pass and exact Hermes/operator approval.

## Executive summary

The local automated preparation and verification work for the CallScore Growth OS Workplane-controlled launch pack is complete and clean. The launch pack remains draft-only and blocked from dispatch until manual approvals are recorded.

## Approval decisions requested

Please review the attached/supporting assets and record decisions for:

1. **G0 scope lock acceptance** — approve the PRD/non-goals scope or request changes.
2. **Trust asset approval** — approve methodology, right-of-reply, correction policy, disclaimer, sample-size caveat, and BinaryBaron brand guide drafts or request changes.
3. **Exact payload/target approvals** — approve or reject each of the 14 draft launch action hashes and targets in `launch-batch/PAYLOAD_APPROVAL_LEDGER.md`.
4. **Final G10 release sign-off** — approve controlled launch readiness only after the above items pass.

## Verification evidence

Latest local verification completed cleanly:

```text
npm test
# 94 tests, 94 pass, 0 fail

npm run validate
# Registry validation passed (6 runtimes, 17 workflows, 19 resources, 11 policies)

npm run status
# Read-only fake-adapter status only; no live checks

find src tests -name '*.js' -type f -print0 | xargs -0 -n1 node --check
# passed

launch hash verification
# 14/14 draft action hashes match exact action payloads
```

## Supporting assets included

- `G10_RELEASE_SIGNOFF_EVIDENCE.md` — evidence index.
- `G10_SIGNOFF_LEDGER.md` — manual sign-off ledger template.
- `G10_REMAINING_BLOCKERS.md` — explicit non-automatable blockers.
- `RELEASE_CHECKLIST.md` — checklist with automated/local controls marked complete and manual controls pending.
- `GATE_STATUS.md` — current gate status.
- `KANBAN.md` — macro board and G10 sub-checklist.
- `reviews/M10-synthesis.md` and lane reviews — independent review evidence.
- `launch-batch/MANIFEST.md` — draft launch manifest.
- `launch-batch/PAYLOAD_APPROVAL_LEDGER.md` — 14 exact draft action hashes/targets, all PENDING.
- `launch-batch/drafts/` — draft artifacts and `launch_actions.json`.
- `launch-batch/ROLLBACK_PLAN.md` — rollback procedure.
- `trust-assets/` — trust asset drafts.
- `workplane/tests/g10-launch-batch.test.js` — regression proving draft hashes match and dispatch remains blocked without approvals.

## Requested response format

Please reply using this structure:

```text
Decision: approved | rejected | changes_requested
Approver:
Scope covered:
G0 scope lock: approved | rejected | changes_requested
Trust assets: approved | rejected | changes_requested
Payload ledger: approved | rejected | changes_requested
Final G10 release sign-off: approved | rejected | changes_requested
Exceptions / requested changes:
Timestamp:
```

## Current safety state

All draft launch actions remain PENDING. Automated tests verify that dispatch is denied without Hermes/operator approvals. No external action, publication, send, spend, production mutation, live third-party call, or money movement has been performed.
