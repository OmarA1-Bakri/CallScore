import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "CallScore - Market calls, measured";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "stretch",
          background: "#070708",
          color: "#F5F1E7",
          display: "flex",
          fontFamily: "Arial, sans-serif",
          height: "100%",
          justifyContent: "space-between",
          padding: "72px",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "58%",
          }}
        >
          <div
            style={{
              color: "#C9A24B",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: 6,
              textTransform: "uppercase",
            }}
          >
            CallScore
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                fontSize: 92,
                fontWeight: 700,
                letterSpacing: -4,
                lineHeight: 0.92,
              }}
            >
              Market calls, measured.
            </div>
            <div
              style={{
                color: "#B8B1A2",
                display: "flex",
                fontSize: 30,
                lineHeight: 1.35,
                maxWidth: 620,
              }}
            >
              Crypto creator calls scored against real price data.
            </div>
          </div>
        </div>
        <div
          style={{
            alignSelf: "center",
            border: "1px solid rgba(201, 162, 75, 0.35)",
            display: "flex",
            flexDirection: "column",
            gap: 22,
            height: 390,
            padding: 28,
            width: 380,
          }}
        >
          {[
            ["Creators tracked", "123"],
            ["Scored calls", "46"],
            ["Methodology", "Public"],
            ["Sponsorships", "None"],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                borderBottom: "1px solid rgba(245, 241, 231, 0.12)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                paddingBottom: 18,
              }}
            >
              <div
                style={{
                  color: "#8E8879",
                  fontSize: 18,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                }}
              >
                {label}
              </div>
              <div
                style={{
                  color: value === "Public" || value === "None" ? "#C9A24B" : "#F5F1E7",
                  fontSize: 48,
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
