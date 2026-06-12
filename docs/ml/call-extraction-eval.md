# CallScore call-extraction eval dataset

`data/eval/call-extraction-fixtures.jsonl` is the small, high-signal local model eval set for transcript-to-call extraction.

Rules:

- Dry-run only. Do not write production calls from this dataset.
- Fixtures use synthetic/public-style snippets only; no secrets or private data.
- Only `creator_own_call` can become public eligible.
- News, aggregation, guest, quoted third-party, hype, and generic subtitle fragments must be rejected or low-confidence.
- Expected outputs use the normalized CallScore extraction schema:

```json
{
  "status": "accepted_call | rejected_non_call | rejected_not_creator_owned | rejected_news_or_aggregation | rejected_ambiguous | rejected_invalid_json | rejected_unsupported_asset",
  "quote": "string|null",
  "asset_symbol": "BTCUSDT|null",
  "direction": "bullish|bearish|neutral|null",
  "call_type": "directional|price_target|risk_warning|range_prediction|null",
  "thesis": "string|null",
  "timeframe": "string|null",
  "entry_reference": "string|null",
  "target": "string|null",
  "stop_loss_or_invalidation": "string|null",
  "ownership": "creator_own_call|guest_call|quoted_external_call|news_report|aggregation|unknown",
  "is_creator_owned": true,
  "confidence": 0.0,
  "rejection_reason": "string|null"
}
```

Current model benchmark target:

```bash
OLLAMA_HOST=http://127.0.0.1:11434 npm run benchmark:extractors -- \
  --fixtures data/eval/call-extraction-fixtures.jsonl \
  --configs gemma4:latest@shared-baseline,qwen2.5:3b@shared-baseline,gemma4:latest@gemma-optimized,qwen2.5:3b@qwen-optimized,callscore-gemma4-extractor@modelfile-user,callscore-qwen25-3b-extractor@modelfile-user \
  --out /tmp/callscore-local-extractor-benchmark.json
```
