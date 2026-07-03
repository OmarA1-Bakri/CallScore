import fs from "node:fs/promises";
import path from "node:path";

import { VideoJobStateSchema, type VideoJobState } from "../schemas/video.schemas";

export interface WriteJsonArtifactOptions {
  readonly force?: boolean;
}

export async function writeJsonArtifact(filePath: string, value: unknown, options: WriteJsonArtifactOptions = {}): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  if (!options.force) {
    try {
      await fs.access(filePath);
      throw new Error(`artifact already exists: ${filePath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

export async function readVideoJobState(filePath: string): Promise<VideoJobState> {
  const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  return VideoJobStateSchema.parse(parsed);
}
