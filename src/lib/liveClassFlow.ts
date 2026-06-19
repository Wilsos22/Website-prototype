// Shared client-safe contracts for the teacher control runtime and student live flow.

export const LIVE_FLOW_MODE = "live-flow";
export const LIVE_FLOW_ROUTE = "/live-flow";
export const STUDENT_SESSION_KEY = "bdm-student-session";
export const TEACHER_SESSION_KEY = "bdm-teacher-session";

export type DiscussionPhaseId = "think" | "marker" | "table" | "revise" | "share";
export type LivePollKind = "short-answer" | "multiple-choice" | "fist-to-five";
export type LiveToolRoute =
  | "/whiteboard"
  | "/number-line-plus"
  | "/percent-bar"
  | "/equation-builder"
  | "/order-of-operations"
  | "/fraction-bars"
  | "/algebra-tiles";

export type LiveToolConfig =
  | {
      id: string;
      route: "/whiteboard" | "/fraction-bars";
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
  tool: LiveToolConfig | null;
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
