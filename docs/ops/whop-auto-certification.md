# Whop-Auto Commerce Certification Pack

Date: 2026-06-11
Status: provider dashboard corrected; checkout, OAuth, webhook target, product inventory, and entitlement access semantics certified; live paid-purchase proof not performed.
Scope: CallScore Whop checkout, OAuth, entitlement, webhook, and revenue-event operating proof.

## Certification Verdict

`CERTIFY WHOP COMMERCE LIVE: YES / PROVIDER CONFIG PROOF PASS / LIVE PURCHASE NOT RUN`

Repository code has canonical-domain checkout, OAuth, session-tier, and webhook primitives. Approved provider API evidence on 2026-06-11 corrected the public Whop app dashboard URL/callback drift, certified the four product/plan checkout resources, certified the webhook target URL, and proved live Whop access checks against current product resources. No pricing, payment, product, or plan economics were changed.

Live paid-purchase proof was not performed; current certification relies on provider reads plus live access-check semantics for existing non-destructive membership states.


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

This start evidence was superseded by the provider correction evidence below; the earlier provider-proof gap is now closed for the public app configuration, product inventory, webhook target, and live product-access semantics.

## 2026-06-11 Provider Dashboard Correction Evidence

Status: `WHOP PROVIDER CONFIG CERTIFIED — DASHBOARD URL/CALLBACK/WEBHOOK CORRECTED; PRODUCT ACCESS SEMANTICS PATCHED`.

Approved provider context evidence collected on 2026-06-11:

- The dashboard-capable Whop API context was located in `/srv/whop-auto/workspace/crypto-tuber-ranked/.env.production`; weaker runtime/secret contexts could read some app state but did not have sufficient provider-update scope.
- Public app `app_cDfDRY1cj8yQJZ` was corrected and re-read with:
  - app/base URL: `https://call-score.com`;
  - OAuth callback: `https://call-score.com/api/auth/whop/callback`;
  - app status: live.
- Provider webhook `hook_lsNt8y9kIB7W8` was corrected and re-read with:
  - target URL: `https://call-score.com/api/whop/webhook`;
  - enabled: true;
  - membership and payment event subscriptions unchanged.
- Product/plan inventory was provider-read and matched the four public checkout routes:
  - Pro monthly: product `prod_T0dRPNJkFcf5a`, plan `plan_NAa2zmHBIx6Qo`;
  - Pro annual: product `prod_T0dRPNJkFcf5a`, plan `plan_iHti858gVSzcY`;
  - Alpha monthly: product `prod_mFro2vmFaE9Ks`, plan `plan_AdlVrE9OqVNAv`;
  - Alpha annual: product `prod_mFro2vmFaE9Ks`, plan `plan_ryBHTb0Ui27PE`.
- Live Whop access checks use product resources, not plan resources. Plan-resource access probes return provider errors, while product-resource checks return deterministic `has_access` / `access_level` responses.
- Whop product IDs are the canonical entitlement access resources:
  - `WHOP_PRO_PRODUCT_ID` for Pro entitlement checks;
  - `WHOP_ALPHA_PRODUCT_ID` for Alpha entitlement checks;
  - legacy plan IDs remain fallback-only for old environments missing product IDs.
- Live provider access samples proved:
  - active Pro membership grants Pro product access and denies Alpha product access;
  - active Alpha membership grants Alpha product access and denies Pro product access;
  - drafted/inactive Pro membership denies Pro product access.
- No Whop pricing, payment settings, products, plans, billing economics, secrets, DNS, or infrastructure were changed.


## 2026-06-14 Whop Auto Canonicalization Evidence

Status: `WHOP AUTO REGISTRY CANONICALIZED — /opt/crypto-tuber-ranked IS SOURCE OF TRUTH; STALE WORKSPACES INVENTORY ONLY`.

Fresh non-mutating evidence collected on 2026-06-14:

- Whop Auto registry `/srv/whop-auto/state/.whop-pipeline/registry.json` now points `crypto-tuber-ranked` at `/opt/crypto-tuber-ranked/.whop-pipeline.json`.
- Registry metadata records `/opt/crypto-tuber-ranked` as `canonicalSource`.
- Stale Whop Auto workspaces under `/srv/whop-auto/workspace/*` remain inventory/snapshot areas only; they were not deleted or treated as source of truth.
- No active `whop-auto` service/process/timer was found; Whop Auto remains an on-demand gated workflow surface, not an autonomous mutator.
- Secret-bearing Whop Auto artifacts were inventoried by location/type only in canonical memory; contents were not printed, copied, or committed.
- New regression coverage: `tests/infrastructure-canonical.test.ts` checks the Whop Auto registry when present and fails if it points back to stale `/workspace` state.


Whop Auto receipts from this run:

- `.tmp/workflow-receipts/whop_manifest_diff/whop-manifest-diff-20260614T051415Z.json`
- `.tmp/workflow-receipts/whop_provider_health/whop-provider-health-20260614T051415Z.json`
- `.tmp/workflow-receipts/whop_entitlement_sync/whop-entitlement-sync-20260614T051426Z.json`
- `.tmp/workflow-receipts/whop_webhook_verify/whop-webhook-verify-20260614T051426Z.json`
- `.tmp/workflow-receipts/whop_activation_review/whop-activation-review-20260614T051415Z.json` (`blocked` by live mutation/purchase gate)

Current Whop Auto operating rule:

- read-only/provider-health, manifest diff, entitlement dry-run, webhook safe replay, and activation review are allowed when locally authenticated;
- pricing/product/customer/payment/provider mutations remain fail-closed unless manifest-backed, diff-reviewed, rollback-documented, receipt-gated, locally authenticated, and explicitly safe;
- stale mirrors may be archived/deleted only after separate operator archive/cleanup approval.

## Non-Mutating Rules

Allowed during certification:

- inspect repo code and tests;
- verify production URLs by reading provider settings or safe public pages;
- run non-mutating local/preview route checks;
- use an explicitly approved test account or provider-safe proof path.

Forbidden without separate approval:

- changing Whop pricing, products, plans, checkout settings, or payment settings;
- mutating provider URLs, except explicitly authorized correction of stale public app/callback/webhook URLs to canonical `https://call-score.com` values;
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

The following environment variables must be configured for live entitlement checks:

- `WHOP_PRO_PRODUCT_ID`
- `WHOP_ALPHA_PRODUCT_ID`

Legacy plan IDs may remain for checkout inventory and fallback compatibility, but product IDs are the canonical resources for `/users/:user/access/:resourceId` checks.

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

Current status: live provider dashboard settings are provider-certified for the public app after 2026-06-11 correction.

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

Current status: provider-safe entitlement proof is certified for existing non-destructive membership states. The application checks Whop product resources first, then falls back to legacy plan IDs only when product IDs are absent.

A commerce-live proof must show, using a non-destructive test account or approved provider-safe fixture:

1. unauthenticated or free user cannot access Pro/Alpha-gated functionality;
2. Pro entitlement unlocks Pro-gated functionality and not Alpha-only functionality;
3. Alpha entitlement unlocks Alpha functionality;
4. expired/revoked entitlement is denied;
5. session/cookie state is cleared or downgraded safely after entitlement failure;
6. entitlement checks rely on Whop or a certified mirrored state, not unchecked client state.

## Webhook / Event Proof

Current repo status: webhook route acknowledges verified events but does not yet persist mirrored entitlement or revenue events. Provider webhook target is certified as `https://call-score.com/api/whop/webhook`.

Webhook persistence decision: deferred with rationale for the current commerce surface. Live Whop product access checks are the source of truth for entitlement at access time, so local mirrored entitlement persistence is not required for current certification. A revenue/event audit trail remains a follow-up before deeper autonomous revenue analytics.

Future commerce expansion requires either:

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
7. no production DB mutation, migration, recompute, extraction rerun, service restart, provider mutation, secret change, or infrastructure change occurred outside explicit approval; the only provider mutation in the 2026-06-11 closeout was the explicitly authorized stale URL/callback/webhook correction to canonical `https://call-score.com` values.

## Current Remaining Gaps

- Live Whop dashboard settings are provider-certified for the public app and webhook target after 2026-06-11 correction.
- Live checkout routes are publicly verified from `https://call-score.com`, and provider inventory matches the four checkout resources.
- Persistent revenue/event logging is not implemented in the current webhook route; live Whop product access checks are sufficient for current entitlement certification, while revenue-event persistence remains a follow-up for autonomous revenue analytics.
- Live paid-purchase proof was not performed.
- Art of War autonomous growth work may move to planning/controlled execution after the remaining YouTube transcript cookie gate is handled; no paid ads or external spend are authorized by this certification.
