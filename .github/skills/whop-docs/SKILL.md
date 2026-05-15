---
name: whop-docs
description: "Use when: answering Whop documentation questions, integrating Whop APIs or SDKs, checking Whop endpoints, webhooks, OAuth, app views, payments, checkout, memberships, products, plans, platform payouts, Whop MCP, or embedded Whop components. Always verify against live Whop docs before implementation."
---

# Whop Docs

Use this skill as the Whop documentation lookup layer for app, API, SDK, payments, and platform work.

## Ground Rules

- Fetch the live documentation index first: `https://docs.whop.com/llms.txt`.
- Prefer the linked `.md` documentation pages from the index over rendered HTML pages.
- Do not invent endpoint names, event names, headers, SDK methods, or permission strings.
- Treat local notes as hints, not authority. If local code or older skills disagree with current Whop docs, call out the mismatch and verify before editing.
- Never print API keys, OAuth tokens, webhook secrets, or `.env` contents.
- Stop for explicit approval before creating paid campaigns, products, plans, promo codes, affiliates, payments, payouts, webhooks, production app URLs, or other live Whop resources.

## Fast Lookup

From the repo root, search the Whop docs index with the tracked skill copy:

```bash
node .github/skills/whop-docs/scripts/search-whop-docs.mjs "webhook membership"
```

Current local agent runtimes may also have an ignored mirror at `.agents/skills/whop-docs`:

```bash
node .agents/skills/whop-docs/scripts/search-whop-docs.mjs "webhook membership"
```

From the `whop_auto` automation plugin root, use the workflow-local copy:

```bash
node skills/whop-docs/scripts/search-whop-docs.mjs "webhook membership"
```

Use the returned URLs as the next docs pages to fetch. If the script is unavailable, fetch `https://docs.whop.com/llms.txt` directly and search within it.

## Source Map

Start with these verified entry points:

- Docs home: `https://docs.whop.com/`
- LLM index: `https://docs.whop.com/llms.txt`
- API getting started: `https://docs.whop.com/developer/api/getting-started.md`
- OpenAPI spec: `https://app.stainless.com/api/spec/documented/whopsdk/openapi.documented.yml`
- Authentication guide: `https://docs.whop.com/developer/guides/authentication.md`
- OAuth guide: `https://docs.whop.com/developer/guides/oauth.md`
- Permissions guide: `https://docs.whop.com/developer/guides/permissions.md`
- Webhooks guide: `https://docs.whop.com/developer/guides/webhooks.md`
- App views: `https://docs.whop.com/developer/guides/app-views.md`
- Development proxy: `https://docs.whop.com/developer/guides/dev-proxy.md`
- Iframe SDK: `https://docs.whop.com/developer/guides/iframe.md`
- Checkout embed: `https://docs.whop.com/payments/checkout-embed.md`
- Whop elements: `https://docs.whop.com/sdk/elements/whop-elements.md`
- MCP guide: use `https://mcp.whop.com/mcp` and `https://mcp.whop.com/sse` for endpoint references; search the index for `ai_and_mcp` for background docs.

API reference pages discovered from `llms.txt` include:

- Apps: `https://docs.whop.com/api-reference/apps/list-apps.md`, `create-app.md`, `retrieve-app.md`, `update-app.md`
- Webhooks: `https://docs.whop.com/api-reference/webhooks/list-webhooks.md`, `create-webhook.md`, `retrieve-webhook.md`, `update-webhook.md`, `delete-webhook.md`
- Users and access: `https://docs.whop.com/api-reference/users/check-access.md`, `retrieve-user.md`, `list-users.md`
- Products and plans: `https://docs.whop.com/api-reference/products/list-products.md`, `create-product.md`, `https://docs.whop.com/api-reference/plans/list-plans.md`, `create-plan.md`
- Memberships and members: `https://docs.whop.com/api-reference/memberships/list-memberships.md`, `retrieve-membership.md`, `https://docs.whop.com/api-reference/members/list-members.md`
- Payments and refunds: `https://docs.whop.com/api-reference/payments/list-payments.md`, `create-payment.md`, `retrieve-payment.md`, `refund-payment.md`
- Checkout configurations: `https://docs.whop.com/api-reference/checkout-configurations/list-checkout-configurations.md`, `create-checkout-configuration.md`
- Companies and platform accounts: `https://docs.whop.com/api-reference/companies/list-companies.md`, `create-company.md`, `create-child-company-api-key.md`
- Transfers and payouts: `https://docs.whop.com/api-reference/transfers/create-transfer.md`, `https://docs.whop.com/api-reference/account-links/create-account-link.md`

## Lookup Workflow

1. Restate the Whop surface being touched: API, SDK, embedded app, webhook, payment, platform payout, marketplace/growth, or MCP.
2. Search `llms.txt` for the exact noun and verb involved, such as `membership activated`, `checkout configuration`, `check access`, or `app views`.
3. Fetch two sources before implementation: the task-specific guide and the exact API reference page or OpenAPI path.
4. Record the docs URLs used in your answer or implementation notes.
5. Compare with local code, especially Whop helpers, webhook verification, env names, and route handlers. Preserve existing production contracts unless the docs prove they are stale and the user wants a migration.
6. If touching frontend and backend code, invoke the `frontend-backend-integration` workflow and keep the contract/test gates intact.

## Current API Notes

- The current API getting started page says public API calls use `https://api.whop.com/api/v1` and authenticated requests use `Authorization: Bearer <API_KEY>`.
- Some local automation notes or older project code may mention other API versions. Treat that as historical until the current docs or OpenAPI spec confirms it.
- SDK installs from the docs include `@whop/sdk` for TypeScript/JavaScript, plus Python and Ruby SDKs.

## Output Contract

When this skill is used, return:

- The Whop docs pages consulted.
- The confirmed endpoint, SDK method, event name, or permission string.
- Any mismatch with local code or older notes.
- The recommended implementation path and verification checks.
- Any approval gate required before live Whop changes.
