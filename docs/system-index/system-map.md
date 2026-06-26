# CallScore System Index — First Pass

> O13 supersession: first-pass 2026-06-18 inventory snapshot. Current production entrypoints are graph-backed via `docs/ops/o13-production-entrypoint-inventory.md`; direct pipeline commands below are implementation/building-block evidence unless explicitly wrapped by operating goals.

Generated: 2026-06-18
Status: first-pass verified map; not a migration approval.

## Operating rule

No map, no migration. No test, no inclusion. No receipt, no trust.

## Canonical roles

- HHVM / Hermes Agent Box: canonical Postgres, HH Read API, Workplane, Gemma/Ollama, score/match/candle orchestration, and operational receipts.
- Netlify: customer-facing public web surface for `https://call-score.com`.
- OmarLaptop: residential YouTube transcript acquisition using local browser/cookies and laptop-side `yt-dlp`.
- Workplane: command rail and gate model, not the autonomous workforce.
- Named subagents/workflows: autonomous/specialist workforce, sourced primarily from `/srv/agents/repos/Claude_Code_Automations/agent_workflows` and `/srv/whop-auto/plugin/agent_workflows/whop_auto`.
- Gates/receipts/rollback: safety envelope for public, commercial, provider, DB, deploy, and financial mutations.

## Verified live state snapshot

- HH Control Bridge: healthy on `127.0.0.1:8787`; `/mcp` requires MCP Accept headers; `8811` inactive.
- Core CallScore: `/opt/crypto-tuber-ranked`, branch `master`, HEAD `cc4371c` when first checked.
- Workplane: `status=OK`, `automation_readiness=CONTROLLED_FULL` in the latest parent check.
- Daily systemd pipeline: active via `callscore-daily-pipeline.timer`.
- Public verify: `https://call-score.com` passes live health/leaderboard/homepage checks via HH Read API.
- Docker: `crypto-tuber-ranked-hermes-worker-1` and `crypto-tuber-ranked-ytdlp-pot-provider-1` running; ytdlp POT provider healthy.
- Gemma/Ollama: HH-local `127.0.0.1:11434`, model `callscore-gemma4-extractor:latest` available.
- Transcript lane: core health is not blocked, but transcript backlog/provider failures remain monitored WARN.
- Cloudflared: duplicate host processes plus one Docker tunnel observed; classify before cleanup.

## Current stabilization fixes

- Canonical laptop collector now supports native and WSL SSH/SCP transport modes in `scripts/windows/run-transcript-collector.ps1`.
- Laptop collector now classifies `impersonation_warning_threshold` so cooldown/stop behavior matches the safety contract.
- WSL transport docs added to `docs/ops/laptop-transcript-collector.md`.

## Non-approvals

This index does not approve:

- new clean repo creation;
- copying secrets or runtime state;
- deleting `.tmp`, logs, backups, or untracked files;
- killing/restarting duplicate cloudflared processes;
- changing provider/Whop/customer/payment state;
- production deploys;
- DB writes outside existing approved pipeline scripts;
- Gemma promotion into canonical calls.
