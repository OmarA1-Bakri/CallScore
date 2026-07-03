# CallScore Workflow Rerun Visible Artifacts Plan

> For Hermes: execute this as a bounded, no-public-mutation artifact-rerun sprint. Use CallScore canonical runtime gates, parent verification, and the Windows Downloads ZIP delivery skill.

Goal: rerun the safe CallScore creative/taste and artifact-gallery workflows so Omar can inspect actual generated artifacts, receipts, logs, plan, task list, and package evidence in a Windows Downloads ZIP.

Architecture: This is an artifact-only rerun. It invokes local tests, dry-run/receipt-producing workflow surfaces, and package builders; it must not publish, send email/DM, mutate providers, mutate DB/deploy/infra, or alter canonical agent mapping. Outputs are written under `/srv/agents/hermes/profiles/callscore/artifacts/` and copied to `C:\Users\albak\Downloads` by Tailscale Taildrop.

Tech Stack: Node/tsx tests, npm scripts, Hermes kanban/todo, Python packaging, zip/unzip/sha256sum, Tailscale Taildrop.

---

## Current baseline

- Repo: `/opt/crypto-tuber-ranked`
- Current head when plan was created: `4278fc9`
- Worktree at plan creation: clean
- Preserved out-of-scope stash: `stash@{0}: callscore creative taste T6 quarantine 20260703T015802Z`
- Prior creative/taste verification status: plan review PASS, implementation review PASS, clean security re-review PASS
- Previous ZIP sent: `creative-taste-outputs-20260703T021555Z.zip`

## Hard constraints

- No public/provider/social mutation.
- No email/DM/newsletter sends.
- No Whop/payment/customer/provider mutation.
- No DB writes, migrations, deploys, infra changes, credential edits, destructive actions, or secret printing.
- Do not apply or pop the quarantined provider/graph stash.
- Do not edit canonical 51-agent mapping/runtime/souls.
- Treat visible artifacts as files, screenshots/logs/receipts, and ZIP contents — not live public posts.
- If a workflow would require live mutation, run dry-run/preflight only and write a blocked/cooldown receipt.

## Expected output directory

Create a fresh run directory:

`/srv/agents/hermes/profiles/callscore/artifacts/workflow-rerun-visible-artifacts-<UTCSTAMP>/`

Required subdirectories:

- `plan/`
- `task-list/`
- `workflow-runs/`
- `creative-taste/`
- `receipts/`
- `logs/`
- `reviews/`
- `zip/`

## Task list

### T0: Freeze baseline and create run directory

Objective: prove the rerun starts from a clean, bounded state.

Commands:

```bash
cd /opt/crypto-tuber-ranked
git status --short
git rev-parse --short HEAD
git stash list | sed -n '1,5p'
/usr/bin/python3 /srv/agents/hermes/scripts/callscore-canonical-agent-audit.py
```

Expected:

- `git status --short` is empty.
- Head is recorded.
- Canonical audit reports `status: ok`, `canonical_total_mapped: 51`.

Artifacts:

- `logs/baseline.txt`
- `logs/canonical-audit.json`

### T1: Export plan and task-list artifacts

Objective: make the plan and task list inspectable inside the final package.

Artifacts:

- `plan/2026-07-03-rerun-workflows-visible-artifacts.md`
- `task-list/todos.json`
- `task-list/todos.txt`
- `task-list/kanban-snapshot.txt`

Verification:

- Files exist and are non-empty.

### T2: Rerun creative/taste focused workflow checks

Objective: rerun the workflow checks that produced the creative/taste artifacts and blockers.

Command:

```bash
node --import tsx --test \
  tests/creative-taste-gate.test.ts \
  tests/public-artifact-provenance.test.ts \
  tests/content-quality-gate-regression.test.ts \
  tests/social-originality-gate.test.ts \
  tests/gtm-complete-execution.test.ts
```

Expected:

- Focused suite passes.
- Latest known count: `57/57 pass`; accept changed count only if explained by repo changes.

Artifacts:

- `logs/focused-workflow-tests.log`
- `creative-taste/creative-taste-gate.ts`
- `creative-taste/public-artifact-provenance.ts`
- `creative-taste/*test.ts`

### T3: Rerun static safety gates

Objective: prove the artifact-only rerun is still safe.

Commands:

```bash
npm run typecheck
python3 -m py_compile /srv/agents/hermes/scripts/callscore-content-quality-gate.py
sha256sum /srv/agents/hermes/scripts/callscore-content-quality-gate.py
```

Artifacts:

- `logs/typecheck.log`
- `logs/python-quality-gate-compile.log`
- `logs/quality-gate-sha256.txt`

### T4: Rerun or capture dry-run workflow surfaces

Objective: create inspectable workflow output without live mutation.

Allowed surfaces:

- Existing npm dry-run/preflight scripts if present.
- Existing `npm run operating:goal` dry-run paths if they do not publish or mutate.
- Existing artifact-gallery/package builders if they are local-only.

Procedure:

1. Discover candidate scripts with `npm run` and repository search.
2. Run only local/dry-run artifact producers.
3. If a workflow lane is blocked by missing provider/live gate, write a blocked receipt rather than bypassing.

Artifacts:

- `workflow-runs/<lane>/stdout.log`
- `workflow-runs/<lane>/stderr.log`
- `workflow-runs/<lane>/receipt.json`
- `workflow-runs/<lane>/artifacts/*`

### T5: Build visible artifact gallery/index

Objective: produce human-readable inventory so Omar can see what was created.

Artifacts:

- `index.json`
- `README.md`
- `SHA256SUMS`
- `logs/package-secret-scan.json`
- `logs/package-mutation-scan.json`

Requirements:

- `index.json` lists every file, size, SHA256, and lane.
- README explains which artifacts are real rerun outputs vs copied source/evidence.
- Secret scan returns pass or explicit findings; package must not include secrets.
- Mutation scan confirms no provider/social/DB/deploy mutation execution.

### T6: Package and verify ZIP

Objective: create a self-contained ZIP and verify it opens.

Commands:

```bash
zip -qr <run-dir>.zip <run-dir-name>
unzip -t <run-dir>.zip
sha256sum <run-dir>.zip
```

Artifacts:

- `<run-dir>.zip`
- `receipts/local-zip-receipt.json`

### T7: Send ZIP to Windows Downloads

Objective: deliver the final ZIP to Omar's Windows Downloads folder.

Command:

```bash
tailscale file cp --name <zip-basename> <zip-path> omarslaptop:
```

Expected:

- Taildrop exit code 0.
- Target path: `C:\Users\albak\Downloads\<zip-basename>`.
- Remote checksum verification attempted by non-interactive SSH only; if unavailable, record that Taildrop succeeded but remote hash was not verified.

Artifacts:

- `receipts/taildrop-transfer-receipt.json`

### T8: Final report

Objective: report the exact artifacts and evidence.

Final response must include:

- ZIP path on Windows.
- Source ZIP path on Linux.
- SHA256.
- Receipt path.
- Whether remote checksum was verified.
- Any blockers/cooldowns encountered.

## Acceptance criteria

- Fresh plan exists and is committed or explicitly listed as uncommitted if not committed.
- Task list exists in Hermes todo and package artifacts.
- Workflows are rerun or blocked with receipt-backed reason.
- Focused checks and canonical audit pass.
- Package contains visible artifacts, not just code.
- ZIP is sent to `C:\Users\albak\Downloads` via Tailscale Taildrop.
- No public/provider/social mutation, no DB/deploy/secret/canonical-agent changes.
