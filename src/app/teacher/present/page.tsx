"use client";

import { useEffect, useState, type CSSProperties } from "react";
import ClassroomSpinner from "@/components/ClassroomSpinner";
import InkBoard from "@/components/InkBoard";
import LessonVisual from "@/components/LessonVisual";
import ScreenInkOverlay from "@/components/ScreenInkOverlay";
import { CLOSEOUT_DIRECTIONS } from "@/lib/classStates";
import { CLASSROOM_STAGE_THEMES, classroomStageTheme, discussionSupportsForLesson } from "@/lib/classroomPilot";
import { normalizeDiscussionPhaseSnapshot } from "@/lib/discussionProtocol";
import { resolveLessonVisual } from "@/lib/lessonVisuals";
import { publicSuccessCriterion } from "@/lib/successCriterion";
import { teacherApiRequest } from "@/lib/teacherApi";
import {
  LIVE_FLOW_MODE,
  getStoredTeacherSessionId,
  liveTimerSeconds,
  type AbbieBroadcast,
  type LiveClassFlowSnapshot,
  type TeacherRemoteCommand,
} from "@/lib/liveClassFlow";
import { WARM_ACCENTS } from "@/lib/warmNotebook";

interface StageSession {
  id: string;
  period_id: string;
  status: string;
  join_code: string | null;
  started_at: string;
  broadcast: string | null;
  live_flow: LiveClassFlowSnapshot | null;
  remote_command: TeacherRemoteCommand | null;
  abbie: AbbieBroadcast | null;
}

interface PollAnswer {
  id: string;
  answer: string | null;
}

function formatTime(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// The slide renders its own designed title now, so a body authored as
// "We Do: build it" does not say the title twice. Strips any leading
// occurrence of the given titles (and the bare phase words) plus separator.
function stripSlideTitlePrefix(body: string, ...titles: Array<string | undefined>) {
  let out = (body || "").trim();
  for (const candidate of [...titles, "we do", "i do"]) {
    const title = (candidate || "").trim();
    if (!title) continue;
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`^${escaped}\\s*[:\\-]\\s*`, "i"), "").trim();
  }
  return out;
}

// ?preview=<stage id> renders the shell with sample content and no session -
// the way to check the projector skin without starting Live Class Flow.
const PREVIEW_SAMPLES: Record<string, { label: string; headline: string; direction: string; anchor?: string }> = {
  evergreen: {
    label: "Warm-up",
    headline: "Complete today's warm-up",
    direction: "Warm-up first, on your Chromebook. Then think about the problem up here.",
    anchor: "A concert venue is splitting its floor into a standing area and a VIP section. The floor is 6 rows by 28 squares. Where would you put the dividing line - and how could you prove the two sections still add up to the whole floor?",
  },
  scenario: { label: "Launch", headline: "___ + ___ = 27", direction: "Think silently. Tell your partner one sum." },
  concrete: { label: "Concrete", headline: "Build it with counters", direction: "Make the groups on your desk." },
  representational: { label: "Representational", headline: "Make it with tiles", direction: "Build, then write what you built." },
  abstract: { label: "Abstract", headline: "Three ways to write it", direction: "Same relationship, three notations." },
  "learning-check": { label: "Learning check", headline: "Fist-to-Five", direction: "Show 0-5 on your Chromebook. Only I see your number." },
  discussion: { label: "Discussion", headline: "Round 1", direction: "The ratio is ___ because ___." },
  independent: { label: "Independent", headline: "Practice 1-6", direction: "Solve on paper. Due end of class." },
  exit: { label: "Exit ticket", headline: "One question", direction: "Turn it in on your Chromebook." },
  closeout: { label: "Closeout", headline: "Before tomorrow", direction: "Pack up. Paper in the tray." },
};

function previewStageParam() {
  try {
    return new URLSearchParams(window.location.search).get("preview")?.trim() || null;
  } catch {
    return null;
  }
}

// The glass sheet pairs by ink room, same defaulting as /ipad and /board.
// ?embed=1 marks the copy rendered INSIDE the iPad's Write-on-screen mirror,
// which must not mount its own overlay (the iPad draws the ink itself).
function inkOverlayParams() {
  try {
    const p = new URLSearchParams(window.location.search);
    return { room: p.get("room")?.trim() || "main", embed: p.get("embed") === "1" };
  } catch {
    return { room: "main", embed: false };
  }
}

// Transition buffer states: the room changing state is the activity, so time
// is the hero - the vibe word, the movement directions, a huge countdown, a
// draining bar, and what comes next. The music from the classroom laptop is
// the audible version of the same clock.
const TRANSITION_PREVIEWS: Record<string, { vibe: string; accent: string; directions: string; seconds: number; total: number; next: string }> = {
  "transition-hustle": { vibe: "Hustle", accent: "#f95335", directions: "Move now. Materials away, next spot, eyes up before the music ends.", seconds: 42, total: 60, next: "Independent Paper Work" },
  "transition-reset": { vibe: "Reset", accent: "#fcaf38", directions: "Reset the room: new groups, new materials, new station. Set up and seated before the music ends.", seconds: 84, total: 120, next: "Small Group Rotations" },
  "transition-settle": { vibe: "Settle", accent: "#50a3a4", directions: "Bring it down. Voices off, seats found, breathe. Ready to focus when the music ends.", seconds: 31, total: 60, next: "Exit Ticket" },
};

function TransitionScene({ vibe, directions, seconds, total, next }: {
  vibe: string; directions: string; seconds: number; total: number; next: string | null;
}) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (seconds / total) * 100)) : 0;
  return (
    <section className="stage-transition" aria-label={`Transition: ${vibe}`}>
      <p className="stage-transition-kicker">Transition</p>
      <h2 className="stage-transition-vibe">{vibe}</h2>
      <p className="stage-transition-directions">{directions}</p>
      <div className="stage-transition-clock">{formatTime(seconds)}</div>
      <div className="stage-transition-bar" aria-hidden="true"><div style={{ width: `${pct}%` }} /></div>
      {next ? <p className="stage-transition-next">Up next: <strong>{next}</strong></p> : null}
    </section>
  );
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

const INDEPENDENT_SECTION_LABELS = [
  "Required Paper Work",
  "Required Digital Work",
  "Due and Turn In",
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
  const labelPattern = /(Required Paper Work|Required Digital Work|Due and Turn In|Due|Turn in|Help path|Optional Support|Challenge)\s*:\s*/gi;
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

function structuredWorkSections(
  lesson: NonNullable<LiveClassFlowSnapshot["lesson"]> | null,
) {
  if (!lesson) return [];
  const sections: Array<{ label: IndependentSectionLabel; body: string }> = [
    { label: "Required Paper Work", body: lesson.requiredPaperWork || "" },
    { label: "Required Digital Work" as IndependentSectionLabel, body: lesson.requiredDigitalWork || "" },
    { label: "Due and Turn In" as IndependentSectionLabel, body: lesson.dueAndTurnIn || "" },
    { label: "Help path" as IndependentSectionLabel, body: lesson.helpPath || "" },
    { label: "Optional Support", body: lesson.optionalSupport || "" },
    { label: "Challenge", body: lesson.bigDogChallenge || "" },
  ];
  return sections.filter((section) => section.body.trim());
}

export default function ClassroomStagePage() {
  const [session, setSession] = useState<StageSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionMessage, setSessionMessage] = useState("Connecting to the confirmed class session.");
  const [pollAnswers, setPollAnswers] = useState<PollAnswer[]>([]);
  const [previewStage, setPreviewStage] = useState<string | null>(null);
  const [inkOverlay, setInkOverlay] = useState<{ room: string; embed: boolean } | null>(null);
  const [overrideUrl, setOverrideUrl] = useState<string | null>(null);
  const [overrideFrame, setOverrideFrame] = useState<HTMLIFrameElement | null>(null);
  // Room-tunable text size: A- / A+ scale the whole content stage so every
  // layout stays proportional. Persisted per device - set it once for the
  // projector and it sticks.
  const [textScale, setTextScale] = useState(1);

  useEffect(() => {
    setPreviewStage(previewStageParam());
    setInkOverlay(inkOverlayParams());
    try {
      const stored = Number(localStorage.getItem("bdm-present-textscale"));
      if (stored >= 1 && stored <= 2.5) setTextScale(stored);
    } catch { /* ignore */ }
  }, []);

  const adjustTextScale = (delta: number) => {
    setTextScale((current) => {
      const next = Math.min(2.5, Math.max(1, Math.round((current + delta) * 1000) / 1000));
      try { localStorage.setItem("bdm-present-textscale", String(next)); } catch { /* ignore */ }
      return next;
    });
  };

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
        const result = await teacherApiRequest<{ sessions: StageSession[] }>(endpoint)
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
  const phase = normalizeDiscussionPhaseSnapshot(flow?.phase);
  const theme = state?.semantic
    ? CLASSROOM_STAGE_THEMES[state.semantic]
    : classroomStageTheme(state?.id, state?.label);
  const showReaderSpinner = state?.id === "learning-target-readers";
  const showIpadKidSpinner = state?.id === "ipad-kid";
  const routineConfig = presentation?.routineConfig || null;
  const spinnerSyncScope = `${flow?.sequence?.currentIndex ?? -1}:${presentation?.notionStepId || state?.id || "spinner"}`;
  // Same reason: the target belongs to the two reveal states, not to every state
  // that borrows their accent.
  const showLessonTargets = state?.id === "learning-target-readers" || state?.id === "learning-check";
  // Colour and content are separate concerns. Several states share the
  // learning-check THEME for its accent (question, poll, fist-to-five), but only
  // the dedicated learning-check STATE renders the bare learning-target view.
  // Keying this off the theme would make a readiness question display the
  // learning intention instead of its own question.
  const isLearningCheck = state?.id === "learning-check";
  const isTransition = Boolean(state?.id?.startsWith("transition"));
  // Ad-hoc "Transition now": the interlude overlay trumps every other view
  // while the room moves; the paused state returns when it clears.
  const interlude = flow?.interlude || null;
  const interludeSeconds = interlude
    ? Math.max(0, Math.round((Date.parse(interlude.endsAt) - Date.now()) / 1000))
    : 0;
  const selectedCriterion = publicSuccessCriterion(lesson?.selectedSuccessCriterion);
  const embeddedResourceUrl = resource?.url.includes("docs.google.com/forms")
    ? `${resource.url}${resource.url.includes("?") ? "&" : "?"}embedded=true`
    : null;
  const embeddedAssignedToolUrl = presentation?.responseMode?.trim().toLowerCase() === "assigned tool"
    && resource?.url.startsWith("/")
    ? resource.url
    : null;
  const liveToolUrl = flow ? toolUrl(flow) : null;
  const showBoardPanel = Boolean(session && presentation?.boardOpen && presentation.mode !== "board");
  const slideBody = theme.id === "closeout"
    ? CLOSEOUT_DIRECTIONS
    : presentation?.mainDisplay || presentation?.body || state?.description || "";
  // The anchor problem: posed while warm-ups run, answered at closeout. The
  // lesson earns the payoff line by teaching the concept in between.
  const anchorText = flow?.lesson?.anchorProblem?.trim() || "";
  const anchorMode = anchorText && state?.id === "warmup"
    ? "pose" as const
    : anchorText && theme.id === "closeout"
      ? "payoff" as const
      : null;
  // The phase name is a designed title built into the slide; the directions
  // below it stay in the working font (Steele, 7/22).
  const slideTitle = (presentation?.title || state?.label || "").trim();
  const strippedBody = stripSlideTitlePrefix(slideBody, slideTitle, state?.label);
  const activeSequenceStep = flow?.sequence?.steps?.[flow.sequence.currentIndex] || null;
  const lessonVisual = flow ? resolveLessonVisual({
    lessonCode: lesson?.code || activeSequenceStep?.lessonCode,
    stateId: theme.id,
    text: slideBody,
    fallbackTexts: [
      activeSequenceStep?.mainDisplay || "",
      activeSequenceStep?.description || "",
      presentation?.body || "",
      activeSequenceStep?.question || "",
    ],
    contextSteps: flow.sequence?.steps?.map((step) => ({
      stateId: step.semantic || step.stateId,
      text: step.mainDisplay || step.description || step.question || step.paperTask,
    })),
    currentStepIndex: flow.sequence?.currentIndex,
  }) : null;
  const configuredDiscussionSupports = discussionSupportsForLesson(lesson?.code);
  const sentenceStems = presentation?.discussionStems?.filter(Boolean).length
    ? presentation.discussionStems
    : lesson?.discussionStems?.filter(Boolean).length
      ? lesson.discussionStems
      : phase?.sentenceStems?.filter(Boolean).length
        ? phase.sentenceStems
        : configuredDiscussionSupports.sentenceStems;
  const keyVocabulary = presentation?.vocabulary?.filter(Boolean).length
    ? presentation.vocabulary
    : lesson?.discussionVocabulary?.filter(Boolean).length
      ? lesson.discussionVocabulary
      : phase?.keyVocabulary?.filter(Boolean).length
        ? phase.keyVocabulary
        : configuredDiscussionSupports.keyVocabulary;
  const structuredSections = structuredWorkSections(lesson);
  const paperSections = theme.id === "independent"
    ? structuredSections.length ? structuredSections : independentSections(slideBody)
    : [];
  const assignedToolActive = presentation?.responseMode?.trim().toLowerCase() === "assigned tool";

  // Hand-built screen override: when public/screens/<lessonCode>/<stateId>.html
  // exists, it IS this state's screen - Steele built it on purpose. The live
  // snapshot still fills any data-slot text the file kept; slots he deleted
  // stay exactly as he wrote them. Board and Abbie overlays still stack on top.
  const overrideLessonCode = (lesson?.code || activeSequenceStep?.lessonCode || "").trim();
  const overrideStateId = state?.id?.trim() || "";
  useEffect(() => {
    if (!overrideLessonCode || !overrideStateId) {
      setOverrideUrl(null);
      return;
    }
    let stopped = false;
    const url = `/screens/${encodeURIComponent(overrideLessonCode)}/${encodeURIComponent(overrideStateId)}.html`;
    fetch(url, { method: "HEAD" })
      .then((res) => {
        if (!stopped) setOverrideUrl(res.ok ? url : null);
      })
      .catch(() => {
        if (!stopped) setOverrideUrl(null);
      });
    return () => {
      stopped = true;
    };
  }, [overrideLessonCode, overrideStateId]);

  const overrideHeadline = (presentation?.mainDisplay || presentation?.body || "").split(/\n+/)[0] || "";
  const overrideDirection = (presentation?.mainDisplay || presentation?.body || "")
    .split(/\n+/).slice(1).join(" ").trim();
  const overrideTimerText = timer ? formatTime(timerSeconds) : "";
  useEffect(() => {
    if (!overrideFrame) return;
    const doc = overrideFrame.contentDocument;
    if (!doc) return;
    const fill = (slot: string, value: string) => {
      if (!value) return;
      doc.querySelectorAll(`[data-slot="${slot}"]`).forEach((el) => {
        if (el.textContent !== value) el.textContent = value;
      });
    };
    fill("state", state?.label || "");
    fill("topic", presentation?.title || lesson?.title || "");
    fill("code", lesson?.code || "");
    fill("headline", overrideHeadline);
    fill("direction", overrideDirection);
    fill("timer", overrideTimerText);
  }, [overrideFrame, state?.label, presentation?.title, lesson?.title, lesson?.code, overrideHeadline, overrideDirection, overrideTimerText]);
  const showPollPanel = Boolean(poll && (theme.id === "learning-check" || poll.stage === "results" || !presentation?.mainDisplay));
  const showResourcePanel = Boolean(
    resource
    && !showPollPanel
    && assignedToolActive
    && resource.url.startsWith("/")
    && !["discussion", "independent", "closeout"].includes(theme.id),
  );
  const previewSample = !session && !loading && previewStage
    ? PREVIEW_SAMPLES[previewStage] || PREVIEW_SAMPLES[classroomStageTheme(previewStage).id] || null
    : null;
  const previewTheme = previewStage ? classroomStageTheme(previewStage) : null;
  const activeThemeId = previewSample && previewTheme ? previewTheme.id : theme.id;
  // The Warm Notebook stage: paper ground, one semantic accent. The dark
  // projector* values in the theme belong to surfaces not yet refit.
  // Transition buffers carry their own vibe color instead of a theme accent.
  // Same precedence as previewSample: an explicit preview only wins when no
  // real session holds the projector.
  const transitionPreview = !session && !loading && previewStage
    ? TRANSITION_PREVIEWS[previewStage] || null
    : null;
  const accent = interlude
    ? interlude.color
    : transitionPreview
      ? transitionPreview.accent
      : isTransition && state?.color
        ? state.color
        : WARM_ACCENTS[activeThemeId] || theme.accent;
  const style = {
    "--acc": accent,
  } as CSSProperties;

  // One key per on-stage moment. When it changes, the scene re-enters with a
  // rise-and-fade and the accent sweep redraws - so every state change is a
  // visible scene change, not a hard swap. Repeating the same state at a new
  // sequence index still counts as a new moment.
  const sceneKey = interlude
    ? `interlude:${interlude.endsAt}`
    : previewSample
    ? `preview:${previewStage}`
    : loading || !session || !flow || !state
      ? "idle"
      : `${state.id}:${flow.sequence?.currentIndex ?? -1}`;

  return (
    <main className="stage-page" style={style}>
      <style>{`
        /* Warm Notebook skin (Design canvas turn 12): warm dotted paper, ink
           text, one semantic accent per state via --acc. Derived tones:
           --acc-deep darkens the accent enough to read as text on paper. */
        .stage-page { position:fixed; inset:0; box-sizing:border-box; overflow:hidden;
          --ink:#201E1A; --head:#2E4A54; --soft:#5C6E75; --faint:#8A9299; --hair:#E3D9C2; --card:#fff;
          --acc-deep:color-mix(in srgb, var(--acc) 62%, #201E1A);
          background-color:#F3F0E7;
          background-image:radial-gradient(circle,#CBC4B2 1px,transparent 1.3px);
          background-size:18px 18px;
          color:var(--ink); font-family:var(--bdb-font);
          --stage-ease:cubic-bezier(0.2,0.7,0.2,1); }
        .stage-frame { position:relative; z-index:1; width:100%; height:100%; display:grid; grid-template-rows:66px minmax(0,1fr); }
        /* Scene change: each lesson state enters as its own moment - a calm
           rise-and-fade for the content and a thin sweep of the incoming
           state's accent drawing across the top. Keyed remount restarts both. */
        .stage-scene { position:absolute; inset:0; animation:sceneEnter 520ms var(--stage-ease) both; }
        .stage-sweep { position:absolute; z-index:7; inset:0 0 auto 0; height:5px; background:var(--acc); transform-origin:left; pointer-events:none;
          animation:sceneSweep 760ms var(--stage-ease) both; }
        @keyframes sceneEnter { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:none; } }
        @keyframes sceneSweep { 0% { transform:scaleX(0); opacity:1; } 62% { transform:scaleX(1); opacity:1; } 100% { transform:scaleX(1); opacity:0; } }
        .stage-chip, .stage-dot { transition:background-color 420ms ease; }
        .stage-timer::before { transition:background-color 420ms ease; }
        @media (prefers-reduced-motion:reduce) {
          .stage-scene, .stage-sweep, .stage-anchor-kicker, .stage-anchor-rule, .stage-anchor-text,
          .stage-anchor-direction, .stage-anchor-note { animation:none !important; }
        }
        .stage-topbar { z-index:8; width:100%; box-sizing:border-box; display:flex; align-items:center; gap:13px; border-bottom:1px solid rgba(120,110,90,0.18); padding:0 32px; background:rgba(243,240,231,0.86); }
        .stage-mark { display:none; }
        .stage-dot { width:12px; height:12px; flex:none; border-radius:3px; background:var(--acc); }
        .stage-chip { flex:none; border-radius:6px; background:var(--acc); color:#fff; padding:5px 11px; font-size:0.66rem; font-weight:800; letter-spacing:0.1em; text-transform:uppercase; }
        .stage-topbar-copy { min-width:0; display:flex; align-items:baseline; gap:12px; }
        .stage-kicker { margin:0; color:var(--acc-deep); font-size:0.66rem; font-weight:900; letter-spacing:0.13em; text-transform:uppercase; }
        .stage-title { margin:0; overflow:hidden; color:var(--head); text-overflow:ellipsis; white-space:nowrap; font-size:17px; line-height:1.05; font-weight:800; }
        .stage-lesson { margin:0; overflow:hidden; color:var(--faint); text-overflow:ellipsis; white-space:nowrap; font-size:13px; font-weight:650; }
        .stage-timer { min-width:128px; flex:none; display:inline-flex; align-items:center; justify-content:center; gap:10px; margin-left:auto; border:1.2px solid var(--hair); border-radius:999px; background:var(--card); padding:8px 18px; color:var(--head); text-align:center; font-size:25px; line-height:0.9; font-weight:800; font-variant-numeric:tabular-nums; letter-spacing:-0.02em; box-shadow:0 2px 10px rgba(40,32,20,0.06); }
        .stage-timer::before { content:""; width:8px; height:8px; border-radius:999px; background:var(--acc); }
        .stage-timer.finished { color:#A82C15; }
        .stage-timer.finished::before { background:#F95335; }
        .stage-textbtns { display:inline-flex; gap:6px; margin-left:12px; }
        .stage-textbtn { min-width:40px; min-height:30px; border:1.2px solid var(--hair); border-radius:8px; background:var(--card); color:var(--head); font:inherit; font-size:0.78rem; font-weight:800; cursor:pointer; }
        .stage-textbtn:hover:not(:disabled) { border-color:var(--acc); }
        .stage-textbtn:disabled { opacity:0.4; cursor:default; }
        .stage-success { position:absolute; z-index:4; top:14px; right:14px; width:min(34vw,440px); border:1px solid var(--hair); border-top:4px solid var(--acc); border-radius:16px; background:var(--card); padding:13px 16px; box-shadow:0 12px 32px rgba(40,32,20,0.10); }
        .stage-success-label { margin:0; color:var(--acc-deep); font-size:0.66rem; font-weight:900; letter-spacing:0.12em; text-transform:uppercase; }
        .stage-success-text { margin:6px 0 0; color:var(--ink); font-size:clamp(0.8rem,1.25vw,1.02rem); line-height:1.32; font-weight:700; }
        .stage-work { position:relative; min-height:0; overflow:hidden; }
        .stage-override { position:absolute; inset:0; z-index:3; width:100%; height:100%; border:0; background:#F3F0E7; }
        .stage-empty, .stage-directions, .stage-poll, .stage-resource-link { position:absolute; inset:0; display:grid; place-items:center; padding:clamp(34px,6vw,88px); text-align:center; }
        .stage-empty h1 { margin:0; max-width:22ch; color:var(--head); font-size:clamp(2.2rem,5.2vw,5.2rem); line-height:1.02; font-weight:800; letter-spacing:-0.02em; }
        .stage-empty p { margin:14px 0 0; color:var(--soft); font-size:clamp(1rem,2vw,1.4rem); font-weight:700; }
        .stage-directions-inner { width:min(100%,1500px); display:grid; gap:22px; justify-items:center; }
        .stage-main-prompt { margin:0; max-width:92%; color:var(--head); text-align:center; white-space:pre-wrap; font-size:clamp(3.1rem,6.3vw,6.9rem); line-height:1.08; font-weight:800; letter-spacing:-0.02em; text-wrap:balance; }
        .stage-action-chip { border-radius:999px; background:var(--acc); color:#fff; padding:9px 20px; font-size:clamp(0.72rem,1.1vw,0.9rem); font-weight:800; letter-spacing:0.1em; text-transform:uppercase; }
        .stage-slide-title { display:grid; justify-items:center; gap:11px; }
        .stage-slide-title h2 { margin:0; color:var(--head); text-align:center; font-size:clamp(2.1rem,4.4vw,4.4rem); line-height:1; font-weight:800; letter-spacing:-0.025em; }
        .stage-slide-rule { width:clamp(56px,6vw,96px); height:6px; border-radius:999px; background:var(--acc); }
        .stage-main-prompt.with-title { color:var(--ink); font-size:clamp(1.5rem,3vw,3rem); line-height:1.22; font-weight:700; letter-spacing:-0.01em; }
        .stage-area-figure { width:min(100%,620px); }
        .stage-board-scene { position:absolute; inset:0; display:grid; grid-template-rows:auto minmax(0,1fr); }
        .stage-band { display:flex; align-items:center; gap:14px; border-bottom:1px solid var(--hair); background:rgba(243,240,231,0.92); padding:10px 28px; }
        .stage-band-rule { width:34px; height:6px; flex:none; border-radius:999px; background:var(--acc); }
        .stage-band h2 { margin:0; overflow:hidden; color:var(--head); text-overflow:ellipsis; white-space:nowrap; font-size:clamp(1.15rem,2.1vw,1.9rem); font-weight:800; letter-spacing:-0.01em; }
        .stage-board-wrap { position:relative; min-height:0; }
        .stage-figure-float { position:absolute; z-index:4; top:14px; right:14px; width:min(30vw,380px); pointer-events:none;
          border:1px solid var(--hair); border-top:4px solid var(--acc); border-radius:16px; background:var(--card); padding:12px 14px 10px; box-shadow:0 12px 32px rgba(40,32,20,0.10); }
        .stage-anchor-kicker { margin:0; color:var(--acc-deep); font-size:clamp(0.78rem,1.3vw,1rem); font-weight:900; letter-spacing:0.16em; text-transform:uppercase;
          animation:hookRise 560ms 180ms var(--stage-ease) both; }
        .stage-anchor-rule { width:clamp(64px,7vw,110px); height:6px; border-radius:999px; background:var(--acc); transform-origin:center;
          animation:hookRule 640ms 480ms var(--stage-ease) both, hookBreathe 4.6s 2.2s ease-in-out infinite; }
        .stage-anchor-text { font-size:clamp(1.9rem,3.6vw,3.8rem); line-height:1.16; max-width:30ch;
          animation:hookRise 680ms 640ms var(--stage-ease) both; }
        .stage-anchor-text.long { font-size:clamp(1.5rem,2.6vw,2.7rem); max-width:44ch; }
        .stage-anchor-direction { animation:hookRise 560ms 1150ms var(--stage-ease) both; }
        .stage-anchor-note { margin:0; max-width:70ch; border-top:1px solid var(--hair); padding-top:14px; color:var(--soft); font-size:clamp(0.9rem,1.4vw,1.1rem); line-height:1.4; font-weight:650; white-space:pre-wrap;
          animation:hookRise 560ms 1500ms var(--stage-ease) both; }
        @keyframes hookRise { from { opacity:0; transform:translateY(22px); } to { opacity:1; transform:none; } }
        @keyframes hookRule { from { transform:scaleX(0); } to { transform:scaleX(1); } }
        @keyframes hookBreathe { 0%, 100% { opacity:1; } 50% { opacity:0.55; } }
        /* Transition buffer: time is the hero. Vibe word, movement directions,
           a huge countdown, a draining bar timed to the music, and up next. */
        .stage-transition { position:absolute; inset:0; display:grid; align-content:center; justify-items:center; gap:clamp(8px,1.6vw,18px); padding:clamp(30px,5vw,80px); text-align:center; }
        .stage-transition-kicker { margin:0; color:var(--acc-deep); font-size:clamp(0.78rem,1.3vw,1rem); font-weight:900; letter-spacing:0.16em; text-transform:uppercase; }
        .stage-transition-vibe { margin:0; color:var(--head); font-size:clamp(3rem,7vw,7.5rem); line-height:0.95; font-weight:800; letter-spacing:-0.03em; }
        .stage-transition-directions { margin:0; max-width:36ch; color:var(--soft); font-size:clamp(1.1rem,2.2vw,1.8rem); line-height:1.35; font-weight:700; text-wrap:balance; }
        .stage-transition-clock { margin-top:clamp(4px,1vw,12px); color:var(--acc-deep); font-size:clamp(4.4rem,11vw,10rem); line-height:0.9; font-weight:800; font-variant-numeric:tabular-nums; letter-spacing:-0.04em; }
        .stage-transition-bar { width:min(100%,880px); height:14px; overflow:hidden; border:1px solid var(--hair); border-radius:999px; background:#ECE7DD; }
        .stage-transition-bar > div { height:100%; border-radius:inherit; background:var(--acc); transition:width 1s linear; }
        .stage-transition-next { margin:clamp(2px,0.8vw,10px) 0 0; color:var(--soft); font-size:clamp(1rem,1.9vw,1.5rem); font-weight:700; }
        .stage-transition-next strong { color:var(--ink); font-weight:800; }
        .stage-routine { position:absolute; inset:0; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:clamp(12px,2vw,22px); align-content:center; padding:clamp(24px,4vw,60px); }
        .stage-routine article { display:grid; align-content:center; gap:8px; min-height:120px; border:1px solid var(--hair); border-top:5px solid var(--acc); border-radius:16px; background:var(--card); padding:clamp(16px,2.4vw,28px); box-shadow:0 2px 10px rgba(40,32,20,0.06); }
        .stage-routine .stage-routine-lead { grid-column:1 / -1; min-height:100px; grid-template-columns:1fr auto; align-items:end; }
        .stage-routine p { margin:0; color:var(--acc-deep); font-size:0.72rem; font-weight:900; letter-spacing:0.13em; text-transform:uppercase; }
        .stage-routine h2 { margin:0; color:var(--head); font-size:clamp(2.2rem,4.5vw,4.7rem); line-height:0.95; font-weight:800; }
        .stage-routine span { color:var(--soft); font-size:clamp(1rem,1.7vw,1.35rem); font-weight:700; }
        .stage-routine strong { color:var(--ink); font-size:clamp(1.15rem,2.25vw,1.8rem); line-height:1.28; text-wrap:balance; }
        .stage-routine.small-group { grid-template-columns:minmax(240px,0.7fr) minmax(0,1.3fr); }
        .stage-routine.small-group .stage-routine-lead { grid-column:auto; }
        .stage-targets { position:absolute; inset:0; display:grid; align-content:center; justify-items:center; gap:clamp(20px,3.5vw,38px); padding:clamp(34px,6vw,88px); text-align:center; }
        .stage-targets-label { margin:0; color:var(--acc-deep); font-size:clamp(0.72rem,1.25vw,0.95rem); font-weight:900; letter-spacing:0.15em; text-transform:uppercase; }
        .stage-targets-intention { margin:0; max-width:28ch; color:var(--head); font-size:clamp(2rem,4.8vw,5rem); line-height:1.04; font-weight:800; letter-spacing:-0.03em; text-wrap:balance; }
        .stage-targets-criterion { width:min(100%,980px); display:grid; grid-template-columns:auto minmax(0,1fr); align-items:center; gap:16px; border:1px solid var(--hair); border-left:7px solid var(--acc); border-radius:16px; background:var(--card); padding:clamp(16px,2.3vw,25px); color:var(--ink); text-align:left; box-shadow:0 12px 32px rgba(40,32,20,0.10); }
        .stage-targets-check { display:grid; place-items:center; min-width:58px; height:42px; border:2px solid var(--acc); border-radius:12px; color:var(--acc-deep); padding:0 8px; font-size:0.7rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; }
        .stage-targets-criterion strong { font-size:clamp(1.25rem,2.6vw,2.3rem); line-height:1.2; }
        .stage-resource, .stage-tool { position:absolute; inset:0; width:100%; height:100%; border:0; background:#fff; }
        .stage-resource-link { padding-top:clamp(34px,6vw,88px); }
        .stage-resource-link a { display:flex; min-height:72px; align-items:center; justify-content:center; border-radius:14px; background:var(--acc); color:#fff; padding:0 30px; text-decoration:none; font-size:1.25rem; font-weight:800; box-shadow:0 4px 16px rgba(40,32,20,0.14); }
        .stage-lesson-visual { position:absolute; inset:0; display:grid; place-items:center; padding:clamp(30px,5vw,72px); }
        .stage-poll { align-content:center; justify-items:center; gap:26px; padding-top:120px; }
        .stage-question { margin:0; max-width:24ch; color:var(--head); font-size:clamp(2.2rem,5.4vw,5.4rem); line-height:1.05; font-weight:800; letter-spacing:-0.02em; }
        .stage-response-count { margin:0; color:var(--soft); font-size:clamp(1rem,2.2vw,1.5rem); font-weight:800; }
        .stage-learning { margin:0; max-width:62ch; color:var(--soft); font-size:clamp(1rem,1.8vw,1.35rem); line-height:1.35; font-weight:700; }
        .stage-results { width:min(100%,900px); display:grid; gap:13px; }
        .stage-result { display:grid; grid-template-columns:minmax(80px,1fr) minmax(180px,4fr) 60px; align-items:center; gap:14px; color:var(--ink); font-size:clamp(1rem,2.2vw,1.45rem); font-weight:800; text-align:left; }
        .stage-bar { height:22px; border-radius:999px; background:#ECE7DD; border:1px solid var(--hair); overflow:hidden; }
        .stage-fill { height:100%; border-radius:inherit; background:var(--acc); }
        .stage-score-scene { position:absolute; inset:0; display:grid; grid-template-columns:minmax(330px,0.78fr) minmax(0,1.22fr); align-items:center; gap:clamp(28px,5vw,72px); padding:clamp(34px,6vw,82px); }
        .stage-scoreboard { display:grid; grid-template-columns:1fr 1fr; gap:12px; border:1px solid var(--hair); border-radius:22px; background:var(--card); padding:18px; box-shadow:0 12px 32px rgba(40,32,20,0.10); }
        .stage-scoreboard-label { grid-column:1 / -1; margin:0; border-bottom:1px solid var(--hair); padding:0 4px 12px; color:var(--acc-deep); text-align:center; font-size:0.72rem; font-weight:900; letter-spacing:0.16em; text-transform:uppercase; }
        .stage-team { min-width:0; display:grid; justify-items:center; gap:8px; border:1px solid var(--hair); border-radius:16px; background:#F6F3EC; padding:18px 12px; }
        .stage-team span { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--soft); font-size:clamp(0.78rem,1.4vw,1rem); font-weight:900; letter-spacing:0.08em; text-transform:uppercase; }
        .stage-team strong { color:var(--head); font-size:clamp(4.8rem,10vw,9rem); line-height:0.86; font-variant-numeric:tabular-nums; letter-spacing:-0.06em; }
        .stage-score-copy { display:grid; gap:20px; align-content:center; }
        .stage-score-copy h2 { margin:0; max-width:12ch; color:var(--head); font-size:clamp(3rem,6.7vw,7rem); line-height:0.95; font-weight:800; letter-spacing:-0.04em; text-wrap:balance; }
        .stage-score-copy p { margin:0; max-width:46ch; border-left:8px solid var(--acc); padding:14px 0 14px 20px; color:var(--soft); font-size:clamp(1.1rem,2.2vw,1.8rem); line-height:1.38; font-weight:700; }
        .stage-discussion { position:absolute; inset:0; display:grid; grid-template-columns:minmax(0,1.35fr) minmax(300px,0.65fr); gap:clamp(18px,3vw,36px); padding:clamp(28px,4.2vw,58px); }
        .stage-discussion-main { min-width:0; display:grid; align-content:center; gap:14px; }
        .stage-share-callout { width:min(100%,720px); display:grid; gap:6px; border:1px solid var(--hair); border-left:7px solid var(--acc); border-radius:16px; background:var(--card); padding:16px 20px; box-shadow:0 2px 10px rgba(40,32,20,0.06); }
        .stage-share-callout span { color:var(--acc-deep); font-size:0.7rem; font-weight:900; letter-spacing:0.13em; text-transform:uppercase; }
        .stage-share-callout strong { color:var(--head); font-size:clamp(2.2rem,5vw,5rem); line-height:1; font-weight:800; }
        .stage-discussion-main h2 { margin:0 0 6px; color:var(--head); font-size:clamp(2.1rem,4.7vw,4.8rem); line-height:1; font-weight:800; letter-spacing:-0.03em; }
        .stage-round { margin:0; border-left:6px solid var(--acc); background:var(--card); padding:11px 15px; color:var(--ink); font-size:clamp(1rem,1.65vw,1.35rem); line-height:1.32; font-weight:700; box-shadow:0 2px 10px rgba(40,32,20,0.05); }
        .stage-supports { min-height:0; display:grid; grid-template-rows:auto auto; align-content:center; gap:14px; }
        .stage-support-card { min-width:0; border:1px solid var(--hair); border-top:4px solid var(--acc); border-radius:16px; background:var(--card); padding:15px 17px; box-shadow:0 2px 10px rgba(40,32,20,0.06); }
        .stage-support-title { margin:0 0 9px; color:var(--acc-deep); font-size:0.68rem; font-weight:900; letter-spacing:0.12em; text-transform:uppercase; }
        .stage-stems { display:grid; gap:7px; margin:0; padding:0; list-style:none; }
        .stage-stems li { color:var(--ink); font-size:clamp(0.78rem,1.25vw,0.98rem); line-height:1.28; font-weight:700; }
        .stage-vocabulary { display:flex; flex-wrap:wrap; gap:7px; }
        .stage-word { border:1px solid var(--hair); border-radius:999px; background:#F6F3EC; padding:6px 9px; color:var(--ink); font-size:clamp(0.72rem,1.1vw,0.88rem); font-weight:800; }
        .stage-independent { position:absolute; inset:0; display:grid; place-items:center; padding:clamp(22px,3.4vw,48px); }
        .stage-independent-grid { width:min(100%,1240px); max-height:100%; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; align-content:center; }
        .stage-independent-card { min-width:0; border:1px solid var(--hair); border-top:4px solid var(--acc); border-radius:16px; background:var(--card); padding:14px 17px; box-shadow:0 2px 10px rgba(40,32,20,0.06); }
        .stage-independent-card.required-paper-work,
        .stage-independent-card.help-path,
        .stage-independent-card.required-digital-work { grid-column:1 / -1; }
        .stage-independent-label { margin:0 0 7px; color:var(--acc-deep); font-size:0.68rem; font-weight:900; letter-spacing:0.12em; text-transform:uppercase; }
        .stage-independent-body { margin:0; color:var(--ink); font-size:clamp(0.98rem,1.55vw,1.3rem); line-height:1.3; font-weight:700; }
        .stage-independent-card.required-paper-work .stage-independent-body { font-size:clamp(1.08rem,1.9vw,1.55rem); }
        .stage-work.board-open .stage-empty,
        .stage-work.board-open .stage-directions,
        .stage-work.board-open .stage-poll,
        .stage-work.board-open .stage-resource-link,
        .stage-work.board-open .stage-lesson-visual,
        .stage-work.board-open .stage-score-scene,
        .stage-work.board-open .stage-discussion,
        .stage-work.board-open .stage-routine,
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
        .stage-work.board-open .classroom-spinner { right:42%; }
        .stage-board-panel { position:absolute; z-index:5; inset:0 0 0 auto; width:42%; overflow:hidden; border-left:5px solid var(--acc); background:#fff; box-shadow:-18px 0 40px rgba(40,32,20,0.16); }
        .stage-abbie { position:absolute; z-index:12; left:50%; bottom:20px; width:min(88%,860px); box-sizing:border-box; display:grid; grid-template-columns:auto minmax(0,1fr); gap:14px; align-items:center;
          transform:translateX(-50%); border:1px solid #2b5e54; border-left:7px solid #5eead4; border-radius:18px; background:#0d1f1b; padding:16px 20px; box-shadow:0 22px 60px rgba(0,0,0,0.48); }
        .stage-abbie-mark { width:50px; height:50px; display:grid; place-items:center; overflow:hidden; border-radius:50%; background:#14241f; }
        .stage-abbie-mark img { width:44px; height:44px; object-fit:contain; }
        .stage-abbie-name { margin:0 0 3px; color:#5eead4; font-size:0.7rem; font-weight:950; letter-spacing:0.12em; text-transform:uppercase; }
        .stage-abbie-line { margin:0; color:#f3fffb; font-size:clamp(1rem,2vw,1.45rem); font-weight:820; line-height:1.3; }
        @media (max-width:900px) { .stage-success { width:40vw; } .stage-score-scene, .stage-discussion { grid-template-columns:1fr; overflow:auto; } }
        @media (max-height:650px) {
          .stage-frame { grid-template-rows:54px minmax(0,1fr); }
          .stage-topbar { padding:0 18px; }
          .stage-mark { width:28px; height:28px; }
          .stage-title { font-size:0.9rem; }
          .stage-lesson { font-size:0.72rem; }
          .stage-timer { min-width:112px; padding:6px 13px; font-size:1.35rem; }
          .stage-empty, .stage-directions, .stage-poll, .stage-resource-link { padding:20px; }
          .stage-main-prompt { font-size:clamp(2.2rem,5.4vw,4rem); }
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
          <span className="stage-dot" aria-hidden="true" />
          <span className="stage-chip">{interlude ? `Transition - ${interlude.label}` : transitionPreview ? `Transition - ${transitionPreview.vibe}` : previewSample ? previewSample.label : state?.label || "Big Dog Math"}</span>
          <div className="stage-topbar-copy">
            <h1 className="stage-title">{previewSample ? "Preview" : presentation?.title || state?.label || "Waiting for the lesson"}</h1>
            {lesson?.title ? <p className="stage-lesson">{lesson.title}{lesson.code ? ` · ${lesson.code}` : ""}</p> : null}
          </div>
          <span className="stage-textbtns" aria-label="Text size">
            <button className="stage-textbtn" type="button" onClick={() => adjustTextScale(-0.25)} disabled={textScale <= 1} aria-label="Smaller text">A-</button>
            <button className="stage-textbtn" type="button" onClick={() => adjustTextScale(0.25)} disabled={textScale >= 2.5} aria-label="Bigger text">A+</button>
          </span>
          <div className={`stage-timer ${timerFinished ? "finished" : ""}`}>{previewSample ? "5:00" : timer ? formatTime(timerSeconds) : "--:--"}</div>
        </div>

        {/* zoom, not transform: the stage is fixed and non-scrolling, so zoom
            scales text and layout together with no coordinate drift. */}
        <section className={`stage-work${showBoardPanel ? " board-open" : ""}`} style={{ zoom: textScale }}>
          {showLessonTargets && !isLearningCheck && !resource && !showReaderSpinner ? (
            <aside className="stage-success" aria-label="Success criterion">
              <p className="stage-success-label">Success criterion</p>
              <p className="stage-success-text">{selectedCriterion}</p>
            </aside>
          ) : null}
          <div className="stage-sweep" key={`sweep:${sceneKey}`} aria-hidden="true" />
          <div className="stage-scene" key={sceneKey}>
          {loading ? (
            <div className="stage-empty"><div><h1>Connecting to the classroom</h1><p>{sessionMessage}</p></div></div>
          ) : !session || !flow || !state ? (
            transitionPreview ? (
              <TransitionScene
                vibe={transitionPreview.vibe}
                directions={transitionPreview.directions}
                seconds={transitionPreview.seconds}
                total={transitionPreview.total}
                next={transitionPreview.next}
              />
            ) : previewSample ? (
              <div className="stage-directions">
                <div className="stage-directions-inner">
                  {previewSample.anchor ? (
                    <>
                      <p className="stage-anchor-kicker">Puzzle of the day</p>
                      <span className="stage-anchor-rule" aria-hidden="true" />
                      <h2 className={`stage-main-prompt stage-anchor-text${previewSample.anchor.length > 150 ? " long" : ""}`}>{previewSample.anchor}</h2>
                      <p className="stage-learning stage-anchor-direction">{previewSample.direction}</p>
                    </>
                  ) : (
                    <>
                      <h2 className="stage-main-prompt">{previewSample.headline}</h2>
                      <p className="stage-learning">{previewSample.direction}</p>
                      <span className="stage-action-chip">{previewSample.label}</span>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="stage-empty"><div><h1>Ready for class</h1><p>{sessionMessage}</p></div></div>
            )
          ) : interlude ? (
            <TransitionScene
              vibe={interlude.label}
              directions={interlude.directions}
              seconds={interludeSeconds}
              total={interlude.totalSeconds}
              next={state.label ? `Back to ${state.label}` : null}
            />
          ) : overrideUrl ? (
            <iframe
              className="stage-override"
              src={overrideUrl}
              title={`${overrideLessonCode} ${state.label}`}
              ref={setOverrideFrame}
              onLoad={(event) => setOverrideFrame(event.currentTarget)}
            />
          ) : showReaderSpinner ? (
            <ClassroomSpinner
              key={`${session.id}:${spinnerSyncScope}:controller`}
              mode="readers"
              sessionId={session.id}
              syncKey={session.join_code}
              periodId={session.period_id}
              stateId="learning-target-readers"
              syncScope={spinnerSyncScope}
              role="controller"
              learningIntention={lesson?.learningIntention}
              successCriterion={selectedCriterion}
              remoteCommand={session.remote_command}
            />
          ) : showIpadKidSpinner ? (
            <ClassroomSpinner
              key={`${session.id}:${spinnerSyncScope}:controller`}
              mode="ipad"
              sessionId={session.id}
              syncKey={session.join_code}
              periodId={session.period_id}
              stateId="ipad-kid"
              syncScope={spinnerSyncScope}
              role="controller"
              remoteCommand={session.remote_command}
            />
          ) : isTransition ? (
            <TransitionScene
              vibe={(state.label || "Transition").split("-").pop()?.trim() || "Transition"}
              directions={slideBody || state.description || "Be ready before the music ends."}
              seconds={timerSeconds}
              total={timer?.totalSeconds || 0}
              next={flow.sequence?.nextLabel || null}
            />
          ) : isLearningCheck ? (
            <section className="stage-targets" aria-label="Today's learning intention and success criterion">
              <p className="stage-targets-label">Today&apos;s learning intention</p>
              <h2 className="stage-targets-intention">{lesson?.learningIntention || "Add the Learning Intention in Notion."}</h2>
              <div className="stage-targets-criterion">
                <span className="stage-targets-check">Success criterion</span>
                <strong>{selectedCriterion}</strong>
              </div>
            </section>
          ) : routineConfig?.kind === "gallery-walk" ? (
            <section className="stage-routine" aria-label="Gallery Walk directions">
              <article className="stage-routine-lead">
                <p>Gallery Walk</p>
                <h2>{routineConfig.stationCount} stations</h2>
                <span>{routineConfig.rotationMinutes} minutes per rotation</span>
              </article>
              <article><p>Notice</p><strong>{routineConfig.observationPrompt}</strong></article>
              <article><p>Record</p><strong>{routineConfig.recordPrompt}</strong></article>
              <article><p>Move</p><strong>{routineConfig.movementDirections}</strong></article>
              <article><p>Share</p><strong>{routineConfig.sharePrompt}</strong></article>
            </section>
          ) : routineConfig?.kind === "small-group" ? (
            <section className="stage-routine small-group" aria-label="Small Group directions">
              <article className="stage-routine-lead">
                <p>Small Group Rotations</p>
                <h2>{routineConfig.rotationMinutes} minute rotations</h2>
              </article>
              <article><p>Group task</p><strong>{routineConfig.publicTask}</strong></article>
            </section>
          ) : showPollPanel && poll ? (
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
          ) : showResourcePanel && resource ? (
            embeddedResourceUrl || embeddedAssignedToolUrl ? <iframe className="stage-resource" src={embeddedResourceUrl || embeddedAssignedToolUrl || ""} title={resource.label} /> : (
              <div className="stage-resource-link"><a href={resource.url} target="_blank" rel="noreferrer">{resource.label}</a></div>
            )
          ) : liveToolUrl ? (
            <iframe className="stage-tool" src={liveToolUrl} title={flow.tool?.label || "Lesson tool"} />
          ) : presentation?.mode === "board" ? (
            <div className="stage-board-scene">
              {slideTitle ? (
                <div className="stage-band">
                  <span className="stage-band-rule" aria-hidden="true" />
                  <h2>{slideTitle}</h2>
                </div>
              ) : null}
              <div className="stage-board-wrap">
                <InkBoard room={session.id} interactive problem={stripSlideTitlePrefix(presentation.body, slideTitle, state?.label)} />
                {lessonVisual?.kind === "area-model" ? (
                  <aside className="stage-figure-float" aria-label="Area model support">
                    <LessonVisual visual={lessonVisual} variant="projector" accent={accent} />
                  </aside>
                ) : null}
              </div>
            </div>
          ) : lessonVisual && !anchorMode ? (
            lessonVisual.kind === "area-model" ? (
              <div className="stage-directions">
                <div className="stage-directions-inner">
                  {slideTitle ? (
                    <div className="stage-slide-title">
                      <h2>{slideTitle}</h2>
                      <span className="stage-slide-rule" aria-hidden="true" />
                    </div>
                  ) : null}
                  {strippedBody ? <p className="stage-main-prompt with-title">{strippedBody}</p> : null}
                  <div className="stage-area-figure">
                    <LessonVisual visual={lessonVisual} variant="projector" accent={accent} />
                  </div>
                </div>
              </div>
            ) : (
              <section className="stage-lesson-visual">
                <LessonVisual
                  visual={lessonVisual}
                  variant="projector"
                  accent={accent}
                  scoreboardStage={presentation?.scoreboardStage}
                />
              </section>
            )
          ) : theme.id === "discussion" ? (
            <section className="stage-discussion" aria-label="Discussion prompt and supports">
              <div className="stage-discussion-main">
                <p className="stage-kicker">{phase?.label || "Think, write, discuss, revise, share"}</p>
                <h2>{phase?.subtitle || "Think first. Then explain and revise."}</h2>
                {phase?.id === "share" && phase.selectedSharer ? (
                  <p className="stage-share-callout"><span>Ready to share</span><strong>{phase.selectedSharer}</strong></p>
                ) : null}
                {slideBody ? <p className="stage-round">{slideBody}</p> : null}
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
            anchorMode ? (
              <div className="stage-directions">
                <div className="stage-directions-inner">
                  <p className="stage-anchor-kicker">{anchorMode === "pose" ? "Puzzle of the day" : "This morning's puzzle"}</p>
                  <span className="stage-anchor-rule" aria-hidden="true" />
                  <h2 className={`stage-main-prompt stage-anchor-text${anchorText.length > 150 ? " long" : ""}`}>{anchorText}</h2>
                  <p className="stage-learning stage-anchor-direction">
                    {anchorMode === "pose"
                      ? slideBody || "Warm-up first. Then see how far you can get on this."
                      : "You can answer it now. Use what you learned today."}
                  </p>
                  {anchorMode === "payoff" && slideBody ? <p className="stage-anchor-note">{slideBody}</p> : null}
                </div>
              </div>
            ) : (
            <div className="stage-directions">
              <div className="stage-directions-inner">
                {showLessonTargets && lesson?.learningIntention ? <p className="stage-learning">{lesson.learningIntention}</p> : null}
                {slideTitle && slideTitle !== slideBody.trim() ? (
                  <div className="stage-slide-title">
                    <h2>{slideTitle}</h2>
                    <span className="stage-slide-rule" aria-hidden="true" />
                  </div>
                ) : null}
                <h2 className={`stage-main-prompt${slideTitle && slideTitle !== slideBody.trim() ? " with-title" : ""}`}>{strippedBody || slideBody}</h2>
              </div>
            </div>
            )
          )}
          </div>
          {showBoardPanel && session ? (
            <aside className="stage-board-panel" aria-label="Live writing workspace">
              <InkBoard room={session.id} interactive={false} />
            </aside>
          ) : null}
        </section>

        {session?.abbie?.text ? (
          <aside className="stage-abbie" aria-live="polite" aria-label="Abbie classroom message">
            <span className="stage-abbie-mark" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/big-dog-mark.png" alt="" />
            </span>
            <span>
              <p className="stage-abbie-name">Abbie</p>
              <p className="stage-abbie-line">{session.abbie.text}</p>
            </span>
          </aside>
        ) : null}

      </section>
      {inkOverlay && !inkOverlay.embed && <ScreenInkOverlay room={inkOverlay.room} />}
    </main>
  );
}
