import type { ChannelAgentTask } from "../../channel-agent-tasks";
import type { PipelineJob } from "../../pipeline";
import { wrapDirectFunctionNode } from "../operating-node-utils";
import { DEFAULT_MUTATION_FLAGS } from "../operating-node-utils";

export interface WorkerDispatchNodeDeps {
  resetStalePipelineJobs: () => Promise<readonly number[]>;
  claimNextPipelineJob: (input: { workerId: string; types: readonly string[] }) => Promise<PipelineJob | null>;
  executePipelineJobWithKeepalive: (job: PipelineJob) => Promise<Record<string, unknown>>;
  completePipelineJob: (job: PipelineJob, metrics: Record<string, unknown>) => Promise<void>;
  retryOrFailPipelineJob: (job: PipelineJob, error: Error) => Promise<{ retrying: boolean }>;
  claimNextChannelTask: (input: { workerId: string; types: readonly string[] }) => Promise<ChannelAgentTask | null>;
  runChannelTask: (task: ChannelAgentTask) => Promise<{ receipt: string }>;
  failChannelTask: (task: ChannelAgentTask, error: Error) => Promise<void>;
}

export function createWorkerDispatchOnceNode(deps: WorkerDispatchNodeDeps) {
  return wrapDirectFunctionNode({
    nodeId: "worker_dispatch_goal_loop",
    domain: "worker_dispatch",
    run: async ({ state, config }) => {
      const configurable = config?.configurable;
      const cfg = configurable && typeof configurable === "object" && !Array.isArray(configurable)
        ? configurable as Record<string, unknown>
        : {};
      const workerId = cfg.workerId as string | undefined ?? "default-worker";
      const fixture = cfg.workerDispatchFixture as Record<string, unknown> | undefined;
      const calls: string[] = [];

      try {
        const resetIds = await deps.resetStalePipelineJobs();
        calls.push("reset");

        const job = fixture?.pipelineJob
          ? (fixture.pipelineJob as PipelineJob)
          : await deps.claimNextPipelineJob({ workerId, types: ["hermes_smoke_test"] });
        calls.push(`claim:${workerId}:true`);

        if (!job) {
          const task = await deps.claimNextChannelTask({ workerId, types: ["data_pipeline_freshness_sentinel"] });
          if (!task) {
            return { status: "ok", summary: "No work available.", detail: { dispatch_kind: "none" }, mutation_flags: { ...DEFAULT_MUTATION_FLAGS } };
          }
          calls.push(`claim-channel:${workerId}:true`);
          try {
            const runResult = await deps.runChannelTask(task);
            calls.push("run-channel");
            return {
              status: "ok",
              summary: "Channel task executed.",
              detail: { dispatch_kind: "channel_task", channel_task_id: task.id },
              mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
            };
          } catch (err) {
            calls.push(`fail-channel:${task.id}:${err instanceof Error}`);
            await deps.failChannelTask(task, err instanceof Error ? err : new Error(String(err)));
            return {
              status: "failed",
              summary: "Channel task failed.",
              blockers: [err instanceof Error ? err.message : String(err)],
              detail: { dispatch_kind: "channel_task", channel_task_id: task.id },
              mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
            };
          }
        }

        const supportedTypes = ["hermes_smoke_test"];
        if (!supportedTypes.includes(job.type)) {
          const err = new Error(`unsupported job type: ${job.type}`);
          await deps.retryOrFailPipelineJob(job, err);
          calls.push(`fail:${job.id}:true`);
          return {
            status: "failed",
            summary: "Unsupported job type.",
            blockers: [err.message],
            detail: { dispatch_kind: "pipeline_job", job_id: job.id, job_type: job.type },
            mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
          };
        }

        const executeResult = fixture?.executeResult
          ? (fixture.executeResult as Record<string, unknown>)
          : await deps.executePipelineJobWithKeepalive(job);
        calls.push(`execute:${job.id}`);

        await deps.completePipelineJob(job, executeResult);
        calls.push(`complete:${job.id}:${String(executeResult.smoke ?? false)}`);

        return {
          status: "ok",
          summary: "Pipeline job completed.",
          detail: {
            dispatch_kind: "pipeline_job",
            job_id: job.id,
            job_type: job.type,
            pipeline_job_completed: true,
          },
          mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
        };
      } catch (err) {
        return {
          status: "failed",
          summary: "Dispatch error.",
          blockers: [err instanceof Error ? err.message : String(err)],
          detail: { dispatch_kind: "error" },
          mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
        };
      }
    },
  });
}
