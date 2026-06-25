import type { CreatorScore, ScriptPackage } from "../schemas/video.schemas";

export interface ClaimValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly allowedNumericClaims: readonly string[];
}

function numericTokens(value: number | null | undefined): readonly string[] {
  if (value === null || value === undefined || !Number.isFinite(value)) return [];
  const rounded0 = String(Math.round(value));
  const rounded1 = value.toFixed(1).replace(/\.0$/, "");
  const pct0 = `${Math.round(value * 100)}%`;
  const pct1 = `${(value * 100).toFixed(1).replace(/\.0$/, "")}%`;
  return [...new Set([rounded0, rounded1, pct0, pct1])];
}

export function allowedNumericClaimsForCreator(creator: CreatorScore): readonly string[] {
  return [...new Set([
    ...numericTokens(creator.totalCalls),
    ...numericTokens(creator.winRate),
    ...numericTokens(creator.alphaScore),
    ...numericTokens(creator.rank),
    ...numericTokens(creator.scoreDelta),
    ...numericTokens(creator.rankMovement),
    ...numericTokens(creator.recentResolvedCalls),
    ...creator.recentCalls.flatMap((call) => [
      ...numericTokens(call.score),
      ...numericTokens(call.return30d),
      ...numericTokens(call.alpha30d),
    ]),
  ])].filter((value) => value !== "0" && value !== "0%")
}

export function validateScriptClaims(script: ScriptPackage, creators: readonly CreatorScore[]): ClaimValidationResult {
  const allowed = new Set(creators.flatMap(allowedNumericClaimsForCreator));
  const ignored = new Set(["0", "7", "30", "60", "90", "120", "1", "2", "3", "4", "5", "8"]);
  const numeric = script.voiceover.match(/-?\d+(?:\.\d+)?%?/g) ?? [];
  const errors = numeric
    .filter((token) => !ignored.has(token))
    .filter((token) => !allowed.has(token));
  return { ok: errors.length === 0, errors: errors.map((token) => `unsupported_numeric_claim:${token}`), allowedNumericClaims: [...allowed].sort() };
}
