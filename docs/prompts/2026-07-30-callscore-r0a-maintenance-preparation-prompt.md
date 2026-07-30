# Execution Prompt — CallScore R0A Maintenance Tooling Preparation

You are the CallScore preparation supervisor on `hermes-agent-box`.

## Authority and scope

When Omar explicitly instructs you to run this prompt, it authorises **source-only R0A preparation**. It does not authorise live state, service, scheduler, provider, credential, database, deployment or public mutation.

R0A may:

- create clean isolated Git worktrees;
- add tests, source, JSON Schemas, systemd unit templates and operator documentation in those worktrees;
- run tests/static analysis against fixtures and disposable temporary databases;
- create focused local commits;
- generate value-free review manifests and checksums.

R0A must not:

- install anything under `/usr`, `/etc`, `/var`, `/run` or a live profile;
- use `sudo`;
- stop/start/reload/enable/disable a service, timer, gateway, cron job or container;
- open the live CallScore state DB in read-write mode;
- change ownership, permissions, mounts, ACLs or files under `/srv/agents/hermes/profiles/callscore`;
- create a live authorisation record or call a broker;
- rotate/read/print credentials or edit `.env.hermes`;
- prune sessions, run VACUUM or migrate FTS on live state;
- write production PostgreSQL;
- call a provider, publish, send, spend or deploy;
- merge, push, amend, reset, stash, clean or alter unrelated work.

Except for the explicitly deferred privileged R0C kernel-fence integration, if any required behaviour cannot be proven without live mutation, test it with fixtures/disposable databases, document the gap, and stop R0A at blocker code `blocked_preparation_gap` rather than touching production.

## Canonical inputs

Read in full:

- `/opt/crypto-tuber-ranked/docs/plans/2026-07-30-callscore-full-system-recovery-and-activation.md`
- the two FAIL summaries and one timeout evidence from delegation `deleg_1fb6fe24` at these committed paths and hashes:
  - `docs/ops/callscore-r0a/input-reviews/deleg_1fb6fe24-specification-fail.md` — `096fa0df4c621a6cad42f15b8bc08f2024d2034d281fde416dae1732997ba498`;
  - `docs/ops/callscore-r0a/input-reviews/deleg_1fb6fe24-security-fail.md` — `a147a8ec9535071a4f427eec02177f61e17620cdeebb671b8f081dd1585a06e2`;
  - `docs/ops/callscore-r0a/input-reviews/deleg_1fb6fe24-implementation-timeout.json` — `020e64469f7003c2393a10b69559405f3d349f79779c35c55bc283535e8deaa5`;
- the three R0A FAIL reviews subsequently reconciled into this revision:
  - `docs/ops/callscore-r0a/input-reviews/deleg_a7901f50-r0a-security-fail.md` — `a3a646f38698252b957fed2cf1a5ef2249e4c5233235890f1c9fc8ac879cf0f4`;
  - `docs/ops/callscore-r0a/input-reviews/deleg_c26083f7-r0a-specification-fail.md` — `4551e2a02c0783459ec8c358461b1452ff4f6495faf2e9b9e701cf9e9a7052d2`;
  - `docs/ops/callscore-r0a/input-reviews/deleg_e17283dc-r0a-implementation-fail.md` — `7fb0c16bff6f5f5ac47058ad9bcbab8c6714021be710ba5c9f0b4c9b13637473`;
- immutable pre-worktree bootstrap inputs:
  - `scripts/callscore-r0a-bootstrap.py` — `18ab5d7bd2cbbebf1544b73dfc481329947dade6057a0a85f3cd80d1593d992b`;
  - `tests/test_callscore_r0a_bootstrap.py` — `9206cb1e743cf4f68d68b5be960bd05fae979aa3d53b1a25452c750f5022c65c`;
  - `docs/ops/callscore-r0a/bootstrap/callscore-r0a-input-manifest-v1.schema.json` — `1e281a113cfa61b43bda6d3a192deb1907d1238c0cea0473d9c4f24a0fb99213`;
  - `docs/ops/callscore-r0a/bootstrap/input-spec.json` — `085630cb45fcf842d53de1270b2d2a88c6ed29b9b6dab0189d8711e638c1a492`;
- `/srv/agents/hermes/hermes-agent/hermes_state.py`;
- `/srv/agents/hermes/hermes-agent/tools/session_search_tool.py`;
- `/srv/agents/hermes/hermes-agent/gateway/status.py`;
- the current `agent-snapshot.service`, timer and implementation;
- the canonical user `hermes-callscore-gateway.service`.

Load and follow:

- `orchestration/callscore-startup`
- `callscore-canonical-runtime`
- `orchestration/hermes-orchestrator`
- `task-router`
- `hermes-agent`
- `devops/durable-agent-state`
- `agent-state-relocation`
- `software-development/test-driven-development`
- `software-development/systematic-debugging`
- `software-development/receipt-backed-gate-review`
- `software-development/parent-verification-of-agent-output`
- `github/committing-user-work-safely`
- `github/safe-git-worktree-operations`

Codebase Memory is read-only in R0A. Use only existing-index read operations such as architecture/search/snippet queries. `index_repository`, `detect_changes`, `ingest_traces`, `manage_adr`, project deletion and every other index mutation are forbidden. If an existing index is unavailable, inspect source with local read-only tools and record `codebase_memory_existing_index=unavailable`; do not create one.

## Repository safety

Canonical Workplane source repository:

```text
/srv/agents/repos/callscore-workplane
```

Its primary checkout contains unrelated dirty/untracked work. Do not modify, stage or commit there.

The application repository has a `post-commit` hook that calls Codebase Memory indexing. R0A must bypass all repository hooks. Before the first Git mutation, create an empty owner-only directory outside every repository from the validated nonce:

```text
/srv/agents/worktrees/.r0a-empty-hooks-$R0A_NONCE
```

Require owner `omar`, mode `0700`, zero members and a recorded device/inode. Execute **every** Git command in either repository, including worktree creation, status, diff, add and commit, with exactly one pinned empty hook override:

```bash
/usr/bin/env -i HOME=/nonexistent PATH=/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 GIT_OPTIONAL_LOCKS=0 GIT_TERMINAL_PROMPT=0 GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_PAGER=/usr/bin/cat GIT_AUTHOR_NAME='CallScore R0A' GIT_AUTHOR_EMAIL='r0a@call-score.invalid' GIT_COMMITTER_NAME='CallScore R0A' GIT_COMMITTER_EMAIL='r0a@call-score.invalid' /usr/bin/git -c core.hooksPath="$HOOKS_DIR" -c core.fsmonitor=false -c core.untrackedCache=false <reviewed-subcommand-and-argv>
```

Do not set a persistent Git configuration value. Revalidate that the hooks directory is still empty immediately before each commit. Bind the path, device/inode, mode, empty-member proof and literal no-hook argv in the review manifest. A hook execution or external index mutation is an R0A failure.

`R0A_GIT_ADMIN_ALLOWLIST` is the only exception to the ordinary two-worktree/control/fixture write roots. For each repository it contains only the exact nonce branch ref, its transient `.lock`, the exact nonce reflog and its transient `.lock`, the exact linked-worktree administration directory selected by `git rev-parse --git-path`, the parent `worktrees/`, `refs/heads/r0a/` and `logs/refs/heads/r0a/` directories only when Git must create them, and `.git/objects/` (new loose objects only; modification, replacement or deletion of any pre-existing object, pack, index, ref, reflog or configuration byte is forbidden). Parent-directory exceptions are create-only and pre/post membership must show only the exact nonce child. Snapshot device/inode/hash/member state before and after every Git mutation. The evidence harness must prove that every shared-administration write is explained by the literal worktree/add/commit argv, that only the exact nonce branch moved, that every new object is content-addressed and reachable from that branch commit, and that no hook, filter, maintenance, GC, fsmonitor or external index process executed. Any other shared `.git` mutation blocks R0A.

Create an isolated worktree from its current `HEAD`:

```text
/srv/agents/worktrees/callscore-workplane-r0a-$R0A_NONCE
```

Use a dedicated branch:

```text
r0a/hermes-state-maintenance-$R0A_NONCE
```

Record base commit/tree and dirty-state evidence. Do not infer that the dirty primary checkout belongs to this task.

Do not modify or commit from the application primary checkout. The immutable R0A review instruction supplies `APP_BASE_COMMIT` and `APP_BASE_TREE`; first verify they equal the reviewed primary `HEAD`/tree, then create a second isolated worktree using the same empty-hooks procedure:

```text
/srv/agents/worktrees/crypto-tuber-ranked-r0a-$R0A_NONCE
branch: r0a/callscore-maintenance-artifacts-$R0A_NONCE
base: APP_BASE_COMMIT / APP_BASE_TREE from the immutable review tuple
```

All application output paths below are relative to that application worktree. Preserve the primary checkout byte-for-byte.

The executable Hermes dependency boundary is the complete clean commit/tree:

```text
commit 3c388db06b6543821f15ed62efb9d8e7cd9bb9be
tree   ad9824f4ba7e007b42bf6aa2fd171df6916790a8
```

Require `git status --porcelain=v1` empty and bind the whole commit/tree in R0B, installation readback and R1 preflight. Also record diagnostic anchor hashes:

```text
/srv/agents/hermes/hermes-agent/hermes_state.py — 8b4e56aaead7e7622677f19142aa1fa5ceeb292ec9b0f8f75e84880d65deb216
/srv/agents/hermes/hermes-agent/tools/session_search_tool.py — 221c78b285827277d9e1605bc11f505eaba30cd1b5c47816309466da9e8304f7
/srv/agents/hermes/hermes-agent/gateway/status.py — bd46abb12ea2314cee6f0c3c9d3f06844b516af50d63fe526cc1f1422d0dfb75
```

Imports may use files within that exact clean tree; no uncommitted or outside-tree Hermes code is permitted. Any commit/tree or anchor mismatch invalidates review.

Before either worktree is created, run the already-reviewed bootstrap test, then generate and validate an owner-only pre-edit input manifest at `/srv/agents/worktrees/.r0a-input-manifest-$R0A_NONCE.json` using the immutable bootstrap script/schema above. It binds the plan and R0A prompt hashes, reviewed application and Workplane base commits/trees, complete Hermes commit/tree plus anchor hashes, all six committed review-input path/hash pairs, and SHA-256/device/inode/mode/owner for:

```text
/etc/systemd/system/agent-snapshot.service
/etc/systemd/system/agent-snapshot.timer
/usr/local/bin/agent-snapshot
/home/omar/.config/systemd/user/hermes-callscore-gateway.service
```

Use strict UTF-8 JSON with duplicate-key rejection and the bootstrap's restricted ASCII/safe-integer RFC 8785 profile. Open every mutable file once with `O_NOFOLLOW`, use pre/post `fstat`, hash and capture those exact fd bytes into `/srv/agents/worktrees/.r0a-input-captures-$R0A_NONCE/`, then bind the captures. Abort before worktree creation on drift. Copy the already-captured bytes and validated manifest into exact application output paths; never reopen mutable inputs later.

The exact-tuple execution envelope must provide nonempty ASCII `R0A_NONCE`, `APP_BASE_COMMIT`, `APP_BASE_TREE`, `WORKPLANE_BASE_COMMIT`, `WORKPLANE_BASE_TREE`, `PLAN_SHA256` and `R0A_PROMPT_SHA256`. Derive `HOOKS_DIR=/srv/agents/worktrees/.r0a-empty-hooks-$R0A_NONCE` and `CONTROL_ROOT=/srv/agents/worktrees/.r0a-control-$R0A_NONCE`; reject a nonce outside `^[a-z0-9][a-z0-9-]{7,63}$`. Before any Git command, create both new directories with mode `0700`, require owner UID `$(/usr/bin/id -u omar)`, record device/inode, and require zero members. `CONTROL_ROOT` is the one canonical nonce control root. No `<nonce>` pseudo-token is executable input.

Literal pre-worktree commands, cwd `/opt/crypto-tuber-ranked`, expected exit `0`; the four bootstrap SHA-256 values are the immutable values in **Canonical inputs** above. The outer `/usr/bin/env -i` is mandatory: even directory creation, hashing and bootstrap validation run under the cleared environment.

```bash
/usr/bin/env -i HOME=/nonexistent PATH=/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 PYTHONDONTWRITEBYTECODE=1 R0A_NONCE="$R0A_NONCE" APP_BASE_COMMIT="$APP_BASE_COMMIT" APP_BASE_TREE="$APP_BASE_TREE" WORKPLANE_BASE_COMMIT="$WORKPLANE_BASE_COMMIT" WORKPLANE_BASE_TREE="$WORKPLANE_BASE_TREE" PLAN_SHA256="$PLAN_SHA256" R0A_PROMPT_SHA256="$R0A_PROMPT_SHA256" /usr/bin/bash --noprofile --norc -eu -o pipefail <<'R0A_PREWORKTREE'
/usr/bin/test -n "$R0A_NONCE" && /usr/bin/printf '%s' "$R0A_NONCE" | /usr/bin/grep -Eq '^[a-z0-9][a-z0-9-]{7,63}$'
HOOKS_DIR="/srv/agents/worktrees/.r0a-empty-hooks-$R0A_NONCE"
CONTROL_ROOT="/srv/agents/worktrees/.r0a-control-$R0A_NONCE"
WORKPLANE_WORKTREE="/srv/agents/worktrees/callscore-workplane-r0a-$R0A_NONCE"
APP_WORKTREE="/srv/agents/worktrees/crypto-tuber-ranked-r0a-$R0A_NONCE"
WORKPLANE_GIT_DIR=/srv/agents/repos/callscore-workplane/.git
APP_GIT_DIR=/opt/crypto-tuber-ranked/.git
WORKPLANE_ADMIN_NAME="$(/usr/bin/basename "$WORKPLANE_WORKTREE")"
APP_ADMIN_NAME="$(/usr/bin/basename "$APP_WORKTREE")"
/usr/bin/test ! -e "$HOOKS_DIR" && /usr/bin/test ! -e "$CONTROL_ROOT" && /usr/bin/test ! -e "$WORKPLANE_WORKTREE" && /usr/bin/test ! -e "$APP_WORKTREE"
/usr/bin/mkdir -m 0700 -- "$HOOKS_DIR" "$CONTROL_ROOT"
/usr/bin/test ! -L "$HOOKS_DIR" && /usr/bin/test "$(/usr/bin/stat -c '%u:%a' "$HOOKS_DIR")" = "$(/usr/bin/id -u omar):700" && /usr/bin/test -z "$(/usr/bin/find "$HOOKS_DIR" -mindepth 1 -maxdepth 1 -print -quit)"
/usr/bin/test ! -L "$CONTROL_ROOT" && /usr/bin/test "$(/usr/bin/stat -c '%u:%a' "$CONTROL_ROOT")" = "$(/usr/bin/id -u omar):700" && /usr/bin/test -z "$(/usr/bin/find "$CONTROL_ROOT" -mindepth 1 -maxdepth 1 -print -quit)"
R0A_COMMAND_ID=immutable-hash-check
/usr/bin/printf '%s  %s\n' '18ab5d7bd2cbbebf1544b73dfc481329947dade6057a0a85f3cd80d1593d992b' scripts/callscore-r0a-bootstrap.py '9206cb1e743cf4f68d68b5be960bd05fae979aa3d53b1a25452c750f5022c65c' tests/test_callscore_r0a_bootstrap.py '1e281a113cfa61b43bda6d3a192deb1907d1238c0cea0473d9c4f24a0fb99213' docs/ops/callscore-r0a/bootstrap/callscore-r0a-input-manifest-v1.schema.json '085630cb45fcf842d53de1270b2d2a88c6ed29b9b6dab0189d8711e638c1a492' docs/ops/callscore-r0a/bootstrap/input-spec.json | /usr/bin/sha256sum -c -
r0a_failure() { rc=$?; trap - ERR; /usr/bin/python3 scripts/callscore-r0a-bootstrap.py write-failure-receipt --control-root "$CONTROL_ROOT" --nonce "$R0A_NONCE" --phase preworktree --command-id "$R0A_COMMAND_ID" --exit-code "$rc" --bootstrap-sha256 18ab5d7bd2cbbebf1544b73dfc481329947dade6057a0a85f3cd80d1593d992b --test-sha256 9206cb1e743cf4f68d68b5be960bd05fae979aa3d53b1a25452c750f5022c65c --schema-sha256 1e281a113cfa61b43bda6d3a192deb1907d1238c0cea0473d9c4f24a0fb99213; exit "$rc"; }
trap r0a_failure ERR
R0A_COMMAND_ID=bootstrap-unit-tests
/usr/bin/python3 -m unittest -v tests/test_callscore_r0a_bootstrap.py
R0A_COMMAND_ID=input-manifest-create
/usr/bin/python3 scripts/callscore-r0a-bootstrap.py create --spec /opt/crypto-tuber-ranked/docs/ops/callscore-r0a/bootstrap/input-spec.json --output "/srv/agents/worktrees/.r0a-input-manifest-$R0A_NONCE.json" --capture-dir "/srv/agents/worktrees/.r0a-input-captures-$R0A_NONCE" --hooks-dir "$HOOKS_DIR" --application-repo /opt/crypto-tuber-ranked --workplane-repo /srv/agents/repos/callscore-workplane --hermes-repo /srv/agents/hermes/hermes-agent --application-commit "$APP_BASE_COMMIT" --application-tree "$APP_BASE_TREE" --workplane-commit "$WORKPLANE_BASE_COMMIT" --workplane-tree "$WORKPLANE_BASE_TREE" --hermes-commit 3c388db06b6543821f15ed62efb9d8e7cd9bb9be --hermes-tree ad9824f4ba7e007b42bf6aa2fd171df6916790a8 --plan-sha256 "$PLAN_SHA256" --prompt-sha256 "$R0A_PROMPT_SHA256"
R0A_COMMAND_ID=input-manifest-validate
/usr/bin/python3 scripts/callscore-r0a-bootstrap.py validate --manifest "/srv/agents/worktrees/.r0a-input-manifest-$R0A_NONCE.json"
/usr/bin/test -z "$(/usr/bin/find "$HOOKS_DIR" -mindepth 1 -maxdepth 1 -print -quit)"
R0A_COMMAND_ID=workplane-worktree-add
/usr/bin/env -C /srv/agents/repos/callscore-workplane -i HOME=/nonexistent PATH=/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 GIT_OPTIONAL_LOCKS=0 GIT_TERMINAL_PROMPT=0 GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_PAGER=/usr/bin/cat GIT_AUTHOR_NAME='CallScore R0A' GIT_AUTHOR_EMAIL='r0a@call-score.invalid' GIT_COMMITTER_NAME='CallScore R0A' GIT_COMMITTER_EMAIL='r0a@call-score.invalid' /usr/bin/strace -ff -qq -s 4096 -yy -e trace=all -o "$CONTROL_ROOT/workplane-add.trace" /usr/bin/git -c core.hooksPath="$HOOKS_DIR" -c core.fsmonitor=false -c core.untrackedCache=false worktree add -b "r0a/hermes-state-maintenance-$R0A_NONCE" "$WORKPLANE_WORKTREE" "$WORKPLANE_BASE_COMMIT"
R0A_COMMAND_ID=workplane-worktree-audit
/usr/bin/python3 scripts/callscore-r0a-bootstrap.py audit-trace --trace-prefix "$CONTROL_ROOT/workplane-add.trace" --cwd /srv/agents/repos/callscore-workplane --allowed-write-root "$WORKPLANE_WORKTREE" --allowed-write-root "$WORKPLANE_GIT_DIR/objects" --allowed-write-root "$WORKPLANE_GIT_DIR/worktrees/$WORKPLANE_ADMIN_NAME" --allowed-write-path "$WORKPLANE_GIT_DIR/worktrees" --allowed-write-path "$WORKPLANE_GIT_DIR/refs/heads/r0a" --allowed-write-path "$WORKPLANE_GIT_DIR/logs/refs/heads/r0a" --allowed-write-path "$WORKPLANE_GIT_DIR/refs/heads/r0a/hermes-state-maintenance-$R0A_NONCE" --allowed-write-path "$WORKPLANE_GIT_DIR/refs/heads/r0a/hermes-state-maintenance-$R0A_NONCE.lock" --allowed-write-path "$WORKPLANE_GIT_DIR/logs/refs/heads/r0a/hermes-state-maintenance-$R0A_NONCE" --allowed-write-path "$WORKPLANE_GIT_DIR/logs/refs/heads/r0a/hermes-state-maintenance-$R0A_NONCE.lock"
/usr/bin/test -d "$WORKPLANE_GIT_DIR/worktrees/$WORKPLANE_ADMIN_NAME" && /usr/bin/test -f "$WORKPLANE_GIT_DIR/refs/heads/r0a/hermes-state-maintenance-$R0A_NONCE"
/usr/bin/test -z "$(/usr/bin/find "$HOOKS_DIR" -mindepth 1 -maxdepth 1 -print -quit)"
R0A_COMMAND_ID=application-worktree-add
/usr/bin/env -C /opt/crypto-tuber-ranked -i HOME=/nonexistent PATH=/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 GIT_OPTIONAL_LOCKS=0 GIT_TERMINAL_PROMPT=0 GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_PAGER=/usr/bin/cat GIT_AUTHOR_NAME='CallScore R0A' GIT_AUTHOR_EMAIL='r0a@call-score.invalid' GIT_COMMITTER_NAME='CallScore R0A' GIT_COMMITTER_EMAIL='r0a@call-score.invalid' /usr/bin/strace -ff -qq -s 4096 -yy -e trace=all -o "$CONTROL_ROOT/application-add.trace" /usr/bin/git -c core.hooksPath="$HOOKS_DIR" -c core.fsmonitor=false -c core.untrackedCache=false worktree add -b "r0a/callscore-maintenance-artifacts-$R0A_NONCE" "$APP_WORKTREE" "$APP_BASE_COMMIT"
R0A_COMMAND_ID=application-worktree-audit
/usr/bin/python3 scripts/callscore-r0a-bootstrap.py audit-trace --trace-prefix "$CONTROL_ROOT/application-add.trace" --cwd /opt/crypto-tuber-ranked --allowed-write-root "$APP_WORKTREE" --allowed-write-root "$APP_GIT_DIR/objects" --allowed-write-root "$APP_GIT_DIR/worktrees/$APP_ADMIN_NAME" --allowed-write-path "$APP_GIT_DIR/worktrees" --allowed-write-path "$APP_GIT_DIR/refs/heads/r0a" --allowed-write-path "$APP_GIT_DIR/logs/refs/heads/r0a" --allowed-write-path "$APP_GIT_DIR/refs/heads/r0a/callscore-maintenance-artifacts-$R0A_NONCE" --allowed-write-path "$APP_GIT_DIR/refs/heads/r0a/callscore-maintenance-artifacts-$R0A_NONCE.lock" --allowed-write-path "$APP_GIT_DIR/logs/refs/heads/r0a/callscore-maintenance-artifacts-$R0A_NONCE" --allowed-write-path "$APP_GIT_DIR/logs/refs/heads/r0a/callscore-maintenance-artifacts-$R0A_NONCE.lock"
/usr/bin/test -d "$APP_GIT_DIR/worktrees/$APP_ADMIN_NAME" && /usr/bin/test -f "$APP_GIT_DIR/refs/heads/r0a/callscore-maintenance-artifacts-$R0A_NONCE"
/usr/bin/test -z "$(/usr/bin/find "$HOOKS_DIR" -mindepth 1 -maxdepth 1 -print -quit)"
R0A_PREWORKTREE
```

Input-manifest generation uses the reviewed bootstrap module's `capture_file`, `canonical_bytes`, `validate_manifest`, `validate_manifest_identity` and `validate_manifest_files` functions with the exact tuple/path/hash values above; the resulting bytes have no trailing LF. The manifest carries one canonical top-level `capture_root`; mutable records carry schema-enumerated basenames rather than independent full paths, and UID/GID are canonical decimal strings. The duplicate-key-free, float-free, printable-ASCII bootstrap validator plus the committed Draft 2020-12 schema form the composite runtime boundary; the negative matrix must prove structural, capture-root, token-type and canonical-byte parity. No mutable third-party schema package and no later-created Workplane/application validator is part of this pre-worktree gate.

## Required architecture

R0A prepares but does not install three security boundaries.

### 1. Signed root broker

Prepare a root broker that accepts only the exact operator-signed JCS bytes of `callscore-r1-maintenance-authorization-v1` from a preconfigured SSH allowed-signers trust store. There is no separate proposal schema and no broker promotion/transformation. R0C creates the final unsigned authorization candidate; `omarslaptop-1` signs those exact bytes unchanged:

```bash
ssh-keygen -Y sign -f <operator-private-key-path> -n callscore-r1 callscore-r1-maintenance-authorization-v1.json
ssh-keygen -Y verify -f /etc/callscore/allowed_signers -I omar-callscore-r1 -n callscore-r1 -s callscore-r1-maintenance-authorization-v1.json.sig < callscore-r1-maintenance-authorization-v1.json
```

The `.json` is strict RFC 8785 JCS with no trailing LF. The `.sig` is the unmodified OpenSSH armored signature emitted by `ssh-keygen`, ending in one LF. Broker ingress stores both exact byte strings in root-controlled storage, records their SHA-256 values, re-runs the literal verify argv and derives every action only from signed fields. The authorization binds principal `omar-callscore-r1`, namespace `callscore-r1`, target/profile, exact actions/argv, reviewed tuples, mutable input identities, expiries and maximum duration.

The broker must reject:

- unsigned/self-authored records;
- unknown principals;
- wrong namespace;
- stale/future/expired records;
- nonce replay;
- wrong plan, prompt, source, unit, schema or verifier hashes;
- actions/argv outside the signed set;
- execution after `maximum_run_duration_seconds`;
- requests from an unapproved target/profile;
- any destructive transition whose per-transition expiry check fails.

The R1 runner may trigger an already-authorised broker action but may not create, modify or sign its authorisation.

### 2. Kernel-enforced writer fence

Do not claim an advisory lock or `/proc` inventory prevents writers.

Prepare a broker-controlled fence using a dedicated `callscore-maint` service UID and a private mount namespace:

1. drain and verify all existing target DB holders;
2. expose the original profile/state path read-write only inside the maintenance namespace;
3. bind/remount the canonical target path read-only for ordinary processes;
4. deny Omar's ordinary gateway/CLI/cron/direct-SQLite writers while the fence is active;
5. allow only the nonce-bound maintenance unit to reach the private read-write bind;
6. hold the fence continuously across FTS migration, VACUUM, verification and rollback;
7. fail closed if a direct unguarded writer is detected;
8. release only through the broker finaliser after DB verification.

The R1 service must run as `User=callscore-maint`, with `NoNewPrivileges=yes`, no sudo, no network, empty capability bounding set and writable paths limited to the private maintenance bind plus the run's control directory.

The future namespace topology is literal:

1. R0C provisions dedicated UID/GID `callscore-maint:callscore-state-maint`; it records original owner/group/mode/ACLs, then applies temporary traversal/write ACLs plus setgid/default group access needed to create DB/WAL/SHM through the private path;
2. the root broker opens an `O_PATH` fd to the original profile and creates `/run/callscore-maintenance/<nonce>/original` as a root-only bind anchor;
3. the broker starts `callscore-r1-maintenance@<nonce>.service`; systemd establishes its private mount namespace and `BindPaths=/run/callscore-maintenance/<nonce>/original:/var/lib/callscore-maintenance/state` before dropping credentials;
4. the waiting runner reports its PID, mount-namespace inode, private-bind device/inode and DAC write/readiness proof through a root-controlled nonce channel, but performs no DB mutation yet;
5. the broker verifies namespace isolation/readiness, bind-mounts the canonical host profile path onto itself, remounts that host-visible bind read-only, revalidates all holders and DB identity, then releases the waiting runner;
6. maintenance opens only `/var/lib/callscore-maintenance/state/state.db`; tests require DB/WAL/SHM creation through the private path while UID `omar` is denied through the canonical path;
7. on success, the service stops, broker verifies no private-path holders, removes temporary ACL/setgid/default access and verifies original owner/group/mode/ACLs, unmounts the private anchor and canonical read-only self-bind, then verifies original path identity;
8. on teardown uncertainty, keep the canonical path read-only and emit a critical blocker.

The target host rejects unprivileged mount namespaces. R0A runs hermetic nonprivileged state-machine/syscall-contract tests and generates the privileged disposable-fixture integration-test artifact, but must not claim kernel-fence GREEN. Privileged mount/writer-denial GREEN moves to R0C with exact command:

```bash
/usr/local/sbin/callscore-maintenance-broker integration-test --fixture-root /var/tmp/callscore-r0c-fixture --assert-host-ro --assert-private-rw --assert-hostile-writer-denied --assert-clean-teardown
```

Expected exit is `0`; every named assertion must be `pass`; the fixture is outside the live profile and deleted only after object-identity verification.

R0A completion is reported as `prepared`, not `pass`, and must include `kernel_fence_integration_status=pending_r0c` plus `kernel_fence_green_claimed=false`. R0C must prove namespace identity, maintenance DAC access, Omar denial, WAL/SHM creation and cleanup for every finaliser branch before live R1 can be authorised.

The reviewed R0C DAC sequence records `stat -c '%u:%g:%a:%d:%i'` and `getfacl -p` bytes first, then uses exactly `groupadd --system callscore-state-maint`, `useradd --system --gid callscore-state-maint --no-create-home --shell /usr/sbin/nologin callscore-maint`, `chgrp callscore-state-maint <fixture-profile>`, `chmod 2770 <fixture-profile>`, `setfacl -m u:callscore-maint:rwx,m::rwx <fixture-profile>`, `setfacl -m d:u:callscore-maint:rwx,d:m::rwx <fixture-profile>`, and `setfacl -m u:callscore-maint:rw- <fixture-profile>/state.db`. Creation is idempotent only when existing UID/GID definitions match the signed authorization. Cleanup stops the unit first, then runs `setfacl --restore=<pre-acl-file>`, restores recorded owner/group/mode in reverse order, and requires exact `stat` plus `getfacl -p` byte-hash readback. Existing identities, mismatches, or any cleanup discrepancy fail closed.

### 3. Snapshot and restore

Prepare an owner-only, online-SQLite snapshot tool and a staged rollback tool.

The state DB is an opaque payload. Never extract or log possible values.

Snapshot allowlist:

- `state.db` created by SQLite online backup;
- `manifest.json`;
- `restore-readback.json`;
- value-free `recovery-metadata.json`.

Default-deny `.env*`, `auth.json`, provider configuration, key material, caches, logs, exports, process environments, command dumps and Git object bundles.

For any deletable snapshot, bind:

- canonical parent path;
- parent device/inode;
- snapshot device/inode;
- owner;
- run ID;
- complete member allowlist;
- manifest SHA-256.

Deletion must use fd-relative, no-follow, beneath-only, no-cross-device traversal (`openat2` with `RESOLVE_BENEATH|RESOLVE_NO_SYMLINKS|RESOLVE_NO_XDEV`, or an equivalently proven boundary), immediate `fstat` revalidation, allowlisted `unlinkat`, and zero deletion on drift.

Rollback after any post-mutation DB/FTS/count/search/checkpoint failure must:

1. keep writers fenced and gateway stopped;
2. verify the pre-R1 anchor identity and hash;
3. preserve the failed DB/WAL/SHM on the authorised forensic target without logging content;
4. restore the anchor to a sibling staged file;
5. verify quick-check, exact FTS schema/integrity and canonical counts;
6. fsync the staged file;
7. atomically replace `state.db`;
8. fsync the parent directory;
9. safely disposition stale WAL/SHM;
10. reverify before any writer restarts;
11. keep the fence and gateway stopped if restoration fails.

Before gateway stop or DB mutation, R1 authorisation and readback must prove external capacity for the current anchor, maximum failed `state.db`/WAL/SHM forensic set, a full sibling staged-restore copy, and 2 GiB safety margin. Capacity or target-identity drift takes the pre-anchor blocked finalizer with zero live mutation. R0A does not provision capacity.

## Exact source files

Create exactly these paths in the isolated Workplane worktree:

```text
ops/hermes-state-maintenance/broker.py
ops/hermes-state-maintenance/maintenance_runner.py
ops/hermes-state-maintenance/agent_snapshot.py
ops/hermes-state-maintenance/session_probe.py
ops/hermes-state-maintenance/fts_verify.py
ops/hermes-state-maintenance/restore.py
ops/hermes-state-maintenance/safe_snapshot_delete.py
ops/hermes-state-maintenance/authorization_verify.py
ops/hermes-state-maintenance/r0a_evidence.py
ops/hermes-state-maintenance/validate_schemas.py
ops/hermes-state-maintenance/r0a_secret_scan.py
ops/hermes-state-maintenance/test_broker.py
ops/hermes-state-maintenance/test_maintenance_runner.py
ops/hermes-state-maintenance/test_agent_snapshot.py
ops/hermes-state-maintenance/test_session_probe.py
ops/hermes-state-maintenance/test_fts_verify.py
ops/hermes-state-maintenance/test_restore.py
ops/hermes-state-maintenance/test_safe_snapshot_delete.py
ops/hermes-state-maintenance/test_authorization_verify.py
ops/hermes-state-maintenance/test_r0a_evidence.py
ops/hermes-state-maintenance/test_validate_schemas.py
ops/hermes-state-maintenance/test_r0a_secret_scan.py
ops/hermes-state-maintenance/schemas/callscore-r0a-preparation-result-v1.schema.json
ops/hermes-state-maintenance/schemas/callscore-r1-maintenance-authorization-v1.schema.json
ops/hermes-state-maintenance/schemas/callscore-snapshot-policy-v1.schema.json
ops/hermes-state-maintenance/schemas/callscore-state-snapshot-manifest-v1.schema.json
ops/hermes-state-maintenance/schemas/callscore-r1-gate-receipt-v1.schema.json
ops/hermes-state-maintenance/schemas/callscore-r1-finalizer-receipt-v1.schema.json
ops/hermes-state-maintenance/schemas/callscore-r1-phase-final-v1.schema.json
ops/hermes-state-maintenance/systemd/callscore-maintenance-broker.socket
ops/hermes-state-maintenance/systemd/callscore-maintenance-broker.service
ops/hermes-state-maintenance/systemd/callscore-r1-maintenance@.service
ops/hermes-state-maintenance/systemd/agent-snapshot.service
ops/hermes-state-maintenance/systemd/agent-snapshot.timer
ops/hermes-state-maintenance/docs/operator-signing-and-install.md
```

Do not invent additional production files without stopping for plan amendment.

## Exact application-repository outputs

After the Workplane commit exists, create only these additional application-repository paths:

```text
docs/prompts/2026-07-30-callscore-r1-state-gateway-execution-prompt.md
docs/ops/callscore-r0a/review-manifest.json
docs/ops/callscore-r0a/review-manifest.json.sha256
docs/ops/callscore-r0a/schemas/callscore-r0a-review-manifest-v1.schema.json
docs/ops/callscore-r0a/schemas/callscore-r0a-input-manifest-v1.schema.json
docs/ops/callscore-r0a/schemas/callscore-r0a-evidence-results-v1.schema.json
docs/ops/callscore-r0a/schemas/callscore-r0a-evidence-root-v1.schema.json
docs/ops/callscore-r0a/schemas/callscore-r0a-preparation-result-v1.schema.json
docs/ops/callscore-r0a/schemas/callscore-r1-prompt-contract-v1.schema.json
docs/ops/callscore-r0a/input-manifest.json
docs/ops/callscore-r0a/inputs/live/agent-snapshot.service
docs/ops/callscore-r0a/inputs/live/agent-snapshot.timer
docs/ops/callscore-r0a/inputs/live/agent-snapshot
docs/ops/callscore-r0a/inputs/live/hermes-callscore-gateway.service
docs/ops/callscore-r0a/evidence/red-results.json
docs/ops/callscore-r0a/evidence/green-results.json
docs/ops/callscore-r0a/evidence/evidence-root.json
docs/ops/callscore-r0a/evidence/evidence-root.json.sha256
docs/ops/callscore-r0a/final-r1-prompt.contract.json
```

Do not add install receipts or live authorisations in R0A.

## Exact future installed paths

Document but do not install:

```text
/usr/local/lib/callscore-maintenance/
/usr/local/sbin/callscore-maintenance-broker
/usr/local/bin/callscore-r1-maintenance
/usr/local/bin/agent-snapshot
/usr/local/bin/callscore-session-store-probe
/usr/local/bin/callscore-state-restore
/etc/systemd/system/callscore-maintenance-broker.socket
/etc/systemd/system/callscore-maintenance-broker.service
/etc/systemd/system/callscore-r1-maintenance@.service
/etc/systemd/system/agent-snapshot.service
/etc/systemd/system/agent-snapshot.timer
/etc/callscore/allowed_signers
/var/lib/callscore/authorizations/r1/
/var/lib/callscore/policies/snapshot-policy.json
```

No R1 executor sudoers entry is allowed.

## Exact unit requirements

### Broker

- root-owned source and unit;
- root service;
- fixed absolute `ExecStart`;
- root-owned socket with a narrow group;
- validates operator SSH signature and all schema/hash/expiry bindings before action;
- creates nonce replay tombstone before first destructive transition;
- no network;
- logs only value-free identifiers and hashes.

### R1 maintenance unit

- `User=callscore-maint` and `Group=callscore-state-maint`;
- `Environment=HERMES_HOME=/var/lib/callscore-maintenance/state` and `HOME=/nonexistent`; every Hermes CLI invocation must resolve this explicit maintenance state root and must not pass `--profile callscore`;
- `NoNewPrivileges=yes`;
- empty `CapabilityBoundingSet` and `AmbientCapabilities`;
- network namespace denied;
- `PrivateTmp=yes`;
- `ProtectSystem=strict`;
- no sudo path;
- `ReadWritePaths` only for broker-created private RW bind and run control directory;
- fixed nonce-bound argv;
- maximum runtime enforced by both authorisation and systemd;
- mandatory finaliser.

### Snapshot service

- `User=omar`, `Group=omar`, `UMask=0077`;
- `NoNewPrivileges=yes`;
- empty capability bounding set;
- `ProtectSystem=strict`;
- `PrivateTmp=yes`;
- network denied;
- source profile read-only;
- `ReadWritePaths` limited to approved snapshot/control roots;
- fixed absolute `ExecStart`;
- validates a separately signed recurring `callscore.snapshot_policy.v1` before each run;
- validates policy expiry and exact source/unit/tool/schema hashes;
- one-snapshot retention with object-identity-bound deletion.

The one-time R1 snapshot canary is nonce-bound. The recurring timer may be enabled only when the separate recurring policy exists and validates. Otherwise it remains disabled without failing the state/gateway maintenance rollback.

## FTS verification contract

Expected v23 indexes are:

- `messages_fts`;
- `messages_fts_trigram`;
- `messages_fts_cjk` when present in the installed Hermes v23 schema.

For every present external-content index, execute on a disposable fixture in R0A and specify for R1:

```sql
INSERT INTO <table>(<table>, rank) VALUES('integrity-check', 1);
```

Validate exact v23 table SQL, content rowid, tokenizer/options and required triggers from the installed Hermes source.

Prepare deterministic non-secret canaries that force:

- ASCII `fts5` routing;
- CJK bigram routing when available;
- trigram fallback with CJK-bigram availability deliberately disabled in the test instance;
- one-character CJK `like_scan` routing.

For each, assert exact session/message IDs through:

- `SessionDB.search_messages`;
- `tools.session_search_tool.session_search`.

Assert presence before exact canary deletion and absence after. The R1 verifier must require:

```sql
PRAGMA wal_checkpoint(TRUNCATE);
```

with the busy field exactly `0`.

## Receipt and schema semantics

Use top-level `schema`, never `receipt_type` or `receipt_schema`.

All schemas must use `additionalProperties: false` at security boundaries and encode cross-field rules, including:

- `blocked|failed` implies `phase_r2_allowed=false`;
- `pass` requires verified finaliser, authorisation, snapshot, writer-fence, DB, FTS, checkpoint and gateway gates;
- no receipt defaults mutation flags to false without evidence;
- `production_database` is `false|true|unknown` and `pass` requires independently proven `false`;
- stale/missing/wrong review or artifact hashes fail;
- authorisation expiry is revalidated before every destructive transition;
- snapshot deletion requires exact object identity and member allowlist;
- finaliser branches on `current_restore_point_verified` and `gateway_stop_started`.

Canonical JSON hashing must be specified as UTF-8 RFC 8785 JCS bytes plus SHA-256. Tests must include reordered-key equivalence, Unicode, numeric and duplicate-key rejection cases.

## State-dependent finaliser

Encode and test at least:

1. **Pre-anchor capacity block:** `current_restore_point_verified=false`, `gateway_stop_started=false`; preserve and verify the original manual gateway/timer/job state. Do not transfer supervision.
2. **Post-anchor pre-stop failure:** preserve verified anchor and original gateway state.
3. **Post-stop pre-DB-mutation failure:** restore canonical gateway only if authorised and DB verifies.
4. **Post-DB-mutation verification failure:** execute exact state restore while fenced; restart only after restore verifies.
5. **Restore failure:** retain fence, leave gateway stopped, emit critical blocker.
6. **Success:** canonical gateway only, daily write timer and provider-capable jobs remain paused, snapshot timer enabled only with valid recurring policy.

## RED -> GREEN matrix

Observe each RED failure before implementation. At minimum test:

- unsigned/unknown/stale/replayed/wrong-hash authorisation rejection;
- per-transition expiry;
- no implementation-hash bootstrap assumption;
- nonprivileged broker/fence state machine rejects invalid topology and unsafe transitions;
- generated R0C integration artifact covers same-UID writer denial, inter-chunk direct-SQLite denial and private-RW maintenance access;
- exact PID identity and SIGTERM-only stop;
- every finaliser branch;
- online backup during concurrent WAL writes;
- opaque snapshot allowlist and private modes;
- object substitution, symlink, mount-crossing and membership-drift deletion attacks;
- failed DB forensic preservation and atomic restore;
- all FTS routes and both search entrypoints;
- checkpoint busy nonzero failure;
- snapshot service sandbox and recurring-policy expiry;
- all JSON Schema negative matrices and canonical hashing.

Run tests from disposable fixtures only. Capture explicit RED and GREEN command output.

### Canonical evidence commands and bytes

Create the evidence harness before behavioural tests. It is infrastructure, not the implementation under test. No package installation or network access is authorised. Preflight `python3` plus `jsonschema==4.10.3`; a missing/wrong dependency is `blocked_dependency_bootstrap`. Applicable scope is exactly `ops/hermes-state-maintenance/**`; all vendored `control-plane/**` trees are excluded. Use these exact commands from the isolated Workplane root:

```bash
/usr/bin/env -i HOME=/nonexistent PATH=/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 /usr/bin/python3 -c "import importlib.metadata as m; assert m.version('jsonschema') == '4.10.3'"
/usr/bin/python3 ops/hermes-state-maintenance/r0a_evidence.py run --phase red --command-id unit --results-file "$APP_WORKTREE/docs/ops/callscore-r0a/evidence/red-results.json" -- /usr/bin/python3 -m unittest discover -s ops/hermes-state-maintenance -p 'test_*.py' -v
/usr/bin/python3 ops/hermes-state-maintenance/r0a_evidence.py run --phase green --command-id unit --results-file "$APP_WORKTREE/docs/ops/callscore-r0a/evidence/green-results.json" -- /usr/bin/python3 -m unittest discover -s ops/hermes-state-maintenance -p 'test_*.py' -v
/usr/bin/python3 ops/hermes-state-maintenance/r0a_evidence.py run --phase green --command-id schema-negatives --results-file "$APP_WORKTREE/docs/ops/callscore-r0a/evidence/green-results.json" -- /usr/bin/python3 -m unittest -v ops/hermes-state-maintenance/test_validate_schemas.py
/usr/bin/python3 ops/hermes-state-maintenance/r0a_evidence.py run --phase green --command-id compile --results-file "$APP_WORKTREE/docs/ops/callscore-r0a/evidence/green-results.json" -- /usr/bin/python3 -m compileall -q ops/hermes-state-maintenance
/usr/bin/python3 ops/hermes-state-maintenance/r0a_evidence.py run --phase green --command-id lint --results-file "$APP_WORKTREE/docs/ops/callscore-r0a/evidence/green-results.json" -- /usr/bin/python3 -m tabnanny -v ops/hermes-state-maintenance
/usr/bin/python3 ops/hermes-state-maintenance/r0a_evidence.py run --phase green --command-id schemas --results-file "$APP_WORKTREE/docs/ops/callscore-r0a/evidence/green-results.json" -- /usr/bin/python3 ops/hermes-state-maintenance/validate_schemas.py --workplane-root "$WORKPLANE_WORKTREE" --application-root "$APP_WORKTREE"
/usr/bin/python3 ops/hermes-state-maintenance/r0a_evidence.py run --phase green --command-id secret-scan --results-file "$APP_WORKTREE/docs/ops/callscore-r0a/evidence/green-results.json" -- /usr/bin/python3 ops/hermes-state-maintenance/r0a_secret_scan.py --root ops/hermes-state-maintenance
/usr/bin/python3 ops/hermes-state-maintenance/r0a_evidence.py run --phase green --command-id app-secret-scan --results-file "$APP_WORKTREE/docs/ops/callscore-r0a/evidence/green-results.json" -- /usr/bin/python3 ops/hermes-state-maintenance/r0a_secret_scan.py --root "$APP_WORKTREE" --forbid-relative .tmp/.apify-token.local --require-gitignore-pattern .env --require-gitignore-pattern .env.local --require-gitignore-pattern .tmp/
/usr/bin/python3 ops/hermes-state-maintenance/r0a_evidence.py run --phase green --command-id workplane-diff-check --results-file "$APP_WORKTREE/docs/ops/callscore-r0a/evidence/green-results.json" -- /usr/bin/git -C "$WORKPLANE_WORKTREE" -c core.hooksPath="$HOOKS_DIR" -c core.fsmonitor=false -c core.untrackedCache=false diff --check
/usr/bin/python3 ops/hermes-state-maintenance/r0a_evidence.py run --phase green --command-id app-diff-check --results-file "$APP_WORKTREE/docs/ops/callscore-r0a/evidence/green-results.json" -- /usr/bin/git -C "$APP_WORKTREE" -c core.hooksPath="$HOOKS_DIR" -c core.fsmonitor=false -c core.untrackedCache=false diff --check
```

Every harness command uses the isolated Workplane root as cwd and expects exit `0`, except RED unit, which expects nonzero plus the exact planned assertion IDs. Cross-repository commands use explicit `--prefix` or `git -C`; every Git argv includes the revalidated empty `core.hooksPath`. The manifest records exact expanded argv, cwd, included/excluded scope, expected/actual exit and normalised stdout/stderr hashes for every command.

`r0a_secret_scan.py` accepts the exact repeated `--forbid-relative` and `--require-gitignore-pattern` options above. It rejects an escaping/absolute forbidden-relative path, fails when a forbidden member exists without following symlinks, and requires each literal pattern in the selected root's `.gitignore`. This stdlib-only path replaces dependency on mutable application `node_modules` bytes.

`r0a_evidence.py` atomically replaces each result file via same-directory `fsync` plus `os.replace`, rejects duplicate `command_id`, retains prior entries, and rewrites entries sorted by `command_id`. The evidence-results schema owns both red and green files; the evidence-root schema owns `evidence-root.json`. `final-r1-prompt.contract.json` is the machine-readable structural contract for the Markdown prompt and is validated by `validate_schemas.py`; Markdown itself is not described as schema-valid.

`r0a_evidence.py` must run with a cleared/minimal environment containing only `HOME=/nonexistent`, `PATH=/usr/bin:/bin`, `LANG=C.UTF-8`, `LC_ALL=C.UTF-8`, `PYTHONDONTWRITEBYTECODE=1` and command-specific value-free bindings; fixture-only temp roots and no network. It launches every post-worktree command under `strace -ff -qq -s 4096 -yy -e trace=all`, with `close_fds=true`, stdin from `/dev/null`, and only captured stdout/stderr fds inherited. The audit rejects every network syscall (including AF_UNIX), `ptrace`, namespace/mount/BPF escape, external-process signal, unresolved relative dirfd, unresolved inherited write fd, Git argv without exactly one final pinned empty `core.hooksPath`, and every write/mutation outside the two nonce worktrees, nonce control/evidence paths, declared owner-only fixture roots and `R0A_GIT_ADMIN_ALLOWLIST`. Successful `chdir`/`fchdir` is tracked per trace and is allowed only into an identity-bound write root; unresolved, failed-open-state-dependent or outside-root cwd changes block. Mutating opens require the `-yy` kernel-resolved returned-fd target; lexical paths are never post-resolved through mutable symlinks. All write roots are owner-only, descriptor-bound and symlink-free before and after each command; symlink creation is forbidden. It records one audit object per process tree. Missing `strace`, a truncated/unparsed trace, unknown fd/path identity or a write outside the allowlist makes the associated mutation observations `unknown|true` and blocks `prepared`.

Before any checkout/status that can materialise files, the immutable bootstrap rejects local `filter.*`, `core.attributesFile`, all committed `.gitattributes` filter attributes, multiple/later `core.hooksPath` overrides, nonempty/symlink hook directories and inherited `GIT_*` repository/config redirection. The evidence harness repeats those checks before every Git command. This command/audit boundary is the proof source for the per-class `observations` object: systemd/cron/live DB/index mutations require forbidden filesystem or AF_UNIX activity; provider/public/deployment activity requires forbidden network or credential access; sudo/hooks are derived from exact exec/Git records. An absent class-specific audit reference never becomes `false`.

It normalises result bytes by stripping ANSI sequences, converting CRLF to LF, replacing exact worktree/temp prefixes with `<WORKTREE>` and `<TMP>`, preserving a single final LF, and rejecting NUL or undecodable bytes. `red-results.json` and `green-results.json` are RFC 8785 JCS objects sorted by `command_id`, with `additionalProperties: false`, recording exact argv, argv SHA-256, exit code, normalised stdout/stderr SHA-256 and fixture-root identity. RED requires the intended behavioural tests to fail for expected assertion IDs; GREEN requires zero exit for all commands. No wall-clock timestamps, random paths, secrets or raw environment are included.

Self-reference-free binding order:

1. hash immutable Hermes dependency bytes and committed Workplane source/unit/schema/test bytes;
2. hash canonical red/green result objects;
3. create `evidence-root.json` containing those leaf hashes but no self-hash, then place its SHA-256 only in `evidence-root.json.sha256`;
4. create the final R1 prompt containing the frozen dependency/source hashes and manifest **path**, but not the manifest hash;
5. create `review-manifest.json` containing the application base commit/tree, exact changed-path allowlist, hashes of every application output leaf except `review-manifest.json` and its sidecar, Workplane/Hermes tuples, evidence-root hash, final R1 prompt/contract hashes and literal install/test/Git argv, but no final application commit/tree or self-hash;
6. place only the JCS SHA-256 of the manifest in `review-manifest.json.sha256`.

Every JCS object has no trailing LF. Every `.sha256` sidecar is exactly 64 lowercase ASCII hex characters plus one LF. After application commit, the final R0A result binds its resulting commit/tree plus manifest hash. R0B independently recomputes that closure and creates owner-only `/srv/agents/worktrees/r0b-review-<nonce>/callscore-r0b-review-envelope.json`, binding final application commit/tree, manifest SHA-256, Workplane commit/tree and complete Hermes commit/tree. The in-tree manifest never binds its containing commit.

Validate every object against the exact committed manifest/schema set before the focused application commit. Duplicate JSON keys, non-JCS numbers and Unicode non-conformance fail.

## Failure finalisation and retention

On the first failed or blocked gate, stop issuing implementation and Git-mutation commands. The exact receipt path is `/srv/agents/worktrees/.r0a-control-$R0A_NONCE/failure-receipt.json`; it is created exclusively by `scripts/callscore-r0a-bootstrap.py write-failure-receipt`. Its exact JCS schema is `callscore.r0a_failure_receipt.v1` with only `schema`, `nonce`, `phase`, `command_id`, `exit_code`, `bootstrap_sha256`, `test_sha256`, and `manifest_schema_sha256`. The pre-worktree `ERR` trap is installed only after immutable bootstrap/test/schema hashes pass; a hash mismatch cannot invoke unverified code and is returned as a parent-side blocker without a receipt. After installation, the trap clears itself before calling that subcommand, and every mutating stage sets a fixed ASCII `R0A_COMMAND_ID`. The subcommand reopens the canonical nonce control root with `O_NOFOLLOW`, revalidates owner/mode/device/inode, and publishes the receipt create-only with mode `0600`; an existing receipt fails closed. Preserve nonce worktrees, exact nonce branches, captures, traces and receipt for forensic review; do not automatically remove, reset, prune or reuse them. A failed nonce is never reused. A clean rerun requires a newly reviewed nonce and fresh non-pre-existing paths. Cleanup is a separate explicitly reviewed source-only operation. If the control root is unavailable or untrusted, return a parent-side blocker without writing a receipt.

## R0A completion sequence

1. Read repository instructions and inspect the application, Workplane and exact Hermes dependency files.
2. Freeze the Hermes commit/tree/file hashes; create/revalidate the empty hook directory; verify immutable bootstrap hashes; run bootstrap tests; create and validate the pre-edit input manifest; only then create either isolated worktree/branch using the literal no-hook Git form.
3. Write tests first and observe RED.
4. Implement minimum code/templates/docs.
5. Observe GREEN.
6. Run full applicable Workplane tests, Python/static checks and `git diff --check`.
7. Run secret hygiene against new source and fixtures.
8. Commit only exact R0A files in the isolated Worktree.
9. Parent reads committed bytes, schemas, units, tests and results.
10. Generate the final R1 Markdown prompt, generate/schema-validate `final-r1-prompt.contract.json`, run the named deterministic Markdown contract validator, then hash the prompt bytes.
11. Generate the immutable R0A review manifest last, binding:
    - Workplane base/commit/tree;
    - Hermes commit/tree and exact consumed-file hashes;
    - every source/unit/schema/test hash;
    - literal future installation commands;
    - plan and R0A prompt commit/tree/hashes;
    - test commands and result hashes.
12. Validate the pre-edit input manifest, final R1 prompt, evidence root and review manifest against schemas and the binding graph.
13. Commit only the exact application output paths from the isolated application worktree using the owner-only empty-hooks procedure.
14. Stop. Do not install or execute R1.

## Required reviews after R0A

Dispatch three fresh independent reviews against the complete application, Workplane and Hermes-dependency tuple:

1. code, test and unit correctness;
2. operational/kernel/systemd/SQLite feasibility;
3. security, approval, rollback and data-loss resistance.

All must return PASS. A timeout is not PASS. Any edit invalidates all reviews.

Only after PASS may Omar, through a separate operator shell and private signing key, authorise installation/broker setup and later sign the exact final R1 authorisation bytes.

## Final response

Return exactly one strict RFC 8785/JCS JSON object and no prose outside it. Do **not** copy a union-valued JSON pseudo-template. Construct the concrete object only after the application commit exists, validate it with `ops/hermes-state-maintenance/schemas/callscore-r0a-preparation-result-v1.schema.json`, and emit the exact canonical bytes that validated.

Required top-level fields are: `schema`, `status`, `r0b_allowed`, `kernel_fence_integration_status`, `kernel_fence_green_claimed`, `observations`, `empty_hooks_proof`, `hermes_dependency`, `workplane`, `application_repo`, `tests`, `review_manifest`, `blockers`, `next_action` and `langfuse_checked`. Tuple/file objects contain actual nonempty paths, commits, trees and SHA-256 values; placeholders and union strings are forbidden.

`observations` has exactly these keys: `live_state`, `systemd`, `cron`, `snapshot`, `session_prune`, `production_database`, `provider`, `public`, `credentials`, `deployment`, `external_index`, `git_hooks` and `sudo`. Every observation is an object with exactly `state` (`false|true|unknown`) and a nonempty `evidence_refs` array. Evidence references must point to the command/audit/pre-post records that prove that specific field; a generic unassigned evidence list is invalid. Missing, incomplete or contradictory evidence leaves that field `unknown`.

The result schema enforces three disjoint status branches:

- `prepared`: `r0b_allowed=true`; `kernel_fence_integration_status=pending_r0c`; `kernel_fence_green_claimed=false`; all required RED/GREEN/static/schema/secret/binding checks passed; every forbidden observation is evidence-backed `false`; `blockers=[]`; and `next_action` authorises only three independent exact-tuple R0B reviews.
- `blocked`: `r0b_allowed=false`; no kernel-fence pass claim; at least one concrete blocker code such as `blocked_preparation_gap`; any unproven observation remains `unknown`; and `next_action` is remediation only.
- `failed`: `r0b_allowed=false`; no kernel-fence pass claim; at least one concrete failure code; every detected forbidden mutation is `true` with dedicated evidence; and `next_action` is containment/remediation only.

R0A may never report kernel-fence integration `pass`. No observation defaults to `false`. Schema-validation failure of the final response is itself `failed_result_contract` and must be corrected before returning.
