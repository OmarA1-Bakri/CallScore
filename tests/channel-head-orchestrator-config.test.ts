import test from "node:test";
import assert from "node:assert/strict";
import {
  CHANNEL_HEAD_ORCHESTRATOR_DEFAULT_MAX_ACTIVE_CHANNELS,
  CHANNEL_HEAD_ORCHESTRATOR_HARD_MAX_ACTIVE_CHANNELS,
  resolveChannelHeadMaxActiveChannels,
  validateChannelHeadBootstrapPlan,
} from "../src/lib/channel-head-orchestrator-config";

test("channel-head orchestrator defaults to one active channel and hard-caps at three", () => {
  assert.equal(CHANNEL_HEAD_ORCHESTRATOR_DEFAULT_MAX_ACTIVE_CHANNELS, 1);
  assert.equal(CHANNEL_HEAD_ORCHESTRATOR_HARD_MAX_ACTIVE_CHANNELS, 3);

  assert.deepEqual(resolveChannelHeadMaxActiveChannels({}), {
    maxActiveChannels: 1,
    requestedMaxActiveChannels: null,
    hardMaxActiveChannels: 3,
    wasClamped: false,
    blockers: [],
  });

  assert.deepEqual(resolveChannelHeadMaxActiveChannels({ requestedMaxActiveChannels: 2 }), {
    maxActiveChannels: 2,
    requestedMaxActiveChannels: 2,
    hardMaxActiveChannels: 3,
    wasClamped: false,
    blockers: [],
  });

  const aboveHardMax = resolveChannelHeadMaxActiveChannels({ requestedMaxActiveChannels: 15 });
  assert.equal(aboveHardMax.maxActiveChannels, 3);
  assert.equal(aboveHardMax.wasClamped, true);
  assert.ok(aboveHardMax.blockers.includes("requested_max_active_channels_above_hard_max"));
});

test("channel-head bootstrap validation blocks all-head autoseeding", () => {
  assert.deepEqual(validateChannelHeadBootstrapPlan({ seedAllHeads: false, channelCount: 15 }), {
    status: "approved",
    blockers: [],
  });

  assert.deepEqual(validateChannelHeadBootstrapPlan({ seedAllHeads: true, channelCount: 15 }), {
    status: "blocked",
    blockers: ["auto_seed_all_heads_forbidden", "channel_count_exceeds_hard_max_active_lanes"],
  });

  assert.deepEqual(validateChannelHeadBootstrapPlan({ seedAllHeads: true, channelCount: 1 }), {
    status: "blocked",
    blockers: ["auto_seed_all_heads_forbidden"],
  });
});
