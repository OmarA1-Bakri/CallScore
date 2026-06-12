# CallScore Growth Intelligence Pack — Private Activation Draft

Date: 2026-06-12  
Scope: internal-only CallScore growth intelligence; no public publishing, outreach, spend, provider mutation, or production ranking mutation.

## 1. Executive summary

CallScore is cleared to enter the private Growth Intelligence phase while transcript recovery remains partial. The public data surface is safe: unsafe source ranks are zero, the read API returns no unsafe official rows, and the homepage is healthy. The laptop collector is now reachable over Tailscale and can run through the workplane bridge, but the first bounded 5-video run produced zero usable transcripts, so transcript cadence remains PARTIAL rather than recovered.

Growth intelligence may proceed as internal planning and dry-run artifact generation only. Public actions remain approval-gated.

## 2. Data surface status

| Surface | Status | Evidence |
|---|---:|---|
| unsafeSourceRanks | 0 | `npm run freshness:check` on 2026-06-12 |
| API unsafeOfficial | 0 | all_time read API validation |
| Homepage | SAFE | `https://call-score.com/` returned HTTP 200 |
| 30d maturity | PENDING_MATURITY | freshness/read API empty reason |
| Daily pipeline timer | ACTIVE | workplane/freshness status |
| Model currently recommended | rule_extractor_safe_fallback | workplane status |

Current public buckets:

| Period | Official | Certified | Provisional | Watchlist/Pending note |
|---|---:|---:|---:|---|
| all_time | 36 | 24 | 20 | watchlist 100; stale 19; excluded 4 |
| 12m | 42 | 33 | 11 | watchlist 100; stale 19; excluded 4 |
| 90d | 54 | 34 | 14 | watchlist 100; stale 19; excluded 4 |
| 30d | 0 | 0 | 0 | PENDING_MATURITY; pending 100; excluded 4 |

Transcript freshness/cooldown:

- Latest transcript attempt: 2026-06-12 16:41:16+01.
- Latest transcript success: 2026-06-12 07:59:17+01.
- Laptop collector cooldown: clear.
- Known HH-native transcript warnings remain: provider credential missing failures=2; yt-dlp bot verification failures=9.
- Transcript cadence status: PARTIAL; laptop path is callable but did not recover new transcripts in the latest bounded batch.

## 3. Transcript collector status

| Check | Result |
|---|---|
| HH → laptop SSH | PASS via `albak@100.118.10.128` |
| Laptop CallScore repo | Present; local branch `master`; local HEAD `6197264c842bdecbc3b13d81d15abe3520a83999`; dirty/untracked local files preserved |
| StatusOnly | PASS; no worklist claim, no transcript fetch, cooldown clear |
| Workplane 5-video run | PASS as bounded workplane job execution; transcript acquisition 0/5 |
| Job id | 1829 |
| Attempted | 5 |
| Successful transcripts | 0 |
| Failed transcript attempts | 5 |
| Failure class | `transcript_failed` for all five items |
| 429/bot verification | none observed in this run |
| Cooldown after run | clear |
| 25-video batch | not run |

Failed video IDs from the bounded run: `ah5bloSHQfA`, `xHzYk5uXuZc`, `TEW4RInpRYE`, `0WoFlWyviso`, `3Ap3BtmD_2c`.

Operational conclusion: the laptop workplane transport is proven, but source transcript availability/extraction quality still needs monitoring and possibly alternate targeting. Do not promote large batches until repeated 5-video runs produce usable transcript successes without 429/bot cooldowns.

## 4. Gemma / ML status

- `callscore-gemma4-extractor` remains shadow-only.
- Production extractor default remains unchanged.
- Write-canary eligibility remains false.
- Latest improvement moved the failure mode from long timeouts to faster parser/schema mismatch.
- Current next repair: align Gemma Modelfile/schema output with the production extraction schema and add reviewed array-wrapper repair fixtures.
- No Gemma calls were written to production, and no `creator_stats` mutation occurred from Gemma output.

## 5. Whop status

- Whop provider/commercial proof remains certified enough for this private planning phase.
- Whop-auto readiness remains PARTIAL.
- Plan/product/pricing/payment/customer entitlement mutations remain approval-gated.
- Growth intelligence may reference Whop constraints and funnel assumptions, but must not mutate live Whop state.

## 6. Art of War dry-run status

| Check | Result |
|---|---|
| Repo | `/srv/agents/repos/Claude_Code_Automations` |
| `validate-docs` | PASS; 0 failures |
| Dry-run report | Generated at `/tmp/callscore-art-of-war-report-20260612-latest.md` |
| Candidate count | 10 fixture candidates |
| Publish outputs | dry-run/local/null only |
| External mutation | false |

Allowed internal actions:

- strategy brief generation;
- content queue dry-runs;
- campaign plan generation;
- audience research dry-runs;
- creative asset planning;
- publish/spend approval review reports.

Forbidden without approval:

- public publishing;
- email/DM/outreach send;
- paid spend;
- provider mutation;
- aggressive scraping;
- Whop live mutation.

## 7. First 3 internal campaign tracks

### Track 1 — Receipts / Proof of Accuracy

Goal: show that CallScore is evidence-first and source-safe before asking creators or users to trust the leaderboard.

Private assets to draft:

- weekly receipts digest using only official/certified public-safe rows;
- “how a call becomes scoreable” visual explainer;
- internal proof checklist for every claim before publication.

Gate: only use rows with source-safe evidence and approved methodology language.

### Track 2 — Leaderboard Explainer / Methodology Trust

Goal: make the scoring method legible without overclaiming or inviting disputes from unreviewed edge cases.

Private assets to draft:

- homepage leaderboard walkthrough;
- methodology FAQ;
- “what we do not count” explainer: news, quoted third-party calls, aggregation, vague hype.

Gate: Trust review before any public use; no creator-negative phrasing without dispute gate.

### Track 3 — Creator Scorecard Funnel

Goal: prepare a Whop-compatible funnel around creator scorecards without touching live pricing/products.

Private assets to draft:

- creator scorecard teaser;
- Whop plan inventory/readiness checklist;
- dry-run customer journey: discover leaderboard → inspect scorecard → join Whop/community.

Gate: Whop mutation approval required before live entitlement/pricing/product changes.

## 8. Metrics to watch

| Metric | Why it matters |
|---|---|
| transcript success rate | proves laptop collector can refresh data safely |
| 429/bot verification rate | controls collector cooldown and batch size |
| freshness WARN/FAIL state | blocks or clears autonomous cadence |
| unsafeSourceRanks / API unsafeOfficial | must remain zero before any growth activation |
| Gemma JSON/schema pass rate | controls shadow → canary progression |
| Gemma false-positive rate | prevents public ranking contamination |
| Art of War blocked/gated count | measures trust/publish gate pressure |
| Whop readiness status | controls commercial activation sequence |

## 9. Next autonomous actions

Safe immediate actions:

1. Continue private Art of War strategy/report generation from safe read-only CallScore surfaces.
2. Run additional 5-video laptop collector batches only when cooldown is clear and workplane has a safe job.
3. Improve Gemma schema/Modelfile alignment in shadow artifacts only.
4. Generate private drafts for the three campaign tracks above.

Approval-gated actions:

1. Any public publish/send/outreach action.
2. Any paid spend.
3. Any Whop pricing/product/plan/customer entitlement mutation.
4. Any Gemma write-canary or production extractor default change.
5. Any 25-video transcript batch.

Blocked actions:

1. Autonomous revenue activation remains NO until transcript cadence is stable or a transcript-lag policy is explicitly accepted.
2. Public Art of War activation remains blocked until Trust/Publish approval gates are satisfied.

## 10. Explicit safety statement

This pack is private and internal-only. It performed no public action, no outreach, no spend, no provider mutation, no Whop mutation, no Gemma production writes, no creator_stats mutation from Gemma, no destructive production DB operation, and no 25-video transcript run.

---

## 2026-06-12 Controlled Runtime Update

Status labels: `CONTROLLED_AUTONOMOUS_RUNTIME_PARTIAL`, `TRANSCRIPT_CADENCE_PARTIAL`, `DATA_SURFACE_SAFE`, `GEMMA_SHADOW_HOLD`, `GEMMA_NOT_PRODUCTION_DEFAULT`, `ML_LOOP_ACTIVE`, `WHOP_AUTO_PARTIAL`, `ART_OF_WAR_PRIVATE_ACTIVE`, `ART_OF_WAR_PUBLIC_NEEDS_APPROVAL`, `PUBLIC_ACTIONS_APPROVAL_GATED`, `AUTONOMOUS_REVENUE_NO`.

Latest collector evidence: laptop workplane job `1830` attempted 5 videos, stored 0 transcripts, recorded 5 `transcript_failed` outcomes, no 429, no bot verification, cooldown clear. The collector script now records detail previews, classifies more non-rate-limit failures, and skips any recently failed video for 24h.

Latest Gemma evidence: `callscore-gemma4-extractor:latest` was rebuilt from a production-schema Modelfile. The 1-real warm run reduced timeout to parser/schema failure, but produced no valid accepted calls. ML idle report keeps write-canary eligibility false.

Art of War evidence: `validate-docs` passed and `/tmp/callscore-art-of-war-report-20260612-next.md` was generated in dry-run/local/null mode. No public action, outreach, provider mutation, or spend occurred.

Private campaign tracks remain:
1. Receipts / Proof of Accuracy.
2. Leaderboard Explainer / Methodology Trust.
3. Creator Scorecard Funnel.

Next safe action: repair transcript targeting/failure classification before another laptop limit-5 run; continue Art of War private dry-run reporting only.
