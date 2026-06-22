import React from "react";
import type { CreatorScore } from "../../schemas/video.schemas";
export function Leaderboard({ creators }: { readonly creators: readonly CreatorScore[] }) {
  return <div style={{ width: "90%", display: "flex", flexDirection: "column", gap: 18 }}>{creators.slice(0, 5).map((c, i) => <div key={c.creatorId} style={{ display: "flex", justifyContent: "space-between", background: "#111827", padding: 24, borderRadius: 20, fontSize: 34 }}><span>#{c.rank ?? i + 1} {c.name}</span><strong>{Math.round(c.alphaScore)}</strong></div>)}</div>;
}
