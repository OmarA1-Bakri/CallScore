import React from "react";

export function BrandFrame({ children, title }: { readonly children: React.ReactNode; readonly title: string }) {
  return (
    <div style={{ flex: 1, background: "linear-gradient(180deg,#050816,#111827)", color: "white", fontFamily: "Inter, Arial, sans-serif", padding: 64, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 28, letterSpacing: 1 }}>
        <strong>CallScore</strong><span style={{ color: "#38bdf8" }}>{title}</span>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>
      <div style={{ fontSize: 30, color: "#d1d5db" }}>Who made the call? What happened? Check the record.</div>
    </div>
  );
}
