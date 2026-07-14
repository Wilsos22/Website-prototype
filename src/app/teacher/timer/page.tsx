"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { teacherApiRequest } from "@/lib/teacherApi";
import { LIVE_FLOW_MODE, type LiveClassFlowSnapshot } from "@/lib/liveClassFlow";

interface TimerSession {
  id: string;
  status: string;
  broadcast: string | null;
  live_flow: LiveClassFlowSnapshot | null;
}

function formatTime(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const TIMER_PREVIEW: TimerSession = {
  id: "timer-preview-room",
  status: "open",
  broadcast: LIVE_FLOW_MODE,
  live_flow: {
    version: 1,
    updatedAt: new Date().toISOString(),
    state: {
      id: "tool-ratio-builder",
      label: "Main Activity: Representational",
      description: "Build and compare a part-to-part and part-to-whole ratio.",
      color: "#4d8df6",
    },
    phase: null,
    timer: { totalSeconds: 300, secondsLeft: 247, running: true, finished: false },
    poll: null,
    resource: null,
    presentation: null,
    lesson: {
      lessonCode: "M2.T1.L1-D1",
      title: "Ratios Are Everywhere",
      learningIntention: "I can describe a ratio as a comparison of two quantities.",
      successCriteria: "I can build, name, and write part-to-part and part-to-whole ratios.",
    },
    stage: { showGoals: false },
    tool: null,
  },
};

export default function TeacherTimerDisplayPage() {
  const [session, setSession] = useState<TimerSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("preview") === "ratio") {
      setSession(TIMER_PREVIEW);
      setLoading(false);
      return;
    }
    let stopped = false;
    const load = async () => {
      const result = await teacherApiRequest<{ sessions: TimerSession[] }>("/api/teacher/session")
        .catch(() => ({ sessions: [] }));
      const current = result.sessions.find((candidate) => candidate.status === "open" && candidate.broadcast === LIVE_FLOW_MODE) ?? null;
      if (!stopped) {
        setSession(current);
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
  const timer = flow?.timer ?? null;
  const state = flow?.state ?? null;
  const accent = timer?.finished ? "#f95335" : state?.color || "#50a3a4";
  const progress = timer && timer.totalSeconds > 0
    ? Math.max(0, Math.min(100, (timer.secondsLeft / timer.totalSeconds) * 100))
    : 0;

  return (
    <main className="td-page" style={{ "--td-accent": accent } as CSSProperties}>
      <style>{`
        .td-page { position:fixed; inset:0; box-sizing:border-box; display:grid; grid-template-rows:auto minmax(0,1fr) auto; gap:28px; overflow:hidden; background:#0d0b08; color:#fff; padding:clamp(28px,4vw,64px); font-family:var(--bdb-font); }
        .td-head { display:flex; align-items:flex-start; justify-content:space-between; gap:28px; }
        .td-kicker { margin:0 0 8px; color:var(--td-accent); font-size:clamp(0.72rem,1.2vw,1rem); font-weight:900; letter-spacing:0.16em; text-transform:uppercase; }
        .td-state { margin:0; max-width:22ch; color:#fff; font-size:clamp(1.6rem,3.4vw,3.6rem); line-height:1.02; letter-spacing:-0.03em; }
        .td-code { flex:none; border:1px solid #3b3327; border-radius:999px; background:#18130d; color:#bdb3a4; padding:9px 14px; font-size:0.75rem; font-weight:900; letter-spacing:0.08em; }
        .td-center { min-height:0; display:grid; place-items:center; align-content:center; gap:28px; }
        .td-time { color:#fff; font-size:clamp(9rem,29vw,26rem); line-height:0.72; font-weight:900; font-variant-numeric:tabular-nums; letter-spacing:-0.07em; text-shadow:0 0 52px color-mix(in srgb,var(--td-accent) 23%,transparent); }
        .td-track { width:min(88vw,1200px); height:18px; overflow:hidden; border:1px solid #3a3228; border-radius:999px; background:#211b13; }
        .td-fill { height:100%; border-radius:inherit; background:var(--td-accent); transition:width 300ms linear; }
        .td-foot { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:end; gap:28px; border-top:1px solid #332b21; padding-top:20px; }
        .td-lesson { margin:0 0 5px; color:#fff; font-size:clamp(1.1rem,2vw,1.75rem); font-weight:900; }
        .td-direction { margin:0; max-width:65ch; color:#aca193; font-size:clamp(0.9rem,1.4vw,1.2rem); line-height:1.35; font-weight:720; }
        .td-status { color:var(--td-accent); font-size:clamp(0.76rem,1.2vw,1rem); font-weight:900; letter-spacing:0.14em; text-transform:uppercase; }
        .td-waiting { color:#fff; font-size:clamp(2.5rem,7vw,7rem); line-height:1; font-weight:900; text-align:center; }
      `}</style>

      <header className="td-head">
        <div>
          <p className="td-kicker">Big Dog Math live timer</p>
          <h1 className="td-state">{state?.label || (loading ? "Connecting" : "Ready for class")}</h1>
        </div>
        {flow?.lesson?.lessonCode ? <span className="td-code">{flow.lesson.lessonCode}</span> : null}
      </header>

      <section className="td-center" aria-label="Live class countdown">
        {timer ? (
          <>
            <div className="td-time" aria-live="polite">{formatTime(timer.secondsLeft)}</div>
            <div className="td-track" aria-label={`${Math.round(progress)} percent of time remaining`}>
              <div className="td-fill" style={{ width: `${progress}%` }} />
            </div>
          </>
        ) : <div className="td-waiting">Waiting for the lesson timer</div>}
      </section>

      <footer className="td-foot">
        <div>
          <p className="td-lesson">{flow?.lesson?.title || "Classroom timer"}</p>
          <p className="td-direction">{state?.description || "Start Live Class Flow to send the current lesson stage and countdown here."}</p>
        </div>
        <span className="td-status">{timer?.finished ? "Time is up" : timer?.running ? "In progress" : "Ready"}</span>
      </footer>
    </main>
  );
}
