"use client";

// Teacher Classroom Control Panel — front-of-room display.
// Bank (bottom): pull states into the day's LINEUP (sequence) with a running
//   total vs. a 55-minute period.
// Each state loads an adjustable countdown. After Start, the timed sequence
// advances automatically until the teacher pauses or stops it.
// Ending sequence: 30-second alert, giant on-screen 10-to-1 countdown with ticks,
//   flash at zero.
// Upload your own sounds (warm-up music + cue sounds). They're remembered on
//   this computer (stored in the browser). No upload = simple built-in beep.

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import StudentSpinner from "@/components/StudentSpinner";
import DiscussionProtocol from "@/components/DiscussionProtocol";
import AbbieConsole from "@/components/AbbieConsole";
import RedBullCounter from "@/components/RedBullCounter";
import LessonVisual from "@/components/LessonVisual";
import { requestAbbieLine } from "@/lib/abbieBus";
import { abbieDirectionForRemoteAction } from "@/lib/remoteDeck";
import { discussionSupportsForLesson, inferClassroomStage, usesDiscussionProtocol } from "@/lib/classroomPilot";
import { TeacherApiError, teacherApiRequest, teacherPost } from "@/lib/teacherApi";
import {
  LIVE_FLOW_MODE,
  REMOTE_COMMAND_STALE_MS,
  canRevealM2T1L1FinalScore,
  clearStoredTeacherSession,
  getStoredTeacherSessionId,
  isDiscussionRemoteAction,
  liveAssignedToolRoute,
  resolveLiveStepPollKind,
  liveTimerSeconds,
  splitLiveFlowLines,
  splitLiveFlowVocabulary,
  type DiscussionPhaseSnapshot,
  type LiveClassFlowSnapshot,
  type LivePollKind,
  type LiveToolConfig,
  type LiveToolRoute,
  type TeacherRemoteCommand,
} from "@/lib/liveClassFlow";
import {
  listLessonPresets,
  getLessonPreset,
  saveLessonPreset,
  deleteLessonPreset,
  type LessonPreset,
} from "@/lib/lessonPresets";
import { SKILLS } from "@/lib/challengeSkills";
import { launchChallenge, endChallenge, fetchLeaderboard, type ChallengeRow, type LeaderRow } from "@/lib/challenges";
import { launchExitTicket, type ExitKind } from "@/lib/exitTickets";
import { SBAC_CHECKPOINTS, getCheckpoint } from "@/lib/sbacCheckpoints";
import { launchCheckpoint } from "@/lib/checkpoints";
import { resolveLessonVisual } from "@/lib/lessonVisuals";
import type { PublicLessonRoutineConfig } from "@/lib/lessonRoutineConfig";
import { defaultPublicSurfaceModeForState, type PublicSurfaceMode } from "@/lib/lessonStepMetadata";
import {
  publicSuccessCriterion,
  selectedSuccessCriterionValidationMessage,
} from "@/lib/successCriterion";

import { CLOSEOUT_DIRECTIONS, DEFAULT_STATES, BANK_GROUPS, type ClassState } from "@/lib/classStates";

interface LineupItem {
  uid: string;
  stateId: string;
  minutes?: number;
  title?: string;
  studentDirections?: string;
  question?: string;
  pollKind?: LivePollKind | "";
  choices?: string[];
  correctAnswer?: string;
  standard?: string;
  notionStepId?: string;
  notionLessonId?: string;
  lessonCode?: string;
  linkUrl?: string;
  paperTask?: string;
  advance?: string;
  mainDisplay?: string;
  paceDirections?: string;
  studentAction?: string;
  remoteActions?: string;
  discussionStems?: string;
  vocabulary?: string;
  responseMode?: string;
  workSpaceAvailable?: boolean;
  publicSurfaceMode?: PublicSurfaceMode;
  routineConfig?: PublicLessonRoutineConfig | null;
}

interface TeacherSessionRow {
  id: string;
  status: string;
  period_id: string;
  join_code: string | null;
  broadcast: string | null;
  live_flow: LiveClassFlowSnapshot | null;
  remote_command: TeacherRemoteCommand | null;
}

interface AdmissionRequest {
  id: string;
  requestCode: string;
  requestedAt: string;
}

interface AdmissionRosterStudent {
  id: string;
  periodId: string;
  fullName: string;
  email: string | null;
}

const TEACHER_SERVER_CLIENT = {} as never;

type InteractiveStateId = string;

const TOOL_STATE_INFO = {
  "tool-whiteboard": { route: "/whiteboard", label: "Whiteboard" },
  "tool-number-line": { route: "/number-line-plus", label: "Number Line" },
  "tool-percent-bar": { route: "/percent-bar", label: "Percent Bar" },
  "tool-equation-builder": { route: "/equation-builder", label: "Equation Builder" },
  "tool-balance-beam": { route: "/balance-beam", label: "Balance Beam" },
  "tool-gems": { route: "/order-of-operations", label: "GEMS" },
  "tool-fraction-bars": { route: "/fraction-bars", label: "Fraction Bars" },
  "tool-algebra-tiles": { route: "/algebra-tiles", label: "Algebra Tiles" },
  "tool-area-model": { route: "/area-model", label: "Box Method" },
  "tool-distributive-area": { route: "/distributive-area", label: "Distributive Area Method" },
  "tool-area-explorer": { route: "/area-explorer", label: "Area Explorer" },
  "tool-combine": { route: "/combine-like-terms", label: "Combine Like Terms" },
  "tool-ladder": { route: "/ladder-method", label: "Ladder Method" },
  "tool-proportions": { route: "/proportions", label: "Proportions" },
  "tool-group-bars": { route: "/group-bars", label: "Group Bars" },
  "tool-coordinate-grid": { route: "/coordinate-grid", label: "Coordinate Grid" },
  "tool-term-identifier": { route: "/term-identifier", label: "Identify Terms" },
  "tool-multiplication": { route: "/multiplication-fluency", label: "Multiplication Facts" },
  "tool-game": { route: "/challenge", label: "Live Game" },
  "tool-exit-ticket": { route: "/exit-ticket", label: "Exit Ticket" },
  "tool-checkpoint": { route: "/checkpoint", label: "SBAC Checkpoint" },
} as const satisfies Record<string, { route: LiveToolRoute; label: string }>;

type ToolStateId = keyof typeof TOOL_STATE_INFO;

interface ToolSetupValues {
  prompt: string;
  numberLineStart: string;
  numberLineChange: string;
  percentWhole: string;
  percentValue: string;
  percentPart: string;
  percentUnknown: "part" | "whole" | "percent";
  equationCoefficient: string;
  equationConstant: string;
  equationSolution: string;
  gemsExpression: string;
  algebraExpression: string;
  gameSkill: string;
  gameLevel: string;
  gameDuration: string;
  exitPrompt: string;
  exitKind: ExitKind;
  exitChoices: string;
  checkpointId: string;
  checkpointItem: string;
}

interface PublishedTool {
  stateId: ToolStateId;
  tool: LiveToolConfig;
}

interface ControlPoll {
  id: string;
  stateId: InteractiveStateId;
  kind: LivePollKind;
  question: string;
  choices: string[] | null;
  stage: "responding" | "results";
  awaitingTeacherAdvance?: boolean;
}

interface ControlPollAnswer {
  id: string;
  display_name: string | null;
  answer: string | null;
}

interface PollLaunchConfig {
  stateId: InteractiveStateId;
  kind: LivePollKind;
  question: string;
  choices?: string[];
  correctAnswer?: string;
  standard?: string;
  notionStepId?: string;
  notionLessonId?: string;
  lessonCode?: string;
}

// DEFAULT_STATES + BANK_GROUPS now live in @/lib/classStates (shared with the
// standalone Sequence Builder so the catalog never drifts).

const LS_BANK = "bdm-control-bank-v2";
const LS_LINEUP = "bdm-control-lineup-v1";
const PERIOD_MIN = 55;
const REMOTE_RECEIPT_RETRY_MS = 600;

const DEFAULT_TOOL_SETUP: ToolSetupValues = {
  prompt: "",
  numberLineStart: "-3",
  numberLineChange: "6",
  percentWhole: "80",
  percentValue: "25",
  percentPart: "20",
  percentUnknown: "part",
  equationCoefficient: "2",
  equationConstant: "3",
  equationSolution: "4",
  gemsExpression: "3 + 4 × 2",
  algebraExpression: "2x + 3 = 11",
  gameSkill: SKILLS[0].key,
  gameLevel: "1",
  gameDuration: "180",
  exitPrompt: "",
  exitKind: "short-answer",
  exitChoices: "",
  checkpointId: SBAC_CHECKPOINTS[0].id,
  checkpointItem: String(Math.max(0, SBAC_CHECKPOINTS[0].items.findIndex((it) => it.digital))),
};

type CueKey = "music" | "warn30" | "tick" | "end";
const CUE_LABELS: Record<CueKey, string> = {
  music: "Warm-up music (loops)",
  warn30: "30-second alert",
  tick: "Last-10 countdown tick",
  end: "Time's-up buzzer",
};

function fmt(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function isToolStateId(value: string | undefined): value is ToolStateId {
  return Boolean(value && value in TOOL_STATE_INFO);
}

function numericValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildLiveToolConfig(stateId: ToolStateId, values: ToolSetupValues): LiveToolConfig {
  const info = TOOL_STATE_INFO[stateId];
  const base = {
    id: `${stateId}-${Date.now()}-${uid()}`,
    label: info.label,
    prompt: values.prompt.trim(),
  };

  switch (stateId) {
    case "tool-whiteboard":
      return { ...base, route: "/whiteboard", config: {} };
    case "tool-fraction-bars":
      return { ...base, route: "/fraction-bars", config: {} };
    case "tool-number-line": {
      const start = Math.round(clamp(numericValue(values.numberLineStart, -3), -10, 10));
      const change = Math.round(clamp(numericValue(values.numberLineChange, 6), -10 - start, 10 - start));
      return {
        ...base,
        route: "/number-line-plus",
        config: {
          start,
          change,
        },
      };
    }
    case "tool-percent-bar": {
      const unknown = values.percentUnknown;
      let whole = Math.max(0.01, numericValue(values.percentWhole, 80));
      let percent = Math.max(0.01, numericValue(values.percentValue, 25));
      let part = Math.max(0, numericValue(values.percentPart, 20));
      if (unknown === "part") part = (whole * percent) / 100;
      if (unknown === "whole") whole = (part * 100) / percent;
      if (unknown === "percent") percent = (part / whole) * 100;
      return { ...base, route: "/percent-bar", config: { whole, percent, part, unknown } };
    }
    case "tool-equation-builder":
      return {
        ...base,
        route: "/equation-builder",
        config: {
          coefficient: Math.max(1, Math.round(numericValue(values.equationCoefficient, 2))),
          constant: numericValue(values.equationConstant, 3),
          solution: Math.max(1, Math.round(numericValue(values.equationSolution, 4))),
        },
      };
    case "tool-balance-beam":
      return { ...base, route: "/balance-beam", config: {} };
    case "tool-gems":
      return { ...base, route: "/order-of-operations", config: { expression: values.gemsExpression.trim() } };
    case "tool-algebra-tiles":
      return { ...base, route: "/algebra-tiles", config: { expression: values.algebraExpression.trim() } };
    case "tool-area-model":
      return { ...base, route: "/area-model", config: {} };
    case "tool-distributive-area":
      return { ...base, route: "/distributive-area", config: {} };
    case "tool-area-explorer":
      return { ...base, route: "/area-explorer", config: {} };
    case "tool-combine":
      return { ...base, route: "/combine-like-terms", config: {} };
    case "tool-ladder":
      return { ...base, route: "/ladder-method", config: {} };
    case "tool-proportions":
      return { ...base, route: "/proportions", config: {} };
    case "tool-group-bars":
      return { ...base, route: "/group-bars", config: {} };
    case "tool-coordinate-grid":
      return { ...base, route: "/coordinate-grid", config: {} };
    case "tool-term-identifier":
      return { ...base, route: "/term-identifier", config: {} };
    case "tool-multiplication":
      return { ...base, route: "/multiplication-fluency", config: {} };
    case "tool-game":
      return { ...base, route: "/challenge", config: {} };
    case "tool-exit-ticket":
      return { ...base, route: "/exit-ticket", config: {} };
    case "tool-checkpoint":
      return { ...base, route: "/checkpoint", config: {} };
  }
}

function formatLiveFlowError(message: string): string {
  const lower = message.toLowerCase();
  if (message.includes("live_flow") || lower.includes("schema cache") || lower.includes("column")) {
    return "Live Flow database setup is missing. Run supabase/class-mode.sql.";
  }
  return `Live sync error: ${message}`;
}

// ── IndexedDB (stores uploaded sound files so they persist on this computer) ──
function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("bdm-control", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("sounds");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(key: string, blob: Blob): Promise<void> {
  const db = await idbOpen();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("sounds", "readwrite");
    tx.objectStore("sounds").put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbGet(key: string): Promise<Blob | undefined> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sounds", "readonly");
    const r = tx.objectStore("sounds").get(key);
    r.onsuccess = () => resolve(r.result as Blob | undefined);
    r.onerror = () => reject(r.error);
  });
}
async function idbDel(key: string): Promise<void> {
  const db = await idbOpen();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("sounds", "readwrite");
    tx.objectStore("sounds").delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

  // Today's Notion lesson to Control lineup.
// The published lesson lists its tools as free text (e.g. "Number Line"). Map
// those names to bank state ids so the teacher can load and run the day's
// lesson as one sequence instead of rebuilding it by hand.
interface TodayLessonStep {
  id: string;
  title: string;
  duration: number;
  stateId: string;
  studentDirections: string;
  teacherNotes: string;
  tool: string;
  question: string;
  pollKind: LivePollKind | "";
  choices: string[];
  correctAnswer: string;
  standard: string;
  linkUrl: string;
  paperTask: string;
  advance: string;
  mainDisplay: string;
  paceDirections: string;
  studentAction: string;
  remoteActions: string;
  discussionStems: string;
  vocabulary: string;
  responseMode: string;
  workSpaceAvailable?: boolean;
  publicSurfaceMode?: PublicSurfaceMode;
  routineConfig?: PublicLessonRoutineConfig | null;
}

type TodayLesson = {
  id: string;
  title?: string;
  lessonCode?: string;
  tools?: string | null;
  learningIntention?: string;
  successCriteria?: string;
  selectedSuccessCriterion?: string;
  classroomMode?: string;
  discussionStems?: string;
  discussionVocabulary?: string;
  requiredPaperWork?: string;
  requiredDigitalWork?: string;
  optionalSupport?: string;
  bigDogChallenge?: string;
  dueAndTurnIn?: string;
  helpPath?: string;
  warmUpLink?: string;
  exitTicketLink?: string;
  steps?: TodayLessonStep[];
};

type ActiveLessonContext = {
  id: string;
  code: string;
  title: string;
  learningIntention: string;
  successCriteria: string;
  selectedSuccessCriterion: string;
  classroomMode: string;
  discussionStems: string;
  discussionVocabulary: string;
  requiredPaperWork: string;
  requiredDigitalWork: string;
  optionalSupport: string;
  bigDogChallenge: string;
  dueAndTurnIn: string;
  helpPath: string;
};

const LESSON_TOOL_ALIASES: Record<string, string> = {
  whiteboard: "tool-whiteboard",
  numberline: "tool-number-line",
  doublenumberline: "tool-number-line",
  numberlineplus: "tool-number-line",
  percentbar: "tool-percent-bar",
  percent: "tool-percent-bar",
  equationbuilder: "tool-equation-builder",
  equation: "tool-equation-builder",
  equations: "tool-equation-builder",
  gems: "tool-gems",
  orderofoperations: "tool-gems",
  fractionbars: "tool-fraction-bars",
  fractions: "tool-fraction-bars",
  algebratiles: "tool-algebra-tiles",
  areamodel: "tool-area-model",
  areaexplorer: "tool-area-explorer",
  areaofshapes: "tool-area-explorer",
  shapes: "tool-area-explorer",
  combineliketerms: "tool-combine",
  combiningliketerms: "tool-combine",
  liketerms: "tool-combine",
  laddermethod: "tool-ladder",
  ladder: "tool-ladder",
  proportions: "tool-proportions",
  proportion: "tool-proportions",
  ratios: "tool-proportions",
  groupbars: "tool-group-bars",
  coordinategrid: "tool-coordinate-grid",
  coordinateplane: "tool-coordinate-grid",
  graphing: "tool-coordinate-grid",
  identifyterms: "tool-term-identifier",
  termidentifier: "tool-term-identifier",
  multiplicationfacts: "tool-multiplication",
  multiplicationfluency: "tool-multiplication",
  multiplication: "tool-multiplication",
};

function normalizeToolName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseLessonList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
}

function lessonWorkSummary(lesson: ActiveLessonContext | null): string {
  if (!lesson) return "";
  const sections = [
    ["Required Paper Work", lesson.requiredPaperWork],
    ["Required Digital Work", lesson.requiredDigitalWork],
    ["Due and Turn In", lesson.dueAndTurnIn],
    ["Help Path", lesson.helpPath],
    ["Optional Support", lesson.optionalSupport],
    ["Challenge", lesson.bigDogChallenge],
  ];
  return sections
    .filter((entry) => entry[1]?.trim())
    .map(([label, body]) => `${label}: ${body}`)
    .join("\n\n");
}

function minutesForLineupItem(item: LineupItem | undefined, bank: ClassState[]): number {
  if (!item) return 0;
  return item.minutes && item.minutes > 0
    ? item.minutes
    : bank.find((state) => state.id === item.stateId)?.minutes ?? 0;
}

function matchLessonToolStateId(name: string): string | null {
  const norm = normalizeToolName(name);
  if (!norm) return null;
  if (LESSON_TOOL_ALIASES[norm]) return LESSON_TOOL_ALIASES[norm];
  const exact = DEFAULT_STATES.find((s) => normalizeToolName(s.label) === norm);
  if (exact) return exact.id;
  const loose = DEFAULT_STATES.find(
    (s) => s.id.startsWith("tool-")
      && (normalizeToolName(s.label).includes(norm) || norm.includes(normalizeToolName(s.label))),
  );
  return loose ? loose.id : null;
}

export default function ControlPage() {
  const supabase = TEACHER_SERVER_CLIENT;
  const [bank, setBank] = useState<ClassState[]>(DEFAULT_STATES);
  const [lineup, setLineup] = useState<LineupItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const [secondsLeft, setSecondsLeft] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [warnFlash, setWarnFlash] = useState(false);

  const [editing, setEditing] = useState(false);
  const [showSounds, setShowSounds] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const [showLessons, setShowLessons] = useState(false);
  const [showAdmissions, setShowAdmissions] = useState(false);
  const [presets, setPresets] = useState<LessonPreset[]>([]);
  const [presetSearch, setPresetSearch] = useState("");
  const [saveCode, setSaveCode] = useState("");
  const [saveTitle, setSaveTitle] = useState("");
  const [lessonMsg, setLessonMsg] = useState<string | null>(null);
  const [todayMsg, setTodayMsg] = useState<string | null>(null);
  const [notionLessonCode, setNotionLessonCode] = useState("");
  const [showDiscussion, setShowDiscussion] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [previewSyncPaused, setPreviewSyncPaused] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [scoreboardStage, setScoreboardStage] = useState<"halftime" | "final">("halftime");
  const [activeLessonContext, setActiveLessonContext] = useState<ActiveLessonContext | null>(null);
  const [soundUrls, setSoundUrls] = useState<Record<string, string>>({});
  const [teacherSession, setTeacherSession] = useState<TeacherSessionRow | null>(null);
  const [teacherSessionReady, setTeacherSessionReady] = useState(false);
  const [notionLaunchRequest, setNotionLaunchRequest] = useState<{ id: string; code: string; run: boolean } | null>(null);
  const [presetLaunchRequest, setPresetLaunchRequest] = useState<{ id: string; run: boolean } | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [endingSession, setEndingSession] = useState(false);
  const [admissionRequests, setAdmissionRequests] = useState<AdmissionRequest[]>([]);
  const [admissionRoster, setAdmissionRoster] = useState<AdmissionRosterStudent[]>([]);
  const [admissionJoinedStudentIds, setAdmissionJoinedStudentIds] = useState<string[]>([]);
  const [admissionSelections, setAdmissionSelections] = useState<Record<string, string>>({});
  const [admittingRequestCode, setAdmittingRequestCode] = useState<string | null>(null);
  const [admissionError, setAdmissionError] = useState<string | null>(null);
  const [discussionFlow, setDiscussionFlow] = useState<DiscussionPhaseSnapshot | null>(null);
  const [discussionRemoteCommand, setDiscussionRemoteCommand] = useState<TeacherRemoteCommand | null>(null);
  const [controlPoll, setControlPoll] = useState<ControlPoll | null>(null);
  const [pollKind, setPollKind] = useState<LivePollKind>("short-answer");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollChoices, setPollChoices] = useState(["", "", "", ""]);
  const [pollAnswers, setPollAnswers] = useState<ControlPollAnswer[]>([]);
  const [pollError, setPollError] = useState<string | null>(null);
  const [flowSyncError, setFlowSyncError] = useState<string | null>(null);
  const [serverHydrationGeneration, setServerHydrationGeneration] = useState(0);
  const [toolSetup, setToolSetup] = useState<ToolSetupValues>(DEFAULT_TOOL_SETUP);
  const [publishedTool, setPublishedTool] = useState<PublishedTool | null>(null);
  const [toolError, setToolError] = useState<string | null>(null);
  const [liveChallenge, setLiveChallenge] = useState<ChallengeRow | null>(null);
  const [liveChallengeBoard, setLiveChallengeBoard] = useState<LeaderRow[]>([]);

  const secRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerEndsAtRef = useRef<number | null>(null);
  const timerStartSecondsRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const previousScoreboardStageRef = useRef<"halftime" | "final" | null>(null);
  const autoOpenedStepRef = useRef<Set<string>>(new Set());
  const openingStepRef = useRef<string | null>(null);
  const lastRemoteCommandRef = useRef<string | null>(null);
  const pendingRemoteReceiptRef = useRef<{ sessionId: string; command: TeacherRemoteCommand } | null>(null);
  const remoteReceiptInFlightRef = useRef(false);
  const hydratedSessionRef = useRef<string | null>(null);
  const pendingLiveFlowSyncRef = useRef<{
    sessionId: string;
    snapshot: LiveClassFlowSnapshot;
    epoch: number;
    expectedRevision?: string | null;
  } | null>(null);
  const liveFlowSyncingRef = useRef(false);
  const liveFlowSyncEpochRef = useRef(0);
  const hydrationGenerationRef = useRef(0);
  const processedHydrationGenerationRef = useRef(0);
  const serverFlowSessionRef = useRef<string | null>(null);
  const serverFlowRevisionRef = useRef<string | null>(null);
  const handledNotionLaunchRef = useRef(false);
  const handledPresetLaunchRef = useRef(false);
  const autoOpenedDiscussionStepRef = useRef<string | null>(null);

  const markServerHydration = useCallback((flow: LiveClassFlowSnapshot) => {
    liveFlowSyncEpochRef.current += 1;
    pendingLiveFlowSyncRef.current = null;
    serverFlowRevisionRef.current = flow.updatedAt || null;
    hydrationGenerationRef.current += 1;
    setServerHydrationGeneration(hydrationGenerationRef.current);
  }, []);

  const flushRemoteReceipt = useCallback(async () => {
    const pending = pendingRemoteReceiptRef.current;
    if (!pending || remoteReceiptInFlightRef.current) return;
    const issuedAt = Date.parse(pending.command.issuedAt);
    if (Number.isFinite(issuedAt) && Date.now() - issuedAt >= REMOTE_COMMAND_STALE_MS) {
      pendingRemoteReceiptRef.current = null;
      return;
    }

    remoteReceiptInFlightRef.current = true;
    try {
      await teacherPost("/api/teacher/session", {
        action: "update",
        sessionId: pending.sessionId,
        remoteCommand: pending.command,
        expectedRemoteCommandNonce: pending.command.nonce,
      });
      if (pendingRemoteReceiptRef.current?.command.nonce === pending.command.nonce) {
        pendingRemoteReceiptRef.current = null;
      }
    } catch (error) {
      if (error instanceof TeacherApiError && error.status === 409) {
        if (pendingRemoteReceiptRef.current?.command.nonce === pending.command.nonce) {
          pendingRemoteReceiptRef.current = null;
        }
        return;
      }
      // Leave the receipt queued. The short retry loop below keeps a transient
      // classroom-network failure from permanently blocking the Remote.
    } finally {
      remoteReceiptInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => { void flushRemoteReceipt(); }, REMOTE_RECEIPT_RETRY_MS);
    return () => window.clearInterval(interval);
  }, [flushRemoteReceipt]);

  const armTimer = useCallback((seconds: number) => {
    const safeSeconds = Math.max(0, seconds);
    timerStartSecondsRef.current = safeSeconds;
    timerEndsAtRef.current = safeSeconds > 0 ? Date.now() + safeSeconds * 1000 : null;
  }, []);

  const disarmTimer = useCallback(() => {
    timerEndsAtRef.current = null;
    timerStartSecondsRef.current = 0;
  }, []);

  useEffect(() => {
    if (!autoAdvance) return;
    type WakeLockHandle = { release: () => Promise<void> };
    const wakeLock = (navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockHandle> };
    }).wakeLock;
    if (!wakeLock) return;
    let stopped = false;
    let handle: WakeLockHandle | null = null;
    const acquire = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        handle = await wakeLock.request("screen");
      } catch {
        handle = null;
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") {
        if (handle) void handle.release();
        handle = null;
        return;
      }
      if (!handle) void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      if (handle) void handle.release();
      handle = null;
    };
  }, [autoAdvance]);

  // ── Load saved bank minutes + lineup + uploaded sounds ──────────────────
  useEffect(() => {
    try {
      let loadedBank = DEFAULT_STATES;
      const rawBank = localStorage.getItem(LS_BANK);
      if (rawBank) {
        const saved = JSON.parse(rawBank) as ClassState[];
        loadedBank = DEFAULT_STATES.map((d) => {
          const s = saved.find((x) => x.id === d.id);
          return s ? { ...d, minutes: s.minutes } : d;
        });
        setBank(loadedBank);
      }
      const rawLine = localStorage.getItem(LS_LINEUP);
      if (rawLine) {
        const savedLineup = JSON.parse(rawLine) as LineupItem[];
        setLineup(savedLineup);
        const firstState = savedLineup[0] ? loadedBank.find((state) => state.id === savedLineup[0].stateId) : undefined;
        if (firstState) {
          setCurrentIndex(0);
          secRef.current = firstState.minutes * 60;
          setSecondsLeft(secRef.current);
        }
      }
    } catch { /* ignore */ }

    (async () => {
      const keys: string[] = ["warn30", "tick", "end", ...DEFAULT_STATES.map((s) => `music:${s.id}`)];
      const next: Record<string, string> = {};
      for (const k of keys) {
        try {
          const blob = await idbGet(k);
          if (blob) next[k] = URL.createObjectURL(blob);
        } catch { /* ignore */ }
      }
      setSoundUrls(next);
    })();
  }, []);

  // Recover the newest server-side open session. This keeps Control attached
  // even on a different teacher device or before Live Class Flow is selected.
  useEffect(() => {
    let stopped = false;
    let checking = false;
    const setCurrentTeacherSession = (next: TeacherSessionRow | null) => {
      if (serverFlowSessionRef.current !== next?.id) {
        serverFlowSessionRef.current = next?.id || null;
        serverFlowRevisionRef.current = next?.live_flow?.transition ? null : next?.live_flow?.updatedAt || null;
      }
      setJoinCode(next?.join_code || null);
      setTeacherSession((current) => (
        current?.id === next?.id
        && current?.status === next?.status
        && current?.join_code === next?.join_code
        && current?.broadcast === next?.broadcast
        && current?.live_flow?.updatedAt === next?.live_flow?.updatedAt
        && current?.remote_command?.nonce === next?.remote_command?.nonce
          ? current
          : next
      ));
    };

    const findTeacherSession = async () => {
      if (checking) return;
      checking = true;
      try {
        const storedSessionId = getStoredTeacherSessionId();
        const result = await teacherApiRequest<{ sessions: TeacherSessionRow[] }>("/api/teacher/session?latestOpen=1");
        if (stopped) return;
        const openSession = result.sessions.find((candidate) => candidate.status === "open") ?? null;
        if (storedSessionId && storedSessionId !== openSession?.id) clearStoredTeacherSession(storedSessionId);
        setCurrentTeacherSession(openSession);
        setTeacherSessionReady(true);
      } catch {
        // Preserve the last confirmed session and retry. A temporary network or
        // auth failure must not be mistaken for a successful "no session" result.
      } finally {
        checking = false;
      }
    };

    void findTeacherSession();
    const interval = window.setInterval(findTeacherSession, 400);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [supabase]);

  // Keep the private iPad queue current without changing the classroom timer,
  // live-flow broadcast, or the student-facing display.
  useEffect(() => {
    const sessionId = teacherSession?.id;
    const periodId = teacherSession?.period_id;
    if (!sessionId || !periodId) {
      setAdmissionRequests([]);
      setAdmissionRoster([]);
      setAdmissionJoinedStudentIds([]);
      setAdmissionSelections({});
      setAdmissionError(null);
      setShowAdmissions(false);
      return;
    }

    let stopped = false;
    let checking = false;

    const loadAdmissionRequests = async () => {
      if (checking) return;
      checking = true;
      try {
        const result = await teacherApiRequest<{
          admissionRequests?: AdmissionRequest[];
          joins?: Array<{ student_id: string | null }>;
        }>(
          `/api/teacher/session?sessionId=${encodeURIComponent(sessionId)}`,
        );
        if (!stopped) {
          setAdmissionRequests(result.admissionRequests ?? []);
          setAdmissionJoinedStudentIds(
            (result.joins ?? []).flatMap((join) => join.student_id ? [join.student_id] : []),
          );
        }
      } catch (requestError) {
        if (!stopped) {
          setAdmissionError(requestError instanceof Error ? requestError.message : "Waiting students could not be refreshed.");
        }
      } finally {
        checking = false;
      }
    };

    const loadAdmissionRoster = async () => {
      try {
        const result = await teacherApiRequest<{ students: AdmissionRosterStudent[] }>("/api/teacher/roster");
        if (!stopped) setAdmissionRoster(result.students.filter((student) => student.periodId === periodId));
      } catch (rosterError) {
        if (!stopped) {
          setAdmissionError(rosterError instanceof Error ? rosterError.message : "The class roster could not be loaded.");
        }
      }
    };

    void loadAdmissionRoster();
    void loadAdmissionRequests();
    const interval = window.setInterval(loadAdmissionRequests, 3000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [teacherSession?.id, teacherSession?.period_id]);

  useEffect(() => {
    if (showAdmissions && admissionRequests.length === 0) setShowAdmissions(false);
  }, [admissionRequests.length, showAdmissions]);

  const persistBank = useCallback((next: ClassState[]) => {
    setBank(next);
    try { localStorage.setItem(LS_BANK, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);
  const persistLineup = useCallback((next: LineupItem[]) => {
    setLineup(next);
    try { localStorage.setItem(LS_LINEUP, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  // ── Sound playback ──────────────────────────────────────────────────────
  const genTone = useCallback((pattern: { f: number; t: number; d: number }[]) => {
    try {
      audioCtxRef.current = audioCtxRef.current
        ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const ctx = audioCtxRef.current;
      pattern.forEach(({ f, t, d }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = f;
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + d);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + d + 0.02);
      });
    } catch { /* ignore */ }
  }, []);

  const playCue = useCallback((key: CueKey) => {
    const url = soundUrls[key];
    if (url) {
      const a = new Audio(url);
      a.play().catch(() => { /* ignore */ });
      return;
    }
    if (key === "tick") genTone([{ f: 660, t: 0, d: 0.07 }]);
    else if (key === "warn30") genTone([{ f: 880, t: 0, d: 0.18 }, { f: 660, t: 0.22, d: 0.18 }]);
    else if (key === "end") genTone([{ f: 880, t: 0, d: 0.2 }, { f: 880, t: 0.25, d: 0.2 }, { f: 880, t: 0.5, d: 0.2 }]);
  }, [soundUrls, genTone]);

  useEffect(() => {
    const previous = previousScoreboardStageRef.current;
    previousScoreboardStageRef.current = scoreboardStage;
    if (previous === "halftime" && scoreboardStage === "final") playCue("end");
  }, [playCue, scoreboardStage]);

  const stopMusic = useCallback(() => {
    if (musicRef.current) {
      musicRef.current.pause();
      musicRef.current.currentTime = 0;
      musicRef.current = null;
    }
  }, []);

  const startMusicFor = useCallback((stateId: string) => {
    const url = soundUrls[`music:${stateId}`];
    if (!url) return;
    stopMusic();
    const a = new Audio(url);
    a.loop = true;
    a.play().catch(() => { /* ignore */ });
    musicRef.current = a;
  }, [soundUrls, stopMusic]);

  // Restore the active pacing state once when Control reconnects to an open
  // session. Subsequent live updates continue through the normal sync path.
  useEffect(() => {
    if (!teacherSession) {
      hydratedSessionRef.current = null;
      return;
    }
    const flow = teacherSession.live_flow;
    if (!flow?.sequence || hydratedSessionRef.current === teacherSession.id) return;
    hydratedSessionRef.current = teacherSession.id;
    markServerHydration(flow);

    if (flow.sequence.steps?.length) {
      persistLineup(flow.sequence.steps.map((step) => ({
        uid: uid(),
        stateId: step.stateId,
        minutes: Math.max(1, Math.round(step.durationSeconds / 60)),
        title: step.label,
        studentDirections: step.description,
        question: step.question,
        pollKind: step.pollKind || "",
        choices: step.choices,
        correctAnswer: step.correctAnswer,
        standard: step.standard,
        notionStepId: step.notionStepId || undefined,
        notionLessonId: step.notionLessonId || undefined,
        lessonCode: step.lessonCode,
        linkUrl: step.resourceUrl,
        paperTask: step.paperTask,
        mainDisplay: step.mainDisplay,
        paceDirections: step.paceDirections,
        studentAction: step.studentAction,
        remoteActions: step.remoteActions,
        discussionStems: step.discussionStems?.join("\n"),
        vocabulary: step.vocabulary?.join("\n"),
        responseMode: step.responseMode,
        workSpaceAvailable: step.workSpaceAvailable,
        publicSurfaceMode: step.publicSurfaceMode,
        routineConfig: step.routineConfig,
      })));
    }

    setCurrentIndex(flow.sequence.currentIndex);
    setAutoAdvance(flow.sequence.advanceMode === "automatic");
    if (flow.lesson) {
      setActiveLessonContext({
        id: flow.lesson.id || "",
        code: flow.lesson.code,
        title: flow.lesson.title,
        learningIntention: flow.lesson.learningIntention,
        successCriteria: publicSuccessCriterion(flow.lesson.selectedSuccessCriterion),
        selectedSuccessCriterion: publicSuccessCriterion(flow.lesson.selectedSuccessCriterion),
        classroomMode: flow.lesson.classroomMode || "",
        discussionStems: flow.lesson.discussionStems?.join("\n") || "",
        discussionVocabulary: flow.lesson.discussionVocabulary?.join("\n") || "",
        requiredPaperWork: flow.lesson.requiredPaperWork || "",
        requiredDigitalWork: flow.lesson.requiredDigitalWork || "",
        optionalSupport: flow.lesson.optionalSupport || "",
        bigDogChallenge: flow.lesson.bigDogChallenge || "",
        dueAndTurnIn: flow.lesson.dueAndTurnIn || "",
        helpPath: flow.lesson.helpPath || "",
      });
    } else setActiveLessonContext(null);
    if (flow.timer) {
      const remaining = liveTimerSeconds(flow.timer);
      secRef.current = remaining;
      setSecondsLeft(remaining);
      const shouldRun = flow.timer.running && remaining > 0;
      if (shouldRun) armTimer(remaining);
      else disarmTimer();
      setRunning(shouldRun);
      setFinished(flow.timer.finished || (flow.timer.running && remaining <= 0));
      if (shouldRun && flow.state) startMusicFor(flow.state.id);
      else stopMusic();
    } else {
      secRef.current = 0;
      setSecondsLeft(0);
      disarmTimer();
      setRunning(false);
      setFinished(flow.poll?.stage === "results");
      stopMusic();
    }
    setBoardOpen(Boolean(flow.presentation?.boardOpen));
    setScoreboardStage(flow.presentation?.scoreboardStage || "halftime");
    if (flow.phase && usesDiscussionProtocol(flow.state?.id, flow.state?.label || "")) {
      setDiscussionFlow(flow.phase);
      setShowDiscussion(true);
    } else {
      setDiscussionFlow(null);
      setShowDiscussion(false);
    }
    const interactiveStateId = flow.poll && flow.state ? flow.state.id : null;
    setControlPoll(flow.poll && interactiveStateId
      ? {
          id: flow.poll.id,
          stateId: interactiveStateId,
          kind: flow.poll.kind,
          question: flow.poll.question,
          choices: flow.poll.choices,
          stage: flow.poll.stage,
          awaitingTeacherAdvance: flow.poll.awaitingTeacherAdvance,
        }
      : null);
  }, [armTimer, disarmTimer, markServerHydration, persistLineup, startMusicFor, stopMusic, teacherSession]);

  // ── Countdown engine ────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) {
      disarmTimer();
      return;
    }
    if (!timerEndsAtRef.current) armTimer(secRef.current);
    tickRef.current = setInterval(() => {
      const deadline = timerEndsAtRef.current;
      const previous = secRef.current;
      const next = deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 0;
      if (next === previous) return;
      secRef.current = next;
      setSecondsLeft(next);
      if (previous > 30 && next <= 30) { playCue("warn30"); setWarnFlash(true); setTimeout(() => setWarnFlash(false), 3000); }
      else if (next <= 10 && next >= 1) { playCue("tick"); }
      if (next <= 0) {
        if (tickRef.current) clearInterval(tickRef.current);
        disarmTimer();
        setRunning(false);
        setFinished(true);
        stopMusic();
        playCue("end");
      }
    }, 250);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [armTimer, disarmTimer, running, playCue, stopMusic]);

  // Automatically close a timed response check, briefly show results, and
  // advance while lesson pacing remains on.
  useEffect(() => {
    if (!finished || !autoAdvance || (controlPoll?.stage === "results" && controlPoll.awaitingTeacherAdvance)) return;
    if (controlPoll?.stage === "responding") {
      setControlPoll((current) => current ? { ...current, stage: "results" } : null);
      void teacherPost("/api/teacher/poll", { action: "close", pollId: controlPoll.id });
      return;
    }
    const ni = currentIndex + 1;
    if (ni >= lineup.length) return;
    const t = setTimeout(() => {
      const item = lineup[ni];
      const st = item ? bank.find((s) => s.id === item.stateId) : undefined;
      if (!st) return;
      stopMusic();
      setCurrentIndex(ni);
      const minutes = minutesForLineupItem(item, bank);
      secRef.current = minutes * 60;
      armTimer(secRef.current);
      setSecondsLeft(secRef.current);
      setFinished(false);
      setRunning(true);
      startMusicFor(st.id);
    }, controlPoll?.stage === "results" ? 6000 : 2600);
    return () => clearTimeout(t);
  }, [armTimer, finished, autoAdvance, bank, controlPoll, currentIndex, lineup, startMusicFor, stopMusic]);

  const activeItem = currentIndex >= 0 ? lineup[currentIndex] : undefined;
  const filteredPresets = presets.filter((p) => {
    const t = presetSearch.trim().toLowerCase();
    return !t || p.code.toLowerCase().includes(t) || p.title.toLowerCase().includes(t);
  });
  const activeState = activeItem ? bank.find((s) => s.id === activeItem.stateId) : undefined;
  const activeLessonCriterionValidationMessage = activeLessonContext
    ? selectedSuccessCriterionValidationMessage(activeLessonContext.selectedSuccessCriterion)
    : null;
  const activeUsesDiscussionProtocol = usesDiscussionProtocol(
    activeState?.id,
    activeItem?.title || activeState?.label || "",
  );
  const activeMinutes = minutesForLineupItem(activeItem, bank);
  const activeLessonVisual = useMemo(() => {
    if (!activeItem || !activeState) return null;
    return resolveLessonVisual({
      lessonCode: activeItem.lessonCode || activeLessonContext?.code,
      stateId: activeState.id,
      text: activeItem.mainDisplay || activeItem.studentDirections || activeItem.question || activeState.desc,
      fallbackTexts: [activeItem.studentDirections || "", activeItem.question || "", activeItem.paperTask || ""],
      contextSteps: lineup.map((item) => ({
        stateId: item.stateId,
        text: item.mainDisplay || item.studentDirections || item.question || item.paperTask || "",
      })),
      currentStepIndex: currentIndex,
    });
  }, [activeItem, activeLessonContext?.code, activeState, currentIndex, lineup]);
  const totalMin = lineup.reduce((sum, item) => sum + minutesForLineupItem(item, bank), 0);
  const configuredResponseKind = activeUsesDiscussionProtocol
    ? null
    : resolveLiveStepPollKind(
        activeItem?.responseMode,
        activeItem?.pollKind,
        activeState?.id,
      );
  const activeInteractiveState: InteractiveStateId | null = activeState && configuredResponseKind
    ? activeState.id
    : null;
  const activeToolState: ToolStateId | null = isToolStateId(activeState?.id) ? activeState.id : null;

  useEffect(() => {
    if (!activeUsesDiscussionProtocol || !activeItem) {
      autoOpenedDiscussionStepRef.current = null;
      return;
    }
    if ((!running && !autoAdvance) || autoOpenedDiscussionStepRef.current === activeItem.uid) return;
    autoOpenedDiscussionStepRef.current = activeItem.uid;
    disarmTimer();
    setRunning(false);
    setFinished(false);
    setDiscussionFlow({
      id: "think",
      label: "Think",
      subtitle: "Think quietly for one minute.",
      timed: true,
      totalSeconds: 60,
      secondsLeft: 60,
      running: true,
      finished: false,
      media: null,
    });
    setShowDiscussion(true);
  }, [activeItem, activeUsesDiscussionProtocol, autoAdvance, disarmTimer, running]);

  useEffect(() => {
    if (configuredResponseKind) {
      setPollKind(configuredResponseKind);
    } else if (activeInteractiveState === "question") {
      setPollKind("short-answer");
    } else if (activeInteractiveState === "poll" || activeInteractiveState === "learning-check") {
      setPollKind("fist-to-five");
      setPollQuestion((current) => current || "How well do you understand this right now?");
    }
  }, [activeInteractiveState, configuredResponseKind]);

  const closeActivePoll = useCallback(() => {
    if (!controlPoll || controlPoll.stage === "results") return;
    setControlPoll((current) => current ? { ...current, stage: "results" } : null);
    void teacherPost("/api/teacher/poll", { action: "close", pollId: controlPoll.id });
  }, [controlPoll, supabase]);

  useEffect(() => {
    if (!controlPoll || controlPoll.stateId === activeInteractiveState) return;
    closeActivePoll();
    setControlPoll(null);
    setPollAnswers([]);
  }, [activeInteractiveState, closeActivePoll, controlPoll]);

  useEffect(() => {
    if (publishedTool?.stateId !== activeToolState) {
      setPublishedTool(null);
    }
    if (!activeToolState) {
      setToolError(null);
    }
  }, [activeToolState, publishedTool?.stateId]);

  // When the lineup moves off the Live Game state, close out the running
  // challenge round so it doesn't linger open for the session.
  useEffect(() => {
    if (activeToolState === "tool-game") return;
    if (liveChallenge && supabase) {
      void endChallenge(supabase, liveChallenge.id);
      setLiveChallenge(null);
      setLiveChallengeBoard([]);
    }
  }, [activeToolState, liveChallenge, supabase]);

  useEffect(() => {
    if (!supabase || !liveChallenge) {
      setLiveChallengeBoard([]);
      return;
    }

    let stopped = false;
    const loadBoard = async () => {
      const rows = await fetchLeaderboard(supabase, liveChallenge.id);
      if (!stopped) setLiveChallengeBoard(rows);
    };

    void loadBoard();
    const interval = window.setInterval(loadBoard, 3000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [liveChallenge, supabase]);

  useEffect(() => {
    if (!controlPoll) return;
    let stopped = false;
    const loadAnswers = async () => {
      const result = await teacherApiRequest<{ answers: ControlPollAnswer[] }>(
        `/api/teacher/poll?pollId=${encodeURIComponent(controlPoll.id)}`,
      ).catch(() => ({ answers: [] }));
      if (!stopped) setPollAnswers(result.answers);
    };
    void loadAnswers();
    const interval = window.setInterval(loadAnswers, 1000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [controlPoll, supabase]);

  async function openControlPoll(config?: PollLaunchConfig): Promise<boolean> {
    const stateId = config?.stateId ?? activeInteractiveState;
    if (!supabase || !teacherSession || !stateId) {
      setPollError("Start a session first, then open this question or poll.");
      return false;
    }
    const kind = config?.kind ?? pollKind;
    const configuredQuestion = config?.question.trim() ?? "";
    const question = kind === "fist-to-five"
      ? configuredQuestion || pollQuestion.trim() || "How well do you understand this right now?"
      : configuredQuestion || pollQuestion.trim();
    const choices = kind === "multiple-choice"
      ? (config?.choices ?? pollChoices).map((choice) => choice.trim()).filter(Boolean)
      : kind === "fist-to-five"
        ? ["0", "1", "2", "3", "4", "5"]
        : null;
    if (!question) {
      setPollError("Add the question students should answer.");
      return false;
    }
    if (kind === "multiple-choice" && (!choices || choices.length < 2)) {
      setPollError("Add at least two answer choices.");
      return false;
    }

    setPollError(null);
    let pollId: string;
    try {
      const result = await teacherPost<{ poll: { id: string } }>("/api/teacher/poll", {
        action: "create",
        sessionId: teacherSession.id,
        question,
        choices,
        kind,
        correctAnswer: config?.correctAnswer || null,
        lessonCode: config?.lessonCode || null,
        notionLessonId: config?.notionLessonId || null,
        notionStepId: config?.notionStepId || null,
        standardId: config?.standard || null,
      });
      pollId = result.poll.id;
    } catch (actionError) {
      setPollError(actionError instanceof Error ? actionError.message : "The poll could not be opened.");
      return false;
    }

    setControlPoll({
      id: pollId,
      stateId,
      kind,
      question,
      choices,
      stage: "responding",
    });
    setPollAnswers([]);
    setFinished(false);
    if (secondsLeft <= 0 && activeState) {
      secRef.current = activeMinutes * 60;
      setSecondsLeft(secRef.current);
    }
    return true;
  }

  useEffect(() => {
    if (!activeItem?.question || !activeInteractiveState || !configuredResponseKind || controlPoll || autoOpenedStepRef.current.has(activeItem.uid)) return;
    if (!teacherSession || openingStepRef.current === activeItem.uid) return;
    openingStepRef.current = activeItem.uid;
    void openControlPoll({
      stateId: activeInteractiveState,
      kind: configuredResponseKind,
      question: activeItem.question,
      choices: activeItem.choices,
      correctAnswer: activeItem.correctAnswer,
      standard: activeItem.standard,
      notionStepId: activeItem.notionStepId,
      notionLessonId: activeItem.notionLessonId,
      lessonCode: activeItem.lessonCode,
    }).then((opened) => {
      if (opened) autoOpenedStepRef.current.add(activeItem.uid);
      openingStepRef.current = null;
    });
    // openControlPoll intentionally reads the latest teacher/session state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeInteractiveState, activeItem, configuredResponseKind, controlPoll, teacherSession]);

  function prepareAnotherPoll() {
    setControlPoll(null);
    setPollAnswers([]);
    setPollError(null);
    setPollChoices(["", "", "", ""]);
    setPollQuestion(activeInteractiveState === "poll" || activeInteractiveState === "learning-check" ? "How well do you understand this right now?" : "");
    setFinished(false);
  }

  // Hand the just-closed poll's tally to Abbie for a one-line, in-character take.
  function haveAbbieReactToPoll() {
    if (!controlPoll) return;
    const total = pollAnswers.length;
    let tally: string;
    if (controlPoll.kind === "short-answer") {
      tally = `${total} student${total === 1 ? "" : "s"} wrote short answers`;
    } else {
      tally = (controlPoll.choices || [])
        .map((choice) => {
          const count = pollAnswers.filter((a) => a.answer === choice).length;
          const pct = total ? Math.round((count / total) * 100) : 0;
          const label = controlPoll.kind === "fist-to-five" ? `${choice}/5` : choice;
          return `${label}: ${count} (${pct}%)`;
        })
        .join(", ");
    }
    requestAbbieLine(`The class just voted on "${controlPoll.question}". Results: ${tally}. React to that in one line for the room - call out the split or the surprise and nudge them toward the reasoning. Do NOT reveal which answer is correct.`);
  }

  function updateToolSetup(key: keyof ToolSetupValues, value: string) {
    setToolSetup((current) => ({ ...current, [key]: value } as ToolSetupValues));
  }

  async function publishToolSetup() {
    if (!teacherSession || teacherSession.broadcast !== LIVE_FLOW_MODE || !activeToolState) {
      setToolError("Start a session, select Live Class Flow, then send this tool setup.");
      return;
    }

    // The Live Game state launches an actual auto-scored challenge round for the
    // session (its own Supabase row + leaderboard) and points students at the
    // /challenge surface, which plays whatever round is open for the session.
    if (activeToolState === "tool-game") {
      if (!supabase) { setToolError("Supabase isn't connected."); return; }
      const skill = SKILLS.find((s) => s.key === toolSetup.gameSkill) || SKILLS[0];
      const level = clamp(Math.round(numericValue(toolSetup.gameLevel, 1)), 1, skill.levels.length);
      const durationSeconds = Math.round(numericValue(toolSetup.gameDuration, 180));
      const title = `${skill.label} · ${skill.levels[level - 1] || `Level ${level}`}`;
      const { challenge, error } = await launchChallenge(supabase, {
        sessionId: teacherSession.id, skill: skill.key, title, level, durationSeconds,
      });
      if (error === "SETUP") {
        setToolError("One-time setup: run supabase/challenges.sql in Supabase, then try again.");
        return;
      }
      if (error || !challenge) {
        setToolError(error || "The game could not be launched.");
        return;
      }
      setLiveChallenge(challenge);
      setToolError(null);
      setPublishedTool({ stateId: "tool-game", tool: buildLiveToolConfig("tool-game", toolSetup) });
      return;
    }

    // The Exit Ticket state opens a saved exit-ticket question for the session and
    // sends students to /exit-ticket to answer; responses land in Supabase.
    if (activeToolState === "tool-exit-ticket") {
      if (!supabase) { setToolError("Supabase isn't connected."); return; }
      const prompt = toolSetup.exitPrompt.trim();
      if (!prompt) { setToolError("Type the exit-ticket question first."); return; }
      const kind = toolSetup.exitKind;
      const choices = kind === "multiple-choice"
        ? toolSetup.exitChoices.split(/[\n,]/).map((c) => c.trim()).filter(Boolean)
        : null;
      if (kind === "multiple-choice" && (!choices || choices.length < 2)) {
        setToolError("Add at least two answer choices (one per line)."); return;
      }
      const { ticket, error } = await launchExitTicket(supabase, {
        sessionId: teacherSession.id, periodId: null, lessonCode: null, prompt, kind, choices,
      });
      if (error === "SETUP") { setToolError("One-time setup: run supabase/formative.sql in Supabase, then try again."); return; }
      if (error || !ticket) { setToolError(error || "The exit ticket could not be sent."); return; }
      setToolError(null);
      setPublishedTool({ stateId: "tool-exit-ticket", tool: buildLiveToolConfig("tool-exit-ticket", toolSetup) });
      return;
    }

    // The SBAC Checkpoint state launches one bank item for the session; students
    // answer on /checkpoint and it's auto-graded against the answer key.
    if (activeToolState === "tool-checkpoint") {
      if (!supabase) { setToolError("Supabase isn't connected."); return; }
      const cp = getCheckpoint(toolSetup.checkpointId);
      if (!cp) { setToolError("Pick a checkpoint."); return; }
      const idx = clamp(Math.round(numericValue(toolSetup.checkpointItem, 0)), 0, cp.items.length - 1);
      const item = cp.items[idx];
      if (!item) { setToolError("Pick a checkpoint question."); return; }
      const { run, error } = await launchCheckpoint(supabase, {
        sessionId: teacherSession.id, periodId: null, lessonKey: cp.lessonKey,
        checkpointId: cp.id, itemIndex: idx, ccss: item.ccss,
        prompt: item.q, correctAnswer: item.a, misses: item.misses,
      });
      if (error === "SETUP") { setToolError("One-time setup: run supabase/checkpoints.sql in Supabase, then try again."); return; }
      if (error || !run) { setToolError(error || "The checkpoint could not be sent."); return; }
      setToolError(null);
      setPublishedTool({ stateId: "tool-checkpoint", tool: buildLiveToolConfig("tool-checkpoint", toolSetup) });
      return;
    }

    const tool = buildLiveToolConfig(activeToolState, toolSetup);
    if ((tool.route === "/order-of-operations" || tool.route === "/algebra-tiles") && !tool.config.expression) {
      setToolError("Add the expression students should build or solve.");
      return;
    }

    setToolError(null);
    setPublishedTool({ stateId: activeToolState, tool });
  }

  useEffect(() => {
    if (!activeUsesDiscussionProtocol && showDiscussion) {
      setShowDiscussion(false);
      setDiscussionFlow(null);
    }
  }, [activeUsesDiscussionProtocol, showDiscussion]);

  const liveFlowSignature = useMemo(() => {
    const state = activeState
      ? {
          id: activeState.id,
          label: activeItem?.title || activeState.label,
          description: activeItem?.studentDirections || activeState.desc,
          color: activeState.color,
          semantic: inferClassroomStage(activeState.id, activeItem?.title || activeState.label),
        }
      : null;
    const phase = activeUsesDiscussionProtocol && showDiscussion ? discussionFlow : null;
    const poll = controlPoll?.stateId === activeInteractiveState
      ? {
          id: controlPoll.id,
          kind: controlPoll.kind,
          question: controlPoll.question,
          choices: controlPoll.choices,
          stage: controlPoll.stage,
          awaitingTeacherAdvance: controlPoll.awaitingTeacherAdvance,
        }
      : null;
    const tool = publishedTool?.stateId === activeToolState ? publishedTool.tool : null;
    const resource = activeItem?.linkUrl
      ? {
          label: activeState?.id === "exit"
            ? "Open Exit Ticket"
            : activeItem.responseMode?.trim().toLowerCase() === "assigned tool"
              ? "Open Assigned Tool"
              : "Open Lesson Resource",
          url: activeItem.linkUrl,
        }
      : null;
    const structuredWork = activeState?.id === "independent"
      ? lessonWorkSummary(activeLessonContext)
      : "";
    const presentationBody = activeState?.id === "closeout"
      ? CLOSEOUT_DIRECTIONS
      : activeItem?.mainDisplay
      || (activeState?.id === "independent"
        ? structuredWork || activeItem?.paperTask || activeItem?.question || activeItem?.studentDirections || activeState.desc
        : activeItem?.question || activeItem?.studentDirections || activeItem?.paperTask || activeState?.desc || "");
    const configuredDiscussionSupports = discussionSupportsForLesson(activeLessonContext?.code);
    const discussionStems = activeUsesDiscussionProtocol
      ? splitLiveFlowLines(activeItem?.discussionStems || activeLessonContext?.discussionStems)
        .concat(activeItem?.discussionStems || activeLessonContext?.discussionStems ? [] : configuredDiscussionSupports.sentenceStems)
      : [];
    const vocabulary = activeUsesDiscussionProtocol
      ? splitLiveFlowVocabulary(activeItem?.vocabulary || activeLessonContext?.discussionVocabulary)
        .concat(activeItem?.vocabulary || activeLessonContext?.discussionVocabulary ? [] : configuredDiscussionSupports.keyVocabulary)
      : [];
    const presentation = activeState
      ? {
          title: activeItem?.title || activeState.label,
          body: presentationBody,
          mainDisplay: activeItem?.mainDisplay || "",
          mode: resource
            ? "resource" as const
            : poll
              ? "poll" as const
              : tool
                ? "tool" as const
                : activeState.id === "i-do" || activeState.id === "manip" || activeState.id === "we-do"
                  ? "board" as const
                  : "directions" as const,
          notionStepId: activeItem?.notionStepId || null,
          boardOpen,
          paceDirections: activeState.id === "closeout"
            ? CLOSEOUT_DIRECTIONS
            : activeItem?.paceDirections || activeState.paceAction || activeItem?.studentDirections || activeState.desc,
          studentAction: activeState.id === "closeout"
            ? CLOSEOUT_DIRECTIONS
            : activeItem?.studentAction || activeState.studentAction || activeItem?.studentDirections || activeState.desc,
          responseMode: activeItem?.responseMode || "",
          workSpaceAvailable: activeItem?.workSpaceAvailable,
          publicSurfaceMode: activeItem?.publicSurfaceMode || defaultPublicSurfaceModeForState(activeState.id),
          routineConfig: activeItem?.routineConfig || null,
          discussionStems,
          vocabulary,
          scoreboardStage: canRevealM2T1L1FinalScore(activeLessonContext?.code, activeState.id, state?.semantic)
            ? scoreboardStage
            : undefined,
        }
      : null;
    const timer = poll?.stage === "results"
      ? null
      : phase?.timed && phase.totalSeconds !== null && phase.secondsLeft !== null
      ? {
          totalSeconds: phase.totalSeconds,
          secondsLeft: phase.secondsLeft,
          running: phase.running,
          finished: phase.finished,
        }
      : activeState
        ? {
            totalSeconds: activeMinutes * 60,
            secondsLeft: running ? timerStartSecondsRef.current || secondsLeft : secondsLeft,
            running,
            finished,
            endsAt: running && timerEndsAtRef.current ? new Date(timerEndsAtRef.current).toISOString() : null,
          }
        : null;

    const nextItem = currentIndex >= 0 ? lineup[currentIndex + 1] : undefined;
    const nextState = nextItem ? bank.find((candidate) => candidate.id === nextItem.stateId) : undefined;
    const publicCriterion = publicSuccessCriterion(activeLessonContext?.selectedSuccessCriterion);
    const lesson = activeLessonContext
      ? {
          id: activeLessonContext.id,
          code: activeLessonContext.code,
          title: activeLessonContext.title,
          learningIntention: activeLessonContext.learningIntention,
          successCriteria: publicCriterion,
          selectedSuccessCriterion: publicCriterion,
          classroomMode: activeLessonContext.classroomMode,
          discussionStems: splitLiveFlowLines(activeLessonContext.discussionStems),
          discussionVocabulary: splitLiveFlowVocabulary(activeLessonContext.discussionVocabulary),
          requiredPaperWork: activeLessonContext.requiredPaperWork,
          requiredDigitalWork: activeLessonContext.requiredDigitalWork,
          optionalSupport: activeLessonContext.optionalSupport,
          bigDogChallenge: activeLessonContext.bigDogChallenge,
          dueAndTurnIn: activeLessonContext.dueAndTurnIn,
          helpPath: activeLessonContext.helpPath,
        }
      : null;
    const sequence = activeState
      ? {
          currentIndex,
          totalSteps: lineup.length,
          nextLabel: nextItem?.title || nextState?.label || null,
          nextDirections: nextItem?.paceDirections || nextItem?.studentDirections || nextState?.desc || null,
          advanceMode: autoAdvance ? "automatic" as const : "manual" as const,
          steps: lineup.map((item) => {
            const itemState = bank.find((candidate) => candidate.id === item.stateId);
            return {
              stateId: item.stateId,
              label: item.title || itemState?.label || "Lesson state",
              description: item.studentDirections || itemState?.desc || "Wait for the teacher's directions.",
              color: itemState?.color || "#35785a",
              semantic: inferClassroomStage(item.stateId, item.title || itemState?.label || ""),
              durationSeconds: minutesForLineupItem(item, bank) * 60,
              question: item.question || "",
              pollKind: usesDiscussionProtocol(item.stateId, item.title || itemState?.label || "")
                ? null
                : resolveLiveStepPollKind(item.responseMode, item.pollKind, item.stateId),
              choices: item.choices || [],
              correctAnswer: item.correctAnswer || "",
              standard: item.standard || "",
              resourceUrl: item.linkUrl || "",
              paperTask: item.paperTask || "",
              notionStepId: item.notionStepId || null,
              notionLessonId: item.notionLessonId || null,
              lessonCode: item.lessonCode || activeLessonContext?.code || "",
              mainDisplay: item.mainDisplay || "",
              paceDirections: item.paceDirections || itemState?.paceAction || item.studentDirections || itemState?.desc || "",
              studentAction: item.studentAction || itemState?.studentAction || item.studentDirections || itemState?.desc || "",
              discussionStems: usesDiscussionProtocol(item.stateId, item.title || itemState?.label || "")
                ? splitLiveFlowLines(item.discussionStems || activeLessonContext?.discussionStems)
                  .concat(item.discussionStems || activeLessonContext?.discussionStems ? [] : discussionSupportsForLesson(item.lessonCode || activeLessonContext?.code).sentenceStems)
                : [],
              vocabulary: usesDiscussionProtocol(item.stateId, item.title || itemState?.label || "")
                ? splitLiveFlowVocabulary(item.vocabulary || activeLessonContext?.discussionVocabulary)
                  .concat(item.vocabulary || activeLessonContext?.discussionVocabulary ? [] : discussionSupportsForLesson(item.lessonCode || activeLessonContext?.code).keyVocabulary)
                : [],
              responseMode: item.responseMode || "",
              workSpaceAvailable: item.workSpaceAvailable,
              publicSurfaceMode: item.publicSurfaceMode || defaultPublicSurfaceModeForState(item.stateId),
              routineConfig: item.routineConfig || null,
            };
          }),
        }
      : null;
    const activePaperTask = activeItem?.paperTask
      || (activeState?.id === "independent" ? activeLessonContext?.requiredPaperWork : "")
      || "";
    const paper = activePaperTask ? { task: activePaperTask } : null;

    return JSON.stringify({ version: 2, state, phase, timer, poll, resource, presentation, tool, lesson, sequence, paper });
  }, [activeInteractiveState, activeItem, activeLessonContext, activeMinutes, activeState, activeToolState, autoAdvance, bank, boardOpen, controlPoll, currentIndex, discussionFlow, finished, lineup, publishedTool, running, scoreboardStage, secondsLeft, showDiscussion]);

  const flushLiveFlowUpdates = useCallback(async () => {
    if (liveFlowSyncingRef.current) return;
    liveFlowSyncingRef.current = true;
    try {
      while (pendingLiveFlowSyncRef.current) {
        const pending = pendingLiveFlowSyncRef.current;
        pendingLiveFlowSyncRef.current = null;
        if (pending.epoch !== liveFlowSyncEpochRef.current) continue;
        const expectedRevision = pending.expectedRevision === undefined
          ? serverFlowRevisionRef.current
          : pending.expectedRevision;
        try {
          const result = await teacherPost<{ session: TeacherSessionRow }>("/api/teacher/session", {
            action: "update",
            sessionId: pending.sessionId,
            liveFlow: pending.snapshot,
            expectedLiveFlowUpdatedAt: expectedRevision,
          });
          if (pending.epoch !== liveFlowSyncEpochRef.current) continue;
          if (result.session.live_flow?.updatedAt) {
            serverFlowRevisionRef.current = result.session.live_flow.updatedAt;
          }
          setFlowSyncError(null);
        } catch (syncError) {
          if (pending.epoch !== liveFlowSyncEpochRef.current) continue;
          if (syncError instanceof TeacherApiError && syncError.status === 409) {
            liveFlowSyncEpochRef.current += 1;
            pendingLiveFlowSyncRef.current = null;
            hydratedSessionRef.current = null;
            const latest = await teacherApiRequest<{ sessions: TeacherSessionRow[] }>("/api/teacher/session")
              .catch(() => ({ sessions: [] }));
            const openSession = latest.sessions.find((candidate) => candidate.id === pending.sessionId) ?? null;
            if (openSession) setTeacherSession(openSession);
          }
          setFlowSyncError(syncError instanceof Error ? syncError.message : "Live flow could not be synchronized.");
        }
      }
    } finally {
      liveFlowSyncingRef.current = false;
    }
  }, []);

  // Keep student Chromebooks in sync with the existing /control state machine.
  // The write is skipped unless the teacher explicitly selected Live Class Flow.
  useEffect(() => {
    if (previewSyncPaused || !supabase || teacherSession?.broadcast !== LIVE_FLOW_MODE) {
      pendingLiveFlowSyncRef.current = null;
      return;
    }
    if (serverHydrationGeneration !== hydrationGenerationRef.current) {
      pendingLiveFlowSyncRef.current = null;
      return;
    }
    if (processedHydrationGenerationRef.current !== serverHydrationGeneration) {
      processedHydrationGenerationRef.current = serverHydrationGeneration;
      pendingLiveFlowSyncRef.current = null;
      return;
    }
    const snapshot = {
      ...(JSON.parse(liveFlowSignature) as Omit<LiveClassFlowSnapshot, "updatedAt">),
      updatedAt: new Date().toISOString(),
    };
    pendingLiveFlowSyncRef.current = {
      sessionId: teacherSession.id,
      snapshot,
      epoch: liveFlowSyncEpochRef.current,
      expectedRevision: liveFlowSyncingRef.current ? undefined : serverFlowRevisionRef.current,
    };
    void flushLiveFlowUpdates();
  }, [flushLiveFlowUpdates, liveFlowSignature, previewSyncPaused, serverHydrationGeneration, supabase, teacherSession?.broadcast, teacherSession?.id]);

  const handleDiscussionFlowChange = useCallback((snapshot: DiscussionPhaseSnapshot) => {
    setDiscussionFlow(snapshot);
  }, []);

  const handleDiscussionRemoteCommand = useCallback((command: TeacherRemoteCommand) => {
    setDiscussionRemoteCommand((current) => current?.nonce === command.nonce ? null : current);
    if (!teacherSession) return;
    pendingRemoteReceiptRef.current = {
      sessionId: teacherSession.id,
      command: { ...command, receivedAt: new Date().toISOString() },
    };
    void flushRemoteReceipt();
  }, [flushRemoteReceipt, teacherSession]);

  const closeDiscussion = useCallback(() => {
    setShowDiscussion(false);
    setDiscussionFlow(null);
    setDiscussionRemoteCommand(null);
  }, []);

  // ── Lineup management ───────────────────────────────────────────────────
  function addToLineup(stateId: string) {
    const nextItem = { uid: uid(), stateId };
    const nextLineup = [...lineup, nextItem];
    persistLineup(nextLineup);
    if (currentIndex < 0) {
      const state = bank.find((item) => item.id === stateId);
      if (state) {
        setCurrentIndex(nextLineup.length - 1);
        secRef.current = state.minutes * 60;
        setSecondsLeft(secRef.current);
        setRunning(false);
        setFinished(false);
        stopMusic();
      }
    }
  }
  function removeFromLineup(u: string) {
    const idx = lineup.findIndex((l) => l.uid === u);
    const next = lineup.filter((l) => l.uid !== u);
    persistLineup(next);
    if (idx === currentIndex) { setCurrentIndex(-1); setRunning(false); setFinished(false); stopMusic(); }
  }
  function moveItem(u: string, dir: -1 | 1) {
    const i = lineup.findIndex((l) => l.uid === u);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= lineup.length) return;
    const next = [...lineup];
    [next[i], next[j]] = [next[j], next[i]];
    persistLineup(next);
  }
  function loadIndex(i: number, startImmediately = false) {
    const item = lineup[i];
    if (!item) return;
    const st = bank.find((s) => s.id === item.stateId);
    if (!st) return;
    setCurrentIndex(i);
    const minutes = minutesForLineupItem(item, bank);
    secRef.current = minutes * 60;
    setSecondsLeft(minutes * 60);
    if (startImmediately && minutes > 0) armTimer(minutes * 60);
    else disarmTimer();
    setRunning(startImmediately && minutes > 0);
    setFinished(false);
    setBoardOpen(false);
    setScoreboardStage("halftime");
    stopMusic();
    if (startImmediately && minutes > 0) startMusicFor(st.id);
  }

  // ── Lesson presets (saved sequences) ────────────────────────────────────
  const refreshPresets = useCallback(async () => {
    setPresets(await listLessonPresets());
  }, []);

  function loadPreset(p: LessonPreset) {
    setPreviewSyncPaused(true);
    const newBank = DEFAULT_STATES.map((d) => ({
      ...d,
      minutes: typeof p.minutes[d.id] === "number" ? p.minutes[d.id] : d.minutes,
    }));
    const newLineup = p.lineup.map((s) => ({ uid: uid(), stateId: s.stateId }));
    persistBank(newBank);
    persistLineup(newLineup);
    const first = newLineup[0] ? newBank.find((s) => s.id === newLineup[0].stateId) : undefined;
    setCurrentIndex(newLineup.length ? 0 : -1);
    if (first) { secRef.current = first.minutes * 60; setSecondsLeft(first.minutes * 60); }
    setAutoAdvance(false);
    setRunning(false);
    setFinished(false);
    setActiveLessonContext(null);
    stopMusic();
    setShowLessons(false);
    const previewMessage = `Previewed ${p.code || p.title || "saved sequence"}. Student and projector screens are unchanged until you start the sequence.`;
    setLessonMsg(previewMessage);
    setTodayMsg(previewMessage);
  }

  async function saveCurrentLesson() {
    const code = saveCode.trim();
    if (!code) { setLessonMsg("Add a code first (e.g. M1.T1.L1)."); return; }
    if (lineup.length === 0) { setLessonMsg("Build a lineup before saving."); return; }
    const minutes: Record<string, number> = {};
    bank.forEach((b) => { minutes[b.id] = b.minutes; });
    const res = await saveLessonPreset({
      code,
      title: saveTitle.trim(),
      lineup: lineup.map((l) => ({ stateId: l.stateId })),
      minutes,
    });
    if (!res.ok) { setLessonMsg(res.error || "Couldn't save."); return; }
    setLessonMsg("Saved");
    setSaveCode("");
    setSaveTitle("");
    refreshPresets();
  }

  async function removePreset(id: string) {
    await deleteLessonPreset(id);
    refreshPresets();
  }

  // Lesson Steps are the source of truth; the older tools-only path remains as
  // a fallback for pages that have not been converted yet.
  function applyNotionLesson(lesson: TodayLesson, confirmReplace = true): boolean {
    const mapped: string[] = [];
    const unmatched: string[] = [];
    for (const name of parseLessonList(lesson.tools)) {
      const id = matchLessonToolStateId(name);
      if (id) { if (!mapped.includes(id)) mapped.push(id); }
      else unmatched.push(name);
    }
    if (confirmReplace && lineup.length > 0 && !window.confirm(`Replace the current lineup with “${lesson.title || "this lesson"}”?`)) {
      setTodayMsg(null);
      return false;
    }
    setPreviewSyncPaused(true);
    const lessonSteps = (lesson.steps || []).filter((step) => step.stateId && bank.some((state) => state.id === step.stateId));
    const newLineup: LineupItem[] = lessonSteps.length
      ? lessonSteps.map((step) => ({
          uid: uid(),
          stateId: step.stateId,
          minutes: Math.max(1, step.duration || 1),
          title: step.title,
          studentDirections: step.studentDirections,
          question: step.question,
          pollKind: step.pollKind,
          choices: step.choices,
          correctAnswer: step.correctAnswer,
          standard: step.standard,
          notionStepId: step.id,
          notionLessonId: lesson.id,
          lessonCode: lesson.lessonCode,
          linkUrl: (step.responseMode.trim().toLowerCase() === "assigned tool" ? liveAssignedToolRoute(step.tool) : null)
            || step.linkUrl
            || (step.stateId === "warmup" ? lesson.warmUpLink : "")
            || (step.stateId === "exit" ? lesson.exitTicketLink : "")
            || "",
          paperTask: step.paperTask,
          advance: step.advance,
          mainDisplay: step.mainDisplay,
          paceDirections: step.paceDirections,
          studentAction: step.studentAction,
          remoteActions: step.remoteActions || step.teacherNotes,
          discussionStems: step.discussionStems,
          vocabulary: step.vocabulary,
          responseMode: step.responseMode,
          workSpaceAvailable: step.workSpaceAvailable,
          publicSurfaceMode: step.publicSurfaceMode,
          routineConfig: step.routineConfig,
        }))
      : ["warmup", ...mapped, "exit"].map((stateId) => ({ uid: uid(), stateId }));
    autoOpenedStepRef.current.clear();
    setControlPoll(null);
    setPollAnswers([]);
    setActiveLessonContext({
      id: lesson.id,
      code: lesson.lessonCode || "",
      title: lesson.title || lesson.lessonCode || "Math 6 lesson",
      learningIntention: lesson.learningIntention || "",
      successCriteria: lesson.successCriteria || "",
      selectedSuccessCriterion: lesson.selectedSuccessCriterion || "",
      classroomMode: lesson.classroomMode || "",
      discussionStems: lesson.discussionStems || "",
      discussionVocabulary: lesson.discussionVocabulary || "",
      requiredPaperWork: lesson.requiredPaperWork || "",
      requiredDigitalWork: lesson.requiredDigitalWork || "",
      optionalSupport: lesson.optionalSupport || "",
      bigDogChallenge: lesson.bigDogChallenge || "",
      dueAndTurnIn: lesson.dueAndTurnIn || "",
      helpPath: lesson.helpPath || "",
    });
    persistLineup(newLineup);
    const first = newLineup[0];
    setCurrentIndex(0);
    if (first) {
      const minutes = minutesForLineupItem(first, bank);
      secRef.current = minutes * 60;
      setSecondsLeft(minutes * 60);
    }
    setAutoAdvance(false);
    setRunning(false);
    setFinished(false);
    stopMusic();
    setShowLessons(false);
    const parts = [
      `Previewed “${lesson.title || "today's lesson"}”`,
      lessonSteps.length ? `${lessonSteps.length} timed steps added` : `${mapped.length} tool${mapped.length === 1 ? "" : "s"} added`,
      "student and projector screens unchanged until start",
    ];
    const criterionValidationMessage = selectedSuccessCriterionValidationMessage(lesson.selectedSuccessCriterion);
    if (criterionValidationMessage) parts.push(`start blocked: ${criterionValidationMessage}`);
    if (unmatched.length) parts.push(`couldn't match: ${unmatched.join(", ")}`);
    setTodayMsg(parts.join(" · "));
    window.setTimeout(() => setTodayMsg(null), 8000);
    return true;
  }

  // Pull today's published Notion lesson and build the full timestamped lineup.
  async function loadTodayLesson() {
    setTodayMsg("Loading today's lesson from Notion…");
    try {
      const res = await fetch("/api/today", { cache: "no-store" });
      const data = (await res.json()) as { lesson?: Pick<TodayLesson, "id"> | null; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Couldn't load today's lesson.");
      if (!data.lesson) {
        setTodayMsg("No lesson is published in Notion for today.");
        window.setTimeout(() => setTodayMsg(null), 6000);
        return;
      }
      const teacherLesson = await teacherApiRequest<{ lesson: TodayLesson }>(
        `/api/teacher/lesson?id=${encodeURIComponent(data.lesson.id)}`,
      );
      applyNotionLesson(teacherLesson.lesson);
    } catch (error) {
      setTodayMsg(error instanceof Error ? error.message : "Couldn't reach Notion — check the connection and try again.");
      window.setTimeout(() => setTodayMsg(null), 6000);
    }
  }

  async function loadNotionLesson(
    requestedCode: string,
    options: { lessonId?: string; confirmReplace?: boolean; run?: boolean } = {},
  ): Promise<boolean> {
    const code = requestedCode.trim();
    const lessonId = options.lessonId?.trim() || "";
    if (!code && !lessonId) {
      setLessonMsg("Enter a Notion lesson code first.");
      return false;
    }
    const displayCode = code || "the selected lesson";
    setLessonMsg(`Loading ${displayCode} from Notion…`);
    try {
      const lessonQuery = lessonId
        ? `id=${encodeURIComponent(lessonId)}`
        : `code=${encodeURIComponent(code)}`;
      const res = await fetch(`/api/teacher/lesson?${lessonQuery}`, { cache: "no-store" });
      const data = (await res.json()) as { lesson?: TodayLesson | null; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Couldn't load the lesson.");
      if (!data.lesson) {
        setLessonMsg(code ? `No Notion lesson uses the code ${code}.` : "The selected Notion lesson could not be found.");
        return false;
      }
      if (applyNotionLesson(data.lesson, options.confirmReplace ?? true)) {
        setLessonMsg(`Previewed ${data.lesson.lessonCode || code} from Notion. Student and projector screens are unchanged until you start the lesson.`);
        setNotionLessonCode("");
        if (options.run) setPendingRun(true);
        return true;
      }
      return false;
    } catch (error) {
      setLessonMsg(error instanceof Error ? error.message : "Couldn't reach Notion.");
      return false;
    }
  }

  async function loadNotionLessonByCode() {
    await loadNotionLesson(notionLessonCode);
  }

  function consumeNotionLaunchQuery() {
    const url = new URL(window.location.href);
    url.searchParams.delete("notionLessonId");
    url.searchParams.delete("notionLessonCode");
    url.searchParams.delete("run");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function consumePresetLaunchQuery() {
    const url = new URL(window.location.href);
    url.searchParams.delete("lesson");
    url.searchParams.delete("run");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  async function switchSessionToLiveFlow(session: TeacherSessionRow): Promise<void> {
    if (session.broadcast === LIVE_FLOW_MODE) return;
    const result = await teacherPost<{ session: { broadcast: string | null } }>("/api/teacher/session", {
      action: "update",
      sessionId: session.id,
      broadcast: LIVE_FLOW_MODE,
    });
    setTeacherSession((current) => (
      current?.id === session.id
        ? { ...current, broadcast: result.session.broadcast || LIVE_FLOW_MODE }
        : current
    ));
  }

  // When launched from the Sequence Builder with ?run=1, auto-start the lineup
  // once it has loaded so the lesson runs straight through.
  const [pendingRun, setPendingRun] = useState(false);
  useEffect(() => {
    refreshPresets();
    try {
      const params = new URLSearchParams(window.location.search);
      const notionCode = params.get("notionLessonCode")?.trim() || "";
      const notionId = params.get("notionLessonId")?.trim() || "";
      if (notionCode || notionId) {
        setNotionLessonCode(notionCode);
        setNotionLaunchRequest({ id: notionId, code: notionCode, run: params.get("run") === "1" });
        return;
      }
      const lessonId = params.get("lesson")?.trim() || "";
      if (lessonId) setPresetLaunchRequest({ id: lessonId, run: params.get("run") === "1" });
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wait for the open server session to hydrate before replacing it with the
  // lesson deliberately chosen from Teacher Home. Otherwise the older live
  // flow can arrive a moment later and overwrite the teacher's selection.
  useEffect(() => {
    if (!teacherSessionReady || !notionLaunchRequest || handledNotionLaunchRef.current) return;
    const serverSessionHydrated = !teacherSession?.live_flow?.sequence
      || hydratedSessionRef.current === teacherSession.id;
    if (!serverSessionHydrated) return;
    handledNotionLaunchRef.current = true;
    void (async () => {
      const reviewOnly = !notionLaunchRequest.run;
      setPreviewSyncPaused(reviewOnly);
      const loaded = await loadNotionLesson(notionLaunchRequest.code, {
        lessonId: notionLaunchRequest.id,
        confirmReplace: false,
        run: false,
      });
      if (!loaded) {
        setPreviewSyncPaused(false);
        return;
      }

      let shouldRun = notionLaunchRequest.run;
      let blockedMessage: string | null = null;

      if (shouldRun) {
        if (!teacherSession || teacherSession.status !== "open") {
          shouldRun = false;
          blockedMessage = "Lesson loaded but not started. Start a live session, then choose Begin lesson again.";
        } else {
          try {
            // The session must be in Live Class Flow before the new lineup can
            // start or publish its first state to connected Chromebooks.
            await switchSessionToLiveFlow(teacherSession);
          } catch {
            shouldRun = false;
            blockedMessage = "Lesson loaded but not started. Control could not connect the open session to Live Class Flow. Open Session, select Live Class Flow, then choose Begin lesson again.";
          }
        }
      }

      consumeNotionLaunchQuery();
      setNotionLaunchRequest(null);
      if (shouldRun) {
        const startingMessage = "Lesson connected. Starting automatic pacing.";
        setLessonMsg(startingMessage);
        setTodayMsg(startingMessage);
        setPendingRun(true);
      } else if (blockedMessage) {
        setPreviewSyncPaused(true);
        setLessonMsg(blockedMessage);
        setTodayMsg(blockedMessage);
      } else {
        const previewMessage = "Preview loaded. Student and projector screens are unchanged until you start the lesson.";
        setLessonMsg(previewMessage);
        setTodayMsg(previewMessage);
      }
    })();
    // loadNotionLesson intentionally runs only for the URL request captured at
    // mount; Control's normal lesson controls handle later choices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notionLaunchRequest, serverHydrationGeneration, teacherSession?.broadcast, teacherSession?.id, teacherSession?.status, teacherSessionReady]);

  // Saved Sequence Builder links need the same server-session guard as Notion
  // launches. Wait for any existing live flow to hydrate before replacing it,
  // then put the session in Live Class Flow before starting the new sequence.
  useEffect(() => {
    if (!teacherSessionReady || !presetLaunchRequest || handledPresetLaunchRef.current) return;
    const serverSessionHydrated = !teacherSession?.live_flow?.sequence
      || hydratedSessionRef.current === teacherSession.id;
    if (!serverSessionHydrated) return;
    handledPresetLaunchRef.current = true;
    void (async () => {
      const reviewOnly = !presetLaunchRequest.run;
      setPreviewSyncPaused(reviewOnly);
      setLessonMsg("Loading saved sequence…");
      const preset = await getLessonPreset(presetLaunchRequest.id);
      if (!preset) {
        setPreviewSyncPaused(false);
        setLessonMsg("The saved sequence could not be loaded. Refresh this page to try again.");
        return;
      }
      loadPreset(preset);

      let shouldRun = presetLaunchRequest.run;
      let blockedMessage: string | null = null;
      if (shouldRun && preset.lineup.length === 0) {
        shouldRun = false;
        blockedMessage = "Sequence loaded but not started because it has no steps. Add at least one step in Sequence Builder, then choose Run again.";
      } else if (shouldRun) {
        if (!teacherSession || teacherSession.status !== "open") {
          shouldRun = false;
          blockedMessage = "Sequence loaded but not started. Start a live session, then return to Sequence Builder and choose Run again.";
        } else {
          try {
            await switchSessionToLiveFlow(teacherSession);
          } catch {
            shouldRun = false;
            blockedMessage = "Sequence loaded but not started. Control could not connect the open session to Live Class Flow. Open Session, select Live Class Flow, then return to Sequence Builder and choose Run again.";
          }
        }
      }

      consumePresetLaunchQuery();
      setPresetLaunchRequest(null);
      if (shouldRun) {
        const startingMessage = "Sequence connected. Starting automatic pacing.";
        setLessonMsg(startingMessage);
        setTodayMsg(startingMessage);
        setPendingRun(true);
      } else if (blockedMessage) {
        setPreviewSyncPaused(true);
        setLessonMsg(blockedMessage);
        setTodayMsg(blockedMessage);
      } else {
        const previewMessage = `Previewed ${preset.code || preset.title || "saved sequence"}. Student and projector screens are unchanged until you start the sequence.`;
        setLessonMsg(previewMessage);
        setTodayMsg(previewMessage);
      }
    })();
    // Preset URL launches are one-shot requests captured at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetLaunchRequest, serverHydrationGeneration, teacherSession?.broadcast, teacherSession?.id, teacherSession?.status, teacherSessionReady]);

  useEffect(() => {
    if (pendingRun && lineup.length > 0) {
      setPendingRun(false);
      runSequence();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRun, lineup]);

  // ── Timer controls ──────────────────────────────────────────────────────
  function toggleRun() {
    if (!activeState) return;
    if (!running && activeLessonCriterionValidationMessage) {
      setLessonMsg(activeLessonCriterionValidationMessage);
      setTodayMsg(activeLessonCriterionValidationMessage);
      return;
    }
    setPreviewSyncPaused(false);
    if (secondsLeft <= 0) { secRef.current = activeMinutes * 60; setSecondsLeft(secRef.current); setFinished(false); }
    const willRun = !running;
    if (willRun) setAutoAdvance(true);
    if (willRun) armTimer(secRef.current);
    else disarmTimer();
    setRunning(willRun);
    if (willRun) startMusicFor(activeState.id);
    else if (musicRef.current) musicRef.current.pause();
  }
  function runSequence() {
    if (lineup.length === 0) return;
    if (activeLessonCriterionValidationMessage) {
      setPendingRun(false);
      setLessonMsg(activeLessonCriterionValidationMessage);
      setTodayMsg(activeLessonCriterionValidationMessage);
      return;
    }
    const nextIndex = currentIndex >= 0 ? currentIndex : 0;
    const item = lineup[nextIndex];
    const state = item ? bank.find((bankState) => bankState.id === item.stateId) : undefined;
    if (!state) return;
    setPreviewSyncPaused(false);
    setAutoAdvance(true);
    setCurrentIndex(nextIndex);
    secRef.current = secondsLeft > 0 && currentIndex === nextIndex ? secondsLeft : minutesForLineupItem(item, bank) * 60;
    armTimer(secRef.current);
    setSecondsLeft(secRef.current);
    setFinished(false);
    setRunning(true);
    stopMusic();
    startMusicFor(state.id);
  }
  function reset() {
    if (!activeState) return;
    secRef.current = activeMinutes * 60;
    setSecondsLeft(secRef.current);
    disarmTimer();
    setRunning(false);
    setFinished(false);
    stopMusic();
  }
  // Stop automatic pacing while leaving the current lesson state visible.
  function stopSequence() {
    setAutoAdvance(false);
    disarmTimer();
    setRunning(false);
    setFinished(false);
    stopMusic();
  }
  function adjust(deltaSeconds: number) {
    secRef.current = Math.max(0, secRef.current + deltaSeconds);
    if (running) armTimer(secRef.current);
    setSecondsLeft(secRef.current);
    if (deltaSeconds > 0) setFinished(false);
  }
  function next() {
    const keepRunning = running || autoAdvance;
    setRunning(false);
    stopMusic();
    if (controlPoll?.stage === "responding") {
      setControlPoll((current) => current ? {
        ...current,
        stage: "results",
        awaitingTeacherAdvance: true,
      } : null);
      void teacherPost("/api/teacher/poll", { action: "close", pollId: controlPoll.id });
      setFinished(true);
      return;
    }
    if (controlPoll?.stage === "results") {
      setControlPoll(null);
      setPollAnswers([]);
    }
    if (currentIndex + 1 < lineup.length) loadIndex(currentIndex + 1, keepRunning);
    else { setAutoAdvance(false); setRunning(false); setFinished(false); setCurrentIndex(-1); }
  }
  function previous() {
    if (currentIndex <= 0) return;
    const keepRunning = running;
    if (controlPoll?.stage === "responding") closeActivePoll();
    setControlPoll(null);
    setPollAnswers([]);
    loadIndex(currentIndex - 1, keepRunning);
  }

  useEffect(() => {
    const command = teacherSession?.remote_command;
    if (!command || command.nonce === lastRemoteCommandRef.current) return;
    lastRemoteCommandRef.current = command.nonce;
    if (command.action === "spin-spinner") return;
    if (isDiscussionRemoteAction(command.action) && !command.receivedAt) {
      if (!activeUsesDiscussionProtocol) return;
      if (!showDiscussion && teacherSession?.live_flow?.phase) {
        setDiscussionFlow(teacherSession.live_flow.phase);
      }
      setShowDiscussion(true);
      setDiscussionRemoteCommand(command);
      return;
    }
    if (command.receivedAt && teacherSession?.live_flow) {
      const publishedFlow = teacherSession.live_flow;
      const publishedTimer = publishedFlow.timer;
      markServerHydration(publishedFlow);
      if (publishedFlow.sequence?.steps?.length) {
        persistLineup(publishedFlow.sequence.steps.map((step) => ({
          uid: uid(),
          stateId: step.stateId,
          minutes: Math.max(1, Math.round(step.durationSeconds / 60)),
          title: step.label,
          studentDirections: step.description,
          question: step.question,
          pollKind: step.pollKind || "",
          choices: step.choices,
          correctAnswer: step.correctAnswer,
          standard: step.standard,
          notionStepId: step.notionStepId || undefined,
          notionLessonId: step.notionLessonId || undefined,
          lessonCode: step.lessonCode,
          linkUrl: step.resourceUrl,
          paperTask: step.paperTask,
          mainDisplay: step.mainDisplay,
          paceDirections: step.paceDirections,
          studentAction: step.studentAction,
          remoteActions: step.remoteActions,
          discussionStems: step.discussionStems?.join("\n"),
          vocabulary: step.vocabulary?.join("\n"),
          responseMode: step.responseMode,
          workSpaceAvailable: step.workSpaceAvailable,
          publicSurfaceMode: step.publicSurfaceMode,
          routineConfig: step.routineConfig,
        })));
      }
      if (publishedFlow.sequence) setCurrentIndex(publishedFlow.sequence.currentIndex);
      if (publishedFlow.sequence) setAutoAdvance(publishedFlow.sequence.advanceMode === "automatic");
      if (publishedFlow.lesson) {
        setActiveLessonContext({
          id: publishedFlow.lesson.id || "",
          code: publishedFlow.lesson.code,
          title: publishedFlow.lesson.title,
          learningIntention: publishedFlow.lesson.learningIntention,
          successCriteria: publicSuccessCriterion(publishedFlow.lesson.selectedSuccessCriterion),
          selectedSuccessCriterion: publicSuccessCriterion(publishedFlow.lesson.selectedSuccessCriterion),
          classroomMode: publishedFlow.lesson.classroomMode || "",
          discussionStems: publishedFlow.lesson.discussionStems?.join("\n") || "",
          discussionVocabulary: publishedFlow.lesson.discussionVocabulary?.join("\n") || "",
          requiredPaperWork: publishedFlow.lesson.requiredPaperWork || "",
          requiredDigitalWork: publishedFlow.lesson.requiredDigitalWork || "",
          optionalSupport: publishedFlow.lesson.optionalSupport || "",
          bigDogChallenge: publishedFlow.lesson.bigDogChallenge || "",
          dueAndTurnIn: publishedFlow.lesson.dueAndTurnIn || "",
          helpPath: publishedFlow.lesson.helpPath || "",
        });
      } else setActiveLessonContext(null);
      if (publishedTimer) {
        const publishedSeconds = liveTimerSeconds(publishedTimer);
        secRef.current = publishedSeconds;
        setSecondsLeft(publishedSeconds);
        const shouldRun = publishedTimer.running && publishedSeconds > 0;
        if (shouldRun) armTimer(publishedSeconds);
        else disarmTimer();
        setRunning(shouldRun);
        setFinished(publishedTimer.finished || (publishedTimer.running && publishedSeconds <= 0));
      } else {
        secRef.current = 0;
        setSecondsLeft(0);
        disarmTimer();
        setRunning(false);
        setFinished(publishedFlow.poll?.stage === "results");
        stopMusic();
      }
      setBoardOpen(Boolean(publishedFlow.presentation?.boardOpen));
      setScoreboardStage(publishedFlow.presentation?.scoreboardStage || "halftime");
      if (publishedFlow.phase && usesDiscussionProtocol(publishedFlow.state?.id, publishedFlow.state?.label || "")) {
        setDiscussionFlow(publishedFlow.phase);
        setShowDiscussion(true);
      } else {
        setDiscussionFlow(null);
        setShowDiscussion(false);
      }
      const publishedPoll = publishedFlow.poll;
      const publishedStateId = publishedFlow.state?.id;
      const interactiveStateId = publishedPoll && publishedStateId ? publishedStateId : null;
      setControlPoll(publishedPoll && interactiveStateId
        ? {
            id: publishedPoll.id,
            stateId: interactiveStateId,
            kind: publishedPoll.kind,
            question: publishedPoll.question,
            choices: publishedPoll.choices,
            stage: publishedPoll.stage,
            awaitingTeacherAdvance: publishedPoll.awaitingTeacherAdvance,
          }
        : null);
      setPollAnswers([]);
      return;
    }
    if (command.action === "next") next();
    else if (command.action === "previous") previous();
    else if (command.action === "toggle-timer") toggleRun();
    else if (command.action === "add-30") adjust(30);
    else if (command.action === "subtract-30") adjust(-30);
    else if (command.action === "reset-timer") reset();
    else if (command.action === "show-board") setBoardOpen(true);
    else if (command.action === "hide-board") setBoardOpen(false);
    else if (command.action === "play-warning") playCue("warn30");
    else if (command.action === "play-countdown") playCue("tick");
    else if (command.action === "play-times-up") playCue("end");
    else {
      const direction = abbieDirectionForRemoteAction(command.action);
      if (direction) requestAbbieLine(direction);
    }
    if (teacherSession) {
      pendingRemoteReceiptRef.current = {
        sessionId: teacherSession.id,
        command: { ...command, receivedAt: new Date().toISOString() },
      };
      void flushRemoteReceipt();
    }
    // These controls intentionally operate on the current state-machine snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherSession?.remote_command?.nonce, flushRemoteReceipt]);
  function editMinutes(id: string, minutes: number) {
    const clamped = Math.max(1, Math.min(120, Math.round(minutes) || 1));
    persistBank(bank.map((s) => (s.id === id ? { ...s, minutes: clamped } : s)));
    if (activeState && id === activeState.id && !running) {
      secRef.current = clamped * 60; setSecondsLeft(clamped * 60);
    }
  }

  // ── Sound upload ────────────────────────────────────────────────────────
  async function uploadSound(key: string, file: File | undefined) {
    if (!file) return;
    await idbPut(key, file);
    setSoundUrls((prev) => {
      if (prev[key]) URL.revokeObjectURL(prev[key]);
      return { ...prev, [key]: URL.createObjectURL(file) };
    });
  }
  async function clearSound(key: string) {
    await idbDel(key);
    setSoundUrls((prev) => {
      if (prev[key]) URL.revokeObjectURL(prev[key]);
      const n = { ...prev }; delete n[key]; return n;
    });
  }

  async function admitWaitingStudent(request: AdmissionRequest) {
    const studentEmail = admissionSelections[request.id];
    if (!teacherSession || !studentEmail || admittingRequestCode) return;

    setAdmittingRequestCode(request.requestCode);
    setAdmissionError(null);
    try {
      const result = await teacherPost<{
        sessionJoin: { id: string; studentId: string; displayName: string; joinedAt: string };
      }>("/api/teacher/session", {
        action: "admit",
        sessionId: teacherSession.id,
        requestCode: request.requestCode,
        studentEmail,
      });
      setAdmissionRequests((current) => current.filter((candidate) => candidate.id !== request.id));
      setAdmissionJoinedStudentIds((current) => current.includes(result.sessionJoin.studentId)
        ? current
        : [...current, result.sessionJoin.studentId]);
      setAdmissionSelections((current) => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
    } catch (actionError) {
      setAdmissionError(actionError instanceof Error ? actionError.message : "The student could not be admitted.");
    } finally {
      setAdmittingRequestCode(null);
    }
  }

  async function endTeacherSession() {
    if (!teacherSession || endingSession) return;
    if (!window.confirm("End this session for every connected student?")) return;
    const sessionId = teacherSession.id;
    setEndingSession(true);
    setTodayMsg(null);
    try {
      await teacherPost("/api/teacher/session", { action: "close", sessionId });
      clearStoredTeacherSession(sessionId);
      pendingLiveFlowSyncRef.current = null;
      setTeacherSession(null);
      setJoinCode(null);
      setAdmissionRequests([]);
      setAdmissionRoster([]);
      setAdmissionJoinedStudentIds([]);
      setAdmissionSelections({});
      setAdmissionError(null);
      setShowAdmissions(false);
      setControlPoll(null);
      setPollAnswers([]);
      setLiveChallenge(null);
      setLiveChallengeBoard([]);
      setFlowSyncError(null);
      setTodayMsg("Session ended. Connected student screens have been released.");
    } catch (actionError) {
      setTodayMsg(actionError instanceof Error ? actionError.message : "The session could not be ended.");
    } finally {
      setEndingSession(false);
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable;
      if (isTyping || !activeState || editing || showSounds || showAdmissions) return;
      if (e.code === "Space") { e.preventDefault(); toggleRun(); }
      else if (e.code === "ArrowRight" || e.code === "PageDown") { e.preventDefault(); next(); }
      else if (e.code === "ArrowLeft" || e.code === "PageUp") { e.preventDefault(); previous(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeState, editing, showAdmissions, showSounds, secondsLeft, running]);

  const accent = activeState?.color ?? "#4e6ef2";
  const inFinal10 = running && secondsLeft <= 10 && secondsLeft > 0;
  const overBudget = totalMin > PERIOD_MIN;
  const denom = activeState ? activeMinutes * 60 : 1;
  const pct = activeState ? Math.max(0, Math.min(100, (secondsLeft / denom) * 100)) : 0;
  const hasNext = currentIndex + 1 < lineup.length;
  const nextState = hasNext ? bank.find((s) => s.id === lineup[currentIndex + 1].stateId) : undefined;
  const nextLabel = hasNext ? lineup[currentIndex + 1]?.title || nextState?.label : undefined;
  const liveFlowConnected = teacherSession?.status === "open" && teacherSession.broadcast === LIVE_FLOW_MODE;
  const liveFlowStatus = !supabase
    ? "Live sync unavailable"
    : flowSyncError
      ? formatLiveFlowError(flowSyncError)
      : liveFlowConnected
        ? "Live Class Flow connected"
        : teacherSession?.status === "open"
          ? `Session ${teacherSession.join_code || "open"} - select Live Class Flow`
          : "Start a session to connect students";
  const groupedBankSections = BANK_GROUPS.map((group) => ({
    ...group,
    states: bank.filter((state) => (group.stateIds as readonly string[]).includes(state.id)),
  })).filter((group) => group.states.length > 0);
  const groupedBankIds = new Set<string>(BANK_GROUPS.flatMap((group) => [...group.stateIds]));
  const ungroupedBankStates = bank.filter((state) => !groupedBankIds.has(state.id));
  const renderBankChip = (state: ClassState) => (
    <div key={state.id} className="cx-chip" onClick={() => !editing && addToLineup(state.id)} style={editing ? { cursor: "default" } : undefined}>
      <span className="dot" style={{ background: state.color }} />
      {state.label}
      {soundUrls[`music:${state.id}`] && <span className="cx-music-tag">audio</span>}
      {editing ? (
        <input className="cx-min-in" type="number" min={1} max={120} value={state.minutes}
          onClick={(e) => e.stopPropagation()} onChange={(e) => editMinutes(state.id, Number(e.target.value))} />
      ) : (
        <span className="m">{state.minutes}m</span>
      )}
    </div>
  );

  return (
    <>
      <style>{`
        .cx-root { min-height:100vh; background:${finished ? "#2a0d0d" : warnFlash ? "#1c190d" : "#14110c"}; color:#fff; font-family:var(--bdb-font); display:grid; grid-template-rows:auto 1fr auto auto; transition:background 300ms ease; }
        .cx-overlay { position:fixed; inset:0; z-index:50; overflow:auto; background:#14110c; }
        .cx-top { display:flex; align-items:center; justify-content:space-between; padding:14px 26px; border-bottom:1px solid #2a241a; flex-wrap:wrap; gap:8px; }
        .cx-mark { font-size:0.76rem; font-weight:900; letter-spacing:0.14em; text-transform:uppercase; color:${accent}; margin:0; transition:color 300ms ease; }
        .cx-live-status { margin:0 auto 0 0; border:1px solid ${liveFlowConnected && !flowSyncError ? "rgba(20,184,166,0.45)" : "rgba(251,191,36,0.4)"}; background:${liveFlowConnected && !flowSyncError ? "rgba(20,184,166,0.12)" : "rgba(251,191,36,0.1)"}; color:${liveFlowConnected && !flowSyncError ? "#5eead4" : "#fcaf38"}; border-radius:999px; padding:6px 10px; font-size:0.72rem; font-weight:900; letter-spacing:0.07em; text-transform:uppercase; max-width:min(52vw,520px); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .cx-conductor-note { color:#a39a88; font-size:0.7rem; font-weight:850; letter-spacing:0.04em; white-space:nowrap; }
        .cx-tbtns { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .cx-sbtn { font-size:0.76rem; font-weight:800; letter-spacing:0.05em; text-transform:uppercase; color:#a39a88; background:transparent; border:1px solid #2a241a; border-radius:7px; padding:7px 12px; cursor:pointer; text-decoration:none; transition:all 140ms ease; }
        .cx-sbtn:hover { border-color:${accent}; color:#fff; }
        .cx-home { border-color:#3a3228; color:#d8d2c5; }
        .cx-admission-alert { border-color:rgba(252,175,56,0.7); background:rgba(252,175,56,0.12); color:#ffd28a; }
        .cx-admission-alert:hover { border-color:#fcaf38; background:rgba(252,175,56,0.2); color:#fff; }
        .cx-end-session { border-color:rgba(249,83,53,0.55); color:#fca5a5; }
        .cx-end-session:hover { border-color:#f95335; color:#fff; background:rgba(249,83,53,0.14); }
        .cx-end-session:disabled { opacity:0.5; cursor:wait; }
        .cx-divider { width:1px; height:22px; background:#2a241a; flex:none; margin:0 2px; }

        .cx-main { display:grid; align-content:center; justify-items:center; gap:18px; padding:18px; text-align:center; }
        .cx-main.cx-main-visual { align-content:start; gap:10px; padding:12px 18px; }
        .cx-story-head { width:min(94vw,1180px); display:flex; align-items:end; justify-content:space-between; gap:20px; text-align:left; }
        .cx-story-head-copy { min-width:0; display:grid; gap:2px; }
        .cx-story-head .cx-pos { font-size:0.67rem; }
        .cx-story-head .cx-state { min-height:0; font-size:clamp(1.05rem,2.2vw,1.75rem); line-height:1.05; }
        .cx-story-time { flex:none; color:#fff; font-size:clamp(2.15rem,5vw,4.1rem); line-height:0.85; font-weight:950; font-variant-numeric:tabular-nums; letter-spacing:-0.045em; }
        .cx-story-time.final { color:#fbbf24; animation:cxPulse 1s ease-in-out infinite; }
        .cx-story-time.finished { color:#f95335; animation:cxFlash 0.7s steps(1) infinite; }
        .cx-story-stage { width:min(94vw,1180px); min-width:0; }
        .cx-main-visual .cx-progress { width:min(76vw,650px); height:10px; }
        .cx-main-visual .cx-note { min-height:0.8em; font-size:0.82rem; }
        .cx-state { font-size:clamp(1.2rem,3.5vw,2.2rem); font-weight:900; color:${accent}; min-height:1.2em; transition:color 300ms ease; }
        .cx-pos { font-size:0.8rem; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#7c7363; }
        .cx-clock { font-variant-numeric:tabular-nums; font-weight:900; line-height:0.9; letter-spacing:-0.02em;
          font-size:${inFinal10 ? "clamp(9rem,40vw,28rem)" : "clamp(5rem,20vw,15rem)"};
          color:${inFinal10 ? "#fbbf24" : finished ? "#f95335" : "#fff"};
          animation:${finished ? "cxFlash 0.7s steps(1) infinite" : inFinal10 ? "cxPulse 1s ease-in-out infinite" : "none"}; }
        @keyframes cxFlash { 50%{opacity:0.18;} }
        @keyframes cxPulse { 50%{opacity:0.55; transform:scale(1.04);} }
        .cx-note { font-size:1.1rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; min-height:1.3em; }
        .cx-warn { color:#fcaf38; } .cx-fin { color:#f95335; } .cx-idle { color:#5a5142; font-weight:700; max-width:440px; text-transform:none; letter-spacing:0; }
        .cx-desc { font-size:clamp(1.1rem,3vw,1.9rem); font-weight:800; color:#efe9df; max-width:780px; line-height:1.3; }
        .cx-join { display:inline-flex; align-items:center; gap:16px; margin-bottom:18px; padding:10px 22px; border-radius:16px; background:#101820; border:1px solid #2a3a44; }
        .cx-join-label { font-size:0.8rem; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; color:#7fd6cf; }
        .cx-join-code { font-size:clamp(2.2rem,6vw,3.6rem); font-weight:900; letter-spacing:0.16em; color:#5eead4; line-height:1; }
        .cx-progress { width:min(82vw,760px); height:16px; border-radius:999px; background:#241f15; overflow:hidden; border:1px solid #34301f; }
        .cx-progress-fill { height:100%; border-radius:999px; transition:width 1s linear, background 300ms ease; }
        .cx-upnext { font-size:0.82rem; font-weight:800; color:#7c7363; text-transform:uppercase; letter-spacing:0.07em; }
        .cx-upnext strong { color:#b3aa98; }

        .cx-actions { display:flex; flex-wrap:wrap; gap:9px; justify-content:center; align-items:center; }
        .cx-actions-sep { width:1px; align-self:stretch; min-height:20px; background:#34301f; margin:0 4px; }
        .cx-btn { font-size:1rem; font-weight:900; border-radius:11px; padding:13px 24px; cursor:pointer; border:1px solid #34301f; background:#1d1810; color:#fff; transition:transform 120ms ease, border-color 140ms ease, filter 140ms; }
        .cx-btn:hover { transform:translateY(-1px); border-color:${accent}; }
        .cx-btn.pri { background:${accent}; border-color:${accent}; } .cx-btn.pri:hover { filter:brightness(1.08); }
        .cx-btn.next { background:#2f9e6f; border-color:#2f9e6f; }
        .cx-btn:disabled { opacity:0.32; cursor:not-allowed; transform:none; }
        .cx-poll { width:min(94vw,760px); display:grid; gap:12px; padding:16px; border:1px solid #34301f; border-radius:12px; background:#18140d; text-align:left; }
        .cx-poll-head { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
        .cx-poll-title { margin:0; color:#fff; font-size:0.9rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; }
        .cx-poll-note { color:#a39a88; font-size:0.82rem; font-weight:700; line-height:1.4; }
        .cx-poll-grid { display:grid; grid-template-columns:180px minmax(0,1fr); gap:10px; align-items:center; }
        .cx-poll-label { color:#d8d2c5; font-size:0.82rem; font-weight:900; }
        .cx-poll-input, .cx-poll-select { width:100%; border:1px solid #3d3524; border-radius:8px; box-sizing:border-box; background:#14110c; color:#fff; padding:10px 12px; font:inherit; font-size:0.95rem; font-weight:700; }
        .cx-poll-input { min-height:44px; }
        .cx-poll-choices { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
        .cx-poll-error { color:#fca5a5; font-size:0.82rem; font-weight:800; }
        .cx-poll-summary { color:#d8d2c5; font-size:0.96rem; font-weight:800; }
        .cx-poll-results { display:grid; gap:8px; }
        .cx-poll-result { display:grid; grid-template-columns:minmax(110px,1fr) minmax(80px,2fr) auto; gap:10px; align-items:center; color:#efe9df; font-size:0.9rem; font-weight:800; }
        .cx-poll-bar { height:10px; overflow:hidden; border-radius:999px; background:#2a2418; }
        .cx-poll-fill { height:100%; border-radius:inherit; background:${accent}; transition:width 220ms ease; }
        .cx-poll-answers { display:flex; flex-wrap:wrap; gap:7px; }
        .cx-poll-answer { border:1px solid #3d3524; border-radius:999px; padding:6px 10px; color:#efe9df; font-size:0.78rem; font-weight:800; }
        .cx-tool { width:min(94vw,760px); display:grid; gap:12px; padding:16px; border:1px solid #3a3322; border-radius:12px; background:#17130d; text-align:left; }
        .cx-tool-head { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
        .cx-tool-title { margin:0; color:#e0f2fe; font-size:0.9rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; }
        .cx-tool-note { color:#8fb4cf; font-size:0.82rem; font-weight:700; line-height:1.4; }
        .cx-tool-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
        .cx-tool-field { display:grid; gap:5px; color:#c8e3f6; font-size:0.78rem; font-weight:900; }
        .cx-tool-field.wide { grid-column:1 / -1; }
        .cx-tool-input, .cx-tool-select { width:100%; min-height:42px; box-sizing:border-box; border:1px solid #3f3725; border-radius:8px; background:#120f0a; color:#fff; padding:9px 10px; font:inherit; font-weight:750; }
        .cx-tool-status { color:#a7f3d0; font-size:0.82rem; font-weight:800; }
        .cx-leader { display:grid; gap:8px; border:1px solid #3a3322; border-radius:10px; background:#120f0a; padding:12px; }
        .cx-leader-title { color:#e0f2fe; font-size:0.78rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; }
        .cx-leader-row { display:grid; grid-template-columns:auto minmax(0,1fr) auto auto; gap:10px; align-items:center; border:1px solid #2f281a; border-radius:8px; background:#19150e; padding:9px 10px; color:#efe9df; font-size:0.86rem; font-weight:850; }
        .cx-leader-rank { display:grid; width:28px; height:28px; place-items:center; border-radius:6px; background:${accent}; color:#fff; font-weight:950; }
        .cx-leader-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .cx-leader-acc { color:#9fb7c8; font-size:0.78rem; }
        .cx-leader-points { color:#a7f3d0; font-weight:950; }
        @media (max-width:640px) { .cx-poll-grid { grid-template-columns:1fr; } .cx-poll-choices { grid-template-columns:1fr; } }
        @media (max-width:640px) { .cx-tool-grid { grid-template-columns:1fr; } }

        .cx-lineup { border-top:1px solid #2a241a; padding:12px 20px; display:flex; gap:8px; align-items:center; overflow-x:auto; }
        .cx-lineup-title { font-size:0.72rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; color:#7c7363; flex:none; margin-right:4px; }
        .cx-budget { flex:none; font-size:0.78rem; font-weight:900; padding:4px 10px; border-radius:999px; margin-left:auto; background:${overBudget ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.12)"}; color:${overBudget ? "#fca5a5" : "#86efac"}; border:1px solid ${overBudget ? "rgba(239,68,68,0.4)" : "rgba(34,197,94,0.3)"}; }
        .cx-litem { flex:none; display:flex; align-items:center; gap:7px; background:#1a160f; border:1px solid #2a241a; border-radius:10px; padding:7px 10px; cursor:pointer; }
        .cx-litem.cur { border-color:#fff; background:rgba(255,255,255,0.05); }
        .cx-litem .dot { width:9px; height:9px; border-radius:50%; flex:none; }
        .cx-litem .lbl { font-size:0.82rem; font-weight:800; color:#d8d2c5; white-space:nowrap; }
        .cx-litem .mins { font-size:0.72rem; font-weight:800; color:#7c7363; }
        .cx-ibtn { background:#14110c; border:1px solid #34301f; color:#a39a88; border-radius:6px; width:22px; height:22px; cursor:pointer; font-weight:900; line-height:1; }
        .cx-ibtn:hover { color:#fff; }
        .cx-empty-line { color:#5a5142; font-size:0.86rem; font-weight:700; }

        .cx-bank { border-top:1px solid #2a241a; padding:12px 20px 22px; display:grid; gap:12px; }
        .cx-bank-title { width:100%; font-size:0.72rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; color:#7c7363; margin:0 0 2px; }
        .cx-bank-groups { display:grid; gap:12px; }
        .cx-bank-group { display:grid; gap:8px; padding:10px 12px 12px; border:1px solid #261f15; border-radius:12px; background:#16120c; }
        .cx-bank-group-head { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; }
        .cx-bank-group-title { margin:0; font-size:0.76rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; color:#efe9df; }
        .cx-bank-group-hint { color:#7c7363; font-size:0.78rem; font-weight:750; }
        .cx-bank-chip-row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
        .cx-chip { display:inline-flex; align-items:center; gap:9px; background:#1a160f; border:1px solid #2a241a; border-radius:999px; padding:8px 14px; cursor:pointer; font-weight:800; font-size:0.9rem; color:#d8d2c5; transition:border-color 140ms ease; }
        .cx-chip:hover { border-color:#5a5142; }
        .cx-chip .dot { width:11px; height:11px; border-radius:50%; flex:none; }
        .cx-chip .m { font-size:0.74rem; font-weight:800; color:#7c7363; background:#14110c; border-radius:6px; padding:2px 6px; }
        .cx-min-in { width:44px; background:#14110c; border:1px solid #34301f; color:#fff; border-radius:6px; padding:3px 5px; font-weight:800; font-size:0.8rem; text-align:center; }
        .cx-music-tag { font-size:0.66rem; font-weight:900; color:#fcaf38; }

        .cx-sounds { border-top:1px solid #2a241a; padding:16px 22px 22px; display:grid; gap:12px; background:#15110b; }
        .cx-sounds h3 { margin:0; font-size:0.8rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; color:#a39a88; }
        .cx-srow { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
        .cx-slabel { font-size:0.9rem; font-weight:800; color:#d8d2c5; min-width:220px; }
        .cx-supload { font-size:0.8rem; font-weight:800; color:#8ba0f8; background:rgba(78,110,242,0.1); border:1px solid rgba(78,110,242,0.3); border-radius:8px; padding:7px 12px; cursor:pointer; }
        .cx-sset { font-size:0.78rem; font-weight:800; color:#86efac; }
        .cx-sclear { font-size:0.74rem; font-weight:800; color:#fca5a5; background:transparent; border:1px solid rgba(239,68,68,0.3); border-radius:6px; padding:5px 9px; cursor:pointer; }
        .cx-hint { color:#7c7363; font-size:0.82rem; font-weight:600; }

        .cx-lessons-head { display:flex; align-items:center; justify-content:space-between; padding:16px 24px; border-bottom:1px solid #2a241a; position:sticky; top:0; background:#14110c; z-index:2; }
        .cx-lessons-title { margin:0; font-size:1rem; font-weight:900; color:#fff; }
        .cx-lessons-body { max-width:760px; margin:0 auto; padding:20px; display:grid; gap:16px; }
        .cx-lessons-save { border:1px solid #2a241a; border-radius:12px; background:#18140d; padding:14px; display:grid; gap:10px; }
        .cx-lessons-sub { margin:0; font-size:0.74rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; color:#a39a88; }
        .cx-lessons-saverow { display:flex; gap:8px; flex-wrap:wrap; }
        .cx-lessons-in { flex:1; min-width:150px; background:#14110c; border:1px solid #34301f; color:#fff; border-radius:8px; padding:10px 12px; font:inherit; font-weight:700; }
        .cx-lessons-msg { margin:0; font-size:0.84rem; font-weight:800; color:#86efac; }
        .cx-lessons-search { width:100%; box-sizing:border-box; background:#14110c; border:1px solid #34301f; color:#fff; border-radius:10px; padding:11px 14px; font:inherit; font-weight:700; }
        .cx-lessons-list { display:grid; gap:10px; }
        .cx-lesson-card { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; border:1px solid #2a241a; border-radius:12px; background:#1a160f; padding:12px 14px; }
        .cx-lesson-meta { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; }
        .cx-lesson-code { font-weight:900; color:#fff; font-size:1rem; }
        .cx-lesson-name { color:#d8d2c5; font-weight:700; font-size:0.9rem; }
        .cx-lesson-stats { color:#7c7363; font-weight:800; font-size:0.78rem; }
        .cx-lesson-actions { display:flex; gap:8px; align-items:center; }
        .cx-admissions .cx-lessons-body { max-width:860px; }
        .cx-admission-intro { margin:0; color:#b9b09f; font-size:0.92rem; font-weight:700; line-height:1.5; }
        .cx-admission-list { display:grid; gap:10px; }
        .cx-admission-row { display:grid; grid-template-columns:minmax(110px,auto) minmax(230px,1fr) auto; gap:12px; align-items:end; border:1px solid #3a3020; border-radius:12px; background:#1a160f; padding:14px; }
        .cx-admission-code-wrap, .cx-admission-field { display:grid; gap:5px; }
        .cx-admission-label { color:#a39a88; font-size:0.7rem; font-weight:900; letter-spacing:0.09em; text-transform:uppercase; }
        .cx-admission-code { color:#ffd28a; font-size:1.65rem; font-weight:900; letter-spacing:0.13em; line-height:1; font-variant-numeric:tabular-nums; }
        .cx-admission-select { width:100%; min-height:44px; box-sizing:border-box; border:1px solid #4a3d28; border-radius:9px; background:#100d09; color:#fff; padding:10px 12px; font:inherit; font-size:0.9rem; font-weight:800; }
        .cx-admission-select:focus { outline:2px solid #fcaf38; outline-offset:2px; }
        .cx-btn.cx-admission-submit { background:#fcaf38; border-color:#fcaf38; color:#201e1a; }
        .cx-btn.cx-admission-submit:hover { border-color:#ffd28a; filter:brightness(1.04); }
        .cx-admission-error { margin:0; border:1px solid rgba(249,83,53,0.45); border-radius:9px; background:rgba(249,83,53,0.1); color:#fca5a5; padding:10px 12px; font-size:0.84rem; font-weight:800; }
        @media (max-width:640px) { .cx-admission-row { grid-template-columns:1fr; align-items:stretch; } .cx-admission-row .cx-btn { width:100%; } }
      `}</style>

      <div className="cx-root">
        <header className="cx-top">
          <p className="cx-mark">Big Dog Math — Classroom</p>
          <p className="cx-live-status">{liveFlowStatus}</p>
          {autoAdvance ? <span className="cx-conductor-note">Keep this Control window open during automatic pacing.</span> : null}
          <div className="cx-tbtns">
            <a className="cx-sbtn cx-home" href="/teacher">Home</a>
            <a className="cx-sbtn" href={teacherSession ? `/session?sessionId=${encodeURIComponent(teacherSession.id)}` : "/session"}>{teacherSession ? "Session" : "Start session"}</a>
            {admissionRequests.length > 0 && (
              <button
                className="cx-sbtn cx-admission-alert"
                onClick={() => setShowAdmissions(true)}
                aria-live="polite"
              >
                {admissionRequests.length} waiting
              </button>
            )}
            {teacherSession && (
              <button className="cx-sbtn cx-end-session" onClick={endTeacherSession} disabled={endingSession}>
                {endingSession ? "Ending session" : "End session"}
              </button>
            )}
            <a className="cx-sbtn" href="/session#challenge">Games</a>
            <a className="cx-sbtn" href="/roster">Rosters</a>
            <span className="cx-divider" />
            <button className="cx-sbtn" style={{ borderColor: "#14b8a6", color: "#5eead4" }} onClick={loadTodayLesson}>Today&apos;s lesson</button>
            <button className="cx-sbtn" onClick={() => { setShowLessons(true); setLessonMsg(null); }}>Lessons</button>
            <button className="cx-sbtn" onClick={() => setShowSpinner(true)}>Spinner</button>
            <button className="cx-sbtn" style={autoAdvance ? { borderColor: accent, color: "#fff" } : undefined} onClick={() => setAutoAdvance((v) => !v)}>Pacing {autoAdvance ? "on" : "off"}</button>
            <button className="cx-sbtn" onClick={() => setShowSounds((v) => !v)}>Sounds</button>
            <button className="cx-sbtn" onClick={() => setEditing((v) => !v)}>{editing ? "Done" : "Edit times"}</button>
            <button className="cx-sbtn" onClick={toggleFullscreen}>Full screen</button>
          </div>
        </header>

        {todayMsg && (
          <div
            role="status"
            style={{
              position: "fixed", left: "50%", bottom: "18px", transform: "translateX(-50%)",
              zIndex: 60, maxWidth: "min(720px, 92vw)", background: "#151a27", color: "#e6f6f4",
              border: "1px solid #2a3550", borderLeft: "4px solid #14b8a6", borderRadius: "10px",
              padding: "12px 16px", fontSize: "0.9rem", fontWeight: 700,
              boxShadow: "0 14px 34px rgba(0,0,0,0.45)",
            }}
          >
            {todayMsg}
          </div>
        )}

        <main className={`cx-main${activeLessonVisual ? " cx-main-visual" : ""}`}>
          {joinCode && (currentIndex === -1 || activeState?.id === "warmup") && (
            <div className="cx-join">
              <span className="cx-join-label">Join code</span>
              <span className="cx-join-code">{joinCode}</span>
            </div>
          )}
          {activeState ? (
            <>
              {activeLessonVisual ? (
                <>
                  <div className="cx-story-head">
                    <div className="cx-story-head-copy">
                      <div className="cx-pos">Step {currentIndex + 1} of {lineup.length}</div>
                      <div className="cx-state">{activeItem?.title || activeState.label}</div>
                    </div>
                    <div className={`cx-story-time${inFinal10 ? " final" : finished ? " finished" : ""}`}>
                      {inFinal10 ? secondsLeft : fmt(secondsLeft)}
                    </div>
                  </div>
                  <section className="cx-story-stage" aria-label={`${activeItem?.title || activeState.label} story slide`}>
                    <LessonVisual visual={activeLessonVisual} variant="control" accent={accent} />
                  </section>
                </>
              ) : (
                <>
                  <div className="cx-pos">Step {currentIndex + 1} of {lineup.length}</div>
                  <div className="cx-state">{activeItem?.title || activeState.label}</div>
                  <div className="cx-desc">{activeItem?.studentDirections || activeState.desc}</div>
                  <div className="cx-clock">{inFinal10 ? secondsLeft : fmt(secondsLeft)}</div>
                </>
              )}
              <div className="cx-progress">
                <div className="cx-progress-fill" style={{ width: `${pct}%`, background: finished ? "#f95335" : inFinal10 ? "#fbbf24" : accent }} />
              </div>
              <div className={`cx-note ${finished ? "cx-fin" : warnFlash ? "cx-warn" : ""}`}>
                {finished
                  ? (autoAdvance && hasNext ? "Time's up — moving on…" : hasNext ? "Time's up — tap Next" : "Lesson complete!")
                  : warnFlash ? "30 seconds!" : ""}
              </div>
              {activeInteractiveState && (
                <section className="cx-poll" aria-label={`${activeState.label} setup`}>
                  {!controlPoll ? (
                    <>
                      <div className="cx-poll-head">
                        <h2 className="cx-poll-title">{activeInteractiveState === "question" ? "Question setup" : "Live poll setup"}</h2>
                        <span className="cx-poll-note">The timer chimes at 0:00. Tap Show results when the room is ready.</span>
                      </div>
                      <div className="cx-poll-grid">
                        <label className="cx-poll-label" htmlFor="control-poll-kind">Response type</label>
                        <select
                          id="control-poll-kind"
                          className="cx-poll-select"
                          value={pollKind}
                          onChange={(event) => setPollKind(event.target.value as LivePollKind)}
                        >
                          {activeInteractiveState === "question" ? (
                            <>
                              <option value="short-answer">Short answer</option>
                              <option value="multiple-choice">Multiple choice</option>
                            </>
                          ) : (
                            <>
                              <option value="fist-to-five">Fist to 5 slider</option>
                              <option value="multiple-choice">Multiple choice</option>
                            </>
                          )}
                        </select>
                        <label className="cx-poll-label" htmlFor="control-poll-question">Question</label>
                        <input
                          id="control-poll-question"
                          className="cx-poll-input"
                          value={pollQuestion}
                          onChange={(event) => setPollQuestion(event.target.value)}
                          placeholder={pollKind === "fist-to-five" ? "How well do you understand this right now?" : "Type the question students should answer"}
                        />
                      </div>
                      {pollKind === "multiple-choice" && (
                        <div className="cx-poll-choices">
                          {pollChoices.map((choice, index) => (
                            <input
                              key={index}
                              className="cx-poll-input"
                              value={choice}
                              onChange={(event) => setPollChoices((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                              placeholder={`Choice ${index + 1}`}
                            />
                          ))}
                        </div>
                      )}
                      {pollError && <div className="cx-poll-error">{pollError}</div>}
                      <div className="cx-actions" style={{ justifyContent: "flex-start" }}>
                        <button className="cx-btn pri" onClick={() => { void openControlPoll(); }}>Open to students</button>
                      </div>
                    </>
                  ) : controlPoll.stage === "responding" ? (
                    <>
                      <div className="cx-poll-head">
                        <h2 className="cx-poll-title">Responses open</h2>
                        <span className="cx-poll-summary">{pollAnswers.length} response{pollAnswers.length === 1 ? "" : "s"}</span>
                      </div>
                      <div className="cx-poll-note">{controlPoll.question}</div>
                      <div className="cx-poll-note">Students see results when the timer ends. Use “Show results” to end early.</div>
                    </>
                  ) : (
                    <>
                      <div className="cx-poll-head">
                        <h2 className="cx-poll-title">Results</h2>
                        <span className="cx-poll-summary">{pollAnswers.length} response{pollAnswers.length === 1 ? "" : "s"}</span>
                      </div>
                      <div className="cx-poll-note">{controlPoll.question}</div>
                      {controlPoll.kind === "short-answer" ? (
                        <div className="cx-poll-answers">
                          {pollAnswers.length === 0
                            ? <span className="cx-poll-note">No responses yet.</span>
                            : pollAnswers.map((answer) => <span className="cx-poll-answer" key={answer.id}>{answer.display_name || "Student"}: {answer.answer || "—"}</span>)}
                        </div>
                      ) : (
                        <div className="cx-poll-results">
                          {(controlPoll.choices || []).map((choice) => {
                            const count = pollAnswers.filter((answer) => answer.answer === choice).length;
                            const percent = pollAnswers.length ? Math.round((count / pollAnswers.length) * 100) : 0;
                            return (
                              <div className="cx-poll-result" key={choice}>
                                <span>{controlPoll.kind === "fist-to-five" ? `${choice} / 5` : choice}</span>
                                <div className="cx-poll-bar"><div className="cx-poll-fill" style={{ width: `${percent}%` }} /></div>
                                <span>{count}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="cx-actions" style={{ justifyContent: "flex-start" }}>
                        <button className="cx-btn" onClick={prepareAnotherPoll}>New {activeInteractiveState === "question" ? "question" : "poll"}</button>
                        {pollAnswers.length > 0 && (
                          <button className="cx-btn" style={{ borderColor: "#2dd4bf", color: "#5eead4" }} onClick={haveAbbieReactToPoll}>Have Abbie react</button>
                        )}
                      </div>
                    </>
                  )}
                </section>
              )}
              {activeToolState && (
                <section className="cx-tool" aria-label={`${activeState.label} student setup`}>
                  <div className="cx-tool-head">
                    <h2 className="cx-tool-title">{TOOL_STATE_INFO[activeToolState].label} setup</h2>
                    <span className="cx-tool-note">This publishes the problem to the current Live Class Flow session and sends Chromebooks to the tool.</span>
                  </div>
                  <div className="cx-tool-grid">
                    <label className="cx-tool-field wide" htmlFor="tool-prompt">
                      Student directions or problem
                      <input
                        id="tool-prompt"
                        className="cx-tool-input"
                        value={toolSetup.prompt}
                        onChange={(event) => updateToolSetup("prompt", event.target.value)}
                        placeholder="What should students model, solve, or explain?"
                      />
                    </label>

                    {activeToolState === "tool-number-line" && (
                      <>
                        <label className="cx-tool-field" htmlFor="number-line-start">Start at
                          <input id="number-line-start" className="cx-tool-input" inputMode="decimal" value={toolSetup.numberLineStart} onChange={(event) => updateToolSetup("numberLineStart", event.target.value)} />
                        </label>
                        <label className="cx-tool-field" htmlFor="number-line-change">Change by
                          <input id="number-line-change" className="cx-tool-input" inputMode="decimal" value={toolSetup.numberLineChange} onChange={(event) => updateToolSetup("numberLineChange", event.target.value)} />
                        </label>
                      </>
                    )}

                    {activeToolState === "tool-percent-bar" && (
                      <>
                        <label className="cx-tool-field" htmlFor="percent-whole">Whole
                          <input id="percent-whole" className="cx-tool-input" inputMode="decimal" value={toolSetup.percentWhole} onChange={(event) => updateToolSetup("percentWhole", event.target.value)} />
                        </label>
                        <label className="cx-tool-field" htmlFor="percent-value">Percent
                          <input id="percent-value" className="cx-tool-input" inputMode="decimal" value={toolSetup.percentValue} onChange={(event) => updateToolSetup("percentValue", event.target.value)} />
                        </label>
                        <label className="cx-tool-field" htmlFor="percent-part">Part
                          <input id="percent-part" className="cx-tool-input" inputMode="decimal" value={toolSetup.percentPart} onChange={(event) => updateToolSetup("percentPart", event.target.value)} />
                        </label>
                        <label className="cx-tool-field" htmlFor="percent-unknown">Students solve for
                          <select id="percent-unknown" className="cx-tool-select" value={toolSetup.percentUnknown} onChange={(event) => updateToolSetup("percentUnknown", event.target.value)}>
                            <option value="part">the part</option>
                            <option value="whole">the whole</option>
                            <option value="percent">the percent</option>
                          </select>
                        </label>
                      </>
                    )}

                    {activeToolState === "tool-equation-builder" && (
                      <>
                        <label className="cx-tool-field" htmlFor="equation-coefficient">x coefficient
                          <input id="equation-coefficient" className="cx-tool-input" inputMode="decimal" value={toolSetup.equationCoefficient} onChange={(event) => updateToolSetup("equationCoefficient", event.target.value)} />
                        </label>
                        <label className="cx-tool-field" htmlFor="equation-constant">Constant
                          <input id="equation-constant" className="cx-tool-input" inputMode="decimal" value={toolSetup.equationConstant} onChange={(event) => updateToolSetup("equationConstant", event.target.value)} />
                        </label>
                        <label className="cx-tool-field" htmlFor="equation-solution">Solution for x
                          <input id="equation-solution" className="cx-tool-input" inputMode="decimal" value={toolSetup.equationSolution} onChange={(event) => updateToolSetup("equationSolution", event.target.value)} />
                        </label>
                      </>
                    )}

                    {activeToolState === "tool-gems" && (
                      <label className="cx-tool-field wide" htmlFor="gems-expression">
                        Expression (use +, -, ×, ÷, ^, and parentheses)
                        <input id="gems-expression" className="cx-tool-input" value={toolSetup.gemsExpression} onChange={(event) => updateToolSetup("gemsExpression", event.target.value)} placeholder="4 × (2 + 3) − 6" />
                      </label>
                    )}

                    {activeToolState === "tool-algebra-tiles" && (
                      <label className="cx-tool-field wide" htmlFor="algebra-expression">
                        Expression or equation
                        <input id="algebra-expression" className="cx-tool-input" value={toolSetup.algebraExpression} onChange={(event) => updateToolSetup("algebraExpression", event.target.value)} placeholder="2x + 3 = 11" />
                      </label>
                    )}

                    {activeToolState === "tool-game" && (
                      <>
                        <label className="cx-tool-field" htmlFor="game-skill">Game
                          <select id="game-skill" className="cx-tool-select" value={toolSetup.gameSkill} onChange={(event) => { updateToolSetup("gameSkill", event.target.value); updateToolSetup("gameLevel", "1"); }}>
                            {SKILLS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                          </select>
                        </label>
                        <label className="cx-tool-field" htmlFor="game-level">Level
                          <select id="game-level" className="cx-tool-select" value={toolSetup.gameLevel} onChange={(event) => updateToolSetup("gameLevel", event.target.value)}>
                            {(SKILLS.find((s) => s.key === toolSetup.gameSkill) || SKILLS[0]).levels.map((lvl, i) => (
                              <option key={i} value={String(i + 1)}>{i + 1}. {lvl}</option>
                            ))}
                          </select>
                        </label>
                        <label className="cx-tool-field" htmlFor="game-duration">Length
                          <select id="game-duration" className="cx-tool-select" value={toolSetup.gameDuration} onChange={(event) => updateToolSetup("gameDuration", event.target.value)}>
                            <option value="120">2 min</option>
                            <option value="180">3 min</option>
                            <option value="300">5 min</option>
                          </select>
                        </label>
                      </>
                    )}

                    {activeToolState === "tool-exit-ticket" && (
                      <>
                        <label className="cx-tool-field wide" htmlFor="exit-prompt">Exit-ticket question
                          <input id="exit-prompt" className="cx-tool-input" value={toolSetup.exitPrompt} onChange={(event) => updateToolSetup("exitPrompt", event.target.value)} placeholder="Solve 3x + 4 = 19, then explain your first step." />
                        </label>
                        <label className="cx-tool-field" htmlFor="exit-kind">Answer type
                          <select id="exit-kind" className="cx-tool-select" value={toolSetup.exitKind} onChange={(event) => updateToolSetup("exitKind", event.target.value)}>
                            <option value="short-answer">Short answer</option>
                            <option value="multiple-choice">Multiple choice</option>
                            <option value="fist-to-five">Fist to five (0–5)</option>
                          </select>
                        </label>
                        {toolSetup.exitKind === "multiple-choice" && (
                          <label className="cx-tool-field wide" htmlFor="exit-choices">Choices (comma-separated)
                            <input id="exit-choices" className="cx-tool-input" value={toolSetup.exitChoices} onChange={(event) => updateToolSetup("exitChoices", event.target.value)} placeholder="Yes, No, Not sure" />
                          </label>
                        )}
                      </>
                    )}

                    {activeToolState === "tool-checkpoint" && (() => {
                      const cp = getCheckpoint(toolSetup.checkpointId) || SBAC_CHECKPOINTS[0];
                      const items = cp.items.map((it, i) => ({ it, i }));
                      const digital = items.filter((x) => x.it.digital);
                      const choices = digital.length ? digital : items;
                      const idx = Math.max(0, Math.min(cp.items.length - 1, Math.round(Number(toolSetup.checkpointItem) || 0)));
                      const sel = cp.items[idx];
                      return (
                        <>
                          <label className="cx-tool-field wide" htmlFor="cp-pick">Checkpoint (standard set)
                            <select id="cp-pick" className="cx-tool-select" value={toolSetup.checkpointId} onChange={(event) => {
                              updateToolSetup("checkpointId", event.target.value);
                              const ncp = getCheckpoint(event.target.value);
                              const first = ncp ? ncp.items.findIndex((it) => it.digital) : 0;
                              updateToolSetup("checkpointItem", String(first < 0 ? 0 : first));
                            }}>
                              {SBAC_CHECKPOINTS.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.covers}</option>)}
                            </select>
                          </label>
                          <label className="cx-tool-field wide" htmlFor="cp-item">Question (auto-graded)
                            <select id="cp-item" className="cx-tool-select" value={toolSetup.checkpointItem} onChange={(event) => updateToolSetup("checkpointItem", event.target.value)}>
                              {choices.map(({ it, i }) => <option key={i} value={String(i)}>{it.ccss} — {it.q.length > 64 ? it.q.slice(0, 64) + "…" : it.q}</option>)}
                            </select>
                          </label>
                          {sel && <div style={{ gridColumn: "1 / -1", fontSize: "0.82rem", fontWeight: 700, color: "#8b8170" }}>Answer key: {sel.a}{sel.digital ? "" : "  ·  (paper item — grade by eye)"}</div>}
                        </>
                      );
                    })()}
                  </div>
                  {toolError && <div className="cx-poll-error">{toolError}</div>}
                  {publishedTool?.stateId === activeToolState && (
                    <div className="cx-tool-status">
                      {activeToolState === "tool-game"
                        ? "The live game is running — leaderboard is below."
                        : activeToolState === "tool-exit-ticket"
                          ? "Exit ticket sent - responses are saving. Review them under Practice, then Exit tickets."
                          : activeToolState === "tool-checkpoint"
                            ? "Checkpoint sent — auto-graded answers are saving. Review under Checkpoints."
                            : "Student screens are on this configured tool."}
                    </div>
                  )}
                  {activeToolState === "tool-game" && publishedTool?.stateId === activeToolState && (
                    <div className="cx-leader" aria-label="Live game leaderboard">
                      <span className="cx-leader-title">Live Leaderboard</span>
                      {liveChallengeBoard.length === 0 ? (
                        <span className="cx-tool-note">Waiting for scored answers.</span>
                      ) : (
                        liveChallengeBoard.slice(0, 8).map((row, index) => (
                          <div className="cx-leader-row" key={row.key}>
                            <span className="cx-leader-rank">{index + 1}</span>
                            <span className="cx-leader-name">{row.name}</span>
                            <span className="cx-leader-acc">{row.correct}/{row.total}</span>
                            <span className="cx-leader-points">{row.points}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                  <div className="cx-actions" style={{ justifyContent: "flex-start" }}>
                    <button className="cx-btn pri" onClick={publishToolSetup}>
                      {activeToolState === "tool-game"
                        ? (publishedTool?.stateId === activeToolState ? "Relaunch game" : "Launch game")
                        : activeToolState === "tool-exit-ticket"
                          ? (publishedTool?.stateId === activeToolState ? "Re-send exit ticket" : "Send exit ticket")
                          : activeToolState === "tool-checkpoint"
                            ? (publishedTool?.stateId === activeToolState ? "Re-send checkpoint" : "Send checkpoint")
                            : (publishedTool?.stateId === activeToolState ? "Update student screens" : "Send tool setup to students")}
                    </button>
                  </div>
                </section>
              )}
              <div className="cx-actions">
                <button
                  className="cx-btn pri"
                  onClick={running ? toggleRun : runSequence}
                  disabled={!running && Boolean(activeLessonCriterionValidationMessage)}
                  title={!running ? activeLessonCriterionValidationMessage || undefined : undefined}
                >
                  {running ? "Pause" : activeLessonCriterionValidationMessage ? "Fix success criterion" : autoAdvance ? "Resume" : "Start lesson"}
                </button>
                <button className="cx-btn" onClick={previous} disabled={currentIndex <= 0}>Back</button>
                <button className="cx-btn next" onClick={next} disabled={controlPoll?.stage !== "responding" && currentIndex + 1 >= lineup.length}>{controlPoll?.stage === "responding" ? "Show results" : "Advance"}</button>
                <button className="cx-btn" onClick={stopSequence}>Stop pacing</button>
                <span className="cx-actions-sep" />
                <button className="cx-btn" onClick={reset}>Reset state</button>
                <button className="cx-btn" onClick={() => adjust(60)}>+1 min</button>
                <button className="cx-btn" onClick={() => adjust(-60)} disabled={secondsLeft < 60}>−1 min</button>
                <button className="cx-btn" onClick={() => adjust(30)}>+30s</button>
                {finished && activeState.id === "warmup" && (
                  <button className="cx-btn" style={{ background: "#f59e0b", borderColor: "#f59e0b" }} onClick={() => setShowSpinner(true)}>Pick readers</button>
                )}
                {activeUsesDiscussionProtocol && (
                  <button className="cx-btn" style={{ background: "#06b6d4", borderColor: "#06b6d4" }} onClick={() => setShowDiscussion(true)}>Run discussion</button>
                )}
              </div>
              {hasNext
                ? <div className="cx-upnext">Up next: <strong>{nextLabel}</strong></div>
                : <div className="cx-upnext">Last step of the lesson</div>}
            </>
          ) : (
            <div style={{ display: "grid", justifyItems: "center", gap: 14 }}>
              <p className="cx-note cx-idle">
                Build today&apos;s lineup: tap states in the bank below to add them, then run the sequence.
                Hit “Sounds” to upload your warm-up music and cue sounds.
              </p>
              {lineup.length > 0 && <button className="cx-btn pri" onClick={runSequence}>Start sequence</button>}
            </div>
          )}
        </main>

        {/* Lineup */}
        <section className="cx-lineup">
          <span className="cx-lineup-title">Today</span>
          {lineup.length === 0 && <span className="cx-empty-line">empty - add states from the bank below</span>}
          {lineup.map((it, i) => {
            const st = bank.find((s) => s.id === it.stateId);
            if (!st) return null;
            return (
              <div key={it.uid} className={`cx-litem${i === currentIndex ? " cur" : ""}`} onClick={() => loadIndex(i)}>
                <span className="dot" style={{ background: st.color }} />
                <span className="lbl">{it.title || st.label}</span>
                <span className="mins">{minutesForLineupItem(it, bank)}m</span>
                <button className="cx-ibtn" onClick={(e) => { e.stopPropagation(); moveItem(it.uid, -1); }} title="Move left">‹</button>
                <button className="cx-ibtn" onClick={(e) => { e.stopPropagation(); moveItem(it.uid, 1); }} title="Move right">›</button>
                <button className="cx-ibtn" onClick={(e) => { e.stopPropagation(); removeFromLineup(it.uid); }} title="Remove">×</button>
              </div>
            );
          })}
          <span className="cx-budget">{totalMin} / {PERIOD_MIN} min{overBudget ? " over" : ""}</span>
        </section>

        {/* Sound setup */}
        {showSounds && (
          <section className="cx-sounds">
            <h3>Cue sounds — used by every timer (remembered on this computer)</h3>
            {(["warn30", "tick", "end"] as CueKey[]).map((key) => {
              const has = !!soundUrls[key];
              return (
                <div className="cx-srow" key={key}>
                  <span className="cx-slabel">{CUE_LABELS[key]}</span>
                  <label className="cx-supload">
                    {has ? "Replace file" : "Upload file"}
                    <input type="file" accept="audio/*" style={{ display: "none" }}
                      onChange={(e) => uploadSound(key, e.target.files?.[0])} />
                  </label>
                  {has && <span className="cx-sset">loaded</span>}
                  {has && <button className="cx-sclear" onClick={() => clearSound(key)}>Remove</button>}
                  {!has && <span className="cx-hint">no file — uses built-in beep</span>}
                </div>
              );
            })}

            <h3 style={{ marginTop: 6 }}>Music per state — loops while that state runs, stops at zero</h3>
            {bank.map((s) => {
              const storageKey = `music:${s.id}`;
              const has = !!soundUrls[storageKey];
              return (
                <div className="cx-srow" key={s.id}>
                  <span className="cx-slabel">
                    <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: s.color, marginRight: 8 }} />
                    {s.label}
                  </span>
                  <label className="cx-supload">
                    {has ? "Replace music" : "Upload music"}
                    <input type="file" accept="audio/*" style={{ display: "none" }}
                      onChange={(e) => uploadSound(storageKey, e.target.files?.[0])} />
                  </label>
                  {has && <span className="cx-sset">loaded</span>}
                  {has && <button className="cx-sclear" onClick={() => clearSound(storageKey)}>Remove</button>}
                  {!has && <span className="cx-hint">no music</span>}
                </div>
              );
            })}
            <p className="cx-hint">Tip: your Stream Deck still works alongside this — use either.</p>
          </section>
        )}

        {/* Bank */}
        <section className="cx-bank">
          <p className="cx-bank-title">Bank — tap to add to today&apos;s lineup{editing ? " · set default minutes" : ""}</p>
          <div className="cx-bank-groups">
            {groupedBankSections.map((group) => (
              <div className="cx-bank-group" key={group.id}>
                <div className="cx-bank-group-head">
                  <h2 className="cx-bank-group-title">{group.label}</h2>
                  <span className="cx-bank-group-hint">{group.hint}</span>
                </div>
                <div className="cx-bank-chip-row">
                  {group.states.map(renderBankChip)}
                </div>
              </div>
            ))}
            {ungroupedBankStates.length > 0 && (
              <div className="cx-bank-group">
                <div className="cx-bank-group-head">
                  <h2 className="cx-bank-group-title">Other</h2>
                  <span className="cx-bank-group-hint">Additional saved states</span>
                </div>
                <div className="cx-bank-chip-row">
                  {ungroupedBankStates.map(renderBankChip)}
                </div>
              </div>
            )}
          </div>
        </section>

        {showAdmissions && (
          <div
            className="cx-overlay cx-admissions"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cx-admissions-title"
          >
            <div className="cx-lessons-head">
              <h2 className="cx-lessons-title" id="cx-admissions-title">Students waiting</h2>
              <button className="cx-sbtn" onClick={() => setShowAdmissions(false)}>Close</button>
            </div>
            <div className="cx-lessons-body">
              <p className="cx-admission-intro">Match the code on the Chromebook, choose the student, then admit them.</p>
              {admissionError && <p className="cx-admission-error" role="alert">{admissionError}</p>}
              <div className="cx-admission-list">
                {admissionRequests.map((request) => {
                  const rosterWithEmail = admissionRoster.filter((student) =>
                    Boolean(student.email) && !admissionJoinedStudentIds.includes(student.id),
                  );
                  const isAdmitting = admittingRequestCode === request.requestCode;
                  return (
                    <div className="cx-admission-row" key={request.id}>
                      <div className="cx-admission-code-wrap">
                        <span className="cx-admission-label">Chromebook code</span>
                        <strong className="cx-admission-code">{request.requestCode}</strong>
                      </div>
                      <label className="cx-admission-field">
                        <span className="cx-admission-label">Student</span>
                        <select
                          className="cx-admission-select"
                          value={admissionSelections[request.id] || ""}
                          onChange={(event) => setAdmissionSelections((current) => ({
                            ...current,
                            [request.id]: event.target.value,
                          }))}
                          disabled={rosterWithEmail.length === 0 || Boolean(admittingRequestCode)}
                        >
                          <option value="">{rosterWithEmail.length ? "Choose a student" : "No unjoined students available"}</option>
                          {rosterWithEmail.map((student) => (
                            <option value={student.email || ""} key={student.id}>
                              {student.fullName}{student.email ? ` - ${student.email}` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="cx-btn cx-admission-submit"
                        onClick={() => { void admitWaitingStudent(request); }}
                        disabled={!admissionSelections[request.id] || Boolean(admittingRequestCode)}
                      >
                        {isAdmitting ? "Admitting" : "Admit"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {showLessons && (
          <div className="cx-overlay cx-lessons">
            <div className="cx-lessons-head">
              <h2 className="cx-lessons-title">Lesson Library</h2>
              <button className="cx-sbtn" onClick={() => setShowLessons(false)}>Close</button>
            </div>
            <div className="cx-lessons-body">
              <div className="cx-lessons-save">
                <p className="cx-lessons-sub">Load any Notion lesson by code</p>
                <div className="cx-lessons-saverow">
                  <input
                    className="cx-lessons-in"
                    placeholder="Lesson code (e.g. M2.T1.L1-D1)"
                    value={notionLessonCode}
                    onChange={(event) => setNotionLessonCode(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") void loadNotionLessonByCode(); }}
                  />
                  <button className="cx-btn pri" onClick={() => { void loadNotionLessonByCode(); }}>Load from Notion</button>
                </div>
                <p className="cx-hint">Loads a published Notion lesson into a private preview. Student and projector screens do not change until you start it.</p>
                {lessonMsg && <p className="cx-lessons-msg">{lessonMsg}</p>}
              </div>

              <div className="cx-lessons-save">
                <p className="cx-lessons-sub">Save the current sequence as a lesson</p>
                <div className="cx-lessons-saverow">
                  <input className="cx-lessons-in" placeholder="Code (e.g. M1.T1.L1)" value={saveCode} onChange={(e) => setSaveCode(e.target.value)} />
                  <input className="cx-lessons-in" placeholder="Title (optional)" value={saveTitle} onChange={(e) => setSaveTitle(e.target.value)} />
                  <button className="cx-btn pri" onClick={saveCurrentLesson}>Save</button>
                </div>
              </div>

              <input className="cx-lessons-search" placeholder="Search by code or title…" value={presetSearch} onChange={(e) => setPresetSearch(e.target.value)} />

              <div className="cx-lessons-list">
                {filteredPresets.length === 0 ? (
                  <p className="cx-hint">No saved lessons yet. Build a sequence in the bank below, then save it above.</p>
                ) : (
                  filteredPresets.map((p) => {
                    const total = p.lineup.reduce((sum, s) => sum + (typeof p.minutes[s.stateId] === "number" ? p.minutes[s.stateId] : 0), 0);
                    return (
                      <div className="cx-lesson-card" key={p.id}>
                        <div className="cx-lesson-meta">
                          <span className="cx-lesson-code">{p.code || "Untitled"}</span>
                          {p.title && <span className="cx-lesson-name">{p.title}</span>}
                          <span className="cx-lesson-stats">{p.lineup.length} steps · {total} min</span>
                        </div>
                        <div className="cx-lesson-actions">
                          <button className="cx-btn next" onClick={() => loadPreset(p)}>Load</button>
                          <button className="cx-sclear" onClick={() => removePreset(p.id)}>Delete</button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {showSpinner && (
          <div className="cx-overlay"><StudentSpinner onClose={() => setShowSpinner(false)} /></div>
        )}
        {showDiscussion && (
          <div className="cx-overlay">
            <DiscussionProtocol
              onClose={closeDiscussion}
              onFlowChange={handleDiscussionFlowChange}
              initialFlow={discussionFlow}
              remoteCommand={discussionRemoteCommand}
              onRemoteCommandHandled={handleDiscussionRemoteCommand}
            />
          </div>
        )}

        <AbbieConsole stateLabel={activeState?.label} stateDesc={activeState?.desc} sessionId={teacherSession?.status === "open" ? teacherSession.id : null} />
        <RedBullCounter />
      </div>
    </>
  );
}
