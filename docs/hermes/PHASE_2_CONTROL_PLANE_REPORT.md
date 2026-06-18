# Phase 2 Control Plane Report — CallScore

Generated: 2026-06-18
Repository: `/opt/crypto-tuber-ranked`
Phase: 2 — Control-plane foundation
Gate: Hard Gate 2

## Summary

Phase 2 added a durable CallScore workflow control-plane foundation while preserving the existing production framework.

The implementation deliberately **does not replace** the current queue/worker substrate:

- Existing operational substrate remains: `pipeline_runs`, `pipeline_jobs`, `pipeline_job_events`, `hermes-worker`, Workplane readiness, and workflow receipts.
- New semantic control-plane ledger adds workflow/node/artifact/agent/gate records with optional bridge columns back to `pipeline_runs` and `pipeline_jobs`.
- No public routes, scoring behavior, Whop behavior, leaderboard behavior, cron schedules, deployment config, or production data mutations were changed.

## Changed files

```text
package.json
docs/hermes/DISCOVERY_REPORT.md
docs/hermes/PHASE_2_CONTROL_PLANE_REPORT.md
migrations/022-workflow-control-plane.sql
src/lib/control-plane/checksum.ts
src/lib/control-plane/index.ts
src/lib/control-plane/repository.ts
src/lib/control-plane/status.ts
src/lib/control-plane/types.ts
tests/control-plane-ledger.test.ts
tests/migrate.test.ts
```

## Migration details

Added:

```text
migrations/022-workflow-control-plane.sql
```

New tables:

```text
workflow_runs
workflow_node_runs
workflow_events
artifacts
agent_invocations
approval_gates
```

Key design choices:

1. Existing `pipeline_*` tables are preserved.
2. `workflow_runs.pipeline_run_id` optionally links a semantic workflow run to the existing pipeline run.
3. `workflow_node_runs.pipeline_job_id` optionally links a semantic node run to the existing worker job.
4. UUID primary keys are application-generated using `crypto.randomUUID()`; the migration does not require `pgcrypto` or another DB extension.
5. Control-plane status vocabulary uses the prompt-required set:

```text
pending
running
completed
failed
skipped
awaiting_approval
cancelled
blocked
```

6. Node type vocabulary uses:

```text
deterministic
llm_structured
parallel_review
approval
delay_until
cancel
```

7. Event vocabulary includes:

```text
workflow.started
workflow.completed
workflow.failed
node.started
node.completed
node.failed
artifact.created
agent_invocation.started
agent_invocation.completed
agent_invocation.failed
approval.requested
approval.approved
approval.rejected
gate.blocked
```

8. `artifacts` are documented as immutable audit records. Corrections should create new artifact versions rather than mutating old rows.
9. `artifacts.sha256` has a lowercase 64-character hex check constraint.
10. Table comments document owner/lifecycle/mutability assumptions.

## Types/models added

Added `src/lib/control-plane/*`:

```text
status.ts      — statuses, event types, node types, pipeline→workflow status adapter
checksum.ts    — stable JSON serializer and artifact SHA-256 helper
types.ts       — typed records and create inputs
repository.ts  — typed write repository and lifecycle/event helpers
index.ts       — barrel export
```

Repository capabilities added:

```text
createWorkflowRun
startWorkflowRun
updateWorkflowRunStatus
createWorkflowNodeRun
startNodeRun
updateNodeRunStatus
attachNodeOutputArtifact
recordEvent
createArtifact
recordAgentInvocation
requestApprovalGate
createApprovalGate
resolveApprovalGate
```

## Hard Gate 2 checklist

1. Database schema/migration is added.
   - Status: passed.
   - Evidence: `migrations/022-workflow-control-plane.sql`.

2. Types/models are added.
   - Status: passed.
   - Evidence: `src/lib/control-plane/*.ts`.

3. A workflow run can be created.
   - Status: passed.
   - Evidence: `tests/control-plane-ledger.test.ts` creates a workflow run through `startWorkflowRun`.

4. A node run can be created.
   - Status: passed.
   - Evidence: test creates a node run through `startNodeRun`.

5. An artifact can be created and checksummed.
   - Status: passed.
   - Evidence: test creates a `candidate_calls` artifact and verifies SHA-256 shape; checksum test proves canonical JSON is order-independent.

6. An event is written for each major lifecycle action.
   - Status: passed.
   - Evidence: test asserts exact event sequence:

```text
workflow.started
node.started
artifact.created
agent_invocation.completed
approval.requested
approval.rejected
node.completed
workflow.completed
```

7. Tests or script-level verification prove the above.
   - Status: passed.
   - Evidence: `tests/control-plane-ledger.test.ts` and `tests/migrate.test.ts`.

8. Existing tests/builds still pass, or failures are documented and unrelated.
   - Status: passed.
   - Evidence: full validation commands below.

## Test/script changes

Updated `package.json`:

```text
npm test
```

Old behavior in this shell context only executed 7 tests. Phase 2 changed it to enumerate all test files deterministically:

```bash
find tests -name '*.test.ts' -print0 | sort -z | xargs -0 node --import tsx --test
```

New result: 684 tests run, 684 passed.

This fixes the Phase 1 discovery risk where `npm test` was weaker than the actual test suite.

## Validation results

Validation log:

```text
/opt/crypto-tuber-ranked/.tmp/hermes-phase2/phase2-validation-20260618T172639Z.log
```

### Command: `npm run typecheck`

Result: passed.

```text
> crypto-tuber-ranked@0.1.0 typecheck
> tsc --noEmit
EXIT_CODE: 0
```

### Command: `npm run lint`

Result: passed.

```text
> crypto-tuber-ranked@0.1.0 lint
> next lint
✔ No ESLint warnings or errors
EXIT_CODE: 0
```

Known warning:

```text
`next lint` is deprecated and will be removed in Next.js 16.
```

### Command: `node --import tsx --test tests/control-plane-ledger.test.ts tests/migrate.test.ts`

Result: passed.

```text
1..9
# tests 9
# pass 9
# fail 0
EXIT_CODE: 0
```

### Command: `npm test`

Result: passed.

```text
1..681
# tests 684
# suites 2
# pass 684
# fail 0
# cancelled 0
# skipped 0
# todo 0
EXIT_CODE: 0
```

### Command: `npm run build`

Result: passed.

```text
> crypto-tuber-ranked@0.1.0 build
> next build
✓ Compiled successfully
✓ Generating static pages (39/39)
EXIT_CODE: 0
```

## Known risks

1. Migration has not been applied to production in this phase.
   - This is intentional. Phase 2 code/schema was added and verified by tests/build, but no production DB mutation was performed.

2. `workflow_node_runs.output_artifact_id` creates a circular conceptual relationship with `artifacts.node_run_id`.
   - The migration handles this by creating `workflow_node_runs` first, then `artifacts`, then adding `workflow_node_runs_output_artifact_fk` in a guarded `DO $$` block.

3. Repository writes are sequential, not wrapped in a transaction yet.
   - Phase 2 is foundation-level. Phase 4 runtime should either use `withTransaction` or add transaction-aware repository methods for multi-step runtime execution.

4. Control-plane lifecycle helpers currently write core events, but no generic replay API exists yet.
   - Replay/lineage query APIs belong in Phase 3/4/7.

5. No public/admin observability routes were added.
   - Intentional. Phase 7 owns dashboard/API exposure.

6. Artifact immutability is enforced by convention and repository design, not by a DB trigger.
   - A future retention/immutability trigger can be added if needed, but Phase 2 kept implementation founder-appropriate and minimal.

7. Agent invocation cost/token fields are captured where provided, but no provider-specific cost calculator was added.
   - Provider accounting belongs with workflow runtime / model adapter phases.

## Rollback notes

Before production migration apply:

```bash
git revert <phase-2-commit>
```

If migration `022` has already been applied and must be rolled back, use an explicit operator-approved rollback script that drops the new control-plane tables in dependency order:

```sql
DROP TABLE IF EXISTS approval_gates;
DROP TABLE IF EXISTS agent_invocations;
ALTER TABLE workflow_node_runs DROP CONSTRAINT IF EXISTS workflow_node_runs_output_artifact_fk;
DROP TABLE IF EXISTS artifacts;
DROP TABLE IF EXISTS workflow_events;
DROP TABLE IF EXISTS workflow_node_runs;
DROP TABLE IF EXISTS workflow_runs;
```

Do not run this rollback in production if any workflow audit data needs preservation.

## Hard Gate 2 status

Status: passed.

Implementation must stop here until Phase 3 is explicitly approved.

Recommended next phase after approval:

```text
Phase 3 — Artifact chain
```

Primary goal for Phase 3:

```text
score
  → evaluation
  → normalized market call
  → candidate call
  → evidence span
  → transcript segment
  → transcript
  → video
  → workflow run
  → model/prompt/schema version
```
