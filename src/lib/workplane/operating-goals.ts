import { z } from "zod";

export const OperatingGoalSchema = z.enum([
  "revenue_now",
  "refresh_data",
  "dispatch_worker_once",
  "produce_video",
  "monitor",
  "trust_review",
  "alerts",
  "evidence_research",
]);

export type OperatingGoal = z.infer<typeof OperatingGoalSchema>;

export const OperatingGoalModeSchema = z.enum([
  "dry_run",
  "draft_only",
  "approved_publish",
  "read_live",
  "bounded_write",
]);

export type OperatingGoalMode = z.infer<typeof OperatingGoalModeSchema>;

export const OperatingDomainSchema = z.enum([
  "revenue",
  "data",
  "worker_dispatch",
  "video",
  "monitoring",
  "trust_review",
  "alerts",
  "evidence_research",
  "gating",
  "control_plane",
]);

export type OperatingDomain = z.infer<typeof OperatingDomainSchema>;

export const OperatingGoalNodeSchema = z.enum([
  "revenue_goal_loop",
  "data_goal_loop",
  "worker_dispatch_goal_loop",
  "video_goal_loop",
  "monitoring_goal_loop",
  "trust_goal_loop",
  "alert_goal_loop",
  "evidence_goal_loop",
]);

export type OperatingGoalNode = z.infer<typeof OperatingGoalNodeSchema>;

export interface NormalizedOperatingGoalConfig {
  readonly goal: OperatingGoal;
  readonly mode: OperatingGoalMode;
  readonly dryRun: boolean;
  readonly approved: boolean;
  readonly approvalReceiptId: string | null;
  readonly approvedByOperator: string | null;
  readonly bounded: boolean;
  readonly maxItems: number;
  readonly campaignId: string | null;
  readonly videoJobId: string | null;
  readonly testFixtures: boolean;
}

export function routeOperatingGoalToDomain(goal: OperatingGoal): OperatingDomain {
  const parsed = OperatingGoalSchema.safeParse(goal);
  if (!parsed.success) throw new Error(`Unsupported operating goal: ${String(goal)}`);

  switch (parsed.data) {
    case "revenue_now": return "revenue";
    case "refresh_data": return "data";
    case "dispatch_worker_once": return "worker_dispatch";
    case "produce_video": return "video";
    case "monitor": return "monitoring";
    case "trust_review": return "trust_review";
    case "alerts": return "alerts";
    case "evidence_research": return "evidence_research";
  }
}

export function routeOperatingGoalToNode(goal: OperatingGoal): OperatingGoalNode {
  const parsed = OperatingGoalSchema.safeParse(goal);
  if (!parsed.success) throw new Error(`Unsupported operating goal: ${String(goal)}`);

  switch (parsed.data) {
    case "revenue_now": return "revenue_goal_loop";
    case "refresh_data": return "data_goal_loop";
    case "dispatch_worker_once": return "worker_dispatch_goal_loop";
    case "produce_video": return "video_goal_loop";
    case "monitor": return "monitoring_goal_loop";
    case "trust_review": return "trust_goal_loop";
    case "alerts": return "alert_goal_loop";
    case "evidence_research": return "evidence_goal_loop";
  }
}

export function normalizeOperatingGoalConfig(input: Partial<NormalizedOperatingGoalConfig> & { goal: OperatingGoal }): NormalizedOperatingGoalConfig {
  const goal = OperatingGoalSchema.parse(input.goal);
  const mode = OperatingGoalModeSchema.parse(input.mode ?? "dry_run");
  const maxItems = Number.isFinite(Number(input.maxItems)) && Number(input.maxItems) > 0
    ? Math.floor(Number(input.maxItems))
    : 1;

  return {
    goal,
    mode,
    dryRun: input.dryRun ?? (mode === "dry_run" || mode === "draft_only"),
    approved: input.approved ?? false,
    approvalReceiptId: input.approvalReceiptId ?? null,
    approvedByOperator: input.approvedByOperator ?? null,
    bounded: input.bounded ?? true,
    maxItems,
    campaignId: input.campaignId ?? null,
    videoJobId: input.videoJobId ?? null,
    testFixtures: input.testFixtures ?? false,
  };
}

export function operatingGoalRequiresApproval(config: NormalizedOperatingGoalConfig): boolean {
  if (config.dryRun) return false;
  return config.mode === "approved_publish" || config.mode === "bounded_write";
}
