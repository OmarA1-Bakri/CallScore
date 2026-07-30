# FAIL

| R0A area | Verdict |
|---|---|
| Signed broker | **PASS** |
| Kernel writer fence | **FAIL** |
| Online snapshot and safe deletion | **PASS** |
| Staged restore/forensic preservation | **PASS** |
| FTS verification and search-route tests | **PASS** |
| systemd templates | **FAIL** — maintenance unit only; snapshot unit is feasible |

## R0A-blocking defects

1. **Mandatory kernel-fence tests cannot run in the authorized R0A environment.**
   - Both `unshare --mount` and `unshare --user --map-root-user --mount` fail with `Operation not permitted`; R0A forbids `sudo`.
   - Therefore R0A cannot produce the required real RED/GREEN proof that same-UID and inter-chunk SQLite writes are kernel-denied.
   - **Exact fix:** Either:
     - provide a disposable, non-live test runner where R0A has mount-namespace capability and run the required hostile-writer suite there; or
     - amend the gate so R0A performs source/static/fixture tests and returns `blocked_preparation_gap`, with the real namespace tests made a mandatory R0C root integration gate. Do not permit R0A `pass` from mocked mount calls.

2. **The dedicated maintenance UID cannot access the proposed private RW bind.**
   - The target profile is mode `0700`, UID `1000`; `state.db` is mode `0644`, UID `1000`.
   - `ReadWritePaths=` and bind mounts change mount writability but do not bypass Unix DAC. A `User=callscore-maint` process therefore cannot traverse the profile or write the DB/WAL/SHM.
   - A separately started systemd service also does not automatically inherit an arbitrary broker-created private mount namespace.
   - **Exact fix:** Amend the architecture and tests to define one concrete handoff:
     1. R0C provisions `callscore-maint` plus an explicit state-maintenance group/ACL, including setgid/default access for DB/WAL/SHM creation.
     2. The nonce unit establishes and signals readiness of its private mount namespace and private RW bind before the broker applies the host-visible RO bind.
     3. The broker remounts the canonical host path RO, revalidates holders and DB identity, then releases the waiting runner.
     4. Finalization removes temporary access and verifies restored owner/group/mode.
     5. Tests assert namespace identity, DAC access for `callscore-maint`, denial for UID `omar`, WAL/SHM creation, and cleanup after every finalizer branch.

Until both corrections land, the maintenance systemd template cannot truthfully satisfy the kernel-fence contract.

- Immutable application tuple and supplied hashes verified.
- **Files created or modified:** none.
