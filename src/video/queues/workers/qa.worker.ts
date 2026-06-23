import { buildVideoArtifactPaths } from "../../artifacts/artifact-paths";
import { readVideoJobState, writeJsonArtifact } from "../../artifacts/state-store";
import { qaVideoJob } from "../../qa/qa-job";
import { VideoJobStateSchema } from "../../schemas/video.schemas";

export async function runQaStage(statePath: string): Promise<string> {
  const state = await readVideoJobState(statePath);
  const paths = buildVideoArtifactPaths(state.jobId, state.artifactDir.split(`/${state.jobId}`)[0]);
  const report = await qaVideoJob(state);
  await writeJsonArtifact(paths.qaReportJson, report as never, { force: true });
  const updated = VideoJobStateSchema.parse({
    ...state,
    status: report.ok ? "qa_passed" : "failed",
    qaReport: report,
    errors: report.ok ? state.errors : [...state.errors, ...report.errors],
    warnings: [...state.warnings, ...report.warnings],
    updatedAt: new Date().toISOString(),
  });
  await writeJsonArtifact(paths.stateJson, updated as never, { force: true });
  return paths.stateJson;
}
