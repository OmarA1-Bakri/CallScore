# CallScore Hermes runtime patches

This directory is the CallScore-owned integration boundary for narrowly scoped
Hermes runtime fixes that CallScore must control independently of upstream
acceptance.

Each patch bundle pins the exact upstream commit/tree, the patch SHA-256, and
target file hashes before and after application. Apply or verify a bundle with:

```bash
python3 scripts/apply-callscore-hermes-patch.py \
  --manifest ops/hermes-runtime-patches/<bundle>/manifest.json \
  --runtime-repo /home/omar/.hermes/hermes-agent \
  --check
```

Use `--apply` only through an approved CallScore runtime maintenance path. The
applicator fails closed on anchor drift before application, patch drift, or
mixed target state. An already-patched runtime is accepted only when every
target has its exact after-hash. It uses a process-free Git object reader and a
bounded text-patch engine; it does not invoke Git or a shell. No secret values,
environment files, caches, or credentials belong in a patch bundle.

CallScore owns this dependency-integration contract. Host-level user-systemd
unit installation and reconciliation belong to
`OmarA1-Bakri/Claude_Code_Automations`; they are intentionally not duplicated
in this application repository.
