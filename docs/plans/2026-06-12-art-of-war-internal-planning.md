# CallScore Art of War Internal Planning Track

Status: **READY FOR INTERNAL GROWTH INTELLIGENCE PACK — NO PUBLIC/EXTERNAL GROWTH ACTIONS**

Date: 2026-06-12

## Purpose

Prepare the internal autonomous growth workplane after the final YouTube transcript-gate closure attempt was isolated as an external YouTube attestation blocker. This track remains limited to private planning, instrumentation, and internal content/funnel preparation. It does not authorize ads, outreach, public posting, provider mutation, or automated external actions.

## Current gating evidence

- Whop commerce route/provider proof is certified for app URL/callback, checkout route behavior, product/plan inventory, entitlement semantics, and webhook decision rationale.
- HH read API and homepage are safe and natively bucketed.
- Creator eligibility/source safety is certified.
- Slow YT-DLP transcript pipeline is structurally ready.
- Transcript acquisition is externally blocked by YouTube attestation after all approved paths failed on one-video canaries:
  - active/readable YouTube cookie;
  - current yt-dlp/EJS runtime;
  - bgutil PO-token provider;
  - browser-attested WPC PO-token provider with Chromium.
- The WPC canary attempted one video only, failed with `bot_verification_required`, and correctly did not trigger the 25-video catch-up.

## Internal-only work that can proceed

1. **Growth intelligence pack**
   - Build a private daily report from certified read API buckets and source stats.
   - Track official/provisional/watchlist deltas, freshness warnings, Whop route status, homepage health, and remaining launch gates.

2. **Content/funnel backlog**
   - Draft private messaging variants for Pro/Alpha positioning.
   - Map creator-leaderboard proof points to landing-page modules.
   - Prepare internal launch checklists without publishing.

3. **Revenue observability follow-up**
   - Implement or explicitly defer signed/idempotent Whop event persistence.
   - Keep live Whop entitlement checks as the current source of truth until that PR lands.

4. **Agentic workplane baseline**
   - Allowed autonomous actions: read-only analytics, private drafts, internal reports, test probes.
   - Blocked actions: paid ads, public outreach, provider pricing/payment changes, external posting, DNS/tunnel mutation.

## External execution gates

External Art of War growth execution remains gated on:

1. transcript canary/catch-up pass, an approved alternative transcript provider, or explicit operator acceptance of a transcript-lagged launch posture;
2. Whop commerce proof staying certified;
3. revenue-event observability follow-up being implemented or explicitly deferred for launch;
4. separate approval for any public/outbound action or paid spend.

## Next safe implementation target

Implement the private **CallScore Growth Intelligence Pack**: a read-only internal report that summarizes current leaderboard buckets, freshness warnings, Whop route health, homepage health, launch-readiness gates, and recommended private content/funnel actions. No external actions.

---

## 2026-06-12 — Controlled internal activation update

Status labels:

- ART_OF_WAR_INTERNAL_READY
- ART_OF_WAR_DRY_RUN_STARTED
- PUBLIC_ACTIONS_APPROVAL_GATED
- DATA_SURFACE_SAFE
- TRANSCRIPT_CADENCE_PARTIAL
- GEMMA_SHADOW_HOLD
- AUTONOMOUS_REVENUE_NO

Updated pipeline boundary:

- HH-native YouTube transcript acquisition remains blocked by YouTube runtime/IP/session attestation.
- The near-term canonical transcript path is Omar's laptop workplane collector over Tailscale, with cookies/session remaining laptop-local.
- Laptop runner command surfaces are install-ready and JSON-safe; live collection from HH is blocked by laptop SSH permissions and must be initiated from Omar's laptop until laptop-side workplane polling is scheduled.
- Default collector batch remains 5 videos; 25-video batches remain explicitly gated and were not run in this pass.
- CallScore public data surface remains safe: unsafe source ranks are 0, API unsafeOfficial is empty, homepage returns HTTP 200, and 30d remains PENDING_MATURITY.

Gemma/ML boundary:

- `callscore-gemma4-extractor:latest` remains shadow-only and is not production default.
- Compact real-transcript shadow profile `callscore-gemma4-shadow-v2-compact` now uses smaller prompt/chunk bounds for HH CPU safety.
- Latest bounded real-transcript run changed the dominant failure mode from timeout to fast parser/schema failure, which is safer for autonomous loops but still not production-ready.
- ML idle improvement now records the exact next repair: align Gemma's shadow prompt/Modelfile output with the production extractor schema or add reviewed parser-repair fixtures.
- Write canary remains ineligible until JSON/schema gates and review gates pass.

Internal Art of War phase scope:

Allowed now:

1. Private growth intelligence pack generation.
2. Local-only War Room reports from fixture/read-only state.
3. Content queue dry-runs.
4. Campaign-plan drafts.
5. Audience research dry-runs that are bounded and provider/robots compliant.
6. Creative asset plans.
7. Publish/spend approval-review reports.

Approval-gated / forbidden without separate approval:

- public publishing;
- outbound email/DM/outreach sends;
- paid spend;
- provider mutation;
- Whop pricing/payment/product/customer mutation;
- Cloudflare/DNS/tunnel changes;
- production extractor default changes;
- Gemma production call writes.

First three internal campaign/draft tracks:

1. **Receipts / Proof of Accuracy** — private drafts using certified official/provisional bucket summaries and no named-negative claims without Trust review.
2. **Leaderboard Explainer / Methodology Trust** — internal content plan explaining official vs provisional vs watchlist and 30d PENDING_MATURITY.
3. **Creator Scorecard Funnel** — private Whop-aware funnel drafts mapping public-safe leaderboard proof to Pro/Alpha checkout routes, with no live provider/customer mutation.

Metrics to watch:

- unsafeSourceRanks and API unsafeOfficial;
- laptop collector cooldown and latest transcript success;
- transcript backlog by recent window;
- Gemma shadow JSON/schema pass rate and timeout/parser-error counts;
- Whop route/provider readiness;
- dry-run content gate counts: auto, draft_only, blocked, gate_required;
- public approval status before any external action.

Dry-run evidence:

- `python3 scripts/art_of_war.py validate-docs` passed in `/srv/agents/repos/Claude_Code_Automations`.
- `python3 scripts/art_of_war.py report --date 2026-06-12 --dry-run --output /tmp/callscore-art-of-war-report-20260612.md` generated a local fixture-only War Room report.
- Report evidence: 10 local story candidates, 10 dry-run publish records, no provider post id, no published URL, no external mutation.

Next safe implementation target:

Build the private CallScore Growth Intelligence Pack as a read-only internal report that joins workplane status, freshness, Whop readiness, Art of War dry-run gate counts, and recommended private content/funnel actions. Keep public execution blocked until explicit approval.
