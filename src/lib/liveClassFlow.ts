// Shared client-safe contracts for the teacher control runtime and student live flow.

export const LIVE_FLOW_MODE = "live-flow";
export const LIVE_FLOW_ROUTE = "/live-flow";
export const STUDENT_SESSION_KEY = "bdm-student-session";
export const TEACHER_SESSION_KEY = "bdm-teacher-session";
export const CLASS_MODE_EXIT_KEY = "bdm-class-mode-exited";

export type DiscussionPhaseId = "think" | "marker" | "table" | "revise" | "share";
export type LivePollKind = "short-answer" | "multiple-choice" | "fist-to-five";
export type TeacherRemoteAction = "next" | "previous" | "toggle-timer" | "add-30" | "subtract-30" | "reset-timer";
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
        | "/distributive-area"
        | "/area-explorer"
        | "/fraction-bars"
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
    };

export interface DiscussionPhaseSnapshot {
  id: DiscussionPhaseId;
  label: string;
  subtitle: string;
  timed: boolean;
  totalSeconds: number | null;
  secondsLeft: number | null;
  running: boolean;
  finished: boolean;
  media: {
    url: string;
    type: "image" | "video" | "embed";
  } | null;
  sentenceStems?: string[];
  keyVocabulary?: string[];
}

export interface LiveClassFlowSnapshot {
  version: 1;
  updatedAt: string;
  state: {
    id: string;
    label: string;
    description: string;
    color: string;
  } | null;
  phase: DiscussionPhaseSnapshot | null;
  timer: {
    totalSeconds: number;
    secondsLeft: number;
    running: boolean;
    finished: boolean;
  } | null;
  poll: {
    id: string;
    kind: LivePollKind;
    question: string;
    choices: string[] | null;
    stage: "responding" | "results";
  } | null;
  resource: {
    label: string;
    url: string;
  } | null;
  presentation: {
    title: string;
    body: string;
    mode: "board" | "directions" | "resource" | "poll" | "tool";
    notionStepId: string | null;
  } | null;
  tool: LiveToolConfig | null;
}

export interface TeacherRemoteCommand {
  nonce: string;
  action: TeacherRemoteAction;
  issuedAt: string;
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
}

export function getStoredStudentSession(): StoredStudentSession | null {
  try {
    const stored = localStorage.getItem(STUDENT_SESSION_KEY);
    if (!stored) return null;
    const session = JSON.parse(stored) as Partial<StoredStudentSession>;
    return typeof session.sessionId === "string"
      && typeof session.studentId === "string"
      && typeof session.name === "string"
      ? { sessionId: session.sessionId, studentId: session.studentId, name: session.name }
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
