import * as fs from "fs";
import * as path from "path";
import {
  dedupeGlobalCreatorCandidates,
  getCreatorCallSampleStatus,
  getCreatorRankabilityStatus,
  getGlobalCreatorCandidates,
  normalizeCreatorHandle,
  type GlobalCreatorCandidateWithSource,
} from "../lib/global-creator-candidates";
import { TRACKED_CREATORS } from "../lib/tracked-creators";

interface Args {
  readonly status: "approved" | "candidate" | "seeded" | "all";
  readonly minRelevance: number;
  readonly write: boolean;
}

export interface PromotionEvaluation {
  readonly candidate: GlobalCreatorCandidateWithSource;
  readonly eligible: boolean;
  readonly reasons: readonly string[];
}

function parseArgs(argv: readonly string[]): Args {
  const statusArg = valueAfter(argv, "--status") ?? "approved";
  if (!["approved", "candidate", "seeded", "all"].includes(statusArg)) {
    throw new Error("--status must be approved, candidate, seeded, or all");
  }
  const minRelevanceRaw = valueAfter(argv, "--min-relevance") ?? "0.75";
  const minRelevance = Number(minRelevanceRaw);
  if (!Number.isFinite(minRelevance) || minRelevance < 0 || minRelevance > 1) {
    throw new Error("--min-relevance must be a number between 0 and 1");
  }
  return {
    status: statusArg as Args["status"],
    minRelevance,
    write: argv.includes("--write"),
  };
}

function valueAfter(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

function trackedCreatorHandleSet(): Set<string | null> {
  return new Set(TRACKED_CREATORS.map((creator) => normalizeCreatorHandle(creator.youtube_handle)));
}

function matchesStatusFilter(candidate: GlobalCreatorCandidateWithSource, args: Args): boolean {
  return args.status === "all" || candidate.status === args.status;
}

export function evaluatePromotionCandidate(
  candidate: GlobalCreatorCandidateWithSource,
  tracked: ReadonlySet<string | null> = trackedCreatorHandleSet(),
  minRelevance = 0.75,
): PromotionEvaluation {
  const reasons: string[] = [];
  const normalizedHandle = normalizeCreatorHandle(candidate.youtube_handle);
  const sampleStatus = getCreatorCallSampleStatus(candidate);
  const rankabilityStatus = getCreatorRankabilityStatus(candidate);

  if (candidate.status !== "approved") reasons.push(`status=${candidate.status} (requires approved)`);
  if (candidate.status === "rejected") reasons.push("candidate is rejected");
  if (candidate.content_type !== "creator_calls") {
    reasons.push(`content_type=${candidate.content_type} (requires creator_calls)`);
  }
  if (candidate.rankability_guess !== "high") {
    reasons.push(`rankability_guess=${candidate.rankability_guess} (requires high)`);
  }
  if (rankabilityStatus !== "rankable_caller") {
    reasons.push(`rankability_status=${rankabilityStatus} (requires rankable_caller)`);
  }
  if (sampleStatus !== "passed") {
    reasons.push(`creator_call_sample_status=${sampleStatus} (requires passed)`);
  }
  if (!normalizedHandle) reasons.push("youtube_handle missing");
  if (candidate.crypto_relevance_score < minRelevance) {
    reasons.push(`crypto_relevance_score=${candidate.crypto_relevance_score} below ${minRelevance}`);
  }
  if (normalizedHandle && tracked.has(normalizedHandle)) reasons.push("already tracked");

  return {
    candidate,
    eligible: reasons.length === 0,
    reasons,
  };
}

export function evaluatePromotionCandidates(
  candidates: readonly GlobalCreatorCandidateWithSource[],
  args: Args,
): readonly PromotionEvaluation[] {
  const tracked = trackedCreatorHandleSet();
  return dedupeGlobalCreatorCandidates(candidates)
    .filter((candidate) => matchesStatusFilter(candidate, args))
    .map((candidate) => evaluatePromotionCandidate(candidate, tracked, args.minRelevance))
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return b.candidate.crypto_relevance_score - a.candidate.crypto_relevance_score ||
        a.candidate.name.localeCompare(b.candidate.name);
    });
}

function selectPromotionCandidates(
  candidates: readonly GlobalCreatorCandidateWithSource[],
  args: Args,
): readonly GlobalCreatorCandidateWithSource[] {
  return evaluatePromotionCandidates(candidates, args)
    .filter((evaluation) => evaluation.eligible)
    .map((evaluation) => evaluation.candidate);
}

function toTrackedCreatorLine(candidate: GlobalCreatorCandidateWithSource): string {
  const focus = `${candidate.primary_language.toUpperCase()} / ${candidate.region} / ${candidate.content_type.replace(/_/g, " ")}`;
  return `  { name: ${JSON.stringify(candidate.name)}, youtube_handle: ${JSON.stringify(candidate.youtube_handle)}, subscribers: ${JSON.stringify(candidate.subscriber_count ?? "TBD")}, focus: ${JSON.stringify(focus)} },`;
}

function writeTrackedCreators(candidates: readonly GlobalCreatorCandidateWithSource[]): void {
  if (candidates.length === 0) return;
  const filePath = path.resolve(__dirname, "../lib/tracked-creators.ts");
  const current = fs.readFileSync(filePath, "utf-8");
  const marker = "] as const;";
  const markerIndex = current.lastIndexOf(marker);
  if (markerIndex < 0) throw new Error("Could not find TRACKED_CREATORS closing marker");
  const insertion = candidates.map(toTrackedCreatorLine).join("\n") + "\n";
  fs.writeFileSync(filePath, current.slice(0, markerIndex) + insertion + current.slice(markerIndex));
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const evaluations = evaluatePromotionCandidates(getGlobalCreatorCandidates(), args);
  const selected = evaluations.filter((evaluation) => evaluation.eligible).map((evaluation) => evaluation.candidate);

  console.log(`Promotion mode: ${args.write ? "WRITE" : "DRY RUN"}`);
  console.log("Admission gate: approved + creator_calls + high + rankable_caller + passed + handle + not already tracked");
  console.log(`Selected ${selected.length} candidates not already in TRACKED_CREATORS`);
  for (const candidate of selected) {
    console.log(toTrackedCreatorLine(candidate));
  }

  const blocked = evaluations.filter((evaluation) => !evaluation.eligible);
  if (blocked.length > 0) {
    console.log(`Blocked ${blocked.length} candidates:`);
    for (const evaluation of blocked) {
      console.log(`- ${evaluation.candidate.name}: ${evaluation.reasons.join("; ")}`);
    }
  }

  if (args.write) {
    writeTrackedCreators(selected);
    console.log("Updated src/lib/tracked-creators.ts");
  } else {
    console.log("No files changed. Re-run with --write only after creator-call sample audit/sign-off.");
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { parseArgs, selectPromotionCandidates, toTrackedCreatorLine };
