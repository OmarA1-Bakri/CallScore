# CallScore Hermes runtime patches

This directory is the CallScore-owned integration boundary for narrowly scoped
Hermes runtime fixes that CallScore must control independently of upstream
acceptance.

Each patch bundle pins the exact upstream commit/tree, patch SHA-256, and target
file hashes before and after application. Apply or verify a bundle with:

```bash
python3 scripts/apply-callscore-hermes-patch.py \
  --manifest ops/hermes-runtime-patches/<bundle>/manifest.json \
  --runtime-repo /srv/agents/hermes/hermes-agent \
  --check
```

Use `--apply` only through an approved CallScore runtime maintenance path. The
installer fails closed on upstream-anchor drift, patch drift, or mixed target
state. No secret values, environment files, caches, or credentials belong in a
patch bundle.
