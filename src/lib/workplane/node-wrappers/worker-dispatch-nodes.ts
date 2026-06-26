import type { ChannelAgentTask } from "../../channel-agent-tasks";
import type { PipelineJob } from "../../pipeline";
import { wrapDirectFunctionNode } from "../operating-node-utils";
import { DEFAULT_MUTATION_FLAGS } from "../operating-node-utils";

export interface WorkerDispatchNodeDeps {
  supportedPipelineJobTypes?: readonly string[];
  supportedChannelTaskTypes?: readonly string[];
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
      const supportedPipelineJobTypes = deps.supportedPipelineJobTypes ?? ["hermes_smoke_test"];
      const supportedChannelTaskTypes = deps.supportedChannelTaskTypes ?? ["data_pipeline_freshness_sentinel"];

      if (state.config.dryRun) {
        return {
          status: "blocked",
          summary: "Worker dispatch dry-run skipped all mutating dependencies.",
          blockers: ["worker_dispatch_dry_run_no_mutation"],
          detail: {
            dispatch_kind: "dry_run",
            worker_id: workerId,
            supported_pipeline_job_types: supportedPipelineJobTypes,
            supported_channel_task_types: supportedChannelTaskTypes,
            mutating_dependency_calls_skipped: true,
          },
          mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
        };
      }

      const liveMutationFlags = { ...DEFAULT_MUTATION_FLAGS, db_write_performed: true };

      try {
        const resetIds = await deps.resetStalePipelineJobs();
        const job = fixture?.pipelineJob
          ? (fixture.pipelineJob as PipelineJob)
          : await deps.claimNextPipelineJob({ workerId, types: supportedPipelineJobTypes });

        if (!job) {
          const task = fixture?.channelTask
            ? (fixture.channelTask as ChannelAgentTask)
            : await deps.claimNextChannelTask({ workerId, types: supportedChannelTaskTypes });
          if (!task) {
            return {
              status: "ok",
              summary: "No work available.",
              detail: {
                dispatch_kind: "none",
                stale_pipeline_jobs_reset: resetIds.length,
                supported_pipeline_job_types: supportedPipelineJobTypes,
                supported_channel_task_types: supportedChannelTaskTypes,
              },
              mutation_flags: state.config.dryRun ? { ...DEFAULT_MUTATION_FLAGS } : liveMutationFlags,
            };
          }
          try {
            const runResult = await deps.runChannelTask(task);
            return {
              status: "ok",
              summary: "Channel task executed.",
              detail: {
                dispatch_kind: "channel_task",
                channel_task_id: task.id,
                stale_pipeline_jobs_reset: resetIds.length,
                receipt: runResult.receipt,
              },
              mutation_flags: liveMutationFlags,
            };
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            await deps.failChannelTask(task, error);
            return {
              status: "failed",
              summary: "Channel task failed.",
              blockers: [error.message],
              detail: {
                dispatch_kind: "channel_task",
                channel_task_id: task.id,
                stale_pipeline_jobs_reset: resetIds.length,
              },
              mutation_flags: liveMutationFlags,
            };
          }
        }

        if (!supportedPipelineJobTypes.includes(job.type)) {
          const err = new Error(`unsupported job type: ${job.type}`);
          await deps.retryOrFailPipelineJob(job, err);
          return {
            status: "failed",
            summary: "Unsupported job type.",
            blockers: [err.message],
            detail: {
              dispatch_kind: "pipeline_job",
              job_id: job.id,
              job_type: job.type,
              stale_pipeline_jobs_reset: resetIds.length,
            },
            mutation_flags: liveMutationFlags,
          };
        }

        try {
          const executeResult = fixture?.executeResult
            ? (fixture.executeResult as Record<string, unknown>)
            : await deps.executePipelineJobWithKeepalive(job);
          await deps.completePipelineJob(job, executeResult);

          return {
            status: "ok",
            summary: "Pipeline job completed.",
            detail: {
              dispatch_kind: "pipeline_job",
              job_id: job.id,
              job_type: job.type,
              pipeline_job_completed: true,
              stale_pipeline_jobs_reset: resetIds.length,
            },
            mutation_flags: liveMutationFlags,
          };
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          const retryResult = await deps.retryOrFailPipelineJob(job, error);
          return {
            status: "failed",
            summary: "Pipeline job failed.",
            blockers: [error.message],
            detail: {
              dispatch_kind: "pipeline_job",
              job_id: job.id,
              job_type: job.type,
              retrying: retryResult.retrying,
              stale_pipeline_jobs_reset: resetIds.length,
            },
            mutation_flags: liveMutationFlags,
          };
        }
      } catch (err) {
        return {
          status: "failed",
          summary: "Dispatch error.",
          blockers: [err instanceof Error ? err.message : String(err)],
          detail: { dispatch_kind: "error" },
          mutation_flags: state.config.dryRun ? { ...DEFAULT_MUTATION_FLAGS } : liveMutationFlags,
        };
      }
    },
  });
}
