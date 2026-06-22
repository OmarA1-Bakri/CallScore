import React from "react";
export function ScoreDelta({ value }: { readonly value: number }) {
  const sign = value >= 0 ? "+" : "";
  return <div style={{ fontSize: 64, color: value >= 0 ? "#22c55e" : "#f87171", fontWeight: 900 }}>{sign}{value.toFixed(1)}</div>;
}
