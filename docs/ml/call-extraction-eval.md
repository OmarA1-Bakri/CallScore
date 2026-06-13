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

## 2026-06-13 schema modes

The fixture dataset still defines the normalized eval contract. Production-shadow extraction now has a separate benchmark mode because the live shadow extractor returns production-schema rows.

Use:

- `--schema eval` for normalized PR #66-style outputs with `status`, `asset_symbol`, `ownership`, and rejection objects.
- `--schema production` for production rows with `symbol`, `direction`, `call_type`, numeric price fields, `raw_quote`, and `extraction_confidence`. Production validation has its own intentionally bounded production-shadow symbol subset, currently including `AVAXUSDT` and `SUIUSDT` in addition to the preserved PR #66 eval set. It is not the full `TRACKED_SYMBOLS` universe until larger shadow coverage proves the remaining symbols safe.

Important distinction:

- Eval schema can emit explicit rejection objects.
- Production schema treats no-call/rejection cases as `[]` in benchmark mode.
- `[]` remains valid for no-call fixtures in production mode.
- Production rows are normalized only inside the benchmark harness for fixture scoring; shadow promotion is still separate and approval-gated.

Latest local evidence:

- Eval model `callscore-gemma4-eval-extractor:latest`: `10/10` fixture pass under `--schema eval`.
- Production model `callscore-gemma4-extractor:latest`: `10/10` fixture pass under `--schema production`.
- Real-transcript production shadow canary wrote one artifact with `schema_valid=true` and no production writes.


The eval-schema Modelfile intentionally preserves the PR #66 benchmark prompt as a controlled-fixture contract; do not use it for untrusted production transcript runs. Production shadow extraction uses the separate guarded production-schema Modelfile.
