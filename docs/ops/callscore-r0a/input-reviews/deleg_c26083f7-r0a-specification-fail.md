# FAIL — feasible, but not implementation-ready

1. **Application-repository work violates the isolated-worktree boundary.**
   The plan authorizes R0A because source changes occur “in isolated worktrees only” (plan line 84), but the prompt permits committing the final R1 prompt/manifest directly in `/opt/crypto-tuber-ranked` (prompt lines 87, 392–393). Their exact output paths are also unspecified.
   - **Exact fix:** Require a second isolated application worktree based on pinned commit `31b1fed57e1fe9aa0c417ebf9136787cb78ba1d1`; name its branch and worktree path; specify exact final-R1-prompt and manifest paths; commit only there; add application base commit/tree to the result contract. Do not modify or commit from the primary checkout.

2. **Canonical inputs are neither complete nor immutable.**
   Prompt line 38 requires “three FAIL review summaries” for `deleg_1fb6fe24`, but that delegation produced two FAIL summaries and one timeout with no summary. No durable paths or hashes are supplied. The Hermes source and live unit/script inputs are likewise read as mutable current files without frozen identities.
   - **Exact fix:** Commit the two summaries plus the timeout evidence—or a separately reviewed third summary—to exact durable paths and bind their hashes. Add a pre-edit input manifest binding the Hermes commit/tree and hashes of `hermes_state.py`, `session_search_tool.py`, `gateway/status.py`, the snapshot units/script, and gateway unit. Abort before creating worktrees on any mismatch, and carry these identities into the R0A review manifest.

3. **The mandatory kernel-fence GREEN proof cannot run under R0A authority, and the namespace handoff is undefined.**
   R0A requires disposable mount-namespace and hostile-writer tests without `sudo` (prompt lines 120–137, 354–361). On the target host, both user+mount and mount-only `unshare` fail with `Operation not permitted`. Additionally, the prompt does not define how the separately launched systemd maintenance unit joins or receives the broker’s private RW mount namespace; a private bind is not automatically visible to that unit.
   - **Exact fix:** Specify one literal namespace topology and launch contract—host-visible canonical RO bind, root-only original-state anchor, maintenance-unit `BindPaths`/namespace joining, teardown, and failure behavior. Move privileged disposable-mount integration to the separately authorized R0C gate, with exact commands and expected assertions; make R0A require hermetic nonprivileged contract tests plus a generated privileged test artifact, rather than claiming the unavailable kernel test passed.

4. **Manifest production is sequenced before the final artifact it must bind, and the manifest has no schema/path.**
   The review manifest is generated at step 10, while the final R1 prompt is generated at step 11 (prompt lines 386–393). Therefore the manifest cannot bind that prompt’s actual bytes. No exact manifest path or JSON Schema is included in the required file list.
   - **Exact fix:** Add exact paths and `callscore-r0a-review-manifest-v1.schema.json`. Generate and validate the final R1 prompt first; hash it; generate the manifest last, binding both repository base/head/tree tuples, every changed artifact, the final R1 prompt hash, input-dependency hashes, and test-result hashes; validate both candidates; then commit the two application artifacts together.

5. **The final receipt cannot report failure truthfully and permits contradictory transitions.**
   `blocked_preparation_gap` (prompt line 31) conflicts with the final `status` vocabulary. The template hardcodes `live_mutation_performed`, `sudo_used`, and every mutation field to `false`, even on failed execution, while earlier semantics require `production_database=false|true|unknown`. It also always directs the operator to R0B reviews, including when status is blocked or failed (lines 410–457).
   - **Exact fix:** Define one status enum: `pass|blocked|failed`; represent `blocked_preparation_gap` as a blocker code. Make mutation observations `false|true|unknown` with evidence references. Add `r0b_allowed`; require `pass` to imply `r0b_allowed=true`, validated manifest, all tests green, and every forbidden mutation independently proven false. Require `blocked|failed` to imply `r0b_allowed=false` and a current-phase remediation-only `next_action`.

6. **The verification gate has no executable command contract.**
   “Full applicable Workplane tests, Python/static checks and secret hygiene” (prompt lines 382–383) is undefined; the Workplane root has no single test/static configuration and contains multiple vendored projects. Different executors can run materially different gates and still claim completion.
   - **Exact fix:** Specify literal commands, working directories, dependency/bootstrap method, expected exit codes, and exact included/excluded test scope for RED capture, focused GREEN tests, schema/JCS negatives, Python compile/lint, secret scanning, and `git diff --check`. Require stdout/stderr artifact hashes and exact command argv in the review manifest.

Reviewed tuple and hashes matched the request at final recheck. No files were created or modified.
