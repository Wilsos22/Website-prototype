"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { CLASSROOM_STAGE_THEMES, classroomStageTheme } from "@/lib/classroomPilot";
import { teacherApiRequest } from "@/lib/teacherApi";
import { LIVE_FLOW_MODE, getStoredTeacherSessionId, type LiveClassFlowSnapshot } from "@/lib/liveClassFlow";

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
  const lesson = flow?.lesson ?? null;
  const sequence = flow?.sequence ?? null;
  const phase = flow?.phase ?? null;
  const theme = state?.semantic
    ? CLASSROOM_STAGE_THEMES[state.semantic]
    : classroomStageTheme(state?.id, state?.label);
  const supportStems = phase?.sentenceStems?.filter(Boolean) ?? [];
  const supportVocabulary = phase?.keyVocabulary?.filter(Boolean) ?? [];
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
        .pace-shell { width:100%; height:100%; display:grid; grid-template-columns:minmax(0,1.6fr) minmax(290px,0.72fr); grid-template-rows:auto minmax(0,1fr); gap:clamp(14px,2vw,24px); }
        .pace-head { grid-column:1 / -1; display:flex; align-items:center; justify-content:space-between; gap:24px; }
        .pace-identity { min-width:0; }
        .pace-kicker { margin:0 0 5px; color:var(--pace-accent); font-size:clamp(0.68rem,1.1vw,0.86rem); font-weight:900; letter-spacing:0.13em; text-transform:uppercase; }
        .pace-phase { margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:clamp(1.5rem,3vw,2.7rem); line-height:1; }
        .pace-code { flex:none; display:grid; grid-template-columns:auto auto; align-items:center; gap:10px 18px; border:1px solid var(--pace-line); border-radius:999px; background:color-mix(in srgb,var(--pace-panel) 90%,transparent); padding:9px 16px; }
        .pace-code-label { color:var(--pace-muted); font-size:0.68rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
        .pace-code-value { color:#fff; font-size:1.1rem; font-weight:900; letter-spacing:0.08em; }
        .pace-current { min-height:0; display:grid; align-content:center; gap:clamp(16px,3vw,30px); border:1px solid var(--pace-line); border-radius:24px; background:color-mix(in srgb,var(--pace-panel) 88%,transparent); padding:clamp(28px,5vw,72px); box-shadow:0 28px 70px rgba(0,0,0,0.28); }
        .pace-current-label { margin:0; color:var(--pace-accent); font-size:0.72rem; font-weight:900; letter-spacing:0.14em; text-transform:uppercase; }
        .pace-directions { margin:0; max-width:24ch; color:#fff; font-size:clamp(2.4rem,5.7vw,6rem); line-height:1.02; letter-spacing:-0.035em; text-wrap:balance; white-space:pre-wrap; }
        .pace-timer-row { display:flex; align-items:end; justify-content:space-between; gap:22px; border-top:1px solid var(--pace-line); padding-top:18px; }
        .pace-time { color:#fff; font-size:clamp(4.6rem,10vw,9rem); font-weight:900; line-height:0.82; font-variant-numeric:tabular-nums; letter-spacing:-0.055em; }
        .pace-time.finished { color:#ffd5dc; }
        .pace-timer-state { margin:0; color:var(--pace-accent); text-align:right; font-size:clamp(0.85rem,1.6vw,1.15rem); font-weight:900; letter-spacing:0.12em; text-transform:uppercase; }
        .pace-side { min-height:0; display:grid; grid-template-rows:auto auto minmax(0,1fr); gap:14px; }
        .pace-card { min-width:0; display:grid; align-content:start; gap:9px; border:1px solid var(--pace-line); border-top:4px solid var(--pace-accent); border-radius:18px; background:color-mix(in srgb,var(--pace-panel) 90%,transparent); padding:clamp(16px,2vw,22px); overflow:hidden; }
        .pace-card-label { margin:0; color:var(--pace-accent); font-size:0.68rem; font-weight:900; letter-spacing:0.12em; text-transform:uppercase; }
        .pace-card-title { margin:0; color:#fff; font-size:clamp(1.15rem,2.1vw,1.65rem); line-height:1.12; }
        .pace-card-copy { margin:0; color:var(--pace-muted); font-size:clamp(0.88rem,1.45vw,1.08rem); line-height:1.42; font-weight:730; white-space:pre-wrap; }
        .pace-support-list { display:grid; gap:8px; margin:0; padding:0; list-style:none; overflow:auto; }
        .pace-support-item { border-left:4px solid var(--pace-accent); background:color-mix(in srgb,var(--pace-base) 64%,transparent); padding:9px 11px; color:#fff; font-size:clamp(0.86rem,1.35vw,1rem); line-height:1.3; font-weight:780; }
        .pace-empty { grid-column:1 / -1; display:grid; place-items:center; border:1px solid var(--pace-line); border-radius:24px; background:color-mix(in srgb,var(--pace-panel) 88%,transparent); text-align:center; padding:40px; }
        .pace-empty h1 { margin:0; max-width:20ch; font-size:clamp(2.4rem,6vw,5.6rem); line-height:1.02; }
        .pace-empty p { margin:15px 0 0; color:var(--pace-muted); font-size:clamp(1rem,2vw,1.35rem); font-weight:720; }
      `}</style>

      <section className="pace-shell">
        <header className="pace-head">
          <div className="pace-identity">
            <p className="pace-kicker">Pace + Support · {lesson?.code || "Big Dog Math"}</p>
            <h1 className="pace-phase">{state?.label || "Waiting for the lesson"}</h1>
          </div>
          {session?.join_code ? (
            <div className="pace-code"><span className="pace-code-label">Join code</span><span className="pace-code-value">{session.join_code}</span></div>
          ) : null}
        </header>

        {loading || !session || !flow || !state ? (
          <section className="pace-empty">
            <div>
              <h1>{loading ? "Connecting to class" : "Ready for class"}</h1>
              <p>{sessionMessage}</p>
            </div>
          </section>
        ) : (
          <>
            <section className="pace-current" aria-label="Current directions and timer">
              <p className="pace-current-label">Current directions</p>
              <h2 className="pace-directions">{state.description}</h2>
              <div className="pace-timer-row">
                <div className={`pace-time ${timer?.finished ? "finished" : ""}`}>{timer ? formatTime(timer.secondsLeft) : "--:--"}</div>
                <p className="pace-timer-state">{timer?.finished ? "Time is up. Wait for the teacher." : timer?.running ? "In progress" : "Ready"}</p>
              </div>
            </section>

            <aside className="pace-side">
              <section className="pace-card">
                <p className="pace-card-label">Next</p>
                <h2 className="pace-card-title">{sequence?.nextLabel || "Lesson closeout"}</h2>
                <p className="pace-card-copy">{sequence?.nextDirections || "Wait for the teacher before changing tasks."}</p>
              </section>

              <section className="pace-card">
                <p className="pace-card-label">Learning intention</p>
                <p className="pace-card-copy">{lesson?.learningIntention || "The learning intention will appear when the lesson is loaded."}</p>
                <p className="pace-card-label">Success criteria</p>
                <p className="pace-card-copy">{lesson?.successCriteria || "The success criteria will appear when the lesson is loaded."}</p>
              </section>

              <section className="pace-card">
                <p className="pace-card-label">Support</p>
                {supportStems.length || supportVocabulary.length ? (
                  <ul className="pace-support-list">
                    {supportStems.map((stem) => <li className="pace-support-item" key={stem}>{stem}</li>)}
                    {supportVocabulary.map((word) => <li className="pace-support-item" key={word}>{word}</li>)}
                  </ul>
                ) : (
                  <p className="pace-card-copy">Use the posted directions. Ask your table, then use the assigned help path.</p>
                )}
              </section>
            </aside>
          </>
        )}
      </section>
    </main>
  );
}
