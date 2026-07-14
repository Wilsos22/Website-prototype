"use client";

import { useCallback, useEffect, useState } from "react";
import type { TeacherRemoteAction } from "@/lib/liveClassFlow";
import { ABBIE_REMOTE_BUTTONS, SOUND_REMOTE_BUTTONS, type RemoteDeckButton } from "@/lib/remoteDeck";

const STAGE_BUTTONS: readonly RemoteDeckButton[] = [
  { action: "previous", label: "Back", detail: "Previous stage", tone: "neutral" },
  { action: "toggle-goals", label: "Goal slide", detail: "Show or hide the lesson goal", tone: "gold" },
  { action: "toggle-timer", label: "Start or pause", detail: "Control the timer", tone: "timer" },
  { action: "next", label: "Next", detail: "Advance the lesson", tone: "next" },
];

const TIMER_BUTTONS: readonly RemoteDeckButton[] = [
  { action: "add-30", label: "+30 seconds", detail: "Add time", tone: "neutral" },
  { action: "subtract-30", label: "-30 seconds", detail: "Remove time", tone: "neutral" },
  { action: "reset-timer", label: "Reset timer", detail: "Restart this stage", tone: "neutral" },
];

interface RemoteSession {
  id: string;
  joinCode: string | null;
}

interface DeckKeyProps {
  button: RemoteDeckButton;
  busy: TeacherRemoteAction | null;
  disabled: boolean;
  onSend: (button: RemoteDeckButton) => void;
}

function DeckKey({ button, busy, disabled, onSend }: DeckKeyProps) {
  return (
    <button
      className={`deck-key ${button.tone}`}
      disabled={disabled}
      aria-busy={busy === button.action}
      onClick={() => onSend(button)}
    >
      <span className="deck-key-label">{busy === button.action ? "Sending" : button.label}</span>
      <span className="deck-key-detail">{button.detail}</span>
    </button>
  );
}

export default function TeacherRemotePage() {
  const [session, setSession] = useState<RemoteSession | null>(null);
  const [status, setStatus] = useState("Finding the open class...");
  const [busy, setBusy] = useState<TeacherRemoteAction | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/control-remote", { cache: "no-store" });
      const data = await response.json() as { session?: RemoteSession | null; error?: string };
      if (!response.ok || data.error) {
        setSession(null);
        setStatus(data.error || "Remote is unavailable.");
        return;
      }
      setSession(data.session || null);
      setStatus(data.session ? "Connected to Live Class Flow" : "Open Live Class Flow on the classroom computer.");
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

  const send = useCallback(async (button: RemoteDeckButton) => {
    if (!session || busy) return;
    setBusy(button.action);
    try {
      const response = await fetch("/api/control-remote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: button.action }),
      });
      const data = await response.json() as { error?: string };
      setStatus(response.ok ? `Sent to classroom: ${button.label}` : data.error || "Command failed.");
    } catch {
      setStatus("Command failed. Check the classroom connection.");
    } finally {
      // Keep each command available longer than the classroom controller's poll
      // interval so fast taps cannot overwrite a cue before it is consumed.
      window.setTimeout(() => setBusy(null), 850);
    }
  }, [busy, session]);

  const controlsDisabled = !session || Boolean(busy);

  return (
    <main className="remote-page">
      <style>{`
        .remote-page { min-height:100vh; box-sizing:border-box; background:#0d1017; color:#f8fafc; font-family:Inter,ui-sans-serif,system-ui,sans-serif; padding:clamp(16px,3vw,34px); }
        .remote-shell { width:min(100%,980px); margin:0 auto; display:grid; gap:18px; }
        .remote-head { display:flex; justify-content:space-between; gap:14px; align-items:flex-start; }
        .remote-kicker { margin:0 0 5px; color:#5eead4; font-size:0.7rem; font-weight:900; letter-spacing:0.13em; text-transform:uppercase; }
        .remote-title { margin:0; font-size:clamp(1.65rem,5vw,2.7rem); line-height:1; }
        .remote-subtitle { margin:8px 0 0; color:#8390aa; font-size:0.92rem; font-weight:700; }
        .remote-code { min-width:94px; border:1px solid #2b364d; border-radius:12px; background:#151b28; padding:10px 14px; text-align:center; }
        .remote-code small { display:block; color:#8390aa; font-size:0.62rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
        .remote-code strong { display:block; color:#5eead4; font-size:1.25rem; letter-spacing:0.1em; }
        .remote-status { margin:0; border-left:4px solid #14b8a6; background:#151b28; border-radius:8px; padding:11px 14px; color:#cbd5e1; font-weight:750; }
        .deck-section { display:grid; gap:10px; border:1px solid #222a3a; border-radius:16px; background:#111620; padding:14px; }
        .deck-section-head { display:flex; justify-content:space-between; align-items:baseline; gap:12px; }
        .deck-section-title { margin:0; color:#f8fafc; font-size:0.76rem; font-weight:900; letter-spacing:0.12em; text-transform:uppercase; }
        .deck-section-note { margin:0; color:#71809a; font-size:0.75rem; font-weight:700; text-align:right; }
        .deck-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
        .deck-grid.stages { grid-template-columns:repeat(4,minmax(0,1fr)); }
        .deck-grid.abbie { grid-template-columns:repeat(3,minmax(0,1fr)); }
        .deck-key { min-height:92px; display:grid; align-content:center; gap:5px; border:1px solid #35415a; border-bottom-width:4px; border-radius:14px; background:#171d2a; color:#f8fafc; padding:12px; font:inherit; text-align:left; cursor:pointer; touch-action:manipulation; box-shadow:0 8px 18px rgba(0,0,0,0.2); }
        .deck-key:active:not(:disabled) { transform:translateY(2px); border-bottom-width:2px; }
        .deck-key:disabled { opacity:0.42; cursor:not-allowed; }
        .deck-key-label { font-size:clamp(0.98rem,2.4vw,1.2rem); font-weight:900; line-height:1.05; }
        .deck-key-detail { color:#91a0b9; font-size:0.72rem; font-weight:750; line-height:1.2; }
        .deck-key.timer { border-color:#c89c35; background:#2a2315; color:#fcd67d; }
        .deck-key.next, .deck-key.teal { border-color:#14b8a6; background:#0d2a27; color:#7ff3df; }
        .deck-key.orange { border-color:#db6338; background:#2d1914; color:#ffad8d; }
        .deck-key.blue { border-color:#4d8df6; background:#14233e; color:#a8c7ff; }
        .deck-key.gold { border-color:#c89c35; background:#2a2315; color:#fcd67d; }
        .deck-key.purple { border-color:#8b5cf6; background:#21183a; color:#cbb7ff; }
        .deck-key.green { border-color:#22a06b; background:#102b21; color:#92efc1; }
        .deck-key.red { border-color:#dc5b5b; background:#321818; color:#ffaaaa; }
        .remote-links { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
        .remote-link { display:flex; min-height:54px; align-items:center; justify-content:center; border:1px solid #35415a; border-radius:12px; background:#151b28; color:#dce6f5; padding:0 12px; text-align:center; text-decoration:none; font-weight:850; }
        @media (max-width:680px) {
          .deck-grid, .deck-grid.abbie, .deck-grid.stages { grid-template-columns:repeat(2,minmax(0,1fr)); }
          .deck-grid.stages .deck-key.timer { grid-column:1 / -1; grid-row:1; }
          .remote-links { grid-template-columns:1fr; }
          .deck-section-head { display:block; }
          .deck-section-note { margin-top:4px; text-align:left; }
        }
      `}</style>
      <section className="remote-shell">
        <header className="remote-head">
          <div>
            <p className="remote-kicker">Private teacher controls</p>
            <h1 className="remote-title">Classroom Deck</h1>
            <p className="remote-subtitle">Stages, Abbie, and classroom audio in one remote.</p>
          </div>
          {session?.joinCode ? <div className="remote-code"><small>Join code</small><strong>{session.joinCode}</strong></div> : null}
        </header>

        <p className="remote-status" role="status">{status}</p>

        <section className="deck-section" aria-labelledby="stage-controls-title">
          <div className="deck-section-head">
            <h2 className="deck-section-title" id="stage-controls-title">Lesson stages</h2>
            <p className="deck-section-note">Controls the live sequence and timer.</p>
          </div>
          <div className="deck-grid stages">
            {STAGE_BUTTONS.map((button) => <DeckKey key={button.action} button={button} busy={busy} disabled={controlsDisabled} onSend={send} />)}
          </div>
          <div className="deck-grid">
            {TIMER_BUTTONS.map((button) => <DeckKey key={button.action} button={button} busy={busy} disabled={controlsDisabled} onSend={send} />)}
          </div>
        </section>

        <section className="deck-section" aria-labelledby="abbie-controls-title">
          <div className="deck-section-head">
            <h2 className="deck-section-title" id="abbie-controls-title">Abbie AI</h2>
            <p className="deck-section-note">Abbie speaks from the classroom computer and appears on student screens.</p>
          </div>
          <div className="deck-grid abbie">
            {ABBIE_REMOTE_BUTTONS.map((button) => <DeckKey key={button.action} button={button} busy={busy} disabled={controlsDisabled} onSend={send} />)}
          </div>
        </section>

        <section className="deck-section" aria-labelledby="sound-controls-title">
          <div className="deck-section-head">
            <h2 className="deck-section-title" id="sound-controls-title">Sound effects</h2>
            <p className="deck-section-note">Uses uploaded Control sounds or the built-in tones.</p>
          </div>
          <div className="deck-grid">
            {SOUND_REMOTE_BUTTONS.map((button) => <DeckKey key={button.action} button={button} busy={busy} disabled={controlsDisabled} onSend={send} />)}
          </div>
        </section>

        <div className="remote-links">
          <a className="remote-link" href="/control" target="_blank" rel="noreferrer">Open full control</a>
          <a className="remote-link" href="/teacher/present" target="_blank" rel="noreferrer">Open classroom stage</a>
          <a className="remote-link" href="/teacher/timer" target="_blank" rel="noreferrer">Open timer panel</a>
          <a className="remote-link" href={session ? `/ipad?room=${session.id}` : "/ipad"} target="_blank" rel="noreferrer">Open live writing board</a>
        </div>
      </section>
    </main>
  );
}
