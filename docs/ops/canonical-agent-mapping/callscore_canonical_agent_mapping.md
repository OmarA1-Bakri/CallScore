# CallScore Canonical Agent Mapping

## Machine-readable first

The canonical source of truth is:

```text
callscore_canonical_agent_mapping.source.json
```

```json
{
  "existing_agents": 44,
  "proposed_new_required": 7,
  "total_mapped": 51,
  "documentation_format": "markdown_only",
  "diagram_format": "mermaid_only",
  "canonical_rule": "44 agents are the baseline. Upgrade/remap existing agents first. Create new agents only when a real role gap remains after mapping."
}
```

## Core conclusions

1. The 44 agents are canonical baseline agents.
2. Most gaps are solved by upgrading/remapping existing agents.
3. YouTube is the justified exception: it needs 7 new production-channel agents.
4. No new Copy Chief, ML Head, Learning Head, Visual QA Agent, Community Image Agent, Whop Asset Agent, or Email Asset Agent is justified yet.
5. Required runtime artifacts are receipts, hard gates, loops, tests, and audit coverage.

## Required receipt classes

```json
[
  "editorial_angle_receipt.v1",
  "platform_fit_receipt.v1",
  "visual_brief_receipt.v1",
  "visual_qa_receipt.v1",
  "copy_visual_coherence_receipt.v1",
  "same_shit_memory_receipt.v1",
  "learning_event.v1",
  "agent_performance_ledger.v1",
  "learning_delta.v1",
  "experiment_result.v1"
]
```

## Global flow
```mermaid
flowchart TD
    Data_social_market_signal["Data / social / market signal"] -->|research intelligence| callscore_opportunity_research_head["callscore-opportunity-research-head"]
    Data_social_market_signal["Data / social / market signal"] -->|evidence freshness| callscore_data_pipeline_sentinel["callscore-data-pipeline-sentinel"]
    callscore_opportunity_research_head["callscore-opportunity-research-head"] -->|angle thesis| callscore_artofwar_strategist["callscore-artofwar-strategist"]
    callscore_data_pipeline_sentinel["callscore-data-pipeline-sentinel"] -->|fresh evidence| callscore_artofwar_strategist["callscore-artofwar-strategist"]
    callscore_artofwar_strategist["callscore-artofwar-strategist"] -->|campaign angle| callscore_cmo_head["callscore-cmo-head"]
    callscore_cmo_head["callscore-cmo-head"] -->|platform allocation| Channel_Router["Channel Router"]
    Channel_Router["Channel Router"] -->|dispatch| Channel_Cluster["Channel Cluster"]
    Channel_Cluster["Channel Cluster"] -->|receipts verification| callscore_reviewer_head["callscore-reviewer-head"]
    callscore_reviewer_head["callscore-reviewer-head"] -->|evidence/trust| callscore_trust_head["callscore-trust-head"]
    callscore_trust_head["callscore-trust-head"] -->|policy| callscore_compliance_linter_head["callscore-compliance-linter-head"]
    callscore_compliance_linter_head["callscore-compliance-linter-head"] -->|hard safety| callscore_safety_head["callscore-safety-head"]
    callscore_safety_head["callscore-safety-head"] -->|handoff only| Existing_publication_action_gates["Existing publication/action gates"]
```

## YouTube production cluster
```mermaid
flowchart TD
    callscore_youtube_discovery_head["callscore-youtube-discovery-head"] -->|creator/video candidates| callscore_youtube_head["callscore-youtube-head"]
    callscore_transcript_scraper_head["callscore-transcript-scraper-head"] -->|transcript evidence| callscore_youtube_script_agent["callscore-youtube-script-agent"]
    callscore_llm_extractor_head["callscore-llm-extractor-head"] -->|call evidence| callscore_youtube_script_agent["callscore-youtube-script-agent"]
    callscore_price_matcher_head["callscore-price-matcher-head"] -->|market truth| callscore_youtube_script_agent["callscore-youtube-script-agent"]
    callscore_scorer_head["callscore-scorer-head"] -->|score hooks| callscore_youtube_packaging_agent["callscore-youtube-packaging-agent"]
    callscore_cmo_head["callscore-cmo-head"] -->|editorial allocation| callscore_youtube_head["callscore-youtube-head"]
    callscore_youtube_head["callscore-youtube-head"] -->|script brief| callscore_youtube_script_agent["callscore-youtube-script-agent"]
    callscore_youtube_head["callscore-youtube-head"] -->|packaging brief| callscore_youtube_packaging_agent["callscore-youtube-packaging-agent"]
    callscore_youtube_packaging_agent["callscore-youtube-packaging-agent"] -->|title-thumbnail brief| callscore_youtube_thumbnail_agent["callscore-youtube-thumbnail-agent"]
    callscore_youtube_script_agent["callscore-youtube-script-agent"] -->|script/video package| callscore_youtube_publishing_agent["callscore-youtube-publishing-agent"]
    callscore_youtube_thumbnail_agent["callscore-youtube-thumbnail-agent"] -->|thumbnail receipt| callscore_youtube_publishing_agent["callscore-youtube-publishing-agent"]
    callscore_youtube_publishing_agent["callscore-youtube-publishing-agent"] -->|publish package receipts| callscore_reviewer_head["callscore-reviewer-head"]
    callscore_reviewer_head["callscore-reviewer-head"] -->|evidence/trust| callscore_trust_head["callscore-trust-head"]
    callscore_trust_head["callscore-trust-head"] -->|policy| callscore_compliance_linter_head["callscore-compliance-linter-head"]
    callscore_compliance_linter_head["callscore-compliance-linter-head"] -->|safety| callscore_safety_head["callscore-safety-head"]
    callscore_safety_head["callscore-safety-head"] -->|handoff| Existing_YouTube_publication_gate["Existing YouTube publication gate"]
    Existing_YouTube_publication_gate["Existing YouTube publication gate"] -->|performance data| callscore_youtube_analytics_agent["callscore-youtube-analytics-agent"]
    callscore_youtube_analytics_agent["callscore-youtube-analytics-agent"] -->|feedback| callscore_youtube_head["callscore-youtube-head"]
    Existing_YouTube_publication_gate["Existing YouTube publication gate"] -->|community opportunities| callscore_youtube_commenting_agent["callscore-youtube-commenting-agent"]
```

## Learning cluster
```mermaid
flowchart TD
    System_event_user_feedback_failed_output["System event / user feedback / failed output"] -->|verify event| callscore_reviewer_head["callscore-reviewer-head"]
    callscore_reviewer_head["callscore-reviewer-head"] -->|durable event| learning_event_v1["learning_event.v1"]
    learning_event_v1["learning_event.v1"] -->|prediction & learning| callscore_markov_trajectory_head["callscore-markov-trajectory-head"]
    learning_event_v1["learning_event.v1"] -->|model/prompt quality| callscore_ml_verifier_head["callscore-ml-verifier-head"]
    learning_event_v1["learning_event.v1"] -->|editorial/channel learning| callscore_cmo_head["callscore-cmo-head"]
    learning_event_v1["learning_event.v1"] -->|workflow/agent telemetry| callscore_orchestrator_head["callscore-orchestrator-head"]
    callscore_markov_trajectory_head["callscore-markov-trajectory-head"] -->|proposed delta| learning_delta_v1["learning_delta.v1"]
    callscore_ml_verifier_head["callscore-ml-verifier-head"] -->|model delta| learning_delta_v1["learning_delta.v1"]
    callscore_cmo_head["callscore-cmo-head"] -->|editorial delta| learning_delta_v1["learning_delta.v1"]
    callscore_orchestrator_head["callscore-orchestrator-head"] -->|agent performance| agent_performance_ledger_v1["agent_performance_ledger.v1"]
    learning_delta_v1["learning_delta.v1"] -->|trust validation| callscore_trust_head["callscore-trust-head"]
    callscore_trust_head["callscore-trust-head"] -->|architecture plan| callscore_architect_head["callscore-architect-head"]
    callscore_architect_head["callscore-architect-head"] -->|tested implementation| callscore_implementer_head["callscore-implementer-head"]
    callscore_implementer_head["callscore-implementer-head"] -->|verify improvement| callscore_reviewer_head["callscore-reviewer-head"]
```
