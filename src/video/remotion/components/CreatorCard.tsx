import React from "react";
import type { CreatorScore } from "../../schemas/video.schemas";
export function CreatorCard({ creator }: { readonly creator: CreatorScore }) {
  return <div style={{ border: "3px solid #38bdf8", borderRadius: 32, padding: 48, width: "85%" }}>
    <div style={{ fontSize: 72, fontWeight: 900 }}>{creator.name}</div>
    <div style={{ fontSize: 36, color: "#d1d5db", marginTop: 16 }}>{creator.youtubeHandle ?? "Tracked creator"}</div>
    <div style={{ fontSize: 34, marginTop: 32 }}>{creator.totalCalls} tracked calls</div>
  </div>;
}
