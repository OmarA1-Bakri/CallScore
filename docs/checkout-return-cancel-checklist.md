# Checkout return/cancel URL checklist

CallScore now exposes customer-facing post-checkout routes on the canonical domain:

- Success: `https://call-score.com/checkout/success`
- Cancelled: `https://call-score.com/checkout/cancelled`
- Billing help: `https://call-score.com/settings/billing`

The app checkout route (`/api/checkout/[tier]`) redirects to the configured Whop checkout URL and only strips stale `session` query parameters. It does not append guessed provider parameters for return or cancel handling, because the accepted Whop dashboard field names / checkout URL parameters must be verified in Whop before use.

Manual Whop dashboard checklist (do not run from automation):

1. In the Whop dashboard, inspect the CallScore Pro and Alpha checkout/plan configuration.
2. If Whop exposes explicit success / return / redirect and cancel URL fields, set them to the canonical URLs above.
3. If Whop documents URL-level return/cancel parameters for the generated checkout URL, update the `WHOP_CHECKOUT_URL_<TIER>_<INTERVAL>` secret only after confirming the parameter names in Whop documentation or dashboard UI.
4. Keep `https://call-score.netlify.app` only for infrastructure/provider fallback paths that are already configured and required.
5. After any dashboard or secret change, validate the route behavior with `/api/checkout/pro?interval=monthly` and `/api/checkout/alpha?interval=monthly` in a non-mutating preview before production traffic.

Do not use this checklist to change pricing, products, payment provider settings, database state, extraction, recompute, or deploy behavior.
