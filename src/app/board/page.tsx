"use client";

// Board display — runs on the computer driving the interactive panel.
// Shows whatever the paired iPad (same room) writes, live. Read-only.

import { useEffect, useState, type CSSProperties } from "react";
import InkBoard from "@/components/InkBoard";
import { joinInkRoom } from "@/lib/inkSync";
import { getSupabase } from "@/lib/supabase";
import {
  LIVE_FLOW_MODE,
  getStoredTeacherSessionId,
  type LiveClassFlowSnapshot,
} from "@/lib/liveClassFlow";

type BoardSessionRow = {
  id: string;
  status: string;
  broadcast: string | null;
  live_flow: LiveClassFlowSnapshot | null;
};

function formatTime(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function BoardPage() {
  const supabase = getSupabase();
  const [room, setRoom] = useState("main");
  const [scratchOpen, setScratchOpen] = useState(false);
  const [flow, setFlow] = useState<LiveClassFlowSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    try {
      const r = new URLSearchParams(window.location.search).get("room");
      if (r) setRoom(r.trim());
    } catch { /* ignore */ }
  }, []);

  // Mirror the iPad's scratch overlay open/close.
  useEffect(() => {
    const ctrl = joinInkRoom(`${room}__ctrl`, (m) => { if (m.t === "scratch") setScratchOpen(m.open); });
    return () => ctrl.close();
  }, [room]);

  // The projector follows the same authoritative lesson snapshot as student
  // Chromebooks. Prefer this browser's teacher session, then fall back to the
  // newest open Live Class Flow session for a dedicated display computer.
  useEffect(() => {
    if (!supabase) return;
    let stopped = false;

    const readFlow = async () => {
      const storedSessionId = getStoredTeacherSessionId();
      let row: BoardSessionRow | null = null;

      if (storedSessionId) {
        const { data } = await supabase
          .from("sessions")
          .select("id,status,broadcast,live_flow")
          .eq("id", storedSessionId)
          .maybeSingle();
        row = data as BoardSessionRow | null;
      }

      if (!row || row.status !== "open" || row.broadcast !== LIVE_FLOW_MODE) {
        const { data } = await supabase
          .from("sessions")
          .select("id,status,broadcast,live_flow")
          .eq("status", "open")
          .eq("broadcast", LIVE_FLOW_MODE)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        row = data as BoardSessionRow | null;
      }

      if (stopped) return;
      const live = row?.status === "open" && row.broadcast === LIVE_FLOW_MODE;
      setConnected(Boolean(live));
      setFlow(live ? row?.live_flow ?? null : null);
    };

    void readFlow();
    const interval = window.setInterval(readFlow, 1000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [supabase]);

  const state = flow?.state ?? null;
  const timer = flow?.timer ?? null;
  const sequence = flow?.sequence ?? null;
  const accent = state?.color ?? "#14b8a6";
  const progress = timer && timer.totalSeconds > 0
    ? Math.max(0, Math.min(100, (timer.secondsLeft / timer.totalSeconds) * 100))
    : 0;

  return (
    <main className="bdp-page" style={{ "--bdp-accent": accent } as CSSProperties}>
      <style>{`
        .bdp-page { position:fixed; inset:0; display:grid; grid-template-rows:76px minmax(0,1fr) 50px; overflow:hidden; background:#fff; color:#171a22; font-family:var(--bdb-font); }
        .bdp-top { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:24px; padding:10px 22px; border-bottom:1px solid #dfe3ea; background:rgba(255,255,255,0.97); }
        .bdp-state { min-width:0; display:grid; gap:2px; }
        .bdp-kicker { margin:0; color:var(--bdp-accent); font-size:0.72rem; font-weight:950; letter-spacing:0.12em; text-transform:uppercase; }
        .bdp-title { overflow:hidden; margin:0; color:#171a22; font-size:clamp(1.15rem,2.5vw,1.75rem); font-weight:950; line-height:1.05; text-overflow:ellipsis; white-space:nowrap; }
        .bdp-description { overflow:hidden; margin:0; color:#697184; font-size:clamp(0.75rem,1.25vw,0.95rem); font-weight:750; text-overflow:ellipsis; white-space:nowrap; }
        .bdp-time { min-width:112px; color:#171a22; font-size:clamp(2rem,4.4vw,3.25rem); font-weight:950; font-variant-numeric:tabular-nums; letter-spacing:-0.04em; line-height:1; text-align:right; }
        .bdp-stage { position:relative; min-height:0; background:#fff; }
        .bdp-bottom { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:20px; padding:8px 22px; border-top:1px solid #dfe3ea; background:#f8f9fb; }
        .bdp-progress { height:10px; overflow:hidden; border-radius:999px; background:#e5e8ee; }
        .bdp-progress-fill { height:100%; border-radius:inherit; background:var(--bdp-accent); transition:width 1s linear; }
        .bdp-next { color:#697184; font-size:0.78rem; font-weight:850; letter-spacing:0.04em; text-transform:uppercase; white-space:nowrap; }
        .bdp-next strong { color:#303746; }
        .bdp-offline { color:#697184; }
        .bdp-room { position:absolute; top:10px; right:12px; z-index:2; display:inline-flex; align-items:center; gap:8px; padding:6px 12px; border:1px solid color-mix(in srgb, var(--bdp-accent) 40%, transparent); border-radius:999px; background:color-mix(in srgb, var(--bdp-accent) 12%, white); color:color-mix(in srgb, var(--bdp-accent) 72%, #111827); font-size:0.8rem; font-weight:750; pointer-events:none; }
        .bdp-room-dot { width:8px; height:8px; border-radius:50%; background:var(--bdp-accent); }
      `}</style>

      <header className="bdp-top">
        <div className="bdp-state">
          <p className="bdp-kicker">
            {sequence ? `Step ${sequence.current} of ${sequence.total}` : connected ? "Live lesson" : "Projector board"}
          </p>
          <h1 className="bdp-title">{state?.label ?? "Ready for class"}</h1>
          <p className="bdp-description">{state?.description ?? "Your writing will appear here from the paired iPad."}</p>
        </div>
        <div className="bdp-time">{timer ? formatTime(timer.secondsLeft) : "—:—"}</div>
      </header>

      <section className="bdp-stage" aria-label="Live teaching board">
        <InkBoard room={room} interactive={false} />
      {scratchOpen && (
        <div style={{ position: "absolute", inset: 0, zIndex: 3, background: "#ffffff" }}>
          <InkBoard room={`${room}__scratch`} interactive={false} />
        </div>
      )}
        <div className="bdp-room">
          <span className="bdp-room-dot" />
        Board · {room}
        </div>
      </section>

      <footer className="bdp-bottom">
        <div className="bdp-progress" aria-label="Time remaining">
          <div className="bdp-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className={`bdp-next${connected ? "" : " bdp-offline"}`}>
          {sequence?.nextLabel ? <>Next: <strong>{sequence.nextLabel}</strong></> : connected ? "Final lesson step" : "Waiting for Live Class Flow"}
        </div>
      </footer>
    </main>
  );
}
