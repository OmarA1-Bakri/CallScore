import type { NormalizedOperatingGoalConfig } from "../operating-goals";

export const DATA_PIPELINE_STAGE_NAMES = [
  "secret-hygiene",
  "low-confidence-validate",
  "transcripts-repair",
  "shadow-extract",
  "shadow-diff",
  "shadow-validate",
  "shadow-promote",
  "extract-all",
  "verify-extractions",
  "match-prices",
  "compute-scores",
  "audit-recompute",
  "consensus-build",
  "evaluation-backfill",
  "promotion-invalidation",
  "promotion-sync",
  "candidate-admission",
  "ml-verifier-batch",
] as const;

export interface BoundedDataPipelineCommandPlan {
  stages: {
    stage: string;
    status: string;
    commands: readonly (readonly string[])[];
  }[];
  mode: string;
  write: boolean;
  executed: boolean;
}

export function buildBoundedDataPipelineCommandPlan(options: {
  config: NormalizedOperatingGoalConfig;
  auditDir: string;
}): BoundedDataPipelineCommandPlan {
  const mode = options.config.dryRun ? "DRY" : "LIVE";
  return {
    stages: DATA_PIPELINE_STAGE_NAMES.map((stage) => ({
      stage,
      status: stage === "evaluation-backfill" || stage === "compute-scores" ? "skipped" : "planned",
      commands: [[stage, "--dry-run"]],
    })),
    mode,
    write: !options.config.dryRun,
    executed: false,
  };
}
