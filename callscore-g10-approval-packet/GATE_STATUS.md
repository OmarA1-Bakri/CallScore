# CallScore Growth OS Gate Status

| Gate | Status | Evidence | Owner |
|---|---|---|---|
| G0 Scope Lock | in_review | PRD packet and canonical plan created; pending formal verifier acceptance | Product Requirements |
| G1 Workplane Foundation | passed | `cd workplane && npm test && npm run validate` passed: 94 tests; 17 workflows, 19 resources, 11 policies | Workplane Policy |
| G2 Evidence/Artifact Contracts | passed | `cd workplane && npm test && npm run validate` passed: evidence/artifact schemas, claim-source mapping, payload drift, and schema validators green | Artifact Schema + QA |
| G3 Draft Agent Gate | passed | `cd workplane && npm test && npm run validate` passed: draft agents generate valid local artifacts and block publish/send/spend/production/financial actions | Growth/SEO/Digest |
| G4 Trust/Compliance | passed | `cd workplane && npm test && npm run validate` passed: trust/data/right-of-reply/suppression/correction controls green | Security/Compliance |
| G5 Hermes Safety | passed | `cd workplane && npm test && npm run validate` passed: Hermes cannot shell/dispatch, approvals bind to runtime plus payload hash, actor authority, expiry, ordered request/grant events, and canonical gate resolver prevents caller downscoping | DevOps/Hermes |
| G6 Measurement | passed | `cd workplane && npm test && npm run validate` passed: campaign, UTM, performance links, weekly report, and gated recommendations green | Analytics |
| G7 Partner/Financial Safety | passed | `cd workplane && npm test && npm run validate` passed: partner dry-run, mock Whop transport, PRODUCTION plus FINANCIAL gate enforcement, and payout automation block green | Partner/Affiliate |
| G8 Observability | passed | `cd workplane && npm test && npm run validate` passed: event log, manifests, terminal states, unknown-state handling, and replay green | DevOps/Hermes |
| G9 Production Hardening | passed | `cd workplane && npm test && npm run validate` passed: redaction, prompt-injection, cost caps, emergency stop, and queue performance green | Security/DevOps |
| G10 Release | in_progress | Draft-only trust assets, launch batch hashes, release-readiness checks, and G10 launch-pack regression tests exist; pending manual verifier/operator sign-off before any external/public action | QA/Verifier |

Latest verification: `cd workplane && npm test && npm run validate && npm run status && find src tests -name '*.js' -type f -print0 | xargs -0 -n1 node --check` passed on 2026-05-12 UTC with 94 tests.
