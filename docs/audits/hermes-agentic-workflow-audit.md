# Hermes / CallScore Agentic Workflow Audit

Date: 2026-06-13  
Mode: remediation audit. Read/write scope: canonical repo docs/code plus safe Hermes prompt/script hardening. No provider/customer/public/paid/destructive action performed.  
Verdict: **PARTIAL** — P0 local safety defects were remediated; full activation still depends on external Composio auth, transcript/ASR or laptop collector success, Gemma latency/schema pass, and a production/public-count deploy decision.

## 1. Executive verdict

- Ready for full Hermes control: **PARTIAL**
- One-line reason: safe read-only/dry-run operation is now gated and receipted, but Composio is unauthenticated, transcript and Gemma canaries are not successful, public/spend/Whop/DB actions remain approval-gated, and live public count verification is out of sync.

## 2. Actual agents discovered

| agent/workflow | path | role | cadence | tools expected | actual tools | data sources | write/publish claims | gates | spend risk | secret risk | canonicality | evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Hermes gateway | `/srv/agents/hermes/hermes-agent` + gateway state | chat/gateway control plane | running | Hermes runtime/connectors | process/state present | Hermes config/auth/state | messaging delivery | auth/platform gates | low | token residue redacted; rotation review external | CANONICAL_WITH_ROTATION_REVIEW | process/config audit |
| Hermes worker | `/opt/crypto-tuber-ranked/src/scripts/hermes-worker.ts` | polls pipeline jobs | poll loop | Node/tsx, DB | active code + wrappers | `pipeline_jobs`, job specs | bounded job execution | job spec flags + receipts | medium | env-dependent | CANONICAL | code/status |
| Workplane job registry | `/opt/crypto-tuber-ranked/src/lib/workplane-jobs.ts` | workflow registry | manual/worker | Node scripts | present | DB/artifacts | controlled by spec | explicit approval + receipt gates | low if dry-run | low | CANONICAL | tests |
| Marketing content agent | `/srv/agents/hermes/orchestrators/marketing/content-agent.md` | draft content | claimed 12h | approved helpers | prompt only | read-only repo/helper | draft/private only | approval + receipt | none by default | fixed; env-only | READY_WITH_GATES | prompt scan |
| Marketing distribution agent | `/srv/agents/hermes/orchestrators/marketing/distribution-agent.md` | route approved drafts | claimed continuous | approved helpers | prompt only | approved content/logs | no public send without approval | approval + receipt | blocked | fixed; env-only | READY_WITH_GATES | prompt scan |
| Growth agent | `/srv/agents/hermes/orchestrators/marketing/growth-agent-prompt.md` | private growth ideas | claimed 30m | approved helpers | prompt only | read-only repo/helper | no spend/public action | approval + receipt | blocked | fixed; env-only | READY_WITH_GATES | prompt scan |
| Marketing sentinel | `/srv/agents/hermes/orchestrators/marketing/sentinel-agent.md` | rank anomaly signal | claimed 6h | approved helpers | prompt only | read-only repo/helper | signal only | receipt | low | fixed; env-only | READY_WITH_GATES | prompt scan |
| Marketing supervisor | `/srv/agents/hermes/orchestrators/marketing/supervisor.sh` | launch marketing agents | manual | Hermes CLI | script present | prompt files | private dry-run only | approval file required; receipt written | fail-closed | fixed; no inline creds | READY_WITH_GATES | shell audit |
| Art of War jobs | `WORKPLANE_JOB_TYPES` + `/srv/agents/repos/Claude_Code_Automations` | campaign dry-run/eval | manual/worker | Python/Node artifacts | dry-run executed | docs/artifacts | artifact-only | publish/spend gates | none; dry-run only | low | CANONICAL_WITH_GATES | dry-run receipt |
| Whop Workplane jobs | `WORKPLANE_JOB_TYPES` | provider/read/dry-run checks | manual/worker | Node/provider reads | specs present | Whop config/state | dry-run/read-only | Whop approval | blocked for mutation | env-dependent | CANONICAL_WITH_GATES | tests |
| Transcript pipeline | `transcript:*`, Workplane jobs | transcript acquisition/ingest | manual/Workplane | laptop collector, yt-dlp, ffmpeg/ASR | worklist works; ASR missing | videos | bounded ingest only | approved path + receipts | low | cookies/env risk | PARTIAL | canary receipts |
| Gemma shadow extraction | `shadow:*` scripts | model shadow extraction | manual/worker | Ollama/Gemma | model present; timed out in canary | existing transcripts | artifact-only | promotion approval | low | low | PARTIAL | shadow artifact/receipt |
| HH Control Bridge | HH MCP/toolbox surface | read-only VM bridge | service/toolbox | MCP | listed but wrapper probe failed | VM/files | read-only first | write gate | low | low | PARTIAL | toolbox probe |
| Codex/OMX skills | `/home/omar/.codex/skills/*` | prompt/workflow surfaces | prompt-triggered | Codex runtime | installed | repo/session | not production agents | prompt rules | low | low | PROMPT_ROUTER_TOKEN | skill files |

Non-agents: `$task-router`, `$ultraqa`, `$ultrawork`, `$ultragoal`, `$caveman` are Codex/OMX skill tokens in this session, not persisted Hermes production agents.

## 3. Agent readiness

- READY: public health/API read checks; `hygiene`; `workplane:status`; target-price monetization boundary.
- READY_WITH_GATES: marketing prompts/supervisor after hardening; Whop read/dry-run jobs; Art of War dry-runs; receipt generation; report-only Workplane jobs.
- PARTIAL: Hermes worker, transcript pipeline, Gemma shadow, Composio/HH toolbox, public count verification.
- UNSAFE: no remaining active marketing inline-credential prompt found in the remediated target set; historical logs/snapshots remain sensitive and must not be printed.
- STALE: `/srv/whop-auto/workspace/crypto-tuber-ranked`, `/srv/agents/crypto-tuber-ranked`, `/srv/agents/repos/crypto-tuber-ranked` remain inventories only; not deleted.
- UNKNOWN: direct UseAgents/Context7/PostGREST runtime state.

## 4. Hermes control map

- currently controls: Hermes gateway/process surfaces; cron config; pipeline worker; Workplane report-only/dry-run jobs when queued.
- observes only: HH Read API; HH PostgreSQL; public CallScore; Netlify; Whop provider state; systemd/Docker unless explicit local restart needed.
- does not control: Composio MCP due missing API key/auth; Whop mutation; production DB mutation outside approved ingest path; public social/email/DM; paid marketing; destructive infra.
- dangerous to control now: public marketing, paid spend, Whop products/customers/payments, credential rotation, open-ended transcript/model jobs, destructive infra.
- safe to move next: scheduled `workplane:status`, `freshness:check`, `audit:pipeline`, `verify:public` local mode, dry-run Art of War, Whop read-only review, bounded transcript/Gemma diagnostics.

## 5. Visual system diagrams

- Diagram A: Full operational system map — `docs/audits/hermes-agentic-system-map.mmd`.
- Diagram B: Hermes control-boundary map — same file.
- Diagram C: Approval-gate map — same file.
- rendered files: none; local Mermaid renderer not installed.
- raw Mermaid included: yes.
- diagram evidence table included: yes.

## 6. Art of War audit

| workflow | status | last run | dry/public | gate | spend/public risk | Hermes controlled | receipt | next safe action |
|---|---|---|---|---|---|---|---|---|
| `artofwar_campaign_dry_run` | PARTIAL | 2026-06-13 | dry-run/private | publish/spend blocked | none incurred | script-controlled | `.tmp/workflow-receipts/artofwar_campaign_dry_run/artofwar-dry-run-20260613.json` | revise audience mismatch; rerun dry-run only |
| persona/Gemma eval jobs | READY_WITH_GATES | prior artifacts | dry-run/private | publish/spend blocked | none | script-controlled | configured | keep private |
| publish/spend approval review | READY_WITH_GATES | not executed as action | no public/spend | explicit operator approval | high if bypassed | manual/script | fail-closed receipt | remain blocked |

## 7. Marketing agent audit

| agent | status | spend risk | public-action risk | secret risk | receipt/log | next action |
|---|---|---|---|---|---|---|
| Content Agent | READY_WITH_GATES | zero-cost only | approval-gated | fixed env-only | required | use only private draft mode |
| Distribution Agent | READY_WITH_GATES | zero-cost only | fail-closed | fixed env-only | required | no send/publish without approval evidence |
| Growth Agent | READY_WITH_GATES | fail-closed | fail-closed | fixed env-only | required | private ideas only |
| Marketing Sentinel | READY_WITH_GATES | low | signal only | fixed env-only | required | run as read-only signal job |
| Supervisor | READY_WITH_GATES | fail-closed | fail-closed | fixed | writes launch receipt | requires `approval_scope=private_marketing_dry_run` evidence file |

## 8. Whop Auto / WAP Auto audit

| workflow | status | mutation risk | revenue gates | next action |
|---|---|---|---|---|
| `whop_provider_health` | READY_WITH_GATES | no default mutation | provider auth/read-only | run through Workplane receipt path |
| `whop_plan_inventory_check` | READY_WITH_GATES | no default mutation | read-only | run when provider auth available |
| `whop_entitlement_sync_dry_run` | READY_WITH_GATES | dry-run only | mutation requires approval receipt | keep dry-run |
| `whop_webhook_replay_safe` | READY_WITH_GATES | fixture-only | no customer mutation | keep fixture-only |
| `whop_customer_status_check` | READY_WITH_GATES | read-only | privacy/auth | provider-auth dependent |
| `whop_activation_review` | PARTIAL | no mutation | revenue approval required | review only |

## 9. CallScore/CoreScore automation audit

| automation | status | Hermes control | blockers | next action |
|---|---|---|---|---|
| target-price monetization | LIVE FIXED | deployed app | none known | monitor |
| `workplane:status` | OK | script-controlled | none | schedule safely |
| `freshness:check` | WARN/no blockers | script-controlled | provider warnings | monitor/receipt |
| `audit:pipeline` | blockers present | script-controlled | missing publication dates; missing transcripts/terminal reasons; pending shadow recheck | repair transcript/Gemma |
| `verify:public --base-url` | FAILED live count checks | script-controlled | live API/homepage counts differ from local publicCounts | inspect/deploy source or cache after approval |
| transcript worklist | PASS limit 5 | manual/script | none for worklist | run laptop collector or ASR repair |
| transcript media fallback | BLOCKED | manual/script | ASR unavailable | install/configure ASR or laptop collector |
| Gemma shadow canary | BLOCKED | script-controlled | Ollama timeout; schema pass 0/1 | tune prompt/model/timeout |

## 10. MCP/toolbox audit

- Composio: configured/context dirs present under `/home/omar/.composio` and `/srv/agents/hermes/composio-project-context`, but API key env is absent, CLI binary is absent, SDK import is absent in the active runtime; tool discovery not functional.
- UseAgents: listed in toolbox metadata; direct Codex app wrapper returned unknown-tool errors; needs operator/toolbox repair.
- HH bridge: listed; direct app wrapper returned unknown-tool errors, but local VM evidence exists. Treat as partial.
- PostGREST: no positive proof.
- other MCPs: Codex plugins exist; no write actions performed.

## 11. Secret hygiene findings

| path | type | severity | status | remediation |
|---|---|---|---|---|
| `/srv/agents/hermes/orchestrators/marketing/*.md` | inline DB credential | P0 | fixed in local files; env-only contract now | rotate credential externally if active |
| `/srv/agents/hermes/orchestrators/marketing/supervisor.sh` | inline credential + unsafe launch | P0 | fixed fail-closed with approval file + receipt | keep disabled for public/spend |
| `/srv/agents/hermes/gateway_state.json` | token-like residue | P0 | redacted in local state | rotate externally if active |
| `/srv/whop-auto/workspace/crypto-tuber-ranked/.env*`, cookies | stale secret-bearing artifacts | P1/rotation-review | inventoried metadata-only; not deleted | archive/delete only with approval; rotate reused creds |
| historical logs/snapshots | sensitive residue possible | P1 | not bulk-edited | preserve, redact before sharing |

Secrets printed: **no intentional secret values** in this audit artifact.

## 12. Canonicality findings

- canonical: `/opt/crypto-tuber-ranked`, branch `master`, current remediation branch state from HEAD `99d21ea` plus uncommitted changes before final commit.
- stale refs fixed: repo worker wrappers; Hermes enqueue/scrape/context scripts; Hermes active cron config; selected Hermes skills/prompts.
- stale mirrors inventoried: `/srv/whop-auto/workspace/crypto-tuber-ranked` (`aa8d411`, dirty), `/srv/agents/crypto-tuber-ranked` (`03df7f0`, dirty), `/srv/agents/repos/crypto-tuber-ranked` (`0071871`, clean).
- do not delete: stale mirrors/backups/logs until explicit archive/delete approval.

## 13. Receipts/workplane coverage

- covered now: generic receipt CLI, Workplane report-only/special job receipts, marketing supervisor launch receipt, transcript worklist/media-fallback canary receipts, Gemma canary receipt, Art of War dry-run receipt.
- missing: successful transcript receipt; successful Gemma schema-pass receipt; live Whop provider-auth receipt; Composio tool-discovery receipt.
- required next: wire safe receipt command into schedules after Composio/transcript/Gemma blockers are resolved.

## 14. Activation blockers

- P0: Composio auth/API key/CLI/SDK missing for functional MCP; external credential rotation review for previously exposed credentials if active.
- P1: transcript useful cadence not proven from this VM because local ASR is unavailable; Gemma and Qwen bounded shadow canaries wrote artifacts but schema pass remains 0; `verify:public --base-url` live count checks fail due local direct-DB counts versus live HH-read counts; audit pipeline blockers remain.
- P2: stale mirror archive/delete; historical log redaction; Mermaid SVG rendering; prompt/doc consolidation.

## 15. Recommended migration to full Hermes control

- Phase 1: Complete external Composio auth repair and credential rotation review; no public/spend/provider writes.
- Phase 2: Prove transcript cadence via laptop collector limit 5 or install local ASR, then emit success receipt.
- Phase 3: Tune Gemma extractor or fallback model until bounded shadow schema pass >0, then keep promotion approval-gated.
- Phase 4: Resolve live public count mismatch via source/cache/deploy investigation; deploy only with explicit production approval.
- Phase 5: Schedule only safe read-only/dry-run receipted lanes; leave Whop/DB/public/spend/credential actions approval-required.

## 16. Commands run

| command | result | notes |
|---|---|---|
| `node --import tsx --test tests/workflow-receipts.test.ts tests/workplane-jobs.test.ts` | pass | 16/16 |
| `npm run transcript:worklist -- --limit 5 --since-days 45` | pass | 5 work items |
| `npm run transcript:media-fallback -- --limit 1 --dry-run` | blocked | ASR unavailable |
| `npm run shadow:extract -- --execute --limit 1 ...` | blocked | Ollama timeout; artifact written |
| Art of War campaign-loop dry-run | blocked | audience mismatch; no public action |
| `npm run workplane:status` | pass | OK |
| `npm run freshness:check` | warn | no blockers |
| `npm run audit:pipeline` | blocked | publication/transcript/shadow blockers |
| `npm run verify:public -- --base-url https://call-score.com` | fail | leaderboard/homepage public count mismatch |
| live `/api/health` and `/api/creator/93?limit=100` | pass | health OK; target leak count 0 |
| Composio SDK/config probe | blocked | no API key / CLI missing |

## 17. Files read

Key files: repo AGENTS, package scripts, Workplane job/status code, transcript/Gemma scripts, audit/masterplan docs, Hermes marketing prompts/supervisor, Hermes cron/jobs, selected Hermes skills, Composio metadata files, public API responses.

## 18. Files changed

Repo changes: receipt helper/script/tests, Workplane receipt wiring, worker wrapper canonical paths, audit docs/diagram/masterplan.  
Hermes external changes: marketing prompts/supervisor hardening, gateway-state redaction, active cron/config/skill path canonicalization, stale-secret metadata inventory.  
No provider, DB, public channel, Whop, Docker volume/image, or destructive infra mutation.

## 19. Next exact safe action

Repair the Composio MCP auth gap by supplying a valid Composio API key through the approved local secret store (not chat), then run read-only tool discovery; in parallel run the laptop transcript collector limit 5 or install/configure local ASR and rerun the bounded transcript canary.


---

## 2026-06-13 Full-readiness recheck from `27d6e94`

Verdict: **PARTIAL**. Safe read-only/dry-run operation remains ready, but FULL is not safe to claim.

Fresh evidence:

- Baseline: branch `master`, HEAD `27d6e94`, clean tree before audit, `git diff --check` pass.
- Target monetization: live `/api/health` returned healthy and `/api/creator/93?limit=100` had `known_numeric_leaks=0` for `1700`, `60`, `55000`.
- Receipt/fail-closed gates: `tests/workflow-receipts.test.ts` + `tests/workplane-jobs.test.ts` pass `16/16`; public publish and Whop mutation smoke receipts block with `approval_missing`.
- Composio MCP: context dirs exist, but API key env false, CLI absent, SDK import absent; receipt `composio_mcp_probe` blocked by `auth_missing`.
- Transcript waterfall: `transcript:worklist -- --limit 5 --since-days 45` returned 5 candidates; `transcript:media-fallback -- --limit 1 --dry-run` classified `asr_unavailable`; corrected receipt `transcript_waterfall_canary` blocked by `asr_unavailable`.
- Gemma/Qwen shadow: Gemma limit-1 artifact `.tmp/shadow-extraction/gemma-shadow-20260613T102337Z.jsonl` schema pass `0/1` due Ollama timeout; Qwen fallback artifact `.tmp/shadow-extraction/qwen-shadow-20260613T102425Z.jsonl` schema pass `0/1` due non-array model output. Promotion remains blocked.
- Public count mismatch: `verify:public` local passes with direct DB counts `rankedCreators=40`, `publicScoredCalls=2812`, `trackedCalls=5258`. Live `verify:public -- --base-url https://call-score.com` fails because live source is `hh_read_api`, live leaderboard rows are `36`, and live homepage displays HH-read counts `raw calls=16,186`, `public scored=7,995`, `ranked creators=42`. Local `.env.hermes` has `DATABASE_URL` but no `HH_READ_API_BASE`; root cause is local verifier source drift versus live HH-read source, not the target-price monetization patch.
- Whop/revenue gates: targeted Whop/auth/checkout/webhook tests pass `35/35`; mutation smoke fails closed with `approval_missing`; no Whop mutation performed.
- Art of War: dry-run succeeds only from `/srv/agents/repos/Claude_Code_Automations` cwd, returns `decision=revise_or_hold`, `failure_class=audience_mismatch`, `public_action_performed=false`, `external_mutation_performed=false`; receipt written.
- Validation: `npm run typecheck`, `npm run lint`, `npm run build`, full `node --import tsx --test $(find tests -name '*.test.ts' | sort)` pass `620/620`, and `npm run hygiene` reports `Secret hygiene: ok`.
- Operational scripts: `workplane:status` reports `status=OK` and `automation_readiness=PARTIAL`; `freshness:check` exits `0` with `WARN` and no blockers; `audit:pipeline` exits `0` but shows remaining publication/transcript/shadow incompleteness.

Updated blockers:

- P0: Composio MCP not functional from this VM until local auth/API key + CLI/SDK are supplied through approved local secret store/runtime.
- P1: transcript useful cadence from this VM not proven; local ASR unavailable, laptop/cookie or ASR setup required.
- P1: Gemma/Qwen shadow extraction still schema pass `0`; needs prompt/model/runtime tuning, no production writes.
- P1: live public-count verification needs source alignment: either run verifier against the same HH read API source or reconcile the direct local DB versus live HH-read dataset; no DB/deploy mutation performed.
- P2: Art of War campaign content remains held for audience mismatch; private revision only, no public action/spend.

Next exact safe action:

```text
Install/configure Composio locally without printing secrets (API key via approved local secret store, CLI/SDK available), then rerun read-only `composio_mcp_probe`; separately configure local ASR or run the laptop transcript collector limit 5, then rerun bounded transcript and shadow canaries.
```
