// Shared client-safe contracts for the teacher control runtime and student live flow.

import type { ClassroomStageId } from "@/lib/classroomPilot";
import type { LivePollKind } from "@/lib/liveFlowContract";
import type { PublicLessonRoutineConfig } from "@/lib/lessonRoutineConfig";
import type { PublicSurfaceMode } from "@/lib/lessonStepMetadata";
import type { DiscussionPhaseSnapshot } from "@/lib/discussionProtocol";

export {
  LIVE_RESPONSE_MODES,
  canRevealM2T1L1FinalScore,
  isChoicePollKind,
  liveAssignedToolRoute,
  liveIndependentSupportItems,
  liveResponseModePollKind,
  pickRemoteSharerName,
  resolveLiveStepPollKind,
  resolveRemoteNextBehavior,
  shouldRunFlowNavigationDestination,
  shouldRunNavigationDestination,
  splitLiveFlowLines,
  splitLiveFlowVocabulary,
} from "@/lib/liveFlowContract";
export type { LivePollKind, LiveResponseMode } from "@/lib/liveFlowContract";
export type { DiscussionPhaseId, DiscussionPhaseSnapshot } from "@/lib/discussionProtocol";

export const LIVE_FLOW_MODE = "live-flow";
export const LIVE_FLOW_ROUTE = "/live-flow";
export const STUDENT_SESSION_KEY = "bdm-student-session";
export const TEACHER_SESSION_KEY = "bdm-teacher-session";
export const CLASS_MODE_EXIT_KEY = "bdm-class-mode-exited";
export const REMOTE_COMMAND_STALE_MS = 15_000;
export const MAX_LIVE_STATE_SECONDS = 120 * 60;

export const DISCUSSION_REMOTE_ACTIONS = [
  "discussion-think",
  "discussion-write",
  "discussion-discuss",
  "discussion-revise",
  "discussion-share",
  "discussion-pick-sharer",
  "discussion-previous",
  "discussion-next",
  "discussion-restart",
  "discussion-toggle",
] as const;
export type DiscussionRemoteAction = (typeof DISCUSSION_REMOTE_ACTIONS)[number];
export const TEACHER_REMOTE_ACTIONS = [
  "next",
  "previous",
  "toggle-timer",
  "add-30",
  "subtract-30",
  "reset-timer",
  "show-board",
  "hide-board",
  "spin-spinner",
  ...DISCUSSION_REMOTE_ACTIONS,
  "reveal-results",
  "reveal-final-score",
  "transition-now",
  "play-warning",
  "play-countdown",
  "play-times-up",
  "abbie-hype",
  "abbie-goal",
  "abbie-move",
  "abbie-settle",
  "abbie-roast",
  "abbie-stuck",
] as const;
export type TeacherRemoteAction = (typeof TEACHER_REMOTE_ACTIONS)[number];

const DISCUSSION_REMOTE_ACTION_SET = new Set<string>(DISCUSSION_REMOTE_ACTIONS);

export function isDiscussionRemoteAction(action: TeacherRemoteAction): action is DiscussionRemoteAction {
  return DISCUSSION_REMOTE_ACTION_SET.has(action);
}
export type LiveToolRoute =
  | "/whiteboard"
  | "/number-line-plus"
  | "/percent-bar"
  | "/equation-builder"
  | "/balance-beam"
  | "/distributive-area"
  | "/area-explorer"
  | "/order-of-operations"
  | "/fraction-bars"
  | "/algebra-tiles"
  | "/area-model"
  | "/multiplication-fluency"
  | "/combine-like-terms"
  | "/ladder-method"
  | "/group-bars"
  | "/proportions"
  | "/coordinate-grid"
  | "/term-identifier"
  | "/challenge"
  | "/exit-ticket"
  | "/checkpoint";

export type LiveToolConfig =
  | {
      id: string;
      route:
        | "/whiteboard"
        | "/balance-beam"
        | "/area-explorer"
        | "/fraction-bars"
        | "/area-model"
        | "/multiplication-fluency"
        | "/combine-like-terms"
        | "/group-bars"
        | "/proportions"
        | "/coordinate-grid"
        | "/term-identifier"
        | "/challenge"
        | "/exit-ticket"
        | "/checkpoint";
      label: string;
      prompt: string;
      config: Record<string, never>;
    }
  | {
      id: string;
      route: "/number-line-plus";
      label: string;
      prompt: string;
      config: { start: number; change: number };
    }
  | {
      id: string;
      route: "/percent-bar";
      label: string;
      prompt: string;
      config: { whole: number; percent: number; part: number; unknown: "part" | "whole" | "percent" };
    }
  | {
      id: string;
      route: "/equation-builder";
      label: string;
      prompt: string;
      config: { coefficient: number; constant: number; solution: number };
    }
  | {
      id: string;
      route: "/order-of-operations" | "/algebra-tiles";
      label: string;
      prompt: string;
      config: { expression: string };
    }
  | {
      id: string;
      // `set` is the shared "24x7,16x8" problem-set string (see
      // lib/distributiveProblems). Empty means free play — students pick their
      // own numbers, same as visiting the tool directly.
      route: "/distributive-area";
      label: string;
      prompt: string;
      config: { set: string };
    }
  | {
      id: string;
      // `set` is a "24,36,60" number sequence for the Factor Trees mode (see
      // lib/factorTreeSet). Empty means free play - the tool's built-in
      // sequence, same as visiting the route directly.
      route: "/ladder-method";
      label: string;
      prompt: string;
      config: { set: string };
    };

export interface LiveFlowSequenceStep {
  stateId: string;
  label: string;
  description: string;
  color: string;
  semantic: ClassroomStageId;
  durationSeconds: number;
  question: string;
  pollKind: LivePollKind | null;
  choices: string[];
  correctAnswer: string;
  standard: string;
  resourceUrl: string;
  paperTask: string;
  notionStepId: string | null;
  notionLessonId: string | null;
  lessonCode: string;
  mainDisplay?: string;
  paceDirections?: string;
  studentAction?: string;
  remoteActions?: string;
  discussionStems?: string[];
  vocabulary?: string[];
  responseMode?: string;
  workSpaceAvailable?: boolean;
  publicSurfaceMode?: PublicSurfaceMode;
  routineConfig?: PublicLessonRoutineConfig | null;
}

export interface LiveClassFlowSnapshot {
  version: 2;
  updatedAt: string;
  transition?: {
    token: string;
    startedAt: string;
  };
  state: {
    id: string;
    label: string;
    description: string;
    color: string;
    semantic?: ClassroomStageId;
  } | null;
  phase: DiscussionPhaseSnapshot | null;
  timer: {
    totalSeconds: number;
    secondsLeft: number;
    running: boolean;
    finished: boolean;
    endsAt?: string | null;
  } | null;
  poll: {
    id: string;
    kind: LivePollKind;
    question: string;
    choices: string[] | null;
    stage: "responding" | "results";
    awaitingTeacherAdvance?: boolean;
  } | null;
  resource: {
    label: string;
    url: string;
  } | null;
  presentation: {
    title: string;
    body: string;
    mainDisplay?: string;
    mode: "board" | "directions" | "resource" | "poll" | "tool";
    notionStepId: string | null;
    boardOpen?: boolean;
    paceDirections?: string;
    studentAction?: string;
    remoteActions?: string;
    responseMode?: string;
    workSpaceAvailable?: boolean;
    publicSurfaceMode?: PublicSurfaceMode;
    routineConfig?: PublicLessonRoutineConfig | null;
    discussionStems?: string[];
    vocabulary?: string[];
    scoreboardStage?: "halftime" | "final";
  } | null;
  tool: LiveToolConfig | null;
  lesson?: {
    id: string | null;
    code: string;
    title: string;
    learningIntention: string;
    successCriteria: string;
    selectedSuccessCriterion?: string;
    classroomMode?: string;
    discussionStems?: string[];
    discussionVocabulary?: string[];
    requiredPaperWork?: string;
    requiredDigitalWork?: string;
    optionalSupport?: string;
    bigDogChallenge?: string;
    dueAndTurnIn?: string;
    helpPath?: string;
    anchorProblem?: string;
  } | null;
  sequence?: {
    currentIndex: number;
    totalSteps: number;
    nextLabel: string | null;
    nextDirections: string | null;
    advanceMode: "manual" | "automatic";
    steps?: LiveFlowSequenceStep[];
  } | null;
  // An ad-hoc "Transition now" moment: the room moves while the state clock
  // pauses. Cleared by the lazy pacing check when endsAt passes (the paused
  // clock resumes), or by any Next/Back navigation.
  interlude?: {
    stateId: string;
    label: string;
    color: string;
    directions: string;
    totalSeconds: number;
    endsAt: string;
    resumeRunning: boolean;
  } | null;
  paper?: {
    task: string;
  } | null;
}

export function liveTimerSeconds(
  timer: LiveClassFlowSnapshot["timer"],
  now = Date.now(),
): number {
  if (!timer) return 0;
  const fallback = Number.isFinite(timer.secondsLeft)
    ? Math.max(0, Math.min(MAX_LIVE_STATE_SECONDS, Math.round(timer.secondsLeft)))
    : 0;
  if (!timer.running || !timer.endsAt) return fallback;
  const end = Date.parse(timer.endsAt);
  if (!Number.isFinite(end)) return fallback;
  return Math.max(0, Math.min(MAX_LIVE_STATE_SECONDS, Math.ceil((end - now) / 1000)));
}

export interface TeacherRemoteCommand {
  nonce: string;
  action: TeacherRemoteAction;
  issuedAt: string;
  receivedAt?: string;
  stateId?: string;
}

// A single thing Abbie says, broadcast to joined student screens. `nonce` is
// unique per utterance so a device shows each line exactly once. Lives in its
// own sessions.abbie column so it's independent of class-mode broadcast state —
// she can pop up over the lesson, a tool, or the Live Flow screen.
export interface AbbieBroadcast {
  nonce: string;
  text: string;
  at: string;
}

export interface StoredStudentSession {
  sessionId: string;
  studentId: string;
  name: string;
  syncKey?: string;
}

export function getStoredStudentSession(): StoredStudentSession | null {
  try {
    const stored = localStorage.getItem(STUDENT_SESSION_KEY);
    if (!stored) return null;
    const session = JSON.parse(stored) as Partial<StoredStudentSession>;
    return typeof session.sessionId === "string"
      && typeof session.studentId === "string"
      && typeof session.name === "string"
      ? {
          sessionId: session.sessionId,
          studentId: session.studentId,
          name: session.name,
          ...(typeof session.syncKey === "string" && session.syncKey.trim()
            ? { syncKey: session.syncKey.trim() }
            : {}),
        }
      : null;
  } catch {
    return null;
  }
}

export function getStoredStudentSessionId(): string | null {
  return getStoredStudentSession()?.sessionId ?? null;
}

export function clearStoredStudentSession(sessionId?: string): void {
  try {
    if (sessionId) {
      const stored = getStoredStudentSessionId();
      if (stored && stored !== sessionId) return;
    }
    localStorage.removeItem(STUDENT_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function markClassModeExited(): void {
  try {
    localStorage.setItem(CLASS_MODE_EXIT_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearClassModeExitMarker(): void {
  try {
    localStorage.removeItem(CLASS_MODE_EXIT_KEY);
  } catch {
    /* ignore */
  }
}

export function hasClassModeExitMarker(): boolean {
  try {
    return localStorage.getItem(CLASS_MODE_EXIT_KEY) === "1";
  } catch {
    return false;
  }
}

export function leaveClassMode(): void {
  clearStoredStudentSession();
  markClassModeExited();
}

// Per-TAB marker (sessionStorage is not shared across tabs/windows). Set when a
// device joins as a student, so a single browser can run a teacher tab AND a
// student tab at once for testing: the joined tab follows class mode even though
// the browser also has a teacher session stored.
export const STUDENT_TAB_KEY = "bdm-student-tab";

export function markStudentTab(): void {
  try {
    sessionStorage.setItem(STUDENT_TAB_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function isStudentTab(): boolean {
  try {
    return sessionStorage.getItem(STUDENT_TAB_KEY) === "1";
  } catch {
    return false;
  }
}

export function getStoredTeacherSessionId(): string | null {
  try {
    const stored = localStorage.getItem(TEACHER_SESSION_KEY);
    if (!stored) return null;
    const session = JSON.parse(stored) as { sessionId?: unknown };
    return typeof session.sessionId === "string" && session.sessionId ? session.sessionId : null;
  } catch {
    return null;
  }
}

export function getStoredTeacherSession(): { sessionId: string; code: string; periodName: string } | null {
  try {
    const stored = localStorage.getItem(TEACHER_SESSION_KEY);
    if (!stored) return null;
    const s = JSON.parse(stored) as { sessionId?: unknown; code?: unknown; periodName?: unknown };
    if (typeof s.sessionId !== "string" || !s.sessionId) return null;
    return {
      sessionId: s.sessionId,
      code: typeof s.code === "string" ? s.code : "",
      periodName: typeof s.periodName === "string" ? s.periodName : "",
    };
  } catch {
    return null;
  }
}

export function saveTeacherSession(sessionId: string, code: string, periodName: string): void {
  try {
    localStorage.setItem(TEACHER_SESSION_KEY, JSON.stringify({ sessionId, code, periodName }));
  } catch {
    /* ignore */
  }
}

export function clearStoredTeacherSession(sessionId?: string): void {
  try {
    if (sessionId) {
      const stored = getStoredTeacherSessionId();
      if (stored && stored !== sessionId) return;
    }
    localStorage.removeItem(TEACHER_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
