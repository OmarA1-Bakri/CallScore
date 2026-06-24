import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { StormClaimMapRecord, StormContradictionRecord, StormEvidencePack, StormYoutubeContext } from "./storm-schemas";

function list(items: readonly string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None";
}

export function renderStormReport(input: {
  readonly pack: StormEvidencePack;
  readonly claims: readonly StormClaimMapRecord[];
  readonly contradictions: readonly StormContradictionRecord[];
  readonly youtube: StormYoutubeContext;
}): string {
  const { pack, claims, contradictions, youtube } = input;
  const safe = claims.filter((claim) => claim.public_safe).map((claim) => claim.claim).slice(0, 10);
  return `# STORM Evidence Pack — ${pack.creator_name}

## 1. What changed

${pack.creator_name} has a descriptive creator trajectory state of **${pack.state}** for ${pack.period_start} to ${pack.period_end}. This is not a prediction.

## 2. Evidence supporting the change

${list(pack.movement_drivers)}

${list(pack.supporting_calls.slice(0, 8).map((call) => `Call ${call.call_id}: ${call.symbol} ${call.direction}, score ${call.score}, correct_direction=${call.correct_direction}`))}

## 3. Evidence against / contradictions

${list(contradictions.map((item) => `${item.contradiction} — ${item.explanation}`))}

## 4. Key calls involved

${list(pack.quote_evidence.slice(0, 8).map((quote) => `Call ${quote.call_id}: "${quote.quote.slice(0, 220)}"`))}

## 5. Market/context notes

${list(pack.market_context.map((item) => `${item.label}: ${item.value}`))}

## 6. Confidence and caveats

- State confidence: ${pack.confidence}
- This is descriptive signal only.
- It does not prove future performance.
- It should not be used as financial advice.
${list(pack.warnings)}

## 7. What would change this view

- More score-ready calls in later periods.
- Contradicting calls with strong positive or negative outcomes.
- A change in directional concentration or score dispersion.
- Evidence pack review showing weak quote support.

## 8. Suggested YouTube angle

Hook: ${youtube.hook_options[0] ?? "Creator trajectory changed"}

Evidence bullets:
${list(youtube.evidence_bullets)}

Safe claims:
${list(safe)}

Blocked claims:
${list(youtube.blocked_claims)}
`;
}

export function writeStormArtifacts(input: {
  readonly outDir: string;
  readonly pack: StormEvidencePack;
  readonly claims: readonly StormClaimMapRecord[];
  readonly contradictions: readonly StormContradictionRecord[];
  readonly youtube: StormYoutubeContext;
}): void {
  mkdirSync(input.outDir, { recursive: true });
  writeFileSync(join(input.outDir, "evidence_pack.json"), `${JSON.stringify(input.pack, null, 2)}\n`);
  writeFileSync(join(input.outDir, "claim_map.json"), `${JSON.stringify(input.claims, null, 2)}\n`);
  writeFileSync(join(input.outDir, "contradictions.json"), `${JSON.stringify(input.contradictions, null, 2)}\n`);
  writeFileSync(join(input.outDir, "youtube_context.json"), `${JSON.stringify(input.youtube, null, 2)}\n`);
  writeFileSync(join(input.outDir, "report.md"), renderStormReport(input));
}
