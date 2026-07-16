"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  REMOTE_COMMAND_STALE_MS,
  canRevealM2T1L1FinalScore,
  liveTimerSeconds,
  resolveRemoteNextBehavior,
  type DiscussionPhaseId,
  type LiveClassFlowSnapshot,
  type LiveFlowSequenceStep,
  type TeacherRemoteAction,
  type TeacherRemoteCommand,
} from "@/lib/liveClassFlow";
import { CLASSROOM_STAGE_THEMES, classroomStageTheme, usesDiscussionProtocol } from "@/lib/classroomPilot";
import type { LessonRoutineConfig } from "@/lib/lessonRoutineConfig";
import { defaultPublicSurfaceModeForState } from "@/lib/lessonStepMetadata";
import type { LessonStepData } from "@/lib/notionLessons";
import { ABBIE_REMOTE_BUTTONS, SOUND_REMOTE_BUTTONS, type RemoteDeckButton } from "@/lib/remoteDeck";
import { speakerNoteItems } from "@/lib/speakerNotes";

const REMOTE_SESSION_KEY = "bdm-remote-session";
const SPINNER_STATE_IDS = ["learning-target-readers", "ipad-kid"] as const;
type SpinnerStateId = (typeof SPINNER_STATE_IDS)[number];

function isSpinnerStateId(value: unknown): value is SpinnerStateId {
  return typeof value === "string" && SPINNER_STATE_IDS.some((stateId) => stateId === value);
}

const STAGE_BUTTONS: readonly RemoteDeckButton[] = [
  { action: "previous", label: "Back", detail: "Previous stage", tone: "neutral" },
  { action: "toggle-timer", label: "Pause or resume", detail: "Control automatic pacing", tone: "timer" },
  { action: "next", label: "Next state", detail: "Advance the lesson", tone: "next" },
];

const TIMER_BUTTONS: readonly RemoteDeckButton[] = [
  { action: "add-30", label: "+30 seconds", detail: "Add time", tone: "neutral" },
  { action: "subtract-30", label: "-30 seconds", detail: "Remove time", tone: "neutral" },
  { action: "reset-timer", label: "Reset timer", detail: "Restart this stage", tone: "neutral" },
];

const DISCUSSION_PHASE_BUTTONS: readonly RemoteDeckButton[] = [
  { action: "discussion-think", label: "Think", detail: "One minute of quiet thinking", tone: "orange" },
  { action: "discussion-write", label: "Write", detail: "Record one idea or strategy", tone: "orange" },
  { action: "discussion-discuss", label: "Discuss", detail: "Use the stems and vocabulary", tone: "orange" },
  { action: "discussion-revise", label: "Revise", detail: "Strengthen the response", tone: "orange" },
  { action: "discussion-share", label: "Share", detail: "Choose and hear a response", tone: "orange" },
];

const DISCUSSION_ACTION_BY_PHASE: Record<DiscussionPhaseId, TeacherRemoteAction> = {
  think: "discussion-think",
  marker: "discussion-write",
  table: "discussion-discuss",
  revise: "discussion-revise",
  share: "discussion-share",
};

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

interface PrivateLessonStepDetails {
  id: string;
  routineConfig: LessonRoutineConfig | null;
}

interface DeckKeyProps {
  button: RemoteDeckButton;
  busy: TeacherRemoteAction | null;
  disabled: boolean;
  onSend: (button: RemoteDeckButton) => void;
  active?: boolean;
}

interface SurfaceMirrorProps {
  label: string;
  body: string;
  meta: string;
  tone: "dark" | "cream";
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

function optimisticTimer(
  flow: LiveClassFlowSnapshot,
  action: TeacherRemoteAction,
  now: number,
): LiveClassFlowSnapshot {
  if (!flow.timer) return flow;
  const totalSeconds = Math.max(0, flow.timer.totalSeconds);
  let secondsLeft = liveTimerSeconds(flow.timer, now);
  let running = flow.timer.running;
  let finished = flow.timer.finished;
  let endsAt: string | null = flow.timer.endsAt || null;

  if (action === "toggle-timer") {
    if (running) {
      running = false;
      finished = secondsLeft <= 0;
      endsAt = null;
    } else {
      if (secondsLeft <= 0) secondsLeft = totalSeconds;
      running = secondsLeft > 0;
      finished = false;
      endsAt = running ? new Date(now + secondsLeft * 1000).toISOString() : null;
    }
  } else if (action === "reset-timer") {
    secondsLeft = totalSeconds;
    running = false;
    finished = false;
    endsAt = null;
  } else {
    secondsLeft = Math.max(0, secondsLeft + (action === "add-30" ? 30 : -30));
    finished = secondsLeft <= 0;
    if (finished) running = false;
    endsAt = running ? new Date(now + secondsLeft * 1000).toISOString() : null;
  }

  return {
    ...flow,
    updatedAt: new Date(now).toISOString(),
    timer: { totalSeconds, secondsLeft, running, finished, endsAt },
    sequence: flow.sequence && action === "toggle-timer" && running
      ? { ...flow.sequence, advanceMode: "automatic" }
      : flow.sequence,
  };
}

function optimisticNavigation(
  flow: LiveClassFlowSnapshot,
  direction: 1 | -1,
  now: number,
): LiveClassFlowSnapshot {
  const sequence = flow.sequence;
  const steps = sequence?.steps;
  if (!sequence || !steps?.length) return flow;
  const targetIndex = sequence.currentIndex + direction;
  const step: LiveFlowSequenceStep | undefined = steps[targetIndex];
  if (!step) return flow;
  const nextStep = steps[targetIndex + 1] || null;
  const keepRunning = sequence.advanceMode === "automatic"
    && Boolean(flow.timer?.running || flow.timer?.finished || flow.poll?.stage === "results");
  const totalSeconds = Math.max(0, step.durationSeconds);

  return {
    ...flow,
    updatedAt: new Date(now).toISOString(),
    state: {
      id: step.stateId,
      label: step.label,
      description: step.description,
      color: step.color,
      semantic: step.semantic,
    },
    phase: null,
    timer: {
      totalSeconds,
      secondsLeft: totalSeconds,
      running: keepRunning,
      finished: false,
      endsAt: keepRunning ? new Date(now + totalSeconds * 1000).toISOString() : null,
    },
    poll: null,
    resource: step.resourceUrl ? { label: "Open Lesson Resource", url: step.resourceUrl } : null,
    presentation: {
      title: step.label,
      body: step.mainDisplay || step.question || step.description || step.paperTask,
      mainDisplay: step.mainDisplay || "",
      mode: step.resourceUrl ? "resource" : "directions",
      notionStepId: step.notionStepId,
      boardOpen: false,
      paceDirections: step.paceDirections || step.description,
      studentAction: step.studentAction || step.description,
      responseMode: step.responseMode || "",
      workSpaceAvailable: step.workSpaceAvailable,
      publicSurfaceMode: step.publicSurfaceMode || defaultPublicSurfaceModeForState(step.stateId),
      routineConfig: step.routineConfig || null,
      discussionStems: step.discussionStems || [],
      vocabulary: step.vocabulary || [],
      scoreboardStage: canRevealM2T1L1FinalScore(step.lessonCode, step.stateId, step.semantic)
        ? "halftime"
        : undefined,
    },
    tool: null,
    sequence: {
      ...sequence,
      currentIndex: targetIndex,
      nextLabel: nextStep?.label || null,
      nextDirections: nextStep?.paceDirections || nextStep?.description || null,
    },
    paper: step.paperTask ? { task: step.paperTask } : null,
  };
}

function optimisticRemoteFlow(
  flow: LiveClassFlowSnapshot,
  action: TeacherRemoteAction,
): LiveClassFlowSnapshot {
  const now = Date.now();
  if (["toggle-timer", "add-30", "subtract-30", "reset-timer"].includes(action)) {
    return optimisticTimer(flow, action, now);
  }
  if (
    (action === "reveal-results" || action === "next")
    && flow.poll
    && resolveRemoteNextBehavior(flow.state?.id, flow.state?.semantic, flow.poll.stage) === "reveal-results"
  ) {
    return {
      ...flow,
      updatedAt: new Date(now).toISOString(),
      timer: null,
      poll: { ...flow.poll, stage: "results", awaitingTeacherAdvance: true },
    };
  }
  if (action === "reveal-final-score" && flow.presentation) {
    return {
      ...flow,
      updatedAt: new Date(now).toISOString(),
      presentation: { ...flow.presentation, scoreboardStage: "final" },
    };
  }
  if (action === "next" || action === "previous") {
    return optimisticNavigation(flow, action === "next" ? 1 : -1, now);
  }
  if ((action === "show-board" || action === "hide-board") && flow.presentation) {
    return {
      ...flow,
      updatedAt: new Date(now).toISOString(),
      presentation: { ...flow.presentation, boardOpen: action === "show-board" },
    };
  }
  return flow;
}

function DeckKey({ button, busy, disabled, onSend, active = false }: DeckKeyProps) {
  return (
    <button
      className={`deck-key ${button.tone}${active ? " active" : ""}`}
      disabled={disabled}
      aria-busy={busy === button.action}
      onClick={() => onSend(button)}
    >
      <span className="deck-key-label">{busy === button.action ? "Sending" : button.label}</span>
      <span className="deck-key-detail">{button.detail}</span>
    </button>
  );
}

function SurfaceMirror({ label, body, meta, tone }: SurfaceMirrorProps) {
  return (
    <article className={`surface-mirror ${tone}`} aria-label={`${label} preview`}>
      <header className="surface-mirror-head">
        <span className="surface-mirror-dot" aria-hidden="true" />
        <strong>{label}</strong>
        <span>{meta}</span>
      </header>
      <p>{body}</p>
    </article>
  );
}

export default function TeacherRemotePage() {
  const [sessions, setSessions] = useState<RemoteSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<RemoteSession | null>(null);
  const [status, setStatus] = useState("Choose the class session this Remote should control.");
  const [busy, setBusy] = useState<TeacherRemoteAction | null>(null);
  const [pendingCommand, setPendingCommand] = useState<{
    nonce: string;
    label: string;
    action: TeacherRemoteAction;
    spinnerStateKey: string | null;
  } | null>(null);
  const [lastReceipt, setLastReceipt] = useState<string | null>(null);
  const [completedSpinnerStateKey, setCompletedSpinnerStateKey] = useState<string | null>(null);
  const [pollAnswers, setPollAnswers] = useState<PollAnswer[]>([]);
  const [privateLessonSteps, setPrivateLessonSteps] = useState<LessonStepData[]>([]);
  const [privateLessonStepDetails, setPrivateLessonStepDetails] = useState<PrivateLessonStepDetails | null>(null);
  const [boardPanelOpen, setBoardPanelOpen] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const commandInFlightRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const refreshEpochRef = useRef(0);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const requestedSessionId = params.get("session")?.trim();
      const storedSessionId = localStorage.getItem(REMOTE_SESSION_KEY)?.trim();
      refreshEpochRef.current += 1;
      setSelectedSessionId(requestedSessionId || storedSessionId || null);
    } catch {
      refreshEpochRef.current += 1;
      setSelectedSessionId(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (commandInFlightRef.current || refreshInFlightRef.current) return;
    const requestEpoch = refreshEpochRef.current;
    refreshInFlightRef.current = true;
    try {
      const query = selectedSessionId ? `?sessionId=${encodeURIComponent(selectedSessionId)}` : "";
      const response = await fetch(`/api/control-remote${query}`, { cache: "no-store" });
      const data = await response.json() as { sessions?: RemoteSession[]; session?: RemoteSession | null; error?: string };
      if (requestEpoch !== refreshEpochRef.current) return;
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
      if (pendingCommand) {
        const remoteCommand = data.session.remoteCommand;
        if (remoteCommand?.nonce !== pendingCommand.nonce) {
          setPendingCommand(null);
          setStatus(`The classroom did not confirm ${pendingCommand.label}. Tap it again.`);
        } else if (remoteCommand.receivedAt) {
          if (pendingCommand.action === "spin-spinner" && pendingCommand.spinnerStateKey) {
            setCompletedSpinnerStateKey(pendingCommand.spinnerStateKey);
          }
          setLastReceipt(pendingCommand.label);
          setPendingCommand(null);
          setStatus(`Received by classroom: ${pendingCommand.label}`);
        } else {
          const issuedAt = Date.parse(remoteCommand.issuedAt);
          const stale = !Number.isFinite(issuedAt) || Date.now() - issuedAt >= REMOTE_COMMAND_STALE_MS;
          if (stale) {
            setPendingCommand(null);
            setStatus(`The classroom did not confirm ${pendingCommand.label}. Tap it again.`);
          } else {
            setStatus(`Sent to classroom: ${pendingCommand.label}. Waiting for receipt.`);
          }
        }
      } else if (!pendingCommand) {
        setStatus(lastReceipt
          ? `Received by classroom: ${lastReceipt}`
          : "Connected to the confirmed Live Class Flow session.");
      }
    } catch {
      if (requestEpoch === refreshEpochRef.current) {
        setStatus("Disconnected. Trying to reach the classroom controller again.");
      }
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [lastReceipt, pendingCommand, selectedSessionId]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(refresh, selectedSessionId ? 500 : 1200);
    return () => window.clearInterval(interval);
  }, [refresh, selectedSessionId]);

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

  const privateLessonId = session?.liveFlow?.lesson?.id?.trim() || "";
  const privateLessonCode = session?.liveFlow?.lesson?.code?.trim() || "";
  const privateNotionStepId = session?.liveFlow?.presentation?.notionStepId?.trim() || "";
  useEffect(() => {
    if (!privateLessonId && !privateLessonCode) {
      setPrivateLessonSteps([]);
      return;
    }
    let stopped = false;
    setPrivateLessonSteps([]);
    const params = privateLessonId
      ? `id=${encodeURIComponent(privateLessonId)}`
      : `code=${encodeURIComponent(privateLessonCode)}`;
    void (async () => {
      try {
        const response = await fetch(`/api/teacher/lesson?${params}`, { cache: "no-store" });
        const data = await response.json() as { lesson?: { steps?: LessonStepData[] }; error?: string };
        if (!stopped) setPrivateLessonSteps(response.ok ? data.lesson?.steps || [] : []);
      } catch {
        if (!stopped) setPrivateLessonSteps([]);
      }
    })();
    return () => { stopped = true; };
  }, [privateLessonCode, privateLessonId]);

  useEffect(() => {
    if (!privateLessonId || !privateNotionStepId) {
      setPrivateLessonStepDetails(null);
      return;
    }
    let stopped = false;
    setPrivateLessonStepDetails(null);
    void (async () => {
      try {
        const params = new URLSearchParams({ lessonId: privateLessonId, stepId: privateNotionStepId });
        const response = await fetch(`/api/teacher/lesson-step?${params.toString()}`, { cache: "no-store" });
        const data = await response.json() as { step?: PrivateLessonStepDetails; error?: string };
        if (!stopped) {
          setPrivateLessonStepDetails(
            response.ok && data.step?.id === privateNotionStepId ? data.step : null,
          );
        }
      } catch {
        if (!stopped) setPrivateLessonStepDetails(null);
      }
    })();
    return () => { stopped = true; };
  }, [privateLessonId, privateNotionStepId]);

  const chooseSession = useCallback((sessionId: string) => {
    refreshEpochRef.current += 1;
    setSelectedSessionId(sessionId);
    setSession(null);
    setPendingCommand(null);
    setLastReceipt(null);
    setBoardPanelOpen(false);
    setStatus("Confirming the selected classroom session.");
    try { localStorage.setItem(REMOTE_SESSION_KEY, sessionId); } catch { /* ignore */ }
  }, []);

  const changeSession = useCallback(() => {
    refreshEpochRef.current += 1;
    setSelectedSessionId(null);
    setSession(null);
    setPendingCommand(null);
    setLastReceipt(null);
    setBoardPanelOpen(false);
    setStatus("Choose the class session this Remote should control.");
    try { localStorage.removeItem(REMOTE_SESSION_KEY); } catch { /* ignore */ }
  }, []);

  const endSession = useCallback(async () => {
    if (!session || endingSession) return;
    if (!window.confirm("End this session for every connected student?")) return;
    refreshEpochRef.current += 1;
    setEndingSession(true);
    setStatus("Ending the confirmed class session.");
    try {
      const response = await fetch("/api/teacher/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close", sessionId: session.id }),
      });
      const data = await response.json() as { closed?: boolean; error?: string };
      if (!response.ok || !data.closed) throw new Error(data.error || "The session could not be ended.");
      try { localStorage.removeItem(REMOTE_SESSION_KEY); } catch { /* ignore */ }
      setSession(null);
      setSelectedSessionId(null);
      setPendingCommand(null);
      setLastReceipt(null);
      setBoardPanelOpen(false);
      setStatus("Session ended. Connected student screens have been released.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The session could not be ended.");
    } finally {
      setEndingSession(false);
    }
  }, [endingSession, session]);

  const send = useCallback(async (button: RemoteDeckButton) => {
    if (!session || busy || pendingCommand || commandInFlightRef.current) return;
    const confirmedSession = session;
    const expectedStateId = button.action === "spin-spinner" && isSpinnerStateId(session.liveFlow?.state?.id)
      ? session.liveFlow.state.id
      : null;
    const spinnerStateKey = expectedStateId
      ? `${session.id}:${expectedStateId}:${session.liveFlow?.sequence?.currentIndex ?? -1}`
      : null;
    refreshEpochRef.current += 1;
    commandInFlightRef.current = true;
    setBusy(button.action);
    setLastReceipt(null);
    setStatus(`Sending to classroom: ${button.label}`);
    setSession((current) => current?.liveFlow
      ? { ...current, liveFlow: optimisticRemoteFlow(current.liveFlow, button.action) }
      : current);
    try {
      const response = await fetch("/api/control-remote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: button.action,
          sessionId: session.id,
          ...(expectedStateId ? {
            expectedStateId,
            expectedSequenceIndex: session.liveFlow?.sequence?.currentIndex,
          } : {}),
        }),
      });
      const data = await response.json() as { command?: TeacherRemoteCommand; liveFlow?: LiveClassFlowSnapshot; error?: string };
      if (!response.ok || !data.command) {
        setSession(confirmedSession);
        setStatus(data.error || "Command failed.");
      } else if (data.command.receivedAt) {
        if (data.liveFlow) setSession((current) => current ? { ...current, liveFlow: data.liveFlow || null, remoteCommand: data.command || null } : current);
        if (button.action === "spin-spinner" && spinnerStateKey) {
          setCompletedSpinnerStateKey(spinnerStateKey);
        }
        setPendingCommand(null);
        setLastReceipt(button.label);
        setStatus(`Received by classroom: ${button.label}`);
      } else {
        setPendingCommand({
          nonce: data.command.nonce,
          label: button.label,
          action: button.action,
          spinnerStateKey,
        });
        setStatus(`Sent to classroom: ${button.label}. Waiting for receipt.`);
      }
    } catch {
      setSession(confirmedSession);
      setStatus("Command failed. Check the classroom connection.");
    } finally {
      commandInFlightRef.current = false;
      setBusy(null);
    }
  }, [busy, pendingCommand, session]);

  const setWritingMode = useCallback(async (open: boolean) => {
    if (!session || busy || pendingCommand || commandInFlightRef.current) return;
    const confirmedSession = session;
    refreshEpochRef.current += 1;
    const action: TeacherRemoteAction = open ? "show-board" : "hide-board";
    const label = open ? "Open work space" : "Close work space";
    commandInFlightRef.current = true;
    setBusy(action);
    setLastReceipt(null);
    setStatus(`Sending to classroom: ${label}`);
    setSession((current) => current?.liveFlow
      ? { ...current, liveFlow: optimisticRemoteFlow(current.liveFlow, action) }
      : current);
    try {
      const response = await fetch("/api/control-remote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, sessionId: session.id }),
      });
      const data = await response.json() as { command?: TeacherRemoteCommand; liveFlow?: LiveClassFlowSnapshot; error?: string };
      if (!response.ok || !data.command) {
        setSession(confirmedSession);
        setStatus(data.error || "Command failed.");
      } else if (data.command.receivedAt) {
        if (data.liveFlow) setSession((current) => current ? { ...current, liveFlow: data.liveFlow || null, remoteCommand: data.command || null } : current);
        setPendingCommand(null);
        setLastReceipt(label);
        setStatus(`Received by classroom: ${label}`);
        setBoardPanelOpen(open);
      } else {
        setPendingCommand({ nonce: data.command.nonce, label, action, spinnerStateKey: null });
        setStatus(`Sent to classroom: ${label}. Waiting for receipt.`);
        setBoardPanelOpen(open);
      }
    } catch {
      setSession(confirmedSession);
      setStatus("Command failed. Check the classroom connection.");
    } finally {
      commandInFlightRef.current = false;
      setBusy(null);
    }
  }, [busy, pendingCommand, session]);

  useEffect(() => {
    setBoardPanelOpen(Boolean(session?.liveFlow?.presentation?.boardOpen));
  }, [session?.liveFlow?.presentation?.boardOpen]);

  const flow = session?.liveFlow ?? null;
  const timer = flow?.timer ?? null;
  const timerSeconds = liveTimerSeconds(timer);
  const timerFinished = Boolean(timer?.finished || (timer?.running && timerSeconds <= 0));
  const sequence = flow?.sequence ?? null;
  const lesson = flow?.lesson ?? null;
  const privateLessonStep = useMemo(() => {
    if (!privateLessonSteps.length) return null;
    const notionStepId = flow?.presentation?.notionStepId || "";
    if (notionStepId) {
      const matchingStep = privateLessonSteps.find((step) => step.id === notionStepId);
      if (matchingStep) return matchingStep;
    }
    if (sequence && privateLessonSteps[sequence.currentIndex]) return privateLessonSteps[sequence.currentIndex];
    return privateLessonSteps.find((step) => step.stateId === flow?.state?.id) || null;
  }, [flow?.presentation?.notionStepId, flow?.state?.id, privateLessonSteps, sequence]);
  const currentSpeakerNotes = speakerNoteItems(
    privateLessonStep?.remoteActions
      || privateLessonStep?.teacherNotes
      || privateLessonStep?.paceDirections
      || privateLessonStep?.studentDirections
      || flow?.presentation?.remoteActions
      || flow?.presentation?.paceDirections
      || flow?.state?.description
      || "The classroom computer has not published directions yet.",
  );
  const privateSmallGroupPlan = privateLessonStepDetails?.routineConfig?.kind === "small-group"
    ? privateLessonStepDetails.routineConfig.teacherPlan
    : null;
  const controlsDisabled = !session || Boolean(busy) || Boolean(pendingCommand);
  const isDiscussionState = Boolean(
    flow?.state
    && (
      flow.state.semantic === "discussion"
      || usesDiscussionProtocol(flow.state.id, flow.state.label)
    )
  );
  const discussionPhase = isDiscussionState ? flow?.phase ?? null : null;
  const learningCheckAwaitingReveal = Boolean(
    flow?.poll
    && resolveRemoteNextBehavior(flow.state?.id, flow.state?.semantic, flow.poll.stage) === "reveal-results",
  );
  const stageControlButtons: readonly RemoteDeckButton[] = STAGE_BUTTONS.map((button) => (
    button.action === "next" && learningCheckAwaitingReveal
      ? {
          action: "reveal-results",
          label: "Reveal anonymous bars",
          detail: "Stay on this Learning Check",
          tone: "purple",
        }
      : button
  ));
  const launchScoreboardAvailable = Boolean(
    flow && canRevealM2T1L1FinalScore(flow.lesson?.code, flow.state?.id, flow.state?.semantic),
  );
  const finalScoreShowing = flow?.presentation?.scoreboardStage === "final";
  const scoreboardButton: RemoteDeckButton | null = launchScoreboardAvailable
    ? {
        action: "reveal-final-score",
        label: finalScoreShowing ? "Final score shown" : "Reveal final score",
        detail: finalScoreShowing ? "The projector shows 60 to 40" : "Change 30 to 20 into 60 to 40",
        tone: "gold",
      }
    : null;
  const discussionPhaseIndex = discussionPhase
    ? (["think", "marker", "table", "revise", "share"] as DiscussionPhaseId[]).indexOf(discussionPhase.id)
    : -1;
  const activeDiscussionAction = discussionPhase ? DISCUSSION_ACTION_BY_PHASE[discussionPhase.id] : null;
  const discussionControlButtons: Array<{ button: RemoteDeckButton; disabled: boolean }> = [
    {
      button: { action: "discussion-previous", label: "Previous phase", detail: "Go back one part", tone: "neutral" },
      disabled: discussionPhaseIndex <= 0,
    },
    {
      button: {
        action: "discussion-toggle",
        label: discussionPhase?.running ? "Pause phase" : "Start or resume",
        detail: "Control this phase timer",
        tone: "timer",
      },
      disabled: !discussionPhase?.timed,
    },
    {
      button: { action: "discussion-restart", label: "Restart phase", detail: "Reset this phase timer", tone: "gold" },
      disabled: !discussionPhase?.timed,
    },
    {
      button: { action: "discussion-next", label: "Next phase", detail: "Move to the next part", tone: "next" },
      disabled: discussionPhaseIndex < 0 || discussionPhaseIndex >= 4,
    },
  ];
  const spinnerStateId = isSpinnerStateId(flow?.state?.id) ? flow.state.id : null;
  const spinnerStateKey = session && spinnerStateId
    ? `${session.id}:${spinnerStateId}:${sequence?.currentIndex ?? -1}`
    : null;
  useEffect(() => {
    const command = session?.remoteCommand;
    if (
      spinnerStateKey
      && spinnerStateId
      && command?.action === "spin-spinner"
      && command.stateId === spinnerStateId
      && command.receivedAt
    ) {
      setCompletedSpinnerStateKey(spinnerStateKey);
    }
  }, [session?.remoteCommand, spinnerStateId, spinnerStateKey]);
  const spinnerButton: RemoteDeckButton | null = spinnerStateId && spinnerStateKey
    ? {
        action: "spin-spinner",
        label: completedSpinnerStateKey === spinnerStateKey ? "Re-spin" : "Spin",
        detail: spinnerStateId === "learning-target-readers"
          ? "Choose today's two readers"
          : "Choose this week\'s iPad Kid",
        tone: spinnerStateId === "learning-target-readers" ? "purple" : "green",
      }
    : null;
  const stageLinks = useMemo(() => {
    const query = session ? `?session=${encodeURIComponent(session.id)}` : "";
    return {
      present: `/teacher/present${query}`,
      pace: `/teacher/pace${query}`,
    };
  }, [session]);
  const remoteTheme = flow?.state?.semantic
    ? CLASSROOM_STAGE_THEMES[flow.state.semantic]
    : classroomStageTheme(flow?.state?.id, flow?.state?.label);
  const remoteStyle = {
    "--remote-accent": flow?.state?.color || remoteTheme.accent,
    "--remote-base": remoteTheme.projectorBase,
    "--remote-panel": remoteTheme.projectorPanel,
  } as CSSProperties;
  const publicSurfacesLinked = flow?.presentation?.publicSurfaceMode === "linked";
  const isLearningCheckState = flow?.state?.id === "learning-check"
    || flow?.state?.semantic === "learning-check";
  const mainMirrorText = spinnerStateId === "learning-target-readers"
    ? "Learning intention and success criterion readers"
    : spinnerStateId === "ipad-kid"
      ? "This week\'s iPad Kid"
      : launchScoreboardAvailable
        ? finalScoreShowing ? "Final score: 60 to 40" : "Halftime score: 30 to 20"
        : isLearningCheckState
          ? "Learning intention and one success criterion"
          : flow?.presentation?.mainDisplay
            || flow?.presentation?.body
            || flow?.state?.description
            || "Waiting for the current lesson screen";
  const paceMirrorText = publicSurfacesLinked
    ? mainMirrorText
    : isLearningCheckState
      ? flow?.poll?.stage === "results" ? "Anonymous Fist-to-Five bars" : "Answer on your Chromebook"
      : isDiscussionState
        ? `${discussionPhase?.label || "Discussion"}: sentence stems and vocabulary`
        : flow?.presentation?.paceDirections
          || flow?.state?.description
          || "Waiting for current directions";
  const studentMirrorText = publicSurfacesLinked
    ? mainMirrorText
    : flow?.poll?.stage === "responding"
      ? flow.poll.question
      : isDiscussionState
        ? discussionPhase?.subtitle || flow?.presentation?.studentAction || "Use the current sentence stem"
        : flow?.presentation?.studentAction
          || flow?.state?.description
          || "Waiting for the current action";
  const currentPhaseLabel = discussionPhase
    ? `${flow?.state?.label || "Discussion"}: ${discussionPhase.label}`
    : flow?.state?.label || "Lesson ready";
  const connectionNeedsAttention = status.startsWith("Disconnected")
    || status.includes("did not confirm")
    || status.includes("failed");
  const connectionInFlight = Boolean(busy || pendingCommand);
  const connectionLabel = connectionNeedsAttention
    ? "Reconnecting"
    : connectionInFlight
      ? "Syncing"
      : "Classroom connected";
  const mirrorMeta = timer ? formatTime(timerSeconds) : "Ready";

  if (boardPanelOpen && session) {
    return (
      <main className="remote-write-page" style={remoteStyle}>
        <style>{`
          .remote-write-page { position:fixed; inset:0; display:grid; grid-template-rows:auto minmax(0,1fr); background:#f2ecdf; color:#28241e; font-family:var(--bdb-font); }
          .remote-write-bar { display:flex; align-items:center; justify-content:space-between; gap:14px; border-bottom:1px solid #d8d0c3; background:#fff; padding:10px 14px; box-shadow:0 6px 20px rgba(62,50,35,0.08); }
          .remote-write-copy { min-width:0; }
          .remote-write-copy strong { display:block; color:#28241e; font-size:1rem; }
          .remote-write-copy span { display:block; margin-top:2px; color:#756d62; font-size:0.76rem; font-weight:700; }
          .remote-write-back { min-height:48px; border:1px solid color-mix(in srgb,var(--remote-accent) 70%,#7f776c); border-radius:11px; background:color-mix(in srgb,var(--remote-accent) 15%,#fff); color:color-mix(in srgb,var(--remote-accent) 60%,#28241e); padding:0 16px; font:inherit; font-weight:900; cursor:pointer; }
          .remote-write-back:disabled { opacity:0.5; cursor:not-allowed; }
          .remote-write-actions { display:flex; align-items:center; gap:9px; }
          .remote-write-time { min-width:76px; color:#28241e; font-size:1.45rem; font-weight:900; font-variant-numeric:tabular-nums; text-align:center; }
          .remote-write-pause { min-height:48px; border:1px solid #c89c35; border-radius:11px; background:#fff5d8; color:#6e5211; padding:0 14px; font:inherit; font-weight:900; cursor:pointer; }
          .remote-write-pause:disabled { opacity:0.5; cursor:not-allowed; }
          .remote-write-back:focus-visible, .remote-write-pause:focus-visible { outline:3px solid var(--remote-accent); outline-offset:2px; }
          .remote-write-frame { width:100%; height:100%; border:0; background:#fff; }
          @media (max-width:720px) {
            .remote-write-bar { align-items:flex-start; flex-direction:column; }
            .remote-write-actions { width:100%; }
            .remote-write-back, .remote-write-pause { flex:1; }
          }
        `}</style>
        <header className="remote-write-bar">
          <div className="remote-write-copy">
            <strong>Writing on the main projector</strong>
            <span>The current problem stays visible beside this work space.</span>
          </div>
          <div className="remote-write-actions">
            <span className="remote-write-time">{timer ? formatTime(timerSeconds) : "--:--"}</span>
            <button className="remote-write-pause" type="button" disabled={controlsDisabled} onClick={() => { void send(STAGE_BUTTONS[1]); }}>
              {timer?.running ? "Pause" : "Resume"}
            </button>
            <button className="remote-write-back" type="button" disabled={controlsDisabled} onClick={() => { void setWritingMode(false); }}>Back to Remote</button>
          </div>
        </header>
        <iframe className="remote-write-frame" src={`/ipad?room=${encodeURIComponent(session.id)}`} title="iPad writing work space" />
      </main>
    );
  }

  return (
    <main className="remote-page" style={remoteStyle}>
      <style>{`
        .remote-page { min-height:100dvh; box-sizing:border-box; display:grid; place-items:center; overflow:hidden; background:radial-gradient(circle at 18% 12%,color-mix(in srgb,var(--remote-accent) 12%,transparent),transparent 32%),linear-gradient(145deg,#e9e3d8,#dcd4c7); color:#28241e; font-family:var(--bdb-font); padding:8px; }
        .remote-shell { width:min(100%,1194px); height:min(834px,calc(100dvh - 16px)); min-height:0; display:flex; flex-direction:column; overflow:hidden; border:1px solid #d5cdbf; border-radius:26px; background:#fbf6ea; box-shadow:0 24px 58px rgba(60,47,31,0.2); }
        .remote-head { min-height:60px; flex:none; display:flex; align-items:center; gap:10px; border-bottom:1px solid #ddd5c8; background:#fff; padding:8px 14px; }
        .remote-brand { min-width:0; display:flex; align-items:center; gap:11px; }
        .remote-mark { width:36px; height:36px; flex:none; display:grid; place-items:center; border-radius:10px; background:#28241e; color:#fff; font-size:0.7rem; font-weight:950; letter-spacing:0.04em; }
        .remote-brand-copy { min-width:0; }
        .remote-kicker { margin:0 0 2px; color:color-mix(in srgb,var(--remote-accent) 64%,#28241e); font-size:0.62rem; font-weight:900; letter-spacing:0.13em; text-transform:uppercase; }
        .remote-title { margin:0; color:#28241e; font-size:clamp(1rem,1.7vw,1.2rem); line-height:1; font-weight:900; }
        .remote-subtitle { margin:3px 0 0; color:#756d62; font-size:0.68rem; font-weight:700; }
        .remote-phase-chip { min-width:0; max-width:350px; display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:8px; margin-left:auto; border:1px solid color-mix(in srgb,var(--remote-accent) 42%,#d8d0c3); border-radius:999px; background:color-mix(in srgb,var(--remote-accent) 10%,#f7f1e6); padding:7px 11px; }
        .remote-phase-dot { width:9px; height:9px; border-radius:3px; background:var(--remote-accent); }
        .remote-phase-chip strong { overflow:hidden; color:#28241e; text-overflow:ellipsis; white-space:nowrap; font-size:0.74rem; font-weight:900; }
        .remote-phase-time { color:#28241e; font-size:1.05rem; font-weight:950; font-variant-numeric:tabular-nums; letter-spacing:-0.03em; }
        .remote-phase-time.finished { color:#9d3544; }
        .remote-phase-time.finished { color:#9d3544; }
        .remote-connection { min-height:34px; display:grid; grid-template-columns:auto auto; align-items:center; gap:1px 7px; border-radius:999px; background:#e8f5ed; color:#255e41; padding:5px 11px; }
        .remote-connection.attention { background:#fff0d7; color:#78531b; }
        .remote-connection-dot { grid-row:1 / 3; width:8px; height:8px; border-radius:50%; background:#2f9e6f; }
        .remote-connection.attention .remote-connection-dot { background:#c78b24; }
        .remote-connection strong { font-size:0.68rem; font-weight:900; line-height:1.1; }
        .remote-connection span { color:currentColor; opacity:0.72; font-size:0.57rem; font-weight:800; line-height:1.1; }
        .remote-status { flex:none; min-height:30px; margin:0; border-bottom:1px solid #e0d8cb; border-left:4px solid var(--remote-accent); background:#f7f1e6; color:#5f584f; padding:6px 14px; font-size:0.7rem; line-height:1.25; font-weight:780; }
        .remote-workspace { flex:1; min-height:0; display:grid; grid-template-columns:314px minmax(0,1fr); }
        .remote-mirrors { min-height:0; display:grid; grid-template-rows:auto repeat(3,minmax(0,1fr)); gap:10px; overflow:hidden; border-right:1px solid #dcd3c5; background:#f3eddf; padding:14px; }
        .mirror-rail-label { margin:0; color:#8a8175; font-size:0.62rem; font-weight:900; letter-spacing:0.12em; text-transform:uppercase; }
        .surface-mirror { min-height:0; display:flex; flex-direction:column; overflow:hidden; border:1px solid #d8d0c3; border-radius:12px; background:#fff; box-shadow:0 7px 18px rgba(73,57,36,0.07); }
        .surface-mirror-head { min-height:29px; flex:none; display:flex; align-items:center; gap:7px; border-bottom:1px solid #e2dacd; background:#fff; padding:5px 9px; }
        .surface-mirror-dot { width:8px; height:8px; flex:none; border-radius:2px; background:var(--remote-accent); }
        .surface-mirror-head strong { color:#5f584f; font-size:0.64rem; font-weight:900; }
        .surface-mirror-head span:last-child { margin-left:auto; color:#8a8175; font-size:0.58rem; font-weight:850; font-variant-numeric:tabular-nums; }
        .surface-mirror > p { flex:1; display:-webkit-box; align-content:center; overflow:hidden; margin:0; padding:10px 11px; color:#f5efe5; text-align:left; text-overflow:ellipsis; -webkit-box-orient:vertical; -webkit-line-clamp:4; font-size:0.76rem; line-height:1.3; font-weight:800; background:radial-gradient(circle at 20% 12%,color-mix(in srgb,var(--remote-accent) 15%,transparent),transparent 45%),var(--remote-base); }
        .surface-mirror.cream > p { color:#28241e; background:radial-gradient(circle at 84% 14%,color-mix(in srgb,var(--remote-accent) 12%,transparent),transparent 45%),#fbf6ea; }
        .remote-controls { min-height:0; display:grid; align-content:start; gap:12px; overflow:auto; background:#fbf6ea; padding:14px 16px 18px; scrollbar-color:#bdb3a4 transparent; }
        .remote-primary-stack { display:grid; gap:12px; }
        .remote-secondary { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(230px,0.85fr); gap:12px; align-items:start; }
        .remote-shell > .deck-section { margin:18px; overflow:auto; }
        .session-list { display:grid; gap:10px; }
        .session-choice { width:100%; min-height:72px; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:12px; align-items:center; border:1px solid #d8d0c3; border-radius:13px; background:#fff; color:#28241e; padding:14px 16px; font:inherit; text-align:left; cursor:pointer; box-shadow:0 7px 18px rgba(73,57,36,0.07); }
        .session-choice:hover, .session-choice:focus-visible { border-color:var(--remote-accent); outline:3px solid color-mix(in srgb,var(--remote-accent) 24%,transparent); outline-offset:2px; }
        .session-choice strong { display:block; color:#28241e; font-size:1rem; }
        .session-choice span { display:block; margin-top:3px; color:#756d62; font-size:0.78rem; font-weight:700; }
        .session-use { color:color-mix(in srgb,var(--remote-accent) 68%,#28241e) !important; font-size:0.72rem !important; font-weight:900 !important; letter-spacing:0.08em; text-transform:uppercase; }
        .current-card { min-width:0; border:1px solid #d8d0c3; border-top:5px solid var(--remote-accent); border-radius:15px; background:#fff; padding:14px; box-shadow:0 8px 22px rgba(73,57,36,0.08); }
        .current-label { margin:0 0 5px; color:color-mix(in srgb,var(--remote-accent) 66%,#28241e); font-size:0.64rem; font-weight:900; letter-spacing:0.11em; text-transform:uppercase; }
        .current-title { margin:0; color:#28241e; font-size:clamp(1.05rem,2.1vw,1.4rem); line-height:1.08; font-weight:900; }
        .current-notes-label { margin:11px 0 0; color:#756d62; font-size:0.62rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
        .current-directions { display:grid; gap:5px; margin:6px 0 0; padding-left:1.05rem; color:#4f4941; font-size:0.79rem; line-height:1.36; font-weight:720; }
        .current-directions li { padding-left:2px; }
        .current-directions li::marker { color:var(--remote-accent); }
        .current-next { margin:12px 0 0; color:#756d62; font-size:0.78rem; line-height:1.35; font-weight:740; }
        .current-live-note { display:inline-flex; margin:10px 0 0; border:1px solid #ddbd76; border-radius:999px; background:#fff4d7; color:#674b0f; padding:7px 10px; font-size:0.7rem; font-weight:900; }
        .private-plan { display:grid; gap:10px; border:1px solid #bfcfe3; border-left:5px solid #4d8df6; border-radius:15px; background:#f4f8ff; padding:13px; }
        .private-plan-head { display:grid; gap:3px; }
        .private-plan-title { margin:0; color:#355f9e; font-size:0.7rem; font-weight:900; letter-spacing:0.11em; text-transform:uppercase; }
        .private-plan-note { margin:0; color:#6f7c8e; font-size:0.68rem; font-weight:730; }
        .private-plan-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
        .private-plan-card { border:1px solid #d3deec; border-radius:10px; background:#fff; padding:10px 11px; }
        .private-plan-label { margin:0 0 5px; color:#466eaa; font-size:0.62rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
        .private-plan-body { margin:0; color:#374457; font-size:0.79rem; font-weight:720; line-height:1.38; white-space:pre-wrap; }
        .private-plan-materials { margin:0; padding-left:1.1rem; color:#445267; font-size:0.78rem; line-height:1.4; }
        .deck-section { display:grid; gap:10px; border:1px solid #d8d0c3; border-radius:15px; background:#fff; padding:13px; box-shadow:0 7px 18px rgba(73,57,36,0.06); }
        .remote-primary-stack > .deck-section:first-child { border-top:5px solid var(--remote-accent); }
        .deck-section.compact-private { box-shadow:none; }
        .deck-section-head { display:flex; justify-content:space-between; align-items:baseline; gap:12px; }
        .deck-section-title { margin:0; color:#28241e; font-size:0.7rem; font-weight:900; letter-spacing:0.11em; text-transform:uppercase; }
        .deck-section-note { margin:0; color:#756d62; font-size:0.7rem; font-weight:700; text-align:right; }
        .deck-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
        .deck-grid.stages { grid-template-columns:repeat(4,minmax(0,1fr)); }
        .deck-grid.discussion-phases { grid-template-columns:repeat(5,minmax(0,1fr)); }
        .deck-grid.discussion-controls { grid-template-columns:repeat(4,minmax(0,1fr)); }
        .deck-grid.spinner-control { grid-template-columns:1fr; }
        .discussion-selection { display:grid; gap:5px; border:1px solid #bba9dd; border-left:5px solid #8b5cf6; border-radius:12px; background:#f5efff; padding:11px 13px; }
        .discussion-selection span { color:#6d4aa7; font-size:0.62rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
        .discussion-selection strong { color:#322544; font-size:clamp(1.2rem,2.6vw,1.7rem); line-height:1; }
        .deck-key { min-height:68px; display:grid; align-content:center; gap:4px; border:1px solid #d5cdbf; border-bottom-width:3px; border-radius:12px; background:#fff; color:#28241e; padding:10px 11px; font:inherit; text-align:left; cursor:pointer; touch-action:manipulation; box-shadow:0 5px 12px rgba(73,57,36,0.08); transition:transform 100ms ease,box-shadow 100ms ease,border-color 100ms ease; }
        .deck-key:hover:not(:disabled) { border-color:color-mix(in srgb,var(--remote-accent) 62%,#9c9387); box-shadow:0 7px 16px rgba(73,57,36,0.12); }
        .deck-key:focus-visible { outline:3px solid color-mix(in srgb,var(--remote-accent) 42%,transparent); outline-offset:2px; }
        .deck-key:active:not(:disabled) { transform:translateY(2px); border-bottom-width:1px; box-shadow:0 2px 6px rgba(73,57,36,0.1); }
        .deck-key.active { outline:3px solid color-mix(in srgb,var(--remote-accent) 58%,#fff); outline-offset:2px; }
        .deck-key:disabled { opacity:0.46; cursor:not-allowed; }
        .deck-key-label { font-size:clamp(0.88rem,1.55vw,1.05rem); font-weight:900; line-height:1.06; }
        .deck-key-detail { color:#756d62; font-size:0.67rem; font-weight:720; line-height:1.2; }
        .deck-key.timer { border-color:#d4ad55; background:#fff5d8; color:#6e5211; }
        .deck-key.next, .deck-key.teal { border-color:#65ad99; background:#eaf8f3; color:#155f4c; }
        .deck-key.orange { border-color:#dd8a69; background:#fff0e8; color:#8b3f24; }
        .deck-key.blue { border-color:#87aee7; background:#edf4ff; color:#315f9d; }
        .deck-key.gold { border-color:#d4ad55; background:#fff5d8; color:#6e5211; }
        .deck-key.purple { border-color:#a995d2; background:#f4efff; color:#65459a; }
        .deck-key.green { border-color:#76b494; background:#edf8f1; color:#216947; }
        .deck-key.red { border-color:#d88d94; background:#fff0f1; color:#963b49; }
        .response-list { display:grid; gap:8px; margin:0; padding:0; list-style:none; }
        .response-row { display:grid; grid-template-columns:minmax(92px,0.8fr) minmax(0,1.8fr); gap:9px; border-top:1px solid #e1d9cc; padding-top:8px; color:#39342d; font-size:0.8rem; }
        .response-name { font-weight:900; }
        .response-answer { color:#635c53; overflow-wrap:anywhere; }
        .response-empty { margin:0; color:#756d62; font-size:0.8rem; font-weight:700; }
        .remote-links { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
        .remote-link, .remote-change, .remote-end { display:flex; min-height:50px; align-items:center; justify-content:center; border:1px solid #d5cdbf; border-radius:11px; background:#fff; color:#39342d; padding:0 11px; text-align:center; text-decoration:none; font:inherit; font-size:0.78rem; font-weight:850; cursor:pointer; }
        .remote-link:hover, .remote-change:hover { border-color:var(--remote-accent); }
        .remote-link:focus-visible, .remote-change:focus-visible, .remote-end:focus-visible { outline:3px solid color-mix(in srgb,var(--remote-accent) 36%,transparent); outline-offset:2px; }
        .remote-change { color:#6e5211; }
        .remote-end { flex:none; min-width:118px; margin-left:2px; border-color:#d88d94; background:#fff5f5; color:#963b49; }
        .remote-end:disabled { opacity:0.5; cursor:not-allowed; }
        .remote-utilities { overflow:hidden; border:1px solid #d8d0c3; border-radius:15px; background:#fff; box-shadow:0 7px 18px rgba(73,57,36,0.06); }
        .remote-utilities > summary { min-height:56px; box-sizing:border-box; display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:12px; padding:10px 13px; color:#28241e; cursor:pointer; list-style:none; font-size:0.76rem; font-weight:900; }
        .remote-utilities > summary::-webkit-details-marker { display:none; }
        .remote-utilities > summary::after { content:"Open"; border:1px solid #d5cdbf; border-radius:999px; background:#f7f1e6; padding:5px 9px; color:#756d62; font-size:0.62rem; letter-spacing:0.08em; text-transform:uppercase; }
        .remote-utilities[open] > summary::after { content:"Close"; }
        .remote-utilities > summary:focus-visible { outline:3px solid color-mix(in srgb,var(--remote-accent) 36%,transparent); outline-offset:-3px; }
        .remote-utilities-copy { min-width:0; display:grid; gap:2px; }
        .remote-utilities-copy strong { color:#28241e; font-size:0.72rem; letter-spacing:0.11em; text-transform:uppercase; }
        .remote-utilities-copy span { color:#756d62; font-size:0.68rem; font-weight:720; }
        .remote-utilities-body { display:grid; grid-template-columns:1fr 1fr; gap:12px; border-top:1px solid #e1d9cc; padding:12px; background:#f7f1e6; }
        .remote-utilities-body .deck-section { box-shadow:none; }
        .remote-utilities-body .remote-links { grid-column:1 / -1; }
        @media (max-width:920px) {
          .remote-page { place-items:start center; }
          .remote-shell { height:calc(100dvh - 16px); }
          .remote-head { min-height:58px; }
          .remote-workspace { grid-template-columns:1fr; grid-template-rows:auto minmax(0,1fr); }
          .remote-mirrors { grid-template-columns:repeat(3,minmax(0,1fr)); grid-template-rows:auto minmax(76px,94px); gap:8px; border-right:0; border-bottom:1px solid #dcd3c5; padding:9px 12px 10px; }
          .mirror-rail-label { grid-column:1 / -1; }
          .surface-mirror > p { -webkit-line-clamp:2; padding:8px 9px; font-size:0.68rem; }
          .surface-mirror-head { min-height:25px; padding:4px 7px; }
          .surface-mirror-head span:last-child { display:none; }
          .remote-controls { overflow:auto; padding:12px; }
          .remote-secondary { grid-template-columns:1fr 1fr; }
        }
        @media (max-width:680px) {
          .remote-page { padding:0; }
          .remote-shell { width:100%; height:100dvh; min-height:100dvh; border:0; border-radius:0; }
          .remote-head { align-items:center; flex-wrap:wrap; padding:8px 10px; }
          .remote-brand { flex:1 1 180px; }
          .remote-subtitle { display:none; }
          .remote-phase-chip { order:4; width:100%; max-width:none; box-sizing:border-box; margin-left:0; }
          .remote-connection { display:none; }
          .remote-end { min-width:100px; min-height:48px; }
          .remote-status { min-height:28px; padding:6px 10px; }
          .remote-mirrors { grid-template-rows:auto minmax(66px,78px); padding:8px; }
          .surface-mirror-head { min-height:22px; }
          .surface-mirror-head strong { font-size:0.58rem; }
          .surface-mirror > p { -webkit-line-clamp:2; padding:6px 7px; font-size:0.61rem; }
          .remote-controls { padding:10px; }
          .deck-grid, .deck-grid.stages { grid-template-columns:repeat(2,minmax(0,1fr)); }
          .deck-grid.discussion-phases, .deck-grid.discussion-controls { grid-template-columns:repeat(2,minmax(0,1fr)); }
          .deck-grid.discussion-phases .deck-key:last-child { grid-column:1 / -1; }
          .deck-grid.stages .deck-key.timer { grid-column:1 / -1; grid-row:1; }
          .remote-secondary, .remote-utilities-body { grid-template-columns:1fr; }
          .remote-utilities-body .remote-links { grid-column:auto; }
          .remote-links { grid-template-columns:1fr; }
          .deck-section-head { display:block; }
          .deck-section-note { margin-top:4px; text-align:left; }
          .private-plan-grid { grid-template-columns:1fr; }
        }
        @media (prefers-reduced-motion:reduce) { .deck-key { transition:none; } }
      `}</style>
      <section className="remote-shell">
        <header className="remote-head">
          <div className="remote-brand">
            <span className="remote-mark" aria-hidden="true">BDM</span>
            <div className="remote-brand-copy">
              <p className="remote-kicker">Private teacher controls</p>
              <h1 className="remote-title">Classroom Remote</h1>
              <p className="remote-subtitle">Confirm the class, then control its lesson, timer, Abbie, and audio.</p>
            </div>
          </div>
          {session ? (
            <div className="remote-phase-chip" aria-label={`Current state: ${currentPhaseLabel}. ${mirrorMeta} remaining.`}>
              <span className="remote-phase-dot" aria-hidden="true" />
              <strong>{currentPhaseLabel}</strong>
              <span className={`remote-phase-time${timerFinished ? " finished" : ""}`}>{mirrorMeta}</span>
            </div>
          ) : null}
          {session ? (
            <div className={`remote-connection${connectionNeedsAttention ? " attention" : ""}`} role="status" aria-label={`${connectionLabel}. Confirmed class ${session.joinCode || "without a join code"}.`}>
              <span className="remote-connection-dot" aria-hidden="true" />
              <strong>{connectionLabel}</strong>
              <span>Class {session.joinCode || "confirmed"}</span>
            </div>
          ) : null}
          {session ? (
            <button className="remote-end" type="button" disabled={endingSession} onClick={() => { void endSession(); }}>
              {endingSession ? "Ending session" : "End session"}
            </button>
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
            <div className="remote-workspace">
              <aside className="remote-mirrors" aria-label="Public screen mirrors">
                <p className="mirror-rail-label">Public screen mirrors</p>
                <SurfaceMirror label="Main" body={mainMirrorText} meta={mirrorMeta} tone="dark" />
                <SurfaceMirror label="Pace" body={paceMirrorText} meta={mirrorMeta} tone="dark" />
                <SurfaceMirror label="Student" body={studentMirrorText} meta="Synced" tone="cream" />
              </aside>

              <section className="remote-controls" aria-label="Classroom controls">
                <div className="remote-primary-stack">
                  <section className="deck-section" aria-labelledby="stage-controls-title">
                    <div className="deck-section-head">
                      <h2 className="deck-section-title" id="stage-controls-title">Current state controls</h2>
                      <p className="deck-section-note">
                        {isDiscussionState
                          ? "Use the routine controls below for each phase. Next state ends the discussion."
                          : flow?.poll?.stage === "results" && flow.poll.awaitingTeacherAdvance
                            ? "Results are showing. Tap Next state when ready."
                            : flow?.poll?.stage === "results" && sequence?.advanceMode === "automatic"
                              ? "Results are showing. The next stage will advance automatically."
                              : timer?.running
                                ? "Automatic pacing is running. Pause the timer to hold this stage."
                                : sequence?.advanceMode === "automatic"
                                  ? "Pacing is paused. Resume when the room is ready."
                                  : "Automatic pacing is off. Start when the room is ready."}
                      </p>
                    </div>
                    <div className="deck-grid stages">
                      {stageControlButtons.filter((button) => !(isDiscussionState && button.action === "toggle-timer")).map((button) => (
                        <DeckKey
                          key={button.action}
                          button={button}
                          busy={busy}
                          disabled={controlsDisabled}
                          onSend={send}
                        />
                      ))}
                      <DeckKey
                        button={{ action: "show-board", label: "Write on screen", detail: "Open the side whiteboard", tone: "blue" }}
                        busy={busy}
                        disabled={controlsDisabled || !flow?.presentation}
                        onSend={() => { void setWritingMode(true); }}
                      />
                    </div>
                    {spinnerButton ? (
                      <div className="deck-grid spinner-control">
                        <DeckKey button={spinnerButton} busy={busy} disabled={controlsDisabled} onSend={send} />
                      </div>
                    ) : null}
                    {scoreboardButton ? (
                      <div className="deck-grid spinner-control">
                        <DeckKey
                          button={scoreboardButton}
                          busy={busy}
                          disabled={controlsDisabled || finalScoreShowing}
                          onSend={send}
                        />
                      </div>
                    ) : null}
                    {!isDiscussionState ? (
                      <div className="deck-grid">
                        {TIMER_BUTTONS.map((button) => (
                          <DeckKey key={button.action} button={button} busy={busy} disabled={controlsDisabled} onSend={send} />
                        ))}
                      </div>
                    ) : null}
                  </section>

                  {isDiscussionState ? (
                    <section className="deck-section" aria-labelledby="discussion-controls-title">
                      <div className="deck-section-head">
                        <h2 className="deck-section-title" id="discussion-controls-title">Discussion routine</h2>
                        <p className="deck-section-note">
                          {discussionPhase
                            ? `${discussionPhase.label}. ${discussionPhase.running ? "Timer running." : discussionPhase.finished ? "Time is up." : discussionPhase.timed ? "Ready or paused." : "Use the class spinner to share."}`
                            : "Choose Think to open the five-part routine."}
                        </p>
                      </div>
                      <div className="deck-grid discussion-phases">
                        {DISCUSSION_PHASE_BUTTONS.map((button) => (
                          <DeckKey
                            key={button.action}
                            button={button}
                            busy={busy}
                            disabled={controlsDisabled}
                            active={button.action === activeDiscussionAction}
                            onSend={send}
                          />
                        ))}
                      </div>
                      <div className="deck-grid discussion-controls">
                        {discussionControlButtons.map(({ button, disabled }) => (
                          <DeckKey
                            key={button.action}
                            button={button}
                            busy={busy}
                            disabled={controlsDisabled || disabled}
                            onSend={send}
                          />
                        ))}
                      </div>
                      {discussionPhase?.id === "share" ? (
                        <>
                          {discussionPhase.selectedSharer ? (
                            <div className="discussion-selection"><span>Ready to share</span><strong>{discussionPhase.selectedSharer}</strong></div>
                          ) : null}
                          <div className="deck-grid spinner-control">
                            <DeckKey
                              button={{
                                action: "discussion-pick-sharer",
                                label: discussionPhase.selectedSharer ? "Choose another sharer" : "Choose sharer",
                                detail: "Choose from joined students first",
                                tone: "purple",
                              }}
                              busy={busy}
                              disabled={controlsDisabled}
                              onSend={send}
                            />
                          </div>
                        </>
                      ) : null}
                    </section>
                  ) : null}
                </div>

                <div className="remote-secondary" aria-label="Private lesson context">
                  <section className="current-card" aria-label="Speaker notes">
                    <p className="current-label">{lesson?.code || "Live lesson"} · {sequence ? `Step ${sequence.currentIndex + 1} of ${sequence.totalSteps}` : "Current step"}</p>
                    <h2 className="current-title">{flow?.state?.label || "Waiting for a lesson step"}</h2>
                    <p className="current-notes-label">Speaker notes</p>
                    <ul className="current-directions" aria-label="Private speaker notes">
                      {currentSpeakerNotes.map((note, index) => <li key={`${index}-${note}`}>{note}</li>)}
                    </ul>
                    {launchScoreboardAvailable ? (
                      <p className="current-live-note">{finalScoreShowing ? "Final score 60 to 40 is showing" : "Halftime score 30 to 20 is showing"}</p>
                    ) : null}
                    <p className="current-next"><strong>Next:</strong> {sequence?.nextLabel || "Lesson closeout"}{sequence?.nextDirections ? ` - ${sequence.nextDirections}` : ""}</p>
                  </section>

                  <section className="deck-section compact-private" aria-labelledby="response-title">
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
                </div>

                {privateSmallGroupPlan ? (
                  <section className="private-plan" aria-labelledby="private-small-group-title">
                    <div className="private-plan-head">
                      <h2 className="private-plan-title" id="private-small-group-title">Private small-group plan</h2>
                      <p className="private-plan-note">Only this teacher Remote receives these notes.</p>
                    </div>
                    <div className="private-plan-grid">
                      {[
                        ["Pull", privateSmallGroupPlan.pull],
                        ["Focus", privateSmallGroupPlan.focus],
                        ["Activity", privateSmallGroupPlan.activity],
                        ["Check", privateSmallGroupPlan.check],
                      ].map(([label, body]) => (
                        <article className="private-plan-card" key={label}>
                          <p className="private-plan-label">{label}</p>
                          <p className="private-plan-body">{body}</p>
                        </article>
                      ))}
                    </div>
                    {privateSmallGroupPlan.materials.length ? (
                      <article className="private-plan-card">
                        <p className="private-plan-label">Materials</p>
                        <ul className="private-plan-materials">
                          {privateSmallGroupPlan.materials.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      </article>
                    ) : null}
                  </section>
                ) : null}

                <details className="remote-utilities">
                  <summary>
                    <span className="remote-utilities-copy">
                      <strong>Utilities</strong>
                      <span>Abbie, sound cues, projector links, and session switching</span>
                    </span>
                  </summary>
                  <div className="remote-utilities-body">
                    <section className="deck-section" aria-labelledby="abbie-controls-title">
                      <div className="deck-section-head">
                        <h2 className="deck-section-title" id="abbie-controls-title">Abbie AI</h2>
                        <p className="deck-section-note">Speaks from the classroom computer.</p>
                      </div>
                      <div className="deck-grid">
                        {ABBIE_REMOTE_BUTTONS.map((button) => <DeckKey key={button.action} button={button} busy={busy} disabled={controlsDisabled} onSend={send} />)}
                      </div>
                    </section>

                    <section className="deck-section" aria-labelledby="sound-controls-title">
                      <div className="deck-section-head">
                        <h2 className="deck-section-title" id="sound-controls-title">Sound effects</h2>
                        <p className="deck-section-note">Uploaded or built-in cues.</p>
                      </div>
                      <div className="deck-grid">
                        {SOUND_REMOTE_BUTTONS.map((button) => <DeckKey key={button.action} button={button} busy={busy} disabled={controlsDisabled} onSend={send} />)}
                      </div>
                    </section>

                    <div className="remote-links">
                      <a className="remote-link" href={stageLinks.present} target="_blank" rel="noreferrer">Open main projector</a>
                      <a className="remote-link" href={stageLinks.pace} target="_blank" rel="noreferrer">Open Pace + Support</a>
                      <button className="remote-change" type="button" onClick={changeSession}>Change session</button>
                    </div>
                  </div>
                </details>
              </section>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
