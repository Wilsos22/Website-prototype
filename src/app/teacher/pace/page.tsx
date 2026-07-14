"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { CLASSROOM_STAGE_THEMES, classroomStageTheme } from "@/lib/classroomPilot";
import { teacherApiRequest } from "@/lib/teacherApi";
import { LIVE_FLOW_MODE, getStoredTeacherSessionId, liveTimerSeconds, type LiveClassFlowSnapshot } from "@/lib/liveClassFlow";

interface PaceSession {
  id: string;
  status: string;
  join_code: string | null;
  broadcast: string | null;
  live_flow: LiveClassFlowSnapshot | null;
}

function formatTime(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function requestedSessionId() {
  try {
    return new URLSearchParams(window.location.search).get("session")?.trim()
      || getStoredTeacherSessionId()
      || null;
  } catch {
    return null;
  }
}

export default function PaceSupportPage() {
  const [session, setSession] = useState<PaceSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionMessage, setSessionMessage] = useState("Connecting to the confirmed class session.");

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      const result = await teacherApiRequest<{ sessions: PaceSession[] }>("/api/teacher/session")
        .catch(() => ({ sessions: [] }));
      const liveSessions = result.sessions.filter((candidate) => candidate.status === "open" && candidate.broadcast === LIVE_FLOW_MODE);
      const requested = requestedSessionId();
      const selected = requested
        ? liveSessions.find((candidate) => candidate.id === requested) ?? null
        : liveSessions.length === 1 ? liveSessions[0] : null;
      if (!stopped) {
        setSession(selected);
        setSessionMessage(selected
          ? "Connected to the confirmed class session."
          : liveSessions.length > 1
            ? "Choose the intended session from the private teacher Remote."
            : "Start Live Class Flow or open this projector from the private teacher Remote.");
        setLoading(false);
      }
    };
    void load();
    const interval = window.setInterval(load, 1000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, []);

  const flow = session?.live_flow ?? null;
  const state = flow?.state ?? null;
  const timer = flow?.timer ?? null;
  const timerSeconds = liveTimerSeconds(timer);
  const timerFinished = Boolean(timer?.finished || (timer?.running && timerSeconds <= 0));
  const theme = state?.semantic
    ? CLASSROOM_STAGE_THEMES[state.semantic]
    : classroomStageTheme(state?.id, state?.label);
  const style = {
    "--pace-accent": theme.accent,
    "--pace-base": theme.projectorBase,
    "--pace-panel": theme.projectorPanel,
    "--pace-line": theme.projectorLine,
    "--pace-muted": theme.projectorMuted,
    "--pace-glow": theme.projectorGlow,
  } as CSSProperties;

  return (
    <main className="pace-page" style={style}>
      <style>{`
        .pace-page { position:fixed; inset:0; overflow:hidden; box-sizing:border-box; background:radial-gradient(circle at 16% 14%,var(--pace-glow),transparent 38%),radial-gradient(circle at 86% 78%,var(--pace-glow),transparent 36%),var(--pace-base); color:#fff; font-family:var(--bdb-font); padding:clamp(18px,2.5vw,36px); }
        .pace-shell { width:100%; height:100%; display:grid; grid-template-rows:auto minmax(0,1fr); gap:clamp(14px,2vw,24px); }
        .pace-timer { display:flex; align-items:center; justify-content:center; border:1px solid var(--pace-line); border-radius:20px; background:color-mix(in srgb,var(--pace-panel) 94%,transparent); padding:clamp(12px,1.8vw,20px); box-shadow:0 18px 50px rgba(0,0,0,0.24); }
        .pace-time { color:#fff; font-size:clamp(5.5rem,13vw,11rem); font-weight:900; line-height:0.82; font-variant-numeric:tabular-nums; letter-spacing:-0.06em; }
        .pace-time.finished { color:#ffd5dc; }
        .pace-current { min-height:0; display:grid; place-items:center; border:1px solid var(--pace-line); border-radius:24px; background:color-mix(in srgb,var(--pace-panel) 88%,transparent); padding:clamp(30px,6vw,88px); box-shadow:0 28px 70px rgba(0,0,0,0.28); text-align:center; }
        .pace-current-inner { width:min(100%,1180px); display:grid; gap:18px; justify-items:center; }
        .pace-current-label { margin:0; color:var(--pace-accent); font-size:clamp(0.72rem,1.3vw,0.92rem); font-weight:900; letter-spacing:0.14em; text-transform:uppercase; }
        .pace-directions { margin:0; max-width:28ch; color:#fff; font-size:clamp(2.5rem,6.4vw,6.8rem); line-height:1.02; letter-spacing:-0.035em; text-wrap:balance; white-space:pre-wrap; }
        .pace-empty { grid-row:1 / -1; display:grid; place-items:center; border:1px solid var(--pace-line); border-radius:24px; background:color-mix(in srgb,var(--pace-panel) 88%,transparent); text-align:center; padding:40px; }
        .pace-empty h1 { margin:0; max-width:20ch; font-size:clamp(2.4rem,6vw,5.6rem); line-height:1.02; }
        .pace-empty p { margin:15px 0 0; color:var(--pace-muted); font-size:clamp(1rem,2vw,1.35rem); font-weight:720; }
      `}</style>

      <section className="pace-shell">
        {loading || !session || !flow || !state ? (
          <section className="pace-empty">
            <div>
              <h1>{loading ? "Connecting to class" : "Ready for class"}</h1>
              <p>{sessionMessage}</p>
            </div>
          </section>
        ) : (
          <>
            <section className="pace-timer" aria-label="Class timer">
              <div className={`pace-time ${timerFinished ? "finished" : ""}`}>{timer ? formatTime(timerSeconds) : "--:--"}</div>
            </section>
            <section className="pace-current" aria-label="Current directions and timer">
              <div className="pace-current-inner">
                <p className="pace-current-label">Current directions</p>
                <h2 className="pace-directions">{state.description}</h2>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
