# Phase 3 Artifact Chain Report — CallScore

Generated: 2026-06-18
Repository: `/opt/crypto-tuber-ranked`
Phase: 3 — Artifact chain
Gate: Hard Gate 3

## Summary

Phase 3 added a durable artifact-chain layer on top of the Phase 2 control-plane foundation.

The goal was to make CallScore processing lineage queryable from downstream score/evaluation artifacts back through price resolution, validation, normalized/candidate calls, transcript segments, raw transcript, and video metadata.

No scoring, leaderboard publication, Whop behavior, public routes, cron schedules, or deploy configuration were changed.

## TDD evidence

Phase 3 followed test-first development.

Initial failing command:

```bash
node --import tsx --test tests/artifact-chain.test.ts tests/migrate.test.ts
```

Expected RED failures observed:

```text
CONTROL_PLANE_ARTIFACT_TYPES was undefined
repo.createLinkedArtifact is not a function
migrations/023-artifact-chain.sql did not exist
migration plan did not include migrations/023-artifact-chain.sql
```

Then the implementation was added and the same targeted command passed.

## Changed files

```text
docs/hermes/PHASE_3_ARTIFACT_CHAIN_REPORT.md
migrations/023-artifact-chain.sql
src/lib/control-plane/artifacts.ts
src/lib/control-plane/index.ts
src/lib/control-plane/repository.ts
src/lib/control-plane/types.ts
tests/artifact-chain.test.ts
tests/migrate.test.ts
```

## Migration details

Added:

```text
migrations/023-artifact-chain.sql
```

New table:

```text
artifact_links
```

Shape:

```text
id uuid primary key
workflow_run_id uuid references workflow_runs(id)
child_artifact_id uuid references artifacts(id)
parent_artifact_id uuid references artifacts(id)
link_type text
metadata jsonb
created_at timestamptz
```

Constraints:

```text
child_artifact_id <> parent_artifact_id
UNIQUE (child_artifact_id, parent_artifact_id, link_type)
link_type CHECK in supported link vocabulary
```

Supported link types:

```text
derived_from
evidence_for
validated_by
priced_by
scored_by
publication_decision_for
```

Indexes:

```text
idx_artifact_links_workflow_created
idx_artifact_links_child
idx_artifact_links_parent
idx_artifact_links_type_created
```

Important safety property:

```text
migrations/023-artifact-chain.sql does not ALTER calls or creator_stats.
```

The artifact-chain migration only extends control-plane lineage. It does not mutate final business state.

## Artifact types added

Added `src/lib/control-plane/artifacts.ts` with required artifact type constants:

```text
video_metadata
transcript_raw
transcript_segments
candidate_calls
normalized_calls
validation_report
price_resolution
score_evaluation
publication_decision
```

These correspond to the required Phase 3 chain:

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

Current concrete implementation represents the chain through immutable artifacts and `artifact_links` parent relationships. `agent_invocations` from Phase 2 already preserves model/prompt/version context for the artifacts created by a node.

## Repository additions

Extended `ControlPlaneRepository` with:

```text
createArtifactLink
createLinkedArtifact
listArtifactLineage
```

Behavior:

- `createArtifactLink` creates a parent/child link between immutable artifacts.
- `createLinkedArtifact` creates an artifact, then links it to one or more parent artifacts.
- `listArtifactLineage(rootArtifactId)` uses a recursive artifact lineage query to return the root artifact and its ancestors ordered by depth.
- Self-referential artifact links are rejected by repository code and DB check constraint.

## Hard Gate 3 checklist

1. Artifact creation works.
   - Status: passed.
   - Evidence: Phase 2 `createArtifact` tests plus Phase 3 linked artifact chain test.

2. Checksums are deterministic.
   - Status: passed.
   - Evidence: tests prove canonical JSON key-order independence and compare expected `score_evaluation` checksum.

3. Artifact lineage can be queried.
   - Status: passed.
   - Evidence: `listArtifactLineage(scoreArtifactId)` test returns:

```text
score_evaluation
price_resolution
validation_report
normalized_calls
candidate_calls
transcript_segments
transcript_raw
video_metadata
```

with depths:

```text
0, 1, 2, 3, 4, 5, 6, 7
```

4. At least one test or script proves artifact creation and retrieval.
   - Status: passed.
   - Evidence: `tests/artifact-chain.test.ts` creates the full linked chain and queries lineage.

5. Existing validation commands pass.
   - Status: passed.
   - Evidence: validation commands below.

## Validation results

Validation log:

```text
/opt/crypto-tuber-ranked/.tmp/hermes-phase3/phase3-validation-20260618T175948Z.log
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

### Command: `node --import tsx --test tests/artifact-chain.test.ts tests/control-plane-ledger.test.ts tests/migrate.test.ts`

Result: passed.

```text
1..12
# tests 12
# pass 12
# fail 0
EXIT_CODE: 0
```

### Command: `npm test`

Result: passed.

```text
1..684
# tests 687
# suites 2
# pass 687
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

1. Migration not applied to production DB.
   - This phase adds migration/code/tests only. Production DB mutation remains gated.

2. Artifact immutability is still mostly convention + append-only API, not DB-trigger enforced.
   - `artifact_links` is append-first and unique-constrained, but the base `artifacts` row can technically be updated by direct SQL. A future phase can add stricter DB privileges/triggers if needed.

3. `listArtifactLineage` currently walks ancestors from a root artifact.
   - Descendant queries and rich typed lineage views can be added in Phase 7 admin/observability.

4. Evidence spans are represented as content inside artifacts for now.
   - No first-class `transcript_segments` or `evidence_spans` DB table was added. That remains a Phase 5 workflow decision if durable segment rows are required.

5. No runtime workflow writes the artifact chain yet.
   - Phase 3 creates the durable structure and repository API. Phase 4/5 will wire runtime/video intelligence workflows to use it.

6. Link insertion is sequential after artifact creation.
   - For runtime execution, Phase 4 should use a transaction wrapper around artifact + links when production workflow nodes write multiple records.

## Rollback notes

Before production migration apply:

```bash
git revert <phase-3-commit>
```

If migration `023` has already been applied and must be rolled back, use an explicit operator-approved rollback:

```sql
DROP TABLE IF EXISTS artifact_links;
```

Do not drop if any artifact lineage audit data needs preservation.

## Hard Gate 3 status

Status: passed.

Implementation must stop here until Phase 4 is explicitly approved.

Recommended next phase after approval:

```text
Phase 4 — Workflow runtime
```

Primary Phase 4 goal:

```text
Implement a minimal typed workflow runtime supporting dependency ordering, node status updates, events, artifact inputs/outputs, retries, approval pause, cancellation, idempotency guard, and max loop/iteration limits.
```
