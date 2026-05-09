import { query } from "../lib/db";
import { getPublicCounts } from "../lib/public-counts";
import { getLeaderboardEligibilitySql } from "../lib/leaderboard-eligibility";
import { writeJsonFile } from "../lib/shadow-extraction";
import { loadEnv, timestamp } from "./script-helpers";

interface VerifyPublicSurfaceArgs {
  readonly baseUrl: string | null;
  readonly auditOut: string | null;
}

interface VerificationCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || !argv[index + 1]) return null;
  return argv[index + 1];
}

export function parseVerifyPublicSurfaceArgs(argv = process.argv.slice(2)): VerifyPublicSurfaceArgs {
  return {
    baseUrl: argValue(argv, "--base-url"),
    auditOut: argValue(argv, "--audit-out"),
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseVerifyPublicSurfaceArgs(argv);
  const checks: VerificationCheck[] = [];
  const publicCounts = await getPublicCounts();
  const leaderboardEligibleSql = getLeaderboardEligibilitySql("cs");
  const statsRows = await query<{ ranked_creators: string; total_calls: string }>(
    `SELECT COUNT(*) FILTER (WHERE ${leaderboardEligibleSql})::text AS ranked_creators,
            COALESCE(SUM(total_calls) FILTER (WHERE ${leaderboardEligibleSql}), 0)::text AS total_calls
     FROM creator_stats cs
     WHERE cs.period = 'all_time'`,
  );
  const stats = statsRows[0] ?? { ranked_creators: "0", total_calls: "0" };

  checks.push({
    name: "public_counts_match_creator_stats",
    ok: publicCounts.rankedCreators === Number(stats.ranked_creators) && publicCounts.publicScoredCalls === Number(stats.total_calls),
    detail: `counts ranked=${publicCounts.rankedCreators}/${stats.ranked_creators}, scored=${publicCounts.publicScoredCalls}/${stats.total_calls}`,
  });

  if (args.baseUrl) {
    const baseUrl = args.baseUrl.replace(/\/+$/, "");
    try {
      const leaderboard = await fetchJson(`${baseUrl}/api/leaderboard?period=all_time`) as {
        readonly meta?: { readonly total?: number };
        readonly data?: { readonly leaderboard?: readonly unknown[] };
      };
      const apiTotal = leaderboard.meta?.total ?? leaderboard.data?.leaderboard?.length ?? null;
      checks.push({
        name: "api_leaderboard_matches_public_counts",
        ok: apiTotal === publicCounts.rankedCreators,
        detail: `api=${apiTotal}, publicCounts=${publicCounts.rankedCreators}`,
      });
    } catch (error) {
      checks.push({
        name: "api_leaderboard_matches_public_counts",
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const homepage = await fetchText(baseUrl);
      checks.push({
        name: "homepage_contains_public_funnel_counts",
        ok:
          homepage.includes(publicCounts.trackedCalls.toLocaleString()) &&
          homepage.includes(publicCounts.publicScoredCalls.toLocaleString()) &&
          homepage.includes(String(publicCounts.rankedCreators)),
        detail: `looked for raw=${publicCounts.trackedCalls}, public=${publicCounts.publicScoredCalls}, ranked=${publicCounts.rankedCreators}`,
      });
    } catch (error) {
      checks.push({
        name: "homepage_contains_public_funnel_counts",
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    checks.push({
      name: "external_api_ui_fetch",
      ok: true,
      detail: "skipped because --base-url/NEXT_PUBLIC_BASE_URL was not provided",
    });
  }

  const payload = {
    generated_at: timestamp(),
    base_url: args.baseUrl,
    publicCounts,
    checks,
    ok: checks.every((check) => check.ok),
  };

  if (args.auditOut) writeJsonFile(args.auditOut, payload);
  console.log(JSON.stringify(payload, null, 2));
  if (!payload.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
