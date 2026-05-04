import type { Period } from "./types";

export const CREATOR_JUDGMENT_WINDOW_DAYS = 365;
export const CREATOR_JUDGMENT_WINDOW_LABEL = "Last 12 months";
export const CREATOR_JUDGMENT_WINDOW_SHORT_LABEL = "12 months";

export function getJudgmentWindowSql(alias: string): string {
  return `${alias}.call_date >= NOW() - INTERVAL '${CREATOR_JUDGMENT_WINDOW_DAYS} days'`;
}

export function getPeriodFilterSql(alias: string, period: Period): string {
  if (period === "all_time") return `AND ${getJudgmentWindowSql(alias)}`;
  if (period === "90d") return `AND ${alias}.call_date >= NOW() - INTERVAL '90 days'`;
  return `AND ${alias}.call_date >= NOW() - INTERVAL '30 days'`;
}
