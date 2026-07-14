"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { liveTimerSeconds, type LiveClassFlowSnapshot, type TeacherRemoteAction, type TeacherRemoteCommand } from "@/lib/liveClassFlow";
import { ABBIE_REMOTE_BUTTONS, SOUND_REMOTE_BUTTONS, type RemoteDeckButton } from "@/lib/remoteDeck";

const REMOTE_SESSION_KEY = "bdm-remote-session";

const STAGE_BUTTONS: readonly RemoteDeckButton[] = [
  { action: "previous", label: "Back", detail: "Previous stage", tone: "neutral" },
  { action: "toggle-timer", label: "Start or pause", detail: "Control the timer", tone: "timer" },
  { action: "next", label: "Next state", detail: "Load paused", tone: "next" },
];

const TIMER_BUTTONS: readonly RemoteDeckButton[] = [
  { action: "add-30", label: "+30 seconds", detail: "Add time", tone: "neutral" },
  { action: "subtract-30", label: "-30 seconds", detail: "Remove time", tone: "neutral" },
  { action: "reset-timer", label: "Reset timer", detail: "Restart this stage", tone: "neutral" },
];

interface RemoteSession {
  id: string;
  joinCode: string | null;
  startedAt: string;
  remoteCommand: TeacherRemoteCommand | null;
  liveFlow: LiveClassFlowSnapshot | null;
}

interface PollAnswer {
  id: string;
  display_name: string | null;
  answer: string | null;
}

interface DeckKeyProps {
  button: RemoteDeckButton;
  busy: TeacherRemoteAction | null;
  disabled: boolean;
  onSend: (button: RemoteDeckButton) => void;
}

function formatTime(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatStartedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Start time unavailable"
    : `Started ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
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
  const [sessions, setSessions] = useState<RemoteSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<RemoteSession | null>(null);
  const [status, setStatus] = useState("Choose the class session this Remote should control.");
  const [busy, setBusy] = useState<TeacherRemoteAction | null>(null);
  const [pendingCommand, setPendingCommand] = useState<{ nonce: string; label: string } | null>(null);
  const [lastReceipt, setLastReceipt] = useState<string | null>(null);
  const [pollAnswers, setPollAnswers] = useState<PollAnswer[]>([]);
  const [boardPanelOpen, setBoardPanelOpen] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const requestedSessionId = params.get("session")?.trim();
      const storedSessionId = localStorage.getItem(REMOTE_SESSION_KEY)?.trim();
      setSelectedSessionId(requestedSessionId || storedSessionId || null);
    } catch {
      setSelectedSessionId(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const query = selectedSessionId ? `?sessionId=${encodeURIComponent(selectedSessionId)}` : "";
      const response = await fetch(`/api/control-remote${query}`, { cache: "no-store" });
      const data = await response.json() as { sessions?: RemoteSession[]; session?: RemoteSession | null; error?: string };
      if (!response.ok || data.error) {
        setSession(null);
        setStatus(data.error || "Remote is unavailable.");
        return;
      }
      const availableSessions = data.sessions || [];
      setSessions(availableSessions);
      if (!selectedSessionId) {
        setSession(null);
        setStatus(availableSessions.length
          ? "Choose the class session this Remote should control."
          : "Open Live Class Flow on the classroom computer.");
        return;
      }
      if (!data.session) {
        setSession(null);
        setSelectedSessionId(null);
        try { localStorage.removeItem(REMOTE_SESSION_KEY); } catch { /* ignore */ }
        setStatus("The previously selected session is no longer open. Choose another session.");
        return;
      }
      setSession(data.session);
      if (pendingCommand && data.session.remoteCommand?.nonce === pendingCommand.nonce) {
        setStatus(data.session.remoteCommand.receivedAt
          ? `Received by classroom: ${pendingCommand.label}`
          : `Sent to classroom: ${pendingCommand.label}. Waiting for receipt.`);
        if (data.session.remoteCommand.receivedAt) {
          setLastReceipt(pendingCommand.label);
          setPendingCommand(null);
        }
      } else if (!pendingCommand) {
        setStatus(lastReceipt
          ? `Received by classroom: ${lastReceipt}`
          : "Connected to the confirmed Live Class Flow session.");
      }
    } catch {
      setStatus("Disconnected. Trying to reach the classroom controller again.");
    }
  }, [lastReceipt, pendingCommand, selectedSessionId]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(refresh, 1200);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (!lastReceipt) return;
    const timeout = window.setTimeout(() => setLastReceipt(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [lastReceipt]);

  const pollId = session?.liveFlow?.poll?.id ?? null;
  useEffect(() => {
    if (!pollId) {
      setPollAnswers([]);
      return;
    }
    let stopped = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/teacher/poll?pollId=${encodeURIComponent(pollId)}`, { cache: "no-store" });
        const data = await response.json() as { answers?: PollAnswer[] };
        if (!stopped && response.ok) setPollAnswers(data.answers || []);
      } catch {
        if (!stopped) setPollAnswers([]);
      }
    };
    void load();
    const interval = window.setInterval(load, 1200);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [pollId]);

  const chooseSession = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
    setSession(null);
    setPendingCommand(null);
    setLastReceipt(null);
    setBoardPanelOpen(false);
    setStatus("Confirming the selected classroom session.");
    try { localStorage.setItem(REMOTE_SESSION_KEY, sessionId); } catch { /* ignore */ }
  }, []);

  const changeSession = useCallback(() => {
    setSelectedSessionId(null);
    setSession(null);
    setPendingCommand(null);
    setLastReceipt(null);
    setBoardPanelOpen(false);
    setStatus("Choose the class session this Remote should control.");
    try { localStorage.removeItem(REMOTE_SESSION_KEY); } catch { /* ignore */ }
  }, []);

  const send = useCallback(async (button: RemoteDeckButton) => {
    if (!session || busy) return;
    setBusy(button.action);
    setLastReceipt(null);
    setStatus(`Sending to classroom: ${button.label}`);
    try {
      const response = await fetch("/api/control-remote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: button.action, sessionId: session.id }),
      });
      const data = await response.json() as { command?: TeacherRemoteCommand; liveFlow?: LiveClassFlowSnapshot; error?: string };
      if (!response.ok || !data.command) {
        setStatus(data.error || "Command failed.");
      } else if (data.command.receivedAt) {
        if (data.liveFlow) setSession((current) => current ? { ...current, liveFlow: data.liveFlow || null, remoteCommand: data.command || null } : current);
        setPendingCommand(null);
        setLastReceipt(button.label);
        setStatus(`Received by classroom: ${button.label}`);
      } else {
        setPendingCommand({ nonce: data.command.nonce, label: button.label });
        setStatus(`Sent to classroom: ${button.label}. Waiting for receipt.`);
      }
    } catch {
      setStatus("Command failed. Check the classroom connection.");
    } finally {
      window.setTimeout(() => setBusy(null), 850);
    }
  }, [busy, session]);

  const setWritingMode = useCallback(async (open: boolean) => {
    if (!session || busy) return;
    const action: TeacherRemoteAction = open ? "show-board" : "hide-board";
    const label = open ? "Open work space" : "Close work space";
    setBusy(action);
    setLastReceipt(null);
    setStatus(`Sending to classroom: ${label}`);
    try {
      const response = await fetch("/api/control-remote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, sessionId: session.id }),
      });
      const data = await response.json() as { command?: TeacherRemoteCommand; liveFlow?: LiveClassFlowSnapshot; error?: string };
      if (!response.ok || !data.command) {
        setStatus(data.error || "Command failed.");
      } else if (data.command.receivedAt) {
        if (data.liveFlow) setSession((current) => current ? { ...current, liveFlow: data.liveFlow || null, remoteCommand: data.command || null } : current);
        setPendingCommand(null);
        setLastReceipt(label);
        setStatus(`Received by classroom: ${label}`);
        setBoardPanelOpen(open);
      } else {
        setPendingCommand({ nonce: data.command.nonce, label });
        setStatus(`Sent to classroom: ${label}. Waiting for receipt.`);
        setBoardPanelOpen(open);
      }
    } catch {
      setStatus("Command failed. Check the classroom connection.");
    } finally {
      window.setTimeout(() => setBusy(null), 850);
    }
  }, [busy, session]);

  useEffect(() => {
    if (session?.liveFlow?.presentation?.boardOpen) setBoardPanelOpen(true);
  }, [session?.liveFlow?.presentation?.boardOpen]);

  const flow = session?.liveFlow ?? null;
  const timer = flow?.timer ?? null;
  const timerSeconds = liveTimerSeconds(timer);
  const timerFinished = Boolean(timer?.finished || (timer?.running && timerSeconds <= 0));
  const sequence = flow?.sequence ?? null;
  const lesson = flow?.lesson ?? null;
  const controlsDisabled = !session || Boolean(busy);
  const stageLinks = useMemo(() => {
    const query = session ? `?session=${encodeURIComponent(session.id)}` : "";
    return {
      present: `/teacher/present${query}`,
      pace: `/teacher/pace${query}`,
    };
  }, [session]);

  if (boardPanelOpen && session) {
    return (
      <main className="remote-write-page">
        <style>{`
          .remote-write-page { position:fixed; inset:0; display:grid; grid-template-rows:auto minmax(0,1fr); background:#0d1017; font-family:var(--bdb-font); }
          .remote-write-bar { display:flex; align-items:center; justify-content:space-between; gap:14px; border-bottom:1px solid #2b364d; background:#151b28; color:#f8fafc; padding:10px 14px; }
          .remote-write-copy { min-width:0; }
          .remote-write-copy strong { display:block; font-size:1rem; }
          .remote-write-copy span { display:block; margin-top:2px; color:#94a3b8; font-size:0.76rem; font-weight:700; }
          .remote-write-back { min-height:44px; border:1px solid #14b8a6; border-radius:10px; background:#0d2a27; color:#7ff3df; padding:0 16px; font:inherit; font-weight:900; cursor:pointer; }
          .remote-write-back:disabled { opacity:0.5; cursor:not-allowed; }
          .remote-write-frame { width:100%; height:100%; border:0; background:#fff; }
        `}</style>
        <header className="remote-write-bar">
          <div className="remote-write-copy">
            <strong>Writing on the main projector</strong>
            <span>The current problem stays visible beside this work space.</span>
          </div>
          <button className="remote-write-back" type="button" disabled={Boolean(busy)} onClick={() => { void setWritingMode(false); }}>Back to Remote</button>
        </header>
        <iframe className="remote-write-frame" src={`/ipad?room=${encodeURIComponent(session.id)}`} title="iPad writing work space" />
      </main>
    );
  }

  return (
    <main className="remote-page">
      <style>{`
        .remote-page { min-height:100vh; box-sizing:border-box; background:#0d1017; color:#f8fafc; font-family:var(--bdb-font); padding:clamp(16px,3vw,34px); }
        .remote-shell { width:min(100%,980px); margin:0 auto; display:grid; gap:18px; }
        .remote-head { display:flex; justify-content:space-between; gap:14px; align-items:flex-start; }
        .remote-kicker { margin:0 0 5px; color:#5eead4; font-size:0.7rem; font-weight:900; letter-spacing:0.13em; text-transform:uppercase; }
        .remote-title { margin:0; font-size:clamp(1.65rem,5vw,2.7rem); line-height:1; }
        .remote-subtitle { margin:8px 0 0; color:#94a3b8; font-size:0.92rem; font-weight:700; }
        .remote-code { min-width:108px; border:1px solid #2b364d; border-radius:12px; background:#151b28; padding:10px 14px; text-align:center; }
        .remote-code small { display:block; color:#94a3b8; font-size:0.62rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
        .remote-code strong { display:block; color:#5eead4; font-size:1.25rem; letter-spacing:0.1em; }
        .remote-code span { display:block; margin-top:3px; color:#94a3b8; font-size:0.68rem; font-weight:750; }
        .remote-status { margin:0; border-left:4px solid #14b8a6; background:#151b28; border-radius:8px; padding:11px 14px; color:#d9e2ef; font-weight:750; }
        .session-list { display:grid; gap:10px; }
        .session-choice { width:100%; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:12px; align-items:center; border:1px solid #35415a; border-radius:12px; background:#171d2a; color:#f8fafc; padding:14px; font:inherit; text-align:left; cursor:pointer; }
        .session-choice:hover, .session-choice:focus-visible { border-color:#14b8a6; outline:none; }
        .session-choice strong { display:block; font-size:1rem; }
        .session-choice span { display:block; margin-top:3px; color:#94a3b8; font-size:0.78rem; font-weight:700; }
        .session-use { color:#7ff3df; font-size:0.76rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; }
        .current-card { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:18px; border:1px solid #2b364d; border-left:5px solid #14b8a6; border-radius:16px; background:#151b28; padding:16px; }
        .current-label { margin:0 0 5px; color:#5eead4; font-size:0.68rem; font-weight:900; letter-spacing:0.12em; text-transform:uppercase; }
        .current-title { margin:0; font-size:clamp(1.35rem,4vw,2rem); line-height:1.05; }
        .current-directions { margin:8px 0 0; color:#cbd5e1; line-height:1.4; font-weight:700; white-space:pre-wrap; }
        .current-next { margin:12px 0 0; color:#94a3b8; font-size:0.82rem; font-weight:750; }
        .current-time { align-self:center; color:#fff; font-size:clamp(2.6rem,9vw,4.5rem); font-weight:900; line-height:0.9; font-variant-numeric:tabular-nums; letter-spacing:-0.04em; }
        .current-time.finished { color:#fda4af; }
        .deck-section { display:grid; gap:10px; border:1px solid #222a3a; border-radius:16px; background:#111620; padding:14px; }
        .deck-section-head { display:flex; justify-content:space-between; align-items:baseline; gap:12px; }
        .deck-section-title { margin:0; color:#f8fafc; font-size:0.76rem; font-weight:900; letter-spacing:0.12em; text-transform:uppercase; }
        .deck-section-note { margin:0; color:#94a3b8; font-size:0.75rem; font-weight:700; text-align:right; }
        .deck-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
        .deck-key { min-height:92px; display:grid; align-content:center; gap:5px; border:1px solid #35415a; border-bottom-width:4px; border-radius:14px; background:#171d2a; color:#f8fafc; padding:12px; font:inherit; text-align:left; cursor:pointer; touch-action:manipulation; box-shadow:0 8px 18px rgba(0,0,0,0.2); }
        .deck-key:active:not(:disabled) { transform:translateY(2px); border-bottom-width:2px; }
        .deck-key:disabled { opacity:0.42; cursor:not-allowed; }
        .deck-key-label { font-size:clamp(0.98rem,2.4vw,1.2rem); font-weight:900; line-height:1.05; }
        .deck-key-detail { color:#a9b6c9; font-size:0.72rem; font-weight:750; line-height:1.2; }
        .deck-key.timer { border-color:#c89c35; background:#2a2315; color:#fcd67d; }
        .deck-key.next, .deck-key.teal { border-color:#14b8a6; background:#0d2a27; color:#7ff3df; }
        .deck-key.orange { border-color:#db6338; background:#2d1914; color:#ffad8d; }
        .deck-key.blue { border-color:#4d8df6; background:#14233e; color:#a8c7ff; }
        .deck-key.gold { border-color:#c89c35; background:#2a2315; color:#fcd67d; }
        .deck-key.purple { border-color:#8b5cf6; background:#21183a; color:#cbb7ff; }
        .deck-key.green { border-color:#22a06b; background:#102b21; color:#92efc1; }
        .deck-key.red { border-color:#dc5b5b; background:#321818; color:#ffaaaa; }
        .response-list { display:grid; gap:8px; margin:0; padding:0; list-style:none; }
        .response-row { display:grid; grid-template-columns:minmax(110px,0.8fr) minmax(0,1.8fr); gap:10px; border-top:1px solid #273247; padding-top:8px; color:#dce6f5; font-size:0.84rem; }
        .response-name { font-weight:900; }
        .response-answer { color:#b7c3d4; overflow-wrap:anywhere; }
        .response-empty { margin:0; color:#94a3b8; font-size:0.84rem; font-weight:700; }
        .remote-links { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
        .remote-link, .remote-change { display:flex; min-height:54px; align-items:center; justify-content:center; border:1px solid #35415a; border-radius:12px; background:#151b28; color:#dce6f5; padding:0 12px; text-align:center; text-decoration:none; font:inherit; font-weight:850; cursor:pointer; }
        .remote-change { color:#fcd67d; }
        @media (max-width:680px) {
          .deck-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
          .deck-grid.stages .deck-key.timer { grid-column:1 / -1; grid-row:1; }
          .current-card { grid-template-columns:1fr; }
          .current-time { justify-self:start; }
          .remote-links { grid-template-columns:1fr 1fr; }
          .deck-section-head { display:block; }
          .deck-section-note { margin-top:4px; text-align:left; }
        }
      `}</style>
      <section className="remote-shell">
        <header className="remote-head">
          <div>
            <p className="remote-kicker">Private teacher controls</p>
            <h1 className="remote-title">Classroom Remote</h1>
            <p className="remote-subtitle">Confirm the class, then control its lesson, timer, Abbie, and audio.</p>
          </div>
          {session ? (
            <div className="remote-code">
              <small>Confirmed class</small>
              <strong>{session.joinCode || "No code"}</strong>
              <span>{formatStartedAt(session.startedAt)}</span>
            </div>
          ) : null}
        </header>

        <p className="remote-status" role="status">{status}</p>

        {!session ? (
          <section className="deck-section" aria-labelledby="session-picker-title">
            <div className="deck-section-head">
              <h2 className="deck-section-title" id="session-picker-title">Open Live Class Flow sessions</h2>
              <p className="deck-section-note">Choose by join code and start time.</p>
            </div>
            <div className="session-list">
              {sessions.length ? sessions.map((candidate) => (
                <button className="session-choice" key={candidate.id} onClick={() => chooseSession(candidate.id)}>
                  <span>
                    <strong>Join code {candidate.joinCode || "not set"}</strong>
                    <span>{formatStartedAt(candidate.startedAt)}. {candidate.liveFlow?.lesson?.code || "Lesson not loaded"}</span>
                  </span>
                  <span className="session-use">Use this session</span>
                </button>
              )) : <p className="response-empty">No open Live Class Flow session is available.</p>}
            </div>
          </section>
        ) : (
          <>
            <section className="current-card" aria-label="Current classroom state">
              <div>
                <p className="current-label">{lesson?.code || "Live lesson"} · {sequence ? `Step ${sequence.currentIndex + 1} of ${sequence.totalSteps}` : "Current step"}</p>
                <h2 className="current-title">{flow?.state?.label || "Waiting for a lesson step"}</h2>
                <p className="current-directions">{flow?.state?.description || "The classroom computer has not published directions yet."}</p>
                <p className="current-next"><strong>Next:</strong> {sequence?.nextLabel || "Lesson closeout"}{sequence?.nextDirections ? ` - ${sequence.nextDirections}` : ""}</p>
              </div>
              <div className={`current-time ${timerFinished ? "finished" : ""}`}>{timer ? formatTime(timerSeconds) : "--:--"}</div>
            </section>

            <section className="deck-section" aria-labelledby="stage-controls-title">
              <div className="deck-section-head">
                <h2 className="deck-section-title" id="stage-controls-title">Lesson stages</h2>
                <p className="deck-section-note">Manual advance is the default. Zero does not advance.</p>
              </div>
              <div className="deck-grid stages">
                {STAGE_BUTTONS.map((button) => <DeckKey key={button.action} button={button} busy={busy} disabled={controlsDisabled} onSend={send} />)}
              </div>
              <div className="deck-grid">
                {TIMER_BUTTONS.map((button) => <DeckKey key={button.action} button={button} busy={busy} disabled={controlsDisabled} onSend={send} />)}
              </div>
            </section>

            <section className="deck-section" aria-labelledby="response-title">
              <div className="deck-section-head">
                <h2 className="deck-section-title" id="response-title">Private response data</h2>
                <p className="deck-section-note">{flow?.poll ? `${pollAnswers.length} response${pollAnswers.length === 1 ? "" : "s"}` : "No live response is open"}</p>
              </div>
              {flow?.poll ? (
                pollAnswers.length ? (
                  <ul className="response-list">
                    {pollAnswers.map((answer) => (
                      <li className="response-row" key={answer.id}>
                        <span className="response-name">{answer.display_name || "Student"}</span>
                        <span className="response-answer">{answer.answer || "No answer"}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="response-empty">Waiting for responses.</p>
              ) : <p className="response-empty">Student names and individual answers stay on this private screen.</p>}
            </section>

            <section className="deck-section" aria-labelledby="abbie-controls-title">
              <div className="deck-section-head">
                <h2 className="deck-section-title" id="abbie-controls-title">Abbie AI</h2>
                <p className="deck-section-note">Abbie speaks from the classroom computer and appears on student screens.</p>
              </div>
              <div className="deck-grid">
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
              <a className="remote-link" href={stageLinks.present} target="_blank" rel="noreferrer">Open main projector</a>
              <a className="remote-link" href={stageLinks.pace} target="_blank" rel="noreferrer">Open Pace + Support</a>
              <button className="remote-link" type="button" disabled={controlsDisabled} onClick={() => { void setWritingMode(true); }}>Open work space</button>
              <button className="remote-change" type="button" onClick={changeSession}>Change session</button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
