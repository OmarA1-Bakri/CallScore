# CallScore Full-System Recovery and Activation Plan

> **For Hermes:** Execute this plan phase-by-phase with `software-development/subagent-driven-development`, strict RED -> GREEN for code changes, three independent reviews, and parent verification. The next authorised prompt covers Phase R1 only.

**Goal:** Restore CallScore from its current degraded-but-live state to a receipt-backed, canonically supervised, credential-safe, freshly activated autonomous system without losing session history, bypassing Workplane/LangGraph, or claiming public/commercial outcomes that have not been read back.

**Architecture:** Recovery is a sequential state machine. Storage and gateway supervision are repaired first because they are already breaking scheduled writes. Credential replacement then runs only through `credential_rotation_node` with provider-specific `SECRET_GATE` approvals and a graph-owned secret sink. Only affected runtimes are recreated, canonical activation restarts from Phase 0, and data/content/video lanes are re-armed only after activation passes.

**Tech stack:** Hermes Agent SQLite/WAL session store, user and system systemd units, Docker workers, PostgreSQL queues, LangGraph/Workplane, Composio MCP, Langfuse, Node.js/TypeScript, Python, shell, Git.

---

## 1. Frozen live baseline

Baseline receipt:

- `/opt/crypto-tuber-ranked/.tmp/system-status/callscore-whole-system-20260730T022510Z.json`
- SHA-256: `5df31df161df670c9aac654750aba41aa4f9d6e0973eb770ff474fd47a981549`

Repository baseline:

- Repo: `/opt/crypto-tuber-ranked`
- Branch: `master`
- HEAD: `76424e87f1c08514c780c2f20773f8d5c24a4681`
- Tree: `d96364271a275de87c0b9cdd60cfe6058a3c7612`
- Clean at the diagnostic boundary
- 31 commits ahead of `origin/master`, 0 behind, unpushed
- Full suite: `1474/1474`
- Credential-focused tests: `18/18`
- Canonical agent audit: `51/51`

Current operational truth:

| Layer | Status | Evidence-backed meaning |
|---|---|---|
| Public website/read surface | LIVE | Freshness proof passed; leaderboard API and rendered rows agreed at 40 |
| Mandatory workers | LIVE | Both containers run, accept exec probes, and have restart count 0 |
| Workplane | OK / `CONTROLLED_FULL` | Control-plane readiness, not global activation authority |
| Hermes state storage | DEGRADED | Root is 95% used; `state.db` is about 13.8 GB; writes have failed with `No space left on device` |
| Gateway | DEGRADED | Manual gateway PID is live; enabled canonical user service is failed |
| Canonical activation | BLOCKED | Latest immutable run failed Phase 2; it has not been rerun after worker recovery |
| Credentials | BLOCKED | 41 require authoritative rotation; no replacement, readback, revocation or provider mutation occurred |
| Data cadence | DEGRADED | Candle refresh is live; daily pipeline and scoring/fresh-call cadence are stale or failed |
| CMO/public content | DEGRADED | CMO cron is enabled but its latest run failed before provider mutation; no fresh accepted canonical package |
| YouTube | BLOCKED | Production consumer paused; zero video jobs |
| Learning/outcomes | NOT PROVEN | Durable learning schemas exist, but current conversion/subscriber/revenue results are absent |

Additional current storage facts discovered during plan authoring:

- Live state DB schema version is 23, but `messages_fts` and `messages_fts_trigram` still use the legacy content-owning layout.
- `hermes sessions optimize-storage` is the supported migration to compact external-content FTS.
- The supported `--no-vacuum` migration requires about 30% of current DB size; current free space exceeds that preflight.
- Dry-run candidates at plan time were:
  - ended `cron` sessions inactive over 1 day: 2,296;
  - ended `subagent` sessions inactive over 1 day: 458;
  - ended `cli` sessions inactive over 7 days: 470.
- CLI sessions are valuable user history and are not authorised for pruning by the Phase R1 prompt.
- Existing local rollback candidate: `/srv/agents/hermes/profiles/callscore/state-snapshots/20260728-025055-pre-update/`.
- That candidate contains secret-bearing files. No receipt may print or copy their values.
- `/usr/local/bin/agent-snapshot` currently attempts to tar live, changing Hermes files; its latest run failed after about 21 minutes. The failed partial archive was removed and `/srv/agents/backups` contained no completed archive.

## 2. Authority and invariants

This plan is not mutation authority by itself.

### Allowed only when the phase-specific operator prompt explicitly authorises it

- Stop and start the canonical CallScore gateway.
- Stop and restore the two affected system timers during a bounded maintenance window.
- Migrate the Hermes FTS index to the supported compact layout.
- Prune only the exact ended background-session cohorts named by the prompt.
- Replace the broken snapshot implementation through its canonical source and install path.
- Delete exactly one superseded local state snapshot only after a newer snapshot passes integrity, manifest, permission and restore-readback checks.

### Always forbidden without a separate later gate

- Direct provider or public mutations.
- Credential values in chat, logs, graph state or receipts.
- Ad hoc `.env.hermes` replacement.
- Old-credential revocation before replacement creation, graph-owned storage, runtime adoption and replacement readback.
- Deployment, image rebuild, scale change, DB/schema mutation, paid spend, email/DM/newsletter, Whop/payment/customer mutation, or public publication.
- Broad `rm`, globs, `git clean`, reset, stash, amend, force-push or unrelated file deletion.
- Pruning CLI, messaging, active, pinned or archived sessions in Phase R1.
- Treating Workplane `READY_PUBLIC_OWNED` as a substitute for a fresh activation receipt.

### Required receipt shape

Every phase receipt uses a top-level `schema` field, never `receipt_type` or `receipt_schema`. Minimum fields:

```json
{
  "schema": "callscore.system_recovery_phase_receipt.v1",
  "run_id": "<bounded-id>",
  "phase": "<phase-id>",
  "status": "pass|blocked|failed",
  "started_at_utc": "<ISO-8601>",
  "completed_at_utc": "<ISO-8601>",
  "authority": {},
  "before": {},
  "actions": [],
  "after": {},
  "blockers": [],
  "rollback": {},
  "next_action": "<one exact action>"
}
```

Receipts must include absolute path, SHA-256 and semantic validation. Parent-injected success objects are not execution proof.

## 3. Recovery state machine

```text
R0_PLAN_FROZEN
  -> R1_STORAGE_AND_GATEWAY_PASS
  -> R2_SECRET_GATE_MATRIX_PASS
  -> R3_REPLACEMENTS_ADOPTED_AND_READ_BACK
  -> R4_OLD_CREDENTIALS_REVOKED_AND_PROVEN
  -> R5_CANONICAL_ACTIVATION_PASS
  -> R6_DATA_CONTENT_VIDEO_CADENCE_PASS
  -> R7_MEASURED_OUTCOMES_ACTIVE
```

A failed mandatory gate stops the chain. Later phases may not infer success from earlier green tests.

---

## 4. Phase R0 — Freeze and validate the recovery target

**Objective:** Bind execution to an immutable plan and current live baseline.

**Files:**

- Plan: `/opt/crypto-tuber-ranked/docs/plans/2026-07-30-callscore-full-system-recovery-and-activation.md`
- Prompt: `/opt/crypto-tuber-ranked/docs/prompts/2026-07-30-callscore-state-gateway-maintenance-prompt.md`
- Runtime control directory: `/opt/crypto-tuber-ranked/.tmp/system-recovery/<run-id>/`
- Master state: `/opt/crypto-tuber-ranked/.tmp/system-recovery/<run-id>/master-state.json`

**Steps:**

1. Commit the plan and prompt together.
2. Compute both file SHA-256 values and record the commit SHA.
3. Obtain three independent verdicts against the exact commit and hashes: specification/operations, implementation/feasibility, and security/rollback.
4. If either file changes, invalidate all verdicts and rerun all three reviews.
5. Before execution, recapture Git state, root bytes/inodes, DB/WAL/SHM sizes, systemd unit state, gateway PID ownership, worker health, Workplane, Langfuse and public freshness.
6. Write `master-state.json` atomically with mode `0600`.

**Acceptance:** Three PASS verdicts and parent reconciliation against the exact immutable target. No mutation has occurred.

---

## 5. Phase R1 — Repair storage, snapshotting and canonical gateway supervision

**Objective:** Restore durable session writes, safe disk headroom, one verified rollback snapshot, a passing snapshot timer and systemd-owned gateway supervision.

**Authority:** The bounded execution prompt authorises this phase only.

### R1.1 Baseline and emergency halt

1. Create `/opt/crypto-tuber-ranked/.tmp/system-recovery/<run-id>/` with mode `0700`.
2. Persist secret-safe baseline JSON and command logs with mode `0600`.
3. Record `df -B1`, `df -i`, `stat` for DB/WAL/SHM, `PRAGMA page_size/page_count/freelist_count`, FTS schema shape, session counts by source, Docker worker status, and exact active timers.
4. Halt immediately if root free space falls below 3 GiB, root usage reaches 97%, a worker regresses, a protected path is unreadable, Git changes unexpectedly, or any secret value appears.

### R1.2 Validate the existing rollback candidate

1. Read no secret-bearing file contents.
2. Record names, modes, owners, sizes and hashes only.
3. Run SQLite `PRAGMA quick_check` against the snapshot DB in read-only mode with a bounded timeout.
4. Verify its schema and recoverability without opening it as the live Hermes home.
5. If it fails, stop before state mutation; do not invent backup success.

### R1.3 Quiesce scheduled writers

1. Record active/enabled state for:
   - user `hermes-callscore-gateway.service`;
   - system `agent-snapshot.timer` and `.service`;
   - system `callscore-daily-pipeline.timer` and `.service`.
2. Stop the two system timers for the maintenance window; do not disable unrelated timers.
3. Stop the manual CallScore gateway through the Hermes CLI and verify its PID exited.
4. Confirm no CallScore cron run is active and no pipeline/channel task is running.
5. Do not stop Docker workers unless a later probe proves they hold the Hermes state DB.

### R1.4 Convert the legacy FTS layout

1. Reconfirm at least 30% of current DB size is available on the filesystem.
2. Run the supported migration:

```bash
hermes --profile callscore sessions optimize-storage --no-vacuum --yes
```

3. Require compact external-content FTS definitions and no legacy `messages_fts_content` or `messages_fts_trigram_content` ownership tables.
4. Run `PRAGMA quick_check`; stop on anything except `ok`.

### R1.5 Prune only authorised ended background sessions

1. Regenerate dry-run manifests immediately before deletion.
2. Allowed filters are exactly:

```bash
hermes --profile callscore sessions prune --source cron --older-than 1d --dry-run
hermes --profile callscore sessions prune --source subagent --older-than 1d --dry-run
```

3. Verify every candidate is ended, inactive beyond the bound, not pinned, not archived, and in the named source.
4. Persist candidate IDs and manifest hash without message bodies.
5. Execute the same two filters with `--yes`.
6. Do not prune `cli`, messaging, `tool`, `callscore-child-agent`, active, pinned or archived sessions.

### R1.6 Reclaim physical bytes

1. Compute compact used bytes as `(page_count - freelist_count) * page_size`.
2. Require filesystem free bytes to exceed compact used bytes plus 2 GiB before VACUUM.
3. Run:

```bash
hermes --profile callscore sessions optimize
```

4. Verify `PRAGMA quick_check=ok`, WAL checkpoint success, fresh `hermes sessions stats`, and root free space at least 20 GiB. Target at least 30 GiB; if below target, produce an exact non-protected candidate manifest rather than deleting more.

### R1.7 Replace the failing snapshot path using TDD

Canonical source must live in `/srv/agents/repos/callscore-workplane`; `/usr/local/bin/agent-snapshot` is an installed artifact, not the only source.

Required behavior, implemented RED -> GREEN:

1. SQLite online backup API produces a consistent state copy; raw tar of a live DB/WAL/SHM is forbidden.
2. Snapshot is assembled in a private staging directory, checked, hashed, and atomically renamed.
3. Snapshot includes the state DB, non-secret profile configuration and a manifest. Secret values are not copied into new snapshots; credentials remain in their canonical control plane/live sink.
4. Local repository recovery metadata includes HEAD/tree/status and bundles for unpushed refs where needed, without copying build caches.
5. Exactly one verified canonical local rollback snapshot is retained.
6. Old snapshot deletion occurs only after the new snapshot passes quick-check, manifest hash, permissions and restore-readback in an isolated temporary Hermes home.
7. Deletion uses one reviewed absolute path with `--one-file-system`; no broad glob.
8. Snapshot timer failure leaves the prior verified snapshot untouched.

Minimum tests:

- RED: raw changing DB input is rejected.
- RED: failed quick-check prevents promotion and retention deletion.
- RED: secret-bearing files are excluded from the new manifest.
- RED: failed atomic promotion preserves the old snapshot.
- RED: retention never deletes more than the one superseded exact path.
- GREEN: temporary SQLite fixture is backed up, verified, promoted, restored and read back.

### R1.8 Establish canonical gateway ownership

1. Preserve `/home/omar/.config/systemd/user/hermes-callscore-gateway.service` unless a verified defect requires a minimum diff.
2. Run `systemctl --user daemon-reload` and `systemctl --user reset-failed hermes-callscore-gateway.service`.
3. Start the canonical user service once.
4. Prove:
   - service is active;
   - `MainPID` is nonzero;
   - the gateway status PID matches `MainPID`;
   - no second gateway process exists;
   - legacy `hermes-gateway.service` remains masked/disabled;
   - cron ticker advances;
   - a safe local heartbeat cron run persists a new session and receipt.

### R1.9 Re-arm safe timers and verify

1. Install the tested snapshot artifact and unit only after source tests pass.
2. Start one snapshot canary and require exit 0 plus restore-readback.
3. Re-enable/restart `agent-snapshot.timer` only after the canary passes.
4. Start one graph-owned daily-pipeline canary only after root free space and Workplane checks pass.
5. Restore its timer only after the canary passes.
6. Keep provider-capable CMO/publication and YouTube-consumer lanes paused until Phase R5 activation passes. Read-only monitoring and cooldown accounting may remain enabled if their receipts prove they cannot mutate providers.
7. Rerun Workplane, canonical audit, Sentinel, Langfuse and public freshness.

**R1 acceptance:**

- Root free space >= 20 GiB and usage below 90%; target >= 30 GiB.
- State DB quick-check returns `ok`.
- Compact external-content FTS is active.
- Authorised background-session prune has an exact manifest and count receipt.
- Exactly one verified canonical local rollback snapshot exists.
- Snapshot service and timer pass.
- Canonical gateway user unit is active and owns the only gateway PID.
- A fresh Hermes session write succeeds.
- Daily pipeline canary no longer fails on storage.
- Mandatory workers, Workplane, Langfuse and public website remain healthy.
- No provider, public, credential, deployment, image, scale or production-DB mutation occurred.

Rollback: stop the canonical gateway, preserve the failed live DB as evidence, restore only from the verified snapshot through the tested restore path, then revalidate before reopening writers.

---

## 6. Phase R2 — Build the exact credential authority matrix

**Objective:** Make every affected credential either safely automatable or explicitly operator-only.

1. Start from the checksum-backed operator handoff; use names/classifications only.
2. For each of 41 affected credentials, bind:
   - provider and authoritative account;
   - exact create/replacement tool;
   - exact canonical payload hash;
   - graph-owned secret sink destination;
   - affected runtimes;
   - fingerprint-only readback method;
   - revocation-only tool;
   - rollback window.
3. Create no replacement and revoke nothing in this phase.
4. Require exact, durable, unexpired `SECRET_GATE` approval per provider payload.
5. Any missing adapter, sink, readback or revocation-only capability remains blocked.

**Acceptance:** 41/41 classified; no secret values persisted; no generic rotate tool accepted; safely automatable count is evidence-based.

---

## 7. Phase R3 — Create replacements, adopt them, and read them back

**Objective:** Install replacements without losing rollback capability.

For each approved provider batch:

1. Invoke `credential_rotation_node` in replacement-creation mode through the operating graph.
2. Provider-generated material goes directly to the graph-owned secret sink, never ordinary graph state, logs, diagnostics, chat or receipts.
3. Update only dependent runtimes.
4. Recreate only affected runtimes; no image rebuild or scale change unless separately approved.
5. Verify each runtime uses the replacement through a fingerprint-only or provider-authenticated readback.
6. Persist durable provider-execution and replacement-readback evidence.
7. Keep old credentials valid until the entire batch passes.

**Acceptance:** Every changed credential has creation, sink, adoption and readback receipts; no old credential is revoked yet.

---

## 8. Phase R4 — Revoke old credentials

**Objective:** Close the rollback window only after replacements are proven.

1. Invoke `credential_rotation_node` with `credential_rotation_phase="revoke_old"`.
2. Require a revocation-only provider tool; reject any tool that can create or rotate replacements.
3. Bind the call to prior creation, sink, adoption and readback receipts.
4. Verify old credentials fail and replacements still pass without exposing values.
5. Stop at the first failed provider batch.

**Acceptance:** 41/41 either rotated and old credential proven invalid, or explicitly blocked with no false success.

---

## 9. Phase R5 — Restart canonical activation from Phase 0

**Objective:** Produce a new authoritative activation receipt without rewriting history.

1. Use only `/srv/agents/hermes/profiles/callscore/skills/orchestration/callscore-system-activation/` as the activation entry point.
2. Preserve the failed `20260729T110151Z` receipt unchanged.
3. Start a new run at Phase 0 and execute sequentially.
4. Stop at the first mandatory failure.
5. Require repository, Codebase Memory, 51-agent audit, topology/workers, Workplane, LangGraph goals, canonical package gates, observability and provider-path checks.
6. Do not enable autopilot unless the final activation receipt semantically validates as `pass`.

**Acceptance:** New activation receipt is `pass`, checksum-verified and parent-verified; autopilot enablement has its own receipt.

---

## 10. Phase R6 — Restore data, content and video cadence

**Objective:** Resume safe production work without loosening gates.

1. Data lane:
   - rerun daily pipeline through `operating:goal`;
   - clear scoring staleness;
   - process fresh-call candidates through canonical admission policy;
   - reduce transcript backlog in bounded graph-owned batches;
   - require fresh-call and leaderboard Sentinel green.
2. CMO lane:
   - keep public mutation disabled until canonical activation pass;
   - create a fresh final draft and all required editorial/platform/visual/originality/design/media receipts;
   - permit public provider handoff only when the complete canonical operational package passes and cooldown allows it;
   - require provider readback, rollback and publication receipt.
3. YouTube lane:
   - resume the consumer only after script, packaging, thumbnail, publish-package and analytics receipts pass;
   - use the canonical design bundle, lockup and Omar Voice only;
   - never publish call 24458; it remains old test/style material.

**Acceptance:** Fresh successful pipeline/scoring receipts, fresh accepted channel package or explicit cooldown/block receipt, and a YouTube production package or explicit evidence-backed blocker.

---

## 11. Phase R7 — Close the outcome loop

**Objective:** Replace infrastructure activity with measurable user-visible outcomes.

1. Persist `learning_event.v1`, `agent_performance_ledger.v1`, `learning_delta.v1` and `experiment_result.v1` for every production experiment.
2. Read back 24h, 72h and 7d platform performance where APIs permit.
3. Record subscribers, retention, conversions and revenue only from authoritative provider or DB evidence.
4. No filename or local `published_graph_owned` artifact alone proves external publication or impact.
5. Feed accepted deltas back into content and channel policy without self-training on unverified model output.

**Acceptance:** At least one current experiment has complete measurements, or a receipt-backed provider/data blocker names the exact missing authority.

---

## 12. Verification matrix

Every execution run must end with:

```bash
/usr/bin/python3 /srv/agents/hermes/scripts/callscore-canonical-agent-audit.py
npm run workplane:status
npm run sentinel:fresh-calls
npm run sentinel:leaderboard:v2
npm run hygiene:secrets
npx tsc --noEmit
git diff --check
/srv/agents/hermes/scripts/callscore-live-website-freshness-proof.sh
```

Also require phase-specific tests, Docker worker probes, systemd status, SQLite quick-check, gateway PID reconciliation, Langfuse HTTP/read trace evidence, queue aggregates and semantic receipt validation.

## 13. Reporting contract

Return exactly one JSON object containing:

- `status`;
- `phase`;
- `actions_performed`;
- `mutations_performed` by risk class;
- `evidence` with absolute paths and hashes;
- `verification` including `langfuse_checked`;
- `blockers`;
- `rollback_status`;
- top-level `next_action`.

Do not describe the whole system as failed when healthy layers remain live. Do not call the system autonomous until Phase R5 passes and the relevant production lane has current external readback.
