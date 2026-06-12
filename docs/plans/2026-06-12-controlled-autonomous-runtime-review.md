# CallScore Controlled Autonomous Runtime Review — 2026-06-12

Status: `CONTROLLED_AUTONOMOUS_RUNTIME_PARTIAL`

## Summary
CallScore is safe for internal autonomous runtime loops. Public/revenue autonomy remains approval-gated.

## Workplane gap audit

| Domain | Current status | Missing evidence | Safe next action | Approval-gated action | Blocker | Canonical file/module |
| --- | --- | --- | --- | --- | --- | --- |
| CallScore data/API | SAFE / PARTIAL | stable transcript freshness | keep freshness/workplane checks | prod DB destructive ops | YouTube transcript cadence | `src/scripts/workplane-status.ts`, `src/lib/workplane-status.ts` |
| Laptop transcript collector | PARTIAL | useful transcript successes | repair targeting/failure classification; then limit-5 run | 25-video batch | latest two bounded batches were 0/10 | `scripts/windows/run-transcript-collector.ps1` |
| Post-ingest extraction/scoring | SAFE / CONDITIONAL | new transcript success | run only after new transcripts land | broad recompute if unsafe | no useful new transcripts in latest batch | `src/scripts/transcript-ingest.ts`, `npm run score` |
| Gemma shadow extraction | SHADOW HOLD | valid real transcript JSON/schema | schema/Modelfile repair + shadow run | write-canary / prod default | latest 1-real run: non-array parser error | `ops/ollama/Modelfile.callscore-gemma4-extractor`, `src/scripts/shadow-extract-transcripts.ts` |
| ML idle improvement | ACTIVE / HOLD | passing gate metrics | run `npm run ml:idle-improve` | promotion | gate false | `src/scripts/ml-idle-improve.ts` |
| Whop-auto | PARTIAL | current autonomous read-only command surface outside CallScore status | run CallScore workplane Whop read-only specs | pricing/product/payment/customer mutation | `/srv/whop-auto` has workspace/history, no root package command | `docs/ops/whop-auto-certification.md`, `src/lib/workplane-jobs.ts` |
| Art of War | PRIVATE ACTIVE | approval for public use | dry-run report + private campaign drafts | publish/outreach/spend | public actions blocked | `/srv/agents/repos/Claude_Code_Automations/scripts/art_of_war.py`, CallScore docs |
| Claude_Code_Automations | PARTIAL | clean external repo state | read-only/dry-run only | provider/public/spend/destructive automations | repo has pre-existing dirty/untracked work | `src/lib/workplane-status.ts` |
| Hermes worker | PARTIAL | long-run cadence proof | HH-side jobs + laptop-only handoff | laptop cookie execution on HH | laptop required for cookies | `src/lib/workplane-jobs.ts` |
| Activation gates | NEEDS_APPROVAL | operator approvals for public/revenue moves | promotion review reports only | public/revenue/provider mutation | approval missing | `src/lib/workplane-status.ts` |
| Promotion review | PARTIAL | green gate evidence | keep reports current | auto-promotion | explicit no-auto-promote policy | this review |

## Transcript cadence promotion review
Verdict: `TRANSCRIPT_CADENCE_PARTIAL`.

Evidence:
- Latest bounded laptop job: job `1830`, attempted `5`, successes `0`, failures `5`, cooldown clear.
- Previous bounded laptop failures plus latest state show `transcript_failed: 10` recent failures.
- No HTTP 429 and no bot verification in latest run.
- Script now stores failure `detail_preview`, classifies more failure types, and skips any recently failed video for 24h.

Promotion requirement:
- At least two limit-5 batches with useful transcript success rate > 0 and no 429/bot cooldown.
- Failure detail must distinguish no captions/live/private/network from unknown `transcript_failed`.

## Gemma extraction promotion review
Verdict: `GEMMA_SHADOW_HOLD` and `GEMMA_NOT_PRODUCTION_DEFAULT`.

Evidence:
- Modelfile aligned to production shadow schema.
- Local model rebuilt: `callscore-gemma4-extractor:latest`.
- 1-real run at 350 chars / 350 tokens / 45s timed out.
- Warm 1-real run at 240 chars / 160 tokens / 90s avoided timeout but failed parser: `Model response did not contain a JSON array`.
- ML idle report: json_valid_rate `0`, schema_pass_rate `0`, parser_error_count `1`, eligible_for_write_canary `false`.

Promotion requirement:
- JSON validity >= 95%.
- Schema pass >= 95%.
- No high-confidence false positives.
- Creator-owned classification proven.
- Manual/eval approval recorded.

## Whop activation review
Verdict: `WHOP_AUTO_PARTIAL` / read-only certified enough for planning.

Evidence:
- `docs/ops/whop-auto-certification.md` records provider-safe checkout/OAuth/webhook/product inventory proof.
- CallScore workplane job specs expose Whop read-only/dry-run surfaces.
- `/srv/whop-auto` was discovered, but no single root package command is canonical; it is workspace/history heavy.

Blocked without approval:
- pricing, product, payment, customer, entitlement, webhook/provider mutation.

## Art of War activation review
Verdict: `ART_OF_WAR_PRIVATE_ACTIVE`.

Evidence:
- `python3 scripts/art_of_war.py validate-docs` passed.
- Dry-run report created at `/tmp/callscore-art-of-war-report-20260612-next.md`.
- Dry-run report produced 10 local/null publish records, 0 external mutations, 0 provider IDs.

Blocked without approval:
- public publishing, outbound outreach, email/DM, ad spend, aggressive scraping.

## Autonomous runtime review
Verdict: `CONTROLLED_AUTONOMOUS_RUNTIME_PARTIAL`.

Safe autonomous loops now visible:
- inspect workplane status;
- run limit-5 collector only when cooldown clear and targeting repaired;
- ingest transcript result/state;
- run Gemma shadow extraction artifact-only;
- run ML idle improvement artifact-only;
- run Whop read-only/dry-run checks through workplane specs;
- run Art of War private dry-run reports;
- produce promotion reports.

Autonomous revenue: `NO`.

Next hard target:
1. Repair transcript targeting/failure classification using new detail previews.
2. Achieve a limit-5 laptop collector batch with transcript success > 0.
3. Add Gemma parser-cleaning fixtures from real non-array outputs, then rerun 5-real shadow.
4. Keep Art of War private dry-run cadence while public actions remain approval-gated.


## Operational canary update — 2026-06-12 18:25Z

Verdict remains `CONTROLLED_OPERATIONAL_RUNTIME_PARTIAL`.

New evidence:
- Laptop `StatusOnly` passed over Tailscale with cooldown clear.
- Workplane probe job `1832` was enqueued through the existing `callscore-enqueue-job.ts` path, claimed by the laptop, and completed.
- The batch attempted 5 videos, wrote 5 failed transcript result updates, and produced no useful transcripts. No 429, no bot verification, no cooldown.
- Failure detail showed opaque Python tracebacks; the runner now classifies these as `collector_tool_error` and stores more actionable summaries.
- `npm run ml:idle-improve` ran artifact-only; Gemma write-canary eligibility remains false and production default did not change.
- Art of War campaign-loop produced `/tmp/callscore-art-of-war-receipts-proof-operational-001.json`: `decision=revise_or_hold`, `failure_class=audience_mismatch`, `approval_required=true`, `public_action_performed=false`.

Approval packets:
- Transcript: PARTIAL / targeting and collector-tool-error repair required.
- Gemma: SHADOW HOLD / no write canary.
- Whop: read-only/dry-run visible / live mutation approval-gated.
- Art of War: private operational / public publish-outreach-spend approval-gated.
- Runtime: PARTIAL / safe next action is transcript repair or private campaign revision.
