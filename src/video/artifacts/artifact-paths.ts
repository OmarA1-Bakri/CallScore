import path from "node:path";

export interface VideoArtifactPaths {
  readonly artifactDir: string;
  readonly stateJson: string;
  readonly inputDataJson: string;
  readonly candidateRankingJson: string;
  readonly plannerOutputJson: string;
  readonly scenesJson: string;
  readonly scriptMd: string;
  readonly audioRawWav: string;
  readonly audioNormalizedWav: string;
  readonly captionsJson: string;
  readonly captionsSrt: string;
  readonly brollManifestJson: string;
  readonly videoMp4: string;
  readonly thumbnailPng: string;
  readonly thumbnailJpg: string;
  readonly qaReportJson: string;
  readonly publishResultJson: string;
}

export function sanitizeJobId(jobId: string): string {
  return jobId.replace(/[^A-Za-z0-9._-]/g, "-");
}

export function buildVideoArtifactPaths(jobId: string, artifactRoot?: string): VideoArtifactPaths {
  const root = artifactRoot?.trim() || process.env.VIDEO_ARTIFACT_ROOT || ".tmp/video-artifacts";
  const artifactDir = path.join(root, sanitizeJobId(jobId));
  return {
    artifactDir,
    stateJson: path.join(artifactDir, "state.json"),
    inputDataJson: path.join(artifactDir, "input-data.json"),
    candidateRankingJson: path.join(artifactDir, "candidate-ranking.json"),
    plannerOutputJson: path.join(artifactDir, "planner-output.json"),
    scenesJson: path.join(artifactDir, "scenes.json"),
    scriptMd: path.join(artifactDir, "script.md"),
    audioRawWav: path.join(artifactDir, "audio.raw.wav"),
    audioNormalizedWav: path.join(artifactDir, "audio.normalized.wav"),
    captionsJson: path.join(artifactDir, "captions.json"),
    captionsSrt: path.join(artifactDir, "captions.srt"),
    brollManifestJson: path.join(artifactDir, "broll-manifest.json"),
    videoMp4: path.join(artifactDir, "video.mp4"),
    thumbnailPng: path.join(artifactDir, "thumbnail.png"),
    thumbnailJpg: path.join(artifactDir, "thumbnail.jpg"),
    qaReportJson: path.join(artifactDir, "qa-report.json"),
    publishResultJson: path.join(artifactDir, "publish-result.json"),
  };
}
