# Canonical Agent Registry — P0 Implementation Plan

> **For Hermes:** Use writing-plans and subagent-driven-development to implement this plan task-by-task.

**Goal:** Make CallScore's 51-agent canonical map a fully executable LangGraph operating runtime by creating a canonical agent registry loader, replacing all hardcoded 21-agent arrays, adding registry diff checks, and enforcing task type coverage.

**Architecture:** A `canonical-agent-registry.ts` module reads the souls YAML + mapping JSON to derive 51 agent IDs. Graph dry-run and system test consume this registry instead of hardcoded arrays. A registry diff check compares YAML vs JSON vs runtime, and a task type coverage check verifies all heartbeat-emitted types are supported or explicitly exempt.

**Tech Stack:** TypeScript, LangGraph StateGraph, Zod, tsx, node:fs, js-yaml

---

### Task 1: Create Canonical Agent Registry Loader

**Objective:** Create `src/lib/canonical-agent-registry.ts` that reads the 51 agent IDs from souls YAML

**Files:**
- Create: `src/lib/canonical-agent-registry.ts`
- Test: `tests/lib/canonical-agent-registry.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadCanonicalAgentIds } from "../../src/lib/canonical-agent-registry";

describe("canonical-agent-registry", () => {
  it("loads 51 canonical agent IDs from souls YAML", () => {
    const agents = loadCanonicalAgentIds();
    assert.ok(Array.isArray(agents), "should return an array");
    assert.equal(agents.length, 51, "should have 51 agents");
    assert.ok(agents.every((a) => typeof a === "string" && a.startsWith("callscore-")), "all should start with callscore-");
    assert.ok(agents.includes("callscore-artofwar-strategist"), "should contain known agent");
  });
});
```

**Step 2: Run test to verify failure**

Run: `node --import tsx --test tests/lib/canonical-agent-registry.test.ts`
Expected: FAIL — "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "js-yaml";

interface SoulsConfig {
  agents: { agent_id: string }[];
}

export function loadCanonicalAgentIds(): string[] {
  const yamlPath = new URL("../../docs/ops/callscore-channel-head-souls.yaml", import.meta.url);
  const raw = readFileSync(yamlPath, "utf-8");
  const config = parseYaml(raw) as SoulsConfig;
  return config.agents.map((a) => a.agent_id);
}
```

**Step 4: Run test to verify pass**

Run: `node --import tsx --test tests/lib/canonical-agent-registry.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/canonical-agent-registry.ts tests/lib/canonical-agent-registry.test.ts
git commit -m "feat: add canonical agent registry loader from 51-agent souls YAML"
```

**Hard gate:** npm run typecheck passes

---

### Task 2: Add Registry Diff Check (Souls vs Mapping vs Runtime)

**Objective:** Add a `checkAgentRegistryConsistency()` function that detects mismatches between souls YAML, mapping JSON, and a runtime set

**Files:**
- Modify: `src/lib/canonical-agent-registry.ts`
- Test: `tests/lib/canonical-agent-registry.test.ts` (extend)

**Step 1: Write failing test**

```typescript
it("detects mismatch between souls and mapping", () => {
  const result = checkAgentRegistryConsistency();
  assert.ok(result.souls_count >= 51, `souls should have >=51 agents, got ${result.souls_count}`);
  assert.ok(result.mapping_count >= 51, `mapping should have >=51 agents, got ${result.mapping_count}`);
  assert.equal(result.only_in_souls.length, 0, `agents in souls not in mapping: ${result.only_in_souls}`);
  assert.equal(result.only_in_mapping.length, 0, `agents in mapping not in souls: ${result.only_in_mapping}`);
});
```

**Step 2: Run — will fail because checkAgentRegistryConsistency doesn't exist**

**Step 3: Write implementation**

```typescript
export interface RegistryConsistency {
  souls_count: number;
  mapping_count: number;
  only_in_souls: string[];
  only_in_mapping: string[];
  consistent: boolean;
}

export function checkAgentRegistryConsistency(): RegistryConsistency {
  const soulsIds = loadCanonicalAgentIds();
  const mappingPath = new URL("../../docs/ops/canonical-agent-mapping/callscore_canonical_agent_mapping.source.json", import.meta.url);
  const mappingRaw = readFileSync(mappingPath, "utf-8");
  const mappingConfig = JSON.parse(mappingRaw);
  const mappingIds = (mappingConfig.agents ?? []).map((a: { agent_id: string }) => a.agent_id);

  const soulsSet = new Set(soulsIds);
  const mappingSet = new Set(mappingIds);

  return {
    souls_count: soulsIds.length,
    mapping_count: mappingIds.length,
    only_in_souls: soulsIds.filter((id) => !mappingSet.has(id)),
    only_in_mapping: mappingIds.filter((id) => !soulsSet.has(id)),
    consistent: soulsIds.length === mappingIds.length && soulsIds.every((id) => mappingSet.has(id)),
  };
}
```

**Step 4: Run to verify pass**

**Step 5: Commit**

---

### Task 3: Replace Hardcoded 21-Agent Array in Graph Dry-Run

**Objective:** Replace `const AGENT_IDS` in `src/scripts/callscore-graph-dry-run.ts` with `loadCanonicalAgentIds()`

**Files:**
- Modify: `src/scripts/callscore-graph-dry-run.ts`

**Step 1: Write failing test** (system test will verify 51 not 21)

**Step 2: Implementation** — remove `const AGENT_IDS` array (lines 67-89), import and use `loadCanonicalAgentIds()`:

```typescript
import { loadCanonicalAgentIds } from "../lib/canonical-agent-registry";

// Then:
const AGENT_IDS = loadCanonicalAgentIds();
```

**Step 3: Verify** — run: `node --import tsx src/scripts/callscore-graph-dry-run.ts`
Expected: Shows "Agents: 51" (not 21)

**Step 4: Commit**

---

### Task 4: Update Full-System Test

**Objective:** Update `src/scripts/callscore-full-system-test.ts` line 556 to reflect 51 agents and use canonical registry

**Files:**
- Modify: `src/scripts/callscore-full-system-test.ts`

**Step 1: Implementation**
- Find the test name "Graph pass path, 21 agents" → change to "Graph pass path, 51 canonical agents"
- Ensure the test logic iterates all 51 agents from the registry, not 21 from hardcoded list

**Step 2: Verify** — run full system test
Expected: 51 agents, all tests pass

**Step 3: Commit**

---

### Task 5: Add Task Type Coverage Check

**Objective:** Ensure all task types emitted by heartbeat are supported by CHANNEL_AGENT_TASK_TYPES or explicitly exempt

**Files:**
- Create: `src/scripts/callscore-task-type-coverage.ts`
- Modify: `src/lib/channel-agent-tasks.ts` (add 4 missing types)

**Step 1: Read current heartbeat defaultTaskType() — 5 types emitted that aren't in CHANNEL_AGENT_TASK_TYPES:**
- `cmo_strategy_review`
- `x_specialist_dispatch`
- `linkedin_specialist_dispatch`
- `reddit_specialist_dispatch`
- `agent_observe` (exempt — correct for non-channel agents like architect)

**Step 2: Add the 4 genuine gaps to CHANNEL_AGENT_TASK_TYPES**
```typescript
// In channel-agent-tasks.ts add:
"cmo_strategy_review",
"x_specialist_dispatch",
"linkedin_specialist_dispatch",
"reddit_specialist_dispatch",
```

**Step 3: Write coverage check script**
```typescript
function checkTaskTypeCoverage(): { known: string[]; missing: string[]; exempt: string[] } {
  const exempt = ["agent_observe"];
  const allEmitted = [...new Set([...collectHeartbeatTaskTypes(), ...collectChannelAgentTaskTypes()])];
  const known = CHANNEL_AGENT_TASK_TYPES;
  return {
    known: allEmitted.filter((t) => known.includes(t)),
    missing: allEmitted.filter((t) => !known.includes(t) && !exempt.includes(t)),
    exempt: allEmitted.filter((t) => exempt.includes(t)),
  };
}
```

**Step 4: Verify** — coverage check shows 0 missing types

**Step 5: Commit**

---

### Task 6: Integration Verification

**Objective:** Run full test suite + dry run + system test end-to-end

**Files:** None — verification only

**Steps:**
1. Run: `node --import tsx --test tests/lib/canonical-agent-registry.test.ts` — PASS
2. Run: `node --import tsx src/scripts/callscore-graph-dry-run.ts` — shows "Agents: 51"
3. Run: `node --import tsx src/scripts/callscore-full-system-test.ts` — 51 agents, all tests pass
4. Run: `node --import tsx src/scripts/callscore-task-type-coverage.ts` — 0 missing types
5. Run: `npm run typecheck` — no type errors

**Commit:** `git commit -m "feat: canonical agent registry with 51-agent runtime, diff check, task type coverage"`
