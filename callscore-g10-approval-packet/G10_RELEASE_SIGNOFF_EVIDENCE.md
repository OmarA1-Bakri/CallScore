# G10 Release Sign-off Evidence Index

**Status:** IN_PROGRESS — evidence assembled; manual verifier/operator approvals still required.  
**Stop rule:** no publish/send/spend/production mutation/live third-party call/money movement without Workplane gate pass and exact Hermes/operator approval.

## Current gate posture

| Gate | Evidence | Status for G10 |
|---|---|---|
| G0 Scope Lock | `GATE_STATUS.md` lists G0 as `in_review`; PRD packet exists. | BLOCKING until formally accepted. |
| G1-G9 | `GATE_STATUS.md`, M10 review reports, `workplane` test/validate/status output. | Locally verified. |
| M10 Independent Review | `reviews/M10-synthesis.md` plus lane reports. | Complete: no unresolved P0/P1. |
| G10 Manual Release | `RELEASE_CHECKLIST.md` and this evidence index. | BLOCKED until verifier + operator sign-off. |

## Verification evidence

Run in `workplane/` after review patch:

```text
npm test
# 94 tests, 94 pass, 0 fail

npm run validate
# Registry validation passed (6 runtimes, 17 workflows, 19 resources, 11 policies)

npm run status
# Read-only runtime status emitted; fake adapters only; live_checked=false

find src tests -name '*.js' -type f -print0 | xargs -0 -n1 node --check
# exit 0
```

## Review evidence

- `reviews/M10-code-review.md`
- `reviews/M10-security-review.md`
- `reviews/M10-test-contract-review.md`
- `reviews/M10-architecture-gate-review.md`
- `reviews/M10-documentation-board-review.md`
- `reviews/M10-synthesis.md`
- Remaining blockers: `G10_REMAINING_BLOCKERS.md`

## Release checklist evidence map

| Checklist area | Evidence path | Current status |
|---|---|---|
| Pre-release gates | `GATE_STATUS.md`, `KANBAN.md`, M10 reports | G1-G9 locally verified; G0 still in review; G10 pending sign-off. |
| Trust assets | `trust-assets/` | Draft assets present; approval status not yet recorded. |
| Launch batch | `launch-batch/MANIFEST.md`, `launch-batch/drafts/`, `launch-batch/PAYLOAD_APPROVAL_LEDGER.md` | 14 local draft action hashes generated and regression-tested; exact payload approvals not yet recorded. |
| Rollback plan | `launch-batch/ROLLBACK_PLAN.md` | Draft rollback plan present. |
| Emergency stop | `workplane/tests/g9-hardening.test.js` | Automated emergency-stop behavior test passed. |
| No unresolved high/critical risks | `reviews/M10-synthesis.md` | No unresolved P0/P1 after runtime-binding fix. |

## Draft launch batch evidence

- 5 scorecard drafts: `launch-batch/drafts/scorecard_*.json`
- 5 creator page drafts: `launch-batch/drafts/creator_page_*.json`
- Weekly digest draft: `launch-batch/drafts/weekly_digest.json`
- Methodology/correction/GitHub methodology drafts: `launch-batch/drafts/*methodology*.json`, `launch-batch/drafts/correction_log_page.json`
- Exact action hashes for approval review: `launch-batch/drafts/launch_actions.json` and `launch-batch/PAYLOAD_APPROVAL_LEDGER.md`
- Automated regression: `workplane/tests/g10-launch-batch.test.js` proves hashes match, approval status remains pending, and all draft actions are blocked without Hermes/operator approvals.

## Required manual sign-offs before G10 can be marked DONE

- [ ] Formal G0 scope lock acceptance recorded.
- [ ] Verifier signs G10 release checklist.
- [ ] Operator approves exact launch-batch payload hashes and targets.
- [ ] Trust assets marked approved.
- [ ] Emergency stop/rollback procedure acknowledged for the controlled launch.
- [ ] Confirmation that no external action has occurred before exact gate and Hermes approval.

## Recommended next action

Complete the manual sign-off fields above, then rerun:

```bash
cd workplane
npm test
npm run validate
npm run status
find src tests -name '*.js' -type f -print0 | xargs -0 -n1 node --check
```

Only after those checks and manual approvals should `G10 Release` or `M11` move to DONE.
