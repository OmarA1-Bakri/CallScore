# Whop-Auto Commerce Certification Pack

Date: 2026-06-11
Status: repo-ready certification pack; live provider proof still required
Scope: CallScore Whop checkout, OAuth, entitlement, webhook, and revenue-event operating proof.

## Certification Verdict

`CERTIFY WHOP COMMERCE LIVE: PARTIAL / ROUTE PROOF PASS / PROVIDER PROOF REQUIRED`

Repository code has canonical-domain checkout, OAuth, session-tier, and webhook primitives. This pack does not certify live Whop dashboard configuration, live payments, or live entitlement behavior until provider-safe proof is collected.


## 2026-06-11 Safe Certification Start Evidence

Status: `WHOP-AUTO CERTIFICATION STARTED — REPO TESTS PASS; PUBLIC ROUTE PROOF PASS; PROVIDER PROOF STILL REQUIRED`.

Fresh non-mutating evidence collected on 2026-06-11:

- Local Whop certification route/auth/webhook tests passed: `node --import tsx --test tests/checkout-route.test.ts tests/whop-oauth.test.ts tests/auth.test.ts tests/premium.test.ts tests/whop-webhook-route.test.ts tests/post-checkout-ux.test.ts tests/site-url.test.ts tests/whop-certification-pack.test.ts` -> 34/34 passing.
- Public checkout route probes on `https://call-score.com` returned `303` and `cache-control: no-store` for:
  - `/api/checkout/pro?interval=monthly`;
  - `/api/checkout/pro?interval=annual`;
  - `/api/checkout/alpha?interval=monthly`;
  - `/api/checkout/alpha?interval=annual`.
- Each checkout route redirects to a Whop-hosted checkout URL and does not forward stale `session=` query state.
- Public OAuth start probe returned a Whop OAuth redirect using canonical callback `https://call-score.com/api/auth/whop/callback`.
- Public session route returned `200` with `cache-control: no-store`.
- No Whop provider mutation, payment/pricing change, secret rotation, infrastructure change, live purchase, or production DB mutation was performed.

Certification remains partial because the repo/runtime evidence still does not prove live Whop dashboard settings, live entitlement/revocation behavior, or whether signed webhook events must be persisted for the certified product surface.

## Non-Mutating Rules

Allowed during certification:

- inspect repo code and tests;
- verify production URLs by reading provider settings or safe public pages;
- run non-mutating local/preview route checks;
- use an explicitly approved test account or provider-safe proof path.

Forbidden without separate approval:

- changing Whop pricing, products, plans, checkout settings, or payment settings;
- rotating or printing secrets;
- changing Netlify, Cloudflare, DNS, tunnels, or infrastructure;
- mutating production DB;
- running migrations, stats recomputes, extraction reruns, or worker restarts;
- running live purchase tests that incur charges or alter a real customer account without explicit approval.

## Repo Evidence Anchors

| Surface | Repo anchor | Required behavior |
| --- | --- | --- |
| Checkout route | `src/app/api/checkout/[tier]/route.ts` | Redirect only to configured Whop checkout URL; no guessed return/cancel params; strips stale `session` query param; `cache-control: no-store`. |
| Checkout tests | `tests/checkout-route.test.ts` | Pro monthly, pro annual, alpha monthly, alpha annual route coverage. |
| Canonical URLs | `src/lib/site.ts`, `tests/site-url.test.ts` | Production success/cancel/billing URLs resolve to `https://call-score.com`. |
| OAuth URL | `src/lib/whop-oauth.ts`, `tests/whop-oauth.test.ts` | Production callback resolves to `https://call-score.com/api/auth/whop/callback`. |
| OAuth callback | `src/app/api/auth/whop/callback/route.ts` | Validates state, exchanges code, resolves tier, creates session, redirects safely. |
| Tier gating | `src/lib/whop.ts`, `tests/premium.test.ts` | `alpha` >= `pro` >= `free`; legacy `elite` maps to `alpha`. |
| Whop iframe token | `src/lib/whop-iframe.ts`, `tests/auth.test.ts` | Rejects missing user token/app id; verifies Whop iframe context when configured. |
| Webhook route | `src/app/api/whop/webhook/route.ts`, `tests/whop-webhook-route.test.ts` | Rejects bad signatures when a key is configured; accepts signed JSON; does not yet mirror persistent entitlement. |
| Post-checkout UX | `src/app/checkout/success/page.tsx`, `src/app/checkout/cancelled/page.tsx`, `tests/post-checkout-ux.test.ts` | Buyer gets canonical success/cancel recovery paths and Whop billing clarity. |

## Required Checkout URL Inventory

The following environment variables must be configured to Whop-generated checkout URLs before commerce-live certification:

- `WHOP_CHECKOUT_URL_PRO_MONTHLY`
- `WHOP_CHECKOUT_URL_PRO_ANNUAL`
- `WHOP_CHECKOUT_URL_ALPHA_MONTHLY`
- `WHOP_CHECKOUT_URL_ALPHA_ANNUAL`

Validation command after configuration, using preview or production as explicitly approved:

```bash
for path in \
  '/api/checkout/pro?interval=monthly' \
  '/api/checkout/pro?interval=annual' \
  '/api/checkout/alpha?interval=monthly' \
  '/api/checkout/alpha?interval=annual'
do
  curl -sI "https://call-score.com${path}" | sed -n '1p;/^location:/Ip;/^cache-control:/Ip'
done
```

Expected:

- `303` redirect;
- `location` points to the corresponding Whop checkout URL;
- no stale `session=` parameter is forwarded;
- `cache-control: no-store` is present.

## Required Provider Dashboard Proof

Collect evidence without printing secrets:

1. Whop app OAuth callback URL is exactly `https://call-score.com/api/auth/whop/callback`.
2. Whop success / return URL is exactly `https://call-score.com/checkout/success` if Whop exposes the field.
3. Whop cancel URL is exactly `https://call-score.com/checkout/cancelled` if Whop exposes the field.
4. Product/plan inventory exists for pro monthly, pro annual, alpha monthly, alpha annual.
5. Checkout URLs in Netlify/runtime env correspond to those four active Whop plans.
6. No Vercel, localhost, Tailscale-only, preview-only, or stale dev URLs remain in customer-facing Whop settings.
7. Webhook target is `https://call-score.com/api/whop/webhook` or the approved canonical production endpoint.
8. Webhook signing is configured and bad signatures are rejected.

## Entitlement Proof

A commerce-live proof must show, using a non-destructive test account or approved provider-safe fixture:

1. unauthenticated or free user cannot access Pro/Alpha-gated functionality;
2. Pro entitlement unlocks Pro-gated functionality and not Alpha-only functionality;
3. Alpha entitlement unlocks Alpha functionality;
4. expired/revoked entitlement is denied;
5. session/cookie state is cleared or downgraded safely after entitlement failure;
6. entitlement checks rely on Whop or a certified mirrored state, not unchecked client state.

## Webhook / Event Proof

Current repo status: webhook route acknowledges verified events but does not yet persist mirrored entitlement or revenue events.

Commerce-live certification requires either:

- proof that entitlement is verified live from Whop on access and webhook mirroring is not required for the certified product surface; or
- a follow-up PR that persists signed Whop membership/revenue events with idempotency, replay protection, observability, and tests.

Minimum webhook certification checks:

```bash
node --import tsx --test tests/whop-webhook-route.test.ts
```

Expected:

- unsigned events reject when `WHOP_WEBHOOK_KEY` is configured;
- signed JSON events return `{ "ok": true }`;
- invalid JSON returns `400`.

## Commerce-Live Definition Of Done

`CERTIFY WHOP COMMERCE LIVE: YES` only when all are proven:

1. checkout URLs for pro monthly, pro annual, alpha monthly, alpha annual route correctly;
2. OAuth callback, success, cancel, and billing URLs use `https://call-score.com`;
3. entitlement verification works for free/pro/alpha/revoked states;
4. webhook/event behavior is either certified as not required for entitlement or implemented with signed, idempotent event logging;
5. no stale provider URLs remain;
6. tests pass:
   - `node --import tsx --test tests/checkout-route.test.ts tests/whop-oauth.test.ts tests/auth.test.ts tests/premium.test.ts tests/whop-webhook-route.test.ts tests/post-checkout-ux.test.ts tests/site-url.test.ts`
   - `npm test`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
7. no production DB mutation, migration, recompute, extraction rerun, service restart, provider mutation, secret change, or infrastructure change occurred outside explicit approval.

## Current Remaining Gaps

- Live Whop dashboard settings are not provider-certified in this repo patch.
- Live checkout routes are publicly verified from `https://call-score.com`; provider dashboard inventory/settings still require provider proof.
- Persistent revenue/event logging is not implemented in the current webhook route; certification must decide whether live Whop access checks are sufficient or whether signed event persistence is required.
- Entitlement mirror/revocation behavior needs a certified live or fixture-backed proof.
- Art of War autonomous growth work remains gated on Whop commerce certification; no public growth actions should run before that gate is closed.
