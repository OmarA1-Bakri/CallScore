import React from "react";
import type { CallRecord } from "../../schemas/video.schemas";
export function CallTimeline({ calls }: { readonly calls: readonly CallRecord[] }) {
  return <div style={{ width: "90%", display: "flex", flexDirection: "column", gap: 18 }}>{calls.slice(0, 4).map((call) => <div key={call.id} style={{ background: "#172554", padding: 22, borderRadius: 20, fontSize: 30 }}>{call.symbol} {call.direction} → {call.outcome} · score {Math.round(call.score)}</div>)}</div>;
}
