"use client";

import { useEffect, useState, type CSSProperties } from "react";
import ClassroomNamePicker from "@/components/ClassroomNamePicker";
import InkBoard from "@/components/InkBoard";
import RatioBuilder from "@/components/RatioBuilder";
import { teacherApiRequest } from "@/lib/teacherApi";
import { LIVE_FLOW_MODE, type LiveClassFlowSnapshot } from "@/lib/liveClassFlow";

interface StageSession {
  id: string;
  period_id: string | null;
  status: string;
  broadcast: string | null;
  live_flow: LiveClassFlowSnapshot | null;
}

interface PollAnswer {
  id: string;
  answer: string | null;
}

interface RosterStudent {
  periodId: string;
  fullName: string;
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

const RATIO_STAGE_PREVIEW: StageSession = {
  id: "ratio-preview-room",
  period_id: null,
  status: "open",
  broadcast: LIVE_FLOW_MODE,
  live_flow: {
    version: 1,
    updatedAt: new Date().toISOString(),
    state: {
      id: "manip",
      label: "Main Activity - Concrete",
      description: "Students build on paper while the teacher models the same relationship.",
      color: "#50a3a4",
    },
    phase: null,
    timer: { totalSeconds: 300, secondsLeft: 247, running: true, finished: false },
    poll: null,
    resource: null,
    presentation: {
      title: "Main Activity - Concrete",
      body: "Build 3 blue parts for every 2 yellow parts.\nDraw and label the model. Then write one part-to-part ratio and one part-to-whole ratio.",
      mode: "board",
      notionStepId: null,
    },
    tool: null,
    lesson: {
      lessonCode: "M2.T1.L1-D1",
      title: "Ratios Are Everywhere",
      learningIntention: "I can describe a ratio as a comparison of two quantities.",
      successCriteria: "I can build, name, and write part-to-part and part-to-whole ratios.",
    },
    stage: { showGoals: true },
  },
};

const RATIO_PREVIEW_ROSTER = [
  "Avery Brooks",
  "Jordan Lee",
  "Maya Patel",
  "Noah Rivera",
  "Sofia Chen",
  "Eli Morgan",
];

export default function ClassroomStagePage() {
  const [session, setSession] = useState<StageSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [pollAnswers, setPollAnswers] = useState<PollAnswer[]>([]);
  const [rosterNames, setRosterNames] = useState<string[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("preview") === "ratio") {
      setSession({
        ...RATIO_STAGE_PREVIEW,
        live_flow: RATIO_STAGE_PREVIEW.live_flow
          ? {
              ...RATIO_STAGE_PREVIEW.live_flow,
              stage: { showGoals: params.get("goals") !== "0" },
            }
          : null,
      });
      setRosterNames(RATIO_PREVIEW_ROSTER);
      setLoading(false);
      return;
    }
    let stopped = false;
    const load = async () => {
      const result = await teacherApiRequest<{ sessions: StageSession[] }>("/api/teacher/session")
        .catch(() => ({ sessions: [] }));
      const data = result.sessions.find((candidate) => candidate.status === "open" && candidate.broadcast === LIVE_FLOW_MODE) ?? null;
      if (!stopped) {
        setSession((data as StageSession | null) ?? null);
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

  const periodId = session?.period_id ?? null;
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("preview") === "ratio") return;
    if (!periodId) {
      setRosterNames([]);
      return;
    }
    let stopped = false;
    void teacherApiRequest<{ students: RosterStudent[] }>("/api/teacher/roster")
      .then(({ students }) => {
        if (!stopped) setRosterNames(students.filter((student) => student.periodId === periodId).map((student) => student.fullName));
      })
      .catch(() => {
        if (!stopped) setRosterNames([]);
      });
    return () => { stopped = true; };
  }, [periodId]);

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
  const showGoals = Boolean(flow?.stage?.showGoals && lesson);
  const accent = state?.color || "#14b8a6";
  const embeddedResourceUrl = resource?.url.includes("docs.google.com/forms")
    ? `${resource.url}${resource.url.includes("?") ? "&" : "?"}embedded=true`
    : null;
  const liveToolUrl = flow ? toolUrl(flow) : null;
  const ratioBoard = Boolean(
    presentation?.mode === "board"
    && /ratio|blue parts|blue to yellow/i.test(`${presentation.title} ${presentation.body}`),
  );
  const ratioBoardLines = (presentation?.body || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const presenterNeeded = Boolean(
    !showGoals
    && !poll
    && !resource
    && presentation
    && (
      presentation.mode === "board"
      || presentation.mode === "tool"
      || /\b(show|share|present|explain|model|compare|justify|whiteboard)\b/i.test(`${presentation.title} ${presentation.body}`)
    ),
  );

  return (
    <main className="stage-page" style={{ "--stage-accent": accent } as CSSProperties}>
      <style>{`
        .stage-page { position:fixed; inset:0; box-sizing:border-box; display:grid; grid-template-rows:auto minmax(0,1fr) auto; background:#15120d; color:#201e1a; font-family:var(--bdb-font); padding:14px; overflow:hidden; }
        .stage-frame { display:contents; }
        .stage-top { display:grid; grid-template-columns:1fr auto; align-items:center; gap:24px; min-height:78px; border:1px solid #3b3327; border-bottom:none; border-radius:18px 18px 0 0; background:#211c14; color:#fff; padding:10px 18px 10px 24px; }
        .stage-step { min-width:0; }
        .stage-kicker { margin:0 0 3px; color:var(--stage-accent); font-size:0.7rem; font-weight:900; letter-spacing:0.14em; text-transform:uppercase; }
        .stage-title { margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:clamp(1.35rem,3vw,2.35rem); line-height:1.05; font-weight:900; }
        .stage-timer { min-width:148px; text-align:right; color:#fff; font-size:clamp(2.5rem,6vw,4.7rem); line-height:0.9; font-weight:900; font-variant-numeric:tabular-nums; letter-spacing:-0.04em; }
        .stage-work { position:relative; min-height:0; border:1px solid #3b3327; background:#fff; overflow:hidden; }
        .stage-empty { position:absolute; inset:0; display:grid; place-items:center; padding:30px; text-align:center; background:#fbf7ef; }
        .stage-empty h1 { margin:0; max-width:22ch; color:#201e1a; font-size:clamp(2.4rem,6vw,5.8rem); line-height:1.02; }
        .stage-empty p { margin:14px 0 0; color:#766d5f; font-size:clamp(1rem,2vw,1.45rem); font-weight:700; }
        .stage-directions { position:absolute; inset:0; display:grid; place-items:center; padding:clamp(28px,6vw,90px); background:#fbf7ef; }
        .stage-directions-inner { width:min(100%,1100px); display:grid; gap:18px; }
        .stage-directions h2 { margin:0; max-width:20ch; color:#201e1a; font-size:clamp(2.4rem,6.8vw,6.6rem); line-height:1.02; letter-spacing:-0.035em; }
        .stage-directions p { margin:0; max-width:48ch; border-left:8px solid var(--stage-accent); padding-left:22px; color:#4d463b; white-space:pre-wrap; font-size:clamp(1.2rem,2.7vw,2.15rem); line-height:1.35; font-weight:760; }
        .stage-goals { position:absolute; inset:0; display:grid; grid-template-rows:auto minmax(0,1fr) auto; gap:12px; overflow:auto; background:#faf6ee; padding:clamp(18px,2vw,26px); }
        .stage-goals-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; }
        .stage-goals-kicker { margin:0 0 5px; color:var(--stage-accent); font-size:0.72rem; font-weight:900; letter-spacing:0.12em; text-transform:uppercase; }
        .stage-goals-title { margin:0; color:#201e1a; font-size:clamp(1.8rem,3.4vw,3.4rem); line-height:1; letter-spacing:-0.035em; }
        .stage-goals-code { flex:none; border:1px solid #d8cebb; border-radius:999px; background:#fff; color:#766d5f; padding:8px 13px; font-size:0.72rem; font-weight:900; letter-spacing:0.08em; }
        .stage-goals-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; align-items:stretch; }
        .stage-goal-card { min-height:0; display:grid; align-content:center; gap:10px; border:1px solid #d8cebb; border-top:8px solid var(--goal-color); border-radius:18px; background:#fff; padding:clamp(18px,2vw,24px); box-shadow:0 12px 30px rgba(32,30,26,0.08); }
        .stage-goal-label { margin:0; color:var(--goal-color); font-size:0.78rem; font-weight:900; letter-spacing:0.12em; text-transform:uppercase; }
        .stage-goal-copy { margin:0; color:#201e1a; white-space:pre-wrap; font-size:clamp(1.35rem,2.4vw,2.35rem); line-height:1.14; font-weight:860; letter-spacing:-0.02em; }
        .stage-goals-readers { border-top:1px solid #ded4c2; padding-top:12px; }
        .stage-resource, .stage-tool { position:absolute; inset:0; width:100%; height:100%; border:0; background:#fff; }
        .stage-resource-link { position:absolute; inset:0; display:grid; place-items:center; background:#fbf7ef; }
        .stage-resource-link a { display:flex; min-height:72px; align-items:center; justify-content:center; border:2px solid var(--stage-accent); border-radius:14px; background:var(--stage-accent); color:#08211f; padding:0 30px; text-decoration:none; font-size:1.25rem; font-weight:900; }
        .stage-poll { position:absolute; inset:0; display:grid; align-content:center; justify-items:center; gap:26px; padding:clamp(24px,5vw,70px); background:#fbf7ef; text-align:center; }
        .stage-question { margin:0; max-width:24ch; color:#201e1a; font-size:clamp(2rem,5.3vw,5rem); line-height:1.08; letter-spacing:-0.025em; }
        .stage-response-count { margin:0; color:#766d5f; font-size:clamp(1rem,2.2vw,1.5rem); font-weight:850; }
        .stage-poll-context { margin:0; max-width:70ch; color:#5d5549; white-space:pre-wrap; font-size:clamp(0.95rem,1.7vw,1.25rem); line-height:1.35; font-weight:720; }
        .stage-ratio-board { position:absolute; inset:0; display:grid; grid-template-rows:auto minmax(0,1fr); gap:16px; background:#fbf7ef; padding:26px 44px 34px; }
        .stage-ratio-brief { display:grid; grid-template-columns:minmax(0,1.65fr) minmax(300px,0.68fr); gap:30px; align-items:start; }
        .stage-ratio-copy { display:grid; gap:10px; align-content:start; }
        .stage-ratio-copy .stage-kicker { color:var(--stage-accent); }
        .stage-ratio-copy h2 { margin:0; max-width:21ch; color:#201e1a; font-size:clamp(2.1rem,4.4vw,4.7rem); line-height:1.03; letter-spacing:-0.035em; }
        .stage-ratio-copy p { margin:0; max-width:50ch; color:#595145; font-size:clamp(1.05rem,2vw,1.7rem); line-height:1.4; font-weight:740; }
        .stage-ratio-model { border:1px solid #d8cebb; border-radius:16px; background:#fff; padding:16px 18px; }
        .stage-ratio-ink { position:relative; min-height:0; overflow:hidden; border:1px solid #d8cebb; border-radius:16px; background:#fff; }
        .stage-ratio-ink-label { position:absolute; top:14px; left:20px; z-index:2; margin:0; color:#9a9182; font-size:0.72rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; pointer-events:none; }
        .stage-results { width:min(100%,900px); display:grid; gap:13px; }
        .stage-result { display:grid; grid-template-columns:minmax(80px,1fr) minmax(180px,4fr) 60px; align-items:center; gap:14px; font-size:clamp(1rem,2.2vw,1.45rem); font-weight:850; text-align:left; }
        .stage-bar { height:22px; border-radius:999px; background:#e4ddcf; overflow:hidden; }
        .stage-fill { height:100%; border-radius:inherit; background:var(--stage-accent); }
        .stage-bottom { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:20px; min-height:62px; border:1px solid #3b3327; border-top:none; border-radius:0 0 18px 18px; background:#211c14; color:#d8d0c3; padding:8px 20px 8px 24px; }
        .stage-description { margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:clamp(0.9rem,1.6vw,1.2rem); font-weight:750; }
        .stage-status { color:var(--stage-accent); font-size:0.72rem; font-weight:900; letter-spacing:0.12em; text-transform:uppercase; }
        @media (max-width:780px) {
          .stage-goals-grid { grid-template-columns:1fr; }
          .stage-goals-heading { align-items:flex-start; }
        }
      `}</style>

      <section className="stage-frame">
        <header className="stage-top">
          <div className="stage-step">
            <p className="stage-kicker">Big Dog Math Classroom Stage</p>
            <h1 className="stage-title">{showGoals ? lesson?.title || "Today's learning goal" : presentation?.title || state?.label || "Waiting for the lesson"}</h1>
          </div>
          <div className="stage-timer">{timer ? formatTime(timer.secondsLeft) : "--:--"}</div>
        </header>

        <section className="stage-work">
          {loading ? (
            <div className="stage-empty"><div><h1>Connecting to the classroom</h1><p>The stage will update when Live Class Flow opens.</p></div></div>
          ) : !session || !flow || !state ? (
            <div className="stage-empty"><div><h1>Ready for class</h1><p>Start a session and select Live Class Flow.</p></div></div>
          ) : showGoals && lesson ? (
            <section className="stage-goals" aria-label="Learning intention and success criteria">
              <header className="stage-goals-heading">
                <div>
                  <p className="stage-goals-kicker">Today's learning goal</p>
                  <h2 className="stage-goals-title">{lesson.title || "What we are learning"}</h2>
                </div>
                {lesson.lessonCode ? <span className="stage-goals-code">{lesson.lessonCode}</span> : null}
              </header>
              <div className="stage-goals-grid">
                <article className="stage-goal-card" style={{ "--goal-color": "#50a3a4" } as CSSProperties}>
                  <p className="stage-goal-label">Learning intention</p>
                  <p className="stage-goal-copy">{lesson.learningIntention || "Listen for what you will understand by the end of today's lesson."}</p>
                </article>
                <article className="stage-goal-card" style={{ "--goal-color": "#2f9e6f" } as CSSProperties}>
                  <p className="stage-goal-label">Success criteria</p>
                  <p className="stage-goal-copy">{lesson.successCriteria || "Be ready to explain how your work shows the lesson goal."}</p>
                </article>
              </div>
              <div className="stage-goals-readers">
                <ClassroomNamePicker
                  names={rosterNames}
                  labels={["Learning intention reader", "Success criteria reader"]}
                  buttonLabel="Pick both readers"
                />
              </div>
            </section>
          ) : resource ? (
            embeddedResourceUrl ? <iframe className="stage-resource" src={embeddedResourceUrl} title={resource.label} /> : (
              <div className="stage-resource-link"><a href={resource.url} target="_blank" rel="noreferrer">{resource.label}</a></div>
            )
          ) : poll ? (
            <div className="stage-poll">
              <h2 className="stage-question">{poll.stage === "results" ? "Class Results" : poll.question}</h2>
              {state.description ? <p className="stage-poll-context">{state.description}</p> : null}
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
          ) : ratioBoard ? (
            <div className="stage-ratio-board">
              <section className="stage-ratio-brief">
                <div className="stage-ratio-copy">
                  <p className="stage-kicker">Build · Draw · Write</p>
                  <h2>{ratioBoardLines[0] || presentation?.title || state.label}</h2>
                  {ratioBoardLines.slice(1).map((line) => <p key={line}>{line}</p>)}
                </div>
                <aside className="stage-ratio-model">
                  <RatioBuilder compact presentation kicker="Visual model" prompt="3 blue to 2 yellow" />
                </aside>
              </section>
              <section className="stage-ratio-ink">
                <p className="stage-ratio-ink-label">Teacher model · writing from iPad</p>
                <InkBoard room={session.id} interactive={false} problem={null} />
              </section>
            </div>
          ) : presentation?.mode === "board" ? (
            <InkBoard room={session.id} interactive={false} problem={presentation.body} />
          ) : (
            <div className="stage-directions">
              <div className="stage-directions-inner">
                <h2>{presentation?.title || state.label}</h2>
                <p>{presentation?.body || state.description}</p>
              </div>
            </div>
          )}
          {presenterNeeded ? (
            <ClassroomNamePicker
              names={rosterNames}
              labels={["Student presenter"]}
              buttonLabel="Pick a presenter"
              compact
            />
          ) : null}
        </section>

        <footer className="stage-bottom">
          <p className="stage-description">{showGoals ? "Pick two readers, then move into the lesson." : state?.description || "The work stays at the center of the screen."}</p>
          <span className="stage-status">{timer?.finished ? "Time is up" : timer?.running ? "In progress" : "Ready"}</span>
        </footer>
      </section>
    </main>
  );
}
