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

interface MappingConfig {
  agents: { agent_id: string }[];
}

export interface RegistryConsistency {
  souls_count: number;
  mapping_count: number;
  only_in_souls: string[];
  only_in_mapping: string[];
  consistent: boolean;
}

/**
 * Check consistency between souls YAML and mapping JSON registries.
 * Detects agents defined in one but not the other.
 */
export function checkAgentRegistryConsistency(): RegistryConsistency {
  const soulsIds = loadCanonicalAgentIds();
  const mappingPath = new URL(
    "../../docs/ops/canonical-agent-mapping/callscore_canonical_agent_mapping.source.json",
    import.meta.url
  );
  const mappingRaw = readFileSync(mappingPath, "utf-8");
  const mappingConfig = JSON.parse(mappingRaw) as MappingConfig;
  const mappingIds = (mappingConfig.agents ?? []).map((a) => a.agent_id);

  const soulsSet = new Set(soulsIds);
  const mappingSet = new Set(mappingIds);

  const onlyInSouls = soulsIds.filter((id) => !mappingSet.has(id));
  const onlyInMapping = mappingIds.filter((id) => !soulsSet.has(id));

  return {
    souls_count: soulsIds.length,
    mapping_count: mappingIds.length,
    only_in_souls: onlyInSouls,
    only_in_mapping: onlyInMapping,
    consistent: onlyInSouls.length === 0 && onlyInMapping.length === 0,
  };
}
