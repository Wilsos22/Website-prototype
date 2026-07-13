"use client";

import { useCallback, useEffect, useState } from "react";
import type { TeacherRemoteAction } from "@/lib/liveClassFlow";

const PRIMARY: { action: TeacherRemoteAction; label: string; tone: string }[] = [
  { action: "previous", label: "Back", tone: "neutral" },
  { action: "toggle-timer", label: "Start / Pause", tone: "timer" },
  { action: "next", label: "Next", tone: "next" },
];

const SECONDARY: { action: TeacherRemoteAction; label: string }[] = [
  { action: "add-30", label: "+30 seconds" },
  { action: "subtract-30", label: "-30 seconds" },
  { action: "reset-timer", label: "Reset timer" },
];

export default function TeacherRemotePage() {
  const [session, setSession] = useState<{ id: string; joinCode: string | null } | null>(null);
  const [status, setStatus] = useState("Finding the open class...");
  const [busy, setBusy] = useState<TeacherRemoteAction | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/control-remote", { cache: "no-store" });
      const data = await response.json() as { session?: { id: string; joinCode: string | null } | null; error?: string };
      if (!response.ok || data.error) {
        setSession(null);
        setStatus(data.error || "Remote is unavailable.");
        return;
      }
      setSession(data.session || null);
      setStatus(data.session ? "Connected to Live Class Flow" : "Open Live Class Flow on the teacher computer.");
    } catch {
      setSession(null);
      setStatus("Could not reach the classroom controller.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(refresh, 2500);
    return () => window.clearInterval(interval);
  }, [refresh]);

  async function send(action: TeacherRemoteAction) {
    if (!session || busy) return;
    setBusy(action);
    try {
      const response = await fetch("/api/control-remote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json() as { error?: string };
      setStatus(response.ok ? `Sent: ${action.replaceAll("-", " ")}` : data.error || "Command failed.");
    } catch {
      setStatus("Command failed. Check the classroom connection.");
    } finally {
      window.setTimeout(() => setBusy(null), 180);
    }
  }

  return (
    <main className="remote-page">
      <style>{`
        .remote-page { min-height:100vh; box-sizing:border-box; background:#0d1017; color:#f8fafc; font-family:Inter,ui-sans-serif,system-ui,sans-serif; padding:clamp(18px,4vw,38px); }
        .remote-shell { width:min(100%,760px); margin:0 auto; display:grid; gap:20px; }
        .remote-head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
        .remote-kicker { margin:0 0 5px; color:#5eead4; font-size:0.72rem; font-weight:900; letter-spacing:0.13em; text-transform:uppercase; }
        .remote-title { margin:0; font-size:clamp(1.6rem,5vw,2.5rem); line-height:1; }
        .remote-code { min-width:94px; border:1px solid #2b364d; border-radius:12px; background:#151b28; padding:10px 14px; text-align:center; }
        .remote-code small { display:block; color:#8390aa; font-size:0.62rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
        .remote-code strong { display:block; color:#5eead4; font-size:1.25rem; letter-spacing:0.1em; }
        .remote-status { margin:0; border-left:4px solid #14b8a6; background:#151b28; border-radius:8px; padding:12px 14px; color:#cbd5e1; font-weight:750; }
        .remote-primary { display:grid; grid-template-columns:1fr 1.35fr 1fr; gap:12px; }
        .remote-btn { min-height:104px; border:1px solid #35415a; border-radius:16px; background:#171d2a; color:#f8fafc; font:inherit; font-size:clamp(1.05rem,3vw,1.45rem); font-weight:900; cursor:pointer; touch-action:manipulation; }
        .remote-btn:active { transform:scale(0.98); }
        .remote-btn:disabled { opacity:0.42; cursor:not-allowed; }
        .remote-btn.timer { border-color:#c89c35; background:#2a2315; color:#fcd67d; }
        .remote-btn.next { border-color:#14b8a6; background:#0d2a27; color:#7ff3df; }
        .remote-secondary { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
        .remote-secondary .remote-btn { min-height:68px; font-size:0.96rem; }
        .remote-links { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .remote-link { display:flex; min-height:58px; align-items:center; justify-content:center; border:1px solid #35415a; border-radius:12px; background:#151b28; color:#dce6f5; text-decoration:none; font-weight:850; }
        @media (max-width:560px) { .remote-primary { grid-template-columns:1fr 1fr; } .remote-primary .timer { grid-column:1 / -1; grid-row:1; } .remote-secondary { grid-template-columns:1fr; } .remote-links { grid-template-columns:1fr; } }
      `}</style>
      <section className="remote-shell">
        <header className="remote-head">
          <div>
            <p className="remote-kicker">Private teacher controls</p>
            <h1 className="remote-title">Classroom Remote</h1>
          </div>
          {session?.joinCode ? <div className="remote-code"><small>Join code</small><strong>{session.joinCode}</strong></div> : null}
        </header>

        <p className="remote-status" role="status">{status}</p>

        <div className="remote-primary">
          {PRIMARY.map((button) => (
            <button key={button.action} className={`remote-btn ${button.tone}`} disabled={!session || Boolean(busy)} onClick={() => send(button.action)}>{button.label}</button>
          ))}
        </div>

        <div className="remote-secondary">
          {SECONDARY.map((button) => (
            <button key={button.action} className="remote-btn" disabled={!session || Boolean(busy)} onClick={() => send(button.action)}>{button.label}</button>
          ))}
        </div>

        <div className="remote-links">
          <a className="remote-link" href="/teacher/present" target="_blank" rel="noreferrer">Open Classroom Stage</a>
          <a className="remote-link" href={session ? `/ipad?room=${session.id}` : "/ipad"} target="_blank" rel="noreferrer">Open Live Writing Board</a>
        </div>
      </section>
    </main>
  );
}
