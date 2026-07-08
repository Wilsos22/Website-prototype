"use client";

// Teacher Classroom Control Panel — front-of-room display.
// • Bank (bottom) → pull states into the day's LINEUP (sequence) with a running
//   total vs. a 55-minute period.
// • Each state loads an adjustable countdown. At 0 it flashes and WAITS for you
//   to tap Next.
// • Ending sequence: 30-second alert, giant on-screen 10→1 countdown with ticks,
//   flash at zero.
// • Upload your own sounds (warm-up music + cue sounds). They're remembered on
//   this computer (stored in the browser). No upload = simple built-in beep.

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import StudentSpinner from "@/components/StudentSpinner";
import DiscussionProtocol from "@/components/DiscussionProtocol";
import AbbieConsole from "@/components/AbbieConsole";
import { requestAbbieLine } from "@/lib/abbieBus";
import { getSupabase } from "@/lib/supabase";
import {
  LIVE_FLOW_MODE,
  getStoredTeacherSessionId,
  type DiscussionPhaseSnapshot,
  type LiveClassFlowSnapshot,
  type LivePollKind,
  type LiveToolConfig,
  type LiveToolRoute,
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

import { DEFAULT_STATES, BANK_GROUPS, type ClassState } from "@/lib/classStates";

interface LineupItem {
  uid: string;
  stateId: string;
}

interface TeacherSessionRow {
  id: string;
  status: string;
  broadcast: string | null;
}

type InteractiveStateId = "question" | "poll";

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
}

interface ControlPollAnswer {
  id: string;
  display_name: string | null;
  answer: string | null;
}

// DEFAULT_STATES + BANK_GROUPS now live in @/lib/classStates (shared with the
// standalone Sequence Builder so the catalog never drifts).

const LS_BANK = "bdm-control-bank-v2";
const LS_LINEUP = "bdm-control-lineup-v1";
const PERIOD_MIN = 55;

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

// ── Today's Notion lesson → Control lineup ──────────────────────────────────
// The published lesson lists its tools as free text (e.g. "Number Line"). Map
// those names to bank state ids so the teacher can load and run the day's
// lesson as one sequence instead of rebuilding it by hand.
type TodayLesson = { title?: string; tools?: string | null };

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
  const supabase = getSupabase();
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
  const [presets, setPresets] = useState<LessonPreset[]>([]);
  const [presetSearch, setPresetSearch] = useState("");
  const [saveCode, setSaveCode] = useState("");
  const [saveTitle, setSaveTitle] = useState("");
  const [lessonMsg, setLessonMsg] = useState<string | null>(null);
  const [todayMsg, setTodayMsg] = useState<string | null>(null);
  const [showDiscussion, setShowDiscussion] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [soundUrls, setSoundUrls] = useState<Record<string, string>>({});
  const [teacherSession, setTeacherSession] = useState<TeacherSessionRow | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [discussionFlow, setDiscussionFlow] = useState<DiscussionPhaseSnapshot | null>(null);
  const [controlPoll, setControlPoll] = useState<ControlPoll | null>(null);
  const [pollKind, setPollKind] = useState<LivePollKind>("short-answer");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollChoices, setPollChoices] = useState(["", "", "", ""]);
  const [pollAnswers, setPollAnswers] = useState<ControlPollAnswer[]>([]);
  const [pollError, setPollError] = useState<string | null>(null);
  const [flowSyncError, setFlowSyncError] = useState<string | null>(null);
  const [toolSetup, setToolSetup] = useState<ToolSetupValues>(DEFAULT_TOOL_SETUP);
  const [publishedTool, setPublishedTool] = useState<PublishedTool | null>(null);
  const [toolError, setToolError] = useState<string | null>(null);
  const [liveChallenge, setLiveChallenge] = useState<ChallengeRow | null>(null);
  const [liveChallengeBoard, setLiveChallengeBoard] = useState<LeaderRow[]>([]);

  const secRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);

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

  // The session page records the current teacher session locally. When that is
  // unavailable, use the open Live Class Flow session as a safe fallback.
  useEffect(() => {
    if (!supabase) return;
    let stopped = false;
    const setCurrentTeacherSession = (next: TeacherSessionRow | null) => {
      setTeacherSession((current) => (
        current?.id === next?.id
        && current?.status === next?.status
        && current?.broadcast === next?.broadcast
          ? current
          : next
      ));
    };

    const findTeacherSession = async () => {
      const storedSessionId = getStoredTeacherSessionId();
      if (storedSessionId) {
        const { data } = await supabase
          .from("sessions")
          .select("id,status,broadcast")
          .eq("id", storedSessionId)
          .maybeSingle();
        if (stopped) return;
        const storedSession = data as TeacherSessionRow | null;
        if (storedSession?.status === "open") {
          setCurrentTeacherSession(storedSession);
          return;
        }
      }

      const { data } = await supabase
        .from("sessions")
        .select("id,status,broadcast")
        .eq("status", "open")
        .eq("broadcast", LIVE_FLOW_MODE)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!stopped) setCurrentTeacherSession((data as TeacherSessionRow | null) ?? null);
    };

    void findTeacherSession();
    const interval = window.setInterval(findTeacherSession, 1500);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [supabase]);

  // Show the join code on the pacer during arrival/warm-up. Polls the newest
  // open session's code directly, so it works on the second-board device even
  // though that machine has no stored teacher session of its own.
  useEffect(() => {
    if (!supabase) return;
    let stop = false;
    const tick = async () => {
      const { data } = await supabase
        .from("sessions").select("join_code").eq("status", "open")
        .order("started_at", { ascending: false }).limit(1).maybeSingle();
      if (!stop) setJoinCode((data as { join_code: string | null } | null)?.join_code || null);
    };
    void tick();
    const t = window.setInterval(tick, 4000);
    return () => { stop = true; window.clearInterval(t); };
  }, [supabase]);

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

  // ── Countdown engine ────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) return;
    tickRef.current = setInterval(() => {
      const next = secRef.current - 1;
      secRef.current = next;
      setSecondsLeft(next);
      if (next === 30) { playCue("warn30"); setWarnFlash(true); setTimeout(() => setWarnFlash(false), 3000); }
      else if (next <= 10 && next >= 1) { playCue("tick"); }
      if (next <= 0) {
        if (tickRef.current) clearInterval(tickRef.current);
        setRunning(false);
        setFinished(true);
        stopMusic();
        playCue("end");
      }
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [running, playCue, stopMusic]);

  // ── Auto-advance to the next lineup item when time's up ─────────────────
  useEffect(() => {
    if (!finished || !autoAdvance || controlPoll) return;
    const ni = currentIndex + 1;
    if (ni >= lineup.length) return;
    const t = setTimeout(() => {
      const item = lineup[ni];
      const st = item ? bank.find((s) => s.id === item.stateId) : undefined;
      if (!st) return;
      stopMusic();
      setCurrentIndex(ni);
      secRef.current = st.minutes * 60;
      setSecondsLeft(secRef.current);
      setFinished(false);
      setRunning(true);
      startMusicFor(st.id);
    }, 2600);
    return () => clearTimeout(t);
  }, [finished, autoAdvance, bank, controlPoll, currentIndex, lineup, startMusicFor, stopMusic]);

  const activeItem = currentIndex >= 0 ? lineup[currentIndex] : undefined;
  const filteredPresets = presets.filter((p) => {
    const t = presetSearch.trim().toLowerCase();
    return !t || p.code.toLowerCase().includes(t) || p.title.toLowerCase().includes(t);
  });
  const activeState = activeItem ? bank.find((s) => s.id === activeItem.stateId) : undefined;
  const totalMin = lineup.reduce((sum, it) => {
    const st = bank.find((s) => s.id === it.stateId);
    return sum + (st?.minutes ?? 0);
  }, 0);
  const activeInteractiveState: InteractiveStateId | null = activeState?.id === "question" || activeState?.id === "poll"
    ? activeState.id
    : null;
  const activeToolState: ToolStateId | null = isToolStateId(activeState?.id) ? activeState.id : null;

  useEffect(() => {
    if (activeInteractiveState === "question") {
      setPollKind("short-answer");
    } else if (activeInteractiveState === "poll") {
      setPollKind("fist-to-five");
      setPollQuestion((current) => current || "How well do you understand this right now?");
    }
  }, [activeInteractiveState]);

  const closeActivePoll = useCallback(() => {
    if (!controlPoll || controlPoll.stage === "results") return;
    setControlPoll((current) => current ? { ...current, stage: "results" } : null);
    if (supabase) {
      void supabase.from("polls").update({ status: "closed" }).eq("id", controlPoll.id);
    }
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
    if (!controlPoll || !supabase) return;
    let stopped = false;
    const loadAnswers = async () => {
      const { data } = await supabase
        .from("poll_answers")
        .select("id,display_name,answer")
        .eq("poll_id", controlPoll.id)
        .order("created_at");
      if (!stopped) setPollAnswers((data as ControlPollAnswer[]) || []);
    };
    void loadAnswers();
    const interval = window.setInterval(loadAnswers, 1000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [controlPoll, supabase]);

  useEffect(() => {
    if (finished && controlPoll?.stage === "responding") {
      closeActivePoll();
    }
  }, [closeActivePoll, controlPoll?.stage, finished]);

  async function openControlPoll() {
    if (!supabase || !teacherSession || !activeInteractiveState) {
      setPollError("Start a session first, then open this question or poll.");
      return;
    }
    const question = pollKind === "fist-to-five"
      ? pollQuestion.trim() || "How well do you understand this right now?"
      : pollQuestion.trim();
    const choices = pollKind === "multiple-choice"
      ? pollChoices.map((choice) => choice.trim()).filter(Boolean)
      : pollKind === "fist-to-five"
        ? ["0", "1", "2", "3", "4", "5"]
        : null;
    if (!question) {
      setPollError("Add the question students should answer.");
      return;
    }
    if (pollKind === "multiple-choice" && (!choices || choices.length < 2)) {
      setPollError("Add at least two answer choices.");
      return;
    }

    setPollError(null);
    const payload = {
      session_id: teacherSession.id,
      question,
      choices,
      kind: pollKind,
      status: "open",
    };
    let { data, error } = await supabase.from("polls").insert(payload).select("id").single();
    if (error) {
      const fallback = await supabase.from("polls").insert({
        session_id: teacherSession.id,
        question,
        choices,
        status: "open",
      }).select("id").single();
      data = fallback.data;
      error = fallback.error;
    }
    if (error || !data) {
      setPollError(error?.message || "The poll could not be opened.");
      return;
    }

    setControlPoll({
      id: (data as { id: string }).id,
      stateId: activeInteractiveState,
      kind: pollKind,
      question,
      choices,
      stage: "responding",
    });
    setPollAnswers([]);
    setFinished(false);
    if (secondsLeft <= 0 && activeState) {
      secRef.current = activeState.minutes * 60;
      setSecondsLeft(secRef.current);
    }
  }

  function prepareAnotherPoll() {
    setControlPoll(null);
    setPollAnswers([]);
    setPollError(null);
    setPollChoices(["", "", "", ""]);
    setPollQuestion(activeInteractiveState === "poll" ? "How well do you understand this right now?" : "");
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
    if (activeState?.id !== "discussion" && showDiscussion) {
      setShowDiscussion(false);
      setDiscussionFlow(null);
    }
  }, [activeState?.id, showDiscussion]);

  const liveFlowSignature = useMemo(() => {
    const state = activeState
      ? {
          id: activeState.id,
          label: activeState.label,
          description: activeState.desc,
          color: activeState.color,
        }
      : null;
    const phase = activeState?.id === "discussion" && showDiscussion ? discussionFlow : null;
    const poll = controlPoll?.stateId === activeInteractiveState
      ? {
          id: controlPoll.id,
          kind: controlPoll.kind,
          question: controlPoll.question,
          choices: controlPoll.choices,
          stage: controlPoll.stage,
        }
      : null;
    const tool = publishedTool?.stateId === activeToolState ? publishedTool.tool : null;
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
            totalSeconds: activeState.minutes * 60,
            secondsLeft,
            running,
            finished,
          }
        : null;

    return JSON.stringify({ version: 1, state, phase, timer, poll, tool });
  }, [activeInteractiveState, activeState, activeToolState, controlPoll, discussionFlow, finished, publishedTool, running, secondsLeft, showDiscussion]);

  // Keep student Chromebooks in sync with the existing /control state machine.
  // The write is skipped unless the teacher explicitly selected Live Class Flow.
  useEffect(() => {
    if (!supabase || teacherSession?.broadcast !== LIVE_FLOW_MODE) return;
    const snapshot = {
      ...(JSON.parse(liveFlowSignature) as Omit<LiveClassFlowSnapshot, "updatedAt">),
      updatedAt: new Date().toISOString(),
    };
    let cancelled = false;
    void (async () => {
      const { error } = await supabase.from("sessions").update({ live_flow: snapshot }).eq("id", teacherSession.id);
      if (!cancelled) setFlowSyncError(error?.message ?? null);
    })();
    return () => { cancelled = true; };
  }, [liveFlowSignature, supabase, teacherSession]);

  const handleDiscussionFlowChange = useCallback((snapshot: DiscussionPhaseSnapshot) => {
    setDiscussionFlow(snapshot);
  }, []);

  const closeDiscussion = useCallback(() => {
    setShowDiscussion(false);
    setDiscussionFlow(null);
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
  function loadIndex(i: number) {
    const item = lineup[i];
    if (!item) return;
    const st = bank.find((s) => s.id === item.stateId);
    if (!st) return;
    setCurrentIndex(i);
    secRef.current = st.minutes * 60;
    setSecondsLeft(st.minutes * 60);
    setRunning(false);
    setFinished(false);
    stopMusic();
  }

  // ── Lesson presets (saved sequences) ────────────────────────────────────
  const refreshPresets = useCallback(async () => {
    setPresets(await listLessonPresets());
  }, []);

  function loadPreset(p: LessonPreset) {
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
    setRunning(false);
    setFinished(false);
    stopMusic();
    setShowLessons(false);
    setLessonMsg(null);
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
    setLessonMsg("Saved ✓");
    setSaveCode("");
    setSaveTitle("");
    refreshPresets();
  }

  async function removePreset(id: string) {
    await deleteLessonPreset(id);
    refreshPresets();
  }

  // Pull today's published Notion lesson and build a runnable lineup from it:
  // Warm-Up → the lesson's tools (in order) → Exit Ticket. The teacher can then
  // reorder, add, or run the sequence as usual.
  async function loadTodayLesson() {
    setTodayMsg("Loading today's lesson from Notion…");
    let lesson: TodayLesson | null = null;
    try {
      const res = await fetch("/api/today", { cache: "no-store" });
      const data = (await res.json()) as { lesson?: TodayLesson | null };
      lesson = data?.lesson ?? null;
    } catch {
      setTodayMsg("Couldn't reach Notion — check the connection and try again.");
      window.setTimeout(() => setTodayMsg(null), 6000);
      return;
    }
    if (!lesson) {
      setTodayMsg("No lesson is published in Notion for today.");
      window.setTimeout(() => setTodayMsg(null), 6000);
      return;
    }
    const mapped: string[] = [];
    const unmatched: string[] = [];
    for (const name of parseLessonList(lesson.tools)) {
      const id = matchLessonToolStateId(name);
      if (id) { if (!mapped.includes(id)) mapped.push(id); }
      else unmatched.push(name);
    }
    if (lineup.length > 0 && !window.confirm(`Replace today's lineup with “${lesson.title || "today's lesson"}”?`)) {
      setTodayMsg(null);
      return;
    }
    const newLineup = ["warmup", ...mapped, "exit"].map((stateId) => ({ uid: uid(), stateId }));
    persistLineup(newLineup);
    const first = bank.find((s) => s.id === newLineup[0].stateId);
    setCurrentIndex(0);
    if (first) { secRef.current = first.minutes * 60; setSecondsLeft(first.minutes * 60); }
    setRunning(false);
    setFinished(false);
    stopMusic();
    setShowLessons(false);
    const parts = [`Loaded “${lesson.title || "today's lesson"}”`, `${mapped.length} tool${mapped.length === 1 ? "" : "s"} added`];
    if (unmatched.length) parts.push(`couldn't match: ${unmatched.join(", ")}`);
    setTodayMsg(parts.join(" · "));
    window.setTimeout(() => setTodayMsg(null), 8000);
  }

  // When launched from the Sequence Builder with ?run=1, auto-start the lineup
  // once it has loaded so the lesson runs straight through.
  const [pendingRun, setPendingRun] = useState(false);
  useEffect(() => {
    refreshPresets();
    try {
      const params = new URLSearchParams(window.location.search);
      const lessonId = params.get("lesson");
      if (lessonId) getLessonPreset(lessonId).then((p) => { if (p) { loadPreset(p); if (params.get("run") === "1") setPendingRun(true); } });
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (secondsLeft <= 0) { secRef.current = activeState.minutes * 60; setSecondsLeft(secRef.current); setFinished(false); }
    const willRun = !running;
    setRunning(willRun);
    if (willRun) startMusicFor(activeState.id);
    else if (musicRef.current) musicRef.current.pause();
  }
  function runSequence() {
    if (lineup.length === 0) return;
    const nextIndex = currentIndex >= 0 ? currentIndex : 0;
    const item = lineup[nextIndex];
    const state = item ? bank.find((bankState) => bankState.id === item.stateId) : undefined;
    if (!state) return;
    setAutoAdvance(true);
    setCurrentIndex(nextIndex);
    secRef.current = secondsLeft > 0 && currentIndex === nextIndex ? secondsLeft : state.minutes * 60;
    setSecondsLeft(secRef.current);
    setFinished(false);
    setRunning(true);
    stopMusic();
    startMusicFor(state.id);
  }
  function reset() {
    if (!activeState) return;
    secRef.current = activeState.minutes * 60;
    setSecondsLeft(secRef.current);
    setRunning(false);
    setFinished(false);
    stopMusic();
  }
  // Stop the whole running sequence and return the room to idle/free.
  function stopSequence() {
    setRunning(false);
    setFinished(false);
    setCurrentIndex(-1);
    secRef.current = 0;
    setSecondsLeft(0);
    stopMusic();
  }
  function adjust(deltaSeconds: number) {
    secRef.current = Math.max(0, secRef.current + deltaSeconds);
    setSecondsLeft(secRef.current);
    if (deltaSeconds > 0) setFinished(false);
  }
  function next() {
    if (controlPoll?.stage === "responding") {
      setRunning(false);
      setFinished(true);
      closeActivePoll();
      return;
    }
    stopMusic();
    if (currentIndex + 1 < lineup.length) loadIndex(currentIndex + 1);
    else { setRunning(false); setFinished(false); setCurrentIndex(-1); }
  }
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

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space" && activeState && !editing && !showSounds) { e.preventDefault(); toggleRun(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeState, editing, showSounds, secondsLeft, running]);

  const accent = activeState?.color ?? "#4e6ef2";
  const inFinal10 = running && secondsLeft <= 10 && secondsLeft > 0;
  const overBudget = totalMin > PERIOD_MIN;
  const denom = activeState ? activeState.minutes * 60 : 1;
  const pct = activeState ? Math.max(0, Math.min(100, (secondsLeft / denom) * 100)) : 0;
  const hasNext = currentIndex + 1 < lineup.length;
  const nextState = hasNext ? bank.find((s) => s.id === lineup[currentIndex + 1].stateId) : undefined;
  const liveFlowConnected = teacherSession?.status === "open" && teacherSession.broadcast === LIVE_FLOW_MODE;
  const liveFlowStatus = !supabase
    ? "Live sync unavailable"
    : flowSyncError
      ? formatLiveFlowError(flowSyncError)
      : liveFlowConnected
        ? "Live Class Flow connected"
        : "Select Live Class Flow in Session";
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
      {soundUrls[`music:${state.id}`] && <span className="cx-music-tag">♪</span>}
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
        .cx-tbtns { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .cx-sbtn { font-size:0.76rem; font-weight:800; letter-spacing:0.05em; text-transform:uppercase; color:#a39a88; background:transparent; border:1px solid #2a241a; border-radius:7px; padding:7px 12px; cursor:pointer; text-decoration:none; transition:all 140ms ease; }
        .cx-sbtn:hover { border-color:${accent}; color:#fff; }
        .cx-home { border-color:#3a3228; color:#d8d2c5; }
        .cx-divider { width:1px; height:22px; background:#2a241a; flex:none; margin:0 2px; }

        .cx-main { display:grid; align-content:center; justify-items:center; gap:18px; padding:18px; text-align:center; }
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
      `}</style>

      <div className="cx-root">
        <header className="cx-top">
          <p className="cx-mark">Big Dog Math — Classroom</p>
          <p className="cx-live-status">{liveFlowStatus}</p>
          <div className="cx-tbtns">
            <a className="cx-sbtn cx-home" href="/teacher">🏠 Home</a>
            <a className="cx-sbtn" href="/session">📡 Session</a>
            <a className="cx-sbtn" href="/session#challenge">🎮 Games</a>
            <a className="cx-sbtn" href="/roster">👥 Rosters</a>
            <span className="cx-divider" />
            <button className="cx-sbtn" style={{ borderColor: "#14b8a6", color: "#5eead4" }} onClick={loadTodayLesson}>📅 Today&apos;s lesson</button>
            <button className="cx-sbtn" onClick={() => { setShowLessons(true); setLessonMsg(null); }}>📚 Lessons</button>
            <button className="cx-sbtn" onClick={() => setShowSpinner(true)}>🎰 Spinner</button>
            <button className="cx-sbtn" style={autoAdvance ? { borderColor: accent, color: "#fff" } : undefined} onClick={() => setAutoAdvance((v) => !v)}>Auto {autoAdvance ? "✓" : "off"}</button>
            <button className="cx-sbtn" onClick={() => setShowSounds((v) => !v)}>🎵 Sounds</button>
            <button className="cx-sbtn" onClick={() => setEditing((v) => !v)}>{editing ? "✓ Done" : "Edit times"}</button>
            <button className="cx-sbtn" onClick={toggleFullscreen}>⛶ Full</button>
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

        <main className="cx-main">
          {joinCode && (currentIndex === -1 || activeState?.id === "warmup") && (
            <div className="cx-join">
              <span className="cx-join-label">Join code</span>
              <span className="cx-join-code">{joinCode}</span>
            </div>
          )}
          {activeState ? (
            <>
              <div className="cx-pos">Step {currentIndex + 1} of {lineup.length}</div>
              <div className="cx-state">{activeState.label}</div>
              <div className="cx-desc">{activeState.desc}</div>
              <div className="cx-clock">{inFinal10 ? secondsLeft : fmt(secondsLeft)}</div>
              <div className="cx-progress">
                <div className="cx-progress-fill" style={{ width: `${pct}%`, background: finished ? "#f95335" : inFinal10 ? "#fbbf24" : accent }} />
              </div>
              <div className={`cx-note ${finished ? "cx-fin" : warnFlash ? "cx-warn" : ""}`}>
                {finished
                  ? (autoAdvance && hasNext ? "⏰ Time's up — moving on…" : hasNext ? "⏰ Time's up — tap Next ▶" : "✓ Lesson complete!")
                  : warnFlash ? "30 seconds!" : ""}
              </div>
              {activeInteractiveState && (
                <section className="cx-poll" aria-label={`${activeState.label} setup`}>
                  {!controlPoll ? (
                    <>
                      <div className="cx-poll-head">
                        <h2 className="cx-poll-title">{activeInteractiveState === "question" ? "Question setup" : "Live poll setup"}</h2>
                        <span className="cx-poll-note">The state timer above is the response window. At 0:00, results appear.</span>
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
                        <button className="cx-btn pri" onClick={openControlPoll}>Open to students</button>
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
                            {SKILLS.map((s) => <option key={s.key} value={s.key}>{s.emoji} {s.label}</option>)}
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
                          ? "Exit ticket sent — responses are saving. Review them under 📝 Practice → Exit tickets."
                          : activeToolState === "tool-checkpoint"
                            ? "Checkpoint sent — auto-graded answers are saving. Review under ✅ Checkpoints."
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
                        ? (publishedTool?.stateId === activeToolState ? "Relaunch game" : "🎮 Launch game")
                        : activeToolState === "tool-exit-ticket"
                          ? (publishedTool?.stateId === activeToolState ? "Re-send exit ticket" : "📝 Send exit ticket")
                          : activeToolState === "tool-checkpoint"
                            ? (publishedTool?.stateId === activeToolState ? "Re-send checkpoint" : "✅ Send checkpoint")
                            : (publishedTool?.stateId === activeToolState ? "Update student screens" : "Send tool setup to students")}
                    </button>
                  </div>
                </section>
              )}
              <div className="cx-actions">
                <button className="cx-btn pri" onClick={running ? toggleRun : runSequence}>{running ? "⏸ Pause" : "▶ Start"}</button>
                <button className="cx-btn next" onClick={next} disabled={controlPoll?.stage !== "responding" && currentIndex + 1 >= lineup.length}>{controlPoll?.stage === "responding" ? "Show results" : "Advance ▶"}</button>
                <button className="cx-btn" onClick={stopSequence}>■ Stop</button>
                <span className="cx-actions-sep" />
                <button className="cx-btn" onClick={reset}>↻ Reset state</button>
                <button className="cx-btn" onClick={() => adjust(60)}>+1 min</button>
                <button className="cx-btn" onClick={() => adjust(-60)} disabled={secondsLeft < 60}>−1 min</button>
                <button className="cx-btn" onClick={() => adjust(30)}>+30s</button>
                {finished && activeState.id === "warmup" && (
                  <button className="cx-btn" style={{ background: "#f59e0b", borderColor: "#f59e0b" }} onClick={() => setShowSpinner(true)}>🎰 Pick readers</button>
                )}
                {activeState.id === "discussion" && (
                  <button className="cx-btn" style={{ background: "#06b6d4", borderColor: "#06b6d4" }} onClick={() => setShowDiscussion(true)}>▶ Run discussion</button>
                )}
              </div>
              {hasNext
                ? <div className="cx-upnext">Up next: <strong>{nextState?.label}</strong></div>
                : <div className="cx-upnext">Last step of the lesson</div>}
            </>
          ) : (
            <div style={{ display: "grid", justifyItems: "center", gap: 14 }}>
              <p className="cx-note cx-idle">
                Build today&apos;s lineup: tap states in the bank below to add them, then run the sequence.
                Hit “Sounds” to upload your warm-up music and cue sounds.
              </p>
              {lineup.length > 0 && <button className="cx-btn pri" onClick={runSequence}>▶ Start sequence</button>}
            </div>
          )}
        </main>

        {/* Lineup */}
        <section className="cx-lineup">
          <span className="cx-lineup-title">Today</span>
          {lineup.length === 0 && <span className="cx-empty-line">empty — add states from the bank ↓</span>}
          {lineup.map((it, i) => {
            const st = bank.find((s) => s.id === it.stateId);
            if (!st) return null;
            return (
              <div key={it.uid} className={`cx-litem${i === currentIndex ? " cur" : ""}`} onClick={() => loadIndex(i)}>
                <span className="dot" style={{ background: st.color }} />
                <span className="lbl">{st.label}</span>
                <span className="mins">{st.minutes}m</span>
                <button className="cx-ibtn" onClick={(e) => { e.stopPropagation(); moveItem(it.uid, -1); }} title="Move left">‹</button>
                <button className="cx-ibtn" onClick={(e) => { e.stopPropagation(); moveItem(it.uid, 1); }} title="Move right">›</button>
                <button className="cx-ibtn" onClick={(e) => { e.stopPropagation(); removeFromLineup(it.uid); }} title="Remove">×</button>
              </div>
            );
          })}
          <span className="cx-budget">{totalMin} / {PERIOD_MIN} min{overBudget ? " ⚠ over" : ""}</span>
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
                  {has && <span className="cx-sset">✓ loaded</span>}
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
                  {has && <span className="cx-sset">♪ loaded</span>}
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

        {showLessons && (
          <div className="cx-overlay cx-lessons">
            <div className="cx-lessons-head">
              <h2 className="cx-lessons-title">📚 Lesson Library</h2>
              <button className="cx-sbtn" onClick={() => setShowLessons(false)}>✕ Close</button>
            </div>
            <div className="cx-lessons-body">
              <div className="cx-lessons-save">
                <p className="cx-lessons-sub">Save the current sequence as a lesson</p>
                <div className="cx-lessons-saverow">
                  <input className="cx-lessons-in" placeholder="Code (e.g. M1.T1.L1)" value={saveCode} onChange={(e) => setSaveCode(e.target.value)} />
                  <input className="cx-lessons-in" placeholder="Title (optional)" value={saveTitle} onChange={(e) => setSaveTitle(e.target.value)} />
                  <button className="cx-btn pri" onClick={saveCurrentLesson}>Save</button>
                </div>
                {lessonMsg && <p className="cx-lessons-msg">{lessonMsg}</p>}
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
                          <button className="cx-btn next" onClick={() => loadPreset(p)}>Load →</button>
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
          <div className="cx-overlay"><DiscussionProtocol onClose={closeDiscussion} onFlowChange={handleDiscussionFlowChange} /></div>
        )}

        <AbbieConsole stateLabel={activeState?.label} stateDesc={activeState?.desc} sessionId={teacherSession?.status === "open" ? teacherSession.id : null} />
      </div>
    </>
  );
}
