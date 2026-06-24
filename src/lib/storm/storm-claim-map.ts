import type { StormClaimMapRecord, StormEvidencePack } from "./storm-schemas";

function transitionSourceId(pack: StormEvidencePack): string {
  return `${pack.creator_id}:${pack.period_start}`;
}

export function buildStormClaimMap(pack: StormEvidencePack): readonly StormClaimMapRecord[] {
  const claims: StormClaimMapRecord[] = [
    {
      claim: `${pack.creator_name} had a ${pack.state} creator trajectory state for ${pack.period_start} to ${pack.period_end}.`,
      claim_type: "transition",
      evidence_type: "transition_artifact",
      source_table_or_artifact: "transition_state_artifact",
      source_id: transitionSourceId(pack),
      confidence: pack.confidence,
      public_safe: true,
      blocked_reason: null,
    },
    {
      claim: `The state is descriptive and does not prove future performance.`,
      claim_type: "caveat",
      evidence_type: "transition_artifact",
      source_table_or_artifact: "transition_state_artifact",
      source_id: transitionSourceId(pack),
      confidence: 1,
      public_safe: true,
      blocked_reason: null,
    },
    {
      claim: `${pack.creator_name} will outperform next period because of this state.`,
      claim_type: "blocked",
      evidence_type: "none",
      source_table_or_artifact: "none",
      source_id: null,
      confidence: 0,
      public_safe: false,
      blocked_reason: "predictive_claim_not_supported_by_v1_transition_evidence",
    },
  ];

  for (const [index, driver] of pack.movement_drivers.entries()) {
    claims.push({
      claim: `Movement driver: ${driver}`,
      claim_type: "driver",
      evidence_type: "transition_artifact",
      source_table_or_artifact: "transition_state_artifact",
      source_id: transitionSourceId(pack),
      confidence: Math.max(0.5, pack.confidence - index * 0.05),
      public_safe: true,
      blocked_reason: null,
    });
  }

  for (const call of pack.supporting_calls.slice(0, 8)) {
    claims.push({
      claim: `Call ${call.call_id} supports the state evidence: ${call.symbol} ${call.direction}, score ${call.score}.`,
      claim_type: "evidence",
      evidence_type: "call",
      source_table_or_artifact: call.source_table,
      source_id: call.call_id,
      confidence: call.extraction_confidence,
      public_safe: call.raw_quote !== null && call.raw_quote.trim().length > 0,
      blocked_reason: call.raw_quote ? null : "missing_raw_quote",
    });
  }

  for (const quote of pack.quote_evidence.slice(0, 8)) {
    claims.push({
      claim: `Quote evidence: "${quote.quote.slice(0, 180)}"`,
      claim_type: "evidence",
      evidence_type: "quote",
      source_table_or_artifact: quote.source_table,
      source_id: quote.call_id,
      confidence: quote.confidence,
      public_safe: true,
      blocked_reason: null,
    });
  }

  return claims;
}

export function blockedClaims(claims: readonly StormClaimMapRecord[]): readonly string[] {
  return claims.filter((claim) => !claim.public_safe).map((claim) => claim.claim);
}

export function safeClaims(claims: readonly StormClaimMapRecord[]): readonly string[] {
  return claims.filter((claim) => claim.public_safe).map((claim) => claim.claim);
}
