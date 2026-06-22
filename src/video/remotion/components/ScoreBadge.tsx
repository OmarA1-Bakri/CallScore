import React from "react";
export function ScoreBadge({ label, value }: { readonly label: string; readonly value: string | number }) {
  return <div style={{ background: "#0f172a", border: "2px solid #22c55e", borderRadius: 999, padding: "24px 36px", fontSize: 42, fontWeight: 800 }}><span style={{ color: "#94a3b8" }}>{label}: </span>{value}</div>;
}
