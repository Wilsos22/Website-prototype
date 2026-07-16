"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import ClassroomSpinner from "@/components/ClassroomSpinner";
import { getSupabase } from "@/lib/supabase";
import { SECURE_STUDENT_DATA, studentApiRequest } from "@/lib/studentApi";
import { CLOSEOUT_DIRECTIONS } from "@/lib/classStates";
import { publicSuccessCriterion } from "@/lib/successCriterion";
import {
  LIVE_FLOW_MODE,
  STUDENT_SESSION_KEY,
  getStoredStudentSession,
  getStoredStudentSessionId,
  leaveClassMode,
  liveIndependentSupportItems,
  liveTimerSeconds,
  resolveLiveStepPollKind,
  type DiscussionPhaseId,
  type LiveClassFlowSnapshot,
  type StoredStudentSession,
} from "@/lib/liveClassFlow";

const WARMUP_IDENTITY = process.env.NEXT_PUBLIC_WARMUP_IDENTITY_ENABLED === "true";
const WARMUP_IDENTITY_PLACEHOLDER = "BDM_AUTH_USER_ID";

type SessionRow = {
  status: string;
  broadcast: string | null;
  live_flow: LiveClassFlowSnapshot | null;
};

type ConnectionState = "connecting" | "connected" | "reconnecting";
type PollSaveState = "idle" | "editing" | "saved" | "saving" | "error" | "submitted";

type StoredPollDraft = {
  answer: string;
  fistRating: number;
};

function pollDraftKey(sessionId: string, responseKey: string) {
  return `bdm-live-draft:${sessionId}:${responseKey}`;
}

function submittedPollsKey(sessionId: string) {
  return `bdm-live-submitted:${sessionId}`;
}

type DiscussionContent = {
  title: string;
  subtitle: string;
  directions?: string[];
  sentenceStems?: string[];
  keyVocabulary?: string[];
};

const DISCUSSION_CONTENT: Record<DiscussionPhaseId, DiscussionContent> = {
  think: {
    title: "Thinking Time",
    subtitle: "Silent — think on your own.",
    directions: ["Do not talk.", "Do not type.", "Think about your first move."],
  },
  marker: {
    title: "Commit Your Thinking",
    subtitle: "Write your first answer.",
    directions: ["No group talk yet.", "Mistakes are allowed.", "Blank boards are not."],
  },
  table: {
    title: "Discuss with Your Table",
    subtitle: "Talk it through together.",
    sentenceStems: [
      "I started by…",
      "I noticed…",
      "I disagree because…",
      "Can you explain why…?",
      "I want to revise because…",
    ],
    keyVocabulary: [
      "strategy",
      "evidence",
      "justify",
      "represent",
      "revise",
    ],
  },
  revise: {
    title: "Revise Your Answer",
    subtitle: "Update your thinking.",
    directions: ["Add, change, or correct something based on your discussion."],
  },
  share: {
    title: "Share Out",
    subtitle: "Listen and be ready to respond.",
    directions: [
      "Listen for strategy.",
      "Listen for mistakes.",
      "Listen for revisions.",
      "Be ready to agree, disagree, or build.",
    ],
  },
};

function formatTime(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function LiveFlowPage() {
  const router = useRouter();
  const supabase = getSupabase();
  const [flow, setFlow] = useState<LiveClassFlowSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [emptyMessage, setEmptyMessage] = useState("Waiting for the teacher.");
  const [holding, setHolding] = useState(false);
  const [pollAnswer, setPollAnswer] = useState("");
  const [fistRating, setFistRating] = useState(3);
  const [submittedPollIds, setSubmittedPollIds] = useState<string[]>([]);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [pollSubmitError, setPollSubmitError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [pollSaveState, setPollSaveState] = useState<PollSaveState>("idle");
  const loadedDraftKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const sessionId = getStoredStudentSessionId();
    if (!supabase || !sessionId) {
      setEmptyMessage(!supabase ? "Live sync is not set up." : "Join the class first.");
      setConnectionState("reconnecting");
      setLoading(false);
      return;
    }

    let stopped = false;
    const connectionFallback = window.setTimeout(() => {
      if (!stopped) {
        setConnectionState("reconnecting");
        setLoading(false);
      }
    }, 3500);
    const applySession = (row: SessionRow | null) => {
      if (stopped) return;
      window.clearTimeout(connectionFallback);
      setConnectionState("connected");
      const isLiveFlow = row?.status === "open" && row.broadcast === LIVE_FLOW_MODE;
      if (!row) {
        setEmptyMessage("This class session is not open.");
      } else if (row.status !== "open") {
        setEmptyMessage("This class session has ended.");
      } else if (row.broadcast !== LIVE_FLOW_MODE) {
        setEmptyMessage("Waiting for Live Class Flow.");
      } else {
        setEmptyMessage("Waiting for the teacher.");
      }
      // While the session is open, hold students on a calm "get ready" screen
      // instead of a bare waiting message — even before the pacer sets a state.
      setHolding(row?.status === "open");
      setFlow(isLiveFlow ? row.live_flow : null);
      setLoading(false);
    };
    const readSession = async () => {
      try {
        if (SECURE_STUDENT_DATA) {
          const result = await studentApiRequest<{ session: SessionRow }>(
            `/api/student/session-state?sessionId=${encodeURIComponent(sessionId)}`,
          );
          applySession(result.session);
          return;
        }
        const response = await fetch(
          `/api/student/session-state?sessionId=${encodeURIComponent(sessionId)}`,
          { cache: "no-store", credentials: "same-origin" },
        );
        const result = await response.json().catch(() => ({})) as { session?: SessionRow; error?: string };
        if (!response.ok || !result.session) throw new Error(result.error || "Live Flow could not load.");
        applySession(result.session);
      } catch (error) {
        setEmptyMessage(error instanceof Error ? error.message : "Live Flow could not load.");
        setConnectionState("reconnecting");
        setLoading(false);
      }
    };

    void readSession();
    const poll = window.setInterval(readSession, SECURE_STUDENT_DATA ? 2000 : 1000);

    return () => {
      stopped = true;
      window.clearTimeout(connectionFallback);
      window.clearInterval(poll);
    };
  }, [supabase]);

  useEffect(() => {
    if (!WARMUP_IDENTITY || !supabase) return;
    let stopped = false;
    const loadAuthUser = async () => {
      const { data } = await supabase.auth.getSession();
      if (!stopped) setAuthUserId(data.session?.user.id ?? null);
    };
    void loadAuthUser();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!stopped) setAuthUserId(session?.user.id ?? null);
    });
    return () => {
      stopped = true;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!WARMUP_IDENTITY || !supabase || identityConfirmed) return;
    const stored = getStoredStudentSession();
    if (!stored?.sessionId) return;

    let stopped = false;
    const confirm = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token || stopped) return;
      const response = await fetch("/api/student/confirm-session", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId: stored.sessionId }),
      });
      if (!response.ok || stopped) return;
      const result = await response.json().catch(() => ({})) as {
        session?: StoredStudentSession;
      };
      if (!result.session) return;
      try {
        localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(result.session));
        localStorage.setItem("bdm-student-name", result.session.name);
      } catch { /* ignore */ }
      setIdentityConfirmed(true);
    };
    void confirm();
    const interval = window.setInterval(confirm, 1800);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [identityConfirmed, supabase]);

  const activePoll = flow?.poll ?? null;
  const activePollId = activePoll?.id ?? null;
  const activeResponseKey = activePoll
    ? flow?.presentation?.notionStepId || activePoll.id
    : null;

  useEffect(() => {
    const sessionId = getStoredStudentSessionId();
    if (!sessionId) return;
    try {
      const stored = JSON.parse(localStorage.getItem(submittedPollsKey(sessionId)) || "[]") as unknown;
      if (Array.isArray(stored)) {
        setSubmittedPollIds(stored.filter((value): value is string => typeof value === "string"));
      }
    } catch {
      setSubmittedPollIds([]);
    }
  }, []);

  useEffect(() => {
    setPollSubmitError(null);
    if (!activePoll || !activeResponseKey) {
      loadedDraftKeyRef.current = null;
      setPollSaveState("idle");
      return;
    }
    const sessionId = getStoredStudentSessionId();
    const key = sessionId ? pollDraftKey(sessionId, activeResponseKey) : null;
    let draft: StoredPollDraft | null = null;
    if (key) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "null") as Partial<StoredPollDraft> | null;
        if (parsed && typeof parsed.answer === "string" && typeof parsed.fistRating === "number") {
          draft = { answer: parsed.answer, fistRating: Math.max(0, Math.min(5, parsed.fistRating)) };
        }
      } catch {
        draft = null;
      }
    }
    setPollAnswer(draft?.answer || "");
    setFistRating(draft?.fistRating ?? 3);
    loadedDraftKeyRef.current = key;
    setPollSaveState(submittedPollIds.includes(activePoll.id) ? "submitted" : draft ? "saved" : "idle");
  }, [activePollId, activeResponseKey, submittedPollIds]);

  useEffect(() => {
    if (!activePoll || !activeResponseKey || submittedPollIds.includes(activePoll.id)) return;
    const sessionId = getStoredStudentSessionId();
    const key = sessionId ? pollDraftKey(sessionId, activeResponseKey) : null;
    if (!key || loadedDraftKeyRef.current !== key) return;
    setPollSaveState("editing");
    try {
      localStorage.setItem(key, JSON.stringify({ answer: pollAnswer, fistRating } satisfies StoredPollDraft));
      setPollSaveState("saved");
    } catch {
      setPollSaveState("error");
    }
  }, [activePollId, activeResponseKey, fistRating, pollAnswer, submittedPollIds]);

  async function submitPollAnswer(answer: string) {
    const student = getStoredStudentSession();
    if (!supabase || !activePoll || !student || !answer.trim() || submittedPollIds.includes(activePoll.id)) return;
    setPollSubmitError(null);
    setPollSaveState("saving");
    try {
      if (SECURE_STUDENT_DATA) {
        await studentApiRequest("/api/student/poll-answer", {
          method: "POST",
          body: JSON.stringify({ pollId: activePoll.id, answer: answer.trim() }),
        });
      } else {
        const result = await supabase.from("poll_answers").insert({
          poll_id: activePoll.id,
          ...(student.studentId ? { student_id: student.studentId } : {}),
          display_name: student.name,
          answer: answer.trim(),
        });
        if (result.error) throw result.error;
      }
      const nextSubmitted = [...new Set([...submittedPollIds, activePoll.id])];
      setSubmittedPollIds(nextSubmitted);
      try {
        localStorage.setItem(submittedPollsKey(student.sessionId), JSON.stringify(nextSubmitted));
        if (activeResponseKey) localStorage.removeItem(pollDraftKey(student.sessionId, activeResponseKey));
      } catch { /* ignore */ }
      setPollAnswer("");
      setPollSaveState("submitted");
    } catch (error) {
      setPollSubmitError(error instanceof Error ? error.message : "Your answer could not be saved. Try again.");
      setPollSaveState("error");
    }
  }

  function exitLiveFlow() {
    leaveClassMode();
    router.replace("/");
  }

  const phase = flow?.phase ?? null;
  const activeSequenceStep = flow?.sequence?.steps?.[flow.sequence.currentIndex] || null;
  const expectedPollKind = flow?.state?.semantic === "discussion"
    ? null
    : resolveLiveStepPollKind(
        flow?.presentation?.responseMode,
        activeSequenceStep?.pollKind || undefined,
        flow?.state?.id,
      );
  const waitingForPoll = Boolean(flow?.state && expectedPollKind && !activePoll);
  const isCloseout = flow?.state?.id === "closeout";
  const publicSurfacesLinked = flow?.presentation?.publicSurfaceMode === "linked";
  const linkedMainFocus = flow?.presentation?.mainDisplay || flow?.presentation?.body || flow?.state?.description || "";
  const routineConfig = flow?.presentation?.routineConfig || null;
  const studentSurfaceAction = publicSurfacesLinked
    ? linkedMainFocus
    : routineConfig?.kind === "gallery-walk"
      ? routineConfig.recordPrompt
      : routineConfig?.kind === "small-group"
        ? routineConfig.publicTask
        : flow?.presentation?.studentAction;
  const discussion = phase ? DISCUSSION_CONTENT[phase.id] : null;
  const title = waitingForPoll
    ? "Get ready to respond"
    : discussion?.title ?? flow?.state?.label ?? "Waiting for the teacher.";
  const subtitle = isCloseout
    ? CLOSEOUT_DIRECTIONS
    : waitingForPoll
    ? "Wait for your teacher. Your response box is opening."
    : discussion?.subtitle
      ?? studentSurfaceAction
      ?? flow?.state?.description
      ?? "";
  const phaseMedia = phase?.media ?? null;
  const timer = flow?.timer ?? null;
  const showTimer = Boolean(timer && timer.totalSeconds > 0 && (!phase || phase.timed));
  const accent = flow?.state?.color ?? "#14b8a6";
  const activeTimerSeconds = phase?.timed && typeof phase.secondsLeft === "number"
    ? phase.secondsLeft
    : liveTimerSeconds(timer);
  const activeTimerFinished = phase?.timed
    ? phase.finished
    : Boolean(timer?.finished || (timer?.running && activeTimerSeconds <= 0));
  const activeTimerRunning = phase?.timed ? phase.running : Boolean(timer?.running);
  const status = activeTimerFinished ? "Time is up. Wait for the teacher." : activeTimerRunning ? "In progress" : "Ready";
  const pollSubmitted = activePoll ? submittedPollIds.includes(activePoll.id) : false;
  const pollSaveLabel = connectionState === "reconnecting"
    ? "Reconnecting"
    : pollSubmitted || pollSaveState === "submitted"
      ? "Submitted"
      : pollSaveState === "saving"
        ? "Saving"
        : pollSaveState === "error"
          ? "Could not save"
          : pollSaveState === "saved"
            ? "Saved on this Chromebook"
            : pollSaveState === "editing"
              ? "Editing"
              : "Ready";
  const sentenceStems = (flow?.presentation?.discussionStems?.length
    ? flow.presentation.discussionStems
    : phase?.sentenceStems?.length
      ? phase.sentenceStems
      : discussion?.sentenceStems ?? [])
    .map((stem) => stem.trim())
    .filter(Boolean);
  const keyVocabulary = (flow?.presentation?.vocabulary?.length
    ? flow.presentation.vocabulary
    : phase?.keyVocabulary?.length
      ? phase.keyVocabulary
      : discussion?.keyVocabulary ?? [])
    .map((word) => word.trim())
    .filter(Boolean);
  const showDiscussionSupports = !activePoll && (sentenceStems.length > 0 || keyVocabulary.length > 0);
  const resource = flow?.resource ?? null;
  const linkedSpinnerMode = !activePoll && !resource && publicSurfacesLinked && flow?.state?.id === "learning-target-readers"
    ? "readers"
    : !activePoll && !resource && publicSurfacesLinked && flow?.state?.id === "ipad-kid"
      ? "ipad"
      : null;
  const liveSessionId = getStoredStudentSessionId();
  const spinnerSyncKey = getStoredStudentSession()?.syncKey || null;
  const spinnerSyncScope = `${flow?.sequence?.currentIndex ?? -1}:${flow?.presentation?.notionStepId || flow?.state?.id || "spinner"}`;
  const independentSupports = liveIndependentSupportItems(flow?.state?.id, flow?.lesson);
  const routineSupports = !publicSurfacesLinked && routineConfig?.kind === "gallery-walk"
    ? [
        { label: "Notice", body: routineConfig.observationPrompt },
        { label: "Move", body: routineConfig.movementDirections },
        { label: "Share", body: routineConfig.sharePrompt },
      ]
    : !publicSurfacesLinked && routineConfig?.kind === "small-group"
      ? [{ label: "Rotation", body: `${routineConfig.rotationMinutes} minutes with this group.` }]
      : [];
  const actionBody = flow?.state?.id === "independent" && flow?.paper?.task
    ? flow.paper.task
    : flow?.presentation?.studentAction || "";
  const showActionBody = Boolean(
    !publicSurfacesLinked
    && !waitingForPoll
    && !activePoll
    && !resource
    && actionBody
    && actionBody.trim() !== subtitle.trim(),
  );
  const resourceNeedsIdentity = Boolean(resource?.url.includes(WARMUP_IDENTITY_PLACEHOLDER));
  const resolvedResourceUrl = resource?.url && (!resourceNeedsIdentity || authUserId)
    ? resource.url
      .replaceAll(WARMUP_IDENTITY_PLACEHOLDER, encodeURIComponent(authUserId || ""))
      .replaceAll(encodeURIComponent(WARMUP_IDENTITY_PLACEHOLDER), encodeURIComponent(authUserId || ""))
    : null;
  const embeddedResourceUrl = resolvedResourceUrl?.includes("docs.google.com/forms")
    ? `${resolvedResourceUrl}${resolvedResourceUrl.includes("?") ? "&" : "?"}embedded=true`
    : null;

  return (
    <main className="lf-page" style={{ "--lf-accent": accent } as CSSProperties}>
      <style>{`
        .lf-page { min-height:100vh; display:grid; place-items:center; box-sizing:border-box; overflow:hidden; background:radial-gradient(circle at 18% 12%,color-mix(in srgb,var(--lf-accent) 12%,transparent),transparent 34%),var(--bdb-ground); color:var(--bdb-ink); font-family:var(--bdb-font); padding:clamp(20px,5vw,72px); }
        .lf-exit { position:fixed; top:16px; right:16px; z-index:5; min-height:42px; border:1px solid var(--bdb-line); border-radius:10px; background:#fff; color:var(--bdb-ink); padding:0 14px; font:inherit; font-size:0.74rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; cursor:pointer; box-shadow:var(--bdb-shadow-sm); }
        .lf-exit:hover, .lf-exit:focus-visible { border-color:var(--lf-accent); outline:none; }
        .lf-shell { width:min(100%,960px); text-align:center; display:grid; justify-items:center; gap:clamp(16px,2.8vw,30px); }
        .lf-topbar { width:100%; min-height:46px; box-sizing:border-box; display:flex; align-items:center; justify-content:space-between; gap:18px; border-bottom:1px solid var(--bdb-line); padding:0 2px 10px; }
        .lf-spinner-shell { position:relative; width:min(100%,960px); height:min(72vh,620px); overflow:hidden; border:1px solid var(--bdb-line); border-radius:16px; background:#fff; box-shadow:var(--bdb-shadow); }
        .lf-spinner-shell .classroom-spinner { background:radial-gradient(circle at 50% 42%,color-mix(in srgb,var(--lf-accent) 12%,transparent),transparent 58%),var(--bdb-ground); }
        .lf-spinner-shell .classroom-spinner-card { border-color:var(--bdb-line); border-top-color:var(--lf-accent); background:#fff; box-shadow:var(--bdb-shadow-sm); }
        .lf-spinner-shell .classroom-spinner-label { color:var(--lf-accent); }
        .lf-spinner-shell .classroom-spinner-target, .lf-spinner-shell .classroom-spinner-name { color:var(--bdb-ink); }
        .lf-spinner-shell .classroom-spinner-window { border-color:var(--bdb-line); background:var(--bdb-ground); color:var(--bdb-ink); }
        .lf-spinner-shell .classroom-spinner-window.landed { border-color:var(--lf-accent); box-shadow:0 0 0 3px color-mix(in srgb,var(--lf-accent) 24%,transparent) inset; }
        .lf-spinner-shell .classroom-spinner-status { color:var(--bdb-ink-soft); }
        .lf-brand { margin:0; color:var(--lf-accent); font-size:0.76rem; font-weight:900; letter-spacing:0.14em; text-transform:uppercase; }
        .lf-title { margin:0; max-width:28ch; color:var(--bdb-ink); font-size:clamp(1.55rem,3.4vw,2.7rem); line-height:1.1; font-weight:900; letter-spacing:0; }
        .lf-subtitle { margin:0; max-width:46ch; color:var(--bdb-ink-soft); font-size:clamp(0.95rem,1.8vw,1.18rem); line-height:1.42; font-weight:700; }
        .lf-share { width:min(100%,620px); display:grid; gap:6px; border:1px solid var(--bdb-line); border-left:6px solid var(--lf-accent); border-radius:12px; background:#fff; padding:16px 20px; text-align:left; box-shadow:var(--bdb-shadow-sm); }
        .lf-share span { color:var(--lf-accent); font-size:0.72rem; font-weight:900; letter-spacing:0.12em; text-transform:uppercase; }
        .lf-share strong { color:var(--bdb-ink); font-size:clamp(1.8rem,4.8vw,3.2rem); line-height:1; font-weight:950; }
        .lf-media-wrap { width:min(100%,760px); display:grid; place-items:center; }
        .lf-media { width:min(100%,720px); max-height:38vh; border:1px solid var(--bdb-line); border-radius:12px; background:#fff; object-fit:contain; box-shadow:var(--bdb-shadow); }
        .lf-media.embed { aspect-ratio:16 / 9; height:auto; }
        .lf-timer { display:flex; align-items:center; justify-content:flex-end; gap:10px; white-space:nowrap; }
        .lf-time { color:var(--bdb-ink); font-size:clamp(1.15rem,2.5vw,1.65rem); font-variant-numeric:tabular-nums; font-weight:900; line-height:1; letter-spacing:0; }
        .lf-status { color:var(--lf-accent); font-size:0.66rem; font-weight:900; letter-spacing:0.11em; text-transform:uppercase; }
        .lf-directions { width:min(100%,720px); display:grid; gap:10px; margin:0; padding:0; list-style:none; }
        .lf-direction { border:1px solid var(--bdb-line); border-left:5px solid var(--lf-accent); background:#fff; color:var(--bdb-ink); padding:clamp(13px,2vw,18px) clamp(17px,3vw,26px); text-align:left; font-size:clamp(1rem,1.8vw,1.22rem); font-weight:800; line-height:1.4; box-shadow:var(--bdb-shadow-sm); }
        .lf-supports { width:min(100%,1000px); display:grid; grid-template-columns:minmax(0,1.35fr) minmax(230px,0.75fr); gap:14px; text-align:left; }
        .lf-support-panel { min-width:0; display:grid; align-content:start; gap:13px; border:1px solid var(--bdb-line); border-top:5px solid var(--lf-accent); border-radius:12px; background:#fff; padding:clamp(16px,2.5vw,24px); box-shadow:var(--bdb-shadow-sm); }
        .lf-support-title { margin:0; color:var(--lf-accent); font-size:clamp(0.78rem,1.6vw,0.98rem); font-weight:900; letter-spacing:0.12em; text-transform:uppercase; }
        .lf-stem-list { display:grid; gap:9px; margin:0; padding:0; list-style:none; }
        .lf-stem { display:flex; align-items:center; min-height:58px; border-left:4px solid var(--lf-accent); background:var(--bdb-ground); color:var(--bdb-ink); padding:10px 14px; font-size:clamp(1rem,2vw,1.22rem); font-weight:850; line-height:1.28; }
        .lf-vocab-list { display:flex; flex-wrap:wrap; gap:9px; margin:0; padding:0; list-style:none; }
        .lf-vocab { background:var(--bdb-ground); border:1px solid var(--bdb-line); border-radius:999px; color:var(--bdb-ink); padding:9px 12px; font-size:clamp(0.95rem,1.9vw,1.16rem); font-weight:900; line-height:1.1; }
        .lf-poll { width:min(100%,760px); display:grid; gap:18px; justify-items:center; }
        .lf-poll-question { margin:0; max-width:34ch; color:var(--bdb-ink); font-size:clamp(1.45rem,3.4vw,2.6rem); font-weight:900; line-height:1.18; }
        .lf-poll-help { margin:0; color:var(--bdb-ink-soft); font-size:clamp(1rem,2.2vw,1.3rem); font-weight:700; }
        .lf-poll-choices { width:min(100%,620px); display:grid; gap:10px; }
        .lf-poll-choice, .lf-poll-send { width:100%; min-height:62px; border:2px solid var(--bdb-line); border-radius:10px; background:#fff; color:var(--bdb-ink); padding:14px 18px; font:inherit; font-size:clamp(1rem,2.4vw,1.3rem); font-weight:900; cursor:pointer; box-shadow:var(--bdb-shadow-sm); }
        .lf-poll-choice:hover, .lf-poll-choice:focus-visible, .lf-poll-send:hover, .lf-poll-send:focus-visible { border-color:var(--lf-accent); outline:none; }
        .lf-poll-entry { width:min(100%,620px); display:grid; gap:10px; }
        .lf-poll-text { width:100%; min-height:130px; box-sizing:border-box; border:2px solid var(--bdb-line); border-radius:10px; background:#fff; color:var(--bdb-ink); padding:14px 16px; font:inherit; font-size:1.1rem; font-weight:700; resize:vertical; box-shadow:var(--bdb-shadow-sm); }
        .lf-poll-text:focus { border-color:var(--lf-accent); outline:none; }
        .lf-poll-send { border-color:var(--lf-accent); background:var(--lf-accent); color:#fff; }
        .lf-fist { width:min(100%,700px); display:grid; gap:14px; }
        .lf-fist-options { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:10px; }
        .lf-fist-option { min-height:72px; border:2px solid var(--bdb-line); border-radius:12px; background:#fff; color:var(--bdb-ink); font:inherit; font-size:clamp(1.35rem,3vw,2.15rem); font-weight:950; cursor:pointer; box-shadow:var(--bdb-shadow-sm); }
        .lf-fist-option:hover, .lf-fist-option:focus-visible, .lf-fist-option.selected { border-color:var(--lf-accent); background:color-mix(in srgb,var(--lf-accent) 10%,#fff); outline:none; }
        .lf-fist-option:disabled { cursor:not-allowed; opacity:0.72; }
        .lf-fist-labels { display:flex; justify-content:space-between; gap:6px; color:var(--bdb-ink-soft); font-size:0.76rem; font-weight:900; text-transform:uppercase; }
        .lf-poll-sent { color:#287652; font-size:clamp(1.1rem,2.5vw,1.5rem); font-weight:900; }
        .lf-poll-save-state { margin:0; color:var(--bdb-ink-soft); font-size:0.78rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
        .lf-results { width:min(100%,760px); display:grid; gap:10px; }
        .lf-result { display:grid; grid-template-columns:minmax(70px,1fr) minmax(100px,3fr) auto; gap:10px; align-items:center; color:var(--bdb-ink); font-size:clamp(0.95rem,2vw,1.18rem); font-weight:800; }
        .lf-result-bar { height:13px; overflow:hidden; border-radius:999px; background:var(--bdb-line); }
        .lf-result-fill { height:100%; border-radius:inherit; background:var(--lf-accent); transition:width 220ms ease; }
        .lf-wait { color:var(--bdb-ink); font-size:clamp(1.7rem,4vw,3rem); font-weight:900; line-height:1.14; }
        .lf-ready { display:inline-flex; align-items:center; gap:9px; color:var(--bdb-ink-soft); font-size:0.95rem; font-weight:800; letter-spacing:0.04em; text-transform:uppercase; }
        .lf-ready-dot { width:11px; height:11px; border-radius:50%; background:var(--lf-accent); animation:lfPulse 1.8s ease-out infinite; }
        @keyframes lfPulse { 0% { box-shadow:0 0 0 0 rgba(20,184,166,0.5); } 70% { box-shadow:0 0 0 12px rgba(20,184,166,0); } 100% { box-shadow:0 0 0 0 rgba(20,184,166,0); } }
        @media (prefers-reduced-motion: reduce) { .lf-ready-dot { animation:none; } }
        .lf-switches { display:flex; flex-wrap:wrap; justify-content:center; gap:10px; }
        .lf-switch { display:inline-flex; align-items:center; justify-content:center; min-height:48px; border:1px solid var(--bdb-line); border-radius:10px; background:#fff; color:var(--bdb-ink); padding:0 18px; text-decoration:none; font-size:0.9rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; }
        .lf-switch:hover, .lf-switch:focus-visible { border-color:var(--lf-accent); outline:none; }
        .lf-resource { width:min(100%,900px); display:grid; gap:12px; justify-items:center; }
        .lf-resource-frame { width:100%; height:min(62vh,720px); border:1px solid var(--bdb-line); border-radius:12px; background:#fff; box-shadow:var(--bdb-shadow); }
        .lf-resource-link { display:inline-flex; min-height:58px; align-items:center; justify-content:center; border:2px solid var(--lf-accent); border-radius:10px; background:var(--lf-accent); color:#fff; padding:0 24px; text-decoration:none; font-size:1.05rem; font-weight:900; }
        .lf-action { width:min(100%,720px); border:1px solid var(--bdb-line); border-left:6px solid var(--lf-accent); border-radius:12px; background:#fff; padding:clamp(18px,3vw,28px); color:var(--bdb-ink); text-align:left; white-space:pre-wrap; font-size:clamp(1rem,1.8vw,1.2rem); line-height:1.5; font-weight:760; box-shadow:var(--bdb-shadow); }
        .lf-independent-supports { width:min(100%,820px); display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; text-align:left; }
        .lf-independent-card { border:1px solid var(--bdb-line); border-top:4px solid var(--lf-accent); border-radius:10px; background:#fff; padding:14px 16px; box-shadow:var(--bdb-shadow-sm); }
        .lf-independent-label { margin:0 0 6px; color:var(--lf-accent); font-size:0.7rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
        .lf-independent-body { margin:0; color:var(--bdb-ink); font-size:0.95rem; font-weight:760; line-height:1.4; white-space:pre-wrap; }
        .lf-connection { position:fixed; left:50%; top:16px; z-index:6; transform:translateX(-50%); border:1px solid #c78b24; border-radius:999px; background:#fff4d8; color:#694716; padding:9px 14px; font-size:0.76rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; box-shadow:var(--bdb-shadow-sm); }
        .lf-loading { color:var(--bdb-ink-soft); font-weight:800; }
        @media (max-width:760px) { .lf-supports, .lf-independent-supports { grid-template-columns:1fr; } }
        @media (max-width:600px) {
          .lf-page { padding:84px 18px 26px; }
          .lf-topbar { gap:10px; }
          .lf-status { display:none; }
          .lf-connection { top:68px; left:18px; right:18px; transform:none; box-sizing:border-box; text-align:center; }
        }
      `}</style>

      <button className="lf-exit" type="button" onClick={exitLiveFlow}>Exit Live Flow</button>
      {connectionState === "reconnecting" ? <div className="lf-connection" role="status">Reconnecting. Your draft is safe.</div> : null}

      <section className="lf-shell" aria-live="polite">
        <header className="lf-topbar">
          <p className="lf-brand">Big Dog Math</p>
          {showTimer && timer ? (
            <div className="lf-timer" aria-label="Current lesson timer">
              <div className="lf-status">{status}</div>
              <div className="lf-time">{formatTime(activeTimerSeconds)}</div>
            </div>
          ) : null}
        </header>
        {loading ? (
          <p className="lf-loading">Connecting to class…</p>
        ) : !flow?.state ? (
          holding ? (
            <>
              <h1 className="lf-title">Class is starting</h1>
              <p className="lf-subtitle">Get your warm-up out and get ready. Your screen updates the moment we begin.</p>
              <div className="lf-ready"><span className="lf-ready-dot" />You&apos;re connected</div>
            </>
          ) : (
            <>
              <h1 className="lf-wait">{emptyMessage}</h1>
              <div className="lf-switches">
                <a className="lf-switch" href="/?leaveClass=1">Return to website</a>
                <a className="lf-switch" href="/join?leaveClass=1">Join a different session</a>
              </div>
            </>
          )
        ) : linkedSpinnerMode && liveSessionId ? (
          <section className="lf-spinner-shell" aria-label="Classroom spinner synced with the main display">
            <ClassroomSpinner
              key={`${liveSessionId}:${spinnerSyncScope}:mirror`}
              mode={linkedSpinnerMode}
              sessionId={liveSessionId}
              syncKey={spinnerSyncKey}
              periodId={null}
              stateId={flow.state.id}
              syncScope={spinnerSyncScope}
              role="mirror"
              learningIntention={flow.lesson?.learningIntention}
              successCriterion={publicSuccessCriterion(flow.lesson?.selectedSuccessCriterion)}
            />
          </section>
        ) : (
          <>
            {!activePoll && <h1 className="lf-title">{title}</h1>}
            {!activePoll && subtitle && <p className="lf-subtitle">{subtitle}</p>}
            {!activePoll && phase?.id === "share" && phase.selectedSharer ? (
              <div className="lf-share"><span>Ready to share</span><strong>{phase.selectedSharer}</strong></div>
            ) : null}
            {!activePoll && phaseMedia && (
              <div className="lf-media-wrap">
                {phaseMedia.type === "video" ? (
                  <video className="lf-media" src={phaseMedia.url} autoPlay muted loop playsInline />
                ) : phaseMedia.type === "embed" ? (
                  <iframe
                    className="lf-media embed"
                    src={phaseMedia.url}
                    title={`${title} media`}
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <img className="lf-media" src={phaseMedia.url} alt="" />
                )}
              </div>
            )}
            {!activePoll && resource && (
              <section className="lf-resource" aria-label={resource.label}>
                {resourceNeedsIdentity && !resolvedResourceUrl ? (
                  <p className="lf-poll-help">Preparing your verified warm-up.</p>
                ) : embeddedResourceUrl ? (
                  <iframe className="lf-resource-frame" src={embeddedResourceUrl} title={resource.label} />
                ) : (
                  <a className="lf-resource-link" href={resolvedResourceUrl || resource.url} target="_blank" rel="noreferrer">{resource.label}</a>
                )}
              </section>
            )}
            {showActionBody ? <section className="lf-action" aria-label="Current action">{actionBody}</section> : null}
            {!activePoll && independentSupports.length > 0 ? (
              <section className="lf-independent-supports" aria-label="Independent work supports">
                {independentSupports.map((item) => (
                  <article className="lf-independent-card" key={item.label}>
                    <p className="lf-independent-label">{item.label}</p>
                    <p className="lf-independent-body">{item.body}</p>
                  </article>
                ))}
              </section>
            ) : null}
            {!activePoll && routineSupports.length > 0 ? (
              <section className="lf-independent-supports" aria-label="Current routine supports">
                {routineSupports.map((item) => (
                  <article className="lf-independent-card" key={item.label}>
                    <p className="lf-independent-label">{item.label}</p>
                    <p className="lf-independent-body">{item.body}</p>
                  </article>
                ))}
              </section>
            ) : null}
            {activePoll ? activePoll.stage === "responding" ? (
              <section className="lf-poll">
                <h1 className="lf-poll-question">{activePoll.question}</h1>
                {activePoll.kind === "fist-to-five" ? (
                  <>
                    <p className="lf-poll-help">Choose the number that best shows where you are right now.</p>
                    <div className="lf-fist">
                      <div className="lf-fist-options" aria-label="Understanding from 0 to 5">
                        {[0, 1, 2, 3, 4, 5].map((value) => (
                          <button
                            className={`lf-fist-option${fistRating === value ? " selected" : ""}`}
                            type="button"
                            key={value}
                            aria-pressed={fistRating === value}
                            disabled={pollSubmitted || pollSaveState === "saving"}
                            onClick={() => {
                              setFistRating(value);
                              void submitPollAnswer(String(value));
                            }}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                      <div className="lf-fist-labels"><span>0 · Not yet</span><span>5 · Can explain</span></div>
                    </div>
                    {pollSubmitted ? <p className="lf-poll-sent">Check-in submitted.</p> : <p className="lf-poll-help">Tap one number to submit.</p>}
                    <p className="lf-poll-help">Only your teacher sees your number.</p>
                    {pollSubmitError && <p className="lf-poll-help">{pollSubmitError}</p>}
                  </>
                ) : activePoll.kind === "multiple-choice" ? (
                  <div className="lf-poll-choices">
                    {activePoll.choices?.map((choice) => (
                      <button className="lf-poll-choice" key={choice} disabled={pollSubmitted || pollSaveState === "saving"} onClick={() => submitPollAnswer(choice)}>{choice}</button>
                    ))}
                    {pollSubmitted && <p className="lf-poll-sent">Answer submitted.</p>}
                    {pollSubmitError && <p className="lf-poll-help">{pollSubmitError}</p>}
                  </div>
                ) : (
                  <div className="lf-poll-entry">
                    <textarea className="lf-poll-text" value={pollAnswer} disabled={pollSubmitted} onChange={(event) => setPollAnswer(event.target.value)} placeholder="Type your answer" />
                    {pollSubmitted ? <p className="lf-poll-sent">Answer submitted.</p> : <button className="lf-poll-send" disabled={pollSaveState === "saving"} onClick={() => submitPollAnswer(pollAnswer)}>Send answer</button>}
                    {pollSubmitError && <p className="lf-poll-help">{pollSubmitError}</p>}
                  </div>
                )}
                <p className="lf-poll-save-state" role="status">{pollSaveLabel}</p>
              </section>
            ) : (
              <section className="lf-poll">
                <h1 className="lf-poll-question">Response received</h1>
                <p className="lf-poll-help">Look at the Pace + Support screen for the class view.</p>
              </section>
            ) : null}
            {!activePoll && discussion?.directions && (
              <ul className="lf-directions">
                {discussion.directions.map((direction) => <li className="lf-direction" key={direction}>{direction}</li>)}
              </ul>
            )}
            {showDiscussionSupports && (
              <section className="lf-supports" aria-label="Discussion supports">
                {sentenceStems.length > 0 && (
                  <div className="lf-support-panel">
                    <h2 className="lf-support-title">Sentence Stems</h2>
                    <ul className="lf-stem-list">
                      {sentenceStems.map((stem) => <li className="lf-stem" key={stem}>{stem}</li>)}
                    </ul>
                  </div>
                )}
                {keyVocabulary.length > 0 && (
                  <div className="lf-support-panel">
                    <h2 className="lf-support-title">Key Vocabulary</h2>
                    <ul className="lf-vocab-list">
                      {keyVocabulary.map((word) => <li className="lf-vocab" key={word}>{word}</li>)}
                    </ul>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </section>
    </main>
  );
}
