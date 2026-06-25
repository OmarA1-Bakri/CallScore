# YouTube Automation Fix & OpenMontage Integration — Combined Implementation Plan

> **For Hermes:** Use subagent-driven-development or direct execution, task-by-task.
>
> **Goal:** Fix the broken YouTube video automation pipeline, then layer on OpenMontage-driven visual upgrades.

**Architecture:**
The YouTube automation has a filesystem-based video queue (`.tmp/video-queue/`) that nobody consumes, a broken agent heartbeat (`REVIEW → REVIEW` state transition error), and no cron-driven scheduler for daily video production. Separately, OpenMontage provides 48 Python tools and reusable Remotion components for richer video output.

**Tech Stack:** TypeScript, Node 22, Remotion, Python 3.10+, FFmpeg, PostgreSQL (HH), Kokoro TTS

**Pre-requisite status:**
- ✅ hermes-worker daemons running (2x data-pipeline, 1x channel-agent)
- ✅ Core pipeline crons running (candles every 15m, match/scores at 03:30/03:45)
- ✅ Enqueue server running (port 8788)
- ❌ Video queue: 6 jobs stuck at "plan" since June 23 — no consumer
- ❌ Agent heartbeat: exits with `Invalid state transition: REVIEW → REVIEW`
- ❌ No cron for video pipeline or video queue consumer
- ❌ OpenMontage not cloned yet

---

## Phase 1: Fix YouTube Automation Pipeline

### Task 1.1: Debug and fix the agent heartbeat

**Objective:** Fix `Invalid state transition: REVIEW → REVIEW` so the channel-head decision layer works again.

**Files:**
- Debug: `src/scripts/callscore-agent-heartbeat.ts`
- Debug: `src/lib/autonomy/channel-head-context.ts` (or wherever state transitions are defined)
- Debug: `src/lib/autonomy/` — the decision pipeline files

**Step 1: Reproduce and locate the error**

```bash
cd /opt/crypto-tuber-ranked
node --import tsx src/scripts/callscore-agent-heartbeat.ts 2>&1
```

Expected: `Invalid state transition: REVIEW → REVIEW. Allowed from REVIEW: [EVALUATING, FAILED]`

**Step 2: Trace the state transition code**

Search for the state machine definition — likely in a `channel-head-context.ts` or a state schema. Find which code path tries to transition `REVIEW → REVIEW`.

**Step 3: Fix the bug**

Options depending on root cause:
- If the heartbeat reads an `agent_instances` row that already has `status='REVIEW'` and tries to set it again: add a guard to skip no-op transitions
- If the heartbeat code path calls `evaluateAgent()` on an agent already in REVIEW state: add an idempotent guard

**Step 4: Verify**

```bash
cd /opt/crypto-tuber-ranked
node --import tsx src/scripts/callscore-agent-heartbeat.ts 2>&1
```

Expected: exit 0, no error output

**Step 5: Commit**

```bash
cd /opt/crypto-tuber-ranked
git add -A
git commit -m "fix: agent heartbeat REVIEW→REVIEW state transition"
```

---

### Task 1.2: Create video queue consumer cron job

**Objective:** Add a cron job that consumes `.tmp/video-queue/` items and runs the corresponding video pipeline stages.

**Files:**
- Read: `src/video/queues/start-video-workers.ts` — existing pipeline runner
- Read: `src/video/queues/video-queues.ts` — queue data structures
- Create or modify: cron job via Hermes cron manager

**Step 1: Check if a video consumer script exists**

```bash
cd /opt/crypto-tuber-ranked
grep -rn 'video-queue' src/scripts/ 2>&1
```

If not, we need to create one. The consumer should:
1. Scan `.tmp/video-queue/` for pending `*-plan.json` items
2. For each item, run the corresponding stage via `runVideoStage()`
3. Progress each job through plan → audio → captions → render → thumbnail → QA → publish
4. Write next-stage queue file on success

**Step 2: Create `src/scripts/video-queue-consumer.ts`**

This script polls the filesystem queue, picks up jobs, advances them stage-by-stage.

**Step 3: Schedule the consumer**

Create a Hermes cron job:
- `every 5m`
- Workdir: `/opt/crypto-tuber-ranked`
- Script or agent task: `node --import tsx src/scripts/video-queue-consumer.ts`
- `no_agent=True` (script-only)
- Deliver: `local`

**Step 4: Verify the consumer picks up the 6 stuck jobs**

```bash
cd /opt/crypto-tuber-ranked
ls .tmp/video-queue/ | wc -l
# Run consumer once manually
node --import tsx src/scripts/video-queue-consumer.ts 2>&1
# Check queue again — fewer items, more artifacts
ls .tmp/video-queue/ | wc -l
ls artifacts/video-jobs/ 2>&1 | head -20
```

Expected: Jobs progress past "plan" stage, artifacts appear in `artifacts/video-jobs/`.

**Step 5: Commit**

```bash
git add src/scripts/video-queue-consumer.ts
git commit -m "feat: video queue consumer script + cron"
```

---

### Task 1.3: Create or repair the video scheduler trigger

**Objective:** Ensure daily video jobs are enqueued automatically.

**Files:**
- Read: `src/video/queues/scheduler.ts` — existing scheduler
- Read: `src/video/cli/video-daily.ts` — existing CLI daily runner

**Step 1: Check if the scheduler is called anywhere**

```bash
cd /opt/crypto-tuber-ranked
grep -rn 'enqueueScheduledVideoJobs' src/ 2>&1
```

**Step 2: Decide trigger mechanism**

Options:
- Call `enqueueScheduledVideoJobs()` from a cron script directly
- Add it to the heartbeat script after the heartbeat succeeds
- Create a dedicated cron job

Best option: Create a `video-scheduler.sh` script that calls `enqueueScheduledVideoJobs()` and schedule it via Hermes cron at `0 8 * * *` (daily at 08:00).

**Step 3: Create and schedule the cron job**

Create `/srv/agents/hermes/scripts/callscore-video-scheduler.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${CALLSCORE_APP_DIR:-/opt/crypto-tuber-ranked}"
cd "$APP_DIR"
node --import tsx -e "import { enqueueScheduledVideoJobs } from './src/video/queues/scheduler.ts'; console.log(JSON.stringify(await enqueueScheduledVideoJobs()));"
```

**Step 4: Verify**

```bash
cd /opt/crypto-tuber-ranked
node --import tsx -e "import { enqueueScheduledVideoJobs } from './src/video/queues/scheduler.ts'; console.log(JSON.stringify(await enqueueScheduledVideoJobs()));"
```

Expected: Daily short job enqueued, queue file appears in `.tmp/video-queue/`.

**Step 5: Commit**

```bash
git add /srv/agents/hermes/scripts/callscore-video-scheduler.sh
git commit -m "feat: daily video scheduler cron"
```

---

### Task 1.4: Run a full end-to-end test

**Objective:** Verify the full pipeline from enqueue → process → render → QA completes.

**Step 1: Force enqueue a test daily short**

```bash
cd /opt/crypto-tuber-ranked
node --import tsx src/video/cli/video-daily.ts --skip-render --no-publish 2>&1
```

If render dependencies are heavy locally, use `--skip-render` for a logic-only test.

**Step 2: Verify all stages ran**

```bash
ls -lt .tmp/video-queue/ | head -5
ls -lt artifacts/video-jobs/ | head -10
```

**Step 3: Check QA report**

```bash
find artifacts/video-jobs/ -name 'qa-report.json' | head -3 | xargs cat
```

**Step 4: Run full system test**

```bash
cd /opt/crypto-tuber-ranked
node --import tsx src/scripts/callscore-full-system-test.ts 2>&1
```

Expected: All behavioral tests pass (or the render-related ones skip gracefully with `--skip-render`).

---

## Phase 2: OpenMontage Integration

### Task 2.1: Clone OpenMontage as a vendor submodule

**Objective:** Make OpenMontage available at a known path without polluting our repo.

**Step 1: Check license compatibility**

OpenMontage is AGPL-3.0. We keep it as a git submodule at `vendor/openmontage/` and call its Python tools via subprocess — we do NOT copy its source code into our MIT-licensed tree.

**Step 2: Add as submodule**

```bash
cd /opt/crypto-tuber-ranked
mkdir -p vendor
git submodule add https://github.com/calesthio/OpenMontage.git vendor/openmontage
```

If the user prefers not to use submodules, a shallow clone at `/opt/openmontage/` works too:
```bash
cd /opt
git clone --depth 1 https://github.com/calesthio/OpenMontage.git openmontage
```

**Step 3: Verify structure**

```bash
ls /opt/openmontage/tools/ 2>&1 | head -5
ls /opt/openmontage/remotion-composer/src/components/ 2>&1 | head -10
```

Expected: Tool directories and Remotion components visible.

---

### Task 2.2: Import theme system

**Objective:** Borrow OpenMontage's theme system so our videos can use multiple visual styles.

**Files:**
- Read: `/opt/openmontage/remotion-composer/src/Root.tsx` — `ThemeConfig` interface + `THEMES` map
- Create: `src/video/remotion/vendor-theme.ts`
- Modify: `src/video/schemas/video.schemas.ts` — add `theme` field

**Step 1: Create the theme port**

Copy the `ThemeConfig` interface and all 4 theme presets (clean-professional, flat-motion-graphics, minimalist-diagram, anime-ghibli) into `src/video/remotion/vendor-theme.ts`. Credit OpenMontage in the header comment.

```typescript
// Theme system ported from OpenMontage (AGPL-3.0)
// Source: https://github.com/calesthio/OpenMontage
// Used under AGPL-3.0 — vendored at vendor/openmontage/
export interface ThemeConfig { ... }
export const THEMES: Record<string, ThemeConfig> = { ... }
```

**Step 2: Add `theme` to video schemas**

In `src/video/schemas/video.schemas.ts`, add:
```typescript
export const ThemeNameSchema = z.enum([
  "clean-professional",
  "flat-motion-graphics",
  "minimalist-diagram",
  "anime-ghibli",
]);
```

Add `theme: ThemeNameSchema.optional().default("flat-motion-graphics")` to relevant config schemas.

**Step 3: Wire theme into Remotion composition props**

In `src/video/remotion/render-video.ts`, pass `theme` and `themeConfig` from the job config into the Remotion composition's `inputProps`.

**Step 4: Verify**

```bash
cd /opt/crypto-tuber-ranked
npm run typecheck 2>&1 || npx tsc --noEmit src/video/remotion/vendor-theme.ts 2>&1
```

Expected: No type errors.

**Step 5: Commit**

```bash
git add src/video/remotion/vendor-theme.ts src/video/schemas/video.schemas.ts
git commit -m "feat: port OpenMontage theme system for multi-style videos"
```

---

### Task 2.3: Import key Remotion components

**Objective:** Borrow OpenMontage's richest Remotion components for our scenes.

**Components to import (from `/opt/openmontage/remotion-composer/src/components/`):**

| Component | Our scene type |
|-----------|---------------|
| `HeroTitle` | Hook / opening |
| `StatReveal` | Score reveal |
| `StatCard` | Creator stats |
| `ComparisonCard` | Leaderboard |
| `EndTag` | CTA |
| `ParticleOverlay` | Background effects |
| `ProgressBar` | Call timeline |

**Step 1: Copy components**

```bash
mkdir -p src/video/remotion/openmontage-components
cp /opt/openmontage/remotion-composer/src/components/HeroTitle.tsx src/video/remotion/openmontage-components/
cp /opt/openmontage/remotion-composer/src/components/StatReveal.tsx src/video/remotion/openmontage-components/
# ... etc for each component
```

Add a license header to each:
```typescript
// Ported from OpenMontage (AGPL-3.0) — vendor/openmontage/
```

**Step 2: Register as Remotion compositions**

In `src/video/remotion/Root.tsx`, register each new component as a `Composition` so it can be used by name.

**Step 3: Wire scene_plan visual types**

In `src/video/schemas/video.schemas.ts`, add more `visualType` enum options mapping to OpenMontage component IDs. Update `src/video/planning/video-planner.graph.ts` to use them when the `theme` calls for it.

**Step 4: Verify**

```bash
cd /opt/crypto-tuber-ranked
npm run typecheck 2>&1 | head -20
```

Expected: Clean compilation.

**Step 5: Commit**

```bash
git add src/video/remotion/openmontage-components/
git commit -m "feat: import OpenMontage Remotion components"
```

---

### Task 2.4: Create B-roll stage for weekly investigation

**Objective:** Add real footage from free archives to the weekly investigation format.

**Files:**
- Create: `src/video/broll/broll-types.ts` — types for clip search results
- Create: `src/video/broll/pexels-search.ts` — Pexels API wrapper (free, no special key needed)
- Create: `src/video/broll/unsplash-search.ts` — Unsplash API wrapper
- Create: `src/video/broll/broll-stage.ts` — the stage runner
- Modify: `src/video/queues/workers/render.worker.ts` — accept B-roll clips
- Modify: `src/video/queues/video-queues.ts` — add `broll` stage to VIDEO_STAGES

**Step 1: Create B-roll types**

```typescript
// src/video/broll/broll-types.ts
export interface BrollClip {
  url: string;
  thumbnailUrl: string;
  provider: "pexels" | "unsplash" | "archive";
  width: number;
  height: number;
  durationSeconds: number;
  license: string;
}
```

**Step 2: Create Pexels search wrapper**

Use the free Pexels API (developer key from pexels.com). Accept a text query related to the video topic, return matching clips.

**Step 3: Add `broll` to pipeline stages**

In `src/video/queues/video-queues.ts`, add `"broll"` to `VIDEO_STAGES` between `"captions"` and `"render"`.

Create `src/video/queues/workers/broll.worker.ts`:
- Takes scene_plan narration text
- For each scene, generates search queries from the narration
- Fetches clips from Pexels/Unsplash
- Saves the B-roll manifest

**Step 4: Wire B-roll into the render worker**

Modify `render.worker.ts` and `render-video.ts` to accept the B-roll manifest and overlay it as background during scenes.

**Step 5: Test on a weekly investigation**

```bash
cd /opt/crypto-tuber-ranked
node --import tsx -e "
import { createAndEnqueueVideoJob } from './src/video/queues/video-queues.ts';
await createAndEnqueueVideoJob({ format: 'weekly_investigation' });
"
```

Then run the consumer to process it.

**Step 6: Commit**

---

### Task 2.5: Verify end-to-end with OpenMontage enhancements

**Step 1: Run full test suite**

```bash
cd /opt/crypto-tuber-ranked
node --import tsx --test tests/action-authority.test.ts tests/decision-gates.test.ts tests/channel-head-scoring.test.ts tests/channel-head-decision.test.ts tests/decision-router.test.ts 2>&1
node --import tsx src/scripts/callscore-full-system-test.ts 2>&1
```

**Step 2: Run a video from end to end**

```bash
cd /opt/crypto-tuber-ranked
node --import tsx src/video/cli/video-daily.ts --skip-render --no-publish 2>&1
```

**Step 3: Verify the video artifacts**

```bash
ls -la artifacts/video-jobs/*/state.json
```

Each state should show progression through all stages.

---

## Summary

| Phase | Tasks | Complexity | Time |
|-------|-------|-----------|------|
| P1: Fix pipelines | 1.1 Fix heartbeat, 1.2 Queue consumer, 1.3 Scheduler cron, 1.4 E2E test | Medium | 2-3 hours |
| P2: OpenMontage | 2.1 Vendor clone, 2.2 Themes, 2.3 Components, 2.4 B-roll, 2.5 E2E | Medium-High | 4-8 hours |

### Hard Gates (non-negotiable checks before proceeding)

1. **Task 1.1 → Task 1.2**: Heartbeat must exit 0, no state transition errors
2. **Task 1.2 → Task 1.3**: At least one stuck job must progress past "plan" stage
3. **Task 1.3 → Task 1.4**: A new daily_short job gets enqueued and processed
4. **Task 1.4 → Phase 2**: Full system test passes 16/16
5. **Task 2.1 → Task 2.2**: OpenMontage tools discoverable at vendor path
6. **Task 2.3 → Task 2.4**: TypeScript compiles with new component imports
7. **Task 2.4 → Task 2.5**: B-roll manifests can be generated from scene narration

### Quick Wins (can be done before Phase 2)
- Adding OpenMontage as a submodule (Task 2.1) is safe and non-invasive — do it in parallel with Phase 1
- The theme system (Task 2.2) is pure TypeScript types + constants — zero runtime risk

### Risks
- **AGPL-3.0** — OpenMontage is AGPL. We vendor it, don't copy source into our tree. Subprocess calls are safe.
- **Python runtime** — OpenMontage tools are Python. Some may need GPU or model downloads. Start with the Remotion components (pure TypeScript) which have zero Python dependency.
- **Video render cost** — Weekly investigations with B-roll will be slower to render. The `broll` stage should have caching (already rendered clips stored locally keyed by URL).
