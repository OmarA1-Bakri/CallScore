# CallScore Canonical Channel Flow Diagrams



Machine-readable source of truth: `callscore_canonical_agent_mapping.source.json`.



All diagrams are Mermaid. No PNG/SVG/HTML documentation is canonical.



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



## X flow

```mermaid
flowchart TD
    callscore_cmo_head["callscore-cmo-head"] -->|channel allocation| callscore_x_head["callscore-x-head"]
    callscore_x_head["callscore-x-head"] -->|copy task| callscore_x_posting_agent["callscore-x-posting-agent"]
    callscore_x_head["callscore-x-head"] -->|visual task| callscore_x_image_agent["callscore-x-image-agent"]
    callscore_x_posting_agent["callscore-x-posting-agent"] -->|copy receipt| callscore_reviewer_head["callscore-reviewer-head"]
    callscore_x_image_agent["callscore-x-image-agent"] -->|visual receipt| callscore_reviewer_head["callscore-reviewer-head"]
    callscore_reviewer_head["callscore-reviewer-head"] -->|claim/trust| callscore_trust_head["callscore-trust-head"]
    callscore_trust_head["callscore-trust-head"] -->|policy| callscore_compliance_linter_head["callscore-compliance-linter-head"]
    callscore_compliance_linter_head["callscore-compliance-linter-head"] -->|safety| callscore_safety_head["callscore-safety-head"]
    callscore_safety_head["callscore-safety-head"] -->|handoff| Existing_X_publication_gate["Existing X publication gate"]
    Existing_X_publication_gate["Existing X publication gate"] -->|feedback| callscore_x_analytics_agent["callscore-x-analytics-agent"]
```



## Linkedin flow

```mermaid
flowchart TD
    callscore_cmo_head["callscore-cmo-head"] -->|channel allocation| callscore_linkedin_head["callscore-linkedin-head"]
    callscore_linkedin_head["callscore-linkedin-head"] -->|copy task| callscore_linkedin_posting_agent["callscore-linkedin-posting-agent"]
    callscore_linkedin_head["callscore-linkedin-head"] -->|visual task| callscore_linkedin_image_agent["callscore-linkedin-image-agent"]
    callscore_linkedin_posting_agent["callscore-linkedin-posting-agent"] -->|copy receipt| callscore_reviewer_head["callscore-reviewer-head"]
    callscore_linkedin_image_agent["callscore-linkedin-image-agent"] -->|visual receipt| callscore_reviewer_head["callscore-reviewer-head"]
    callscore_reviewer_head["callscore-reviewer-head"] -->|claim/trust| callscore_trust_head["callscore-trust-head"]
    callscore_trust_head["callscore-trust-head"] -->|policy| callscore_compliance_linter_head["callscore-compliance-linter-head"]
    callscore_compliance_linter_head["callscore-compliance-linter-head"] -->|safety| callscore_safety_head["callscore-safety-head"]
    callscore_safety_head["callscore-safety-head"] -->|handoff| Existing_LinkedIn_publication_gate["Existing LinkedIn publication gate"]
    Existing_LinkedIn_publication_gate["Existing LinkedIn publication gate"] -->|feedback| callscore_linkedin_analytics_agent["callscore-linkedin-analytics-agent"]
```



## Reddit flow

```mermaid
flowchart TD
    callscore_cmo_head["callscore-cmo-head"] -->|channel allocation| callscore_reddit_head["callscore-reddit-head"]
    callscore_reddit_head["callscore-reddit-head"] -->|owned profile post| callscore_reddit_posting_agent["callscore-reddit-posting-agent"]
    callscore_reddit_head["callscore-reddit-head"] -->|gated comment draft| callscore_reddit_commenting_agent["callscore-reddit-commenting-agent"]
    callscore_reddit_head["callscore-reddit-head"] -->|visual task| callscore_reddit_image_agent["callscore-reddit-image-agent"]
    callscore_reddit_head["callscore-reddit-head"] -->|community/rules research| callscore_reddit_profile_discovery_agent["callscore-reddit-profile-discovery-agent"]
    callscore_reddit_profile_discovery_agent["callscore-reddit-profile-discovery-agent"] -->|rule context| callscore_compliance_linter_head["callscore-compliance-linter-head"]
    callscore_reddit_posting_agent["callscore-reddit-posting-agent"] -->|copy receipt| callscore_reviewer_head["callscore-reviewer-head"]
    callscore_reddit_image_agent["callscore-reddit-image-agent"] -->|visual receipt| callscore_reviewer_head["callscore-reviewer-head"]
    callscore_reviewer_head["callscore-reviewer-head"] -->|claim/trust| callscore_trust_head["callscore-trust-head"]
    callscore_trust_head["callscore-trust-head"] -->|policy| callscore_compliance_linter_head["callscore-compliance-linter-head"]
    callscore_compliance_linter_head["callscore-compliance-linter-head"] -->|safety| callscore_safety_head["callscore-safety-head"]
    callscore_safety_head["callscore-safety-head"] -->|handoff| Existing_Reddit_gate["Existing Reddit gate"]
    Existing_Reddit_gate["Existing Reddit gate"] -->|feedback| callscore_reddit_analytics_agent["callscore-reddit-analytics-agent"]
```



## Youtube flow

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



## Learning flow

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



## Support Surfaces flow

```mermaid
flowchart TD
    callscore_cmo_head["callscore-cmo-head"] -->|community allocation| callscore_community_drops_head["callscore-community-drops-head"]
    callscore_community_drops_head["callscore-community-drops-head"] -->|community copy + visual receipts| callscore_reviewer_head["callscore-reviewer-head"]
    callscore_cmo_head["callscore-cmo-head"] -->|commerce allocation| callscore_whop_commerce_head["callscore-whop-commerce-head"]
    callscore_whop_commerce_head["callscore-whop-commerce-head"] -->|listing/copy/asset receipts| callscore_reviewer_head["callscore-reviewer-head"]
    callscore_cmo_head["callscore-cmo-head"] -->|partnership allocation| callscore_email_partnership_drafts_head["callscore-email-partnership-drafts-head"]
    callscore_email_partnership_drafts_head["callscore-email-partnership-drafts-head"] -->|draft/asset approval packet| callscore_reviewer_head["callscore-reviewer-head"]
    callscore_reviewer_head["callscore-reviewer-head"] -->|trust| callscore_trust_head["callscore-trust-head"]
    callscore_trust_head["callscore-trust-head"] -->|policy| callscore_compliance_linter_head["callscore-compliance-linter-head"]
    callscore_compliance_linter_head["callscore-compliance-linter-head"] -->|safety| callscore_safety_head["callscore-safety-head"]
    callscore_safety_head["callscore-safety-head"] -->|handoff| Existing_gated_action_paths["Existing gated action paths"]
```
