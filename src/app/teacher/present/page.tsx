"use client";

import { useEffect, useState, type CSSProperties } from "react";
import InkBoard from "@/components/InkBoard";
import { CLASSROOM_STAGE_THEMES, classroomStageTheme, discussionSupportsForLesson } from "@/lib/classroomPilot";
import { teacherApiRequest } from "@/lib/teacherApi";
import { LIVE_FLOW_MODE, getStoredTeacherSessionId, liveTimerSeconds, type LiveClassFlowSnapshot } from "@/lib/liveClassFlow";

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

function halftimeScenario(text: string) {
  const match = text.match(/The\s+(.+?)\s+lead\s+the\s+(.+?)\s+(\d+)\s+(?:to|-)\s+(\d+)\s+at\s+halftime/i);
  if (!match) return null;
  return {
    leadingTeam: match[1].trim(),
    trailingTeam: match[2].trim(),
    leadingScore: match[3],
    trailingScore: match[4],
  };
}

function discussionRounds(text: string) {
  return text
    .split(/(?=Round\s+\d+:)/i)
    .map((line) => line.trim())
    .filter(Boolean);
}

const INDEPENDENT_SECTION_LABELS = [
  "Required Paper Work",
  "Required Digital Work",
  "Due",
  "Turn in",
  "Help path",
  "Optional Support",
  "Challenge",
] as const;

type IndependentSectionLabel = (typeof INDEPENDENT_SECTION_LABELS)[number];

function independentSections(text: string) {
  const content = text.replace(/\r/g, "").trim();
  if (!content) return [];

  const labelsByName = new Map(
    INDEPENDENT_SECTION_LABELS.map((label) => [label.toLowerCase(), label]),
  );
  const labelPattern = /(Required Paper Work|Required Digital Work|Due|Turn in|Help path|Optional Support|Challenge)\s*:\s*/gi;
  const matches = Array.from(content.matchAll(labelPattern));

  if (!matches.length) {
    return [{ label: "Required Paper Work" as IndependentSectionLabel, body: content }];
  }

  const sections = matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? content.length;
    return {
      label: labelsByName.get(match[1].toLowerCase()) ?? "Required Paper Work",
      body: content.slice(start, end).trim().replace(/\n+/g, " "),
    };
  }).filter((section) => section.body);

  const preface = content.slice(0, matches[0].index ?? 0).trim();
  if (preface) {
    const requiredPaper = sections.find((section) => section.label === "Required Paper Work");
    if (requiredPaper) requiredPaper.body = `${preface} ${requiredPaper.body}`;
    else sections.unshift({ label: "Required Paper Work", body: preface });
  }

  return sections;
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
  const timerSeconds = liveTimerSeconds(timer);
  const timerFinished = Boolean(timer?.finished || (timer?.running && timerSeconds <= 0));
  const poll = flow?.poll ?? null;
  const resource = flow?.resource ?? null;
  const presentation = flow?.presentation ?? null;
  const lesson = flow?.lesson ?? null;
  const phase = flow?.phase ?? null;
  const theme = state?.semantic
    ? CLASSROOM_STAGE_THEMES[state.semantic]
    : classroomStageTheme(state?.id, state?.label);
  const showLessonTargets = theme.id === "learning-check";
  const embeddedResourceUrl = resource?.url.includes("docs.google.com/forms")
    ? `${resource.url}${resource.url.includes("?") ? "&" : "?"}embedded=true`
    : null;
  const liveToolUrl = flow ? toolUrl(flow) : null;
  const showBoardPanel = Boolean(session && presentation?.boardOpen && presentation.mode !== "board");
  const slideBody = presentation?.body || state?.description || "";
  const score = theme.id === "scenario" ? halftimeScenario(slideBody) : null;
  const configuredDiscussionSupports = discussionSupportsForLesson(lesson?.code);
  const useRatioDiscussionSupports = Boolean(lesson?.code?.toUpperCase().startsWith("M2.T1.L1"));
  const sentenceStems = useRatioDiscussionSupports
    ? configuredDiscussionSupports.sentenceStems
    : phase?.sentenceStems?.filter(Boolean).length
      ? phase.sentenceStems
      : configuredDiscussionSupports.sentenceStems;
  const keyVocabulary = useRatioDiscussionSupports
    ? configuredDiscussionSupports.keyVocabulary
    : phase?.keyVocabulary?.filter(Boolean).length
      ? phase.keyVocabulary
      : configuredDiscussionSupports.keyVocabulary;
  const rounds = discussionRounds(slideBody);
  const paperSections = theme.id === "independent" ? independentSections(slideBody) : [];
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
        .stage-frame { position:relative; width:100%; height:100%; display:grid; grid-template-rows:auto minmax(0,1fr); gap:12px; }
        .stage-topbar { z-index:4; width:100%; box-sizing:border-box; display:flex; align-items:center; justify-content:space-between; gap:18px; border:1px solid var(--stage-line); border-radius:16px; background:color-mix(in srgb,var(--stage-panel) 94%,transparent); padding:10px 14px 10px 18px; box-shadow:0 12px 28px rgba(0,0,0,0.2); }
        .stage-topbar-copy { min-width:0; }
        .stage-kicker { margin:0; color:var(--stage-accent); font-size:0.66rem; font-weight:900; letter-spacing:0.13em; text-transform:uppercase; }
        .stage-title { margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:clamp(0.92rem,1.65vw,1.25rem); line-height:1.05; font-weight:900; }
        .stage-timer { flex:none; min-width:108px; border-left:1px solid var(--stage-line); padding-left:14px; color:#fff; text-align:center; font-size:clamp(1.65rem,3vw,2.55rem); line-height:0.9; font-weight:900; font-variant-numeric:tabular-nums; letter-spacing:-0.04em; }
        .stage-timer.finished { color:#ffd6dc; }
        .stage-success { position:absolute; z-index:4; top:14px; right:14px; width:min(34vw,440px); border:1px solid var(--stage-line); border-top:4px solid var(--stage-accent); border-radius:16px; background:color-mix(in srgb,var(--stage-panel) 90%,transparent); padding:13px 16px; box-shadow:0 14px 34px rgba(0,0,0,0.22); backdrop-filter:blur(12px); }
        .stage-success-label { margin:0; color:var(--stage-accent); font-size:0.66rem; font-weight:900; letter-spacing:0.12em; text-transform:uppercase; }
        .stage-success-text { margin:6px 0 0; color:#fff; font-size:clamp(0.8rem,1.25vw,1.02rem); line-height:1.32; font-weight:760; }
        .stage-work { position:relative; min-height:0; overflow:hidden; border:1px solid var(--stage-line); border-radius:24px; background:linear-gradient(145deg,color-mix(in srgb,var(--stage-panel) 88%,#000),color-mix(in srgb,var(--stage-base) 92%,#000)); box-shadow:0 30px 80px rgba(0,0,0,0.3); }
        .stage-empty, .stage-directions, .stage-poll, .stage-resource-link { position:absolute; inset:0; display:grid; place-items:center; padding:clamp(34px,6vw,88px); text-align:center; }
        .stage-empty h1 { margin:0; max-width:22ch; color:#fff; font-size:clamp(2.2rem,5.2vw,5.2rem); line-height:1.02; }
        .stage-empty p { margin:14px 0 0; color:var(--stage-muted); font-size:clamp(1rem,2vw,1.4rem); font-weight:700; }
        .stage-directions-inner { width:min(100%,1200px); display:grid; gap:18px; justify-items:center; }
        .stage-directions p { margin:0; max-width:54ch; border-left:8px solid var(--stage-accent); background:color-mix(in srgb,var(--stage-base) 58%,transparent); padding:15px 20px; color:var(--stage-muted); text-align:left; white-space:pre-wrap; font-size:clamp(1.15rem,2.5vw,2rem); line-height:1.35; font-weight:760; }
        .stage-resource, .stage-tool { position:absolute; inset:0; width:100%; height:100%; border:0; background:#fff; }
        .stage-resource-link { padding-top:clamp(34px,6vw,88px); }
        .stage-resource-link a { display:flex; min-height:72px; align-items:center; justify-content:center; border:2px solid var(--stage-accent); border-radius:14px; background:var(--stage-accent); color:#111813; padding:0 30px; text-decoration:none; font-size:1.25rem; font-weight:900; }
        .stage-poll { align-content:center; justify-items:center; gap:26px; padding-top:120px; }
        .stage-question { margin:0; max-width:24ch; color:#fff; font-size:clamp(2.2rem,5.4vw,5.4rem); line-height:1.05; letter-spacing:-0.025em; }
        .stage-response-count { margin:0; color:var(--stage-muted); font-size:clamp(1rem,2.2vw,1.5rem); font-weight:850; }
        .stage-learning { margin:0; max-width:62ch; color:var(--stage-muted); font-size:clamp(1rem,1.8vw,1.35rem); line-height:1.35; font-weight:780; }
        .stage-results { width:min(100%,900px); display:grid; gap:13px; }
        .stage-result { display:grid; grid-template-columns:minmax(80px,1fr) minmax(180px,4fr) 60px; align-items:center; gap:14px; color:#fff; font-size:clamp(1rem,2.2vw,1.45rem); font-weight:850; text-align:left; }
        .stage-bar { height:22px; border-radius:999px; background:color-mix(in srgb,var(--stage-panel) 65%,#000); overflow:hidden; }
        .stage-fill { height:100%; border-radius:inherit; background:var(--stage-accent); }
        .stage-score-scene { position:absolute; inset:0; display:grid; grid-template-columns:minmax(330px,0.78fr) minmax(0,1.22fr); align-items:center; gap:clamp(28px,5vw,72px); padding:clamp(34px,6vw,82px); }
        .stage-scoreboard { display:grid; grid-template-columns:1fr 1fr; gap:12px; border:1px solid var(--stage-line); border-radius:22px; background:color-mix(in srgb,var(--stage-panel) 94%,#000); padding:18px; box-shadow:0 22px 56px rgba(0,0,0,0.28); }
        .stage-scoreboard-label { grid-column:1 / -1; margin:0; border-bottom:1px solid var(--stage-line); padding:0 4px 12px; color:var(--stage-accent); text-align:center; font-size:0.72rem; font-weight:950; letter-spacing:0.16em; text-transform:uppercase; }
        .stage-team { min-width:0; display:grid; justify-items:center; gap:8px; border:1px solid var(--stage-line); border-radius:16px; background:color-mix(in srgb,var(--stage-base) 74%,#000); padding:18px 12px; }
        .stage-team span { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--stage-muted); font-size:clamp(0.78rem,1.4vw,1rem); font-weight:900; letter-spacing:0.08em; text-transform:uppercase; }
        .stage-team strong { color:#fff; font-size:clamp(4.8rem,10vw,9rem); line-height:0.86; font-variant-numeric:tabular-nums; letter-spacing:-0.06em; }
        .stage-score-copy { display:grid; gap:20px; align-content:center; }
        .stage-score-copy h2 { margin:0; max-width:12ch; color:#fff; font-size:clamp(3rem,6.7vw,7rem); line-height:0.95; letter-spacing:-0.045em; text-wrap:balance; }
        .stage-score-copy p { margin:0; max-width:46ch; border-left:8px solid var(--stage-accent); padding:14px 0 14px 20px; color:var(--stage-muted); font-size:clamp(1.1rem,2.2vw,1.8rem); line-height:1.38; font-weight:780; }
        .stage-discussion { position:absolute; inset:0; display:grid; grid-template-columns:minmax(0,1.35fr) minmax(300px,0.65fr); gap:clamp(18px,3vw,36px); padding:clamp(28px,4.2vw,58px); }
        .stage-discussion-main { min-width:0; display:grid; align-content:center; gap:14px; }
        .stage-discussion-main h2 { margin:0 0 6px; color:#fff; font-size:clamp(2.1rem,4.7vw,4.8rem); line-height:1; letter-spacing:-0.035em; }
        .stage-round { margin:0; border-left:6px solid var(--stage-accent); background:color-mix(in srgb,var(--stage-panel) 72%,transparent); padding:11px 15px; color:#fff; font-size:clamp(1rem,1.65vw,1.35rem); line-height:1.32; font-weight:780; }
        .stage-supports { min-height:0; display:grid; grid-template-rows:auto auto; align-content:center; gap:14px; }
        .stage-support-card { min-width:0; border:1px solid var(--stage-line); border-top:4px solid var(--stage-accent); border-radius:16px; background:color-mix(in srgb,var(--stage-panel) 90%,transparent); padding:15px 17px; }
        .stage-support-title { margin:0 0 9px; color:var(--stage-accent); font-size:0.68rem; font-weight:950; letter-spacing:0.12em; text-transform:uppercase; }
        .stage-stems { display:grid; gap:7px; margin:0; padding:0; list-style:none; }
        .stage-stems li { color:#fff; font-size:clamp(0.78rem,1.25vw,0.98rem); line-height:1.28; font-weight:760; }
        .stage-vocabulary { display:flex; flex-wrap:wrap; gap:7px; }
        .stage-word { border:1px solid var(--stage-line); border-radius:999px; background:color-mix(in srgb,var(--stage-base) 72%,transparent); padding:6px 9px; color:#fff; font-size:clamp(0.72rem,1.1vw,0.88rem); font-weight:850; }
        .stage-independent { position:absolute; inset:0; display:grid; place-items:center; padding:clamp(22px,3.4vw,48px); }
        .stage-independent-grid { width:min(100%,1240px); max-height:100%; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; align-content:center; }
        .stage-independent-card { min-width:0; border:1px solid var(--stage-line); border-top:4px solid var(--stage-accent); border-radius:16px; background:color-mix(in srgb,var(--stage-panel) 90%,transparent); padding:14px 17px; box-shadow:0 14px 34px rgba(0,0,0,0.16); }
        .stage-independent-card.required-paper-work,
        .stage-independent-card.help-path,
        .stage-independent-card.required-digital-work { grid-column:1 / -1; }
        .stage-independent-label { margin:0 0 7px; color:var(--stage-accent); font-size:0.68rem; font-weight:950; letter-spacing:0.12em; text-transform:uppercase; }
        .stage-independent-body { margin:0; color:#fff; font-size:clamp(0.98rem,1.55vw,1.3rem); line-height:1.3; font-weight:760; }
        .stage-independent-card.required-paper-work .stage-independent-body { font-size:clamp(1.08rem,1.9vw,1.55rem); }
        .stage-work.board-open .stage-empty,
        .stage-work.board-open .stage-directions,
        .stage-work.board-open .stage-poll,
        .stage-work.board-open .stage-resource-link,
        .stage-work.board-open .stage-score-scene,
        .stage-work.board-open .stage-discussion,
        .stage-work.board-open .stage-independent { right:42%; }
        .stage-work.board-open .stage-resource,
        .stage-work.board-open .stage-tool { width:58%; }
        .stage-work.board-open .stage-success { right:calc(42% + 14px); width:min(27vw,360px); }
        .stage-work.board-open .stage-directions p { font-size:clamp(1rem,1.8vw,1.45rem); }
        .stage-work.board-open .stage-score-scene { grid-template-columns:1fr; gap:18px; padding:24px; }
        .stage-work.board-open .stage-score-copy h2 { font-size:clamp(2rem,4vw,3.8rem); }
        .stage-work.board-open .stage-team strong { font-size:clamp(3.5rem,7vw,6rem); }
        .stage-work.board-open .stage-discussion { grid-template-columns:1fr; overflow:auto; }
        .stage-work.board-open .stage-independent { overflow:auto; padding:18px; }
        .stage-work.board-open .stage-independent-grid { grid-template-columns:1fr; align-content:start; }
        .stage-work.board-open .stage-independent-card { grid-column:1; }
        .stage-board-panel { position:absolute; z-index:5; inset:0 0 0 auto; width:42%; overflow:hidden; border-left:5px solid var(--stage-accent); background:#fff; box-shadow:-18px 0 40px rgba(0,0,0,0.28); }
        @media (max-width:900px) { .stage-success { width:40vw; } .stage-score-scene, .stage-discussion { grid-template-columns:1fr; overflow:auto; } }
        @media (max-height:650px) {
          .stage-page { padding:10px; }
          .stage-frame { gap:8px; }
          .stage-topbar { border-radius:12px; padding:7px 12px; }
          .stage-title { font-size:0.9rem; }
          .stage-timer { min-width:94px; padding-left:12px; font-size:1.7rem; }
          .stage-work { border-radius:18px; }
          .stage-empty, .stage-directions, .stage-poll, .stage-resource-link { padding:20px; }
          .stage-directions p { max-width:68ch; padding:11px 15px; font-size:clamp(1rem,1.75vw,1.3rem); line-height:1.28; }
          .stage-score-scene { grid-template-columns:minmax(270px,0.8fr) minmax(0,1.2fr); gap:24px; padding:22px; }
          .stage-scoreboard { gap:8px; padding:12px; }
          .stage-scoreboard-label { padding-bottom:8px; }
          .stage-team { gap:5px; padding:10px 8px; }
          .stage-team strong { font-size:4.5rem; }
          .stage-score-copy { gap:12px; }
          .stage-score-copy h2 { font-size:2.7rem; }
          .stage-score-copy p { padding:9px 0 9px 15px; font-size:1.05rem; line-height:1.28; }
          .stage-discussion { gap:14px; padding:18px; }
          .stage-discussion-main { gap:8px; }
          .stage-discussion-main h2 { margin-bottom:2px; font-size:2.1rem; }
          .stage-round { padding:8px 11px; font-size:0.9rem; line-height:1.24; }
          .stage-supports { gap:8px; }
          .stage-support-card { padding:10px 12px; }
          .stage-support-title { margin-bottom:6px; }
          .stage-stems { gap:4px; }
          .stage-stems li { font-size:0.72rem; line-height:1.2; }
          .stage-vocabulary { gap:5px; }
          .stage-word { padding:4px 7px; font-size:0.68rem; }
          .stage-independent { padding:16px; }
          .stage-independent-grid { gap:8px; }
          .stage-independent-card { border-radius:12px; padding:9px 12px; }
          .stage-independent-label { margin-bottom:5px; font-size:0.6rem; }
          .stage-independent-body,
          .stage-independent-card.required-paper-work .stage-independent-body { font-size:0.94rem; line-height:1.22; }
        }
      `}</style>

      <section className="stage-frame">
        <div className="stage-topbar">
          <div className="stage-topbar-copy">
            <h1 className="stage-title">{presentation?.title || state?.label || "Waiting for the lesson"}</h1>
          </div>
          <div className={`stage-timer ${timerFinished ? "finished" : ""}`}>{timer ? formatTime(timerSeconds) : "--:--"}</div>
        </div>

        <section className={`stage-work${showBoardPanel ? " board-open" : ""}`}>
          {showLessonTargets && !resource ? (
            <aside className="stage-success" aria-label="Success criteria">
              <p className="stage-success-label">Success criteria</p>
              <p className="stage-success-text">{lesson?.successCriteria || "Success criteria will appear when the lesson is loaded."}</p>
            </aside>
          ) : null}
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
              {showLessonTargets && lesson?.learningIntention ? <p className="stage-learning">{lesson.learningIntention}</p> : null}
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
          ) : score ? (
            <section className="stage-score-scene" aria-label="Halftime score problem">
              <div className="stage-scoreboard" aria-label={`${score.leadingTeam} ${score.leadingScore}, ${score.trailingTeam} ${score.trailingScore} at halftime`}>
                <p className="stage-scoreboard-label">Halftime</p>
                <div className="stage-team"><span>{score.leadingTeam}</span><strong>{score.leadingScore}</strong></div>
                <div className="stage-team"><span>{score.trailingTeam}</span><strong>{score.trailingScore}</strong></div>
              </div>
              <div className="stage-score-copy">
                <h2>What could the final score be?</h2>
                <p>{slideBody}</p>
              </div>
            </section>
          ) : theme.id === "discussion" ? (
            <section className="stage-discussion" aria-label="Discussion prompt and supports">
              <div className="stage-discussion-main">
                <p className="stage-kicker">{phase?.label || "Three two-minute rounds"}</p>
                <h2>{phase?.subtitle || "Discuss, justify, and revise"}</h2>
                {(rounds.length ? rounds : [slideBody]).map((round) => <p className="stage-round" key={round}>{round}</p>)}
              </div>
              <aside className="stage-supports">
                <section className="stage-support-card">
                  <p className="stage-support-title">Sentence stems</p>
                  <ul className="stage-stems">{sentenceStems.map((stem) => <li key={stem}>{stem}</li>)}</ul>
                </section>
                <section className="stage-support-card">
                  <p className="stage-support-title">Key vocabulary</p>
                  <div className="stage-vocabulary">{keyVocabulary.map((word) => <span className="stage-word" key={word}>{word}</span>)}</div>
                </section>
              </aside>
            </section>
          ) : theme.id === "independent" ? (
            <section className="stage-independent" aria-label="Independent paper work directions">
              <div className="stage-independent-grid">
                {paperSections.map((section) => (
                  <article
                    className={`stage-independent-card ${section.label.toLowerCase().replaceAll(" ", "-")}`}
                    key={section.label}
                  >
                    <p className="stage-independent-label">{section.label}</p>
                    <p className="stage-independent-body">{section.body}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <div className="stage-directions">
              <div className="stage-directions-inner">
                {showLessonTargets && lesson?.learningIntention ? <p className="stage-learning">{lesson.learningIntention}</p> : null}
                <p>{slideBody}</p>
              </div>
            </div>
          )}
          {showBoardPanel && session ? (
            <aside className="stage-board-panel" aria-label="Live writing workspace">
              <InkBoard room={session.id} interactive={false} />
            </aside>
          ) : null}
        </section>

      </section>
    </main>
  );
}
