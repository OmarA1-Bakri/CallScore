# Local extractor benchmark

The local extractor benchmark compares Ollama models and prompt variants without touching production data.

Run:

```bash
OLLAMA_HOST=http://127.0.0.1:11434 npm run benchmark:extractors -- \
  --fixtures data/eval/call-extraction-fixtures.jsonl \
  --configs gemma4:latest@shared-baseline,qwen2.5:3b@shared-baseline,gemma4:latest@gemma-optimized,qwen2.5:3b@qwen-optimized,callscore-gemma4-extractor:latest@modelfile-user,callscore-qwen25-3b-extractor:latest@modelfile-user \
  --timeout-ms 120000 \
  --num-predict 900 \
  --out /tmp/callscore-local-extractor-benchmark.json \
  --dry-run
```

The harness:

- imports no DB module;
- writes no production calls;
- validates strict JSON arrays;
- validates normalized schema;
- cleans literal `"null"` strings to JSON null during parser normalization;
- tracks false positives and creator-owned classification;
- records latency and raw model output in a safe local artifact.

Quality gate:

- JSON validity >= 95%;
- schema compliance >= 95%;
- no high-confidence non-call false positives;
- quoted/news/aggregation/guest snippets not marked creator-owned;
- obvious BTC/SOL calls extracted correctly;
- latency acceptable for daily bounded extraction.

## 2026-06-12 benchmark result

Model pruning completed before benchmarking:

- removed `qwen2.5:1.5b`;
- removed unused `deepseek-v4-pro:cloud` pointer;
- retained `gemma4:latest`;
- retained `qwen2.5:3b`.

Full six-way dry-run benchmark artifact: `/tmp/callscore-local-extractor-benchmark-v2.json`.
Final clean Gemma candidate recheck artifact: `/tmp/callscore-local-extractor-benchmark-v6-gemma-revert.json`.

| Model/config | Fixtures | Passed | JSON arrays | Schema pass | False positives | Recall | Avg latency | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `gemma4:latest` + shared baseline | 10 | 4 | 4 | 4 | 0 | 10 | 33200ms | not ready |
| `qwen2.5:3b` + shared baseline | 10 | 0 | 10 | 9 | 0 | 6 | 17418ms | not ready |
| `gemma4:latest` + Gemma prompt | 10 | 6 | 10 | 7 | 0 | 10 | 40445ms | not ready |
| `qwen2.5:3b` + Qwen prompt | 10 | 5 | 10 | 10 | 0 | 7 | 14419ms | not ready |
| `callscore-gemma4-extractor:latest` | 10 | 10 | 10 | 10 | 0 | 10 | 30438ms clean recheck | candidate pass |
| `callscore-qwen25-3b-extractor:latest` | 10 | 0 | 10 | 2 | 0 | 6 | 16152ms | not ready |

Decision:

- `callscore-gemma4-extractor:latest` is approved as the preferred local extraction **candidate** for the next dry-run/canary integration step.
- `qwen2.5:3b` remains installed as a baseline only.
- Production extraction default remains unchanged.
- No production calls or rankings were written by this benchmark.

Known caveats:

- Gemma is materially slower than Qwen on CPU, with cold first-call latency up to ~55-83s in clean runs.
- Prompt-wrapped Gemma is good enough for canary mode, not broad autonomous production writes.
- Qwen is faster but still misses creator-owned obvious calls, drifts schema, and creates unsafe ownership/classification errors under its Modelfile.

Next target:

1. Wire `callscore-gemma4-extractor:latest` behind a dry-run/canary-only local extractor flag.
2. Run on laptop-ingested real transcripts with no DB writes first.
3. Compare against rule extractor and existing production extractor before any promotion.
4. Build larger labeled eval set from accepted/rejected historical transcripts.

## Fine-tuning plan if prompt/Modelfile tuning stalls

Do not start true fine-tuning without approval. If needed:

- collect at least 300-1000 labeled transcript chunks with accepted/rejected normalized outputs;
- reserve 20% validation split and include adversarial no-call/quoted/guest/news examples;
- train LoRA/QLoRA with Unsloth or Axolotl on a GPU machine, not HH CPU;
- export merged/adapter model to GGUF with llama.cpp;
- import to Ollama and rerun this benchmark plus real-transcript dry-run canaries;
- promotion gate remains no production writes until benchmark + real canary pass.

## 2026-06-13 schema-contract reconciliation

PR #66's `callscore-gemma4-extractor:latest` 10/10 result remains valid, but it was a benchmark of the **normalized eval schema** (`status`, `asset_symbol`, `ownership`, `is_creator_owned`, etc.). A later production-shadow Modelfile changed `callscore-gemma4-extractor:latest` to the **production extraction schema** (`symbol`, `direction`, `call_type`, `entry_price`, `target_price`, `raw_quote`, etc.). Comparing production-schema output against the old eval-schema validator created a false regression.

The contracts are now split explicitly:

- `ops/ollama/Modelfile.callscore-gemma4-eval-extractor` preserves the PR #66 optimized eval-schema prompt.
- `ops/ollama/Modelfile.callscore-gemma4-extractor` remains the production-schema shadow extractor.
- `npm run benchmark:extractors` accepts `--schema eval` or `--schema production`.
- The benchmark records the schema contract in each row and summary.

Rebuild local models:

```bash
ollama create callscore-gemma4-eval-extractor -f ops/ollama/Modelfile.callscore-gemma4-eval-extractor
ollama create callscore-gemma4-extractor -f ops/ollama/Modelfile.callscore-gemma4-extractor
```

Eval-schema PR #66 recheck:

```bash
OLLAMA_HOST=http://127.0.0.1:11434 npm run benchmark:extractors -- \
  --fixtures data/eval/call-extraction-fixtures.jsonl \
  --configs callscore-gemma4-eval-extractor:latest@modelfile-user \
  --schema eval \
  --timeout-ms 120000 \
  --num-predict 900 \
  --out .tmp/shadow-extraction/gemma-eval-schema-pr66-recheck.json \
  --dry-run
```

Result: `10/10` fixtures passed, `10/10` JSON arrays, `10/10` schema pass, `0` false positives, recall `10/10`, `candidate_pass`.

Production-schema recheck:

```bash
OLLAMA_HOST=http://127.0.0.1:11434 npm run benchmark:extractors -- \
  --fixtures data/eval/call-extraction-fixtures.jsonl \
  --configs callscore-gemma4-extractor:latest@modelfile-user \
  --schema production \
  --timeout-ms 120000 \
  --num-predict 900 \
  --out .tmp/shadow-extraction/gemma-production-schema-recheck.json \
  --dry-run
```

Result: `10/10` fixtures passed, `10/10` JSON arrays, `10/10` production-schema pass, `0` false positives, recall `10/10`, `candidate_pass`.

Bounded real-transcript shadow canary:

- Run id: `gemma-production-shadow-recheck-20260613T140436Z`.
- Artifact: `.tmp/shadow-extraction/gemma-production-shadow-recheck-20260613T140436Z.jsonl`.
- Result: `schema_valid=true`, `accepted_count=1`, `candidate_count=1`, `latency_ms=42423`, no parser errors.
- Scope: local Ollama only, limit `1`, one chunk, artifact-only, no production writes, no promotion.

Promotion remains blocked until separate explicit approval plus larger shadow/diff review. This reconciliation proves benchmark contracts and bounded shadow readiness; it does not authorize production writes.
