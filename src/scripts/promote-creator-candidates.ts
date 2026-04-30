import * as fs from "fs";
import * as path from "path";
import {
  dedupeGlobalCreatorCandidates,
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

function selectPromotionCandidates(
  candidates: readonly GlobalCreatorCandidateWithSource[],
  args: Args,
): readonly GlobalCreatorCandidateWithSource[] {
  const tracked = new Set(TRACKED_CREATORS.map((creator) => normalizeCreatorHandle(creator.youtube_handle)));
  return dedupeGlobalCreatorCandidates(candidates)
    .filter((candidate) => args.status === "all" || candidate.status === args.status)
    .filter((candidate) => candidate.status !== "rejected")
    .filter((candidate) => candidate.crypto_relevance_score >= args.minRelevance)
    .filter((candidate) => Boolean(candidate.youtube_handle))
    .filter((candidate) => !tracked.has(normalizeCreatorHandle(candidate.youtube_handle)))
    .sort((a, b) => b.crypto_relevance_score - a.crypto_relevance_score || a.name.localeCompare(b.name));
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
  const selected = selectPromotionCandidates(getGlobalCreatorCandidates(), args);

  console.log(`Promotion mode: ${args.write ? "WRITE" : "DRY RUN"}`);
  console.log(`Selected ${selected.length} candidates not already in TRACKED_CREATORS`);
  for (const candidate of selected) {
    console.log(toTrackedCreatorLine(candidate));
  }

  if (args.write) {
    writeTrackedCreators(selected);
    console.log("Updated src/lib/tracked-creators.ts");
  } else {
    console.log("No files changed. Re-run with --write only after channel verification/sign-off.");
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { parseArgs, selectPromotionCandidates, toTrackedCreatorLine };
