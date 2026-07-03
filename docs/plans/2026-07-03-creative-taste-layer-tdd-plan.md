# CallScore Creative Taste Layer TDD Implementation Plan

Revision: 2026-07-03 reviewer-remediation
Status: First standalone gate slice implemented; production graph wiring remains explicitly out of scope until a separate RED/GREEN integration slice.

Goal: prevent safe-but-drab CallScore public artifacts from being treated as production-ready, without bypassing canonical 51-agent runtime or graph-owned provider gates.

Architecture: upgrade existing canonical owners first. CMO acts as Creative Director/Taste Manager, Art of War strategist as Angle Editor, opportunity research as reference scout, channel heads as writers, existing image/YouTube thumbnail agents as visual workers, reviewer head as final taste/receipt auditor. No new agents in this slice.

## Hard constraints

- No live public/provider/social mutation.
- No DB writes, deploys, Whop/payment/customer/provider mutation, or secrets.
- Do not add new agents in this first slice.
- Do not edit canonical agent mapping, souls, registry, or runtime agent-count files in this slice:
  - `docs/ops/canonical-agent-mapping/callscore_canonical_agent_mapping.source.json`
  - `docs/ops/callscore-channel-head-souls.yaml`
  - `src/lib/autonomy/canonical-operational-runtime.ts`
- Existing owners must be upgraded/remapped first.
- Future new-agent creation requires a separate plan and receipt proving an existing owner cannot absorb the function.
- No direct parent publish/provider calls.
- Any public-ready artifact remains graph-owned and receipt-backed.
- Strict vertical TDD: one behavior RED, minimal GREEN, verify, then next behavior.
- Do not stage or overwrite unrelated dirty files currently in the repo.
- First slice is standalone gate/helper hardening only. Do not claim production graph enforcement until a separate integration test proves the actual owned-public handoff path calls the gate/helper.

## Task-router classification

Categories: testing, backend, frontend/design, workflow governance, documentation.
Complexity: High.
Primary skills: task-router, writing-plans, subagent-driven-development, test-driven-development, callscore-canonical-runtime, parent-verification-of-agent-output.
Supporting skills: social-media/callscore-social-posting-discipline, marketing/callscore-marketing-engine, mlops/langgraph-workplane, media/youtube-content, github/committing-user-work-safely.

## Files

Create/modify in repo:
- `src/lib/workplane/creative-taste-gate.ts`
- `tests/creative-taste-gate.test.ts`
- `src/lib/workplane/public-artifact-provenance.ts`
- `tests/public-artifact-provenance.test.ts`
- `tests/content-quality-gate-regression.test.ts`
- `tests/gtm-complete-execution.test.ts` only if live receipt tests fail from stale/blocked receipt selection.

External runtime script, if regression proves a gap:
- `/srv/agents/hermes/scripts/callscore-content-quality-gate.py`
- Changes here are additive/fail-closed only, must include sha256 in kanban/review notes, and cannot be represented as covered by repo git alone.

## Exact creative gate input contract

`evaluateCreativeTasteGate(input: Record<string, unknown>): CreativeTasteGateDecision`

Recognized fields:
- Copy text sources: `copy`, `exact_copy`, `body`, `post`, `title`, `description`, plus nested channel packet fields under `x`, `linkedin`, `reddit`, `youtube`, `drafts.x`, `drafts.linkedin`, `drafts.reddit`, and `drafts.youtube` using the same copy field names.
- Channel/stage: `channel`, `platform`, `artifact_type`, `artifact_stage`, `stage`, `status`, `public_ready`.
- Evidence arrays: `evidence_refs`, `shared_evidence_refs`, `data_refs`.
- Concrete evidence ref prefixes: `creator:`, `call:`, `stat:`, `score:`, `discourse:`, `product:`, `leaderboard:`, `screenshot:`, `market:`, `video:`.
- Concrete evidence scalar fields: `creator_id`, `call_id`, `stat_id`, `product_screenshot_path`, `leaderboard_snapshot_id`, `discourse_reference_id`.
- Visual proof: `visual_asset.rendered_png_path`, `visual_asset.png_path`, or `visual_asset.path`, plus 64-hex `visual_asset.png_sha256`, `visual_asset.sha256`, or `visual_asset.hash`.
- Mock/clipped visual signals: `visual_asset.is_mock`, `visual_asset.class`, `visual_asset.asset_class`, `visual_asset.visual_class`, `visual_asset.title`, `visual_asset.source`, `visual_asset.render_status`, `visual_asset.status`, `visual_asset.alt_text`, and `visual_asset.alt`.
- YouTube package: `youtube_package.full_script`, `youtube_package.thumbnail.rendered_png_path|png_path|path`, `youtube_package.thumbnail.png_sha256|sha256|hash`.
- Repetition memory: `recent_phrase_memory`.

Public-ready means any of:
- `public_ready === true`
- `artifact_stage|stage|status` equals `production_ready`, `publish_candidate`, or `public_ready`.

## Exact creative gate output contract

```
type CreativeTasteGateDecision = {
  readonly ok: boolean;
  readonly blocker_codes: readonly string[];
  readonly warnings: readonly string[];
  readonly score: number;
  readonly max_score: 45;
  readonly dimension_scores: Record<string, number>;
}
```

`dimension_scores` keys must be exactly:
- `specificity`
- `surprise`
- `evidence_density`
- `channel_native`
- `visual_force`
- `brand_voice`
- `conversion_job`
- `originality`
- `safety`

Score threshold:
- `PUBLIC_READY_SCORE_THRESHOLD = 32`.
- A public-ready artifact with no other blockers but score `< 32` must receive `creative_score_below_threshold` and `ok=false`.
- Non-public/draft artifacts may use score diagnostically but are not promoted to public-ready.

Blocker order is deterministic insertion order:
1. `generic_product_manifesto_blocked`
2. `concrete_evidence_required`
3. `overused_receipts_vibes_scaffold`
4. `public_draft_disclaimer_blocked`
5. `mock_or_placeholder_visual_blocked`
6. `visual_render_proof_required`
7. `youtube_full_script_required`
8. `youtube_rendered_thumbnail_required`
9. `creative_score_below_threshold`

## Exact public artifact provenance contract

`validateCanonicalPublicArtifact(input)` is a standalone helper in this slice, not proof of production graph wiring.

Base required fields for canonical generated public artifact:
- `content_source_type`: `agent_generated` or `workflow_generated`
- `canonical_public_artifact: true`
- `generated_by_designated_workflow: true`
- `workflow_id`
- `agent_id`
- `child_run_id` or `graph_node_run_id`
- `generation_prompt_hash`
- `generation_model_or_agent_run_id`
- `shared_memory_read_receipt_id`
- `shared_memory_write_receipt_id`
- `originality_receipt_id`
- `same_shit_memory_receipt_id`
- `role_voice_guidance_receipt_id`
- `quality_gate_receipt_id`

Non-public source types always block public readiness:
- `fixture`
- `static_example`
- `script_generated`
- `blocked_context_only`

Visual/video/image package extras:
- `visual_brief_receipt_id`
- `visual_qa_receipt_id`
- `copy_visual_coherence_receipt_id`

Generated public-ready/publish-candidate extras:
- canonical `editorial_angle_receipt_id` mapping to `editorial_angle_receipt.v1`
- canonical `platform_fit_receipt_id` mapping to `platform_fit_receipt.v1`
- supplemental `taste_brief_receipt_id`
- supplemental `taste_critique_receipt_id`
- supplemental `creative_package_approval_receipt_id`

Supplemental taste receipts do not replace canonical operational package receipts. Graph handoff remains blocked if any canonical receipt is missing, rejected, blocked, or stale.

## Vertical TDD task list

### T0 plan validation and kanban
- Save plan.
- Commit only plan file.
- Create kanban chain.
- Dispatch spec/code/security plan reviewers.
- If reviewers fail, patch plan before further implementation.

### T1.1 generic manifesto blocker
RED: one test expects `generic_product_manifesto_blocked`.
GREEN: minimal regex/heuristic.
Verify: `node --import tsx --test tests/creative-taste-gate.test.ts`.

### T1.2 concrete evidence blocker
RED: one public-ready test with no accepted evidence refs expects `concrete_evidence_required`.
GREEN: accept concrete ref prefixes/scalar fields.
Verify focused test.

### T1.3 overused phrase blocker
RED: one test with repeated receipts/vibes phrases expects `overused_receipts_vibes_scaffold`.
GREEN: count phrase matches in copy plus recent memory.
Verify focused test.

### T1.4 mock visual blocker
RED: one public-ready visual test with mock/placeholder metadata expects `mock_or_placeholder_visual_blocked`.
GREEN: mock visual detector.
Verify focused test.

### T1.5 rendered visual proof blocker
RED: one public-ready visual test with only SVG/source path expects `visual_render_proof_required`.
GREEN: require rendered PNG path and sha256.
Verify focused test.

### T1.6 draft disclaimer blocker
RED: one public-facing copy test with DRAFT/TEST ONLY/NOT FOR PUBLICATION expects `public_draft_disclaimer_blocked`.
GREEN: disclaimer detector.
Verify focused test.

### T1.7 YouTube full script blocker
RED: one YouTube package with outline/no full script expects `youtube_full_script_required`.
GREEN: require `youtube_package.full_script`.
Verify focused test.

### T1.8 YouTube rendered thumbnail blocker
RED: one YouTube package with SVG thumbnail only expects `youtube_rendered_thumbnail_required`.
GREEN: require rendered thumbnail PNG path and sha256.
Verify focused test.

### T1.9 creative score threshold blocker
RED: one public-ready artifact with concrete evidence/rendered visual but score `<32` expects `creative_score_below_threshold`.
GREEN: add threshold after scoring.
Verify focused test.

### T2 strong pass case
RED: one strong evidence-backed rendered public artifact must pass with score `>=32` and no blockers.
GREEN: minimal scoring calibration.
Verify focused test and typecheck.

### T3.1 public-ready supplemental taste receipt blockers
RED: public-ready generated artifact missing supplemental taste receipts expects:
- `taste_brief_receipt_required`
- `taste_critique_receipt_required`
- `creative_package_approval_receipt_required`
GREEN: add checks only for generated public-ready/publish-candidate artifacts.
Verify provenance test.

### T3.2 canonical editorial/platform receipt blockers
RED: public-ready generated artifact with supplemental taste receipts but no canonical editorial/platform receipts expects:
- `editorial_angle_receipt_required`
- `platform_fit_receipt_required`
GREEN: require both for generated public-ready/publish-candidate artifacts.
Verify provenance test.

### T3.3 visual canonical receipt preservation
RED/GREEN: visual/video/image package tests prove existing visual receipt blockers remain intact:
- `visual_brief_receipt_required`
- `visual_qa_receipt_required`
- `copy_visual_coherence_receipt_required`

### T3.4 non-public artifact non-promotion
RED/GREEN: fixture/static/script/blocked-context artifacts fail public readiness and are not silently promoted.

### T4 content quality regressions
One behavior at a time:
- T4.1 public draft/test disclaimer.
- T4.2 clipped/mock visual metadata.
- T4.3 text-only thought leadership without media proof if not already covered.
- T4.4 repeated generic evidence slogan if not already covered.

If `/srv/agents/hermes/scripts/callscore-content-quality-gate.py` is modified:
- Additive/fail-closed only.
- Record sha256.
- Focused regression must pass.

### T5 live-receipt test helper hardening
Only if full tests fail from stale live receipts:
- RED: failing GTM schema probe selects blocked/single-channel receipt as full final draft.
- GREEN: helper selects newest non-blocked, non-single-channel final draft by mtime and does not require optional X timing.

### T6 parent verification
Run:
```
node --import tsx --test tests/creative-taste-gate.test.ts tests/public-artifact-provenance.test.ts tests/content-quality-gate-regression.test.ts tests/social-originality-gate.test.ts tests/gtm-complete-execution.test.ts
npm run typecheck
npm test
/usr/bin/python3 /srv/agents/hermes/scripts/callscore-canonical-agent-audit.py
```

Completion criteria:
- Parent session reproduces claimed tests.
- `npm test` passes or any unrelated failure is isolated with exact evidence.
- Canonical audit reports exactly 51 mapped agents and status `ok`.
- No public/provider mutation occurred.
- Git staged files are focused.
- Three implementation reviewers PASS, or every FAIL has a patch plus rerun evidence.

### T7 future production wiring slice, not part of this first slice
Required before claiming operational production enforcement:
- RED integration test proving actual owned-public graph/readiness handoff calls `evaluateCreativeTasteGate` and `validateCanonicalPublicArtifact`.
- GREEN graph wiring through LangGraph/Workplane only.
- Receipt evidence that blocked/drab artifacts stop before provider handoff.
- No parent/provider direct mutation.
