import { buildVideoArtifactPaths } from "../../artifacts/artifact-paths";
import { readVideoJobState, writeJsonArtifact } from "../../artifacts/state-store";
import { loadCallScoreVideoCandidates } from "../../data/load-callscore-video-candidates";
import { rankVideoCandidates } from "../../data/rank-video-candidates";
import { mockVideoCandidates } from "../../data/mock-video-candidates";
import { planVideo } from "../../planning/video-planner.graph";
import { VideoJobStateSchema } from "../../schemas/video.schemas";

export async function runPlanStage(statePath: string, options: { readonly mock?: boolean; readonly force?: boolean } = {}): Promise<string> {
  const state = await readVideoJobState(statePath);
  const paths = buildVideoArtifactPaths(state.jobId, state.artifactDir.split(`/${state.jobId}`)[0]);
  const candidates = options.mock ? mockVideoCandidates : await loadCallScoreVideoCandidates({ limit: 12 });
  const ranked = rankVideoCandidates(candidates, new Date(state.runDate));
  const effectiveRanked = ranked.length > 0 ? ranked : rankVideoCandidates(mockVideoCandidates, new Date(state.runDate));
  const plan = planVideo({ format: state.format, rankedCandidates: effectiveRanked, runDate: state.runDate });
  await writeJsonArtifact(paths.inputDataJson, candidates as never, { force: options.force ?? true });
  await writeJsonArtifact(paths.candidateRankingJson, effectiveRanked as never, { force: options.force ?? true });
  await writeJsonArtifact(paths.plannerOutputJson, plan as never, { force: options.force ?? true });
  await writeJsonArtifact(paths.scenesJson, plan.scenes as never, { force: options.force ?? true });
  await import("node:fs/promises").then((fs) => fs.writeFile(paths.scriptMd, plan.scriptPackage.voiceover, "utf8"));
  const updated = VideoJobStateSchema.parse({
    ...state,
    status: "scripted",
    selectedCreator: plan.selectedCreator,
    creators: effectiveRanked.map((item) => item.creator),
    scriptPackage: plan.scriptPackage,
    metadata: plan.metadata,
    warnings: [...state.warnings, ...plan.warnings],
    updatedAt: new Date().toISOString(),
  });
  await writeJsonArtifact(paths.stateJson, updated as never, { force: true });
  return paths.stateJson;
}
