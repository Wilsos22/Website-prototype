import { publicSuccessCriterion } from "./successCriterion";
import { usesDiscussionProtocol } from "./classroomPilot";
import { normalizeDiscussionPhaseSnapshot, type DiscussionPhaseSnapshot } from "./discussionProtocol";

export type LivePollKind = "short-answer" | "multiple-choice" | "fist-to-five";

export type RemoteNextBehavior = "reveal-results" | "advance";

export function shouldRunNavigationDestination(
  advanceMode: "manual" | "automatic" | null | undefined,
  timerRunning: boolean | null | undefined,
  timerFinished: boolean | null | undefined,
  pollStage: "responding" | "results" | null | undefined,
): boolean {
  if (timerRunning) return true;
  return advanceMode === "automatic" && (Boolean(timerFinished) || pollStage === "results");
}

type NavigationFlowClock = {
  state?: {
    id?: string | null;
    label?: string | null;
  } | null;
  timer?: {
    running?: boolean | null;
    finished?: boolean | null;
  } | null;
  phase?: DiscussionPhaseSnapshot | null;
};

/**
 * Resolve pacing across normal timers and Discussion's round timer.
 * Discussion intentionally disarms the main timer, so navigation must read the
 * active round or an iPad Next/Back would accidentally pause automatic pacing.
 */
export function shouldRunFlowNavigationDestination(
  advanceMode: "manual" | "automatic" | null | undefined,
  flow: NavigationFlowClock,
  pollStage: "responding" | "results" | null | undefined,
): boolean {
  const phase = usesDiscussionProtocol(flow.state?.id || "", flow.state?.label || "")
    ? normalizeDiscussionPhaseSnapshot(flow.phase)
    : null;
  return shouldRunNavigationDestination(
    advanceMode,
    phase?.running ?? flow.timer?.running,
    phase?.finished ?? flow.timer?.finished,
    pollStage,
  );
}

export function resolveRemoteNextBehavior(
  stateId: string | null | undefined,
  semantic: string | null | undefined,
  pollStage: "responding" | "results" | null | undefined,
): RemoteNextBehavior {
  const isLearningCheck = stateId === "learning-check" || semantic === "learning-check";
  return isLearningCheck && pollStage === "responding" ? "reveal-results" : "advance";
}

export function canRevealM2T1L1FinalScore(
  lessonCode: string | null | undefined,
  stateId: string | null | undefined,
  semantic: string | null | undefined,
): boolean {
  return /^M2\.T1\.L1(?:-|$)/i.test((lessonCode || "").trim())
    && (stateId === "launch" || stateId === "scenario" || semantic === "scenario");
}

function normalizedSharerNames(names: readonly string[]): string[] {
  return names
    .map((name) => name.trim().slice(0, 120))
    .filter((name, index, source) => Boolean(name) && source.indexOf(name) === index);
}

export function pickRemoteSharerName(
  joinedStudentNames: readonly string[],
  periodRosterNames: readonly string[],
  randomValue = Math.random(),
): string | null {
  const joined = normalizedSharerNames(joinedStudentNames);
  const candidates = joined.length ? joined : normalizedSharerNames(periodRosterNames);
  if (!candidates.length) return null;
  const normalizedRandom = Number.isFinite(randomValue)
    ? Math.max(0, Math.min(randomValue, 0.9999999999999999))
    : 0;
  return candidates[Math.floor(normalizedRandom * candidates.length)] || candidates[0] || null;
}

export const LIVE_RESPONSE_MODES = [
  "None",
  "Google Form",
  "Paper",
  "Short Answer",
  "Multiple Choice",
  "Fist to Five",
  "Assigned Tool",
  "Physical Response",
] as const;

export type LiveResponseMode = (typeof LIVE_RESPONSE_MODES)[number];

export function liveResponseModePollKind(responseMode: string | undefined): LivePollKind | null {
  const normalized = responseMode?.trim().toLowerCase();
  if (normalized === "short answer") return "short-answer";
  if (normalized === "multiple choice") return "multiple-choice";
  if (normalized === "fist to five") return "fist-to-five";
  return null;
}

function isLivePollKind(value: string | undefined): value is LivePollKind {
  return value === "short-answer" || value === "multiple-choice" || value === "fist-to-five";
}

/**
 * Resolve the digital response surface for a lesson step.
 *
 * New lessons use Response Mode. Older published lessons may only have Poll
 * Kind, so a blank Response Mode must preserve that configuration. An explicit
 * non-digital mode such as None or Paper always wins and suppresses the legacy
 * poll. The final state fallback keeps old Question and Learning Check steps
 * actionable instead of showing directions for a control that never opens.
 */
export function resolveLiveStepPollKind(
  responseMode: string | undefined,
  pollKind: string | undefined,
  stateId?: string,
): LivePollKind | null {
  if (responseMode?.trim()) return liveResponseModePollKind(responseMode);
  if (isLivePollKind(pollKind)) return pollKind;
  if (stateId === "question") return "short-answer";
  if (stateId === "poll" || stateId === "learning-check") return "fist-to-five";
  return null;
}

export type LiveIndependentSupportLesson = {
  selectedSuccessCriterion?: string;
  learningIntention?: string;
  helpPath?: string;
  requiredDigitalWork?: string;
  optionalSupport?: string;
  bigDogChallenge?: string;
  dueAndTurnIn?: string;
};

export type LiveIndependentSupportItem = {
  label: string;
  body: string;
};

/**
 * Build the Chromebook support categories for independent work.
 * Required paper work stays in the primary action area, so these cards add
 * only the digital, help, timing, and optional extension information.
 */
export function liveIndependentSupportItems(
  stateId: string | undefined,
  lesson: LiveIndependentSupportLesson | null | undefined,
): LiveIndependentSupportItem[] {
  if (stateId !== "independent" && stateId !== "you-do") return [];

  return [
    { label: "Today's goal", body: publicSuccessCriterion(lesson?.selectedSuccessCriterion) },
    { label: "Help path", body: lesson?.helpPath || "" },
    { label: "Required digital work", body: lesson?.requiredDigitalWork || "" },
    { label: "Optional support", body: lesson?.optionalSupport || "" },
    { label: "Big Dog Challenge", body: lesson?.bigDogChallenge || "" },
    { label: "Due and turn in", body: lesson?.dueAndTurnIn || "" },
  ].filter((item) => item.body.trim());
}

const ASSIGNED_TOOL_ROUTES: Record<string, string> = {
  whiteboard: "/whiteboard",
  numberline: "/number-line-plus",
  doublenumberline: "/number-line-plus",
  numberlineplus: "/number-line-plus",
  percentbar: "/percent-bar",
  equationbuilder: "/equation-builder",
  gems: "/order-of-operations",
  orderofoperations: "/order-of-operations",
  fractionbars: "/fraction-bars",
  algebratiles: "/algebra-tiles",
  areamodel: "/area-model",
  areaexplorer: "/area-explorer",
  areaofshapes: "/area-explorer",
  combineliketerms: "/combine-like-terms",
  combiningliketerms: "/combine-like-terms",
  laddermethod: "/ladder-method",
  ladder: "/ladder-method",
  proportions: "/proportions",
  groupbars: "/group-bars",
  coordinategrid: "/coordinate-grid",
  coordinateplane: "/coordinate-grid",
  termidentifier: "/term-identifier",
  multiplicationfacts: "/multiplication-fluency",
  multiplicationfluency: "/multiplication-fluency",
  balancebeam: "/balance-beam",
  distributivearea: "/distributive-area",
};

export function liveAssignedToolRoute(toolName: string | undefined): string | null {
  if (!toolName) return null;
  const normalized = toolName.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^bigdogmath/, "");
  return ASSIGNED_TOOL_ROUTES[normalized] || null;
}

export function splitLiveFlowLines(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\r?\n+/)
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean);
}

export function splitLiveFlowVocabulary(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(/[\n,;]+/).map((word) => word.trim()).filter(Boolean);
}
