# CallScore Headroom Swarm Policy

Date: 2026-06-21
Status: support-lane policy for specialist swarm context/log plumbing
Scope: CallScore Hermes/Workplane specialist swarm on HH

Headroom is optional context/log plumbing. It is not CallScore decision logic, not an autonomy gate, not a source of truth, and not an authority escalation path for any specialist agent.

Canonical adjacent contracts:

- `docs/ops/callscore-canonical-session-startup.md`
- `docs/ops/callscore-canonical-skill-register.md`
- `docs/ops/callscore-canonical-subagent-roster.md`
- `docs/ops/callscore-full-autonomy-heartbeat-contract.md`
- `docs/ops/callscore-gtm-agent-registry.json`

## Local HH verification

Observed on HH during this policy task:

| Check | Result | Policy consequence |
|---|---|---|
| `headroom --version` | `headroom, version 0.25.0` | Headroom is available as a support tool. |
| Port `8787` | Occupied on `127.0.0.1:8787` by an existing Python service | Do not use `8787` for Headroom smoke/proxy tests unless intentionally reconfiguring that service. |
| Port `18787` smoke | `GET http://127.0.0.1:18787/livez` returned healthy with version `0.25.0` | Use `18787` for bounded smoke/proxy tests on HH. |
| Smoke proxy cleanup | Test proxy was stopped after `/livez` check | Proxy tests must not leave extra background services running unless explicitly intended. |

Smoke command shape:

```bash
HEADROOM_EXCLUDE_TOOLS=read_file,headroom_retrieve headroom proxy --port 18787 --no-telemetry
curl -fsS http://127.0.0.1:18787/livez
```

Stop the smoke proxy immediately after the check unless the operator explicitly asks to keep a proxy running.

## Built / not-built status

| Capability | Status | Notes |
|---|---|---|
| Headroom CLI available on HH | Built/observed | Version `0.25.0` verified. |
| Safe smoke port for HH | Built/observed | Use `18787`; `8787` is occupied. |
| Global Hermes routing through Headroom | Not built / not authorized by this policy | Do not change `model.base_url` or provider routing as part of swarm use. |
| Headroom as agent memory, gate, or decision engine | Not built / prohibited | Canonical decisions remain with Workplane, GTM registry, receipts, souls, and human/operator gates. |
| Secret-safe compression policy | Built by this document | Applies to all specialist swarm usage. |
| Runtime enforcement wrapper | Planned only | This document defines policy; code enforcement would need a separate implementation task. |

## Role in the specialist swarm

Headroom may help specialists handle large context surfaces:

1. Large non-secret logs.
2. Long non-secret docs.
3. RAG chunks or search output where exact quoted text is not needed yet.
4. Oversized tool output that would otherwise crowd out the task context.
5. Intermediate summaries that can be rehydrated before final claims.

Headroom must not decide:

1. Whether an action is allowed.
2. Whether a registry row is ready.
3. Whether a receipt chain is sufficient.
4. Whether a public post, send, deploy, Whop action, provider write, DB write, or payment/customer action may execute.
5. Whether evidence is strong enough for a final public/product claim.

Those decisions stay with the canonical CallScore rails: Workplane, the GTM registry, soul/heartbeat contracts, receipts, compliance linting, and operator approvals.

## Mandatory exclusions

Any Headroom proxy, MCP, or helper flow used by the swarm must exclude exact-evidence tools from compression when possible:

```bash
export HEADROOM_EXCLUDE_TOOLS=read_file,headroom_retrieve
```

Minimum exclusions:

| Tool/output | Why excluded |
|---|---|
| `read_file` | Exact file lines are needed for code/doc edits and final citations. |
| `headroom_retrieve` | Retrieval output must not be recursively compressed into another marker. |
| Secret/env reads | Secrets must not enter compression at all. |
| Provider/customer/payment data | Restricted data must remain outside compression. |

## Data that must never be compressed

Do not send any of the following through Headroom:

- `.env`, `.env.*`, shell exports containing credentials, or secret manifests with values.
- API keys, OAuth tokens, refresh tokens, cookies, auth headers, SSH keys, private keys, service-account JSON, database URLs, webhook secrets, or credential-bearing remotes.
- Raw customer, payment, entitlement, payout, Whop billing, Stripe/payment, CRM, email-recipient, or private personal contact data.
- Private DMs, outreach threads, support conversations, or lead lists unless a separate data-policy gate explicitly allows a redacted compression flow.
- Production database dumps or query output containing PII, customer state, payment state, or private creator/contact fields.
- Any material that a specialist would be forbidden to print into a durable receipt or chat log.

If unsure whether data is sensitive, do not compress it. Read or process it locally with exact tools and redact before summarizing.

## When Headroom is allowed

Headroom is allowed when all conditions are true:

1. The content is non-secret and non-restricted.
2. The task needs context savings or log/doc reduction.
3. Exact line-level claims are not being made from the compressed summary alone.
4. The agent can retrieve or reread raw evidence before final claims, edits, or receipts.
5. The action remains local/read-only or otherwise already authorized by the relevant CallScore gate.
6. The compression setup does not change global Hermes provider/model routing.

Typical safe examples:

- Compressing a long non-secret test log before triage, then rerunning or rereading exact failure lines before patching.
- Compressing a long public documentation page for orientation, then revisiting raw docs before quoting a command.
- Compressing non-secret RAG/search results for planning, then reading source URLs/files before final assertions.

## When raw output is mandatory before final claims

A specialist must retrieve or reread raw output before it:

1. Quotes exact text, error messages, line numbers, commands, URLs, IDs, receipt fields, or policy clauses.
2. Edits a file based on file contents.
3. Reports a verification result as pass/fail.
4. Records a receipt, approval packet, handoff, or incident.
5. Makes any public, customer-facing, financial, compliance, or product-status claim.
6. Decides whether a restricted action is allowed or blocked.
7. Compares compressed summary against canonical source files.

Compressed summaries can guide where to look. They cannot be the final evidence.

## Proxy and config rules

Do not change global Hermes routing for the swarm as part of normal Headroom use:

- Do not set `model.base_url` to a Headroom proxy in global or profile config.
- Do not alter provider/model defaults to route all Hermes traffic through Headroom.
- Do not enable a persistent proxy service without a rollback path and explicit operator intent.
- Do not bind to port `8787` on HH for Headroom tests; it is already occupied.
- Use `18787` for bounded HH smoke tests.
- If a smoke proxy is started, stop it after `/livez` verification unless intentionally left running.

A future persistent proxy rollout would require a separate implementation/review task with:

1. Current config snapshot.
2. Rollback command/path.
3. Exclusion list verification.
4. Secret-handling test.
5. Health check.
6. Fresh-session restart plan.
7. Operator approval if it affects live Hermes routing.

## Specialist swarm contract

Each specialist remains responsible for its own evidence quality.

| Specialist class | Headroom use | Must still do |
|---|---|---|
| Channel-head GTM agents | Summarize long public research/logs for draft planning | Use GTM registry, public messaging policy, compliance lint, and receipts before any public action. |
| Compliance linter | Compress large candidate/evidence packets only after sensitive data is removed | Read exact claim/source spans before approval or block. |
| Data-pipeline sentinel | Summarize non-secret worker logs or test output | Reread exact failures and avoid DB/customer/provider output compression. |
| Whop/commerce head | Use only for public copy/docs or redacted non-sensitive logs | Never compress payment/customer/provider data; financial/provider mutations remain gated. |
| Orchestrator/supervisor | Reduce large worker handoffs for orientation | Verify child outputs directly before accepting or completing. |
| Docs/architecture agents | Summarize long docs for drafting | Cite canonical raw docs/files before final status tables or contracts. |

## Failure modes and required response

| Failure mode | Classification | Required response |
|---|---|---|
| Proxy cannot start on `8787` | Code/environment, expected on HH | Use `18787`; do not kill the existing service unless separately approved. |
| Proxy cannot start on `18787` | Environment conflict | Inspect port occupancy read-only, choose another explicit test port, and document it. |
| Compressed summary conflicts with raw evidence | Evidence conflict | Trust raw evidence; update or discard the summary. |
| CCR/retrieval marker expired | Tool/runtime | Re-run or reread the original source; do not infer exact content. |
| Secret-like material is discovered in candidate content | Data-policy blocker | Stop compression path, redact locally, and avoid logging the raw sensitive value. |
| A specialist used compression as final proof | Governance blocker | Require raw-source verification before approval/completion. |
| Persistent proxy would require Hermes config change | Operator-approval blocker | Create or block on a separate implementation/review task. |

## Acceptance checklist for future workers

Before using Headroom in the CallScore swarm, confirm:

- [ ] The content is non-secret and non-restricted.
- [ ] `read_file` and `headroom_retrieve` are excluded when proxy compression is involved.
- [ ] HH smoke tests use port `18787`, not `8787`.
- [ ] No global `model.base_url` or provider routing is changed.
- [ ] Raw evidence will be retrieved/reread before exact final claims.
- [ ] Any proxy started for smoke testing is stopped after verification unless intentionally left running.
- [ ] Receipts, handoffs, and status reports cite raw evidence or commands actually run, not only compressed summaries.

## Minimal safe runbook

1. Decide whether compression is needed. If not needed, use raw tools.
2. Screen the content class. If it may contain secrets, customer/payment/provider data, or raw personal contact data, do not compress.
3. For a smoke proxy on HH, use:

   ```bash
   HEADROOM_EXCLUDE_TOOLS=read_file,headroom_retrieve headroom proxy --port 18787 --no-telemetry
   curl -fsS http://127.0.0.1:18787/livez
   ```

4. Stop the proxy after the smoke test unless the operator intentionally requested a running proxy.
5. Use compression only for orientation/reduction.
6. Retrieve or reread raw source before final claims, edits, approvals, or receipts.
7. Record any policy-relevant Headroom use in the task handoff if it affected the result.
