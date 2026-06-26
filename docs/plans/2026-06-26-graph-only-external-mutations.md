# CallScore Graph-Only External Mutations Implementation Plan

> For Hermes: use task-router → writing-plans → Kanban → specialist execution → parent verification. Use TDD. No provider mutation outside graph. No live publish/delete.

Goal: make it impossible for CallScore to mutate any external provider unless the mutation executes inside the LangGraph operating graph and the graph receipt proves it.

Architecture: all external write/send/post/upload/comment/follow/update/delete surfaces route through graph-owned mutation nodes. Parent Hermes, cron, shell wrappers, Art of War, Claude_Code_Automations, and direct utilities may only draft, read, gate, or call `npm run operating:goal`; they must fail closed for external mutations outside graph context.

Tech stack: TypeScript, LangGraph `StateGraph`, Zod schemas, existing `ActionAuthority`, Hermes Kanban profiles, existing `npm run operating:goal` entrypoint, tests under `tests/*.test.ts`.

## Adjusted bounded sprint prompt

Objective:
Fix CallScore external mutation architecture permanently.

Primary repo:
- `/opt/crypto-tuber-ranked`

Related control/runtime paths to inspect/guard:
- `/srv/agents/hermes/scripts`
- `/srv/agents/repos/Claude_Code_Automations`
- `/srv/agents/hermes/quarantine`

Hard rule:
If CallScore causes an external mutation, the mutation must happen inside the LangGraph operating graph. Graph receipt must prove it.

Valid mutation proof requires:
- `operating_graph_run_id`
- `graph_node_id`
- `goal`
- `channel/platform`
- `acting_agent_id`
- `ActionAuthority` route
- approval evidence where required
- originality/evidence receipt where required
- approved payload hash
- provider tool/adapter called inside graph
- provider response captured
- external URL/object ID captured where applicable
- `dry_run=false`
- relevant mutation flag set true
- parent/child receipt lineage

No graph mutation receipt = invalid mutation.

Known failure to prevent:
A parent cron/harness path created X + LinkedIn posts after the graph only ran `draft_only`; graph summary had `provider_mutation_performed=false` and `public_publish_performed=false`. This must be impossible.

Non-negotiables:
- Do not delete existing posts/videos.
- Do not live publish/send/comment/upload/follow/update/delete unless Omar provides explicit approval receipt.
- Do not change network settings.
- Do not run DB migrations.
- Do not read or print `.env` contents/secrets.
- Do not create new agents.
- Do not create new ActionAuthority tiers.
- Do not create new decision handlers unless RED tests prove unavoidable.
- Do not fake provider success.

## Task-router classification

Categories: security, backend, devops, testing, observability, crypto, data.
Complexity: very high.
Execution shape: Kanban specialist graph with TDD and final three-agent validation.
Primary skills: `kanban-orchestrator`, `writing-plans`, `test-driven-development`, `subagent-driven-development`, `parent-verification-of-agent-output`, `callscore-social-posting-discipline`, `art-of-war-operations`, `hermes-orchestrator`.

## Built vs not built — honest state

| Layer | Status | Detail |
|---|---|---|
| LangGraph operating graph | Built, incomplete for writes | `npm run operating:goal` exists; current social packet only graph-backed draft/review, not provider mutation. |
| Provider mutation receipts | Unsafe/inconsistent | Prior X/LinkedIn receipts show provider success while graph summary says no provider/public mutation. |
| Parent/orchestrator safety | Broken | Parent cron can still execute Composio provider write tools after graph exits unless guarded. |
| Social visual/content gates | Partial | Quality gate passed generic evidence-card thought-leadership; must reject that visual class for thought leadership. |
| Video/email/commerce/CRM/analytics gates | Unknown | Need inventory + guards across app/scripts/control repo/quarantine. |
| Schedules | Contained | Social publisher and catch-up watcher paused on 2026-06-26; must stay paused until graph-only replacement exists. |

## Phase plan

### Phase 0 — Containment and baseline

Objective: preserve current safety while agents work.

Required checks:
- Verify `9c03a6eea969` and `144c3a9cc860` remain paused.
- Verify repo clean or record exact dirty files.
- Do not resume publisher/catch-up jobs.
- Run baseline `npm run typecheck`.

Acceptance:
- containment receipt written under `.tmp/workflow-receipts/graph-only-external-mutations/`
- no external mutation performed

### Phase 1 — External mutation inventory

Search paths:
- `/opt/crypto-tuber-ranked`
- `/srv/agents/hermes/scripts`
- `/srv/agents/repos/Claude_Code_Automations`
- `/srv/agents/hermes/quarantine`

Search terms:
`TWITTER_UPLOAD_MEDIA`, `TWITTER_CREATION_OF_A_POST`, `LINKEDIN_CREATE_LINKED_IN_POST`, `LINKEDIN_CREATE_COMMENT_ON_POST`, `REDDIT_CREATE_REDDIT_POST`, `REDDIT_CREATE_COMMENT`, `YOUTUBE_UPLOAD_VIDEO`, `YOUTUBE_MULTIPART_UPLOAD_VIDEO`, `YOUTUBE_UPDATE_THUMBNAIL`, `YOUTUBE_UPDATE_VIDEO`, `GMAIL`, `RESEND`, `WHOP`, `ATTIO`, `POSTHOG`, `Composio`, `composio`, `upload media`, `create post`, `publish`, `send email`, `send alert`, `comment`, `follow`, `DM`, `provider_mutation_performed`, `public_publish_performed`, `external_mutation_performed`, `send_or_outreach_performed`, `whop_mutation_performed`, `production_mutation_performed`, `callscore-genuine-social-packet`, `content_creator`, `social publisher`, `YouTube publisher`, `video publish`, `cooldown catch-up`, `Art of War publish`, `owned public execution`.

Classify each hit:
- graph-owned mutation path
- draft-only packet path
- read-only path
- documentation only
- test fixture
- legacy dangerous mutation path
- unrelated non-CallScore path

Output table columns:
- file
- platform
- mutation family
- current caller
- graph-owned? yes/no
- required action

Acceptance:
- concise inventory artifact saved
- all dangerous legacy paths identified before code changes

### Phase 2 — RED tests for graph-only invariant

Create tests before production code.

Target test files:
- `tests/external-mutation-guard.test.ts`
- `tests/graph-only-external-mutation.test.ts`
- `tests/social-originality-gate.test.ts`
- `tests/video-publish-guard.test.ts`
- updates to existing wrapper tests as needed

RED tests must prove:
1. `draft_only` cannot mutate external platform.
2. `approved_publish` without approval cannot mutate.
3. missing graph context blocks provider adapters.
4. X publish only inside `x_owned_publish_node`.
5. LinkedIn publish blocks if OAuth not confirmed.
6. Reddit subreddit action blocks without approval.
7. YouTube publish blocks without QA + approval.
8. thumbnail/metadata update blocks without graph context.
9. Gmail/Resend sends block without graph context/policy.
10. Whop mutation blocks without graph context + approval.
11. Attio/PostHog writes block without graph context.
12. generic `EVIDENCE CARD` fails thought-leadership asset gate.
13. X/LinkedIn duplicate or padded/truncated content fails originality gate.
14. legacy Hermes social wrapper has no provider calls.
15. Claude_Code_Automations content_creator cannot mutate CallScore external platforms.
16. old orchestrator paths fail closed for CallScore external mutation.
17. published URL/object ID cannot exist while mutation flags are false.
18. mutation flags true only after provider success.
19. provider failure writes failed receipt, not success.

Acceptance:
- targeted RED tests fail for expected reason before implementation
- RED output captured in task handoff

### Phase 3 — External mutation schema and runtime guard

Suggested files:
- create `src/lib/workplane/external-mutation-schemas.ts`
- create `src/lib/workplane/external-mutation-guard.ts`
- modify `src/lib/workplane/operating-graph-schemas.ts` only if needed
- update `src/lib/workplane/callscore-operating-graph.ts` only if needed

Guard context required:
- `operating_graph_run_id`
- `graph_node_id`
- `goal`
- `platform`
- `mutation_family`
- `acting_agent_id`
- `authority`
- approval evidence if required
- evidence/originality receipt if required
- `dry_run=false` only inside approved mutation path

Missing context must throw/block before provider call:
- reason: `missing_operating_graph_context`

Legacy blocker reasons:
- `non_graph_external_mutation_blocked`
- `non_graph_publish_blocked`
- `non_graph_video_publish_blocked`
- `non_graph_email_send_blocked`
- `non_graph_whop_mutation_blocked`
- `non_graph_crm_write_blocked`
- `non_graph_alert_send_blocked`
- `non_graph_reddit_mutation_blocked`
- `non_graph_youtube_mutation_blocked`

Acceptance:
- guard tests GREEN
- no new ActionAuthority tier unless RED test proves unavoidable

### Phase 4 — Graph-owned mutation nodes and mock adapters

Suggested files:
- `src/lib/workplane/node-wrappers/social-publish-nodes.ts`
- `src/lib/workplane/node-wrappers/video-publish-nodes.ts`
- `src/lib/workplane/node-wrappers/email-alert-nodes.ts`
- `src/lib/workplane/node-wrappers/commerce-mutation-nodes.ts`
- `src/lib/workplane/node-wrappers/crm-analytics-nodes.ts`

Implement/verify nodes:
- `x_owned_publish_node`
- `linkedin_owned_publish_node`
- `reddit_owned_profile_publish_node`
- `reddit_comment_or_subreddit_publish_node`
- `youtube_video_publish_node`
- `youtube_thumbnail_update_node`
- `gmail_send_node`
- `resend_alert_send_node`
- `whop_mutation_node`
- `attio_write_node`
- `posthog_write_node`

If platform adapter missing, return blocker not fake success:
- `x_provider_tool_missing`
- `linkedin_oauth_not_confirmed`
- `reddit_provider_tool_missing`
- `youtube_provider_tool_missing`
- `gmail_provider_tool_missing`
- `resend_provider_tool_missing`
- `whop_provider_tool_missing`
- `attio_provider_tool_missing`
- `posthog_provider_tool_missing`

Acceptance:
- graph-owned nodes use guard
- provider response captured in receipt on mocked success
- flags set true only after mocked provider success

### Phase 5 — Public content originality/evidence gates

Suggested files:
- `src/lib/workplane/social-originality-gate.ts`
- tests in `tests/social-originality-gate.test.ts`

Rules:
- X and LinkedIn cannot be identical.
- LinkedIn cannot be padded X.
- X cannot be truncated LinkedIn.
- Same thesis/data source allowed if platform-native.
- Generic `EVIDENCE CARD` cannot be default for thought leadership.
- Thought leadership visual must be product screenshot, thesis visual, chart/diagram, or founder/product-build visual.
- Reddit subreddit post/comment requires `reddit_community_approval` and rules/community fit.
- YouTube publish requires title, description, thumbnail, captions, QA report, and approval.

Acceptance:
- social originality tests GREEN
- current bad evidence-card thought-leadership case fails gate

### Phase 6 — Legacy path blockers and scheduler cutover

Patch dangerous paths so CallScore external mutation paths can only:
- call `npm run operating:goal`
- generate draft packets/assets
- read status
- return blockers

Forbidden outside graph:
- provider SDK/API writes
- Composio write/send/post/upload/comment/follow/update/delete
- shell-level provider call
- parent cron publishing after graph exits
- Art of War provider mutation
- Claude_Code_Automations provider mutation for CallScore

Allowed schedules only:
- `npm run operating:goal -- --goal revenue_now --mode draft_only`
- `npm run operating:goal -- --goal revenue_now --mode approved_publish --approval-receipt-id <id>`
- `npm run operating:goal -- --goal produce_video --mode approved_publish --approval-receipt-id <id>`
- `npm run operating:goal -- --goal alerts --mode bounded_write --approval-receipt-id <id>`
- `npm run operating:goal -- --goal dispatch_worker_once`
- `npm run operating:goal -- --goal refresh_data`
- `npm run operating:goal -- --goal monitor`

Paused jobs must stay paused unless replaced with graph-only triggers:
- CallScore twice-daily genuine social CMO loop
- CallScore CMO cooldown catch-up watcher
- any content_creator/social publisher schedule
- any direct video publish schedule

Acceptance:
- legacy wrapper tests GREEN
- cron list proves unsafe jobs paused or graph-only

### Phase 7 — Verification and commit

Commands:
- `npm run typecheck`
- `npm test`
- `node --import tsx src/scripts/callscore-full-system-test.ts`
- targeted external mutation guard tests
- targeted social originality tests
- targeted video publish guard tests
- run `revenue_now draft_only` and confirm no mutation
- run approved mutation paths with mocked providers only
- do not live publish unless Omar explicitly provides approval receipt

Three-agent validation:
- spec/contract reviewer
- code/implementation reviewer
- security/risk reviewer

Final acceptance:
- no non-graph CallScore external mutation path remains active
- all provider writes require graph context
- X/LinkedIn/Reddit/YouTube tools unreachable from parent/orchestrator/harness paths
- receipts prove actual provider mutation
- old bypasses paused, removed, or fail closed
- full tests pass
- focused commit: `fix(workplane): enforce graph-only external mutations`

## Kanban execution graph

Use phase-level Kanban. Parent verifies before final acceptance.

Parallel roots:
- T0 containment/baseline
- T1 inventory
- T2 RED tests

Implementation waits on inventory + RED tests.

Fan-in:
- T3 guard/schema depends on T1 + T2
- T4 graph mutation nodes depends on T3
- T5 originality/evidence gates depends on T2
- T6 legacy blockers/scheduler depends on T1 + T3
- T7 integration verification depends on T4 + T5 + T6
- T8 three-agent review depends on T7
- T9 parent final verification/commit depends on T8
