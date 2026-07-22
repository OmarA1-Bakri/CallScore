# CallScore Runtime Drift Remediation — Review Addendum

Date: 2026-07-22
Status: review remediation implemented; fresh independent review required

## Immutable inputs

- Frozen plan: `docs/plans/2026-07-22-callscore-runtime-drift-ingestion-cmo-recovery.md`
- Frozen plan commit: `22252743508a0eccfad2444cc0f8e39af5ba1b82`
- Frozen plan SHA-256: `e34da93c3eeff85d137389f546a428e65155ea8e18a86c27f5114e9d2c728d23`
- Initial implementation commit: `692546b00f743f6938870dd5bdcf035d9a79633d`
- This addendum does not rewrite the frozen plan. It records execution evidence and review-driven hardening.

## Pre-execution task chain

The Hermes Kanban chain was created by `callscore-orchestrator` at 2026-07-22T02:29:43Z, before source remediation began:

| Step | Task ID | Contract |
|---|---|---|
| P0 | `t_f642b0a8` | Immutable plan three-review gate |
| P1 | `t_d52965c9` | Preserve and quarantine mixed dirty tree |
| P2 | `t_89d11476` | TDD Qwen3 Workplane contract |
| P3 | `t_612571a8` | Recover exactly nine transcript failures |
| P4 | `t_69c4b8ce` | Verify CMO canonical gate decisions |
| P5 | `t_19c144b2` | Three-agent and parent integration validation |
| P6 | `t_5b40ca51` | Focused commit and final receipts |

The task bodies point to the frozen plan and carry the required task-specific skills. The stale board statuses are an observability defect; they must be updated only after fresh review and final parent verification.

## Review finding dispositions

### Canonical local-model dispatch

Resolved in source, not just status serialization:

- Canonical active job types are `local_model_shadow_extract` and `artofwar_campaign_local_model_eval`.
- Both are accepted by the operating-graph dispatch schema.
- Autonomous next-action and readiness surfaces select canonical job types.
- `gemma_shadow_extract` and `artofwar_campaign_gemma_eval` remain worker-dispatchable compatibility aliases so historical queued jobs are not stranded.
- Both aliases execute the exact canonical model `qwen3:4b-instruct-2507-q4_K_M`; status marks them as legacy identifiers.

### Exact transcript-recovery ownership and replay safety

Resolved:

- `transcript_recover_hh` is accepted by both the Workplane registry and operating-graph dispatch schema.
- Its maximum batch is exactly nine.
- Forced targeted production writes reject direct CLI ownership; the Workplane wrapper is the only supported invocation seam.
- The generic parser retains a 25-ID hard ceiling for non-writing diagnostics, but graph-owned forced writes are capped at nine.
- Forced selection requires exact IDs and the two historical failure classes: `bot_verification_required` or `js_challenge_runtime_missing`.
- Successful rows become `available`; truthful terminal rows remain `failed` with the explicit error classification `failed_terminal`. Neither is selected on replay, so a new job cannot repeat the completed cohort mutation.
- The existing write condition also refuses to overwrite a non-empty transcript.
- Production call/ranking writes remain disabled.

### HH yt-dlp trust boundary

Resolved for targeted recovery:

- `--cookies-from-browser` is rejected; browser profiles remain laptop-local.
- The ambiguous `YTDLP_COOKIES` hook is rejected; only a canonical root-owned, root-only regular secret file under `/run/secrets/` is accepted.
- PO-token HTTP endpoints must use unauthenticated loopback HTTP.
- The versioned yt-dlp wrapper, local `yt-dlp-ejs` package sentinel, `/usr/local/bin/node` runtime and `/usr/bin/chromium` WPC browser must resolve to exact root-owned regular files with safe modes; missing or replaced files block execution.
- Remote yt-dlp components are disabled; targeted recovery uses the installed local `yt-dlp-ejs` package.
- PO-provider names and extractor arguments are allowlisted.
- Cookie files continue to be copied to private writable temporary state and removed after use.
- yt-dlp diagnostics redact cookie paths, token data and generic `Cookie:`/`Authorization:` headers before audit persistence.

### Dirty-tree quarantine

Resolved with `/srv/agents/hermes/profiles/callscore/artifacts/dirty-tree-quarantine/20260722T024003Z-v2/receipt.json`:

- directory mode `0700`; artifact mode `0600`; owner `omar:omar`;
- immutable stash OID and all three parent OIDs recorded;
- separate full-index binary patches for index and worktree;
- NUL-safe Git tree enumeration with path, type, mode, size, Git blob OID and SHA-256;
- non-dereferencing Git archive for untracked content;
- names-only secret scan;
- 23 raw scanner findings retained, all unchanged committed test fixtures, with zero new patterns, zero production paths and zero untracked paths;
- disposable-worktree restoration verified all 1,054 files with zero mismatches;
- no `stash pop` or canonical-checkout restore occurred.

### CMO and provider mutation

Already resolved by implementation commit `692546b00f743f6938870dd5bdcf035d9a79633d`:

- public X/LinkedIn paths require the canonical operational package and media-v2 design package;
- exact designated receipt owners, channel, subject, freshness and content hash are validated;
- graph-owned provider idempotency is payload-identity based across workflows;
- no diagnostic evaluator has publication authority;
- current X remains blocked by originality; current LinkedIn remains cooldown/readback evidence only;
- no review or remediation step performs public/provider mutation.

Cryptographic signer/MAC identity is not part of the current canonical receipt schemas or local Workplane trust model. Adding a new signing authority, key distribution and migration policy is a separate architecture/security change and must not be simulated with a parent-owned local key. Existing fail-closed owner/hash/lineage checks remain enforced.

### Execution divergence and rollback

- Relevant compatibility-sensitive source was recovered selectively from the labelled stash; the canonical checkout was never restored wholesale.
- No image rebuild, service restart, deploy, paid action, email/DM, Whop mutation, provider mutation or broad database mutation occurred.
- The bounded database recovery is evidenced by Workplane job `6632`, JSON/JSONL receipts and read-only post-state verification.
- Pre-write MVCC row versions were not captured and cannot be invented retrospectively. Replay safety and non-overwrite conditions now prevent repeat mutation.
- The deployed Hermes worker remains stale relative to repository source. Deployment/restart was not authorised and remains an explicit runtime blocker.

## Verification contract

Fresh reviewers must review the final remediation commit, not the frozen-plan commit alone, and must distinguish:

1. plan-spec defects;
2. execution-time mitigations evidenced by receipts;
3. final source/runtime defects;
4. separately scoped trust-model or deployment proposals.

Acceptance requires:

- focused tests;
- full test suite;
- TypeScript;
- `git diff --check`;
- canonical-agent audit;
- Workplane and freshness evidence;
- zero unresolved secret findings;
- clean repository tree after the review-remediation commit;
- three fresh independent verdicts against the same final commit.

## Second review cycle and superseding remediation

Batch `deleg_3ed92e5b` reviewed `44d1132acf1e5e449814fe88f692e24c3261524a`. Specification and security roles timed out and are not acceptance evidence. The implementation/integration role returned `FAIL` with four valid blockers:

1. shadow execution forwarded caller-controlled model/host/resource payloads;
2. Art-of-War local-model evaluator aliases fell through to report-only output without executing a model;
3. failed transcript attempts could mutate row failure state while the Workplane summary still reported no production DB writes;
4. HH targeted recovery still accepted unreviewed yt-dlp executable/runtime controls.

The superseding remediation in the final review tuple:

- forces exact `qwen3:4b-instruct-2507-q4_K_M`, loopback Ollama, canonical prompt profile, bounded resource controls, a safe run identifier and canonical artifact location for both shadow aliases;
- adds a real loopback Ollama campaign evaluation branch for both Art-of-War evaluator aliases, validates the exact returned model and strict JSON output, persists only bounded campaign fields, and grants no mutation/public authority;
- writes `db_write_performed` on every transcript audit outcome and derives `production_db_writes_performed` plus `db_rows_mutated` from those per-record facts, including failed-row updates;
- pins HH targeted recovery to the isolated yt-dlp binary, canonical local Node and Chromium files, disables remote components, and rejects browser-profile extraction, arbitrary extra args and proxies;
- adds RED→GREEN regressions for every finding and a live loopback Qwen3 evaluator canary.

Post-remediation parent evidence for that tuple: focused tests `80/80`, full suite `1432/1432`, TypeScript and `git diff --check` passed. Those verdicts are superseded by the next remediation tuple.

## Third review cycle and final hardening

Batch `deleg_5d169902` reviewed `d44bd8e336e80541f08a892299821a38300b6e4a` and returned three `FAIL` verdicts. Although parent had already superseded that commit to correct the container Chromium path, the remaining findings also applied to the successor and were remediated:

- EJS/WPC recovery now fails closed when the canonical isolated yt-dlp wrapper is missing; bare PATH fallback is impossible for this method. `Dockerfile.hermes` provisions the exact versioned venv and pinned local-EJS marker for a future authorised rebuild.
- Root ownership, regular-file type, canonical realpath, executable bit and non-writable mode are checked for the pinned yt-dlp wrapper, local `yt-dlp-ejs` package sentinel, Node and Chromium. Cookie files additionally require root-only mode and bounded size.
- Remote EJS component fetches are disabled; local `yt-dlp-ejs 0.8.0` is required.
- Workplane-owned dry runs and forced targeted runs traverse the same runtime preflight.
- Ollama requests reject redirects, and evaluator output requires a non-array JSON object plus native numeric confidence.
- Evaluator success/failure creates separate `<run-id>.artifact.json` `LocalModelEvaluationReceipt` or legacy `GemmaEvaluationReceipt` compatibility artifacts plus `<run-id>.json` workflow receipts. Parser/model failures become bounded blocked receipts rather than uncaught errors.
- `transcript_recover_hh` ignores caller-controlled audit paths, reserves an immutable per-run canonical JSONL file, includes the run ID on every audit row, rejects stale/foreign/duplicate rows, preserves valid rows alongside malformed lines, and counts partial DB mutations before reporting execution failures.
- No evaluator or recovery failure grants public/provider/call/ranking mutation authority.

Parent verification for that superseded tuple: TypeScript passed; focused suite `85/85`; full suite `1437/1437`; Dockerfile build check passed with no warnings; Workplane `OK`; freshness `PASS`; canonical agent audit `51/51`; repository secret hygiene passed. Batch `deleg_2dd37bd8` nevertheless returned three valid `FAIL` verdicts against `e69bfc27ae81842c53d529a57331fd43b0357ba4`, so that tuple is not acceptance evidence.

## Fourth review cycle and transactional evidence hardening

Batch `deleg_2dd37bd8` found five blockers that applied to the exact reviewed tuple:

1. Compose overrode the new pinned runtime with bare `yt-dlp`, bare `node`, and enabled remote components.
2. The exported Workplane recovery writer still allowed up to 25 IDs and did not itself require forced exact-nine selection.
3. Direct CLI dry-runs bearing `hh_ytdlp_ejs_wpc` could bypass strict runtime preflight.
4. Evaluator enum fields were accepted after `String(...)` coercion.
5. A video-row update could commit before JSONL append, allowing a later audit-write failure to under-report mutation truth; duplicate audit rows also over-counted, and duplicate run IDs could overwrite the original workflow receipt.

The superseding remediation:

- aligns every Compose worker service with the exact pinned yt-dlp path, absolute Node path, disabled remote components and canonical Chromium; long-lived workers explicitly blank inherited cookie paths and do not mount the cookie secret by default;
- enforces at the actual exported writer boundary: positive Workplane job ID, forced retry, only `hh_ytdlp_ejs_wpc`, exact limit/ID equality and at most nine IDs;
- applies strict EJS/WPC preflight to every invocation path, including direct CLI dry-runs;
- requires native string enum fields and native finite numeric confidence before allowlist checks;
- atomically couples each Workplane video mutation with a `pipeline_jobs.metrics.transcript_recovery_mutations` journal append in one PostgreSQL CTE statement, then merges DB-journal and JSONL evidence while deduplicating mutation counts by video ID;
- treats only `EEXIST` as a replay collision; other audit-create failures propagate. Replay validates the original receipt’s JSON/run identity, never overwrites it, and recovers current-job mutation truth from the transactional journal into a distinct replay receipt when the original is missing or partial;
- adds regression tests for each defect and validates both journalled SQL statements against the live PostgreSQL schema with `EXPLAIN` only (`executed:false`).

Current parent candidate evidence after this remediation: TypeScript passed; focused suite `89/89`; full suite `1441/1441`; both transactional mutation statements planned successfully against the live PostgreSQL schema with `EXPLAIN` and `executed:false`; effective Compose configuration shows the exact pinned runtime and zero cookie mounts; Dockerfile build check passed without warnings; Workplane `OK`; freshness `PASS`; canonical agent audit `51/51`; secret hygiene passed.

Acceptance for that tuple failed: `deleg_42804eb3` returned implementation `PASS`, specification `FAIL`, and security/governance `FAIL` against `977975655aadbee39c8495f1253c8461be293599`.

## Fifth review cycle and durable lease-bound replay evidence

The valid blockers from `deleg_42804eb3` were:

1. recovered mutation truth existed only in the replay return object, not the persisted replay receipt;
2. mutation SQL checked running job ID/type but not the executing worker identity or a live lease;
3. malformed non-object entries in a mixed DB journal were silently filtered;
4. partial original-receipt validation accepted only matching `run_id` plus any string result rather than the complete receipt shape/result enum.

The superseding remediation:

- extends the workflow receipt schema with bounded optional `evidence` and persists production DB-write truth, distinct mutated-row count and sanitized transactional-journal records in replay, blocked-partial and normal recovery receipts;
- passes the claimed job’s `locked_by` identity into the writer and requires the same worker plus `lease_expires_at > NOW()` in both atomic mutation CTE owner predicates;
- rejects the entire DB mutation journal when any entry is non-object or lacks valid run ID, 11-character video ID, status or `db_write_performed=true`;
- validates complete workflow receipt structure, timestamps, workflow identity, blockers, approval evidence, next action, finite result enum and the current mutation-evidence block before suppressing journal recovery; a legacy receipt without durable mutation evidence is partial under the current contract;
- keeps non-`EEXIST` audit failures and journal-read/schema failures fail-closed, and never overwrites the original receipt.

Current parent evidence: TypeScript passed; focused suite `89/89`; full suite `1441/1441`; both worker/lease-fenced mutation statements planned against the live PostgreSQL schema with `EXPLAIN` and `executed:false`; Workplane `OK`; freshness `PASS`; canonical audit `51/51`; secret hygiene passed.

Acceptance for that tuple failed: `deleg_21b1769e` returned three `FAIL` verdicts against `60ba10b6cc85831c6ec784ac81052f28a6436370`.

## Sixth review cycle and immutable claim-generation fencing

The valid blockers from `deleg_21b1769e` were:

1. mutation evidence was not bound record-by-record to the receipt’s source run, and blank/unknown run/status values were accepted;
2. persisted evidence retained duplicate records and did not enforce string/cardinality bounds;
3. worker/lease fencing did not include the claim generation (`pipeline_jobs.attempts`), allowing a stale execution from the same stable worker identity to match a later reclaimed lease;
4. receipt writes were not exclusive, and a receipt-only collision with no JSONL audit could enter normal execution and overwrite evidence.

The superseding remediation:

- requires bounded safe run IDs, exact statuses (`updated` or `failed`), bounded reasons and no malformed entries anywhere in the journal;
- requires `source_run_id` plus every persisted record’s run ID to equal the expected original run, and rejects duplicate receipt evidence while deduplicating bounded persistence by video ID;
- passes the positive claimed `attempts` generation end-to-end and requires `attempts = $13` in both atomic owner CTEs alongside job ID/type/status, `locked_by` and unexpired lease;
- writes every workflow receipt with exclusive `wx` creation and mode `0600`;
- treats either a pre-existing receipt or JSONL audit as an immutable replay collision before execution, never creates JSONL for a receipt-only collision, and gives every replay receipt a fresh immutable run ID;
- adds regressions for foreign/blank/duplicate/oversized evidence, missing claim generation, SQL attempt fencing, receipt exclusivity, receipt-only replay and repeat-safe public test receipts.

Current parent evidence: TypeScript passed; expanded focused suite `94/94`; full suite `1441/1441`; both worker/lease/attempt-fenced mutation statements planned against the live PostgreSQL schema with `EXPLAIN` and `executed:false`; Workplane `OK`; freshness `PASS`; canonical audit `51/51`; secret hygiene passed.

Acceptance for that tuple failed: `deleg_78b88c11` returned specification `PASS`, security/governance `PASS`, and implementation `FAIL` against `7513f1eecd1fe3ac97ad14002d2b1ff3b6d18c05`.

## Seventh review cycle and unified exact-nine bounds

The remaining implementation blockers were:

1. Workplane accepted run IDs through 128 characters while the journal validator accepted only 96, so a 97-character run could mutate atomically and then fail durable receipt assembly;
2. authoritative mutation evidence validation allowed ten records because it inherited the journal-wide history bound rather than the per-run exact-nine bound.

The superseding narrow remediation:

- unifies the Workplane run-ID allowlist with journal and receipt layers at 1–96 safe characters;
- rejects authoritative receipt evidence above nine records and rejects evidence-builder input above nine distinct requested IDs;
- adds RED→GREEN regressions for a valid 96-character run, rejected 97-character run, and rejected ten-record receipt evidence.

Concurrent untracked `leaderboard-sentinel-v2*` tests appeared during verification and referenced implementation files not present in the frozen tree. They were preserved without modification in dedicated stash `3b0cbdff6e395c579a3fd4c6b413e22ceebf2f04` and excluded from this change.

Current parent evidence: TypeScript passed; focused suite `94/94`; full suite `1441/1441`; Workplane `OK`; freshness `PASS`; canonical audit `51/51`; secret hygiene passed.

Acceptance for that tuple failed: `deleg_53c87a01` returned specification `PASS`, implementation `PASS`, and security/governance `FAIL` against `49f5705aa550e9b530078284c4a7c3d3ff2ee521`.

## Eighth review cycle and exported-writer run-ID authority

The final security blocker was that the outer Workplane dispatcher enforced the 96-character run-ID contract, but the exported `runTargetedTranscriptRecoveryFromWorkplane()` authority boundary did not independently reject an oversized caller-supplied `--run-id`.

The superseding remediation:

- validates the 1–96 safe run-ID contract inside `assertBackfillWriteAuthority()` before runtime preflight, lock acquisition, video selection or mutation;
- changes the parser’s implicit ISO timestamp default (which contained `:`) to a safe unique `transcript-backfill-<epoch>-<pid>` identifier;
- adds RED→GREEN regressions for direct exported-writer rejection of a 97-character run ID and the parser’s safe default.

Current parent evidence: TypeScript passed; focused suite `94/94`; full suite `1441/1441`; Workplane `OK`; freshness `PASS`; canonical audit `51/51`; secret hygiene passed.

Acceptance for that tuple failed: `deleg_7ffa5622` returned specification `PASS`, security/governance `PASS`, and implementation `FAIL` against `951651c511e45c67b8c216c8ebaf0aac1b5f0230`.

## Ninth review cycle and collision-resistant implicit IDs

The final implementation blocker was that the safe implicit `transcript-backfill-<epoch>-<pid>` ID could collide when generated more than once within the same millisecond in one process.

The superseding remediation appends a `randomUUID()` nonce while remaining under the 96-character safe-ID ceiling, and a RED→GREEN regression generates 1,000 IDs in-process and requires all to be safe and unique.

A second, changed snapshot of the unrelated concurrent `leaderboard-sentinel-v2*` tests appeared during verification. It was preserved unchanged in stash `b70db2dc5ed4e9cbd6551f77ef8fbe7f4df53b93`; neither concurrent snapshot is included in this change.

Current parent evidence: TypeScript passed; focused suite `94/94`; full suite `1441/1441`; Workplane `OK`; freshness `PASS`; canonical audit `51/51`; secret hygiene passed.

Acceptance requires a new immutable commit and three fresh exact-tuple verdicts. All earlier verdicts remain superseded.
