"use client";

// Board display — runs on the computer driving the interactive panel.
// Shows whatever the paired iPad (same room) writes, live. Read-only.
// Follows the iPad's page flips; every page stays mounted (inactive pages
// park at 1x1 canvases) so flipping back is instant and complete.

import { useEffect, useRef, useState } from "react";
import InkBoard from "@/components/InkBoard";
import { joinInkRoom, type InkConnectionStatus } from "@/lib/inkSync";

export default function BoardPage() {
  const [room, setRoom] = useState("main");
  const [scratchOpen, setScratchOpen] = useState(false);
  const [pageView, setPageView] = useState({ index: 0, count: 1 });
  const lastCtrlStatus = useRef<InkConnectionStatus>("connecting");
  useEffect(() => {
    try {
      const r = new URLSearchParams(window.location.search).get("room");
      if (r) setRoom(r.trim());
    } catch { /* ignore */ }
  }, []);

  // Mirror the iPad's scratch overlay and page flips. Ask where things stand
  // on join, and ask again after a connection drop.
  useEffect(() => {
    const ctrl = joinInkRoom(`${room}__ctrl`, (m) => {
      if (m.t === "scratch") setScratchOpen(m.open);
      else if (m.t === "pageflip") {
        const count = Math.max(1, m.count);
        setPageView({ index: Math.min(Math.max(0, m.index), count - 1), count });
      }
    }, (status) => {
      if (status === "connected" && lastCtrlStatus.current === "disconnected") ctrl.send({ t: "hello" });
      lastCtrlStatus.current = status;
    });
    ctrl.send({ t: "hello" });
    return () => ctrl.close();
  }, [room]);

  return (
    <main style={{ position: "fixed", inset: 0, background: "#faf6ee" }}>
      {Array.from({ length: pageView.count }, (_, i) => (
        <InkBoard
          key={i}
          room={i === 0 ? room : `${room}__p${i}`}
          interactive={false}
          hidden={i !== pageView.index}
          paper="dots"
        />
      ))}
      {scratchOpen && (
        <div style={{ position: "absolute", inset: 0, zIndex: 3, background: "#ffffff" }}>
          <InkBoard room={`${room}__scratch`} interactive={false} />
        </div>
      )}
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
        Board · {room}{pageView.count > 1 ? ` · Page ${pageView.index + 1} of ${pageView.count}` : ""}
      </div>
    </main>
  );
}
