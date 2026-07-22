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
- Successful rows become `available`; truthful terminal rows become `failed_terminal`. Neither is selected on replay, so a new job cannot repeat the completed cohort mutation.
- The existing write condition also refuses to overwrite a non-empty transcript.
- Production call/ranking writes remain disabled.

### HH yt-dlp trust boundary

Resolved for targeted recovery:

- `--cookies-from-browser` is rejected; browser profiles remain laptop-local.
- The ambiguous `YTDLP_COOKIES` hook is rejected; only a secret-file path under `/run/secrets/` is accepted.
- PO-token HTTP endpoints must use unauthenticated loopback HTTP.
- WPC must use `/usr/bin/chromium`.
- PO-provider names and extractor arguments are allowlisted.
- Cookie files continue to be copied to private writable temporary state and removed after use.
- yt-dlp diagnostics are redacted before audit receipt persistence.

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
