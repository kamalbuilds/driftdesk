import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "TxLINE World Cup Studio";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #10101b 0%, #0a0a14 60%)",
          color: "#ededed",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "18px",
              background: "#36f2a4",
              color: "#04140d",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "30px",
              fontWeight: 800,
            }}
          >
            TX
          </div>
          <div style={{ fontSize: "28px", color: "#8b93a7", letterSpacing: "0.08em" }}>TXLINE WORLD CUP STUDIO</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ fontSize: "64px", fontWeight: 600, lineHeight: 1.05, maxWidth: "900px" }}>
            Verified World Cup rooms on Solana.
          </div>
          <div style={{ fontSize: "30px", color: "#c6cbd7", maxWidth: "900px" }}>
            Prediction rounds, proof-backed pools, and a score-aware trading agent on one TxLINE data rail.
          </div>
        </div>
        <div style={{ display: "flex", gap: "16px", fontSize: "24px", color: "#36f2a4" }}>
          <span>Rooms</span>
          <span style={{ color: "#3a3a4a" }}>/</span>
          <span>Pools</span>
          <span style={{ color: "#3a3a4a" }}>/</span>
          <span>Sharp</span>
        </div>
      </div>
    ),
    size,
  );
}
