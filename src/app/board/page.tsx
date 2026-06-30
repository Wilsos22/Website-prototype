"use client";

// Board display — runs on the computer driving the interactive panel.
// Shows whatever the paired iPad (same room) writes, live. Read-only.

import { useEffect, useState } from "react";
import InkBoard from "@/components/InkBoard";

export default function BoardPage() {
  const [room, setRoom] = useState("main");
  useEffect(() => {
    try {
      const r = new URLSearchParams(window.location.search).get("room");
      if (r) setRoom(r.trim());
    } catch { /* ignore */ }
  }, []);

  return (
    <main style={{ position: "fixed", inset: 0, background: "#ffffff" }}>
      <InkBoard room={room} interactive={false} />
      <div
        style={{
          position: "absolute", top: 10, right: 12, zIndex: 2,
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "6px 12px", borderRadius: 999, background: "rgba(20,184,166,0.12)",
          color: "#0f6e56", fontWeight: 700, fontSize: "0.8rem", fontFamily: "var(--bdb-font)",
          border: "1px solid rgba(20,184,166,0.4)", pointerEvents: "none",
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#14b8a6", display: "inline-block" }} />
        Board · {room}
      </div>
    </main>
  );
}
