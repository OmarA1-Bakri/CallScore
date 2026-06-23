# CallScore YouTube Automation Implementation Ledger

Generated: 2026-06-23

## Canonical control law

Runtime repo: `/opt/crypto-tuber-ranked`
Workplane repo: `/srv/agents/repos/callscore-workplane`
Canonical prompt plan: `/srv/agents/repos/callscore-workplane/docs/refactor/hermes-led-clean-kitchen/youtube-automation-canonical-prompt-plan.md`

## Non-negotiable architecture

- Use existing CallScore runtime, DB, agents, and workplane. This is not greenfield.
- Zod is the canonical persisted state and validation layer.
- Composio MCP is the canonical YouTube provider route.
- Full canonical agents only. No lite agents.
- No manual approval gate inside the video pipeline.
- Mechanical QA gates are allowed and required.
- Do not print or commit secrets.
- Do not commit generated production video artifacts.
- No production deploy unless explicitly approved.

## Prompt progress

| Prompt | Status | Evidence |
|---|---|---|
| Prompt 0 — YouTube Automation Control Law | complete | Control law activated; ledger initialized; receipt written. |

| Prompt 1 — Short Runtime Discovery and Ledger Init | complete | `docs/youtube-automation/discovery.json`; npm repo; Zod ^4.4.3; existing Hermes/DB queue rails preferred; Composio files discovered. |

## Prompt 1 discovery summary

- Package manager: `npm`
- Zod dependency: `^4.4.3`
- Framework deps currently relevant: `{'zod': '^4.4.3'}`
- Test command: `find tests -name '*.test.ts' -print0 | sort -z | xargs -0 node --import tsx --test`
- Typecheck command: `tsc --noEmit`
- Lint command: `next lint`
- Decision: use existing Hermes/Workplane/DB queue rails first; BullMQ only if later justified.
- Decision: LangGraph remains spike-only unless explicitly proven necessary.


| Prompt 2 — Canonical Video Domain Skeleton and Zod State Model | complete | `src/video/schemas/video.schemas.ts`, `src/video/schemas/youtube.schemas.ts`; targeted tests pass. |
| Prompt 3 — Artifact Paths and State Store | complete | `src/video/artifacts/artifact-paths.ts`, `src/video/artifacts/state-store.ts`; overwrite protection implemented; `artifacts/` already gitignored. |
| Prompt 4 — Real CallScore Candidate Loader and Ranking | complete | `src/video/data/load-callscore-video-candidates.ts`, `rank-video-candidates.ts`, mock fixtures; deterministic ranking and query mapping tested. |
| Prompt 5 — Automated Planner, Script, Scene Plan, Metadata, and Claim Validation | complete | deterministic planner, prompts, script validator, claim validator; schema/claim/script tests pass. |

## Prompt 2–5 implementation summary

- Added canonical Zod schemas for CallScore video job state, creator/call records, scenes, script packages, YouTube metadata, QA reports, and Composio publish result.
- Added deterministic artifact path builder and state store with overwrite protection unless `force` is passed.
- Added real provider-portable DB candidate loader using existing `query<T>` and `creators`, `creator_stats`, `calls` tables.
- Added deterministic candidate ranking using the uploaded content score formula.
- Added deterministic automated planner with no manual approval gate.
- Added script and claim validation to block unsafe phrases and unsupported numeric claims while allowing the required “not financial advice” disclaimer.
- Added prompt text modules for the four planned content formats and scene/metadata generation.
- Tests: `node --import tsx --test tests/video-automation-schemas.test.ts tests/video-automation-data-planning.test.ts` → 7/7 passed.
- Typecheck: `npm run typecheck` completed with no reported errors.


| Prompt 6 — Kokoro TTS, Audio Normalization, Captions, and SRT | complete | Kokoro.js primary path implemented; HH smoke test hit model/tokenizer load error, so FFmpeg flite fallback is implemented and tested; captions/SRT implemented. |
| Prompt 7 — Remotion Compositions and Rendering | complete | Remotion dependencies installed; four compositions registered; render pipeline uses bundle/getCompositions/renderMedia with selected composition object. |
| Prompt 8 — Deterministic Thumbnail Generation | complete | SVG + Sharp thumbnail generator writes PNG/JPG for vertical and horizontal formats; tests pass. |
| Prompt 9 — Composio YouTube Discovery and Publisher Interface | blocked | Publisher interface and mocked tests implemented; generic Hermes Composio MCP connection verified; exact YouTube tool schema discovery blocked by Hermes provider HTTP 429 before Composio schema tool execution. |

## Prompt 6–9 run summary

- Installed runtime packages: `kokoro-js`, `remotion`, `@remotion/renderer`, `@remotion/bundler`, `sharp`.
- FFmpeg and ffprobe already exist on HH.
- Kokoro.js is the primary TTS path. In this HH run, live Kokoro model/tokenizer loading failed; fallback uses FFmpeg flite so the automated pipeline can still generate valid WAV artifacts.
- Captions and SRT generation are implemented from scene timings.
- Remotion surface is implemented with four registered CallScore compositions and reusable product-led data components.
- Deterministic thumbnails use SVG + Sharp and do not require AI image generation.
- Composio publisher interface is implemented with mocked upload/thumbnail tests.
- Real exact YouTube schema discovery did not complete because Hermes one-shot hit provider HTTP 429 before tool execution.
- Tests: `node --import tsx --test tests/video-automation-media.test.ts tests/video-automation-publisher.test.ts tests/video-automation-schemas.test.ts tests/video-automation-data-planning.test.ts` → 11/11 passed.
- Typecheck: `npm run typecheck` completed with no reported errors.


## Prompt 9 completion update

Prompt 9 is now complete after retrying schema discovery through Hermes MCP internals instead of Hermes LLM one-shot.

Evidence:

- Composio YouTube search artifact: `.tmp/workflow-receipts/youtube_automation/composio-youtube-tool-search.json`
- Exact schema artifact: `.tmp/workflow-receipts/youtube_automation/composio-youtube-tool-schemas.json`
- Committed summary: `docs/youtube-automation/composio-youtube-tool-schema-summary.json`
- Active YouTube connection was reported by Composio search for toolkit `youtube`.
- Exact tool slugs captured: `YOUTUBE_UPLOAD_VIDEO`, `YOUTUBE_MULTIPART_UPLOAD_VIDEO`, `YOUTUBE_UPDATE_THUMBNAIL`, `YOUTUBE_UPDATE_VIDEO`, `YOUTUBE_LIST_CHANNELS`, `YOUTUBE_GET_VIDEO_DETAILS_BATCH`, `YOUTUBE_LIST_CHANNEL_VIDEOS`, `YOUTUBE_GET_CHANNEL_STATISTICS`, `YOUTUBE_LIST_VIDEO_CATEGORIES`.
- Publisher arguments updated to exact schema names.
- Important limitation: YouTube upload tools require a Composio file object (`name`, `mimetype`, `s3key`), not a raw HH local file path. Thumbnail update requires `thumbnailUrl`, not a raw local image path. This is now enforced in code.
- Tests: `node --import tsx --test tests/video-automation-publisher.test.ts tests/video-automation-media.test.ts tests/video-automation-schemas.test.ts tests/video-automation-data-planning.test.ts` → 12/12 passed.
- Typecheck: `npm run typecheck` completed with no reported errors.


| Prompt 10 — Publishing Config and Mechanical QA | complete | `src/video/config/publishing-config.ts`, `src/video/qa/*`; timezone-correct scheduled publishing; deterministic QA and publish decision tests pass. |
| Prompt 11 — Queue Workers and Scheduler | complete | file-backed video queue and stage workers implemented under `src/video/queues`; scheduler enqueues daily/weekly jobs without DB migration. |
| Prompt 12 — CLI Commands and Env Example | complete | package scripts added for video discover/daily/publish/worker/backfill; env example added at `docs/youtube-automation/env.example`. |
| Prompt 13 — Analytics Ingestion and Topic Feedback | complete | non-blocking YouTube analytics ingestion surface implemented and tested with mocked Composio executor. |

## Prompt 10–13 implementation summary

- Added publishing config loader and scheduled publish time calculation using configured timezone, default `Asia/Jakarta`.
- Added deterministic QA modules for video, audio, thumbnail, metadata, and claim validation.
- Added publish decision logic: QA must pass; auto-publish must be enabled; no human approval gate is introduced.
- Added file-backed video queue and worker stages for plan, audio, captions, render, thumbnail, QA, publish, and analytics.
- Added scheduler entrypoint for daily short, weekly investigation, and weekly leaderboard update cadence.
- Added CLI scripts and package scripts: `video:discover`, `video:daily`, `video:publish`, `video:worker`, `video:backfill`.
- Added non-secret env example under docs.
- Added non-blocking YouTube analytics ingestion via Composio executor abstraction.
- Tests: full local YouTube automation targeted suite → 17/17 passed.
- Typecheck: `tsc --noEmit` completed with no reported errors.


| Prompt 14 — Tests, Typecheck, Lint, and Secret Scan | complete | YouTube targeted suite 17/17 passed; typecheck passed; `next lint` passed; relevant credential-shape scan found 0 findings. |
| Prompt 15 — Full Local Automated Pipeline Run | complete | `npm run video:daily -- --mock` produced `artifacts/video-jobs/daily_short-2026-06-23T09-04-49-194Z` with valid MP4/audio/captions/thumbnail/QA pass; publish skipped by config. |
| Prompt 16 — Production Composio YouTube Publish Validation | complete_no_publish_by_config | Preflight complete; YouTube schemas and active connection verified; live upload not attempted because `VIDEO_AUTO_PUBLISH=false`; file-object bridge prerequisite recorded. |
| Prompt 17 — Final Completion Report and Commit | complete | `docs/youtube-automation/FINAL_COMPLETION_REPORT.md`; final receipts and commits recorded. |

## Prompt 14–17 final run summary

- Prompt 14: targeted video automation tests passed 17/17; typecheck passed; lint passed; relevant credential-shape scan found 0 findings.
- Prompt 15: full local video pipeline produced MP4, audio, captions, thumbnails, QA report, and publish result under `artifacts/video-jobs/daily_short-2026-06-23T09-04-49-194Z`.
- Prompt 16: production Composio YouTube preflight completed without live upload because auto-publish is disabled. Exact schemas and active YouTube connection are already captured.
- Prompt 17: final report written and final state prepared for commit.

