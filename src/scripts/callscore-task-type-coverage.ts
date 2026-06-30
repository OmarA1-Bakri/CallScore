/**
 * callscore-task-type-coverage.ts — Verify every task type emitted by the
 * heartbeat is either in CHANNEL_AGENT_TASK_TYPES or explicitly exempt.
 *
 * Usage:
 *   npx tsx src/scripts/callscore-task-type-coverage.ts
 */

import { CHANNEL_AGENT_TASK_TYPES } from "../lib/channel-agent-tasks";
import { loadCanonicalAgentIds } from "../lib/canonical-agent-registry";

/**
 * Replicates the heartbeat's defaultTaskType() logic so we can
 * enumerate all task types the heartbeat can emit.
 */
function defaultTaskType(agentId: string): string {
  if (agentId.includes("artofwar")) return "artofwar_campaign_dossier";
  if (agentId.includes("cmo")) return "cmo_strategy_review";
  if (agentId.includes("-x-")) return "x_specialist_dispatch";
  if (agentId.includes("linkedin")) return "linkedin_specialist_dispatch";
  if (agentId.includes("reddit")) return "reddit_specialist_dispatch";
  if (agentId.includes("community")) return "owned_community_draft_and_monitor";
  if (agentId.includes("whop")) return "whop_copy_asset_and_read_only_health";
  if (agentId.includes("email")) return "email_partnership_draft_packet_only";
  if (agentId.includes("opportunity")) return "opportunity_research_brief";
  if (agentId.includes("compliance")) return "compliance_lint_gate";
  if (agentId.includes("data-pipeline")) return "data_pipeline_freshness_sentinel";
  return "agent_observe";
}

/** Task types that are intentionally NOT in CHANNEL_AGENT_TASK_TYPES. */
const EXEMPT_TASK_TYPES = new Set(["agent_observe"]);

interface CoverageResult {
  all_agent_task_types: string[];
  known: string[];
  missing: string[];
  exempt: string[];
  ok: boolean;
}

function checkTaskTypeCoverage(): CoverageResult {
  const agentIds = loadCanonicalAgentIds();
  const emitted = [...new Set(agentIds.map(defaultTaskType))].sort();
  const knownSet = new Set(CHANNEL_AGENT_TASK_TYPES as readonly string[]);

  const known: string[] = [];
  const missing: string[] = [];
  const exempt: string[] = [];

  for (const taskType of emitted) {
    if (knownSet.has(taskType)) {
      known.push(taskType);
    } else if (EXEMPT_TASK_TYPES.has(taskType)) {
      exempt.push(taskType);
    } else {
      missing.push(taskType);
    }
  }

  return {
    all_agent_task_types: emitted,
    known: known.sort(),
    missing: missing.sort(),
    exempt: exempt.sort(),
    ok: missing.length === 0,
  };
}

function main(): void {
  const result = checkTaskTypeCoverage();

  console.log("=== Task Type Coverage Report ===");
  console.log(`All emitted types (${result.all_agent_task_types.length}): ${result.all_agent_task_types.join(", ")}`);
  console.log(`Known (${result.known.length}): ${result.known.join(", ")}`);
  console.log(`Exempt (${result.exempt.length}): ${result.exempt.join(", ")}`);

  if (result.missing.length > 0) {
    console.log(`\n❌ MISSING task types (${result.missing.length}):`);
    for (const type of result.missing) {
      console.log(`  - ${type}`);
    }
    console.log("\nAdd these to CHANNEL_AGENT_TASK_TYPES in src/lib/channel-agent-tasks.ts");
    console.log("  and add workplane job mappings in channelTaskWorkplaneJobType().");
    process.exit(1);
  }

  console.log("\n✅ All task types covered — 0 missing.");
}

main();
