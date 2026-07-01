export const CHANNEL_HEAD_ORCHESTRATOR_DEFAULT_MAX_ACTIVE_CHANNELS = 1;
export const CHANNEL_HEAD_ORCHESTRATOR_HARD_MAX_ACTIVE_CHANNELS = 3;

export interface ResolveChannelHeadMaxActiveChannelsInput {
  readonly requestedMaxActiveChannels?: number | null;
}

export interface ResolvedChannelHeadMaxActiveChannels {
  readonly maxActiveChannels: number;
  readonly requestedMaxActiveChannels: number | null;
  readonly hardMaxActiveChannels: number;
  readonly wasClamped: boolean;
  readonly blockers: readonly string[];
}

export interface ChannelHeadBootstrapPlanInput {
  readonly seedAllHeads: boolean;
  readonly channelCount: number;
}

export interface ChannelHeadBootstrapPlanValidation {
  readonly status: "approved" | "blocked";
  readonly blockers: readonly string[];
}

function isPositiveInteger(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function resolveChannelHeadMaxActiveChannels(
  input: ResolveChannelHeadMaxActiveChannelsInput,
): ResolvedChannelHeadMaxActiveChannels {
  const requested = input.requestedMaxActiveChannels ?? null;
  const blockers: string[] = [];

  if (requested === null) {
    return {
      maxActiveChannels: CHANNEL_HEAD_ORCHESTRATOR_DEFAULT_MAX_ACTIVE_CHANNELS,
      requestedMaxActiveChannels: null,
      hardMaxActiveChannels: CHANNEL_HEAD_ORCHESTRATOR_HARD_MAX_ACTIVE_CHANNELS,
      wasClamped: false,
      blockers,
    };
  }

  if (!isPositiveInteger(requested)) {
    return {
      maxActiveChannels: CHANNEL_HEAD_ORCHESTRATOR_DEFAULT_MAX_ACTIVE_CHANNELS,
      requestedMaxActiveChannels: requested,
      hardMaxActiveChannels: CHANNEL_HEAD_ORCHESTRATOR_HARD_MAX_ACTIVE_CHANNELS,
      wasClamped: true,
      blockers: ["requested_max_active_channels_invalid"],
    };
  }

  if (requested > CHANNEL_HEAD_ORCHESTRATOR_HARD_MAX_ACTIVE_CHANNELS) {
    return {
      maxActiveChannels: CHANNEL_HEAD_ORCHESTRATOR_HARD_MAX_ACTIVE_CHANNELS,
      requestedMaxActiveChannels: requested,
      hardMaxActiveChannels: CHANNEL_HEAD_ORCHESTRATOR_HARD_MAX_ACTIVE_CHANNELS,
      wasClamped: true,
      blockers: ["requested_max_active_channels_above_hard_max"],
    };
  }

  return {
    maxActiveChannels: requested,
    requestedMaxActiveChannels: requested,
    hardMaxActiveChannels: CHANNEL_HEAD_ORCHESTRATOR_HARD_MAX_ACTIVE_CHANNELS,
    wasClamped: false,
    blockers,
  };
}

export function validateChannelHeadBootstrapPlan(
  input: ChannelHeadBootstrapPlanInput,
): ChannelHeadBootstrapPlanValidation {
  const blockers: string[] = [];

  if (input.seedAllHeads) {
    blockers.push("auto_seed_all_heads_forbidden");
  }

  if (input.seedAllHeads && input.channelCount > CHANNEL_HEAD_ORCHESTRATOR_HARD_MAX_ACTIVE_CHANNELS) {
    blockers.push("channel_count_exceeds_hard_max_active_lanes");
  }

  if (blockers.length === 0) {
    return { status: "approved", blockers };
  }

  return { status: "blocked", blockers };
}
