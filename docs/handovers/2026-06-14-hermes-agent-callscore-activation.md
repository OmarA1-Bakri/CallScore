# HERMES AGENT HANDOVER — CallScore Activation

## 1. Activation verdict

`PARTIAL`.

Safe production operation is healthy. FULL not claimed because Workplane still reports P1 gated lanes: audit corpus completeness, manual-review Gemma diff rows, public/provider/spend gates, and optional stale mirror/secret quarantine.

## 2. Current system state

- CallScore: canonical repo `/opt/crypto-tuber-ranked`, branch `master`, current run started from HEAD `11df761`.
- Netlify: canonical production hosting; no deploy performed in this run because app/runtime code did not change.
- HH PostgreSQL / HH Read API: canonical production data/read source. Live health returned `ok=true`, source `hh_read_api`.
- Hermes / Workplane: `npm run workplane:status` returned `status=OK`, `automation_readiness=PARTIAL`.
- Transcript cadence: canonical laptop/Tailscale/residential Firefox/laptop-side `yt-dlp` lane proved fresh `5/5` write batch.
- Audit/data pipeline: freshness `WARN` with `blockers=[]`; audit pipeline still blocks on `missing_transcripts_or_terminal_reasons`.
- Gemma/Qwen: local Ollama shadow sample processed `5/5`, accepted `2`, failed `0`; diff requires manual review for all 5 rows.
- Whop Auto: checkout/payment authorization proof remains certified; targeted Whop tests passed; no live provider/customer/payment/pricing mutation performed.
- Art of War: dry-run works but held on `audience_mismatch`; no public action/spend/outreach.
- Composio/MCP: configured and live-probed; initialize/tools-list passed, 7 tools discovered; running Codex sessions may require restart/reload for first-class tool exposure.

## 3. Resume instruction for Hermes Agent

Exact next action:

1. Continue bounded transcript batches and terminal-reason classification until `missing_transcripts_or_terminal_reasons` is reduced or exactly exhausted.
2. Review `.tmp/shadow-extraction/gemma-activation-shadow-20260614T094949Z.diff.jsonl`; do not promote until manual review gate passes.
3. Keep Whop and Art of War public/provider/spend mutations gated.

Exact commands:

```bash
cd /opt/crypto-tuber-ranked
set -a; . ./.env.hermes >/dev/null 2>&1; set +a
npm run workplane:status
npm run audit:pipeline -- --summary --allow-partial-shadow
npm run freshness:check
npm run verify:public -- --source live --base-url https://call-score.com
```

Transcript command from laptop lane:

```powershell
C:\Users\albak\run-transcript-collector-fixed-wslssh.ps1 -Limit 5 -Browser firefox -GapSeconds 45 -SinceDays 45 -HhHost hermes-agent-box -Write
```

What Hermes must verify first:

- `git status --short` in `/opt/crypto-tuber-ranked`.
- Latest receipts under `.tmp/workflow-receipts/transcript_laptop_cadence`, `gemma_shadow_sample`, and `gemma_shadow_diff`.
- `npm run audit:pipeline -- --summary --allow-partial-shadow` blocker list.

What Hermes must not repeat:

- Do not re-litigate laptop transcript architecture; it is canonical and uses laptop-side `yt-dlp`.
- Do not carry non-discounted Whop cash settlement as functional-readiness blocker.
- Do not use Vercel/Neon as production targets.
- Do not patch stale mirrors as CallScore source.

What Hermes must not mutate:

- No broad DB backfill/recompute.
- No Whop pricing/product/customer/payment mutation without manifest + diff + rollback + receipt + local auth + explicit safe mutation classification.
- No public marketing/outreach/spend without approval receipt.
- No secret-bearing artifact printing.

## 4. Completed lanes

- Website: live verify passed.
- Transcript cadence: fresh `5/5` laptop write batch passed.
- Audit pipeline: rerun; blocker remains classified.
- Data pipeline: freshness/public verification rerun; shadow sample/diff completed.
- Gemma/Qwen: bounded local Ollama shadow/diff receipts written.
- Whop Auto: targeted tests passed; proof remains certified; mutation gates held.
- Art of War: private dry-run completed, no public action.
- Composio: config/probe passed.
- Hermes/Workplane: status/freshness/audit/hygiene run.
- Docs/memory: masterplan, workflow audit, and this handover updated.
- Deploys/commits: commit pending at handover creation if docs are still dirty.

## 5. Remaining blockers

### P0

None found.

### P1

- Audit corpus completeness: `missing_transcripts_or_terminal_reasons` remains. Owner: Hermes/CallScore operator. Next: bounded laptop batches + terminal-reason classification.
- Gemma diff manual review: fresh diff rows are all `manual_review`. Owner: CallScore operator/reviewer. Next: review diff before any promotion.
- Art of War public action: publish approval absent and dry-run failed audience fit. Owner: operator/marketing. Next: revise campaign or approve exact publish packet after gates pass.
- Provider/public/spend mutations: remain gated. Owner: operator. Next: manifest/diff/rollback/receipt/local-auth gate per action.

### P2

- Stale mirror archive/delete and secret-bearing artifact quarantine/rotation. Owner: operator. Next: separate cleanup approval.

## 6. Receipts

- `transcript_laptop_cadence`: `.tmp/workflow-receipts/transcript_laptop_cadence/laptop-limit5-activation-20260614T094841Z.json` — passed.
- `gemma_shadow_sample`: `.tmp/workflow-receipts/gemma_shadow_sample/gemma-activation-shadow-20260614T094949Z.json` — passed.
- `gemma_shadow_diff`: `.tmp/workflow-receipts/gemma_shadow_diff/gemma-activation-shadow-20260614T094949Z-diff.json` — passed.
- Existing Whop receipts remain valid under `.tmp/workflow-receipts/whop_*`.
- Existing Art of War receipts remain under `.tmp/workflow-receipts/artofwar_*`; fresh dry-run artifact: `/tmp/callscore-art-of-war-campaign-loop-activation-20260614.json`.

## 7. Validation

- `git diff --check`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run hygiene`: passed.
- `npm run workplane:status`: `OK`, `automation_readiness=PARTIAL`.
- `npm run freshness:check`: `WARN`, `blockers=[]`.
- `npm run audit:pipeline -- --summary --allow-partial-shadow`: blocker `missing_transcripts_or_terminal_reasons`.
- `npm run verify:public`: passed local.
- `npm run verify:public -- --source live --base-url https://call-score.com`: passed live.
- `node --import tsx --test $(find tests -name '*.test.ts' | sort)`: `643` pass, `0` fail.

## 8. Files changed

- `docs/plans/2026-06-11-callscore-canonical-master-plan.md` — appended activation evidence.
- `docs/audits/hermes-agentic-workflow-audit.md` — appended audit refresh.
- `docs/handovers/2026-06-14-hermes-agent-callscore-activation.md` — this handover.
- `$agentmemory` / `callscore-memory` should record this run after commit.

## 9. Commits

- Pending until final commit step. Expected intent: `Record activation evidence and Hermes handover`.

## 10. Deploys

- Provider: Netlify.
- Deploy ID/URL: none in this run.
- Source commit: no app/runtime change requiring deploy.
- Verification result: live site already verified healthy.

## 11. Operator actions

- Review Gemma diff: `.tmp/shadow-extraction/gemma-activation-shadow-20260614T094949Z.diff.jsonl`; blocking verdict for promotion: yes.
- Approve Art of War publish packet only after audience mismatch fixed and gates pass; blocking verdict for public marketing: yes.
- Approve any Whop provider/customer/payment/pricing mutation only through manifest/diff/rollback/receipt/local-auth gate; blocking verdict for mutation: yes.
- Optional cleanup approval for stale mirrors/secret-bearing artifacts; blocking verdict for current production: no.

## 12. Final confidence

High for PARTIAL verdict. Evidence covers live website, canonical transcript cadence, local model shadow, Workplane, Whop gates, Art of War dry-run, Composio, and full validation. FULL is not claimed because remaining P1 gates are real gated review/approval/backlog items.

## 13. Hermes continuation directive

Continue execution, not rediscovery.

Next command:

```bash
cd /opt/crypto-tuber-ranked
set -a; . ./.env.hermes >/dev/null 2>&1; set +a
npm run audit:pipeline -- --summary --allow-partial-shadow
```

Then run next bounded laptop cadence batch or terminal-reason classifier only if safe. Keep all promotion, public, spend, and provider mutation gates closed.
