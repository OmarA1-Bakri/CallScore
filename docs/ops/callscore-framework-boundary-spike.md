# CallScore Framework Boundary Spike: LangGraph, Zod, Pydantic/Instructor

Date: 2026-06-21
Task: `t_21adccc5` / P3 bounded architecture spike

## Verdict

Recommendation: use LangGraph only for agent-loop prototype.

Do not adopt LangGraph as a production CallScore control plane now. The production boundary should remain a native TypeScript state machine plus canonical Zod contracts, backed by the existing Workplane, Hermes, Kanban, Postgres ledgers, channel task queue, receipts, and GTM registry gates.

A LangGraph spike is acceptable only as an isolated agent-loop prototype when the question is specifically: can a graph-shaped loop improve channel-head reasoning, branching, or human-in-the-loop prototype ergonomics without owning persistence, gates, dispatch, receipts, or authority? The prototype must return a Zod-validated `ChannelHeadDecisionSchema` payload to the existing TypeScript runtime and must not write production state.

## Sources checked

Repo evidence:
- `package.json` uses Node 20, TypeScript, and `zod`; no `@langchain/langgraph`, `instructor`, or Python runtime dependency is present.
- `tsconfig.json` has `strict: true`, matching Zod's TypeScript-first operating model.
- `src/lib/autonomy/contracts.ts` now contains canonical Zod schemas for channel-head snapshots, actions, decisions, sentinel receipts, trust decisions, review items, and autonomy receipts.
- `tests/autonomy-contracts.test.ts` validates fail-closed contract behavior.
- `src/lib/api-schemas.ts` already uses Zod at API/data row boundaries.
- `docs/plans/2026-06-21-callscore-channel-head-intelligence-sentinel-trust-engine.md` explicitly says Zod is canonical; Pydantic/Instructor is optional only at Python verifier/LLM sidecar boundaries; LangGraph is spike-only unless it avoids a second control plane.
- `docs/plans/2026-06-18-callscore-full-autonomy-channel-heads.md` defines the autonomy substrate: agent instances, heartbeats, channel tasks, events, publications, approvals, experiment memory, incidents, kill switches, cooldowns, and promotion gates.
- `docs/specialist-extraction-model-research.md` supports a Python sidecar pattern for specialist extraction while keeping it out of the Next.js package until quality is proven.

External documentation checked:
- Zod docs describe Zod as TypeScript-first schema validation with static type inference, runtime parse/safeParse, zero external dependencies, and strict TypeScript expectations.
- LangGraph docs describe LangGraph as a low-level orchestration framework/runtime for long-running stateful agents with graphs, nodes, edges, durable execution, persistence, human-in-the-loop support, checkpointers, stores, and optional Zod state schemas.
- LangGraph docs also note node re-execution/idempotency considerations when checkpointed execution resumes.
- Instructor docs describe Python structured LLM outputs using Pydantic `response_model`, validation, retries, nested models, and provider abstraction.

## Built / planned boundary

| Layer | Current status | Boundary decision |
|---|---:|---|
| TypeScript/Zod contracts | BUILT | Canonical. All persisted/dispatchable autonomy objects must parse through Zod before use. |
| Native TypeScript state machine | PLANNED / NEXT | Preferred production runtime for channel-head dispatch and gate evaluation because it lives in the existing Node/Postgres/Workplane/Hermes path. |
| LangGraph | NOT BUILT / PROTOTYPE ONLY | Use only for an isolated agent-loop prototype if needed. No production dependency or persistence ownership. |
| Python Pydantic/Instructor sidecar | NOT BUILT for autonomy; RESEARCHED for extraction | Allowed for LLM extraction/verifier sidecars. Sidecar output is untrusted until TypeScript Zod revalidates it. |
| Workplane/Hermes/Kanban/Postgres ledgers/receipts | BUILT/PARTIAL existing rails | Remain the control plane and audit trail. Do not duplicate with LangGraph stores/checkpoints. |

## Option comparison

| Option | Best fit | Strengths | Failure modes | CallScore boundary |
|---|---|---|---|---|
| Native TypeScript state machine + Zod | Production channel-head dispatch, gate checks, receipt writing, ledger persistence | Uses current repo stack; same language as API/routes/workers; Zod is already installed and canonical; easy to test with `node --import tsx --test`; aligns with existing Postgres/Workplane/Hermes ledgers; no new runtime dependency | Can become ad hoc if branch logic grows without explicit state enum and transition tests; less ergonomic for exploratory agent loops than a graph DSL | Canonical production path. Keep state transitions explicit and covered by node:test. |
| LangGraph | Bounded prototype of multi-step LLM/agent reasoning loops | Purpose-built graph model; nodes/edges/super-steps; supports state, parallel branches, interrupts, persistence, human-in-the-loop, memory, visualization/tracing ecosystem; JS API can use Zod state schemas | High risk of second control plane: checkpoints/stores can duplicate Postgres event truth; Agent Server/LangSmith can become parallel runtime/ops surface; node re-execution requires idempotency; graph state can obscure authority/gate boundaries if not wrapped | Prototype only. It may propose decisions, never own gates, receipts, persistence, queue claims, provider writes, or public mutations. |
| Python Pydantic/Instructor sidecar | LLM extraction, verifier research, model-quality experiments | Strong for structured LLM outputs; Pydantic response models, validation, retries, provider abstraction; fits existing specialist extraction research and Python venv sidecar pattern | Cross-language schema drift; Pydantic coercion may differ from Zod; sidecar can tempt direct DB writes or provider calls; Python dependency/runtime expands operational surface | Sidecar only. It emits candidate JSON; TypeScript Zod must revalidate before persistence, scoring, visibility, dispatch, or receipt. |

## Second-control-plane duplication risk

LangGraph's useful features overlap with CallScore's existing control-plane responsibilities:

| LangGraph capability | Existing CallScore/Hermes rail | Duplication risk | Boundary rule |
|---|---|---|---|
| Checkpointers for graph state | Postgres `autonomy_events`, `channel_tasks`, receipts, pipeline/job state | Two resumable truths for the same action or decision | LangGraph prototype may use in-memory/local checkpointing only; production truth remains Postgres receipts/events. |
| Stores / long-term memory | `experiment_memory`, channel receipts, Hermes memory/skills, GTM registry | Conflicting taste/campaign memory and hard-to-audit policy drift | Prototype may read a passed-in snapshot; it must not write canonical memory. |
| Human-in-the-loop interrupts | Workplane approvals, Kanban blocks, approval packets, receipt gates | Parallel approval state and bypass of restricted-action gates | Human review remains Workplane/Kanban/approval-packet only. |
| Agent runtime/server | Hermes worker, channel-agent-worker, Workplane jobs | Competing scheduler/worker ownership | LangGraph cannot claim tasks, schedule jobs, or run as production daemon without separate approved card. |
| Tracing/observability | Existing receipts, War Room reports, Sentry/workplane status | Debug traces treated as receipts | Traces are diagnostic only; receipts are canonical. |

High-level risk: if LangGraph owns persistence, memory, approvals, or scheduling, CallScore gets a second control plane. That creates ambiguous authority: did the graph approve the action, or did Workplane? did a checkpoint resume a stale policy, or did the Postgres ledger block it? For CallScore, that ambiguity is unacceptable around public posting, provider writes, DB/deploy, Whop, spend, credentials, and customer/payment surfaces.

## Canonical production boundary

Production channel-head path should be:

1. Existing rails produce/read bounded inputs:
   - Workplane status
   - GTM registry row
   - freshness/cooldown state
   - heartbeat/lease state
   - prior receipts
   - evidence artifacts and hashes
2. TypeScript constructs a `ChannelHeadInputSnapshotSchema` object.
3. A native TypeScript transition function decides one of:
   - `act`
   - `suppress`
   - `wait`
   - `request_gate`
   - `escalate_non_founder_review`
4. TypeScript validates the decision with `ChannelHeadDecisionSchema`.
5. If action is proposed, TypeScript validates with `ChannelHeadActionSchema` and existing gate logic.
6. Any receipt is validated with `AutonomyReceiptSchema` before durable write.
7. Restricted actions remain blocked unless the existing gate/receipt path proves approval.

This keeps the production graph small enough to audit. It also prevents an LLM framework from silently expanding authority.

## Allowed LangGraph prototype shape

A prototype is allowed only with this shape:

| Prototype field | Required constraint |
|---|---|
| Location | New isolated docs/demo or test fixture only; no production import path. |
| Dependency | Do not add `@langchain/langgraph` to `dependencies` without separate approval. If needed for spike, keep it in a disposable branch/card or document install commands only. |
| Persistence | In-memory or local scratch only. No production Postgres writes, no canonical receipt writes, no Workplane mutation. |
| Inputs | Redacted static fixture matching `ChannelHeadInputSnapshotSchema`; no `.env`, tokens, cookies, DB URLs, customer/payment data, or provider secrets. |
| Output | Candidate decision JSON only. Parent TypeScript code must parse it with Zod before use. |
| Authority | May recommend; may not dispatch, publish, send, spend, mutate providers, mutate Whop, mutate DB/deploy/infra, or rotate/read secrets. |
| Exit criterion | Stop if graph state/checkpoint/store starts duplicating Workplane, Kanban, receipts, GTM registry, or Postgres ledger semantics. |

Prototype question to answer:
- Does a graph representation produce clearer, safer, testable agent-loop branching than a native switch/state-machine for one narrow channel-head reasoning loop?

Prototype question not allowed:
- Can LangGraph become the CallScore scheduler/control plane?

## Python Pydantic/Instructor sidecar boundary

Pydantic/Instructor is a good fit when the problem is structured LLM extraction or verifier research, not TypeScript runtime authority.

Allowed sidecar examples:
- Transcript call extraction experiments.
- Specialist model bakeoff structured outputs.
- ML verifier candidate normalization before TypeScript validation.
- Offline research artifacts with redacted inputs.

Disallowed sidecar authority:
- Direct production DB writes.
- Direct channel publication or provider mutation.
- Direct Workplane approval or bypass.
- Canonical autonomy schema ownership.
- Secrets handling or credential discovery.

Contract:
- Pydantic can improve model-facing schema quality.
- Zod remains the canonical product/runtime contract.
- Every sidecar output crossing into Node must be treated as untrusted JSON and parsed through the matching Zod schema.
- If Pydantic and Zod disagree, Zod wins for dispatch/persistence/public behavior.

## Decision gates for future adoption

LangGraph may be adopted for a named bounded runtime component only if a future card proves all of the following:

1. Named component: e.g. `channel-head-reasoning-prototype`, not generic control plane.
2. Clear win over native TypeScript: lower complexity, safer interrupt handling, or better testability for a specific loop.
3. No second control plane: Postgres ledgers, Workplane, Kanban, receipts, and GTM registry remain canonical.
4. Zod boundary: graph input and output are Zod-validated in TypeScript.
5. Idempotency: every node that could re-run has an idempotency key and no unsafe side effect.
6. Failure mode: graph failure returns `wait`, `suppress`, or `request_gate`; it never retries external mutations autonomously.
7. Review: production dependency/runtime addition is separately approved.

Until those gates pass, LangGraph is not a production dependency.

## Practical recommendation for next implementation card

Build the next production slice natively in TypeScript:

- `src/lib/autonomy/channel-head-decisions.ts`
- `tests/channel-head-decision.test.ts`

Keep it simple:
- Pure function from `ChannelHeadInputSnapshot` to `ChannelHeadDecision`.
- Explicit state/decision table.
- Zod validation at both input and output.
- No external side effects.
- Tests for OK, stale, cooldown, kill switch, restricted gate, cap reached, and public verify fail.

A LangGraph prototype can be a later optional comparison once the native transition table exists and can serve as the baseline.

## Acceptance criteria mapping

| Acceptance criterion | Result |
|---|---|
| Recommendation must be one of the allowed options | Met: `use LangGraph only for agent-loop prototype`. |
| Identify second-control-plane duplication risk | Met: duplication table covers persistence, memory, HITL, scheduler/runtime, and tracing. |
| Keep Zod canonical unless proven otherwise | Met: Zod remains canonical for production runtime, persistence, dispatch, and public behavior. |
| No production LangGraph integration unless explicitly justified and separately approved | Met: no production integration recommended; future adoption requires a separate approved card. |
| No secrets printed | Met: document contains no env values, tokens, cookies, DB URLs, customer/payment records, or credential material. |
