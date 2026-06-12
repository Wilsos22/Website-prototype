"use client";

// Teacher Classroom Control Panel — front-of-room display.
// Pick a classroom "state" (Warm-Up, Practice, etc.); each loads an adjustable
// countdown timer. Start / pause / reset, +/- time, time's-up flash + beep,
// fullscreen. Pure client-side. Your edited durations are saved on this device.

import { useEffect, useRef, useState, useCallback } from "react";

interface ClassState {
  id: string;
  label: string;
  minutes: number; // default duration
  color: string;
}

const DEFAULT_STATES: ClassState[] = [
  { id: "warmup", label: "Warm-Up", minutes: 10, color: "#4e6ef2" },
  { id: "review", label: "Go Over / Review", minutes: 5, color: "#8b5cf6" },
  { id: "i-do", label: "Direct Instruction (I do)", minutes: 15, color: "#0ea5e9" },
  { id: "we-do", label: "Guided Practice (We do)", minutes: 10, color: "#14b8a6" },
  { id: "you-do", label: "Independent Practice (You do)", minutes: 15, color: "#22c55e" },
  { id: "manip", label: "Manipulatives / Hands-On", minutes: 10, color: "#f59e0b" },
  { id: "partner", label: "Partner / Group Work", minutes: 10, color: "#ec4899" },
  { id: "exit", label: "Exit Ticket", minutes: 5, color: "#ef4444" },
  { id: "cleanup", label: "Clean Up / Pack Up", minutes: 3, color: "#64748b" },
  { id: "break", label: "Brain Break", minutes: 3, color: "#a3a3a3" },
];

const STORAGE_KEY = "bdm-control-states-v1";

function fmt(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function ControlPage() {
  const [states, setStates] = useState<ClassState[]>(DEFAULT_STATES);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [editing, setEditing] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  // Load saved durations (per-device)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as ClassState[];
        // Merge saved minutes onto defaults so new states still appear
        setStates(
          DEFAULT_STATES.map((d) => {
            const s = saved.find((x) => x.id === d.id);
            return s ? { ...d, minutes: s.minutes } : d;
          })
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persist = useCallback((next: ClassState[]) => {
    setStates(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const beep = useCallback(() => {
    try {
      audioRef.current =
        audioRef.current ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const ctx = audioRef.current;
      [0, 0.25, 0.5].forEach((t) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 880;
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.22);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + 0.24);
      });
    } catch {
      /* ignore */
    }
  }, []);

  // Countdown engine
  useEffect(() => {
    if (running) {
      tickRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            setRunning(false);
            setFinished(true);
            beep();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [running, beep]);

  const active = states.find((s) => s.id === activeId) ?? null;

  function selectState(s: ClassState) {
    setActiveId(s.id);
    setSecondsLeft(s.minutes * 60);
    setRunning(false);
    setFinished(false);
  }

  function toggleRun() {
    if (secondsLeft === 0 && active) {
      setSecondsLeft(active.minutes * 60);
      setFinished(false);
    }
    setRunning((r) => !r);
  }

  function reset() {
    if (active) setSecondsLeft(active.minutes * 60);
    setRunning(false);
    setFinished(false);
  }

  function adjust(deltaSeconds: number) {
    setSecondsLeft((prev) => Math.max(0, prev + deltaSeconds));
    if (deltaSeconds > 0) setFinished(false);
  }

  function editMinutes(id: string, minutes: number) {
    const clamped = Math.max(1, Math.min(120, Math.round(minutes) || 1));
    persist(states.map((s) => (s.id === id ? { ...s, minutes: clamped } : s)));
    if (id === activeId && !running) setSecondsLeft(clamped * 60);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  // Spacebar = start/pause
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space" && active && !editing) {
        e.preventDefault();
        toggleRun();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, editing, secondsLeft, running]);

  const accent = active?.color ?? "#4e6ef2";
  const low = active && secondsLeft <= 30 && secondsLeft > 0;

  return (
    <>
      <style>{`
        .ctrl-root {
          min-height: 100vh;
          background: ${finished ? "#2a0d0d" : "#0b0d14"};
          color: #fff;
          font-family: Inter, ui-sans-serif, system-ui, sans-serif;
          display: grid;
          grid-template-rows: auto 1fr auto;
          transition: background 300ms ease;
        }
        .ctrl-topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 28px; border-bottom: 1px solid #1f2332;
        }
        .ctrl-wordmark {
          font-size: 0.78rem; font-weight: 900; letter-spacing: 0.14em;
          text-transform: uppercase; color: ${accent}; margin: 0;
          transition: color 300ms ease;
        }
        .ctrl-topbtns { display: flex; gap: 8px; }
        .ctrl-smallbtn {
          font-size: 0.78rem; font-weight: 800; letter-spacing: 0.05em;
          text-transform: uppercase; color: #8a93ad; background: transparent;
          border: 1px solid #1f2332; border-radius: 7px; padding: 7px 13px;
          cursor: pointer; text-decoration: none; transition: all 140ms ease;
        }
        .ctrl-smallbtn:hover { border-color: ${accent}; color: #fff; }

        .ctrl-main {
          display: grid; align-content: center; justify-items: center;
          gap: 22px; padding: 24px;
        }
        .ctrl-state-name {
          font-size: clamp(1.2rem, 3.5vw, 2.2rem); font-weight: 900;
          letter-spacing: 0.02em; color: ${accent}; text-align: center;
          transition: color 300ms ease; min-height: 1.2em;
        }
        .ctrl-clock {
          font-variant-numeric: tabular-nums;
          font-size: clamp(5rem, 22vw, 16rem); font-weight: 900;
          line-height: 0.95; letter-spacing: -0.02em;
          color: ${low ? "#fbbf24" : finished ? "#ef4444" : "#fff"};
          animation: ${finished ? "ctrlFlash 0.8s steps(1) infinite" : low ? "ctrlPulse 1s ease-in-out infinite" : "none"};
        }
        @keyframes ctrlFlash { 50% { opacity: 0.25; } }
        @keyframes ctrlPulse { 50% { opacity: 0.6; } }
        .ctrl-finished-note {
          font-size: 1.1rem; font-weight: 800; color: #ef4444;
          text-transform: uppercase; letter-spacing: 0.1em; min-height: 1.2em;
        }
        .ctrl-idle-note {
          color: #3a4460; font-size: 1.1rem; font-weight: 700; text-align: center;
          max-width: 420px;
        }

        .ctrl-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
        .ctrl-btn {
          font-size: 1rem; font-weight: 900; letter-spacing: 0.03em;
          border-radius: 11px; padding: 14px 26px; cursor: pointer;
          border: 1px solid #2a3045; background: #161a28; color: #fff;
          transition: transform 120ms ease, background 140ms ease, border-color 140ms ease;
        }
        .ctrl-btn:hover { transform: translateY(-1px); border-color: ${accent}; }
        .ctrl-btn.primary { background: ${accent}; border-color: ${accent}; }
        .ctrl-btn.primary:hover { filter: brightness(1.08); }
        .ctrl-btn:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }

        .ctrl-states {
          display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;
          padding: 16px 24px 26px; border-top: 1px solid #1f2332;
        }
        .ctrl-chip {
          display: inline-flex; align-items: center; gap: 9px;
          background: #121520; border: 1px solid #1f2332; border-radius: 999px;
          padding: 9px 16px; cursor: pointer; transition: all 140ms ease;
          font-weight: 800; font-size: 0.92rem; color: #c8cedd;
        }
        .ctrl-chip:hover { border-color: #3a4460; }
        .ctrl-chip.active { background: rgba(255,255,255,0.04); }
        .ctrl-dot { width: 11px; height: 11px; border-radius: 50%; flex: none; }
        .ctrl-chip-min {
          font-size: 0.78rem; font-weight: 800; color: #5a6280;
          background: #0b0d14; border-radius: 6px; padding: 2px 7px;
        }
        .ctrl-min-input {
          width: 46px; background: #0b0d14; border: 1px solid #2a3045;
          color: #fff; border-radius: 6px; padding: 3px 6px; font-weight: 800;
          font-size: 0.82rem; text-align: center;
        }
        .ctrl-edit-hint { color: #5a6280; font-size: 0.8rem; font-weight: 700; }
      `}</style>

      <div className="ctrl-root">
        <header className="ctrl-topbar">
          <p className="ctrl-wordmark">Big Dog Math — Classroom</p>
          <div className="ctrl-topbtns">
            <button className="ctrl-smallbtn" onClick={() => setEditing((e) => !e)}>
              {editing ? "Done editing" : "Edit times"}
            </button>
            <button className="ctrl-smallbtn" onClick={toggleFullscreen}>Fullscreen</button>
            <a className="ctrl-smallbtn" href="/">Home</a>
          </div>
        </header>

        <main className="ctrl-main">
          <div className="ctrl-state-name">{active ? active.label : ""}</div>

          {active ? (
            <>
              <div className="ctrl-clock">{fmt(secondsLeft)}</div>
              <div className="ctrl-finished-note">{finished ? "⏰ Time's up!" : ""}</div>

              <div className="ctrl-actions">
                <button className="ctrl-btn primary" onClick={toggleRun}>
                  {running ? "⏸ Pause" : secondsLeft === 0 ? "↻ Restart" : "▶ Start"}
                </button>
                <button className="ctrl-btn" onClick={reset}>Reset</button>
                <button className="ctrl-btn" onClick={() => adjust(60)}>+1 min</button>
                <button className="ctrl-btn" onClick={() => adjust(-60)} disabled={secondsLeft < 60}>−1 min</button>
                <button className="ctrl-btn" onClick={() => adjust(30)}>+30s</button>
              </div>
            </>
          ) : (
            <p className="ctrl-idle-note">
              Pick a classroom state below to start a timer. Tap “Edit times” to set
              your own default minutes for each — they’ll be remembered on this computer.
            </p>
          )}
        </main>

        <section className="ctrl-states">
          {editing && (
            <p className="ctrl-edit-hint" style={{ width: "100%", textAlign: "center", marginTop: 0 }}>
              Set the default minutes for each state, then tap “Done editing.”
            </p>
          )}
          {states.map((s) => (
            <div
              key={s.id}
              className={`ctrl-chip${s.id === activeId ? " active" : ""}`}
              onClick={() => !editing && selectState(s)}
              style={s.id === activeId ? { borderColor: s.color } : undefined}
            >
              <span className="ctrl-dot" style={{ background: s.color }} />
              {s.label}
              {editing ? (
                <input
                  className="ctrl-min-input"
                  type="number"
                  min={1}
                  max={120}
                  value={s.minutes}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => editMinutes(s.id, Number(e.target.value))}
                />
              ) : (
                <span className="ctrl-chip-min">{s.minutes}m</span>
              )}
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
