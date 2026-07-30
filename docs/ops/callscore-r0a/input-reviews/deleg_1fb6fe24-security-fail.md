# FAIL

Reviewed immutable tuple: commit `524a0451cbe19381a151e7e20ee7dd9ee9971dc1`, tree `1a8b4b3546cc757d2b5f077b3571ee39c471a882`, plan SHA-256 `1a2e5eca49bb363fb4d085163f0a69f714e50e6e8a6a75043c229bc93ecf77b3`, prompt SHA-256 `1a82d3245439f3ca40d56cba14e5dee81c793187e1dba0b1d2159eab0bef7a22`.

## Blocking findings and exact remediation

1. **Approval remains self-authorable.**
   The plan tells the parent to produce the root-owned authorization, while the required executor is UID `omar`; live `sudo -l` grants `omar` unrestricted passwordless root. Root ownership and mode therefore do not prove independent operator approval.
   - **Remediation:** Remove parent/runner authorization creation. Have a preinstalled root broker create the record only from a separate operator ingress. Start the R1 runner as `User=omar` with `NoNewPrivileges=yes` and no usable sudo path. Bind the authorization to operator principal, initiating-request digest, nonce, issued/expiry timestamps, maximum run duration, immutable reviewed tuple, exact actions/argv, and broker/verifier hash. Validate expiry before every destructive transition.

2. **Authorization has an implementation-hash bootstrap cycle.**
   Authorization must bind source/install hashes before R1, but R1 subsequently creates and commits those currently nonexistent Workplane files. Thus the record cannot truthfully bind the final implementation, and the three reviews cover only the plan/prompt—not the root-installed code.
   - **Remediation:** Split preparation from execution. First build and test the tools/unit in a non-destructive preparation phase; freeze their Workplane commit/tree and artifact hashes; obtain three fresh reviews covering source, tests, unit, install commands, and plan/prompt; only then create authorization binding the complete tuple. R1 execution must prohibit further source edits or commits.

3. **Writer exclusion is still advisory and TOCTOU-prone.**
   The undefined “maintenance guard” is activated only after writers drain; `/proc/*/fd`, `data_version`, and WAL observations cannot prevent a new same-UID writer opening the DB after inspection. No existing Hermes maintenance guard was found, and the listed implementation scope contains no Hermes writer-entrypoint changes.
   - **Remediation:** Implement and review a fail-closed target-profile write gate before R1 authorization. Activate it **before** draining writers and require every canonical `SessionDB`, gateway, CLI, cron, and worker RW-open path to reject the root-owned guard unless invoked through the authorization-bound maintenance channel. Hold the guard and maintenance lock continuously through FTS/VACUUM. Add a separate-process test proving same-UID target-profile writes remain rejected during every inter-chunk interval; abort if any unguarded direct SQLite writer exists.

4. **The rollback anchor has no executable database-restore procedure.**
   The finalizer restores supervision and checks integrity but does not define how to restore `state.db` after partial FTS migration, VACUUM, count drift, search-parity failure, or checkpoint failure. VACUUM and the staged FTS rewrite are not transactionally reversible.
   - **Remediation:** Add an explicit failure-stage rollback matrix and one exact restore command. After the first DB mutation and before DB commit, any DB/FTS/count/search/checkpoint failure must keep writers stopped, verify the pre-R1 anchor hash, restore it to a sibling staged file, verify quick-check plus external-content FTS integrity and canonical counts, fsync file and parent directory, atomically replace `state.db`, safely disposition stale WAL/SHM, preserve the failed DB for forensics, and reverify before restarting. If restore fails, retain the guard and leave the gateway stopped.

5. **Snapshot retention authorization binds paths, not filesystem objects.**
   A same-UID process can replace an authorized snapshot directory between validation and chmod/hash/deletion. Path equality and prior symlink rejection do not prevent directory substitution or mount crossing.
   - **Remediation:** Bind each deletable snapshot to canonical parent, device, inode, owner, run ID, complete member allowlist, and manifest SHA-256. Open the root and snapshot directories with `openat2(RESOLVE_BENEATH|RESOLVE_NO_SYMLINKS|RESOLVE_NO_XDEV)` or equivalent `O_NOFOLLOW` fd traversal; re-`fstat` immediately before each operation; delete only allowlisted members with fd-relative `unlinkat`; remove the directory only when empty. Any identity or membership drift must yield zero deletion.

6. **The replacement snapshot service can retain root authority over an opaque secret-bearing DB.**
   The plan names the unit path but does not mandate `User=omar` or sandboxing. The live `agent-snapshot.service` currently has no `User=`, so it runs as root.
   - **Remediation:** Require and review exact unit fields: `User=omar`, `Group=omar`, `UMask=0077`, fixed absolute `ExecStart` with authorization-bound arguments, `NoNewPrivileges=yes`, empty capability bounding set, `ProtectSystem=strict`, read-only source-profile access, `ReadWritePaths` limited to the approved snapshot/control roots, `PrivateTmp=yes`, and network denial. Add a test and final `systemctl show` assertion for effective UID, argv, sandbox properties, and writable paths.

7. **FTS proof can still false-green.**
   “FTS integrity,” “both canonical search paths,” and the canary token are not defined precisely; the prompt weakens this to singular “canonical search.” A normal FTS5 integrity command does not necessarily verify external-content parity, and one Latin nonce does not exercise alternate routing.
   - **Remediation:** Enumerate the exact expected FTS tables and search entrypoints. For every external-content index, require `INSERT INTO <table>(<table>, rank) VALUES('integrity-check', 1)` and exact v23 schema/trigger validation. Use deterministic canaries that force each supported routing path and assert exact session/message IDs through both `SessionDB.search_messages` and the production `session_search` path before deletion and absence afterward. Require `PRAGMA wal_checkpoint(TRUNCATE)` readback with the busy field exactly `0`.

**Files modified:** none.
