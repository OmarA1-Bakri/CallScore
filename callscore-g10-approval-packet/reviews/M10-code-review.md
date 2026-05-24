# M10 Code Correctness Review

**Verdict:** APPROVE_WITH_FOLLOWUPS  
**Scope:** `workplane/src/**`, `workplane/tests/**`  
**Review date:** 2026-05-12 UTC

## Evidence

- `cd workplane && npm test` passed: 91 tests, 0 failures.
- `cd workplane && npm run validate` passed: 6 runtimes, 17 workflows, 19 resources, 11 policies.
- `cd workplane && npm run status` passed in read-only mode with fake adapters only.
- `find src tests -name '*.js' -type f -print0 | xargs -0 -n1 node --check` passed.

## Findings

### R1-F1 — Runtime identity missing from modern approval binding — FIXED

- **Severity:** P1 before fix; resolved in this review phase.
- **Files:** `workplane/src/registry/schema.js`, `workplane/src/callscore/hermes.js`, `workplane/tests/g1-policy.test.js`
- **Issue:** `approvalBindingMatchesAction`, approval request/grant events, and `canonicalPayloadHash` did not explicitly include `runtime_id`, while the Workplane PRD/test plan requires exact approvals to bind runtime/workflow/action/target/payload hash.
- **Fix:** Approval records, queue rows, request events, grant events, event-chain validation, and stable action hash identity now include `runtime_id`.
- **Regression:** Added `approval event chain cannot be replayed across runtimes` and runtime-drift hash/binding assertions.

## Follow-ups

- P2: Legacy `approvalMatchesAction` remains only for backward tests and compares object targets by identity. Prefer migrating callers to `approvalBindingMatchesAction` and then deleting the legacy matcher.
- P2: Consider extracting shared approval test fixtures to reduce duplicated event construction across G1/G5/G7 tests.
