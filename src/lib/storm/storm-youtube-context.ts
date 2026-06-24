import { readFileSync } from "node:fs";
import { blockedClaims, safeClaims } from "./storm-claim-map";
import type { StormClaimMapRecord, StormContradictionRecord, StormEvidencePack, StormYoutubeContext } from "./storm-schemas";

export function buildStormYoutubeContext(input: {
  readonly pack: StormEvidencePack;
  readonly claims: readonly StormClaimMapRecord[];
  readonly contradictions: readonly StormContradictionRecord[];
}): StormYoutubeContext {
  const { pack, claims, contradictions } = input;
  const evidenceBullets = pack.supporting_calls.slice(0, 5).map((call) => `${call.symbol} ${call.direction}: score ${call.score}, alpha_30d ${call.alpha_30d ?? "n/a"}`);
  return {
    hook_options: [
      `${pack.creator_name}'s CallScore trajectory just shifted to ${pack.state}`,
      `What changed in ${pack.creator_name}'s latest CallScore evidence?`,
      `The evidence behind ${pack.creator_name}'s ${pack.state.toLowerCase().replace(/_/g, " ")} signal`,
    ],
    creator_state: pack.state,
    movement_drivers: pack.movement_drivers,
    evidence_bullets: evidenceBullets,
    safe_claims: safeClaims(claims).slice(0, 8),
    blocked_claims: blockedClaims(claims),
    thumbnail_angles: [
      `${pack.state.replace(/_/g, " ")}`,
      "Evidence, not hype",
      "Trajectory changed",
    ],
    script_context: `${pack.creator_name} has a descriptive ${pack.state} creator trajectory state for ${pack.period_start} to ${pack.period_end}. Use this as evidence context only; do not imply prediction.`,
    risk_notes: [
      ...pack.warnings,
      ...contradictions.map((item) => item.contradiction),
      "Do not claim future performance or investment advice.",
    ],
  };
}

export interface StormVideoPlanningContext {
  readonly title_angle: string;
  readonly hook: string;
  readonly evidence_bullets: readonly string[];
  readonly risk_notes: readonly string[];
  readonly blocked_claims: readonly string[];
}

export function loadStormVideoContext(path: string): StormVideoPlanningContext {
  const ctx = JSON.parse(readFileSync(path, "utf8")) as StormYoutubeContext;
  return {
    title_angle: ctx.thumbnail_angles[0] ?? "Creator trajectory",
    hook: ctx.hook_options[0] ?? "CallScore evidence update",
    evidence_bullets: ctx.evidence_bullets,
    risk_notes: ctx.risk_notes,
    blocked_claims: ctx.blocked_claims,
  };
}
