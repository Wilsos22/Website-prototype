"use client";

// Warm-up projector screen — Abbie (wordmark "Abbie³") runs the room.
// Pulls Learning Intention + Success Criteria from today's Notion lesson,
// runs the countdown with a 30s alert and a red 0:10 countdown + cue sounds.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

interface Lesson {
  title: string;
  module: string;
  topic: string;
  learningIntention: string;
  successCriteria: string;
  essentialIdeas: string;
}

// Dry, never corny. The cringe is always the teacher's, never hers.
const LINES = [
  "Heads down. 2 review, 3 new.",
  "Confused is step one. Try something.",
  "No talking. Yes thinking.",
  "Mr. Wilson says this one's easy. We'll see.",
  "Your pencil should be moving. That's the whole job.",
];

function fmt(s: number): string {
  return `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
}

export default function WarmupPage() {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [minutes, setMinutes] = useState(8);
  const [secondsLeft, setSecondsLeft] = useState(8 * 60);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [music, setMusic] = useState(false);
  const [lineIdx, setLineIdx] = useState(0);

  const totalRef = useRef(8 * 60);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const acRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    fetch("/api/today", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.lesson) setLesson(d.lesson as Lesson); })
      .catch(() => { /* timer still works without a lesson */ });
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setLineIdx((i) => (i + 1) % LINES.length), 14000);
    return () => window.clearInterval(id);
  }, []);

  const beep = useCallback((freq: number, dur = 0.12, vol = 0.22) => {
    try {
      const Ctx = window.AudioContext
        || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      acRef.current = acRef.current ?? new Ctx();
      const ac = acRef.current;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = freq;
      o.connect(g);
      g.connect(ac.destination);
      g.gain.setValueAtTime(vol, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.start();
      o.stop(ac.currentTime + dur);
    } catch { /* ignore */ }
  }, []);

  const cueSound = useCallback((n: number) => {
    if (n === 30) beep(880, 0.3, 0.25);
    else if (n <= 10 && n > 0) beep(n <= 3 ? 780 : 620, 0.1, 0.22);
    else if (n === 0) { beep(440, 0.45, 0.28); window.setTimeout(() => beep(330, 0.5, 0.28), 170); }
  }, [beep]);

  const stopTick = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  const start = useCallback(() => {
    if (running) return;
    if (!started) { totalRef.current = minutes * 60; setSecondsLeft(minutes * 60); }
    setStarted(true);
    setRunning(true);
    beep(523, 0.08, 0.14); // unlock audio on the click gesture
    stopTick();
    tickRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        const n = s - 1;
        cueSound(n);
        if (n <= 0) { stopTick(); setRunning(false); return 0; }
        return n;
      });
    }, 1000);
  }, [running, started, minutes, beep, cueSound, stopTick]);

  const pause = useCallback(() => { stopTick(); setRunning(false); }, [stopTick]);
  const reset = useCallback(() => {
    stopTick();
    setRunning(false);
    setStarted(false);
    totalRef.current = minutes * 60;
    setSecondsLeft(minutes * 60);
  }, [stopTick, minutes]);
  const adjustMinutes = useCallback((d: number) => {
    setMinutes((m) => {
      const nm = Math.max(1, Math.min(20, m + d));
      if (!started) { totalRef.current = nm * 60; setSecondsLeft(nm * 60); }
      return nm;
    });
  }, [started]);

  useEffect(() => () => stopTick(), [stopTick]);

  const danger = started && secondsLeft <= 10 && secondsLeft > 0;
  const warn = started && secondsLeft <= 30 && secondsLeft > 10;
  const finished = started && secondsLeft === 0;
  const accent = danger ? "#ff4d4d" : warn ? "#f5b915" : "#5eead4";
  const bg = danger ? "#1a0606" : "#0b0d14";

  const total = totalRef.current || 1;
  const circumference = 2 * Math.PI * 52;
  const offset = circumference * (1 - Math.max(0, secondsLeft) / total);

  return (
    <main className="wu-page" style={{ background: bg, ["--wu-accent" as string]: accent } as CSSProperties}>
      <style>{`
        .wu-page { position:fixed; inset:0; color:#e8ecf5; font-family:var(--bdb-font); transition:background 400ms ease; overflow:hidden; }
        .wu-top { position:absolute; top:0; left:0; right:0; display:flex; align-items:center; justify-content:space-between; gap:14px; padding:18px 24px; flex-wrap:wrap; }
        .wu-brand { display:flex; align-items:center; gap:12px; }
        .wu-mark { width:46px; height:46px; border-radius:50%; background:#14241f; display:grid; place-items:center; overflow:hidden; flex:none; }
        .wu-mark img { width:42px; height:42px; object-fit:contain; }
        .wu-name { font-weight:800; font-size:1.05rem; letter-spacing:-0.01em; }
        .wu-sq { color:#5eead4; font-size:0.62em; font-weight:900; vertical-align:super; margin:0 0.02em; }
        .wu-status { font-size:0.8rem; color:#8a93ad; display:flex; align-items:center; gap:6px; }
        .wu-dot { width:7px; height:7px; border-radius:50%; background:var(--wu-accent); animation:wu-blink 1.6s ease-in-out infinite; }
        @keyframes wu-blink { 0%,100%{opacity:1} 50%{opacity:.3} }
        .wu-ctrls { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .wu-btn { min-height:40px; padding:0 14px; border-radius:10px; border:1px solid #2a3550; background:#141a27; color:#e8ecf5; font-weight:700; font-size:0.9rem; cursor:pointer; }
        .wu-btn.pri { background:var(--wu-accent); border-color:var(--wu-accent); color:#06231f; }
        .wu-mins { min-width:46px; text-align:center; font-weight:800; }
        .wu-center { position:absolute; inset:0; display:grid; place-items:center; }
        .wu-ringwrap { position:relative; width:min(44vh,46vw); height:min(44vh,46vw); }
        .wu-ringtxt { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
        .wu-time { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-weight:800; color:#fff; line-height:1; font-size:clamp(3rem,12vh,7.5rem); }
        .wu-time-lbl { font-size:0.82rem; color:#8a93ad; letter-spacing:0.16em; margin-top:10px; }
        .wu-danger .wu-time, .wu-danger .wu-ring-fg { animation:wu-pulse 1s ease-in-out infinite; }
        @keyframes wu-pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        .wu-banner { position:absolute; top:13%; left:0; right:0; text-align:center; font-size:clamp(1.4rem,4vh,2.4rem); font-weight:900; color:var(--wu-accent); letter-spacing:0.02em; animation:wu-flash 1s steps(2,start) infinite; }
        @keyframes wu-flash { 50%{opacity:.18} }
        .wu-abbie { position:absolute; right:24px; bottom:24px; width:min(34%,420px); display:grid; gap:10px; }
        .wu-say { background:#141a27; border-radius:14px; padding:14px 18px; font-size:clamp(0.98rem,2.1vh,1.25rem); line-height:1.4; }
        .wu-chip { background:#1b2233; padding:6px 11px; border-radius:8px; font-size:0.8rem; color:#9fb0c8; }
        .wu-pill { display:inline-flex; align-items:center; gap:6px; background:#14241f; color:#5eead4; padding:8px 12px; border-radius:999px; font-size:0.82rem; font-weight:700; }
      `}</style>

      <div className="wu-top">
        <div className="wu-brand">
          <div className="wu-mark">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/big-dog-mark.png" alt="" /></div>
          <div>
            <div className="wu-name">Abbie<sup className="wu-sq">3</sup></div>
            <div className="wu-status"><span className="wu-dot" /> running the warm-up{lesson?.module ? ` · ${lesson.module}` : ""}</div>
          </div>
        </div>
        <div className="wu-ctrls">
          <span className="wu-pill">{music ? "Music on" : "Music off"}</span>
          <button className="wu-btn" onClick={() => setMusic((v) => !v)}>Music</button>
          <button className="wu-btn" onClick={() => adjustMinutes(-1)}>−</button>
          <span className="wu-mins">{minutes}m</span>
          <button className="wu-btn" onClick={() => adjustMinutes(1)}>+</button>
          <button className="wu-btn pri" onClick={running ? pause : start}>{running ? "Pause" : started ? "Resume" : "Start"}</button>
          <button className="wu-btn" onClick={reset}>Reset</button>
        </div>
      </div>

      {warn && <div className="wu-banner">30 seconds</div>}
      {danger && <div className="wu-banner">Pencils up soon</div>}

      <div className={`wu-center${danger ? " wu-danger" : ""}`}>
        <div className="wu-ringwrap">
          <svg viewBox="0 0 120 120" width="100%" height="100%">
            <circle cx="60" cy="60" r="52" fill="none" stroke="#1b2233" strokeWidth="8" />
            <circle
              className="wu-ring-fg"
              cx="60" cy="60" r="52" fill="none" stroke={accent} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={offset}
              transform="rotate(-90 60 60)"
              style={{ transition: "stroke-dashoffset 1s linear, stroke 400ms ease" }}
            />
          </svg>
          <div className="wu-ringtxt">
            <div className="wu-time">{fmt(secondsLeft)}</div>
            <div className="wu-time-lbl">{finished ? "TIME" : "WARM-UP"}</div>
          </div>
        </div>
      </div>

      <div className="wu-abbie">
        <div className="wu-say">{finished ? "Time. Pencils up, eyes on Mr. Wilson." : LINES[lineIdx]}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <span className="wu-chip">2 review · 3 new</span>
          <span className="wu-chip">silent work</span>
        </div>
      </div>
    </main>
  );
}
