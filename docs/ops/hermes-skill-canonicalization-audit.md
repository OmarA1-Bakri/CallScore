# Hermes Skill Canonicalization Audit — CallScore GTM / Workplane Gates

Date: 2026-06-15

Scope: audit and patch the Hermes skills that can influence CallScore GTM, commercial, Workplane, Whop, copy, or X/Twitter execution.

Canonical sources:

- `/opt/crypto-tuber-ranked/docs/ops/callscore-gtm-agent-registry.json`
- `/opt/crypto-tuber-ranked/docs/ops/callscore-gtm-agent-registry.md`
- `/opt/crypto-tuber-ranked/docs/handovers/2026-06-14-hermes-agent-callscore-activation.md`
- `/opt/crypto-tuber-ranked/README.md`
- Workplane status from `/opt/crypto-tuber-ranked`

## Verdict

All six audited skills now contain the mandatory `CANONICAL CALLSCORE PROCESS` block and skill-specific fail-closed constraints. Public sends/posts, spend, Whop/customer/payment/provider mutations, CRM/analytics writes, DB writes, deployments, infra actions, credential rotation, and destructive actions remain fail-closed without registry gate, approval receipt, rollback path, and payload hash where content-bound.

## Skill inventory

| Skill | Source path | Entrypoint | Owner lane | Registry entries touched | Compliance status | Patch |
| --- | --- | --- | --- | --- | --- | --- |
| `art-of-war-operations` | `/srv/agents/hermes/skills/commerce/art-of-war-operations/SKILL.md` | Hermes skill | Art of War | Art of War campaign engine, X/Twitter, LinkedIn, email, Discord, Telegram, Reddit, YouTube/SEO, newsletters, creator partnerships, Whop marketplace | canonicalized | Added registry lookup, persona committee, payload hash, approval receipt, rollback, publish/send/spend gates. |
| `callscore-autopilot` | `/srv/agents/hermes/skills/callscore-autopilot/SKILL.md` | Hermes skill | Hermes / Workplane | Workplane / Hermes governance, automation registry, transcript/audit monitored lane | canonicalized | Added CONTROLLED_FULL, Workplane truth, cooldown, no hammer retry, no broad DB writes, no deploy/provider mutation without gates. |
| `workplane-status` | `/srv/agents/hermes/skills/devops/workplane-status/SKILL.md` | Hermes skill | Hermes / Workplane | Workplane / Hermes governance, automation registry / health checks | canonicalized | Added CONTROLLED_FULL classification, monitored backlog/cooldown distinction, `production_mutation_allowed=false`, GTM registry pointer. |
| `whop-automation` | `/srv/agents/hermes/skills/commerce/whop-automation/SKILL.md` | Hermes skill | `whop_auto` | Whop provider / entitlement, Whop marketplace | canonicalized | Added CallScore manifest paths, discounted/token proof stance, read-only allowed checks, full mutation gate pack. |
| `humanizer` | `/srv/agents/hermes/skills/creative/humanizer/SKILL.md` | Hermes skill | marketing-compliance-linter support | All content-bound public/send lanes | canonicalized | Added draft-only default, no compliance removal, no defamatory/investment-advice/performance guarantee rewrite, payload hash invalidation. |
| `xurl` | `/srv/agents/hermes/skills/social-media/xurl/SKILL.md` | Hermes skill | marketing-channel-growth / X lane | X / Twitter | canonicalized | Added read-only/default mode, no post/reply/DM/engagement without approval, URL/payload hash invalidation, unsafe redirect rejection. |

## Gate behavior

- Public posts/pages/listing/methodology/correction: `PUBLISH_GATE` + approval receipt + rollback + payload hash where content-bound.
- Email, DM, Discord, Telegram, Reddit, newsletter, partnership outreach: `SEND_GATE` + approval receipt + rollback.
- Paid ads, boosts, enrichment, APIs, LLMs, SaaS: `SPEND_GATE`, fail-closed.
- Whop pricing/product/customer/payment, payouts, revenue share: `FINANCIAL_GATE`, fail-closed.
- DB writes, deployments, provider mutations, infra/webhook changes: `PRODUCTION_GATE`, fail-closed.
- Secrets: `SECRET_GATE`, always applies.

## Reference repairs

- `/srv/agents/hermes/skills/commerce/whop-automation/references/composio-integration-state.md` now starts with a 2026-06-15 CallScore supersession note so old May 2026 “Composio broken / skip Composio / Neon direct” guidance cannot override current CallScore state.
- `/srv/whop-auto/plugin/agent_workflows/whop_auto/README.md` now has a CallScore canonical production note: CallScore source is `/opt/crypto-tuber-ranked`, hosting is Netlify, data source is local HH PostgreSQL plus HH Read API, Whop mutations need the full registry gate pack.

## Tests

Regression test: `/opt/crypto-tuber-ranked/tests/hermes-skill-canonical-process.test.ts`.

It asserts:

- every listed skill has the canonical process block;
- all required gates are named;
- Art of War cannot publish from dry-run alone and requires persona evidence;
- autopilot respects transcript cooldown and no hammer retry after HTTP 429;
- Workplane preserves `CONTROLLED_FULL` and `production_mutation_allowed=false` by default;
- Whop mutation requires manifest, diff, rollback, approval receipt, local auth, and explicit safe classification;
- humanizer/xurl invalidate approval when payload or destination changes;
- stale Composio/Vercel/Neon reference material is superseded for CallScore;
- no secret-like values are present in canonical skill text.

## Receipt

Run receipt: `.tmp/workflow-receipts/hermes_skill_canonicalization/hermes-skill-canonicalization-20260615T111500Z.json` (local workflow receipt, not committed because `.tmp` is ignored). It records SHA-256 hashes for patched live Hermes/Whop Auto skill artifacts and validation commands.

## Remaining gaps

- No live public post/send/spend/provider mutation was performed. This is intentional.
- `/srv/agents/hermes` skill tree is not a git repo on HH, so actual skill-file patches are live filesystem changes, while test/docs/handover evidence is committed in the CallScore repo.
- Future skill additions must repeat this audit and update the GTM registry if channel ownership, gate, receipt, rollback, or connected app behavior changes.
