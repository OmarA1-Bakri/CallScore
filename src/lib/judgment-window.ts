import type { Period } from "./types";

export const CREATOR_JUDGMENT_WINDOW_DAYS = 365;
export const CREATOR_JUDGMENT_WINDOW_LABEL = "Last 12 months";
export const CREATOR_JUDGMENT_WINDOW_SHORT_LABEL = "12 months";
export const CREATOR_JUDGMENT_WINDOW_DETAIL_LABEL = "Last 12 months · scored after 30d/90d windows";
export const RECENT_PUBLIC_SCORING_MATURITY_NOTE =
  "Recent-month public-scored coverage can be sparse while newer calls finish extraction and 30d/90d scoring windows.";

export function getJudgmentWindowSql(alias: string): string {
  return `${alias}.call_date >= NOW() - INTERVAL '${CREATOR_JUDGMENT_WINDOW_DAYS} days'`;
}

export function getPeriodFilterSql(alias: string, period: Period): string {
  if (period === "all_time") return `AND ${getJudgmentWindowSql(alias)}`;
  if (period === "90d") return `AND ${alias}.call_date >= NOW() - INTERVAL '90 days'`;
  return `AND ${alias}.call_date >= NOW() - INTERVAL '30 days'`;
}
