# Hermes / CallScore Agentic Workflow Audit

Date: 2026-06-13  
Mode: remediation audit. Read/write scope: canonical repo docs/code plus safe Hermes prompt/script hardening. No provider/customer/public/paid/destructive action performed.  
Verdict: **PARTIAL** — safe read-only/dry-run operation is ready; full activation still depends on transcript cadence via laptop/ASR and refreshed Composio auth. Gemma/Qwen shadow is READY_WITH_GATES; public live HH-read verification and target-price safety pass.


## 2026-06-13 transcript blocker classification from `9a2a46b`

Strict status: **PARTIAL, safe-operation READY**.

Fresh evidence:

- Baseline before edits: `master` at `9a2a46b`, dirty only after the transcript-classification patch.
- Workplane status: `OK`, `automation_readiness=PARTIAL`; latest transcript job `1832` still attempted `5`, successes `0`, failures `5`, and opaque `transcript_failed` rows.
- Live public verification: `npm run verify:public -- --source live --base-url https://call-score.com` passed against HH-read source; live `/api/health` healthy; creator `93` leak count for `1700`, `60`, and `55000` remains `0`.
- HH yt-dlp bounded canary (`limit=1`, dry-run, no DB write) classified `bot_verification_required`.
- Transcript waterfall bounded canary (`limit=3`, dry-run, no DB write) returned `pending_handoff` with `reason=external_handoff_required`, `method=laptop_ytdlp`, and `previous_failure_reason=bot_verification_required`.
- HH media fallback bounded canary (`limit=1`, dry-run) classified `asr_unavailable`; `yt-dlp` and `ffmpeg` exist, but local ASR runtime is absent.
- Composio config/key variable presence was confirmed without printing values; isolated SDK probe reached auth checks but read-only tool discovery failed with `AuthenticationError`, so blocker is `auth_invalid_or_expired`.
- Whop/readiness targeted tests passed and mutation paths remain fail-closed; no Whop mutation.
- Art of War private dry-run produced `decision=revise_or_hold`, `failure_class=audience_mismatch`, `public_action_performed=false`, and `external_mutation_performed=false`.

Fixes in this pass:

- Preserve bounded failed-transcript detail in ingest instead of reducing all failures to opaque `transcript_failed`.
- Classify Python/yt-dlp/PowerShell tracebacks in laptop collector output as `collector_traceback`.
- Include `previous_failure_reason` in transcript handoff audit records.
- Respect explicit `--gap-ms 0` for media fallback canaries.

Receipts:

- `.tmp/workflow-receipts/transcript_waterfall_canary/transcript-waterfall-20260613T165222Z.json` — blocked by `bot_verification_required` / `external_handoff_required` / `laptop_runner_required`.
- `.tmp/workflow-receipts/composio_mcp_probe/composio-mcp-probe-20260613T165424Z.json` — blocked by `auth_invalid_or_expired`.
- `.tmp/workflow-receipts/artofwar_campaign_dry_run/artofwar-dry-run-20260613T165507Z.json` — private dry-run held for audience mismatch.

Validation after patch:

- `git diff --check`: pass.
- Targeted transcript/laptop tests: `53/53` pass.
- Targeted Workplane/receipt/Whop tests: `39/39` pass.
- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm run build`: pass.
- `npm run hygiene`: pass, `Secret hygiene: ok`.
- Full test sweep: `635/635` pass.
- Ops gates with approved local env: `workplane:status` OK/PARTIAL; `freshness:check` WARN/no blockers; `audit:pipeline` exit 0 with transcript/shadow/publication blockers; `verify:public` local pass; `verify:public -- --source live --base-url https://call-score.com` pass.
- Live health/creator check: `/api/health` ok via HH read API; creator `93` known target leak count `0`, with target outcomes preserved and numeric target prices null for public/free rows.

Updated blockers:

- P0: none for safe read-only/dry-run operation.
- P1: transcript useful cadence now has a successful bounded limit-1 laptop ingest; repeated limit-5 cadence and downstream extraction/matching/scoring verification remain; Composio read-only MCP needs refreshed local auth; Gemma promotion/write stays approval-gated.
- P2: stale mirror archive/delete and historical log redaction.

Next exact safe action:

```text
Run bounded laptop collector limit 5 through `C:\Users\albak\run-transcript-collector-fixed-wslssh.ps1` when cooldown is clear, then run approved bounded downstream extraction/matching/scoring verification; keep HH ASR fallback as future autonomy lane only.
```


## 2026-06-13 canonical laptop transcript path reactivation

Status: **PARTIAL -> transcript canary PASS for bounded limit 1**.

Fresh correction:

- Canonical transcript path is Omar laptop collector over Tailscale, certified by PR #64; HH direct yt-dlp/ASR are fallback diagnostics only.
- Tailscale peer `omarslaptop-1` / `100.118.20.40` is reachable from HH.
- HH access to laptop WSL works through the existing bridge key; Windows `ssh hh` was blocked, but WSL `ssh hermes-agent-box` works.
- User-provided fixed collector: `C:\Users\albak\run-transcript-collector-fixed.ps1`.
- Working copy created on laptop: `C:\Users\albak\run-transcript-collector-fixed-wslssh.ps1`, using explicit WSL SSH to HH.

Evidence:

- Laptop dry-run limit 1 fetched captions for `KQNpABBLxzs`, transcript length `3035` chars, no DB write.
- Laptop write limit 1 succeeded through approved HH ingest path: `records=1`, `updated=1`.
- HH Workplane latest transcript success moved to `2026-06-13 18:30:47.405219+01`.
- Fresh worklist no longer starts with `KQNpABBLxzs`; next pending items include `iUCCAQYntNw`, `OpGyIwR0rzA`, `X9gvhAEMuQ4`.
- Receipt: `.tmp/workflow-receipts/transcript_waterfall_canary/laptop-canonical-write1-20260613T173047Z.json`.

Safety:

- Cookies remained laptop-local.
- HH received transcript result only through the approved ingest path.
- No deploy, Whop mutation, public action, paid provider/API, broad DB write, destructive SQL, or destructive infra action.
- Downstream production extraction/matching/scoring intentionally not run in this pass.

Current remaining blocker:

- FULL still requires repeated bounded limit-5 laptop cadence plus approved downstream extraction/matching/scoring verification; Composio read-only MCP discovery still needs refreshed auth.

## 1. Executive verdict

- Ready for full Hermes control: **PARTIAL**
- One-line reason: safe read-only/dry-run operation is gated and receipted, target-price/public HH-read checks pass, and Gemma/Qwen is artifact-ready-with-gates; FULL remains PARTIAL because transcript cadence needs laptop/ASR and Composio tool discovery needs refreshed local auth.

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
| Transcript pipeline | `transcript:*`, Workplane jobs | transcript acquisition/ingest | manual/Workplane | laptop collector, yt-dlp, ffmpeg/ASR | worklist works; HH yt-dlp hits bot verification; ASR missing; laptop handoff ready | videos | bounded ingest only | approved path + receipts | low | cookies/env risk | PARTIAL | canary receipts |
| Gemma/Qwen shadow extraction | `shadow:*` scripts | model shadow extraction | manual/worker | Ollama/Gemma/Qwen | eval+production schema benchmarks pass; bounded sample/diff artifacts exist | existing transcripts | artifact-only | promotion approval | low | low | READY_WITH_GATES | shadow artifact/receipt |
| HH Control Bridge | HH MCP/toolbox surface | read-only VM bridge | service/toolbox | MCP | listed but wrapper probe failed | VM/files | read-only first | write gate | low | low | PARTIAL | toolbox probe |
| Codex/OMX skills | `/home/omar/.codex/skills/*` | prompt/workflow surfaces | prompt-triggered | Codex runtime | installed | repo/session | not production agents | prompt rules | low | low | PROMPT_ROUTER_TOKEN | skill files |

Non-agents: `$task-router`, `$ultraqa`, `$ultrawork`, `$ultragoal`, `$caveman` are Codex/OMX skill tokens in this session, not persisted Hermes production agents.

## 3. Agent readiness

- READY: public health/API read checks; `hygiene`; `workplane:status`; target-price monetization boundary.
- READY_WITH_GATES: marketing prompts/supervisor after hardening; Whop read/dry-run jobs; Art of War dry-runs; receipt generation; report-only Workplane jobs.
- PARTIAL: Hermes worker, transcript pipeline, Composio auth/tool-discovery, HH toolbox formalization. Gemma/Qwen is READY_WITH_GATES; public live HH-read verification passes.
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
| `audit:pipeline` | blockers present | script-controlled | missing publication dates; transcript cadence terminal reasons now classified; shadow remains approval-gated | repair transcript cadence |
| `verify:public -- --source live --base-url https://call-score.com` | PASS | script-controlled | none for HH-read source mode | keep scheduled read-only |
| transcript worklist | PASS limit 5 | manual/script | none for worklist | run laptop collector or ASR repair |
| transcript media fallback | BLOCKED | manual/script | ASR unavailable; `--gap-ms 0` parsing fixed | install/configure ASR or laptop collector |
| Gemma/Qwen shadow canary | READY_WITH_GATES | script-controlled | promotion/write approval required | review diff before any write canary |

## 10. MCP/toolbox audit

- Composio: configured/context dirs present; API-key variable presence confirmed without printing values; isolated SDK probe under `.tmp/` reached API auth but read-only discovery failed with `AuthenticationError`. Current blocker: `auth_invalid_or_expired`.
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

- P0: none for safe read-only/dry-run operation; external credential rotation review remains owner action if previously exposed credentials are active.
- P1: transcript useful cadence not proven from this VM because HH yt-dlp hits `bot_verification_required`, local ASR is unavailable, and laptop/cookie collector handoff is required; Composio read-only discovery blocked by `auth_invalid_or_expired`; audit pipeline blockers remain.
- P2: stale mirror archive/delete; historical log redaction; Mermaid SVG rendering; prompt/doc consolidation.

## 15. Recommended migration to full Hermes control

- Phase 1: Complete external Composio auth refresh and credential rotation review; no public/spend/provider writes.
- Phase 2: Prove transcript cadence via bounded laptop collector with cookies or install/configure local ASR, then emit success receipt.
- Phase 3: Review Gemma/Qwen shadow diff artifacts and keep promotion/write approval-gated.
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
- Historical P1 at that point: Gemma shadow extraction still schema pass `0`; prompt/model/runtime tuning needed; no production writes.
- P1: live public-count verification needs source alignment: either run verifier against the same HH read API source or reconcile the direct local DB versus live HH-read dataset; no DB/deploy mutation performed.
- P2: Art of War campaign content remains held for audience mismatch; private revision only, no public action/spend.

Next exact safe action:

```text
Install/configure Composio locally without printing secrets (API key via approved local secret store, CLI/SDK available), then rerun read-only `composio_mcp_probe`; separately configure local ASR or run the laptop transcript collector limit 5, then rerun bounded transcript and shadow canaries.
```

---

## 2026-06-13 canonical readiness remediation update from `8c21d93`

Strict verdict: **PARTIAL, operation-ready for safe read-only/dry-run lanes**. FULL autonomous revenue remains too strong because transcript acquisition is still degraded and public/spend/Whop/DB mutations remain approval-gated by design.

Fresh fixes and evidence:

- Baseline: `master` at `8c21d93` before edits; `git diff --check` passed.
- Receipt gate fix: dangerous-workflow regex no longer treats benign `read-only` text as paid `ad` intent. Regression: `tests/workflow-receipts.test.ts` covers read-only receipts and paid-ad detection.
- Composio: local context exists and existing venv `/srv/agents/hermes/venvs/composio-sdk` imports `composio`; after loading local env without printing values, SDK client construction and tool accessor discovery passed. Receipt: `.tmp/workflow-receipts/composio_mcp_probe/composio-mcp-venv-fixed-20260613T112819Z.json`. No write action, no outbound marketing, no spend.
- Transcript waterfall: `transcript:worklist -- --limit 5 --since-days 45` passed with 5 candidates. Bounded dry-run extraction limit 3/serial returned terminal provider reason `bot_verification_required`; no useful transcript was produced and no DB write was attempted. ASR binaries are still absent. Receipt: `.tmp/workflow-receipts/transcript_waterfall_canary/transcript-waterfall-20260613T112908Z.json`.
- Shadow extraction: local Ollama JSON-mode returns `{}` for empty extraction. Parser now treats `{}` as no calls and wraps single-call objects. Bounded Qwen fallback produced artifact `.tmp/shadow-extraction/qwen-shadow-fixed-20260613T113210Z.jsonl` with `schemaValid=1/1`, `accepted=0`, no production writes. Receipt: `.tmp/workflow-receipts/gemma_shadow_canary/qwen-shadow-fixed-20260613T113210Z.json`.
- Public count verification: verifier now supports `--source live` to compare live HH-read source with live API/UI instead of direct local DB counts. `npm run verify:public -- --base-url https://call-score.com --source live` passed: health `source=hh_read_api`, leaderboard `api=36 rows=36`, homepage funnel `raw=16186 public=7995 ranked=42`.
- Whop/revenue gates: targeted Whop/auth/checkout/webhook suite passed `28/28`; mutation smoke receipt blocked with `approval_missing`. No Whop mutation performed.
- Art of War: dry-run from canonical automation cwd produced report, no public action, no external mutation, decision `revise_or_hold`, failure class `audience_mismatch`. Receipt: `.tmp/workflow-receipts/art_of_war_private_dry_run/art-of-war-dry-run-20260613T113655Z.json`.
- Live target-price safety: `https://call-score.com/api/health` healthy via HH read API; `/api/creator/93?limit=100` leak count `0`; ETH/SOL/BTC known target rows preserve outcomes and expose `target_required_tier="pro"`, `can_view_target_price=false`, `target_price=null`, `validated_target_price=null`.

Validation:

- `node --import tsx --test tests/workflow-receipts.test.ts tests/workplane-jobs.test.ts tests/extract-calls-openrouter.test.ts tests/data-pipeline.test.ts`: `81/81` pass.
- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm run build`: pass.
- Full `node --import tsx --test $(find tests -name '*.test.ts' | sort)`: pass; subsequent gates ran, so no failing test stopped execution.
- `npm run hygiene`: pass, `Secret hygiene: ok`.
- `npm run workplane:status`: pass/OK, readiness still partial.
- `npm run freshness:check`: exit 0 with `WARN`; warnings are transcript provider credential missing and yt-dlp bot verification failures.
- `npm run audit:pipeline`: exit 0 but reports remaining data completeness blockers: missing publication dates, missing transcripts or terminal reasons, pending shadow recheck.
- `npm run verify:public` with `.env.hermes`: pass local direct-DB mode.
- `npm run verify:public -- --base-url https://call-score.com --source live`: pass live HH-read mode.

Remaining blockers:

- P0: none for safe read-only/dry-run operation.
- P1: transcript useful cadence from this VM still not proven; YouTube bot verification and absent local ASR block useful extraction. Next safe action: configure local ASR or run operator laptop/cookie collector limit 5, then rerun `transcript_waterfall_canary`.
- P1: Gemma model still times out; Qwen fallback gives schema pass but no accepted calls. Next safe action: tune Gemma prompt/runtime over existing transcripts, artifact-only, limit 1.
- P1: `audit:pipeline` data completeness remains partial until transcript terminal reasons and shadow recheck coverage improve.
- P1: Composio SDK read-only probe works, but full MCP/CLI wiring should be formalized before claiming broad Composio-managed operations.
- P2: stale mirror/archive cleanup and historical secret rotation review remain external/approval-gated.

Operational posture:

- Safe autonomous lanes: health checks, local/live public verification, hygiene, Workplane status, freshness/audit read-only reports, private Art of War dry-runs, Whop fixture/read-only tests, receipt generation.
- Still approval-gated: Netlify deploy, production DB mutation, Whop mutation, public publishing/outreach, paid spend, provider env changes, credential rotation, destructive infra, open-ended extraction/model jobs.

---

## 2026-06-13 Gemma schema-contract reconciliation update

Verdict update for Gemma shadow readiness: **READY_WITH_GATES for bounded artifact-only shadow**, not approved for promotion or production writes.

What changed:

- PR #66 10/10 benchmark evidence was reconciled with current production-shadow behavior.
- Root cause of the apparent regression: PR #66 validated the normalized eval schema, while later production-shadow Modelfile changes emit production-schema rows.
- Eval and production contracts are now separate; production schema validation uses a bounded production-shadow symbol subset rather than the full tracked-symbol universe:
  - `ops/ollama/Modelfile.callscore-gemma4-eval-extractor` preserves PR #66 eval-schema prompt.
  - `ops/ollama/Modelfile.callscore-gemma4-extractor` remains production-schema shadow model.
  - `src/scripts/benchmark-local-extractors.ts` supports `--schema eval` and `--schema production`.

Evidence:

| Workflow | Artifact | Result |
| --- | --- | --- |
| `gemma_eval_schema_recheck` | `.tmp/shadow-extraction/gemma-eval-schema-pr66-recheck.json` | 10/10 fixtures, 10/10 JSON arrays, 10/10 schema, 0 false positives, candidate_pass |
| `gemma_production_schema_recheck` | `.tmp/shadow-extraction/gemma-production-schema-recheck.json` | 10/10 fixtures, 10/10 JSON arrays, 10/10 production schema, 0 false positives, candidate_pass |
| `gemma_shadow_canary` | `.tmp/shadow-extraction/gemma-production-shadow-recheck-20260613T140436Z.jsonl` | limit 1, one chunk, `schema_valid=true`, `accepted_count=1`, `candidate_count=1`, latency 42423ms |

Receipts:

- `.tmp/workflow-receipts/gemma_eval_schema_recheck/gemma-eval-schema-pr66-recheck.json`
- `.tmp/workflow-receipts/gemma_production_schema_recheck/gemma-production-schema-recheck.json`
- `.tmp/workflow-receipts/gemma_shadow_canary/gemma-production-shadow-recheck-20260613T140436Z.json`

Safety:

- Local Ollama only.
- Artifact-only shadow canary.
- No production calls written.
- No shadow promotion.
- No production DB mutation.
- No paid LLM/API calls.

Remaining gates:

- Larger real-transcript shadow sample and `shadow:diff` review before any write-canary discussion.
- Explicit operator approval required before promotion or production writes.
- Transcript acquisition cadence remains a separate P1 blocker.


The eval-schema Modelfile intentionally preserves the PR #66 benchmark prompt as a controlled-fixture contract; do not use it for untrusted production transcript runs. Production shadow extraction uses the separate guarded production-schema Modelfile.

### 2026-06-13 bounded full-coverage shadow/diff sample

Run id: `gemma-production-shadow-sample-fullcover-20260613T155241Z`.

Artifacts:

- Shadow sample: `.tmp/shadow-extraction/gemma-production-shadow-sample-fullcover-20260613T155241Z.jsonl`
- Run metadata: `.tmp/shadow-extraction/gemma-production-shadow-sample-fullcover-20260613T155241Z.meta.json`
- Shadow diff: `.tmp/shadow-extraction/gemma-production-shadow-sample-fullcover-20260613T155241Z.diff.jsonl`
- Receipts:
  - `.tmp/workflow-receipts/gemma_shadow_sample/gemma-production-shadow-sample-fullcover-20260613T155241Z.json`
  - `.tmp/workflow-receipts/gemma_shadow_diff/gemma-production-shadow-sample-fullcover-20260613T155241Z.json`
- Durable sanitized summary/checksums: `docs/audits/gemma-production-shadow-sample-fullcover-20260613T155241Z.summary.json`

Scope and safety:

- Local Ollama only.
- Limit `5` videos.
- Full transcript coverage achieved with `--chunk-chars 4000 --chunk-overlap 0 --max-chunks 2`.
- Artifact-only extraction and diff.
- No `shadow:promote`.
- No production writes, DB mutation, deploy, Whop mutation, public action, or paid API/LLM calls.

Result:

- Shadow rows: `5`.
- Schema-valid rows: `5/5`.
- Failed records: `0`.
- Accepted calls: `1`.
- Coverage: `5/5` rows reached transcript end.
- `npm run shadow:validate`: `ok=true`, `records=5`, `videos=5`, `accepted_calls=1`, `issues=[]`.
- Diff statuses: `removed_calls=2`, `changed_calls=1`, `no_accepted_calls=2`, `manual_review=0`.

Implementation note:

- Fixed extraction CLI parsing so explicit `--chunk-overlap 0` remains zero instead of falling back to default overlap. This prevents accidental one-character chunk steps in bounded shadow samples.

Promotion gate:

- This is promotion-readiness evidence, not promotion approval.
- Before any write canary or production promotion, an operator must explicitly approve the exact `shadow:promote --write` command and review the diff artifact.

---

## 2026-06-13 full-production operation push update

Verdict: **PARTIAL**, improved. Canonical laptop transcript cadence is now proven for a bounded 5-video batch; Workplane now treats the latest successful laptop cadence receipt as readiness evidence instead of stale HH-local collector state.

### Evidence

| Area | Result | Evidence |
| --- | --- | --- |
| Laptop transcript cadence | PASS, 5/5 ingested | `.tmp/workflow-receipts/transcript_laptop_cadence/laptop-limit5-20260613T1806Z.json` |
| Fresh transcript ids | `iUCCAQYntNw`, `OpGyIwR0rzA`, `X9gvhAEMuQ4`, `Y4irJGDZdLM`, `8nKIOo5CeEc` | approved ingest path / DB readback |
| Workplane transcript readiness | READY | `src/lib/workplane-status.ts` now reads latest `transcript_laptop_cadence` receipt |
| Gemma fresh-batch shadow | valid artifact, 0 accepted calls | `.tmp/workflow-receipts/gemma_shadow_sample/gemma-fresh-laptop5-20260613T181320Z.json` |
| Shadow diff | complete, manual_review=5 | `.tmp/workflow-receipts/gemma_shadow_diff/gemma-fresh-laptop5-20260613T181320Z.json` |
| Extraction dry-run | processed=5, failed=0, calls=0 | `.tmp/workflow-receipts/pipeline_extract_canary/fresh-laptop5-extract-dry-run-20260613T1818Z.json` |
| Public live verify | PASS | `npm run verify:public -- --source live --base-url https://call-score.com` |
| Full tests | PASS, 636/636 | `node --import tsx --test $(find tests -name '*.test.ts' | sort)` |

### Updated readiness map

- Transcript pipeline: **READY_WITH_GATES** for bounded canonical laptop cadence; HH-only yt-dlp/ASR remains diagnostic/fallback and still shows historical bot/ASR blockers.
- Downstream extraction/match/score: **PARTIAL**. Fresh batch yielded no accepted calls, so match/score/write-canary was intentionally not run.
- Gemma/Qwen: **READY_WITH_GATES** for artifact-only shadow and diff; promotion/write remains approval-gated.
- Whop Auto: **READY_WITH_GATES** for tests/read-only/dry-run; no live mutation performed.
- Art of War: **READY_WITH_GATES** for private dry-run only; latest campaign remains `revise_or_hold` / `audience_mismatch`.
- Composio MCP: **PARTIAL/BLOCKED_BY_AUTH_OR_SDK** from this operator environment; no write/outbound/spend action performed.

### Canonical control note

Do not use stale `.tmp/laptop-collector/latest-state.json` alone to judge transcript readiness. The fixed canonical laptop script can succeed through the approved ingest path without refreshing that HH-local state file. Use latest successful `transcript_laptop_cadence` receipt plus DB latest transcript success as the current readiness evidence.

### Remaining blockers

- P1: collect more bounded laptop batches and run extraction/diff review until accepted fresh calls are observed.
- P1: Composio MCP local auth/CLI/SDK wiring.
- P1: Art of War content revision before any owned-channel publish approval.
- P1: audit pipeline completeness: publication dates, transcript terminal coverage, shadow recheck coverage.

### 2026-06-13 second laptop batch / write-canary update

- Second canonical laptop batch: 5 worklist items attempted; 4 available transcripts, 1 failed/no-content update.
- Receipt: `.tmp/workflow-receipts/transcript_laptop_cadence/laptop-limit5-20260613T183717Z.json`.
- Artifact-only Gemma shadow over the 4 available transcripts: `4/4` records, `1` accepted call, `0` failed records.
- Diff counts: `new_calls=1`, `manual_review=2`, `no_accepted_calls=1`.
- One-video write canary: video `20290`, status `new_calls`, `1` call promoted through repo-approved `shadow:promote --write --allow-statuses new_calls --video-ids 20290 --limit 1 --mark-video-extracted`.
- Match canary: `npm run match -- --limit 1` considered one call and skipped it without matching.
- Score canary safety defect found: `npm run score -- --limit 1` historically ignored the limit and performed a full public score recompute. The script is now patched to reject unsupported CLI args and prevent misleading bounded invocations.
- No Netlify deploy, Whop mutation, public marketing, paid API/LLM, credential print, destructive infra, or broad shadow promotion occurred.

Readiness impact:

- Transcript cadence: **READY_WITH_GATES**, now two bounded laptop batches succeeded.
- Gemma/Qwen: **READY_WITH_GATES+WRITE_CANARY**, one accepted call promoted via explicit one-video canary.
- Match/score: **PARTIAL**. Match canary ran; bounded score canary is not implemented yet. Full recompute path remains explicit and guarded.

### 2026-06-13 bounded scoring canary update

- Added real bounded score canary support to `compute-scores.ts`: `--call-id`, `--call-ids`, or `--video-id`, with `--limit <= 5`.
- Added `recomputeScopedCallScores` so canaries update only selected calls and do not delete/rebuild `creator_stats`.
- Canary executed: `npm run score -- --video-id 20290 --limit 1`.
- Result: `considered_calls=1`, `scored_calls=0`, which is acceptable for the promoted watch call because it is not public-score mature/eligible yet.
- Receipt: `.tmp/workflow-receipts/pipeline_score_canary/score-video20290-20260613T190556Z.json`.
- Workplane now recognizes latest score-canary receipt and reports the pipeline blocker as audit-completeness, not missing scoring canary.

---

## 2026-06-14 production-readiness update

Verdict: **PARTIAL**, but with no P0 blocker for safe public website/read-only/dry-run operation. The remaining blockers are P1 provider/account setup and corpus-completeness work, not target-price safety or core canary-path failures.

### Evidence

| Area | Result | Evidence |
| --- | --- | --- |
| Live public verify | PASS | `npm run verify:public -- --source live --base-url https://call-score.com` |
| Live health | PASS | `/api/health`: `ok=true`, `db=ok`, `source=hh_read_api` |
| Target-price leak | PASS | creator `93` has no public/free target leak for `1700`, `60`, `55000` |
| Canonical laptop transcript batch | PASS, `5/5` available | `.tmp/workflow-receipts/transcript_laptop_cadence/laptop-limit5-20260614T035559Z.json` |
| New transcript ids | `-ULpSxZXxHI`, `J6vyR9Z9yW0`, `1hrA9NUZ-WE`, `kyq3QiXi6nI`, `tv7cTi3xSqU` | DB readback via approved local environment; no secrets printed |
| Fresh Gemma/Qwen shadow | PASS artifact, `5` rows, `1` accepted, `0` failed | `.tmp/workflow-receipts/gemma_shadow_sample/gemma-laptop-batch3-20260614T035712Z.json` |
| Shadow diff | PASS, `manual_review=1`, `no_accepted_calls=4` | `.tmp/workflow-receipts/gemma_shadow_diff/gemma-laptop-batch3-20260614T035712Z.json` |
| Workplane Gemma readiness | READY after patch | `src/lib/workplane-status.ts`; `tests/workplane-jobs.test.ts` |
| Audit pipeline | PARTIAL | `missing_publication_dates`, `missing_transcripts_or_terminal_reasons` |
| Publication-date bounded dry-run | BLOCKED by missing source dates | video ids `6548`, `6553`, `8000`; no write |
| Whop/revenue gates | READY_WITH_GATES | targeted Whop tests pass; mutation still approval-gated |
| Art of War | READY_WITH_GATES / held | private dry-run blocked by safety/audience; no public action/spend |

### Third-party app inventory

| Provider/app | Required for FULL now | Required lane | Current status | Operator setup action | Blocker |
| --- | --- | --- | --- | --- | --- |
| Netlify | yes | website/deploy | live healthy | keep project/deploy access available | none now |
| HH PostgreSQL + HH read API | yes | public data/API | healthy | maintain secret-store credentials only | none now |
| Tailscale + SSH laptop bridge | yes | transcript cadence | proven | keep `omarslaptop-1` online/reachable | operational P1 |
| Omar laptop Firefox/browser cookies | yes | transcript cadence | proven | keep cookies valid; no cookie values leave laptop | operational P1 |
| YouTube/yt-dlp laptop lane | yes | transcript cadence | proven with warnings | optionally install/refresh impersonation extras if warnings become failures | P2 |
| Local Ollama/Gemma/Qwen | yes | extraction | proven | keep local models available | none now |
| Whop | yes for revenue | entitlements/webhooks/revenue | tests/gates only | configure live app/products/plans/webhooks via manifest-backed approval receipt | P1 |
| Owned marketing channels | needed for launch | Art of War | not selected/approved | choose channels and grant publish receipt after verifier/persona pass | P1 |
| GitHub | useful | release/CI | repo available | ensure push/CI access if used | P2 |
| Resend/email | optional | alerts | referenced/config-gated | configure only if alerts desired | P2 |
| Sentry/analytics/SEO | optional | monitoring/SEO | optional | configure if desired | P2 |
| External model providers | optional | fallback extraction | not needed now | configure only if intentionally adding cloud fallback | deferred |
| Composio | optional/deferred | app automation | not essential to current operation | create/configure new account outside chat if later needed | deferred |

### Updated readiness map

- Website: **READY**.
- Canonical laptop transcript pipeline: **READY_WITH_GATES**; HH-only yt-dlp/ASR remains diagnostic/fallback.
- Data pipeline: **READY_WITH_GATES at canary scale**, still **PARTIAL** for whole-corpus audit completeness.
- Gemma/Qwen: **READY_WITH_GATES** for artifact shadow/diff and bounded canaries; broad promotion remains approval-gated.
- Whop Auto: **READY_WITH_GATES** for tests/read-only/dry-run; live revenue mutation requires provider setup and approval receipt.
- Art of War: **READY_WITH_GATES** for private dry-run; public/owned-channel action requires revised content, selected channel, and publish approval receipt.
- Composio: **DEFERRED**, not essential unless future repo evidence makes it required.

### Remaining blockers

- P1: `audit:pipeline` corpus completeness: missing publication dates and missing transcript terminal reasons.
- P1: Whop production provider setup/verification before revenue mutations.
- P1: Art of War owned-channel setup plus content/persona/verifier pass before publication.
- P1: broad Gemma production promotion remains gated.
- P2: optional Composio/email/analytics/external model provider integrations.

Next exact safe action: implement bounded terminal-reason classification for known unavailable publication-date/transcript cases, rerun `audit:pipeline`, and keep Whop/public marketing actions behind manifest/receipt approval gates.

## 2026-06-14 Whop Auto canonicalization audit

Verdict: **PARTIAL / improved**. Active Whop Auto registry now points at canonical CallScore repo; no provider/customer/payment mutation occurred.

Evidence:

- Registry repaired: `/srv/whop-auto/state/.whop-pipeline/registry.json` -> `/opt/crypto-tuber-ranked/.whop-pipeline.json`.
- Canonical source recorded: `/opt/crypto-tuber-ranked`.
- Stale mirrors remain inventory only: `/srv/whop-auto/workspace/*`, `/srv/agents/crypto-tuber-ranked`, `/srv/agents/repos/crypto-tuber-ranked`, and `/opt/crypto-tuber-ranked.pre-canonical-*`.
- Regression check added: `tests/infrastructure-canonical.test.ts` validates registry canonicality when `/srv/whop-auto` is present.
- No Vercel or Neon production target was reintroduced; Netlify and HH local PostgreSQL/HH Read API remain canonical.
- No Whop pricing/product/customer/payment mutation, public marketing, paid action, credential print, broad DB write, destructive infra, or deployment occurred.

Whop Auto gate status:

| Lane | Status | Evidence / gate |
| --- | --- | --- |
| Registry canonicality | READY | `/srv/whop-auto/state/.whop-pipeline/registry.json` points to `/opt/crypto-tuber-ranked/.whop-pipeline.json` |
| Provider health | READY_WITH_GATES | run read-only only when local auth is available; no secret output |
| Manifest diff | READY_WITH_GATES | manifest exists at `/opt/crypto-tuber-ranked/.whop-pipeline.json` |
| Entitlement dry-run | READY_WITH_GATES | repo tests cover product-resource entitlement semantics |
| Webhook safe replay | READY_WITH_GATES | fixture route tests remain required before changes |
| Discounted/tokenized Pro renewal proof | READY | operator-provided Whop screenshot inspected locally via Tailscale; receipt `.tmp/workflow-receipts/whop_live_purchase_proof/whop-zero-dollar-pro-renewal-screenshot-20260614T065913Z.json`; private fields redacted |
| Live mutation | BLOCKED_BY_GATE | requires manifest, diff, rollback, approval receipt, local auth, and explicit safe mutation classification |


Whop Auto receipts from this run:

- `.tmp/workflow-receipts/whop_manifest_diff/whop-manifest-diff-20260614T051415Z.json`
- `.tmp/workflow-receipts/whop_provider_health/whop-provider-health-20260614T051415Z.json`
- `.tmp/workflow-receipts/whop_entitlement_sync/whop-entitlement-sync-20260614T051426Z.json`
- `.tmp/workflow-receipts/whop_webhook_verify/whop-webhook-verify-20260614T051426Z.json`
- `.tmp/workflow-receipts/whop_activation_review/whop-activation-review-20260614T051415Z.json` (`blocked` by live mutation/purchase gate)
- `.tmp/workflow-receipts/whop_live_purchase_proof/whop-zero-dollar-pro-renewal-screenshot-20260614T065913Z.json` (`passed_with_scope_note`: live discounted/tokenized Pro renewal; checkout/payment-authorization lane certified)

Remaining TD:

- P1: audit-pipeline corpus completeness still has publication-date and transcript-terminal-reason gaps.
- P1: live Whop purchase/provider mutation proof remains gated; do not call FULL commercial automation until provider proof/receipts are current.
- P2: archive/delete stale mirrors and quarantine/rotate stale secret-bearing Whop Auto artifacts only with separate approval.

## 2026-06-14 audit terminal-coverage update

Verdict: **PARTIAL / improved**. Audit completeness no longer blocks on known missing publication dates; transcript terminal/actionable classification is improved but not complete.

Evidence:

- Added durable terminal publication-date audit records at `data/audit/terminal-publication-dates.jsonl` for four videos whose bounded provider dry-run found no Invidious or `yt-dlp` source date.
- `audit:pipeline` now loads durable terminal audit inputs by default when present.
- `audit:pipeline` now counts DB-level terminal transcript failures separately from actionable missing transcripts.
- Latest audit summary with `--allow-partial-shadow`: `missing_publication_dates=0`, `missing_transcripts=99`, `pending_shadow=79`, `shadow_complete=1`, `terminalCoverage.publicationDateVideos=4`, `terminalCoverage.transcriptVideos=3859`, blockers=`[missing_transcripts_or_terminal_reasons]`.
- Receipt: `.tmp/workflow-receipts/pipeline_audit_completeness/pipeline-audit-terminal-coverage-blocked-20260614T052422Z.json`.

Remaining blocker:

- P1: continue bounded laptop cadence and classify remaining actionable pending/provider-blocked transcript rows; do not broad backfill.

Clarification: this is an **audit corpus-completeness** P1, not a transcript acquisition mechanism blocker. The canonical laptop/Tailscale lane uses laptop-side browser cookies/`yt-dlp`, is proven, and remains READY_WITH_GATES. The remaining audit blocker means historical/actionable rows still need either bounded collection or a terminal reason recorded.
