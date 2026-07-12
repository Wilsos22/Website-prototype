"use client";

// iPad pen surface — write from anywhere in the room; it shows up on /board
// (and can later be pushed to students). Pair by room: /ipad and /board both
// default to room "main", so opening both just works.

import { useEffect, useRef, useState } from "react";
import InkBoard from "@/components/InkBoard";
import { getSupabase } from "@/lib/supabase";
import { joinInkRoom, type InkChannel } from "@/lib/inkSync";
import { BOARD_TEMPLATES } from "@/lib/boardTemplates";
import {
  LIVE_FLOW_MODE,
  getStoredTeacherSessionId,
  type LiveClassFlowSnapshot,
} from "@/lib/liveClassFlow";
import {
  joinLiveFlowTransport,
  newLiveFlowTransportId,
  type LiveFlowTransportChannel,
  type LiveFlowTransportCommand,
} from "@/lib/liveFlowTransport";

type IpadSessionRow = {
  id: string;
  status: string;
  broadcast: string | null;
  live_flow: LiveClassFlowSnapshot | null;
};

function classroomDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${v.year}-${v.month}-${v.day}`;
}

const COLORS = ["#111827", "#f95335", "#4d8df6", "#2f9e6f", "#fcaf38"];
const WIDTHS: { label: string; px: number }[] = [
  { label: "S", px: 3 },
  { label: "M", px: 6 },
  { label: "L", px: 12 },
];

function formatFlowTime(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function IpadPage() {
  const supabase = getSupabase();
  const [room, setRoom] = useState("main");
  const [color, setColor] = useState(COLORS[0]);
  const [erase, setErase] = useState(false);
  const [penWidth, setPenWidth] = useState(6);
  const [background, setBackground] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [showProblem, setShowProblem] = useState(false);
  const [clearSignal, setClearSignal] = useState(0);
  const [exportSignal, setExportSignal] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [scratchOpen, setScratchOpen] = useState(false);
  const [scratchClear, setScratchClear] = useState(0);
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  const [liveFlow, setLiveFlow] = useState<LiveClassFlowSnapshot | null>(null);
  const [controlConnected, setControlConnected] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const ctrlRef = useRef<InkChannel | null>(null);
  const flowTransportRef = useRef<LiveFlowTransportChannel | null>(null);
  const heartbeatIdRef = useRef<string | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const pendingCommandTimersRef = useRef<Map<string, number>>(new Map());

  function flashToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 4500);
  }

  // Export downloads a copy AND publishes the board to today's lesson (for absent
  // students). Publishing needs Supabase + a public "boards" storage bucket.
  async function handleExport(dataUrl: string) {
    const date = classroomDate();
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `big-dog-board-${date}.png`;
    a.click();

    if (!supabase) { flashToast("Exported. (Saving to the lesson works once deployed.)"); return; }
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const path = `${date}/${Date.now()}.png`;
      const { error } = await supabase.storage.from("boards").upload(path, blob, { contentType: "image/png" });
      if (error) flashToast(`Exported — couldn't save to lesson: ${error.message}`);
      else flashToast("Saved to today's lesson ✓");
    } catch {
      flashToast("Exported. (Couldn't reach the lesson to save.)");
    }
  }

  useEffect(() => {
    try {
      const r = new URLSearchParams(window.location.search).get("room");
      if (r) setRoom(r.trim());
    } catch { /* ignore */ }
  }, []);

  // Control channel: open/close the scratch overlay on the board.
  useEffect(() => {
    const ctrl = joinInkRoom(`${room}__ctrl`, (m) => { if (m.t === "scratch") setScratchOpen(m.open); });
    ctrlRef.current = ctrl;
    return () => ctrl.close();
  }, [room]);

  useEffect(() => {
    if (!supabase) return;
    let stopped = false;

    const readSession = async () => {
      const storedSessionId = getStoredTeacherSessionId();
      let row: IpadSessionRow | null = null;
      if (storedSessionId) {
        const { data } = await supabase
          .from("sessions")
          .select("id,status,broadcast,live_flow")
          .eq("id", storedSessionId)
          .maybeSingle();
        row = data as IpadSessionRow | null;
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
        row = data as IpadSessionRow | null;
      }
      if (stopped) return;
      const live = row?.status === "open" && row.broadcast === LIVE_FLOW_MODE;
      setLiveSessionId(live ? row?.id ?? null : null);
      setLiveFlow(live ? row?.live_flow ?? null : null);
    };

    void readSession();
    const interval = window.setInterval(readSession, 1000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [supabase]);

  useEffect(() => {
    if (!liveSessionId) {
      setControlConnected(false);
      return;
    }

    const channel = joinLiveFlowTransport(liveSessionId, (message) => {
      if (message.type !== "ack") return;
      if (heartbeatIdRef.current === message.id) {
        if (heartbeatTimerRef.current !== null) window.clearTimeout(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
        setControlConnected(true);
        return;
      }
      const timer = pendingCommandTimersRef.current.get(message.id);
      if (timer !== undefined) window.clearTimeout(timer);
      pendingCommandTimersRef.current.delete(message.id);
      setControlConnected(true);
    });
    flowTransportRef.current = channel;

    const ping = () => {
      const id = newLiveFlowTransportId();
      heartbeatIdRef.current = id;
      if (heartbeatTimerRef.current !== null) window.clearTimeout(heartbeatTimerRef.current);
      channel.send({ type: "ping", id, sentAt: new Date().toISOString() });
      heartbeatTimerRef.current = window.setTimeout(() => {
        if (heartbeatIdRef.current === id) setControlConnected(false);
      }, 1200);
    };
    ping();
    const heartbeat = window.setInterval(ping, 3000);

    return () => {
      window.clearInterval(heartbeat);
      if (heartbeatTimerRef.current !== null) window.clearTimeout(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
      for (const timer of pendingCommandTimersRef.current.values()) window.clearTimeout(timer);
      pendingCommandTimersRef.current.clear();
      heartbeatIdRef.current = null;
      if (flowTransportRef.current === channel) flowTransportRef.current = null;
      channel.close();
      setControlConnected(false);
    };
  }, [liveSessionId]);

  function sendFlowCommand(command: LiveFlowTransportCommand) {
    const channel = flowTransportRef.current;
    if (!channel || !controlConnected) {
      flashToast("Open the teacher Control screen to use lesson controls.");
      return;
    }
    const id = newLiveFlowTransportId();
    channel.send({ type: "command", id, command, sentAt: new Date().toISOString() });
    const timer = window.setTimeout(() => {
      pendingCommandTimersRef.current.delete(id);
      setControlConnected(false);
      flashToast("The Control screen did not respond. Try again.");
    }, 1600);
    pendingCommandTimersRef.current.set(id, timer);
  }

  function toggleScratch() {
    setScratchOpen((v) => {
      const next = !v;
      ctrlRef.current?.send({ t: "scratch", open: next });
      return next;
    });
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setBackground(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function toggleFullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch { /* ignore */ }
  }

  return (
    <main className="ip-page">
      <style>{`
        .ip-page { position:fixed; inset:0; display:flex; flex-direction:column; background:var(--bdb-ground); font-family:var(--bdb-font); }
        .ip-bar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:10px 14px; background:var(--bdb-card); border-bottom:1px solid var(--bdb-line); }
        .ip-group { display:flex; align-items:center; gap:6px; }
        .ip-room { font-weight:800; color:var(--bdb-ink); font-size:0.92rem; margin-right:2px; }
        .ip-sub { color:var(--bdb-ink-faint); font-size:0.72rem; font-weight:700; }
        .ip-sw { width:30px; height:30px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 0 1px var(--bdb-line); cursor:pointer; padding:0; }
        .ip-sw.on { box-shadow:0 0 0 3px var(--bdb-ink); }
        .ip-btn { min-height:42px; padding:0 14px; border-radius:10px; border:1px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink); font-weight:700; font-size:0.9rem; cursor:pointer; touch-action:manipulation; }
        .ip-btn.on { background:var(--bdb-ink); color:#fff; border-color:var(--bdb-ink); }
        .ip-btn.warn { color:var(--bdb-coral); border-color:color-mix(in srgb, var(--bdb-coral) 40%, var(--bdb-line)); }
        .ip-divider { width:1px; align-self:stretch; background:var(--bdb-line); margin:2px 4px; }
        .ip-flow { display:grid; grid-template-columns:minmax(190px,1fr) auto; gap:12px; align-items:center; padding:8px 14px; border-bottom:1px solid var(--bdb-line); background:#171a22; color:#fff; }
        .ip-flow-state { min-width:0; display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:10px; align-items:center; }
        .ip-flow-dot { width:9px; height:9px; border-radius:50%; background:${controlConnected ? "#2dd4bf" : "#f59e0b"}; }
        .ip-flow-name { overflow:hidden; font-size:0.9rem; font-weight:900; text-overflow:ellipsis; white-space:nowrap; }
        .ip-flow-time { color:#fff; font-size:1.35rem; font-weight:950; font-variant-numeric:tabular-nums; }
        .ip-flow-controls { display:flex; gap:7px; }
        .ip-flow-btn { min-width:72px; min-height:48px; border:1px solid #3a4253; border-radius:10px; background:#242a37; color:#fff; padding:0 12px; font:inherit; font-size:0.84rem; font-weight:900; cursor:pointer; touch-action:manipulation; }
        .ip-flow-btn.primary { border-color:#14b8a6; background:#0f766e; }
        .ip-flow-btn:disabled { opacity:0.34; cursor:not-allowed; }
        .ip-problem { display:flex; gap:10px; align-items:center; padding:8px 14px; background:var(--bdb-card); border-bottom:1px solid var(--bdb-line); }
        .ip-problem-in { flex:1; resize:vertical; min-height:42px; border:1px solid var(--bdb-line); border-radius:10px; padding:10px 12px; font-family:var(--bdb-font); font-size:0.95rem; color:var(--bdb-ink); }
        .ip-templates { display:flex; gap:8px; flex-wrap:wrap; padding:8px 14px; background:var(--bdb-card); border-bottom:1px solid var(--bdb-line); }
        .ip-stage { position:relative; flex:1; }
        .ip-scratch { position:absolute; inset:0; z-index:5; display:flex; flex-direction:column; background:#fff; }
        .ip-scratch-bar { display:flex; align-items:center; gap:8px; padding:8px 14px; background:var(--bdb-card); border-bottom:1px solid var(--bdb-line); }
        .ip-scratch-title { font-weight:800; color:var(--bdb-ink); }
        .ip-scratch-stage { position:relative; flex:1; }
        .ip-spacer { flex:1; }
        @media (max-width:820px) { .ip-flow { grid-template-columns:1fr; } .ip-flow-controls { display:grid; grid-template-columns:repeat(4,1fr); } .ip-flow-btn { min-width:0; } }
      `}</style>

      <div className="ip-bar">
        <span className="ip-room">iPad</span>
        <span className="ip-sub">room {room}</span>
        <span className="ip-divider" />

        <div className="ip-group" role="group" aria-label="Colors">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`ip-sw${!erase && color === c ? " on" : ""}`}
              style={{ background: c }}
              aria-label={`Color ${c}`}
              onClick={() => { setColor(c); setErase(false); }}
            />
          ))}
        </div>
        <span className="ip-divider" />

        <button className={`ip-btn${!erase ? " on" : ""}`} onClick={() => setErase(false)}>Pen</button>
        <button className={`ip-btn${erase ? " on" : ""}`} onClick={() => setErase(true)}>Eraser</button>

        <div className="ip-group" role="group" aria-label="Width">
          {WIDTHS.map((w) => (
            <button key={w.px} className={`ip-btn${penWidth === w.px ? " on" : ""}`} onClick={() => setPenWidth(w.px)}>{w.label}</button>
          ))}
        </div>
        <span className="ip-divider" />

        <button className={`ip-btn${showProblem ? " on" : ""}`} onClick={() => setShowProblem((v) => !v)}>Problem</button>
        <button className={`ip-btn${showTemplates ? " on" : ""}`} onClick={() => setShowTemplates((v) => !v)}>Templates</button>
        <button className="ip-btn" onClick={() => fileRef.current?.click()}>Background</button>
        {background && <button className="ip-btn warn" onClick={() => setBackground(null)}>Remove bg</button>}
        <button className={`ip-btn${scratchOpen ? " on" : ""}`} onClick={toggleScratch}>Scratch</button>
        <button className="ip-btn warn" onClick={() => setClearSignal((n) => n + 1)}>Clear</button>

        <span className="ip-spacer" />
        <button className="ip-btn" onClick={() => setExportSignal((n) => n + 1)}>Export</button>
        <button className="ip-btn" onClick={toggleFullscreen}>Full screen</button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={{ display: "none" }} />
      </div>

      <section className="ip-flow" aria-label="Live lesson controls">
        <div className="ip-flow-state">
          <span className="ip-flow-dot" aria-hidden="true" />
          <span className="ip-flow-name">
            {liveFlow?.state?.label ?? (liveSessionId ? "Waiting for lesson state" : "No Live Class Flow session")}
          </span>
          <span className="ip-flow-time">{liveFlow?.timer ? formatFlowTime(liveFlow.timer.secondsLeft) : "—:—"}</span>
        </div>
        <div className="ip-flow-controls">
          <button className="ip-flow-btn" disabled={!controlConnected || !liveFlow?.state || (liveFlow.sequence?.current ?? 1) <= 1} onClick={() => sendFlowCommand("back")}>◀ Back</button>
          <button className="ip-flow-btn primary" disabled={!controlConnected || !liveFlow?.state} onClick={() => sendFlowCommand("toggle")}>
            {liveFlow?.timer?.running ? "Pause" : "Start"}
          </button>
          <button className="ip-flow-btn" disabled={!controlConnected || !liveFlow?.state} onClick={() => sendFlowCommand("reset")}>Reset</button>
          <button
            className="ip-flow-btn"
            disabled={!controlConnected || !liveFlow?.state || (!liveFlow.poll || liveFlow.poll.stage !== "responding") && !liveFlow.sequence?.nextLabel}
            onClick={() => sendFlowCommand("next")}
          >
            {liveFlow?.poll?.stage === "responding" ? "Results" : "Next ▶"}
          </button>
        </div>
      </section>

      {showProblem && (
        <div className="ip-problem">
          <textarea
            className="ip-problem-in"
            placeholder="One problem per line — they show on the board with space to solve."
            value={problem ?? ""}
            onChange={(e) => setProblem(e.target.value ? e.target.value : null)}
            rows={2}
          />
          <button className="ip-btn warn" onClick={() => setProblem(null)}>Clear problem</button>
        </div>
      )}

      {showTemplates && (
        <div className="ip-templates">
          {BOARD_TEMPLATES.map((t) => (
            <button key={t.id} className="ip-btn" onClick={() => { setBackground(t.build()); setShowTemplates(false); }}>{t.label}</button>
          ))}
        </div>
      )}

      <div className="ip-stage">
        <InkBoard
          room={room}
          interactive
          color={color}
          erase={erase}
          penWidth={penWidth}
          background={background}
          problem={problem}
          clearSignal={clearSignal}
          exportSignal={exportSignal}
          onExport={handleExport}
        />
        {scratchOpen && (
          <div className="ip-scratch">
            <div className="ip-scratch-bar">
              <span className="ip-scratch-title">Scratch</span>
              <span className="ip-spacer" />
              <button className="ip-btn warn" onClick={() => setScratchClear((n) => n + 1)}>Clear</button>
              <button className="ip-btn" onClick={toggleScratch}>Done</button>
            </div>
            <div className="ip-scratch-stage">
              <InkBoard
                room={`${room}__scratch`}
                interactive
                color={color}
                erase={erase}
                penWidth={penWidth}
                clearSignal={scratchClear}
              />
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed", left: "50%", bottom: 18, transform: "translateX(-50%)", zIndex: 50,
            background: "#201e1a", color: "#fff", padding: "11px 18px", borderRadius: 12,
            fontFamily: "var(--bdb-font)", fontWeight: 700, fontSize: "0.92rem",
            boxShadow: "0 12px 30px rgba(0,0,0,0.3)",
          }}
        >
          {toast}
        </div>
      )}
    </main>
  );
}
