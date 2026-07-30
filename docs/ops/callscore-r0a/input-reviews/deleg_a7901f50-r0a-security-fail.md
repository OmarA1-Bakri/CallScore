# FAIL

1. **R0A is not source-only under the current Git/MCP path.**
   `/opt/crypto-tuber-ranked/.git/hooks/post-commit` invokes `scripts/index-codebase.py`, which calls Codebase Memory `index_repository` and mutates external index state. The prompt also requires Codebase Memory use against the dirty Workplane checkout, risking ingestion of unrelated untracked artifacts while the result must claim `live_mutation_performed: false`.
   - **Exact fix:** Require read-only Codebase Memory queries against an existing index only; forbid `index_repository` during R0A. Run every worktree/commit command with an owner-only empty hooks directory via `git -c core.hooksPath=<empty-dir> ...`, and bind that no-hook procedure in the review manifest.

2. **The frozen artifact tuple omits the Hermes source on which R0A depends.**
   R0A must inspect and build against `hermes_state.py`, `tools/session_search_tool.py`, and `gateway/status.py`, but the required manifest and R0B review bind only Workplane and the application repository. Hermes can drift after tests while the two-repository tuple still appears valid.
   - **Exact fix:** Add the Hermes repository commit/tree and hashes of every consumed Hermes source file to the R0A manifest, final R1 prompt, authorization schema, and review tuple. Require exact readback before installation and R1; any mismatch must block and invalidate reviews.

3. **The authority-bearing R0A outputs are underspecified.**
   The prompt requires a review manifest and final R1 prompt but assigns neither exact application-repository paths nor an exact review-manifest schema. It also requires test-result hashes without defining canonical evidence bytes or exact hermetic commands. Execution therefore requires inventing security-bearing artifact structure.
   - **Exact fix:** Amend the allowed file list with exact paths for the review manifest, its JSON Schema, canonical RED/GREEN evidence, and the final R1 prompt. Define a self-reference-free JCS/SHA-256 binding graph, exact fixture-only test commands, normalized result-byte format, and schema validation before the focused application commit.

**Files modified:** none.
