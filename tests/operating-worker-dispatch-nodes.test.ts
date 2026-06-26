import * as assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildInitialOperatingState, createCallscoreOperatingGraph } from "../src/lib/workplane/callscore-operating-graph";
import { DEFAULT_MUTATION_FLAGS } from "../src/lib/workplane/operating-node-utils";
import {
  createWorkerDispatchOnceNode,
  type WorkerDispatchNodeDeps,
} from "../src/lib/workplane/node-wrappers/worker-dispatch-nodes";
import type { ChannelAgentTask } from "../src/lib/channel-agent-tasks";
import type { PipelineJob } from "../src/lib/pipeline";

const now = "2026-06-25T12:00:00.000Z";

function pipelineJob(overrides: Partial<PipelineJob> = {}): PipelineJob {
  return {
    id: 101,
    run_id: 202,
    type: "hermes_smoke_test",
    status: "running",
    priority: 100,
    payload: { dry_run: true, worker_id: "worker-test" },
    attempts: 1,
    max_attempts: 1,
    locked_by: "worker-test",
    locked_at: now,
    heartbeat_at: now,
    lease_expires_at: null,
    run_after: now,
    idempotency_key: "job-101",
    error: null,
    metrics: {},
    phase: "phase2-pipeline",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function channelTask(overrides: Partial<ChannelAgentTask> = {}): ChannelAgentTask {
  return {
    id: "channel-task-1",
    agent_id: "callscore-x-head",
    channel_id: "x",
    task_type: "data_pipeline_freshness_sentinel",
    status: "running",
    priority: 90,
    run_after: now,
    attempts: 1,
    max_attempts: 2,
    idempotency_key: "channel-task-1",
    payload_hash: null,
    payload: {},
    receipt_uri: null,
    blocker: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function deps(overrides: Partial<WorkerDispatchNodeDeps> = {}): WorkerDispatchNodeDeps {
  return {
    resetStalePipelineJobs: async () => [],
    claimNextPipelineJob: async () => null,
    executePipelineJobWithKeepalive: async () => ({ ok: true }),
    completePipelineJob: async () => undefined,
    retryOrFailPipelineJob: async () => ({ retrying: false }),
    claimNextChannelTask: async () => null,
    runChannelTask: async () => ({ receipt: ".tmp/channel-receipt.json" }),
    failChannelTask: async () => undefined,
    ...overrides,
  };
}

describe("worker dispatch operating node", () => {
  test("dry-run injected worker dispatch never touches mutating dependencies", async () => {
    const calls: string[] = [];
    const node = createWorkerDispatchOnceNode(deps({
      resetStalePipelineJobs: async () => {
        calls.push("reset");
        return [];
      },
      claimNextPipelineJob: async () => {
        calls.push("claim-pipeline");
        return pipelineJob();
      },
      executePipelineJobWithKeepalive: async () => {
        calls.push("execute");
        return { ok: true };
      },
      completePipelineJob: async () => {
        calls.push("complete");
      },
      retryOrFailPipelineJob: async () => {
        calls.push("retry-or-fail");
        return { retrying: false };
      },
      claimNextChannelTask: async () => {
        calls.push("claim-channel");
        return channelTask();
      },
      runChannelTask: async () => {
        calls.push("run-channel");
        return { receipt: ".tmp/should-not-run.json" };
      },
      failChannelTask: async () => {
        calls.push("fail-channel");
      },
    }));

    const patch = await node(
      buildInitialOperatingState({ goal: "dispatch_worker_once", mode: "dry_run", dryRun: true }),
      { configurable: { thread_id: "worker-dispatch-dry-run-zero-deps", workerId: "worker-test" } },
    );

    assert.deepEqual(calls, []);
    const result = patch.node_results?.[0];
    assert.equal(result?.status, "blocked");
    assert.equal(result?.blockers.includes("worker_dispatch_dry_run_no_mutation"), true);
    assert.deepEqual(result?.mutation_flags, DEFAULT_MUTATION_FLAGS);
  });

  test("claims, validates, executes, and completes at most one fixture pipeline job", async () => {
    const calls: string[] = [];
    const job = pipelineJob();
    const node = createWorkerDispatchOnceNode(deps({
      resetStalePipelineJobs: async () => {
        calls.push("reset");
        return [];
      },
      claimNextPipelineJob: async (input) => {
        calls.push(`claim:${input.workerId}:${input.types.includes("hermes_smoke_test")}`);
        return job;
      },
      executePipelineJobWithKeepalive: async (claimed) => {
        calls.push(`execute:${claimed.id}`);
        return { smoke: true };
      },
      completePipelineJob: async (completed, metrics) => {
        calls.push(`complete:${completed.id}:${String(metrics.smoke)}`);
      },
    }));

    const patch = await node(
      buildInitialOperatingState({
        goal: "dispatch_worker_once",
        mode: "bounded_write",
        dryRun: false,
        approved: true,
        approvalReceiptId: "worker-dispatch-execution-test",
        testFixtures: true,
      }),
      { configurable: { thread_id: "worker-dispatch-pipeline", workerId: "worker-test" } },
    );

    assert.deepEqual(calls, ["reset", "claim:worker-test:true", "execute:101", "complete:101:true"]);
    const result = patch.node_results?.[0];
    assert.equal(result?.node_id, "worker_dispatch_goal_loop");
    assert.equal(result?.status, "ok");
    assert.equal(result?.detail.dispatch_kind, "pipeline_job");
    assert.equal(result?.detail.job_id, 101);
    assert.equal(result?.detail.job_type, "hermes_smoke_test");
    assert.equal(result?.mutation_flags.db_write_performed, true);
  });

  test("unsupported pipeline job types fail closed before execution and route to fail wrapper", async () => {
    const calls: string[] = [];
    const node = createWorkerDispatchOnceNode(deps({
      claimNextPipelineJob: async () => pipelineJob({ type: "totally_unknown", payload: {} }),
      executePipelineJobWithKeepalive: async () => {
        calls.push("execute");
        return { ok: true };
      },
      completePipelineJob: async () => {
        calls.push("complete");
      },
      retryOrFailPipelineJob: async (failed, error) => {
        calls.push(`fail:${failed.id}:${error instanceof Error}`);
        return { retrying: false };
      },
    }));

    const patch = await node(
      buildInitialOperatingState({
        goal: "dispatch_worker_once",
        mode: "bounded_write",
        dryRun: false,
        approved: true,
        approvalReceiptId: "worker-dispatch-unsupported-test",
        testFixtures: true,
      }),
      { configurable: { thread_id: "worker-dispatch-unsupported", workerId: "worker-test" } },
    );

    assert.deepEqual(calls, ["fail:101:true"]);
    const result = patch.node_results?.[0];
    assert.equal(result?.status, "failed");
    assert.equal(result?.detail.dispatch_kind, "pipeline_job");
    assert.equal(result?.blockers.some((item) => item.includes("totally_unknown")), true);
  });

  test("pipeline execution failures route to retryOrFailPipelineJob and do not complete", async () => {
    const calls: string[] = [];
    const job = pipelineJob();
    const node = createWorkerDispatchOnceNode(deps({
      claimNextPipelineJob: async () => job,
      executePipelineJobWithKeepalive: async () => {
        calls.push("execute");
        throw new Error("pipeline fixture failed");
      },
      completePipelineJob: async () => {
        calls.push("complete");
      },
      retryOrFailPipelineJob: async (failed, error) => {
        calls.push(`retry-or-fail:${failed.id}:${error.message}`);
        return { retrying: true };
      },
    }));

    const patch = await node(
      buildInitialOperatingState({
        goal: "dispatch_worker_once",
        mode: "bounded_write",
        dryRun: false,
        approved: true,
        approvalReceiptId: "worker-dispatch-failure-test",
        testFixtures: true,
      }),
      { configurable: { thread_id: "worker-dispatch-pipeline-failure", workerId: "worker-test" } },
    );

    assert.deepEqual(calls, ["execute", "retry-or-fail:101:pipeline fixture failed"]);
    const result = patch.node_results?.[0];
    assert.equal(result?.status, "failed");
    assert.equal(result?.detail.dispatch_kind, "pipeline_job");
    assert.equal(result?.detail.job_id, 101);
    assert.equal(result?.blockers.includes("pipeline fixture failed"), true);
  });

  test("top-level dispatch_worker_once graph uses injected worker dispatch deps for a live bounded dispatch", async () => {
    const calls: string[] = [];
    const job = pipelineJob({ type: "candle_refresh" });
    const graph = createCallscoreOperatingGraph({
      workerDispatch: deps({
        supportedPipelineJobTypes: ["candle_refresh"],
        resetStalePipelineJobs: async () => {
          calls.push("reset");
          return [];
        },
        claimNextPipelineJob: async (input) => {
          calls.push(`claim:${input.workerId}:${input.types.join(",")}`);
          return job;
        },
        executePipelineJobWithKeepalive: async (claimed) => {
          calls.push(`execute:${claimed.id}:${claimed.type}`);
          return { refreshed: true };
        },
        completePipelineJob: async (completed, metrics) => {
          calls.push(`complete:${completed.id}:${String(metrics.refreshed)}`);
        },
      }),
    });

    const result = await graph.invoke(
      buildInitialOperatingState({
        goal: "dispatch_worker_once",
        mode: "bounded_write",
        dryRun: false,
        approved: true,
        approvalReceiptId: "approval-worker-dispatch-live-test",
      }),
      {
        configurable: {
          thread_id: "worker-dispatch-live-injected",
          workerId: "worker-live-test",
          workplaneStatus: { status: "OK", automation_readiness: "CONTROLLED_FULL", autonomous_revenue_status: "NO" },
          heartbeat: { heartbeat_id: "worker-dispatch-test", fresh: true, lease_expires_at: "2099-06-25T12:15:00.000Z" },
        },
      },
    );

    assert.deepEqual(calls, ["reset", "claim:worker-live-test:candle_refresh", "execute:101:candle_refresh", "complete:101:true"]);
    const dispatchNode = result.node_results.find((item) => item.node_id === "worker_dispatch_goal_loop");
    assert.equal(dispatchNode?.status, "ok");
    assert.equal(dispatchNode?.detail.dispatch_kind, "pipeline_job");
    assert.equal(dispatchNode?.detail.job_type, "candle_refresh");
    assert.equal(result.mutation_flags.db_write_performed, true);
  });

  test("channel task failures route to failChannelTask and do not report success", async () => {
    const calls: string[] = [];
    const task = channelTask();
    const node = createWorkerDispatchOnceNode(deps({
      claimNextPipelineJob: async () => null,
      claimNextChannelTask: async (input) => {
        calls.push(`claim-channel:${input.workerId}:${input.types.includes("data_pipeline_freshness_sentinel")}`);
        return task;
      },
      runChannelTask: async () => {
        calls.push("run-channel");
        throw new Error("channel fixture failed");
      },
      failChannelTask: async (failed, error) => {
        calls.push(`fail-channel:${failed.id}:${error instanceof Error}`);
      },
    }));

    const patch = await node(
      buildInitialOperatingState({
        goal: "dispatch_worker_once",
        mode: "bounded_write",
        dryRun: false,
        approved: true,
        approvalReceiptId: "worker-dispatch-channel-test",
        testFixtures: true,
      }),
      { configurable: { thread_id: "worker-dispatch-channel", workerId: "worker-test" } },
    );

    assert.deepEqual(calls, ["claim-channel:worker-test:true", "run-channel", "fail-channel:channel-task-1:true"]);
    const result = patch.node_results?.[0];
    assert.equal(result?.status, "failed");
    assert.equal(result?.detail.dispatch_kind, "channel_task");
    assert.equal(result?.detail.channel_task_id, "channel-task-1");
    assert.equal(result?.blockers.includes("channel fixture failed"), true);
  });

  test("top-level dispatch_worker_once graph uses fixture dispatch and collects a separate operating receipt", async () => {
    const graph = createCallscoreOperatingGraph();
    const result = await graph.invoke(
      buildInitialOperatingState({ goal: "dispatch_worker_once", testFixtures: true }),
      {
        configurable: {
          thread_id: "worker-dispatch-graph-fixture",
          workerId: "worker-test",
          workerDispatchFixture: {
            pipelineJob: pipelineJob(),
            executeResult: { smoke: true, fixture: true },
          },
        },
      },
    );

    const dispatchNode = result.node_results.find((item) => item.node_id === "worker_dispatch_goal_loop");
    const receiptNode = result.node_results.find((item) => item.node_id === "collect_receipts");
    assert.equal(dispatchNode?.status, "ok");
    assert.equal(dispatchNode?.detail.dispatch_kind, "pipeline_job");
    assert.equal(dispatchNode?.detail.pipeline_job_completed, true);
    assert.equal(receiptNode?.status, "ok");
    assert.notEqual(receiptNode?.receipt_id, dispatchNode?.receipt_id);
    assert.deepEqual(result.mutation_flags, DEFAULT_MUTATION_FLAGS);
  });
});
