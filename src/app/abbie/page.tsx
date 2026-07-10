"use client";

// Proof-of-concept bench: have a real conversation with Abbie and judge it.

import AbbieTalk from "@/components/AbbieTalk";

export default function AbbiePage() {
  return (
    <main
      style={{
        position: "fixed", inset: 0, background: "#0b0d14", color: "#e8ecf5",
        fontFamily: "var(--bdb-font)", display: "flex", flexDirection: "column",
        padding: "clamp(16px,3vw,32px)", boxSizing: "border-box",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#14241f", display: "grid", placeItems: "center", overflow: "hidden" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/big-dog-mark.png" alt="" style={{ width: 38, height: 38, objectFit: "contain" }} />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: "1.1rem" }}>Abbie<sup style={{ color: "#5eead4", fontSize: "0.62em", verticalAlign: "super" }}>3</sup></div>
          <div style={{ fontSize: "0.8rem", color: "#8a93ad" }}>proof of concept — talk to her</div>
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0, width: "min(100%, 760px)", margin: "0 auto", display: "flex", flexDirection: "column" }}>
        <AbbieTalk />
      </div>
    </main>
  );
}
