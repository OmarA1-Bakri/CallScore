# Specialist Extraction Model Research

Date: 2026-04-26

## Immediate DB action already taken

The final untrustworthy 21-video extraction tranche was reset:

- Video IDs: 7950-7970
- Before reset: 21 marked extracted, 3 calls attached
- After reset: 0 marked extracted, 0 calls attached
- Global pending extraction is now 21
- Global calls count is now 16,756

These rows should not be reprocessed with the same generic extractor and then treated as trustworthy.

## Core diagnosis

The project problem is not ordinary document extraction/OCR. It is transcript-based financial/crypto call extraction:

- multilingual transcripts
- noisy ASR/subtitle text
- creator-specific phrasing
- implicit trade ideas rather than clean form fields
- distinction between macro commentary, education, exchange promo, and actionable market calls
- need for exact evidence quotes
- need to emit zero only when the model can justify no actionable call

Generic chat models can output JSON, but the recent false negatives show that schema compliance alone is insufficient.

## LlamaIndex role

LlamaIndex is useful as the extraction orchestration layer, not the model-quality solution by itself.

Useful capabilities:

- Pydantic-schema extraction
- chunking and multi-pass extraction over long transcripts
- structured validation/retry loops
- evidence/citation-oriented extraction patterns
- model abstraction across OpenAI, Gemini, OpenRouter, local models, etc.

Installed locally in a dedicated venv:

`/home/omar/.venvs/crypto-extraction-llamaindex`

Verified versions:

- llama-index-core: 0.12.52.post1
- pydantic: 2.13.3
- openai: 1.109.1

Do not yet add this to the Next.js package.json. Keep the first prototype as a Python sidecar until it proves extraction quality.

## Candidate specialist/specialist-adjacent models and tools

### 1. LlamaExtract / LlamaIndex structured extraction

Source: LlamaIndex docs and LlamaExtract beta material.

Strengths:

- purpose-built structured extraction workflow
- schema-driven extraction
- newer LlamaExtract supports citations/reasoning patterns according to public material

Weaknesses for us:

- document-field extraction is not the same as crypto trade-call extraction
- still depends on the underlying model
- may be commercial/API-bound

Verdict: good framework/pattern; not enough alone.

### 2. GoLLIE

Model: `HiTZ/GoLLIE-7B`

Description: Guideline-following Large Language Model for Information Extraction. It is explicitly trained for zero-shot information extraction using annotation schemas/guidelines defined at inference time.

Why it matters:

- closer to our problem than a generic chat model
- supports custom schemas with detailed annotation guidelines
- designed for NER, relation extraction, event extraction, and custom IE

Risks:

- 7B model; likely too heavy for CPU-only WSL at production speed
- model card language is English; multilingual behavior uncertain
- LLaMA2 license constraints need checking for commercial/product usage

Verdict: strong candidate for research/prototyping, but probably not our production runtime on this laptop. Could be useful via hosted GPU/endpoint if quality is high.

### 3. GLiNER / GLiNER-relex

Model: `knowledgator/gliner-relex-large-v1.0`

Description: zero-shot joint NER + relation extraction model. User defines entity labels and relation labels at inference time.

Why it matters:

- specialist IE model family, not a generic chat bot
- can extract candidate entities and relations in one forward pass
- smaller/more efficient than full LLMs
- useful as a candidate-snippet generator and validator

Possible schema for our domain:

Entities:

- crypto asset / ticker
- price level
- direction
- timeframe
- trading action
- risk level
- invalidation level

Relations:

- asset has target
- asset has support
- asset has resistance
- speaker recommends accumulating asset
- speaker warns against asset
- speaker expects asset to rally/fall

Risks:

- not specifically trained on crypto YouTube transcripts
- may not infer nuanced calls alone
- likely best as pre-filter/extractor-of-candidates, not final call judge

Verdict: high-priority component for specialist pipeline. Use before LLM extraction to avoid missing obvious call snippets.

### 4. Financial relation extraction models

Example: `yseop/distilbert-base-financial-relation-extraction`

Description: DistilBERT fine-tuned for financial relation type detection/classification.

Why it matters:

- actual financial relation extraction model

Weaknesses:

- trained on definitions/financial term relations, not creator trade calls
- relation labels are generic (`has`, `is in`, `is`, `are`, `x`)
- not enough for extracting BTC support/target/action/timeframe

Verdict: confirms the direction but not directly useful as the production extractor.

### 5. FinGPT / financial NER / FinBench ecosystem

Sources include FinGPT NER datasets and Open FinLLM Leaderboard/FinBench.

Why it matters:

- useful landscape for financial-domain LLMs and datasets
- may provide datasets/benchmarks for NER/relation extraction

Weaknesses:

- financial NER is often company/filing/XBRL/report oriented
- not directly aligned with crypto YouTube call extraction

Verdict: useful for model search and possible training data ideas, but no obvious plug-and-play model found yet.

## Recommended architecture

### Stage A: reset current false-complete rows

Done for final 21.

### Stage B: create gold evaluation set

Before choosing a model, manually label 20-50 transcript snippets/videos. This is non-negotiable; without this, we are just vibes-testing models.

Gold schema:

- video_id
- creator
- language
- transcript_span_start/end or exact quote
- asset symbol
- action: buy/sell/hold/watch/avoid/short/long/accumulate
- direction: bullish/bearish/neutral
- entry/support/resistance/target/stop if present
- timeframe if present
- confidence
- reason why it is a valid/invalid call

Include hard negatives:

- exchange promo/tutorial
- macro-only commentary
- regulation/tax explainer
- vague market chatter
- generic mention of support/resistance without recommendation

### Stage C: LlamaIndex Python sidecar prototype

Build `scripts/extract_calls_llamaindex.py` using Pydantic models:

- `CryptoCall`
- `EvidenceQuote`
- `NoCallReason`
- `VideoExtractionResult`

Critical rule: every call must include an exact evidence quote from the transcript. If no exact quote, reject the call.

### Stage D: candidate-snippet prefilter

Use either:

- multilingual keyword/rule windows first, or
- GLiNER/GLiNER-relex once installed/tested

The prefilter should find spans around terms like buy/sell/long/short/accumulate/support/resistance/target/bottom/rally/crash and their multilingual equivalents. Then the LlamaIndex extractor judges those spans.

### Stage E: model bake-off

Evaluate the same gold set across:

1. GPT-4o / GPT-4.1-class model with structured output
2. Gemini 2.5 Pro when quota permits, especially for long multilingual context
3. Claude Sonnet-class model only if explicitly approved for this project
4. GoLLIE if hosted/local inference is feasible
5. GLiNER-relex as a prefilter rather than final judge

Metrics:

- recall on valid calls
- false positive rate on no-call videos
- exact evidence quote quality
- symbol correctness
- direction/action correctness
- cost per video
- latency per video

### Stage F: DB status changes

The binary `calls_extracted` flag is too weak. Add a review/extraction state such as:

- pending
- extracted_with_calls
- extracted_zero_confident
- extraction_zero_suspect
- extraction_failed
- needs_manual_review

Until then, avoid writing `calls_extracted=true` for multilingual zero-call outputs unless the extractor emits a strong no-call rationale.

## Current recommendation

Install/use LlamaIndex as the structured extraction sidecar, but do not rely on a single generic chat model. The most promising specialist stack is:

1. GLiNER/GLiNER-relex or rules to detect candidate call spans.
2. LlamaIndex Pydantic extraction with strict evidence quotes.
3. A high-quality hosted model for final judgment, selected by bake-off.
4. Manual gold-set evaluation before mutating production calls.

The fastest useful next implementation is a LlamaIndex sidecar over the 21 reset videos with dry-run JSON output only. No DB writes until the output is manually inspected.
