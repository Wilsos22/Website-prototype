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

import { useEffect, useRef, useState, useCallback } from "react";
import StudentSpinner from "@/components/StudentSpinner";
import DiscussionProtocol from "@/components/DiscussionProtocol";

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

const DEFAULT_STATES: ClassState[] = [
  { id: "warmup", label: "Warm-Up", minutes: 10, color: "#4e6ef2", desc: "Silently begin your warm-up. Work on your own." },
  { id: "review", label: "Go Over / Review", minutes: 5, color: "#8b5cf6", desc: "Eyes up — we're going over the answers together." },
  { id: "i-do", label: "Direct Instruction (I do)", minutes: 15, color: "#0ea5e9", desc: "Watch and take notes. I'll model each step." },
  { id: "we-do", label: "Guided Practice (We do)", minutes: 10, color: "#14b8a6", desc: "We'll solve these together — try each step with me." },
  { id: "discussion", label: "Discussion (Think–Pair–Share)", minutes: 3, color: "#06b6d4", desc: "Think on your own, then talk it through with your group." },
  { id: "you-do", label: "Independent Practice (You do)", minutes: 15, color: "#22c55e", desc: "Work independently. Show all of your steps." },
  { id: "manip", label: "Manipulatives / Hands-On", minutes: 10, color: "#f59e0b", desc: "Use the manipulative to model the problem." },
  { id: "partner", label: "Partner / Group Work", minutes: 10, color: "#ec4899", desc: "Work with your partner — both of you explain your thinking." },
  { id: "exit", label: "Exit Ticket", minutes: 5, color: "#ef4444", desc: "Complete your exit ticket on your own and turn it in before the timer ends." },
  { id: "cleanup", label: "Clean Up / Pack Up", minutes: 3, color: "#64748b", desc: "Clean your space and pack up quietly." },
  { id: "break", label: "Brain Break", minutes: 3, color: "#a3a3a3", desc: "Quick brain break — reset and get ready to focus." },
];

const LS_BANK = "bdm-control-bank-v2";
const LS_LINEUP = "bdm-control-lineup-v1";
const PERIOD_MIN = 55;

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

  const secRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  // ── Load saved bank minutes + lineup + uploaded sounds ──────────────────
  useEffect(() => {
    try {
      const rawBank = localStorage.getItem(LS_BANK);
      if (rawBank) {
        const saved = JSON.parse(rawBank) as ClassState[];
        setBank(DEFAULT_STATES.map((d) => {
          const s = saved.find((x) => x.id === d.id);
          return s ? { ...d, minutes: s.minutes } : d;
        }));
      }
      const rawLine = localStorage.getItem(LS_LINEUP);
      if (rawLine) setLineup(JSON.parse(rawLine) as LineupItem[]);
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
    if (!finished || !autoAdvance) return;
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
  }, [finished, autoAdvance, currentIndex, lineup, bank, startMusicFor, stopMusic]);

  const activeItem = currentIndex >= 0 ? lineup[currentIndex] : undefined;
  const activeState = activeItem ? bank.find((s) => s.id === activeItem.stateId) : undefined;
  const totalMin = lineup.reduce((sum, it) => {
    const st = bank.find((s) => s.id === it.stateId);
    return sum + (st?.minutes ?? 0);
  }, 0);

  // ── Lineup management ───────────────────────────────────────────────────
  function addToLineup(stateId: string) {
    persistLineup([...lineup, { uid: uid(), stateId }]);
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

  return (
    <>
      <style>{`
        .cx-root { min-height:100vh; background:${finished ? "#2a0d0d" : warnFlash ? "#1a1c0d" : "#0b0d14"}; color:#fff; font-family:Inter,ui-sans-serif,system-ui,sans-serif; display:grid; grid-template-rows:auto 1fr auto auto; transition:background 300ms ease; }
        .cx-overlay { position:fixed; inset:0; z-index:50; overflow:auto; background:#0b0d14; }
        .cx-top { display:flex; align-items:center; justify-content:space-between; padding:14px 26px; border-bottom:1px solid #1f2332; flex-wrap:wrap; gap:8px; }
        .cx-mark { font-size:0.76rem; font-weight:900; letter-spacing:0.14em; text-transform:uppercase; color:${accent}; margin:0; transition:color 300ms ease; }
        .cx-tbtns { display:flex; gap:8px; flex-wrap:wrap; }
        .cx-sbtn { font-size:0.76rem; font-weight:800; letter-spacing:0.05em; text-transform:uppercase; color:#8a93ad; background:transparent; border:1px solid #1f2332; border-radius:7px; padding:7px 12px; cursor:pointer; text-decoration:none; transition:all 140ms ease; }
        .cx-sbtn:hover { border-color:${accent}; color:#fff; }

        .cx-main { display:grid; align-content:center; justify-items:center; gap:18px; padding:18px; text-align:center; }
        .cx-state { font-size:clamp(1.2rem,3.5vw,2.2rem); font-weight:900; color:${accent}; min-height:1.2em; transition:color 300ms ease; }
        .cx-pos { font-size:0.8rem; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#5a6280; }
        .cx-clock { font-variant-numeric:tabular-nums; font-weight:900; line-height:0.9; letter-spacing:-0.02em;
          font-size:${inFinal10 ? "clamp(9rem,40vw,28rem)" : "clamp(5rem,20vw,15rem)"};
          color:${inFinal10 ? "#fbbf24" : finished ? "#ef4444" : "#fff"};
          animation:${finished ? "cxFlash 0.7s steps(1) infinite" : inFinal10 ? "cxPulse 1s ease-in-out infinite" : "none"}; }
        @keyframes cxFlash { 50%{opacity:0.18;} }
        @keyframes cxPulse { 50%{opacity:0.55; transform:scale(1.04);} }
        .cx-note { font-size:1.1rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; min-height:1.3em; }
        .cx-warn { color:#facc15; } .cx-fin { color:#ef4444; } .cx-idle { color:#3a4460; font-weight:700; max-width:440px; text-transform:none; letter-spacing:0; }
        .cx-desc { font-size:clamp(1.1rem,3vw,1.9rem); font-weight:800; color:#dfe5f5; max-width:780px; line-height:1.3; }
        .cx-progress { width:min(82vw,760px); height:16px; border-radius:999px; background:#1a1f30; overflow:hidden; border:1px solid #2a3045; }
        .cx-progress-fill { height:100%; border-radius:999px; transition:width 1s linear, background 300ms ease; }
        .cx-upnext { font-size:0.82rem; font-weight:800; color:#5a6280; text-transform:uppercase; letter-spacing:0.07em; }
        .cx-upnext strong { color:#9aa3bd; }

        .cx-actions { display:flex; flex-wrap:wrap; gap:9px; justify-content:center; }
        .cx-btn { font-size:1rem; font-weight:900; border-radius:11px; padding:13px 24px; cursor:pointer; border:1px solid #2a3045; background:#161a28; color:#fff; transition:transform 120ms ease, border-color 140ms ease, filter 140ms; }
        .cx-btn:hover { transform:translateY(-1px); border-color:${accent}; }
        .cx-btn.pri { background:${accent}; border-color:${accent}; } .cx-btn.pri:hover { filter:brightness(1.08); }
        .cx-btn.next { background:#22c55e; border-color:#22c55e; }
        .cx-btn:disabled { opacity:0.32; cursor:not-allowed; transform:none; }

        .cx-lineup { border-top:1px solid #1f2332; padding:12px 20px; display:flex; gap:8px; align-items:center; overflow-x:auto; }
        .cx-lineup-title { font-size:0.72rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; color:#5a6280; flex:none; margin-right:4px; }
        .cx-budget { flex:none; font-size:0.78rem; font-weight:900; padding:4px 10px; border-radius:999px; margin-left:auto; background:${overBudget ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.12)"}; color:${overBudget ? "#fca5a5" : "#86efac"}; border:1px solid ${overBudget ? "rgba(239,68,68,0.4)" : "rgba(34,197,94,0.3)"}; }
        .cx-litem { flex:none; display:flex; align-items:center; gap:7px; background:#121520; border:1px solid #1f2332; border-radius:10px; padding:7px 10px; cursor:pointer; }
        .cx-litem.cur { border-color:#fff; background:rgba(255,255,255,0.05); }
        .cx-litem .dot { width:9px; height:9px; border-radius:50%; flex:none; }
        .cx-litem .lbl { font-size:0.82rem; font-weight:800; color:#c8cedd; white-space:nowrap; }
        .cx-litem .mins { font-size:0.72rem; font-weight:800; color:#5a6280; }
        .cx-ibtn { background:#0b0d14; border:1px solid #2a3045; color:#8a93ad; border-radius:6px; width:22px; height:22px; cursor:pointer; font-weight:900; line-height:1; }
        .cx-ibtn:hover { color:#fff; }
        .cx-empty-line { color:#3a4460; font-size:0.86rem; font-weight:700; }

        .cx-bank { border-top:1px solid #1f2332; padding:12px 20px 22px; display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
        .cx-bank-title { width:100%; font-size:0.72rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; color:#5a6280; margin:0 0 2px; }
        .cx-chip { display:inline-flex; align-items:center; gap:9px; background:#121520; border:1px solid #1f2332; border-radius:999px; padding:8px 14px; cursor:pointer; font-weight:800; font-size:0.9rem; color:#c8cedd; transition:border-color 140ms ease; }
        .cx-chip:hover { border-color:#3a4460; }
        .cx-chip .dot { width:11px; height:11px; border-radius:50%; flex:none; }
        .cx-chip .m { font-size:0.74rem; font-weight:800; color:#5a6280; background:#0b0d14; border-radius:6px; padding:2px 6px; }
        .cx-min-in { width:44px; background:#0b0d14; border:1px solid #2a3045; color:#fff; border-radius:6px; padding:3px 5px; font-weight:800; font-size:0.8rem; text-align:center; }
        .cx-music-tag { font-size:0.66rem; font-weight:900; color:#facc15; }

        .cx-sounds { border-top:1px solid #1f2332; padding:16px 22px 22px; display:grid; gap:12px; background:#0d1018; }
        .cx-sounds h3 { margin:0; font-size:0.8rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; color:#8a93ad; }
        .cx-srow { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
        .cx-slabel { font-size:0.9rem; font-weight:800; color:#c8cedd; min-width:220px; }
        .cx-supload { font-size:0.8rem; font-weight:800; color:#8ba0f8; background:rgba(78,110,242,0.1); border:1px solid rgba(78,110,242,0.3); border-radius:8px; padding:7px 12px; cursor:pointer; }
        .cx-sset { font-size:0.78rem; font-weight:800; color:#86efac; }
        .cx-sclear { font-size:0.74rem; font-weight:800; color:#fca5a5; background:transparent; border:1px solid rgba(239,68,68,0.3); border-radius:6px; padding:5px 9px; cursor:pointer; }
        .cx-hint { color:#5a6280; font-size:0.82rem; font-weight:600; }
      `}</style>

      <div className="cx-root">
        <header className="cx-top">
          <p className="cx-mark">Big Dog Math — Classroom</p>
          <div className="cx-tbtns">
            <button className="cx-sbtn" onClick={() => setShowSpinner(true)}>🎰 Spinner</button>
            <button className="cx-sbtn" style={autoAdvance ? { borderColor: accent, color: "#fff" } : undefined} onClick={() => setAutoAdvance((v) => !v)}>Auto-advance: {autoAdvance ? "on" : "off"}</button>
            <button className="cx-sbtn" onClick={() => setShowSounds((v) => !v)}>{showSounds ? "Close sounds" : "Sounds"}</button>
            <button className="cx-sbtn" onClick={() => setEditing((v) => !v)}>{editing ? "Done editing" : "Edit times"}</button>
            <button className="cx-sbtn" onClick={toggleFullscreen}>Fullscreen</button>
            <a className="cx-sbtn" href="/session">👥 Session</a>
            <a className="cx-sbtn" href="/teacher">🧰 Tools</a>
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
                <div className="cx-progress-fill" style={{ width: `${pct}%`, background: finished ? "#ef4444" : inFinal10 ? "#fbbf24" : accent }} />
              </div>
              <div className={`cx-note ${finished ? "cx-fin" : warnFlash ? "cx-warn" : ""}`}>
                {finished
                  ? (autoAdvance && hasNext ? "⏰ Time's up — moving on…" : hasNext ? "⏰ Time's up — tap Next ▶" : "✓ Lesson complete!")
                  : warnFlash ? "30 seconds!" : ""}
              </div>
              <div className="cx-actions">
                <button className="cx-btn pri" onClick={toggleRun}>{running ? "⏸ Pause" : secondsLeft <= 0 ? "↻ Restart" : "▶ Start"}</button>
                <button className="cx-btn" onClick={reset}>Reset</button>
                <button className="cx-btn" onClick={() => adjust(60)}>+1 min</button>
                <button className="cx-btn" onClick={() => adjust(-60)} disabled={secondsLeft < 60}>−1 min</button>
                <button className="cx-btn" onClick={() => adjust(30)}>+30s</button>
                <button className="cx-btn next" onClick={next} disabled={currentIndex + 1 >= lineup.length}>Next ▶</button>
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
            <p className="cx-note cx-idle">
              Build today&apos;s lineup: tap states in the bank below to add them, then tap a
              step in your lineup to load its timer. Hit “Sounds” to upload your warm-up
              music and cue sounds.
            </p>
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
          {bank.map((s) => (
            <div key={s.id} className="cx-chip" onClick={() => !editing && addToLineup(s.id)} style={editing ? { cursor: "default" } : undefined}>
              <span className="dot" style={{ background: s.color }} />
              {s.label}
              {soundUrls[`music:${s.id}`] && <span className="cx-music-tag">♪</span>}
              {editing ? (
                <input className="cx-min-in" type="number" min={1} max={120} value={s.minutes}
                  onClick={(e) => e.stopPropagation()} onChange={(e) => editMinutes(s.id, Number(e.target.value))} />
              ) : (
                <span className="m">{s.minutes}m</span>
              )}
            </div>
          ))}
        </section>

        {showSpinner && (
          <div className="cx-overlay"><StudentSpinner onClose={() => setShowSpinner(false)} /></div>
        )}
        {showDiscussion && (
          <div className="cx-overlay"><DiscussionProtocol onClose={() => setShowDiscussion(false)} /></div>
        )}
      </div>
    </>
  );
}
