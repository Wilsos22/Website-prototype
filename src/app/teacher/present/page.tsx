"use client";

import { useEffect, useState, type CSSProperties } from "react";
import InkBoard from "@/components/InkBoard";
import { CLASSROOM_STAGE_THEMES, classroomStageTheme } from "@/lib/classroomPilot";
import { teacherApiRequest } from "@/lib/teacherApi";
import { LIVE_FLOW_MODE, getStoredTeacherSessionId, type LiveClassFlowSnapshot } from "@/lib/liveClassFlow";

interface StageSession {
  id: string;
  status: string;
  join_code: string | null;
  started_at: string;
  broadcast: string | null;
  live_flow: LiveClassFlowSnapshot | null;
}

interface PollAnswer {
  id: string;
  answer: string | null;
}

function formatTime(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function toolUrl(flow: LiveClassFlowSnapshot) {
  const tool = flow.tool;
  if (!tool) return null;
  const params = new URLSearchParams({ presentation: "1", prompt: tool.prompt });
  for (const [key, value] of Object.entries(tool.config)) params.set(key, String(value));
  return `${tool.route}?${params.toString()}`;
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

export default function ClassroomStagePage() {
  const [session, setSession] = useState<StageSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionMessage, setSessionMessage] = useState("Connecting to the confirmed class session.");
  const [pollAnswers, setPollAnswers] = useState<PollAnswer[]>([]);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      const result = await teacherApiRequest<{ sessions: StageSession[] }>("/api/teacher/session")
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
  const pollId = flow?.poll?.id ?? null;

  useEffect(() => {
    if (!pollId) {
      setPollAnswers([]);
      return;
    }
    let stopped = false;
    const load = async () => {
      const result = await teacherApiRequest<{ answers: PollAnswer[] }>(
        `/api/teacher/poll?pollId=${encodeURIComponent(pollId)}`,
      ).catch(() => ({ answers: [] }));
      if (!stopped) setPollAnswers(result.answers);
    };
    void load();
    const interval = window.setInterval(load, 1000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [pollId]);

  const state = flow?.state ?? null;
  const timer = flow?.timer ?? null;
  const poll = flow?.poll ?? null;
  const resource = flow?.resource ?? null;
  const presentation = flow?.presentation ?? null;
  const lesson = flow?.lesson ?? null;
  const sequence = flow?.sequence ?? null;
  const theme = state?.semantic
    ? CLASSROOM_STAGE_THEMES[state.semantic]
    : classroomStageTheme(state?.id, state?.label);
  const embeddedResourceUrl = resource?.url.includes("docs.google.com/forms")
    ? `${resource.url}${resource.url.includes("?") ? "&" : "?"}embedded=true`
    : null;
  const liveToolUrl = flow ? toolUrl(flow) : null;
  const style = {
    "--stage-accent": theme.accent,
    "--stage-base": theme.projectorBase,
    "--stage-panel": theme.projectorPanel,
    "--stage-line": theme.projectorLine,
    "--stage-muted": theme.projectorMuted,
    "--stage-glow": theme.projectorGlow,
  } as CSSProperties;

  return (
    <main className="stage-page" style={style}>
      <style>{`
        .stage-page { position:fixed; inset:0; box-sizing:border-box; overflow:hidden; background:radial-gradient(circle at 24% 18%,var(--stage-glow),transparent 38%),radial-gradient(circle at 82% 80%,var(--stage-glow),transparent 36%),var(--stage-base); color:#fff; font-family:var(--bdb-font); padding:clamp(14px,2.2vw,30px); }
        .stage-frame { position:relative; width:100%; height:100%; display:grid; grid-template-rows:minmax(0,1fr) auto; gap:12px; }
        .stage-pill { position:absolute; z-index:4; bottom:96px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:14px; max-width:min(72vw,900px); border:1px solid var(--stage-line); border-radius:999px; background:color-mix(in srgb,var(--stage-panel) 88%,transparent); padding:9px 12px 9px 17px; box-shadow:0 14px 34px rgba(0,0,0,0.24); backdrop-filter:blur(12px); }
        .stage-pill-copy { min-width:0; }
        .stage-kicker { margin:0; color:var(--stage-accent); font-size:0.66rem; font-weight:900; letter-spacing:0.13em; text-transform:uppercase; }
        .stage-title { margin:2px 0 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:clamp(0.92rem,1.65vw,1.25rem); line-height:1.05; font-weight:900; }
        .stage-timer { flex:none; min-width:108px; border-left:1px solid var(--stage-line); padding-left:14px; color:#fff; text-align:center; font-size:clamp(1.65rem,3vw,2.55rem); line-height:0.9; font-weight:900; font-variant-numeric:tabular-nums; letter-spacing:-0.04em; }
        .stage-timer.finished { color:#ffd6dc; }
        .stage-success { position:absolute; z-index:4; top:14px; right:14px; width:min(34vw,440px); border:1px solid var(--stage-line); border-top:4px solid var(--stage-accent); border-radius:16px; background:color-mix(in srgb,var(--stage-panel) 90%,transparent); padding:13px 16px; box-shadow:0 14px 34px rgba(0,0,0,0.22); backdrop-filter:blur(12px); }
        .stage-success-label { margin:0; color:var(--stage-accent); font-size:0.66rem; font-weight:900; letter-spacing:0.12em; text-transform:uppercase; }
        .stage-success-text { margin:6px 0 0; color:#fff; font-size:clamp(0.8rem,1.25vw,1.02rem); line-height:1.32; font-weight:760; }
        .stage-work { position:relative; min-height:0; overflow:hidden; border:1px solid var(--stage-line); border-radius:24px; background:linear-gradient(145deg,color-mix(in srgb,var(--stage-panel) 88%,#000),color-mix(in srgb,var(--stage-base) 92%,#000)); box-shadow:0 30px 80px rgba(0,0,0,0.3); }
        .stage-empty, .stage-directions, .stage-poll, .stage-resource-link { position:absolute; inset:0; display:grid; place-items:center; padding:clamp(34px,6vw,88px); text-align:center; }
        .stage-empty h1 { margin:0; max-width:22ch; color:#fff; font-size:clamp(2.2rem,5.2vw,5.2rem); line-height:1.02; }
        .stage-empty p { margin:14px 0 0; color:var(--stage-muted); font-size:clamp(1rem,2vw,1.4rem); font-weight:700; }
        .stage-directions-inner { width:min(100%,1200px); display:grid; gap:22px; justify-items:center; padding-top:clamp(80px,10vw,128px); }
        .stage-directions h2 { margin:0; max-width:19ch; color:#fff; font-size:clamp(2.8rem,7.4vw,7.4rem); line-height:0.98; letter-spacing:-0.04em; text-wrap:balance; }
        .stage-directions p { margin:0; max-width:54ch; border-left:8px solid var(--stage-accent); background:color-mix(in srgb,var(--stage-base) 58%,transparent); padding:15px 20px; color:var(--stage-muted); text-align:left; white-space:pre-wrap; font-size:clamp(1.15rem,2.5vw,2rem); line-height:1.35; font-weight:760; }
        .stage-resource, .stage-tool { position:absolute; inset:96px 0 0; width:100%; height:calc(100% - 96px); border:0; background:#fff; }
        .stage-resource-link { padding-top:110px; }
        .stage-resource-link a { display:flex; min-height:72px; align-items:center; justify-content:center; border:2px solid var(--stage-accent); border-radius:14px; background:var(--stage-accent); color:#111813; padding:0 30px; text-decoration:none; font-size:1.25rem; font-weight:900; }
        .stage-poll { align-content:center; justify-items:center; gap:26px; padding-top:120px; }
        .stage-question { margin:0; max-width:24ch; color:#fff; font-size:clamp(2.2rem,5.4vw,5.4rem); line-height:1.05; letter-spacing:-0.025em; }
        .stage-response-count { margin:0; color:var(--stage-muted); font-size:clamp(1rem,2.2vw,1.5rem); font-weight:850; }
        .stage-results { width:min(100%,900px); display:grid; gap:13px; }
        .stage-result { display:grid; grid-template-columns:minmax(80px,1fr) minmax(180px,4fr) 60px; align-items:center; gap:14px; color:#fff; font-size:clamp(1rem,2.2vw,1.45rem); font-weight:850; text-align:left; }
        .stage-bar { height:22px; border-radius:999px; background:color-mix(in srgb,var(--stage-panel) 65%,#000); overflow:hidden; }
        .stage-fill { height:100%; border-radius:inherit; background:var(--stage-accent); }
        .stage-bottom { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:20px; min-height:64px; border:1px solid var(--stage-line); border-radius:18px; background:color-mix(in srgb,var(--stage-panel) 88%,transparent); padding:10px 18px; }
        .stage-description { margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--stage-muted); font-size:clamp(0.9rem,1.5vw,1.15rem); font-weight:750; }
        .stage-next { color:var(--stage-accent); font-size:0.72rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
        @media (max-width:900px) { .stage-success { width:40vw; } .stage-pill { max-width:76vw; } }
      `}</style>

      <section className="stage-frame">
        <div className="stage-pill">
          <div className="stage-pill-copy">
            <p className="stage-kicker">{lesson?.code || "Big Dog Math"} · {theme.label}</p>
            <h1 className="stage-title">{presentation?.title || state?.label || "Waiting for the lesson"}</h1>
          </div>
          <div className={`stage-timer ${timer?.finished ? "finished" : ""}`}>{timer ? formatTime(timer.secondsLeft) : "--:--"}</div>
        </div>

        <aside className="stage-success" aria-label="Success criteria">
          <p className="stage-success-label">Success criteria</p>
          <p className="stage-success-text">{lesson?.successCriteria || "Success criteria will appear when the lesson is loaded."}</p>
        </aside>

        <section className="stage-work">
          {loading ? (
            <div className="stage-empty"><div><h1>Connecting to the classroom</h1><p>{sessionMessage}</p></div></div>
          ) : !session || !flow || !state ? (
            <div className="stage-empty"><div><h1>Ready for class</h1><p>{sessionMessage}</p></div></div>
          ) : resource ? (
            embeddedResourceUrl ? <iframe className="stage-resource" src={embeddedResourceUrl} title={resource.label} /> : (
              <div className="stage-resource-link"><a href={resource.url} target="_blank" rel="noreferrer">{resource.label}</a></div>
            )
          ) : poll ? (
            <div className="stage-poll">
              <h2 className="stage-question">{poll.stage === "results" ? "Class Results" : poll.question}</h2>
              {poll.stage === "responding" || poll.kind === "short-answer" ? (
                <p className="stage-response-count">{pollAnswers.length} response{pollAnswers.length === 1 ? "" : "s"} received</p>
              ) : (
                <div className="stage-results">
                  {(poll.choices || []).map((choice) => {
                    const count = pollAnswers.filter((answer) => answer.answer === choice).length;
                    const percent = pollAnswers.length ? Math.round((count / pollAnswers.length) * 100) : 0;
                    return (
                      <div className="stage-result" key={choice}>
                        <span>{poll.kind === "fist-to-five" ? `${choice} / 5` : choice}</span>
                        <div className="stage-bar"><div className="stage-fill" style={{ width: `${percent}%` }} /></div>
                        <span>{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {poll.stage === "results" ? <p className="stage-response-count">{poll.question}</p> : null}
            </div>
          ) : liveToolUrl ? (
            <iframe className="stage-tool" src={liveToolUrl} title={flow.tool?.label || "Lesson tool"} />
          ) : presentation?.mode === "board" ? (
            <InkBoard room={session.id} interactive problem={presentation.body} />
          ) : (
            <div className="stage-directions">
              <div className="stage-directions-inner">
                <h2>{presentation?.title || state.label}</h2>
                <p>{presentation?.body || state.description}</p>
              </div>
            </div>
          )}
        </section>

        <footer className="stage-bottom">
          <p className="stage-description">{lesson?.learningIntention || state?.description || "The current mathematical work stays at the center of the screen."}</p>
          <span className="stage-next">{timer?.finished ? "Time is up · wait for teacher" : sequence?.nextLabel ? `Next: ${sequence.nextLabel}` : "Manual advance"}</span>
        </footer>
      </section>
    </main>
  );
}
