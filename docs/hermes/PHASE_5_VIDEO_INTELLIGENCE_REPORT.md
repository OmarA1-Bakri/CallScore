# Phase 5 Video Intelligence Workflow Report — CallScore

Generated: 2026-06-18
Repository: `/opt/crypto-tuber-ranked`
Phase: 5 — Call extraction/video intelligence workflow
Gate: Hard Gate 5

## Summary

Phase 5 added the first CallScore-native workflow built on the Phase 4 runtime: `video_intelligence_workflow`.

The workflow processes a fixture video/transcript into immutable artifacts:

```text
video_metadata
  → transcript_raw
  → transcript_segments
  → candidate_calls
  → normalized_calls
  → validation_report
  → approval_gate_if_required
```

No final `calls` rows are written. No scoring, leaderboard publication, Whop behavior, production DB mutation, cron schedule, deploy, or provider/customer/payment state was changed.

## Files changed

```text
src/lib/video-intelligence/types.ts
src/lib/video-intelligence/transcript-segments.ts
src/lib/video-intelligence/extract-candidate-calls.ts
src/lib/video-intelligence/normalize-calls.ts
src/lib/video-intelligence/validate-evidence.ts
src/lib/workflows/video-intelligence.ts
tests/video-intelligence-workflow.test.ts
docs/hermes/PHASE_5_VIDEO_INTELLIGENCE_REPORT.md
```

## Implementation details

### Transcript segmentation

`segmentTranscript` deterministically splits transcript text into stable segment objects:

```text
id
index
startChar
endChar
text
```

### Candidate extraction

`extractCandidateCalls` is deterministic/rule-based for Phase 5 tests. It detects supported crypto assets and creator-owned forward-looking call language while rejecting guest/news/ambiguous/non-call cases.

Supported aliases include:

```text
BTC / Bitcoin / XBT
ETH / Ethereum
SOL / Solana
LINK / Chainlink
DOGE / Dogecoin
ADA / Cardano
```

The workflow still records an `agent_invocation` for the extraction node with:

```text
provider=deterministic_fixture
model=rule-based-v1
promptVersion=callscore.video_intelligence.v1
```

This preserves the control-plane model/prompt/version audit slot without depending on a live LLM provider in tests.

### Normalization

`normalizeCalls` maps assets to supported market symbols:

```text
BTC → BTCUSDT
ETH → ETHUSDT
SOL → SOLUSDT
LINK → LINKUSDT
DOGE → DOGEUSDT
ADA → ADAUSDT
```

Rejected, unsupported, or low-confidence calls are marked for approval/review instead of being promoted into final business state.

### Evidence validation

`validateEvidence` checks:

```text
- evidence segment exists
- quote is contained in evidence segment
- accepted calls have confidence >= 0.70
- accepted calls have supported market symbols
```

If validation finds issues or normalized calls require approval, the workflow creates a durable `approval_gates` row and pauses.

## Hard Gate 5 checklist

Passed:

```text
1. Fixture transcript produces candidate call artifact.
2. Fixture transcript produces normalized call artifact.
3. Evidence-linked artifact chain is written.
4. Low-confidence/rejected case creates approval gate and pauses workflow.
5. High-confidence fixture completes without final calls table writes.
6. Targeted tests pass.
7. Typecheck and lint pass.
```

## Validation

Targeted validation log:

```text
/opt/crypto-tuber-ranked/.tmp/hermes-phase5/phase5-targeted-20260618T183845Z.log
```

Commands passed:

```text
npm run typecheck
npm run lint
node --import tsx --test tests/video-intelligence-workflow.test.ts tests/workflow-runtime.test.ts
```

Results:

```text
typecheck: passed
lint: passed
targeted tests: 9 passed, 0 failed
```

Full-suite validation is deferred to the final all-phases gate to avoid repeating the same expensive suite after every approved remaining phase.

## Known risks

1. Extraction is deterministic/rule-based for Phase 5 fixture safety.
   - Production LLM extraction can be plugged into the same node later while preserving artifact/approval boundaries.

2. Workflow does not write final `calls` rows.
   - This is intentional. Phase 6/8 must keep deterministic scoring/persistence boundaries separate from agent extraction.

3. Approval resume is still not implemented.
   - Phase 5 creates/pauses on gates; a future admin path can resume.

4. Evidence spans are artifact content, not first-class rows.
   - This remains acceptable until UI/query requirements force row-level evidence segment indexing.

## Hard Gate 5 status

Status: passed.

Continuing automatically because Omar approved all remaining phases.
