# CallScore Agentic Platform Architecture

This document is the narrative companion to the canonical diagram at [`docs/architecture/callscore-agentic-platform.mmd`](./callscore-agentic-platform.mmd). It is grounded in the current Workplane status, activation handover, gate decision receipts, Whop certification, and agent memory as of the controlled-full activation run.

## Canonical stance

- **Production hosting:** Netlify (`call-score.com`). Vercel is stale/defunct for production.
- **Production database/source:** local HH PostgreSQL exposed to the public product through the HH Read API. Neon is stale/defunct for production.
- **Transcript mechanism:** Omar laptop over Tailscale using residential browser cookies and laptop-side `yt-dlp`; HH direct `yt-dlp`/ASR/vpn-ytdlp is diagnostic/future fallback only.
- **Readiness model:** `CONTROLLED_FULL`. Core production is ready; non-core backlog/provider/public mutation gates are monitored or fail-closed by design.
- **Commercial proof:** the zero-dollar/token-discount CallScore Pro renewal proof is valid checkout/payment authorization evidence. Nonzero cash proof is not a blocker unless a future revenue-accounting audit explicitly requires it.

## Plane summary

| Plane | Canonical components | Current gate |
| --- | --- | --- |
| Public product | Netlify app, Next.js public/API routes, HH Read API | Core live verify passing |
| Data plane | local HH PostgreSQL, HH Read API, public-safe rows | Canonical source; no Neon production |
| Transcript collection | laptop/Tailscale/cookie-local `yt-dlp`, approved ingest path | Monitored backlog/cooldown; no hammer retry |
| Intelligence pipeline | extraction, matching, scoring, freshness/audit, Ollama Gemma/Qwen shadow/diff | Gemma writes and promotion remain receipt-gated |
| Agentic control | Hermes, Workplane, HH bridge, receipts, handovers, agentmemory | `CONTROLLED_FULL`; dangerous actions fail-closed |
| Commercial | `/srv/whop-auto`, Whop checkout/entitlements, Pro/Alpha gates | Entitlement/checkout proof recorded; provider mutations fail-closed |
| Growth | Art of War private dry-run/persona/preflight | Approval packet ready; public actions require approval receipt |
| Connected apps | Composio hub: Attio, Gmail, Twitter/X, PostHog, Hugging Face, LinkedIn, Discord | Read-only inventory; sends/posts/writes gated |

## End-to-end data flow

1. Creator/source discovery identifies creators and videos.
2. The canonical laptop collector retrieves transcripts via Tailscale/residential browser cookies and laptop-side `yt-dlp`.
3. Approved ingest writes transcript JSON/results into local HH PostgreSQL through bounded paths only.
4. Extraction parses calls/signals; local Ollama Gemma/Qwen runs artifact-only shadow/diff and write-canary paths when gates pass.
5. Matching normalizes symbols and pairs calls to market outcomes.
6. Scoring/freshness/audit produce public-safe creator/call rows.
7. HH Read API exposes the read-only public source to the Netlify app.
8. Whop gates Pro/Alpha monetization and entitlement paths.
9. Art of War and Composio support private growth workflows and read-only app inventory; public actions remain approval-gated.
10. Hermes/Workplane monitors receipts, handovers, gate decisions, cooldowns, and safe next actions.

## Current controlled-full gates

Released/monitored gates:

- transcript backlog and terminal-reason coverage while bounded worker cadence is working;
- provider `HTTP 429` cooldown when Workplane waits instead of retry hammering;
- Gemma manual-review deltas where current diff has zero missing/extra calls;
- Art of War private approval packet readiness;
- Composio app inventory gaps that are non-core to current product operation.

Fail-closed gates:

- paid spend, ads, enrichment, paid APIs, and paid LLMs;
- public posts/sends/outreach without approval receipt;
- Whop pricing/product/customer/payment mutation without manifest + diff + rollback + approval receipt + local auth + explicit safe classification;
- destructive SQL/infra, broad DB backfills without bounded receipt, credential rotation, secret exposure;
- hammer retry after provider `HTTP 429`.

## Operator first reads

1. [`README.md`](../../README.md)
2. [`docs/architecture/callscore-agentic-platform.mmd`](./callscore-agentic-platform.mmd)
3. [`docs/ops/2026-06-14-full-system-live-canary-gate-decisions.md`](../ops/2026-06-14-full-system-live-canary-gate-decisions.md)
4. [`docs/handovers/2026-06-14-hermes-agent-callscore-activation.md`](../handovers/2026-06-14-hermes-agent-callscore-activation.md)
5. `agentmemory` / `callscore-memory`
