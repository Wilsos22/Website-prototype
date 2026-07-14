"use client";

// iPad pen surface — write from anywhere in the room; it shows up on /board
// (and can later be pushed to students). Pair by room: /ipad and /board both
// default to room "main", so opening both just works.

import { useCallback, useEffect, useRef, useState } from "react";
import InkBoard from "@/components/InkBoard";
import { joinInkRoom, type InkChannel } from "@/lib/inkSync";
import { BOARD_TEMPLATES } from "@/lib/boardTemplates";
import type { TeacherRemoteAction } from "@/lib/liveClassFlow";

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

export default function IpadPage() {
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
  const fileRef = useRef<HTMLInputElement | null>(null);
  const ctrlRef = useRef<InkChannel | null>(null);
  const explicitRoomRef = useRef(false);
  const [remoteSession, setRemoteSession] = useState<{ id: string; joinCode: string | null } | null>(null);
  const [remoteStatus, setRemoteStatus] = useState("Connecting to Live Class Flow");
  const [remoteBusy, setRemoteBusy] = useState<TeacherRemoteAction | null>(null);

  function flashToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 4500);
  }

  // Export downloads a copy and publishes it through the protected teacher API.
  async function handleExport(dataUrl: string) {
    const date = classroomDate();
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `big-dog-board-${date}.png`;
    a.click();

    try {
      const blob = await (await fetch(dataUrl)).blob();
      const form = new FormData();
      form.set("date", date);
      form.set("file", new File([blob], `big-dog-board-${date}.png`, { type: "image/png" }));
      const response = await fetch("/api/teacher/board", { method: "POST", body: form });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) flashToast(`Exported - couldn't save to lesson: ${result.error || "Upload failed."}`);
      else flashToast("Saved to today's lesson");
    } catch {
      flashToast("Exported. (Couldn't reach the lesson to save.)");
    }
  }

  useEffect(() => {
    try {
      const r = new URLSearchParams(window.location.search).get("room");
      if (r) {
        explicitRoomRef.current = true;
        setRoom(r.trim());
      }
    } catch { /* ignore */ }
  }, []);

  const refreshRemote = useCallback(async () => {
    try {
      const response = await fetch("/api/control-remote", { cache: "no-store" });
      const data = await response.json() as { session?: { id: string; joinCode: string | null } | null; error?: string };
      if (!response.ok || data.error || !data.session) {
        setRemoteSession(null);
        setRemoteStatus(data.error || "Open Live Class Flow on the classroom computer");
        return;
      }
      setRemoteSession(data.session);
      setRemoteStatus(data.session.joinCode ? `Live class ${data.session.joinCode}` : "Live Class Flow connected");
      if (!explicitRoomRef.current) setRoom(data.session.id);
    } catch {
      setRemoteSession(null);
      setRemoteStatus("Classroom controls are unavailable");
    }
  }, []);

  useEffect(() => {
    void refreshRemote();
    const interval = window.setInterval(refreshRemote, 2500);
    return () => window.clearInterval(interval);
  }, [refreshRemote]);

  const sendRemote = useCallback(async (action: TeacherRemoteAction) => {
    if (!remoteSession || remoteBusy) return;
    setRemoteBusy(action);
    try {
      const response = await fetch("/api/control-remote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      setRemoteStatus(response.ok ? "Classroom updated" : data.error || "Command failed");
    } catch {
      setRemoteStatus("Command failed");
    } finally {
      window.setTimeout(() => setRemoteBusy(null), 850);
    }
  }, [remoteBusy, remoteSession]);

  // Control channel: open/close the scratch overlay on the board.
  useEffect(() => {
    const ctrl = joinInkRoom(`${room}__ctrl`, (m) => { if (m.t === "scratch") setScratchOpen(m.open); });
    ctrlRef.current = ctrl;
    return () => ctrl.close();
  }, [room]);

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
        .ip-bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:9px 12px; background:var(--bdb-card); border-bottom:1px solid var(--bdb-line); }
        .ip-group { display:flex; align-items:center; gap:6px; }
        .ip-room { font-weight:800; color:var(--bdb-ink); font-size:0.92rem; margin-right:2px; }
        .ip-sub { color:var(--bdb-ink-faint); font-size:0.72rem; font-weight:700; }
        .ip-sw { width:30px; height:30px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 0 1px var(--bdb-line); cursor:pointer; padding:0; }
        .ip-sw.on { box-shadow:0 0 0 3px var(--bdb-ink); }
        .ip-btn { min-height:42px; padding:0 14px; border-radius:10px; border:1px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink); font-weight:700; font-size:0.9rem; cursor:pointer; touch-action:manipulation; }
        .ip-btn.on { background:var(--bdb-ink); color:#fff; border-color:var(--bdb-ink); }
        .ip-btn.warn { color:var(--bdb-coral); border-color:color-mix(in srgb, var(--bdb-coral) 40%, var(--bdb-line)); }
        .ip-btn.stage { min-width:88px; border-color:#32394a; background:#171d2a; color:#fff; }
        .ip-btn.stage.next { border-color:var(--bdb-teal); background:#0d2a27; color:#9af5e6; }
        .ip-btn.stage.timer { border-color:#c89c35; background:#2a2315; color:#fcd67d; }
        .ip-remote-status { max-width:190px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:${remoteSession ? "var(--bdb-green)" : "var(--bdb-ink-faint)"}; font-size:0.7rem; font-weight:850; }
        .ip-view-link { color:var(--bdb-teal); font-size:0.72rem; font-weight:850; text-decoration:none; }
        .ip-divider { width:1px; align-self:stretch; background:var(--bdb-line); margin:2px 4px; }
        .ip-problem { display:flex; gap:10px; align-items:center; padding:8px 14px; background:var(--bdb-card); border-bottom:1px solid var(--bdb-line); }
        .ip-problem-in { flex:1; resize:vertical; min-height:42px; border:1px solid var(--bdb-line); border-radius:10px; padding:10px 12px; font-family:var(--bdb-font); font-size:0.95rem; color:var(--bdb-ink); }
        .ip-templates { display:flex; gap:8px; flex-wrap:wrap; padding:8px 14px; background:var(--bdb-card); border-bottom:1px solid var(--bdb-line); }
        .ip-stage { position:relative; flex:1; }
        .ip-scratch { position:absolute; inset:0; z-index:5; display:flex; flex-direction:column; background:#fff; }
        .ip-scratch-bar { display:flex; align-items:center; gap:8px; padding:8px 14px; background:var(--bdb-card); border-bottom:1px solid var(--bdb-line); }
        .ip-scratch-title { font-weight:800; color:var(--bdb-ink); }
        .ip-scratch-stage { position:relative; flex:1; }
        .ip-spacer { flex:1; }
      `}</style>

      <div className="ip-bar">
        <span className="ip-room">iPad</span>
        <span className="ip-sub">room {room}</span>
        <span className="ip-remote-status">{remoteStatus}</span>
        <span className="ip-divider" />

        <button className="ip-btn stage" disabled={!remoteSession || Boolean(remoteBusy)} onClick={() => sendRemote("previous")}>Back</button>
        <button className="ip-btn stage" disabled={!remoteSession || Boolean(remoteBusy)} onClick={() => sendRemote("toggle-goals")}>Goal slide</button>
        <button className="ip-btn stage timer" disabled={!remoteSession || Boolean(remoteBusy)} onClick={() => sendRemote("toggle-timer")}>{remoteBusy === "toggle-timer" ? "Sending" : "Start or pause"}</button>
        <button className="ip-btn stage next" disabled={!remoteSession || Boolean(remoteBusy)} onClick={() => sendRemote("next")}>Next</button>
        <button className="ip-btn stage" disabled={!remoteSession || Boolean(remoteBusy)} onClick={() => sendRemote("add-30")}>Add 30 sec</button>
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
        <a className="ip-view-link" href="/teacher/present" target="_blank" rel="noreferrer">Panel 1</a>
        <a className="ip-view-link" href="/teacher/timer" target="_blank" rel="noreferrer">Panel 2</a>
        <button className="ip-btn" onClick={() => setExportSignal((n) => n + 1)}>Export</button>
        <button className="ip-btn" onClick={toggleFullscreen}>Full screen</button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={{ display: "none" }} />
      </div>

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
