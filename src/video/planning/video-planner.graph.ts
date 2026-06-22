import type { RankedVideoCandidate } from "../data/rank-video-candidates";
import { VideoFormatSchema, type CreatorScore, type ScenePlan, type ScriptPackage, type VideoFormat, type YoutubeMetadata } from "../schemas/video.schemas";
import { countWords, validateScriptText } from "./validate-script";
import { validateScriptClaims } from "./validate-claims";

export interface VideoPlanInput {
  readonly format?: VideoFormat;
  readonly rankedCandidates: readonly RankedVideoCandidate[];
  readonly runDate: string;
}

export interface VideoPlannerOutput {
  readonly format: VideoFormat;
  readonly selectedCreator: CreatorScore;
  readonly scriptPackage: ScriptPackage;
  readonly scenes: readonly ScenePlan[];
  readonly metadata: YoutubeMetadata;
  readonly warnings: readonly string[];
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "not enough public data yet";
  return `${Math.round(value * 100)}%`;
}

function formatAlpha(value: number): string {
  return Math.round(value).toString();
}

function chooseFormat(input: VideoPlanInput, creator: CreatorScore): VideoFormat {
  if (input.format) return VideoFormatSchema.parse(input.format);
  if (creator.recentCalls.length === 0 || creator.totalCalls < 3) return "leaderboard_update";
  return "daily_short";
}

function scriptFor(format: VideoFormat, creator: CreatorScore): ScriptPackage {
  const call = creator.recentCalls[0];
  const hook = format === "leaderboard_update"
    ? "The CallScore leaderboard just moved, and this is the creator to watch."
    : `We tracked ${creator.name}'s crypto calls. Here is what the available record shows.`;
  const callLine = call
    ? `A recent ${call.direction} ${call.symbol} call resolved as ${call.outcome}, with a CallScore record score of ${Math.round(call.score)}.`
    : "The next step is to watch new resolved calls before making a stronger creator breakdown.";
  const voiceover = [
    hook,
    `${creator.name} currently has ${creator.totalCalls} tracked calls in CallScore data.`,
    `The available win rate is ${formatPercent(creator.winRate)}, and the current CallScore alpha score is ${formatAlpha(creator.alphaScore)}.`,
    callLine,
    "This is not financial advice. It is an accountability record built from tracked calls and resolved outcomes.",
    "Check the full record on CallScore before trusting any crypto caller.",
  ].join(" ");
  return {
    format,
    title: `${creator.name} CallScore update`,
    hook,
    voiceover,
    wordCount: countWords(voiceover),
    evidenceRefs: [`creator:${creator.creatorId}`, ...creator.recentCalls.slice(0, 3).map((c) => `call:${c.id}`)],
    disclaimers: ["Not financial advice", "Based on available CallScore data"],
    cta: "Check the full record on CallScore.",
  };
}

function scenesFor(format: VideoFormat, creator: CreatorScore, script: ScriptPackage): readonly ScenePlan[] {
  const call = creator.recentCalls[0];
  const baseDuration = format === "weekly_investigation" ? 45 : format === "leaderboard_update" ? 14 : 10;
  return [
    { sceneId: "hook", order: 0, title: "Hook", narration: script.hook, durationSeconds: baseDuration, visualType: "hook", dataRefs: [`creator:${creator.creatorId}`] },
    { sceneId: "creator", order: 1, title: creator.name, narration: `${creator.name} has ${creator.totalCalls} tracked calls.`, durationSeconds: baseDuration, visualType: "creator_card", dataRefs: [`creator:${creator.creatorId}`] },
    { sceneId: "score", order: 2, title: "Score reveal", narration: `CallScore alpha score: ${formatAlpha(creator.alphaScore)}.`, durationSeconds: baseDuration, visualType: "score_reveal", dataRefs: [`creator:${creator.creatorId}`] },
    { sceneId: "timeline", order: 3, title: "Recent call", narration: call ? `${call.symbol} ${call.direction} resolved as ${call.outcome}.` : "Insufficient recent call detail for a timeline.", durationSeconds: baseDuration, visualType: "call_timeline", dataRefs: call ? [`call:${call.id}`] : [] },
    { sceneId: "cta", order: 4, title: "CTA", narration: script.cta, durationSeconds: 6, visualType: "cta", dataRefs: [] },
  ];
}

export function planVideo(input: VideoPlanInput): VideoPlannerOutput {
  const selected = input.rankedCandidates[0]?.creator;
  if (!selected) throw new Error("No ranked video candidates available");
  const format = chooseFormat(input, selected);
  const scriptPackage = scriptFor(format, selected);
  const scriptValidation = validateScriptText(scriptPackage.voiceover, format === "weekly_investigation" ? { minWords: 120, maxWords: 1_400 } : { minWords: 40, maxWords: 150 });
  if (!scriptValidation.ok) throw new Error(`Script validation failed: ${scriptValidation.errors.join(",")}`);
  const claimValidation = validateScriptClaims(scriptPackage, [selected]);
  if (!claimValidation.ok) throw new Error(`Claim validation failed: ${claimValidation.errors.join(",")}`);
  const scenes = scenesFor(format, selected, scriptPackage);
  const metadata: YoutubeMetadata = {
    title: scriptPackage.title.slice(0, 100),
    description: `${scriptPackage.voiceover}\n\nNot financial advice. See the full record on CallScore.`,
    tags: ["CallScore", "crypto", "creator accountability", selected.name, "crypto calls"].slice(0, 30),
    categoryId: "28",
    madeForKids: false,
    language: "en",
  };
  return { format, selectedCreator: selected, scriptPackage, scenes, metadata, warnings: scriptValidation.warnings };
}
