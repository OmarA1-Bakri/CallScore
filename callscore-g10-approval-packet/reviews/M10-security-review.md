# M10 Security / Gate-Bypass Review

**Verdict:** APPROVE_WITH_FOLLOWUPS  
**Scope:** approval binding, action classification, Workplane-only dispatch, Hermes boundary, credential boundary, redaction, emergency stop.

## Evidence

- 91/91 tests passed after the runtime-binding patch.
- Negative tests cover direct agent/Hermes/router dispatch denial, sensitive action misclassification, missing gate approvals, downscoped gates, expired approvals, payload drift, event order, actor authority, prompt injection, redaction, cost caps, emergency stop, and payout automation denial.

## Security conclusions

- No unresolved high/critical bypass remains in the reviewed MVP layer.
- Hermes remains cockpit-only: no shell/API/dispatch actions are exposed by `hermesAllowedActions`.
- External dispatch is still Workplane-only via `externalDispatchAllowed` actor boundary.
- Approval replay across runtimes is now blocked by direct runtime comparison, payload hash identity, and event-chain runtime checks.
- Production Whop affiliate preview requires both `PRODUCTION_GATE` and `FINANCIAL_GATE`; payout automation remains disabled by default.

## Follow-ups

- P2: Real adapters must keep mutating credentials unavailable outside Workplane-controlled dispatch; current fake adapters do not exercise live credential paths.
- P2: Add integration tests when a real read-only adapter is introduced to prove live status checks cannot mutate third-party state.
