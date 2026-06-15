# 2026-06-14 Full System Live-Canary Gate Decisions

Verdict target: `CONTROLLED_FULL` when core production is healthy, owned public organic GTM is `READY_PUBLIC_OWNED`, and historical/provider/restricted mutation gates are monitored or fail-closed by design.

## Gate decisions

| Gate | Prior state | Evidence reviewed / command | Receipt | New state | Rollback path | Owner if blocked |
| --- | --- | --- | --- | --- | --- | --- |
| Transcript/audit backlog | Hard PARTIAL via `missing_transcripts_or_terminal_reasons` and latest 429 | Canonical laptop/Tailscale/Firefox/yt-dlp cadence has multiple successful receipts; latest bounded batch processed 1 available + 1 terminal row then hit HTTP 429; Workplane now waits instead of hammering | `.tmp/workflow-receipts/transcript_laptop_cadence/laptop-limit25-rate-stop-20260614T112708Z.json` | `DOWNGRADED_TO_MONITORED` | Restore transcript backlog as hard blocker if laptop cadence cannot produce useful transcripts after cooldown or starts unsafe retrying | Hermes/CallScore operator |
| Gemma/Qwen manual_review diff | Hard/manual PARTIAL | Latest `gemma-final-shadow-20260614T110138Z.diff.jsonl` has 5 `manual_review` rows, all reason `transcript_not_fully_covered`, with zero missing official and zero extra shadow calls; broad promotion remains fail-closed | `.tmp/workflow-receipts/gemma_diff_classification/gemma-diff-classification-20260614T120000Z.json` | `DOWNGRADED_TO_MONITORED` | Restore hard manual-review blocker if future diff has missing/extra calls, schema break, or prompt bug | ML/extraction operator |
| Art of War owned public publish | Hard approval-gated public action | Private canary reached `approval_packet_ready`; persona scorecard passed; no external mutation, no spend; 2026-06-15 policy now authorizes owned CallScore organic posts by default when safe and inside messaging policy | `/tmp/callscore-art-of-war-canary.json`; Art repo commit `bf5233d`; registry `READY_PUBLIC_OWNED` rows | `RELEASED` to `READY_PUBLIC_OWNED` for owned zero-cost organic posts; email/DM/outreach, non-owned, paid, provider/customer/payment, and restricted claims remain `KEEP_FAIL_CLOSED` | Revert registry/skill policy commit if owned posts violate messaging policy; delete/retract post and record rollback receipt after any live post | Marketing/operator |
| Whop/provider mutation | Hard PARTIAL | Whop tests passed 16/16; existing zero-dollar/token-discount Pro renewal proof remains valid checkout/payment authorization evidence; manifest/diff/rollback/receipt gates remain required for mutation | `.tmp/workflow-receipts/whop_live_purchase_proof/whop-zero-dollar-pro-renewal-screenshot-20260614T065913Z.json`; prior Whop receipts; command `node --import tsx --test tests/whop-certification-pack.test.ts tests/infrastructure-canonical.test.ts tests/whop*.test.ts` | `DOWNGRADED_TO_MONITORED`; pricing/product/customer/payment mutations remain `KEEP_FAIL_CLOSED` | Re-enable hard Whop blocker if entitlement tests fail, proof is invalidated, or mutation gate opens without receipt | Revenue/operator |
| Composio connected apps | Optional/uncertain | Direct MCP initialize/tools-list passed; app inventory read-only list returned Attio, Gmail, Twitter/X, PostHog, LinkedIn, Discord active and Hugging Face initiated/Auth-blocked through Composio; Hugging Face plugin auth remains separate | `.tmp/workflow-receipts/composio_mcp_inventory/composio-mcp-inventory-20260614T120000Z.json`; `.tmp/workflow-receipts/composio_app_inventory/composio-app-inventory-20260614T120000Z.json` | `DOWNGRADED_TO_MONITORED`; Hugging Face through Composio remains non-core setup gap | Treat Composio as nonessential if MCP auth fails; no sends/posts/writes without gate | Tooling/operator |
| Workplane readiness | PARTIAL | `npm run workplane` after patch reports `status=OK`, `automation_readiness=CONTROLLED_FULL`, all non-core public/provider/backlog gates monitored, no blockers | generated `/tmp/callscore-workplane-after.json` during run | `RELEASED` to `CONTROLLED_FULL` model | Restore PARTIAL if any domain becomes `PARTIAL`, `BLOCKED`, or `NOT_CONNECTED` for core website/data/readiness | Hermes/CallScore |

## Fail-closed gates retained

- Paid spend, paid ads, paid enrichment, paid APIs, paid LLM calls.
- Whop pricing/product/customer/payment mutation without manifest + diff + rollback + approval receipt + local auth + explicit safe classification.
- Owned CallScore organic X/LinkedIn/owned-community/SEO/Whop-copy posts are `READY_PUBLIC_OWNED` after messaging-policy pass and post-execution receipt. Email/DM/outreach, non-owned posting, public corrections, restricted claims, and unsafe public content still require approval receipt.
- Destructive SQL, destructive infra, broad DB backfill without bounded receipt, credential rotation, secret exposure.
- Hammer retry after provider HTTP 429.

## Current honest readiness

`CONTROLLED_FULL` is honest because the live website/read API/data path is healthy, transcript mechanism is proven, backlog and provider cooldown are monitored, Gemma broad promotion remains fail-closed, Whop dangerous mutations remain fail-closed, Art of War owned public actions are READY_PUBLIC_OWNED, and validation passes.


## 2026-06-15 default-public revenue activation update

Owned CallScore public organic GTM is no longer treated as approval-blocked by default. Registry rows can use `READY_PUBLIC_OWNED` when the channel is owned/managed, action is zero-cost, content passes canonical messaging policy, no email/DM/outreach occurs, no paid spend occurs, no financial/customer/payment/provider mutation occurs, no DB/deploy/infra mutation occurs, and no secrets are exposed. Post-execution receipts and read-only monitoring are required after publish. Restricted lanes remain fail-closed.
