# FAIL — feasible, but not implementation-ready

Reviewed immutable tuple:

- Commit: `524a0451cbe19381a151e7e20ee7dd9ee9971dc1`
- Tree: `1a8b4b3546cc757d2b5f077b3571ee39c471a882`
- Plan SHA-256: `1a2e5eca49bb363fb4d085163f0a69f714e50e6e8a6a75043c229bc93ecf77b3`
- Prompt SHA-256: `1a82d3245439f3ca40d56cba14e5dee81c793187e1dba0b1d2159eab0bef7a22`

## Execution-blocking defects

1. **Authorisation/bootstrap cycle is impossible.**
   The root-owned record must pre-exist and bind the new source/install hashes (plan 73–95; prompt 96–117), while the tools producing those hashes are built and committed only after that record passes (prompt 267–270). Without the record, the prompt permits read-only preflight only (prompt 9–14).
   - **Remediation:** Add an explicit R0A build-only phase—or a separate build authorisation—that permits isolated-worktree TDD and commit without live installation or state mutation. After independent review of that exact Workplane commit/tree, create the immutable R1 record binding every committed source/unit hash and literal installation command. R1 then begins; the record must never predict future hashes.

2. **The required writer guard has no enforceable implementation boundary.**
   The plan requires blocking new target-profile writers and proving an attempted unapproved write is rejected (plan 116–124, 249–257; prompt 318–334). The allowed files add only external helpers; the current Hermes `SessionDB` does not consume such a maintenance guard. An advisory helper lock cannot stop another same-UID `hermes --profile callscore` process, while an exclusive SQLite lock would also block the required maintenance CLI.
   - **Remediation:** Define and own an enforceable fence before R1: either add a pinned Hermes `SessionDB` writer-fence implementation consumed by gateway, cron and CLI writers, with an unforgeable maintenance-owner handoff and installed hash; or specify a kernel-enforced separate-maintenance-UID/ownership namespace that denies Omar’s ordinary writers while allowing only the maintenance process. Extend the source paths, authorisation bindings and TDD matrix accordingly. Process inventory alone is not a guard.

3. **Pre-backup blocker handling contradicts the mandatory finaliser.**
   Capacity failure must halt without gateway transfer (prompt 302–305), but the mandatory finaliser must restore canonical gateway supervision whenever DB integrity permits (prompt 128–137; plan 292–295), which would transfer the currently manual gateway even though the required current restore point does not exist.
   - **Remediation:** Make finalisation state-dependent. If `current_restore_point_verified=false` and gateway shutdown never began, preserve and verify the original manual gateway state and report the blocker. Canonical supervision restoration may run only after the current anchor passed and `gateway_stop_started=true`. Encode and test both branches in the finaliser receipt.

4. **The re-enabled snapshot timer has no valid post-R1 authority.**
   `agent-snapshot service-run` requires a nonce-specific authorisation path (prompt 201–209), that record must expire (prompt 104), yet the static service/timer is re-enabled for future runs (prompt 419–429). Future timer runs must therefore reuse expired R1 authority, fail, or obtain an unspecified dynamic record.
   - **Remediation:** Separate the one-time R1 canary from steady-state scheduling. Use a nonce-bound transient/templated unit for R1, then either leave the timer disabled until canonical activation supplies a separate durable snapshot-policy receipt, or install a steady-state unit bound to an exact root-owned recurring policy defining creation, promotion, retention and deletion authority. Test expiry and future timer execution.

5. **Authority-bearing and phase-transition receipt schemas are not executable.**
   `callscore.r1_maintenance_authorization.v1` is named, but no exact schema artifact is included in the source paths. The listed gate receipts likewise lack exact schemas and cross-field invariants, despite `phase_r2_allowed` depending on them.
   - **Remediation:** Add exact committed JSON Schemas for the R1 authorisation, each gate-bearing receipt, finaliser, and `phase-r1-final`; define canonical hashing, required evidence identities and mutation-effect semantics. Schemas must reject missing/stale bindings, malformed review tuples, `blocked|failed` with `phase_r2_allowed=true`, and unverified finaliser state. Bind schema hashes in the root authorisation and test the negative matrix.

## Review status

- No files created or modified.
- The application repository remained clean and the immutable tuple was unchanged at final recheck.
- The Workplane primary checkout had pre-existing unrelated dirty/untracked files; the review did not touch them.
- Lack of authorised external backup capacity was **not** counted as a plan defect; the prompt correctly treats it as an expected pre-mutation blocker.
