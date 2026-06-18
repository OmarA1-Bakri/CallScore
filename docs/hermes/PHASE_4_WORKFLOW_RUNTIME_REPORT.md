# Phase 4 Workflow Runtime Report — CallScore

Generated: 2026-06-18
Repository: `/opt/crypto-tuber-ranked`
Phase: 4 — Workflow runtime
Gate: Hard Gate 4

## Summary

Phase 4 added a minimal typed CallScore workflow runtime on top of the Phase 2 control-plane ledger and Phase 3 artifact chain.

The runtime is intentionally TypeScript-native and founder-appropriate. It does not introduce Temporal, a YAML workflow engine, a new job framework, new public/admin routes, or broad platform integrations.

No scoring, leaderboard publication, Whop behavior, deploy configuration, cron schedules, credentials, or production database state were changed.

## TDD evidence

Phase 4 followed test-first development.

Initial failing command:

```bash
node --import tsx --test tests/workflow-runtime.test.ts
```

Expected RED failure observed:

```text
MemoryWorkflowIdempotencyStore is not a constructor
```

This proved the runtime exports and implementation did not exist yet.

After implementation, the same command passed:

```text
1..7
# tests 7
# pass 7
# fail 0
```

## Changed files

```text
docs/hermes/PHASE_4_WORKFLOW_RUNTIME_REPORT.md
src/lib/control-plane/index.ts
src/lib/control-plane/runtime.ts
tests/workflow-runtime.test.ts
```

## Runtime architecture

Added:

```text
src/lib/control-plane/runtime.ts
```

Primary exports:

```text
WorkflowRuntime
MemoryWorkflowIdempotencyStore
WorkflowDefinition
WorkflowNode
WorkflowNodeContext
WorkflowNodeHandlerResult
WorkflowRunResult
```

The runtime uses the existing Phase 2/3 repository:

```text
ControlPlaneRepository
  → workflow_runs
  → workflow_node_runs
  → workflow_events
  → artifacts
  → artifact_links
  → approval_gates
```

No new database table was required in Phase 4.

## Supported node types

The existing Phase 2 node type vocabulary remains:

```text
deterministic
llm_structured
parallel_review
approval
delay_until
cancel
```

Phase 4 runtime can execute any of these node types through typed handlers. Specialized behavior currently exists for:

- `approval`: handlers can request gates and return `awaiting_approval`; runtime pauses workflow.
- `cancel`: runtime treats completion as cancellation unless handler returns another terminal status.

## Runtime behavior implemented

### Dependency ordering

- Runtime topologically sorts nodes before starting a workflow run.
- Missing dependency and duplicate node IDs are rejected before writing workflow state.
- Cycles are rejected before writing workflow state.

### Node status updates

For every executed node attempt, runtime writes:

```text
node.started
node.completed
node.failed
```

through repository lifecycle methods.

### Workflow status updates

Runtime writes:

```text
workflow.started
workflow.completed
workflow.failed
```

and records blocked/cancelled/approval terminal states through the existing workflow status update path.

### Artifact inputs and outputs

- Dependency output artifact IDs are passed into downstream node context as `inputArtifactIds`.
- Node output artifacts are created through `createLinkedArtifact`.
- By default, output artifacts link back to dependency artifacts.
- Node output artifact ID is attached to the corresponding node run.

### Retries

- Per-node `maxAttempts` is supported.
- Default max attempts: 3.
- Each attempt creates a separate node run.
- Failed attempts are recorded with error, attempt, and max_attempts metadata.
- When the retry cap is exhausted, workflow status becomes `failed`.

### Approval pause

- A node can return `status: "awaiting_approval"`.
- Runtime marks the node and workflow as `awaiting_approval` and stops downstream execution.
- The node handler can request a durable approval gate via repository.

### Cancellation

- A node can return `status: "cancelled"`.
- `cancel` node type defaults to cancellation.
- Runtime marks workflow as `cancelled` and stops downstream execution.

### Idempotency guard

- Runtime accepts an optional `idempotencyKey` per run.
- `MemoryWorkflowIdempotencyStore` provides a small in-process default store for tests and lightweight callers.
- If a key already maps to a run, runtime returns the existing run without executing nodes again.
- Durable DB-backed idempotency can be added later if needed; Phase 4 avoids new migration scope.

### Bounded loop / iteration guard

- Runtime validates max nodes/iterations before starting.
- Default max iterations: 100.
- Per-definition override: `maxIterations`.
- Cycles are blocked before any workflow state is written.

### Timeout guard

- Per-node `timeoutMs` is supported.
- Timeout failure is recorded as node failure and participates in retry/failure handling.

## Hard Gate 4 checklist

1. A workflow with multiple dependent nodes runs successfully.
   - Status: passed.
   - Evidence: `workflow runtime executes dependent nodes in order and passes artifacts between nodes`.

2. A failed node is recorded correctly.
   - Status: passed.
   - Evidence: `workflow runtime records terminal failure after retry cap`.

3. A retry is recorded correctly.
   - Status: passed.
   - Evidence: `workflow runtime records failed node attempts and retries within maxAttempts`.
   - First node run failed; second node run completed.

4. An approval node pauses execution.
   - Status: passed.
   - Evidence: `approval node pauses workflow and prevents downstream execution`.
   - Downstream publish node did not run.

5. A cancelled workflow does not continue.
   - Status: passed.
   - Evidence: `cancelled workflow does not continue to later nodes`.
   - Downstream node did not run.

6. Node events are written.
   - Status: passed.
   - Evidence: runtime tests assert node/workflow events and repository tests cover lifecycle events.

7. Artifacts can pass from one node to another.
   - Status: passed.
   - Evidence: dependency artifact is available to downstream node and `artifact_links` records parent/child relationship.

8. Full validation commands pass.
   - Status: passed.
   - Evidence: validation log below.

## Validation results

Validation log:

```text
/opt/crypto-tuber-ranked/.tmp/hermes-phase4/phase4-validation-20260618T181634Z.log
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

Known warning remains:

```text
`next lint` is deprecated and will be removed in Next.js 16.
```

### Command: targeted Phase 4 suite

```bash
node --import tsx --test tests/workflow-runtime.test.ts tests/artifact-chain.test.ts tests/control-plane-ledger.test.ts tests/migrate.test.ts
```

Result: passed.

```text
1..19
# tests 19
# pass 19
# fail 0
EXIT_CODE: 0
```

### Command: `npm test`

Result: passed.

```text
1..691
# tests 694
# suites 2
# pass 694
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

1. Runtime writes are not transaction-wrapped.
   - If artifact creation succeeds and link creation fails, partial state can exist. Phase 5 should add transaction support or repository-level transaction injection for production workflow execution.

2. Idempotency is in-process by default.
   - Durable DB idempotency is not implemented yet. Existing workflow metadata records the idempotency key, but runtime lookup currently depends on provided `WorkflowIdempotencyStore`.

3. Resume after approval is not implemented yet.
   - Phase 4 pauses at approval. A resume command/path should be added when approval UI/API exists.

4. Delay scheduling is handler-level only.
   - `delay_until` node type exists, but no scheduler integration was added.

5. Cancellation is node-driven.
   - External kill-switch integration should be wired when Workplane/Hermes oversight uses the runtime.

6. No production workflow uses runtime yet.
   - Phase 5 should define the first CallScore-native `video_intelligence_workflow` using this runtime.

7. Cost/token accounting is still through explicit agent invocation records.
   - Runtime does not infer token/cost fields automatically.

## Rollback notes

No migration was added in Phase 4.

Before production integration, rollback is a normal code revert:

```bash
git revert <phase-4-commit>
```

If a future workflow starts using `WorkflowRuntime`, revert the workflow integration first, then revert runtime code if needed.

## Hard Gate 4 status

Status: passed.

Implementation must stop here until Phase 5 is explicitly approved.

Recommended next phase after approval:

```text
Phase 5 — CallScore video intelligence workflow
```

Primary Phase 5 goal:

```text
Create video_intelligence_workflow that processes one fixture video/transcript into candidate or normalized market calls with evidence-linked artifacts and approval gates for low-confidence/ambiguous calls.
```
