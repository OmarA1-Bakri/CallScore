import fs from "node:fs/promises";
import path from "node:path";
import type { ScenePlan } from "../schemas/video.schemas";
import type { BrollClip } from "./broll-types";
import { pexelsSearch } from "./pexels-search";
import { unsplashSearch } from "./unsplash-search";

export interface BrollStageInput {
  readonly scenes: readonly ScenePlan[];
  readonly outputDir?: string;
}

export interface SceneBrollMapping {
  readonly sceneId: string;
  readonly clips: readonly BrollClip[];
}

export interface BrollStageOutput {
  readonly manifestPath: string;
  readonly clips: readonly SceneBrollMapping[];
}

export interface BrollManifest {
  readonly createdAt: string;
  readonly clips: readonly SceneBrollMapping[];
}

/**
 * Extract meaningful search keywords from narration text.
 * Strips common stop words and short tokens, returns up to 3 key phrases.
 */
function extractKeywords(narration: string): string[] {
  const stopWords = new Set([
    "a", "an", "the", "is", "are", "was", "were", "be", "been",
    "has", "have", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can", "need",
    "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above",
    "below", "between", "out", "off", "over", "under", "again",
    "further", "then", "once", "here", "there", "when", "where",
    "why", "how", "all", "each", "every", "both", "few", "more",
    "most", "other", "some", "such", "no", "nor", "not", "only",
    "own", "same", "so", "than", "too", "very", "just", "because",
    "but", "and", "or", "if", "while", "that", "this", "these",
    "those", "it", "its", "they", "them", "their", "what", "which",
    "who", "whom", "about", "up", "down",
  ]);

  const words = narration
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  // Deduplicate and pick top meaningful terms (max 3)
  const unique = [...new Set(words)];
  return unique.slice(0, 3);
}

/**
 * Run the B-roll stage: for each scene in the scene plan, generate
 * search queries from narration text, fetch clips from Pexels and
 * Unsplash, and save a manifest JSON.
 */
export async function runBrollStage(
  scenes: readonly ScenePlan[],
  options: { readonly outputDir?: string } = {},
): Promise<BrollStageOutput> {
  const outputDir = options.outputDir ?? process.cwd();
  await fs.mkdir(outputDir, { recursive: true });

  const mappings: SceneBrollMapping[] = [];

  for (const scene of scenes) {
    const keywords = extractKeywords(scene.narration);
    const sceneClips: BrollClip[] = [];

    // Fetch from both providers for each keyword
    for (const keyword of keywords) {
      const [pexelsClips, unsplashClips] = await Promise.all([
        pexelsSearch(keyword, { perPage: 2 }),
        unsplashSearch(keyword, { perPage: 2 }),
      ]);
      sceneClips.push(...pexelsClips, ...unsplashClips);
    }

    mappings.push({
      sceneId: scene.sceneId,
      clips: sceneClips.slice(0, 4), // Cap at 4 clips per scene
    });
  }

  const manifest: BrollManifest = {
    createdAt: new Date().toISOString(),
    clips: mappings,
  };

  const manifestPath = path.join(outputDir, "broll-manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  return { manifestPath, clips: mappings };
}
