# CallScore LangChain/LangGraph Alignment — 2026-07-01

Kanban: `callscore-channel-orchestrator-retask-20260701` / `t_3a21f24a`

## Verdict

Use LangGraph concepts and the installed `@langchain/langgraph` package selectively. Do not rewrite the CallScore runtime into a generic LangChain agent framework.

The correct near-term implementation is wrapper-first:

```text
Hermes cron scheduler
→ bounded tmux lane
→ channel-head Hermes profile/subagent
→ optional child agents inside lane
→ artifacts/receipts/messages/team-memory rows
→ parent/reviewer verification
```

LangGraph should model state transitions and gates around this runtime, not replace Hermes as the orchestrator.

## Relevant LangGraph concepts

### StateGraph

Use for explicit lifecycle state:

```text
queued → claimed → running → needs_review → succeeded
                         ↘ failed/dead_letter
                         ↘ blocked/cooldown
```

Best fit:
- channel task lifecycle.
- canonical receipt gates.
- public/provider mutation gates.
- reviewer closeout.

### Checkpointing / persistence

Use for resumable graph state, but do not treat checkpoint context as team memory.

Checkpoint is for:
- replay/resume.
- crash recovery.
- step-level state.

Team memory is for:
- assets.
- receipts.
- learning events.
- message inbox/outbox.
- profile/watchlist/discovery results.

### Store / long-term memory

Use the shared SQL team memory vault as the long-term store, not model prompt memory.

Canonical store:

```text
/srv/agents/hermes/runtime/callscore-team-memory/team-memory.sqlite
/srv/agents/hermes/runtime/callscore-team-memory/artifacts/
```

### Interrupt / Command gates

Use for hard gates:
- Whop/payment/customer/provider mutation.
- deploy/DB/infra mutation.
- restricted sends, DMs, email/newsletter.
- public provider mutation without graph-owned receipts.

### Send / map-reduce fanout

Use only inside bounded scope:
- one channel-head lane can spawn child work.
- fanout must be task-scoped and receipt-backed.
- never seed all 51 heads or all channels blindly.

## What not to do

Do not:
- replace Hermes with generic LangChain agents.
- keep 15+ always-on channel heads.
- use LangGraph checkpoint as team memory.
- let parent shell call providers/public mutations directly.
- create a massive framework before the cron/tmux/vault path works.
- add Redis/Kafka before SQLite proves insufficient.

## How this maps to current implementation

Current completed pieces:

| Piece | Status |
| --- | --- |
| default active channel cap = 1 | implemented/tested |
| hard max = 3 | implemented/tested |
| no all-head autoseeding | implemented/tested |
| shared team memory contract | implemented/tested |
| shared SQLite vault initializer | implemented/tested/live initialized |
| agent inbox/outbox records | implemented/tested |
| website freshness proof | implemented/cron scheduled |
| daily channel cron matrix | documented |

Next LangGraph-aligned pieces:

1. Model channel run lifecycle with a small state object.
2. Use Zod validation at task/receipt/message boundaries.
3. Use SQL team memory for long-term storage.
4. Use receipt IDs/artifact paths as graph state references.
5. Make every node idempotent because resumed nodes can re-run.
6. Keep public/provider mutation nodes fail-closed unless canonical receipts exist.

## Recommended graph state shape

```ts
interface ChannelHeadRunState {
  task_id: string;
  channel: "x" | "linkedin" | "reddit" | "youtube" | "whop" | "cmo" | "learning" | "data";
  agent_id: string;
  status: "queued" | "claimed" | "running" | "needs_review" | "succeeded" | "failed" | "blocked" | "dead_letter";
  artifact_refs: string[];
  receipt_refs: string[];
  message_refs: string[];
  learning_refs: string[];
  blockers: string[];
  idempotency_key: string;
}
```

## Minimal graph nodes

```text
claim_task
validate_caps
launch_tmux_channel_head
collect_receipt
write_team_memory_refs
review_quality
close_or_dead_letter
```

Public GTM adds:

```text
canonical_package_gate
provider_path_gate
rollback_plan_gate
public_mutation_node
post_mutation_receipt
```

## Good-to-go advice

Good to continue implementation.

Do not spend more time debating framework. The missing value is operational wiring:
- scheduler cron.
- task planner.
- canary.
- final review.

LangGraph should be added where it reduces ambiguity in state and gates. It should not become a detour.
