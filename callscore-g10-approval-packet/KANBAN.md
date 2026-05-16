# CallScore Growth OS Macro Kanban

**Last updated:** 2026-05-13T05:06:31Z  
**Board owner:** OMX/Codex lead agent  
**Source of truth:** `ENTERPRISE_IMPLEMENTATION_PLAN.md`, `GATE_STATUS.md`, `workplane/` verification output  
**Stop rule:** no publish/send/spend/production mutation/live third-party call/money movement without Workplane gate pass and exact Hermes/operator approval.

## Legend

- `TODO` — not started or needs explicit owner.
- `IN_PROGRESS` — active focus.
- `REVIEW` — implemented but needs independent review/sign-off.
- `BLOCKED` — cannot advance without missing authority/evidence.
- `DONE` — verified locally with evidence.

## Macro Board

| ID | Status | Lane | Item | Owner | Evidence / Next action |
|---|---|---|---|---|---|
| M0 | REVIEW | Product Requirements | G0 scope lock and non-goals formal acceptance | Product Requirements + Verifier | PRD packet exists; `GATE_STATUS.md` says `in_review`. Next: verifier acceptance or explicit change list. |
| M1 | DONE | Workplane Policy | G1 Workplane foundation | Workplane Policy | `cd workplane && npm test && npm run validate` green; registry has 6 runtimes / 17 workflows / 19 resources / 11 policies. |
| M2 | DONE | Artifact Schema + QA | G2 evidence/artifact contracts | Artifact Schema + QA | 91 tests green; evidence/artifact schemas and payload drift tests pass. |
| M3 | DONE | Growth / SEO / Digest | G3 draft agent gate | Growth/SEO/Digest | Draft agents are local/draft-only and block sensitive action classes in tests. |
| M4 | DONE | Security / Compliance | G4 trust/compliance | Security/Compliance | Trust/data/right-of-reply/suppression/correction tests pass. |
| M5 | DONE | DevOps / Hermes | G5 Hermes safety | DevOps/Hermes | Hermes cockpit-only boundary, exact payload approvals, actor authority, and ordered events pass. |
| M6 | DONE | Analytics | G6 measurement | Analytics | Campaign, UTM, artifact performance links, reports, gated recs pass. |
| M7 | DONE | Partner / Affiliate | G7 partner/financial safety | Partner/Affiliate | Partner dry-run, mock Whop, PRODUCTION+FINANCIAL gates, payout block pass. |
| M8 | DONE | Observability | G8 observability | DevOps/Hermes | Event log, manifests, terminal state, replay tests pass. |
| M9 | DONE | Security / DevOps | G9 production hardening | Security/DevOps | Redaction, prompt injection, cost caps, emergency stop, queue perf pass. |
| M10 | DONE | QA / Verifier | Independent review of implemented Workplane layer | QA/Verifier + Code/Security reviewers | M10 review reports complete; runtime approval-binding gap fixed; 94 tests, validate, read-only status, launch-hash verification, and node --check passed. |
| M11 | BLOCKED | QA / Verifier | G10 release sign-off pack | QA/Verifier | All automated/local prep complete and clean; see `G10_REMAINING_BLOCKERS.md` for human approvals required before DONE. |
| M12 | TODO | DevOps / Hermes | Next implementation slice decision | Architect + Workplane Policy | Choose between G10 launch pack, real read-only adapters, or program-control-office tracking after review. |

## Review Workstream Checklist

| ID | Status | Review lane | Scope | Suggested tool/agent | Completion evidence |
|---|---|---|---|---|---|
| R1 | DONE | Code correctness | `workplane/src/**`, `workplane/tests/**` implementation against plan | `code-review` skill | `reviews/M10-code-review.md`; runtime binding gap fixed. |
| R2 | DONE | Security/gate bypass | Approval binding, action classification, credential boundary, event order, secrets redaction | `security-review` skill | `reviews/M10-security-review.md`; no unresolved high/critical bypasses. |
| R3 | DONE | Test adequacy | Negative cases, false positives, missing gate tests, release readiness tests | Local verification | `reviews/M10-test-contract-review.md`; 94 tests passed after runtime replay and G10 launch-pack regressions. |
| R4 | DONE | Architecture/next phase | Whether to move to G10, real read-only adapters, or program-control-office | Ralplan review | `reviews/M10-architecture-gate-review.md`; recommends M11/G10 sign-off pack next. |
| R5 | DONE | Documentation consistency | Plan, gate status, release checklist, trust assets, README drift | Docs review | `reviews/M10-documentation-board-review.md` and `reviews/M10-synthesis.md`. |

## M11 / G10 Sign-off Pack Checklist

| ID | Status | Item | Evidence / blocker |
|---|---|---|---|
| G10-1 | DONE | Evidence index assembled | `G10_RELEASE_SIGNOFF_EVIDENCE.md` |
| G10-2 | DONE | Manual sign-off ledger template created | `G10_SIGNOFF_LEDGER.md` |
| G10-3 | DONE | Payload approval ledger template created | `launch-batch/PAYLOAD_APPROVAL_LEDGER.md` |
| G10-4 | DONE | Release checklist linked to evidence | `RELEASE_CHECKLIST.md` |
| G10-4a | DONE | Local launch-batch drafts generated | 14 draft action hashes in `launch-batch/drafts/launch_actions.json`; `tests/g10-launch-batch.test.js` passes; no external actions approved. |
| G10-5 | BLOCKED | Formal G0 scope lock acceptance | Needs human verifier/product acceptance. |
| G10-6 | BLOCKED | Trust asset approvals | Needs verifier/operator approval. |
| G10-7 | BLOCKED | Exact payload hash + target approvals | 14 draft hashes generated in `launch-batch/PAYLOAD_APPROVAL_LEDGER.md`; still needs Hermes/operator approvals; automated tests prove dispatch remains blocked without them. |
| G10-8 | BLOCKED | G10 verifier/operator final sign-off | Depends on G10-5 through G10-7. |
| G10-9 | DONE | Automated/local verification complete | 94 tests, validate, read-only status, node --check, and launch hash verification pass. |

## Next Update Rules

1. Update this file whenever a review lane starts, completes, or is blocked.
2. Do not mark G10 done until release checklist and manual verifier/operator sign-off are present.
3. Any high/critical review finding creates a new `M*` remediation row and blocks M11.
