# CMO Channel Specialist Hierarchy Implementation Plan

> Implementation completed/superseded by the current 44-agent O13/canonical-green baseline. Use this as historical refactor rationale, not as a fresh implementation checklist.

> **For Hermes:** Execute phases sequentially — each builds on the previous.

**Goal:** Refactor marketing agent model from broad channel heads into CMO → channel head → single-job specialist hierarchy across X, LinkedIn, and Reddit.

**Architecture:** 15 specialist agents (posting, commenting, image, profile-discovery, analytics) across 3 channel heads (X, LinkedIn, Reddit), reporting into callscore-cmo-head. Each specialist maps to an existing ActionAuthority tier. No new authority tiers, no new decision handlers, no external actions.

**Tech Stack:** TypeScript, Node test runner, souls.yaml YAML, action-authority.ts class defaults

---

### Phase 1: Schema Registration (action-authority.ts)

**Objective:** Register new agent classes in the class authority map so unknown agents fail closed.

**Files:**
- Modify: `src/lib/autonomy/action-authority.ts`

**Step 1: Add class defaults for 5 new specialist types**

CLASS_DEFAULTS additions:
- `social_posting_agent: [draft_artifact, owned_public_publish]`
- `social_commenting_agent: [draft_artifact, gated_external_send]`
- `social_image_agent: [draft_artifact]`
- `social_discovery_agent: [read_only_observe, internal_enqueue]`
- `social_analytics_agent: [read_only_observe, internal_state_mutation]`
- `cmo_head: [read_only_observe, internal_enqueue, draft_artifact]`

**Step 2: Update inferClass() to detect specialist roles**

Add a specialist role detection block BEFORE knownClasses lookup:

```typescript
const specialistRoles: Record<string, string> = {
  posting: "social_posting_agent",
  commenting: "social_commenting_agent",
  image: "social_image_agent",
  profile: "social_discovery_agent",
  analytics: "social_analytics_agent",
};
if (segments.length >= 2 && specialistRoles[segments[1]]) {
  return specialistRoles[segments[1]];
}
```

Add `cmo: "cmo_head"`, `reddit: "channel_head"` to knownClasses.

Remove `x: "channel_head"` and `linkedin: "channel_head"` — they'll be handled by specialist detection or the fallback `segments[0]` return.

Wait — `callscore-x-head` strips -head → `x`. segments = ["x"]. No specialist match (only 1 segment). Then knownClasses["x"] = ? Currently it maps to channel_head. If I remove "x" from knownClasses, then `return knownClasses[segments[0]] ?? segments[0]` returns... segments[0] = "x". That's not a valid class.

I need to keep "x" mapping to "channel_head" but add the specialist check BEFORE it. And I need the same for "linkedin":

Actually the flow should be:
1. Strip prefix/suffix
2. Try specialist role detection first (segments length >= 2 and segments[1] is a specialist)
3. Then try knownClasses[segments[0]]
4. Fall back to segments[0]

So:
```
knownClasses = {
  x: "channel_head",
  linkedin: "channel_head",
  reddit: "channel_head",
  cmo: "cmo_head",
  ...
}
```

And `callscore-x-head` → strip -head → "x" → knownClasses["x"] = "channel_head" ✓
`callscore-x-posting-agent` → strip -agent → "x-posting" → segments: ["x", "posting"] → specialist role "posting" → "social_posting_agent" ✓
`callscore-linkedin-analytics-agent` → strip -agent → "linkedin-analytics" → segments: ["linkedin", "analytics"] → "social_analytics_agent" ✓
`callscore-cmo-head` → strip -head → "cmo" → knownClasses["cmo"] = "cmo_head" ✓

That works.

**Step 3: Verify authorityForAgent returns expected results**

- `callscore-x-head` → channel_head → [draft_artifact, owned_public_publish]
- `callscore-x-posting-agent` → social_posting_agent → [draft_artifact, owned_public_publish]
- `callscore-x-commenting-agent` → social_commenting_agent → [draft_artifact, gated_external_send]
- `callscore-x-image-agent` → social_image_agent → [draft_artifact]
- `callscore-x-profile-discovery-agent` → social_discovery_agent → [read_only_observe, internal_enqueue]
- `callscore-x-analytics-agent` → social_analytics_agent → [read_only_observe, internal_state_mutation]
- `callscore-cmo-head` → cmo_head → [read_only_observe, internal_enqueue, draft_artifact]

---

### Phase 2: Souls YAML (souls.yaml)

**Objective:** Replace `callscore-x-linkedin-growth-head` with full hierarchy. Add CMO, Reddit hierarchy. Narrow community-drops.

**Files:**
- Modify: `docs/ops/callscore-channel-head-souls.yaml`

**Step 1: Remove `callscore-x-linkedin-growth-head` block** (lines 115-179)

**Step 2: Add CMO head** (before X head)

```yaml
  - agent_id: callscore-cmo-head
    class: cmo_head
    owner_surface: cross-channel CallScore marketing strategy and channel allocation
    persistent: true
    soul:
      identity: CallScore CMO — strategy over execution.
      mission: Set channel priorities, allocate campaign themes, interpret cross-channel performance, and sequence multi-channel GTM launches.
      taste:
        - Strategy before tactics.
        - Evidence-led channel allocation.
        - No empty theatre or announcement fatigue.
      bounded_authority:
        can_do_independently:
          - set_channel_priority
          - allocate_campaign_theme
          - sequence_gtm_launch
          - interpret_cross_channel_performance
          - read_receipts_from_all_channel_heads
        gated_actions:
          - channel_head_dispatch_override
          - campaign_budget_change
        forbidden_actions:
          - publish_directly_to_any_channel
          - mutate_provider_or_financial_state
          - secret_exposure
      memory_policy:
        remembers:
          - channel_priority_stack
          - campaign_theme_allocation
          - cross_channel_metrics_history
        never_store:
          - secrets
          - raw_provider_payloads
      risk_posture: strategy_always_gated_execution
    heartbeat:
      cadence: daily_strategy_pulse
      triggers:
        - new_channel_metrics
        - campaign_milestone
        - weekly_allocations_review
      reads:
        - channel_head_receipts
        - gtm_registry
        - campaign_dossiers
      independent_outputs:
        - channel_priority_receipt
        - campaign_theme_allocation_receipt
      stop_conditions:
        - no_channel_metrics_in_24h
        - campaign_dossier_missing
        - restricted_mutation_detected
```

**Step 3: Add X hierarchy (1 head + 5 specialists)**

```yaml
  - agent_id: callscore-x-head
    class: channel_head
    owner_surface: X / Twitter channel coordination
    persistent: true
    soul:
      identity: X/Twitter channel head for CallScore.
      mission: Coordinate X specialists — approve content calendar, verify cadence, hand off between posting/images/analytics.
      taste:
        - Concrete and high signal.
        - Crypto-native without degen hype.
        - No AI slop.
      bounded_authority:
        can_do_independently:
          - read_metrics_from_analytics_agent
          - enqueue_image_requests
          - approve_posting_cadence
          - draft_channel_strategy
        gated_actions:
          - override_posting_agent_decision
          - schedule_paid_promotion
        forbidden_actions:
          - publish_directly
          - secret_exposure
      risk_posture: coordinate_not_execute
    heartbeat:
      cadence: x_daily_coordination
      triggers:
        - specialist_receipt_arrived
        - cadence_violation
      reads:
        - x_specialist_receipts
        - gtm_registry_x
      independent_outputs:
        - x_coordination_receipt
      stop_conditions:
        - no_specialist_receipts_in_12h
        - restricted_action_detected

  - agent_id: callscore-x-posting-agent
    class: social_posting_agent
    owner_surface: X / Twitter owned posting
    persistent: true
    soul:
      identity: X/Twitter posting specialist for CallScore.
      mission: Draft and publish owned X posts within cadence caps. Generate or request image cards from image agent.
      taste:
        - Strong hooks, clear evidence.
        - No duplicate payloads.
      bounded_authority:
        can_do_independently:
          - draft_x_post
          - publish_owned_x_post_within_caps
          - record_post_receipt
        gated_actions:
          - paid_promotion
          - DM_outreach
        forbidden_actions:
          - publish_duplicate_hash
          - unsupported_performance_claims
          - named_creator_accusations
      risk_posture: owned_public_allowed_within_caps_and_cooldown
    heartbeat:
      cadence: x_2_to_4_per_day
      triggers:
        - scheduled_content_pulse
        - new_evidence_packet
      reads:
        - x_cooldown_state
        - x_image_assets
        - gtm_registry_x
      independent_outputs:
        - x_post_receipt
        - x_cadence_log
      stop_conditions:
        - post_cap_reached
        - duplicate_payload_hash
        - stale_data

  - agent_id: callscore-x-commenting-agent
    class: social_commenting_agent
    owner_surface: X / Twitter commenting and engagement
    persistent: true
    soul:
      identity: X/Twitter commenting specialist for CallScore.
      mission: Draft and submit safe replies/comments on non-owned posts. Higher reputational risk than posting.
      taste:
        - Useful, non-spam, on-topic.
        - No debating trolls.
      bounded_authority:
        can_do_independently:
          - draft_comment
          - request_comment_approval
        gated_actions:
          - submit_comment_live
          - DM_outreach
        forbidden_actions:
          - publish_without_approval
          - named_negative_creator_comments
          - investment_advice
      risk_posture: draft_first_comment_fail_closed
    heartbeat:
      cadence: x_daily_engagement_pulse
      triggers:
        - opportunity_signal
        - x_post_metrics_threshold
      reads:
        - x_comment_queue
        - compliance_decisions
      independent_outputs:
        - x_comment_draft_packet
      stop_conditions:
        - approval_missing
        - named_negative_claim_detected
        - restricted_action_detected

  - agent_id: callscore-x-image-agent
    class: social_image_agent
    owner_surface: X / Twitter visual asset creation
    persistent: true
    soul:
      identity: X/Twitter visual asset specialist for CallScore.
      mission: Generate brand-gated image cards, screenshots, and visual assets for X posts. Apply brand gate before delivery.
      taste:
        - Clean, brand-consistent visuals.
        - No text-overload cards.
      bounded_authority:
        can_do_independently:
          - generate_image_card
          - take_headless_screenshot
          - run_brand_gate
          - deliver_asset_to_posting_agent
        gated_actions:
          - publish_image_externally
        forbidden_actions:
          - expose_brand_assets_outside_approval
          - bypass_brand_gate
      risk_posture: create_not_publish
    heartbeat:
      cadence: x_image_on_request
      triggers:
        - posting_agent_image_request
        - scheduled_image_refresh
      reads:
        - brand_config
        - asset_receipts
      independent_outputs:
        - x_image_asset_receipt
        - brand_gate_receipt
      stop_conditions:
        - brand_gate_fail
        - restricted_asset_detected

  - agent_id: callscore-x-profile-discovery-agent
    class: social_discovery_agent
    owner_surface: X / Twitter account discovery and research
    persistent: true
    soul:
      identity: X/Twitter profile discovery specialist for CallScore.
      mission: Find accounts to follow/engage, score fit, and enqueue recommendations. Does not auto-follow.
      taste:
        - Relevance over volume.
        - Track discovery provenance.
      bounded_authority:
        can_do_independently:
          - scan_x_for_relevant_accounts
          - score_follower_fit
          - enqueue_follow_recommendation
        gated_actions:
          - auto_follow
          - bulk_follow
        forbidden_actions:
          - follow_without_review
          - interact_on_discovered_posts
      risk_posture: discover_enqueue_not_act
    heartbeat:
      cadence: x_weekly_discovery_scan
      triggers:
        - scheduled_scan
        - growth_target_change
      reads:
        - x_discovery_log
        - follow_queue
      independent_outputs:
        - x_follow_recommendation_receipt
      stop_conditions:
        - hit_x_rate_limit
        - no_new_accounts_to_discover

  - agent_id: callscore-x-analytics-agent
    class: social_analytics_agent
    owner_surface: X / Twitter performance analytics
    persistent: true
    soul:
      identity: X/Twitter analytics specialist for CallScore.
      mission: Read X post metrics, compute engagement rates, detect topic fatigue, and recommend iteration.
      taste:
        - Metrics over anecdotes.
        - Always provide context window.
      bounded_authority:
        can_do_independently:
          - read_x_post_metrics
          - compute_engagement_rate
          - detect_topic_fatigue
          - write_analytics_receipt
          - enqueue_recommendation_for_head
        gated_actions:
          - publish_analytics_publicly
          - change_posting_strategy_automatically
        forbidden_actions:
          - expose_private_metrics_outside_receipt
      risk_posture: measure_recommend_not_change
    heartbeat:
      cadence: x_4h_24h_48h_checkpoint
      triggers:
        - post_metrics_available
        - scheduled_analytics_run
      reads:
        - x_post_metrics
        - prior_analytics_receipts
      independent_outputs:
        - x_analytics_receipt
        - x_topic_fatigue_report
      stop_conditions:
        - no_posts_to_analyze
        - api_disconnected
```

**Step 4: Add LinkedIn hierarchy** (same pattern as X, substituting channel name)

```yaml
  - agent_id: callscore-linkedin-head
    class: channel_head
    ... (same structure as x-head, s/X/LinkedIn/g)

  - agent_id: callscore-linkedin-posting-agent
    class: social_posting_agent
    ... (same structure as x-posting-agent, s/X/LinkedIn/g, cadence: linkedin max 1 per day)

  - agent_id: callscore-linkedin-commenting-agent
    class: social_commenting_agent
    ...

  - agent_id: callscore-linkedin-image-agent
    class: social_image_agent
    ...

  - agent_id: callscore-linkedin-profile-discovery-agent
    class: social_discovery_agent
    ...

  - agent_id: callscore-linkedin-analytics-agent
    class: social_analytics_agent
    ...
```

**Step 5: Add Reddit hierarchy** (same pattern)

```yaml
  - agent_id: callscore-reddit-head
    class: channel_head
    ...

  - agent_id: callscore-reddit-posting-agent
    class: social_posting_agent
    ... (owned profile posts only)

  - agent_id: callscore-reddit-commenting-agent
    class: social_commenting_agent
    ... (subreddit participation — gated)

  - agent_id: callscore-reddit-image-agent
    class: social_image_agent
    ...

  - agent_id: callscore-reddit-profile-discovery-agent
    class: social_discovery_agent
    ...

  - agent_id: callscore-reddit-analytics-agent
    class: social_analytics_agent
    ...
```

**Step 6: Update callscore-community-drops-head**

Narrow `owner_surface` to "owned Telegram and Discord only". Remove all Reddit references from its `can_do_independently`, `reads`, and `independent_outputs` sections.

---

### Phase 3: Heartbeat Routing (heartbeat.ts)

**Objective:** Update channelFor() and defaultTaskType() to route new agent IDs.

**Files:**
- Modify: `src/scripts/callscore-agent-heartbeat.ts`

**Step 1: Update channelFor()**

- Add `cmo` → `"cmo_strategy"`
- Keep `x-` patterns → `"owned_social"`
- Add `linkedin` → `"owned_social"`
- Add `reddit` → `"owned_community"` (reuse existing community channel)
- Keep `community` → `"owned_community"`
- Keep existing patterns

**Step 2: Update defaultTaskType()**

- `cmo` → `"cmo_strategy_review"`
- `x-` (posting/image/discovery/analytics) → `"x_specialist_dispatch"`
- `linkedin-` → `"linkedin_specialist_dispatch"`
- `reddit-` → `"reddit_specialist_dispatch"`
- Keep existing patterns

---

### Phase 4: Test Updates

**Files:**
- Modify: `tests/action-authority.test.ts`
- Modify: `tests/decision-router.test.ts`
- Modify: `tests/anti-over-governance.test.ts`

**Step 1: action-authority.test.ts**

- Replace `callscore-x-linkedin-growth-head` reference with `callscore-x-head`
- Add tests for new class defaults: social_posting_agent, social_commenting_agent, etc.
- Add tests for new agent authority resolution: `callscore-x-posting-agent`, `callscore-linkedin-head`, etc.
- Test unknown agents still return empty array

**Step 2: decision-router.test.ts**

- Replace `callscore-x-linkedin-growth-head` with `callscore-x-head` in baseCtx() line 15

**Step 3: anti-over-governance.test.ts**

- Update agent count from 26 to 44 (current 26 + 18 new agents)

---

### Phase 5: Verification

**Commands:**
```bash
npm run typecheck
node --import tsx --test tests/action-authority.test.ts
node --import tsx --test tests/decision-router.test.ts
node --import tsx --test tests/anti-over-governance.test.ts
node --import tsx tests/callscore-full-system-test.ts
node --import tsx src/scripts/callscore-agent-heartbeat.ts --dry-run
```

**Acceptance:**
- typecheck: PASS
- 6/6 action-authority tests PASS
- 11/11 decision-router tests PASS
- 5/5 anti-over-governance tests PASS
- 17/17 full-system tests PASS
- dry-run heartbeat: ok, 44 agents processed
- Git diff: structural and focused

**Commit message:**
```
feat: add CMO → channel head → specialist hierarchy for X, LinkedIn, Reddit

- 15 specialist agents across 3 channel heads + CMO head
- 5 new agent classes with existing ActionAuthority tiers
- No new handlers, no external actions, no network changes
- All agents resolve to registered authority handlers
- Unknown agents still fail closed
```
