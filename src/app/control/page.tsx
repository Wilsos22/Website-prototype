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

interface ClassState {
  id: string;
  label: string;
  minutes: number;
  color: string;
  desc: string;
}

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
  "tool-gems": { route: "/order-of-operations", label: "GEMS" },
  "tool-fraction-bars": { route: "/fraction-bars", label: "Fraction Bars" },
  "tool-algebra-tiles": { route: "/algebra-tiles", label: "Algebra Tiles" },
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

const DEFAULT_STATES: ClassState[] = [
  { id: "warmup", label: "Warm-Up", minutes: 10, color: "#4e6ef2", desc: "Silently begin your warm-up. Work on your own." },
  { id: "review", label: "Go Over / Review", minutes: 5, color: "#8b5cf6", desc: "Eyes up — we're going over the answers together." },
  { id: "i-do", label: "Direct Instruction (I do)", minutes: 15, color: "#0ea5e9", desc: "Watch and take notes. I'll model each step." },
  { id: "we-do", label: "Guided Practice (We do)", minutes: 10, color: "#14b8a6", desc: "We'll solve these together — try each step with me." },
  { id: "discussion", label: "Discussion (Think–Pair–Share)", minutes: 3, color: "#06b6d4", desc: "Think on your own, then talk it through with your group." },
  { id: "question", label: "Question", minutes: 2, color: "#8b5cf6", desc: "Respond to the question before the timer ends." },
  { id: "poll", label: "Live Poll", minutes: 1, color: "#ec4899", desc: "Share a quick check-in before results appear." },
  { id: "tool-whiteboard", label: "Whiteboard", minutes: 5, color: "#0ea5e9", desc: "Use the whiteboard to show and explain your thinking." },
  { id: "tool-number-line", label: "Number Line", minutes: 5, color: "#38bdf8", desc: "Model the problem on the number line." },
  { id: "tool-percent-bar", label: "Percent Bar", minutes: 5, color: "#f472b6", desc: "Use the percent bar to make sense of the relationship." },
  { id: "tool-equation-builder", label: "Equation Builder", minutes: 6, color: "#2f9e6f", desc: "Build and solve the equation one step at a time." },
  { id: "tool-gems", label: "GEMS", minutes: 5, color: "#a78bfa", desc: "Use GEMS to decide which operation comes first." },
  { id: "tool-fraction-bars", label: "Fraction Bars", minutes: 5, color: "#f59e0b", desc: "Model the fraction relationship with bars." },
  { id: "tool-algebra-tiles", label: "Algebra Tiles", minutes: 6, color: "#fb7185", desc: "Build the expression with algebra tiles." },
  { id: "you-do", label: "Independent Practice (You do)", minutes: 15, color: "#2f9e6f", desc: "Work independently. Show all of your steps." },
  { id: "manip", label: "Manipulatives / Hands-On", minutes: 10, color: "#f59e0b", desc: "Use the manipulative to model the problem." },
  { id: "partner", label: "Partner / Group Work", minutes: 10, color: "#ec4899", desc: "Work with your partner — both of you explain your thinking." },
  { id: "exit", label: "Exit Ticket", minutes: 5, color: "#f95335", desc: "Complete your exit ticket on your own and turn it in before the timer ends." },
  { id: "cleanup", label: "Clean Up / Pack Up", minutes: 3, color: "#64748b", desc: "Clean your space and pack up quietly." },
  { id: "break", label: "Brain Break", minutes: 3, color: "#a3a3a3", desc: "Quick brain break — reset and get ready to focus." },
];

const BANK_GROUPS = [
  {
    id: "class",
    label: "Class States",
    hint: "Room routines and teacher-led lesson flow",
    stateIds: ["warmup", "review", "i-do", "we-do", "discussion", "you-do", "partner", "exit", "cleanup", "break"],
  },
  {
    id: "feedback",
    label: "Feedback",
    hint: "Questions, checks for understanding, and polls",
    stateIds: ["question", "poll"],
  },
  {
    id: "process",
    label: "Guided Processes",
    hint: "Step-by-step math thinking routines",
    stateIds: ["tool-gems", "tool-equation-builder"],
  },
  {
    id: "manipulatives",
    label: "Manipulatives",
    hint: "Student screens switch to digital math tools",
    stateIds: ["tool-whiteboard", "tool-number-line", "tool-percent-bar", "tool-fraction-bars", "tool-algebra-tiles", "manip"],
  },
] as const;

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
    case "tool-gems":
      return { ...base, route: "/order-of-operations", config: { expression: values.gemsExpression.trim() } };
    case "tool-algebra-tiles":
      return { ...base, route: "/algebra-tiles", config: { expression: values.algebraExpression.trim() } };
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
  const [showDiscussion, setShowDiscussion] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [soundUrls, setSoundUrls] = useState<Record<string, string>>({});
  const [teacherSession, setTeacherSession] = useState<TeacherSessionRow | null>(null);
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

  function updateToolSetup(key: keyof ToolSetupValues, value: string) {
    setToolSetup((current) => ({ ...current, [key]: value } as ToolSetupValues));
  }

  function publishToolSetup() {
    if (!teacherSession || teacherSession.broadcast !== LIVE_FLOW_MODE || !activeToolState) {
      setToolError("Start a session, select Live Class Flow, then send this tool setup.");
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
        .cx-progress { width:min(82vw,760px); height:16px; border-radius:999px; background:#241f15; overflow:hidden; border:1px solid #34301f; }
        .cx-progress-fill { height:100%; border-radius:999px; transition:width 1s linear, background 300ms ease; }
        .cx-upnext { font-size:0.82rem; font-weight:800; color:#7c7363; text-transform:uppercase; letter-spacing:0.07em; }
        .cx-upnext strong { color:#b3aa98; }

        .cx-actions { display:flex; flex-wrap:wrap; gap:9px; justify-content:center; }
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
      `}</style>

      <div className="cx-root">
        <header className="cx-top">
          <p className="cx-mark">Big Dog Math — Classroom</p>
          <p className="cx-live-status">{liveFlowStatus}</p>
          <div className="cx-tbtns">
            <a className="cx-sbtn cx-home" href="/teacher">🏠 Home</a>
            <a className="cx-sbtn" href="/session">📡 Session</a>
            <a className="cx-sbtn" href="/roster">👥 Rosters</a>
            <span className="cx-divider" />
            <button className="cx-sbtn" onClick={() => setShowSpinner(true)}>🎰 Spinner</button>
            <button className="cx-sbtn" style={autoAdvance ? { borderColor: accent, color: "#fff" } : undefined} onClick={() => setAutoAdvance((v) => !v)}>Auto {autoAdvance ? "✓" : "off"}</button>
            <button className="cx-sbtn" onClick={() => setShowSounds((v) => !v)}>🎵 Sounds</button>
            <button className="cx-sbtn" onClick={() => setEditing((v) => !v)}>{editing ? "✓ Done" : "Edit times"}</button>
            <button className="cx-sbtn" onClick={toggleFullscreen}>⛶ Full</button>
          </div>
        </header>

        <main className="cx-main">
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
                  </div>
                  {toolError && <div className="cx-poll-error">{toolError}</div>}
                  {publishedTool?.stateId === activeToolState && <div className="cx-tool-status">Student screens are on this configured tool.</div>}
                  <div className="cx-actions" style={{ justifyContent: "flex-start" }}>
                    <button className="cx-btn pri" onClick={publishToolSetup}>{publishedTool?.stateId === activeToolState ? "Update student screens" : "Send tool setup to students"}</button>
                  </div>
                </section>
              )}
              <div className="cx-actions">
                <button className="cx-btn" onClick={runSequence}>▶ Run sequence</button>
                <button className="cx-btn pri" onClick={toggleRun}>{running ? "⏸ Pause" : secondsLeft <= 0 ? "↻ Restart" : "▶ Start"}</button>
                <button className="cx-btn" onClick={reset}>Reset</button>
                <button className="cx-btn" onClick={() => adjust(60)}>+1 min</button>
                <button className="cx-btn" onClick={() => adjust(-60)} disabled={secondsLeft < 60}>−1 min</button>
                <button className="cx-btn" onClick={() => adjust(30)}>+30s</button>
                <button className="cx-btn next" onClick={next} disabled={controlPoll?.stage !== "responding" && currentIndex + 1 >= lineup.length}>{controlPoll?.stage === "responding" ? "Show results" : "Next ▶"}</button>
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
              {lineup.length > 0 && <button className="cx-btn pri" onClick={runSequence}>▶ Run sequence</button>}
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

        {showSpinner && (
          <div className="cx-overlay"><StudentSpinner onClose={() => setShowSpinner(false)} /></div>
        )}
        {showDiscussion && (
          <div className="cx-overlay"><DiscussionProtocol onClose={closeDiscussion} onFlowChange={handleDiscussionFlowChange} /></div>
        )}
      </div>
    </>
  );
}
