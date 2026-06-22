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

