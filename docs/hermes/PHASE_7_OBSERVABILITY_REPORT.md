# Phase 7 Observability Report — CallScore

Generated: 2026-06-18
Repository: `/opt/crypto-tuber-ranked`
Phase: 7 — Observability dashboard/admin views
Gate: Hard Gate 7

## Summary

Phase 7 added read-only control-plane observability query surfaces.

The implementation exposes workflow runs, workflow details, artifacts, events, approval gates, blocked items, and entity lineage without adding mutation endpoints.

No customer/payment/provider/Whop/deploy/cron/production DB state was changed.

## Files changed

```text
src/lib/control-plane/repository.ts
src/lib/control-plane/observability.ts
src/lib/control-plane/index.ts
src/app/api/workflows/route.ts
src/app/api/workflows/[id]/route.ts
src/app/api/calls/[id]/lineage/route.ts
tests/control-plane-observability.test.ts
docs/hermes/PHASE_7_OBSERVABILITY_REPORT.md
```

## Read-only API surfaces

Added GET-only routes:

```text
GET /api/workflows
GET /api/workflows/[id]
GET /api/calls/[id]/lineage
```

No POST/PUT/PATCH/DELETE handlers were added.

## Repository query additions

Added read-only methods:

```text
listWorkflowRuns
getWorkflowRun
listWorkflowNodeRuns
listWorkflowEvents
listWorkflowArtifacts
listWorkflowApprovalGates
listArtifactsForEntity
listBlockedItems
```

## Redaction

`redactArtifactForObservation` recursively redacts credential-shaped artifact JSON keys:

```text
api_key
authorization
cookie
password
secret
token
```

This is a defensive observability layer. It does not make artifact storage safe for secrets; secrets still must not be stored in artifacts.

## Hard Gate 7 checklist

Passed:

```text
1. Workflow overview can be queried.
2. Workflow detail can be queried.
3. Blocked/approval items can be queried.
4. Entity lineage can be queried.
5. Artifact JSON redaction exists for observation surfaces.
6. API routes are GET-only/read-only.
7. Typecheck/lint/targeted tests pass.
```

## Validation

Targeted validation log:

```text
/opt/crypto-tuber-ranked/.tmp/hermes-phase7/phase7-targeted-20260618T184419Z.log
```

Commands passed:

```text
npm run typecheck
npm run lint
node --import tsx --test tests/control-plane-observability.test.ts
```

Results:

```text
typecheck: passed
lint: passed
targeted tests: 4 passed, 0 failed
```

Full-suite validation is deferred to the final all-phases gate.

## Known risks

1. Routes currently rely on existing app/runtime auth posture and are read-only.
2. No browser UI page was added; this phase prioritized API/query surfaces.
3. Redaction is key-name based, not semantic DLP.
4. Production DB migration application is still separate and gated.

## Hard Gate 7 status

Status: passed.

Continuing automatically because Omar approved all remaining phases.
