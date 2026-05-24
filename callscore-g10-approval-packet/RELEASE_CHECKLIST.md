# CallScore Growth OS Release Checklist


## Evidence Links

- G10 evidence index: `G10_RELEASE_SIGNOFF_EVIDENCE.md`
- Manual sign-off ledger: `G10_SIGNOFF_LEDGER.md`
- Payload approval ledger: `launch-batch/PAYLOAD_APPROVAL_LEDGER.md`
- Independent review synthesis: `reviews/M10-synthesis.md`
- Rollback plan: `launch-batch/ROLLBACK_PLAN.md`
- Launch manifest: `launch-batch/MANIFEST.md`
- G10 launch pack regression tests: `workplane/tests/g10-launch-batch.test.js`
- Remaining blockers: `G10_REMAINING_BLOCKERS.md`

## Pre-Release Gates

- [ ] G0 Scope Lock passed.
- [x] G1 Workplane Foundation passed. Evidence: `GATE_STATUS.md`, `reviews/M10-synthesis.md`.
- [x] G2 Evidence/Artifact Contracts passed. Evidence: `GATE_STATUS.md`, `reviews/M10-synthesis.md`.
- [x] G3 Draft Agent Gate passed. Evidence: `GATE_STATUS.md`, `reviews/M10-synthesis.md`.
- [x] G4 Trust/Compliance passed. Evidence: `GATE_STATUS.md`, `reviews/M10-synthesis.md`.
- [x] G5 Hermes Safety passed. Evidence: runtime-bound approval regression in `reviews/M10-code-review.md`.
- [x] G6 Measurement passed. Evidence: `GATE_STATUS.md`, `reviews/M10-synthesis.md`.
- [x] G7 Partner/Financial Safety passed. Evidence: `GATE_STATUS.md`, `reviews/M10-synthesis.md`.
- [x] G8 Observability passed. Evidence: `GATE_STATUS.md`, `reviews/M10-synthesis.md`.
- [x] G9 Production Hardening passed. Evidence: `GATE_STATUS.md`, `reviews/M10-synthesis.md`.
- [ ] G10 Release Gate approved by Verifier.

## Trust Assets

- [ ] Methodology page drafted and approved.
- [ ] Right-of-reply policy drafted and approved.
- [ ] Correction log drafted and approved.
- [ ] No-investment-advice disclaimer drafted and approved.
- [ ] Sample-size caveat drafted and approved.
- [ ] BinaryBaron brand guide drafted and approved.

## Launch Batch

- [x] 5 creator scorecards generated as drafts. Evidence: `launch-batch/drafts/scorecard_*.json`.
- [x] 5 creator SEO pages generated as drafts. Evidence: `launch-batch/drafts/creator_page_*.json`.
- [x] 1 methodology page generated as draft. Evidence: `launch-batch/drafts/methodology_page.json`.
- [x] 1 weekly digest generated as draft. Evidence: `launch-batch/drafts/weekly_digest.json`.
- [x] 1 correction log page generated as draft. Evidence: `launch-batch/drafts/correction_log_page.json`.
- [x] 1 GitHub methodology repo draft prepared. Evidence: `launch-batch/drafts/github_methodology_repo.json`.

## Final Controls

- [ ] Payload hashes approved for exact targets.
- [x] Rollback plan exists. Evidence: `launch-batch/ROLLBACK_PLAN.md`.
- [x] Emergency stop tested. Evidence: `workplane/tests/g9-hardening.test.js`, 94-test verification run.
- [x] No unresolved high/critical risk remains. Evidence: `reviews/M10-synthesis.md`.
- [ ] No external action occurs before exact gate and Hermes approval.
