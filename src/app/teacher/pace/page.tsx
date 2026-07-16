"use client";

import { useEffect, useState, type CSSProperties } from "react";
import ClassroomSpinner from "@/components/ClassroomSpinner";
import { CLOSEOUT_DIRECTIONS } from "@/lib/classStates";
import { CLASSROOM_STAGE_THEMES, classroomStageTheme, discussionSupportsForLesson } from "@/lib/classroomPilot";
import { publicSuccessCriterion } from "@/lib/successCriterion";
import { teacherApiRequest } from "@/lib/teacherApi";
import { LIVE_FLOW_MODE, getStoredTeacherSessionId, liveTimerSeconds, type LiveClassFlowSnapshot } from "@/lib/liveClassFlow";

interface PaceSession {
  id: string;
  period_id?: string;
  status: string;
  join_code: string | null;
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
  const [pollAnswers, setPollAnswers] = useState<PollAnswer[]>([]);

  useEffect(() => {
    let stopped = false;
    let checking = false;
    const requested = requestedSessionId();
    const load = async () => {
      if (checking) return;
      checking = true;
      try {
        const endpoint = requested
          ? `/api/teacher/session?liveSessionId=${encodeURIComponent(requested)}`
          : "/api/teacher/session";
        const result = await teacherApiRequest<{ sessions: PaceSession[] }>(endpoint)
          .catch(() => ({ sessions: [] }));
        const liveSessions = result.sessions.filter((candidate) => candidate.status === "open" && candidate.broadcast === LIVE_FLOW_MODE);
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
      } finally {
        checking = false;
      }
    };
    void load();
    const interval = window.setInterval(load, requested ? 500 : 1000);
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
    const interval = window.setInterval(load, 1_200);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [pollId]);

  const state = flow?.state ?? null;
  const timer = flow?.timer ?? null;
  const timerSeconds = liveTimerSeconds(timer);
  const timerFinished = Boolean(timer?.finished || (timer?.running && timerSeconds <= 0));
  const theme = state?.semantic
    ? CLASSROOM_STAGE_THEMES[state.semantic]
    : classroomStageTheme(state?.id, state?.label);
  const publicSurfacesLinked = flow?.presentation?.publicSurfaceMode === "linked";
  const linkedSpinnerMode = publicSurfacesLinked && state?.id === "learning-target-readers"
    ? "readers"
    : publicSurfacesLinked && state?.id === "ipad-kid"
      ? "ipad"
      : null;
  const spinnerSyncScope = `${flow?.sequence?.currentIndex ?? -1}:${flow?.presentation?.notionStepId || state?.id || "spinner"}`;
  const routineConfig = flow?.presentation?.routineConfig || null;
  const poll = flow?.poll ?? null;
  const phase = flow?.phase ?? null;
  const isLearningCheck = theme.id === "learning-check";
  const isDiscussion = theme.id === "discussion" || Boolean(phase);
  const configuredDiscussionSupports = discussionSupportsForLesson(flow?.lesson?.code);
  const discussionStems = flow?.presentation?.discussionStems?.filter(Boolean).length
    ? flow.presentation.discussionStems
    : phase?.sentenceStems?.filter(Boolean).length
      ? phase.sentenceStems
      : flow?.lesson?.discussionStems?.filter(Boolean).length
        ? flow.lesson.discussionStems
        : configuredDiscussionSupports.sentenceStems;
  const discussionVocabulary = flow?.presentation?.vocabulary?.filter(Boolean).length
    ? flow.presentation.vocabulary
    : phase?.keyVocabulary?.filter(Boolean).length
      ? phase.keyVocabulary
      : flow?.lesson?.discussionVocabulary?.filter(Boolean).length
        ? flow.lesson.discussionVocabulary
        : configuredDiscussionSupports.keyVocabulary;
  const paceDirections = state?.id === "closeout"
    ? CLOSEOUT_DIRECTIONS
    : publicSurfacesLinked
      ? flow?.presentation?.mainDisplay || flow?.presentation?.body || state?.description
      : routineConfig?.kind === "gallery-walk"
        ? routineConfig.movementDirections
        : routineConfig?.kind === "small-group"
          ? `${routineConfig.publicTask} Rotate every ${routineConfig.rotationMinutes} minutes.`
      : flow?.presentation?.paceDirections || state?.description;
  const style = {
    "--pace-accent": theme.accent,
    "--pace-base": theme.projectorBase,
    "--pace-panel": theme.projectorPanel,
    "--pace-line": theme.projectorLine,
    "--pace-muted": theme.projectorMuted,
    "--pace-glow": theme.projectorGlow,
    "--stage-accent": theme.accent,
    "--stage-base": theme.projectorBase,
    "--stage-panel": theme.projectorPanel,
    "--stage-line": theme.projectorLine,
    "--stage-muted": theme.projectorMuted,
    "--stage-glow": theme.projectorGlow,
  } as CSSProperties;

  return (
    <main className="pace-page" style={style}>
      <style>{`
        .pace-page { position:fixed; inset:0; overflow:hidden; box-sizing:border-box; background:radial-gradient(circle at 16% 14%,var(--pace-glow),transparent 38%),radial-gradient(circle at 86% 78%,var(--pace-glow),transparent 36%),var(--pace-base); color:#fff; font-family:var(--bdb-font); padding:clamp(18px,2.5vw,36px); }
        .pace-shell { width:100%; height:100%; display:grid; grid-template-rows:auto minmax(0,1fr); gap:clamp(14px,2vw,24px); }
        .pace-timer { display:flex; align-items:center; justify-content:center; border:1px solid var(--pace-line); border-radius:20px; background:color-mix(in srgb,var(--pace-panel) 94%,transparent); padding:clamp(12px,1.8vw,20px); box-shadow:0 18px 50px rgba(0,0,0,0.24); }
        .pace-time { color:#fff; font-size:clamp(4rem,10vw,8.5rem); font-weight:900; line-height:0.82; font-variant-numeric:tabular-nums; letter-spacing:-0.06em; }
        .pace-time.finished { color:#ffd5dc; }
        .pace-current { min-height:0; display:grid; place-items:center; border:1px solid var(--pace-line); border-radius:24px; background:color-mix(in srgb,var(--pace-panel) 88%,transparent); padding:clamp(30px,6vw,88px); box-shadow:0 28px 70px rgba(0,0,0,0.28); text-align:center; }
        .pace-current.spinner-linked { position:relative; overflow:hidden; padding:0; }
        .pace-current-inner { width:min(100%,1180px); display:grid; gap:18px; justify-items:center; }
        .pace-current-label { margin:0; color:var(--pace-accent); font-size:clamp(0.72rem,1.3vw,0.92rem); font-weight:900; letter-spacing:0.14em; text-transform:uppercase; }
        .pace-directions { margin:0; max-width:28ch; color:#fff; font-size:clamp(2.5rem,6.4vw,6.8rem); line-height:1.02; letter-spacing:-0.035em; text-wrap:balance; white-space:pre-wrap; }
        .pace-check { width:min(100%,1120px); display:grid; align-content:center; gap:20px; }
        .pace-check-title { margin:0; color:var(--pace-accent); font-size:clamp(0.78rem,1.4vw,1rem); font-weight:950; letter-spacing:0.14em; text-transform:uppercase; }
        .pace-check-prompt { margin:0; color:#fff; font-size:clamp(2rem,4.6vw,4.8rem); line-height:1.05; font-weight:900; text-wrap:balance; }
        .pace-check-count { margin:0; color:var(--pace-muted); font-size:clamp(1rem,1.8vw,1.35rem); font-weight:800; }
        .pace-bars { height:min(42vh,330px); display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); align-items:end; gap:clamp(10px,1.8vw,22px); padding-top:20px; }
        .pace-bar-column { height:100%; display:grid; grid-template-rows:minmax(0,1fr) auto; gap:9px; align-items:end; }
        .pace-bar-track { height:100%; display:flex; align-items:flex-end; overflow:hidden; border:1px solid var(--pace-line); border-radius:12px 12px 6px 6px; background:color-mix(in srgb,var(--pace-base) 72%,#000); }
        .pace-bar-fill { width:100%; min-height:4px; border-radius:10px 10px 4px 4px; background:var(--pace-accent); transition:height 240ms ease; }
        .pace-bar-label { color:#fff; text-align:center; font-size:clamp(1rem,2vw,1.5rem); font-weight:950; }
        .pace-discussion { width:min(100%,1180px); display:grid; grid-template-columns:minmax(0,1.25fr) minmax(260px,0.75fr); gap:clamp(14px,2.4vw,26px); text-align:left; }
        .pace-discussion-main { display:grid; align-content:center; gap:12px; }
        .pace-discussion-phase { margin:0; color:var(--pace-accent); font-size:0.78rem; font-weight:950; letter-spacing:0.14em; text-transform:uppercase; }
        .pace-discussion-prompt { margin:0; color:#fff; font-size:clamp(2rem,4.3vw,4.5rem); line-height:1.06; font-weight:900; text-wrap:balance; }
        .pace-share { display:grid; gap:5px; border:1px solid var(--pace-line); border-left:6px solid var(--pace-accent); border-radius:14px; background:color-mix(in srgb,var(--pace-base) 60%,transparent); padding:13px 16px; }
        .pace-share span { color:var(--pace-accent); font-size:0.68rem; font-weight:950; letter-spacing:0.12em; text-transform:uppercase; }
        .pace-share strong { color:#fff; font-size:clamp(1.8rem,4vw,3.8rem); line-height:1; font-weight:950; }
        .pace-discussion-supports { display:grid; align-content:center; gap:12px; }
        .pace-support-card { border:1px solid var(--pace-line); border-top:4px solid var(--pace-accent); border-radius:14px; background:color-mix(in srgb,var(--pace-base) 60%,transparent); padding:14px 16px; }
        .pace-support-card h3 { margin:0 0 8px; color:var(--pace-accent); font-size:0.7rem; font-weight:950; letter-spacing:0.12em; text-transform:uppercase; }
        .pace-support-card ul { display:grid; gap:7px; margin:0; padding-left:1.1rem; color:#fff; font-size:clamp(0.92rem,1.5vw,1.15rem); line-height:1.3; font-weight:760; }
        .pace-vocab { display:flex; flex-wrap:wrap; gap:7px; }
        .pace-vocab span { border:1px solid var(--pace-line); border-radius:999px; background:color-mix(in srgb,var(--pace-panel) 76%,transparent); padding:7px 10px; color:#fff; font-size:0.9rem; font-weight:880; }
        .pace-empty { grid-row:1 / -1; display:grid; place-items:center; border:1px solid var(--pace-line); border-radius:24px; background:color-mix(in srgb,var(--pace-panel) 88%,transparent); text-align:center; padding:40px; }
        .pace-empty h1 { margin:0; max-width:20ch; font-size:clamp(2.4rem,6vw,5.6rem); line-height:1.02; }
        .pace-empty p { margin:15px 0 0; color:var(--pace-muted); font-size:clamp(1rem,2vw,1.35rem); font-weight:720; }
        @media (max-width:760px) { .pace-discussion { grid-template-columns:1fr; } .pace-bars { height:240px; } }
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
            <section className={`pace-current${linkedSpinnerMode ? " spinner-linked" : ""}`} aria-label="Current directions and timer">
              {linkedSpinnerMode ? (
                <ClassroomSpinner
                  key={`${session.id}:${spinnerSyncScope}:mirror`}
                  mode={linkedSpinnerMode}
                  sessionId={session.id}
                  syncKey={session.join_code}
                  periodId={session.period_id || null}
                  stateId={state.id}
                  syncScope={spinnerSyncScope}
                  role="mirror"
                  learningIntention={flow.lesson?.learningIntention}
                  successCriterion={publicSuccessCriterion(flow.lesson?.selectedSuccessCriterion)}
                />
              ) : isLearningCheck && poll ? (
                <div className="pace-check">
                  <p className="pace-check-title">Fist to five</p>
                  {poll.stage === "results" ? (
                    <>
                      <h2 className="pace-check-prompt">Where we are as a class</h2>
                      <div className="pace-bars" aria-label="Anonymous Fist-to-Five results">
                        {["0", "1", "2", "3", "4", "5"].map((choice) => {
                          const count = pollAnswers.filter((answer) => answer.answer === choice).length;
                          const maxCount = Math.max(1, ...["0", "1", "2", "3", "4", "5"].map((value) => pollAnswers.filter((answer) => answer.answer === value).length));
                          return (
                            <div className="pace-bar-column" key={choice}>
                              <div className="pace-bar-track"><div className="pace-bar-fill" style={{ height: `${Math.max(4, Math.round((count / maxCount) * 100))}%` }} /></div>
                              <span className="pace-bar-label">{choice}</span>
                            </div>
                          );
                        })}
                      </div>
                      <p className="pace-check-count">Anonymous class results. {pollAnswers.length} response{pollAnswers.length === 1 ? "" : "s"}.</p>
                    </>
                  ) : (
                    <>
                      <h2 className="pace-check-prompt">Answer on your Chromebook</h2>
                      <p className="pace-check-count">{pollAnswers.length} response{pollAnswers.length === 1 ? "" : "s"} received. Names stay private.</p>
                    </>
                  )}
                </div>
              ) : isDiscussion ? (
                <div className="pace-discussion">
                  <div className="pace-discussion-main">
                    <p className="pace-discussion-phase">{phase?.label || "Discussion"}</p>
                    <h2 className="pace-discussion-prompt">{phase?.subtitle || paceDirections}</h2>
                    {phase?.id === "share" && phase.selectedSharer ? (
                      <div className="pace-share"><span>Ready to share</span><strong>{phase.selectedSharer}</strong></div>
                    ) : null}
                  </div>
                  <div className="pace-discussion-supports">
                    {discussionStems.length ? (
                      <section className="pace-support-card">
                        <h3>Sentence stems</h3>
                        <ul>{discussionStems.slice(0, 3).map((stem) => <li key={stem}>{stem}</li>)}</ul>
                      </section>
                    ) : null}
                    {discussionVocabulary.length ? (
                      <section className="pace-support-card">
                        <h3>Vocabulary</h3>
                        <div className="pace-vocab">{discussionVocabulary.slice(0, 6).map((word) => <span key={word}>{word}</span>)}</div>
                      </section>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="pace-current-inner">
                  <p className="pace-current-label">Current directions</p>
                  <h2 className="pace-directions">{paceDirections}</h2>
                </div>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
