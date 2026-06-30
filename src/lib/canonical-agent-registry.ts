import { readFileSync } from "node:fs";
import yaml from "js-yaml";

interface SoulsConfig {
  agents: { agent_id: string }[];
}

/**
 * Load all 51 canonical agent IDs from the channel-head-souls YAML file.
 * This is the single source of truth for the agent registry.
 */
export function loadCanonicalAgentIds(): string[] {
  const yamlPath = new URL(
    "../../docs/ops/callscore-channel-head-souls.yaml",
    import.meta.url
  );
  const raw = readFileSync(yamlPath, "utf-8");
  const config = yaml.load(raw) as SoulsConfig;
  return config.agents.map((a) => a.agent_id);
}
