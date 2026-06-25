import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { RunnableConfig } from "@langchain/core/runnables";
import { DEFAULT_OPERATING_MUTATION_FLAGS } from "../operating-graph-schemas";
import { wrapDirectFunctionNode } from "../operating-node-utils";

export const DEFAULT_ART_OF_WAR_RUNTIME_ROOT = "/srv/agents/repos/Claude_Code_Automations/art-of-war";

export interface ArtOfWarCampaignContext {
  readonly runtime_root: string;
  readonly source: "external_art_of_war_runtime";
  readonly kill_switch_engaged: boolean;
  readonly preflight_ok: boolean | null;
  readonly preflight_failures: readonly string[];
  readonly overall_status: string | null;
  readonly mode: string | null;
  readonly active_channels: readonly string[];
  readonly blocked_channels: readonly string[];
  readonly dashboard_generated_at: string | null;
  readonly available_files: readonly string[];
}

export interface ArtOfWarCampaignContextResult {
  readonly available: boolean;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly context: ArtOfWarCampaignContext | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  return asRecord(JSON.parse(raw));
}

function activeChannels(registry: Record<string, unknown>): string[] {
  const channels = asRecord(registry.channels);
  return Object.entries(channels)
    .filter(([, value]) => {
      const record = asRecord(value);
      return record.active === true || record.status === "active_bounded_autonomy";
    })
    .map(([key]) => key)
    .sort();
}

export function readArtOfWarCampaignContext(input: { runtimeRoot?: string } = {}): ArtOfWarCampaignContextResult {
  const runtimeRoot = input.runtimeRoot ?? DEFAULT_ART_OF_WAR_RUNTIME_ROOT;
  if (!existsSync(runtimeRoot) || !statSync(runtimeRoot).isDirectory()) {
    return {
      available: false,
      blockers: ["art_of_war_runtime_not_available"],
      warnings: [],
      context: null,
    };
  }

  const liveRoot = join(runtimeRoot, "live");
  if (!existsSync(liveRoot) || !statSync(liveRoot).isDirectory()) {
    return {
      available: false,
      blockers: ["art_of_war_runtime_not_available"],
      warnings: [],
      context: null,
    };
  }

  const paths = {
    killSwitch: join(liveRoot, "kill-switch.json"),
    preflight: join(liveRoot, "phase-10a-preflight.json"),
    activationRegistry: join(liveRoot, "channel-activation-registry.json"),
    finalStatus: join(liveRoot, "final-autonomy-status.json"),
    dashboard: join(liveRoot, "dashboard", "system-dashboard.json"),
  };
  const killSwitch = readJson(paths.killSwitch);
  const preflight = readJson(paths.preflight);
  const registry = readJson(paths.activationRegistry) ?? {};
  const finalStatus = readJson(paths.finalStatus) ?? {};
  const dashboard = readJson(paths.dashboard) ?? {};
  const dashboardStatus = asRecord(dashboard.status);

  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!killSwitch) blockers.push("art_of_war_kill_switch_missing");
  const killSwitchEngaged = killSwitch?.global_engaged === true;
  if (killSwitchEngaged) blockers.push("art_of_war_kill_switch_engaged");

  const preflightOk = typeof preflight?.ok === "boolean" ? preflight.ok : null;
  const preflightFailures = asStringArray(preflight?.failures);
  if (preflightOk === false) blockers.push("art_of_war_preflight_failed");
  if (preflightOk === null) warnings.push("art_of_war_preflight_missing_or_unknown");

  const context: ArtOfWarCampaignContext = {
    runtime_root: runtimeRoot,
    source: "external_art_of_war_runtime",
    kill_switch_engaged: killSwitchEngaged,
    preflight_ok: preflightOk,
    preflight_failures: preflightFailures,
    overall_status: asString(finalStatus.overall_status) ?? asString(dashboardStatus.overall_status),
    mode: asString(finalStatus.mode) ?? asString(dashboardStatus.mode),
    active_channels: activeChannels(registry),
    blocked_channels: asStringArray(registry.blocked_channels).sort(),
    dashboard_generated_at: asString(dashboard.generated_at),
    available_files: Object.values(paths).filter((path) => existsSync(path)).map((path) => path.replace(`${runtimeRoot}/`, "")).sort(),
  };

  return {
    available: true,
    blockers,
    warnings,
    context,
  };
}

export const artOfWarCampaignContextNode = wrapDirectFunctionNode({
  nodeId: "art_of_war_campaign_context",
  domain: "revenue",
  run: async ({ config }) => {
    const cfg = config?.configurable && typeof config.configurable === "object" && !Array.isArray(config.configurable)
      ? config.configurable as Record<string, unknown>
      : {};
    const runtimeRoot = typeof cfg.artOfWarRuntimeRoot === "string" ? cfg.artOfWarRuntimeRoot : undefined;
    const result = readArtOfWarCampaignContext({ runtimeRoot });
    return {
      status: result.blockers.length > 0 ? "blocked" as const : "ok" as const,
      summary: result.available
        ? "Art of War campaign context loaded from external runtime."
        : "Art of War campaign context unavailable.",
      blockers: [...result.blockers],
      warnings: [...result.warnings],
      detail: {
        art_of_war_context_available: result.available,
        art_of_war_context: result.context,
      },
      mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
    };
  },
});
