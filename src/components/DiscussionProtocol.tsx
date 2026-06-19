"use client";

// Discussion Protocol — a guided multi-phase routine launched from the
// Discussion state in the control panel:
//   1. Thinking Time (silent, 1 min, Abbie-thinking visual, optional music)
//   2. Marker to the Board (1 min, uploadable image)
//   3. Discuss with Your Table (30s, uploadable image/video)
//   4. Revise (30s)
//   5. Share — random single-student picker
// Each phase alerts at the end and waits for you to tap "Next phase".
// Durations, images/videos, and music are uploadable and saved on this computer.

import { useEffect, useRef, useState, useCallback } from "react";
import type { DiscussionPhaseSnapshot } from "@/lib/liveClassFlow";

interface Phase {
  id: string;
  label: string;
  sub: string;
  icon: string;
  defaultSecs: number;
  timed: boolean;
}

const PHASES: Phase[] = [
  { id: "think", label: "Thinking Time", sub: "Silent — think on your own", icon: "🤔", defaultSecs: 60, timed: true },
  { id: "marker", label: "Marker to the Board", sub: "Show your thinking", icon: "✍️", defaultSecs: 60, timed: true },
  { id: "table", label: "Discuss with Your Table", sub: "Talk it through together", icon: "💬", defaultSecs: 30, timed: true },
  { id: "revise", label: "Revise Your Answer", sub: "Update your thinking", icon: "✏️", defaultSecs: 30, timed: true },
  { id: "share", label: "Share Out", sub: "Who's sharing?", icon: "🎤", defaultSecs: 0, timed: false },
];

const LS_DUR = "bdm-disc-durations-v1";
const LS_CLASSES = "bdm-spinner-classes-v1";
const LS_CURRENT = "bdm-spinner-current-v1";

// Shared IndexedDB (same store the control panel uses; keys namespaced "disc:")
function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("bdm-control", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("sounds");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(key: string, blob: Blob) {
  const db = await idbOpen();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction("sounds", "readwrite");
    tx.objectStore("sounds").put(blob, key);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}
async function idbGet(key: string): Promise<Blob | undefined> {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction("sounds", "readonly");
    const r = tx.objectStore("sounds").get(key);
    r.onsuccess = () => res(r.result as Blob | undefined); r.onerror = () => rej(r.error);
  });
}
async function idbDel(key: string) {
  const db = await idbOpen();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction("sounds", "readwrite");
    tx.objectStore("sounds").delete(key);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}

function fmt(s: number) {
  const t = Math.max(0, s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
function sample<T>(a: T[]): T | undefined { return a[Math.floor(Math.random() * a.length)]; }

export default function DiscussionProtocol({
  onClose,
  onFlowChange,
}: {
  onClose?: () => void;
  onFlowChange?: (snapshot: DiscussionPhaseSnapshot) => void;
}) {
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [idx, setIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(PHASES[0].defaultSecs);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [setup, setSetup] = useState(false);
  const [media, setMedia] = useState<Record<string, { url: string; type: string }>>({});

  // share picker
  const [shareName, setShareName] = useState<string>("—");
  const [shareSpinning, setShareSpinning] = useState(false);
  const [shareClass, setShareClass] = useState<string>("");

  const secRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shareTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const phase = PHASES[idx];
  const phaseSecs = (id: string) => durations[id] ?? PHASES.find((p) => p.id === id)?.defaultSecs ?? 60;
  const phaseTotalSeconds = durations[phase.id] ?? phase.defaultSecs;

  useEffect(() => {
    onFlowChange?.({
      id: phase.id as DiscussionPhaseSnapshot["id"],
      label: phase.label,
      subtitle: phase.sub,
      timed: phase.timed,
      totalSeconds: phase.timed ? phaseTotalSeconds : null,
      secondsLeft: phase.timed ? secondsLeft : null,
      running,
      finished,
    });
  }, [finished, onFlowChange, phase.id, phase.label, phase.sub, phase.timed, phaseTotalSeconds, running, secondsLeft]);

  // load durations + media + share class
  useEffect(() => {
    try {
      const d = localStorage.getItem(LS_DUR);
      if (d) setDurations(JSON.parse(d));
      setShareClass(localStorage.getItem(LS_CURRENT) || "");
    } catch { /* ignore */ }
    (async () => {
      const next: Record<string, { url: string; type: string }> = {};
      for (const p of PHASES) {
        const blob = await idbGet(`disc:${p.id}`).catch(() => undefined);
        if (blob) next[p.id] = { url: URL.createObjectURL(blob), type: blob.type };
      }
      setMedia(next);
    })();
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      shareTimers.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => { secRef.current = phaseSecs(phase.id); setSecondsLeft(secRef.current); setRunning(false); setFinished(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  const tone = useCallback((freqs: number[], gap = 0.22, dur = 0.18) => {
    try {
      audioRef.current = audioRef.current ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const ctx = audioRef.current;
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.frequency.value = f; osc.connect(g); g.connect(ctx.destination);
        const t = ctx.currentTime + i * gap;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.start(t); osc.stop(t + dur + 0.02);
      });
    } catch { /* ignore */ }
  }, []);

  const stopMusic = useCallback(() => {
    if (musicRef.current) { musicRef.current.pause(); musicRef.current.currentTime = 0; musicRef.current = null; }
  }, []);

  // music handled directly via idb key disc:<id>:music
  const playPhaseMusic = useCallback(async (id: string) => {
    const blob = await idbGet(`disc:${id}:music`).catch(() => undefined);
    if (!blob) return;
    stopMusic();
    const a = new Audio(URL.createObjectURL(blob)); a.loop = true;
    a.play().catch(() => { /* ignore */ });
    musicRef.current = a;
  }, [stopMusic]);

  // timer engine
  useEffect(() => {
    if (!running) return;
    tickRef.current = setInterval(() => {
      const n = secRef.current - 1; secRef.current = n; setSecondsLeft(n);
      if (n <= 5 && n >= 1) tone([660], 0, 0.07);
      if (n <= 0) {
        if (tickRef.current) clearInterval(tickRef.current);
        setRunning(false); setFinished(true); stopMusic();
        if (videoRef.current) videoRef.current.pause();
        tone([880, 880, 880]);
      }
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [running, tone, stopMusic]);

  function toggleRun() {
    if (!phase.timed) return;
    if (secondsLeft <= 0) { secRef.current = phaseSecs(phase.id); setSecondsLeft(secRef.current); setFinished(false); }
    const willRun = !running; setRunning(willRun);
    if (willRun) { playPhaseMusic(phase.id); if (videoRef.current) videoRef.current.play().catch(() => {}); }
    else { if (musicRef.current) musicRef.current.pause(); if (videoRef.current) videoRef.current.pause(); }
  }
  function reset() { secRef.current = phaseSecs(phase.id); setSecondsLeft(secRef.current); setRunning(false); setFinished(false); stopMusic(); }
  function adjust(d: number) { secRef.current = Math.max(0, secRef.current + d); setSecondsLeft(secRef.current); if (d > 0) setFinished(false); }
  function goPhase(n: number) { stopMusic(); if (n >= 0 && n < PHASES.length) setIdx(n); }

  function saveDurations(id: string, secs: number) {
    const clamped = Math.max(5, Math.min(600, Math.round(secs) || 5));
    const next = { ...durations, [id]: clamped }; setDurations(next);
    try { localStorage.setItem(LS_DUR, JSON.stringify(next)); } catch { /* ignore */ }
    if (id === phase.id && !running) { secRef.current = clamped; setSecondsLeft(clamped); }
  }
  async function uploadMedia(key: string, file: File | undefined, isMusic = false) {
    if (!file) return;
    await idbPut(key, file);
    if (!isMusic) {
      const id = key.replace("disc:", "");
      setMedia((prev) => {
        if (prev[id]) URL.revokeObjectURL(prev[id].url);
        return { ...prev, [id]: { url: URL.createObjectURL(file), type: file.type } };
      });
    }
  }
  async function clearMedia(key: string, isMusic = false) {
    await idbDel(key);
    if (!isMusic) {
      const id = key.replace("disc:", "");
      setMedia((prev) => { const n = { ...prev }; if (n[id]) URL.revokeObjectURL(n[id].url); delete n[id]; return n; });
    }
  }

  // share picker
  function spinShare() {
    if (shareSpinning) return;
    let names: string[] = [];
    try {
      const c = localStorage.getItem(LS_CLASSES);
      const classes = c ? JSON.parse(c) as Record<string, { names: string[] }> : {};
      names = classes[shareClass]?.names ?? [];
    } catch { /* ignore */ }
    if (names.length === 0) return;
    setShareSpinning(true);
    const pick = sample(names) ?? "—";
    shareTimers.current.forEach(clearTimeout); shareTimers.current = [];
    const cyc = setInterval(() => setShareName(sample(names) ?? "—"), 70);
    const stop = setTimeout(() => { clearInterval(cyc); setShareName(pick); setShareSpinning(false); tone([880, 0]); }, 1600);
    shareTimers.current.push(stop as unknown as ReturnType<typeof setTimeout>);
  }

  const accent = "#06b6d4";
  const m = media[phase.id];
  const classNames = (() => { try { return Object.keys(JSON.parse(localStorage.getItem(LS_CLASSES) || "{}")); } catch { return []; } })();

  return (
    <div className="dp-root">
      <style>{`
        .dp-root { min-height:100vh; width:100%; background:${finished ? "#10231f" : "#0b0d14"}; color:#fff; font-family:Inter,ui-sans-serif,system-ui,sans-serif; display:grid; grid-template-rows:auto 1fr auto; transition:background 300ms; }
        .dp-top { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:14px 24px; border-bottom:1px solid #1f2332; flex-wrap:wrap; }
        .dp-mark { font-size:0.76rem; font-weight:900; letter-spacing:0.14em; text-transform:uppercase; color:${accent}; margin:0; }
        .dp-steps { display:flex; gap:6px; flex-wrap:wrap; }
        .dp-step { font-size:0.72rem; font-weight:800; padding:5px 10px; border-radius:999px; border:1px solid #1f2332; color:#5a6280; cursor:pointer; }
        .dp-step.cur { border-color:${accent}; color:#fff; background:rgba(6,182,212,0.12); }
        .dp-step.done { color:#86efac; border-color:rgba(34,197,94,0.3); }
        .dp-btn { font-size:0.78rem; font-weight:800; color:#8a93ad; background:transparent; border:1px solid #1f2332; border-radius:7px; padding:8px 12px; cursor:pointer; }
        .dp-btn:hover { border-color:${accent}; color:#fff; }

        .dp-main { display:grid; align-content:center; justify-items:center; gap:18px; padding:20px; text-align:center; }
        .dp-phase { font-size:clamp(1.6rem,4.5vw,3rem); font-weight:900; color:${accent}; }
        .dp-sub { font-size:clamp(1rem,2.4vw,1.4rem); color:#8a93ad; font-weight:700; margin-top:-8px; }
        .dp-media { max-width:min(70vw,560px); max-height:42vh; border-radius:16px; border:1px solid #1f2332; }
        .dp-icon { font-size:clamp(5rem,16vw,11rem); line-height:1; }
        .dp-clock { font-variant-numeric:tabular-nums; font-weight:900; font-size:clamp(3.5rem,12vw,8rem); line-height:0.9; color:${finished ? "#34d399" : secondsLeft <= 5 && running ? "#fbbf24" : "#fff"}; animation:${finished ? "dpFlash 0.7s steps(1) infinite" : "none"}; }
        @keyframes dpFlash { 50%{opacity:0.2;} }
        .dp-note { min-height:1.3em; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#34d399; }
        .dp-actions { display:flex; flex-wrap:wrap; gap:9px; justify-content:center; }
        .dp-a { font-size:1rem; font-weight:900; border-radius:11px; padding:13px 22px; cursor:pointer; border:1px solid #2a3045; background:#161a28; color:#fff; }
        .dp-a:hover { border-color:${accent}; }
        .dp-a.pri { background:${accent}; border-color:${accent}; }
        .dp-a.next { background:#22c55e; border-color:#22c55e; }
        .dp-a:disabled { opacity:0.34; cursor:not-allowed; }

        .dp-share-reel { width:min(80vw,460px); height:clamp(120px,20vh,200px); border-radius:18px; border:2px solid ${accent}; background:#121520; display:grid; place-items:center; }
        .dp-share-name { font-size:clamp(1.8rem,5vw,3.2rem); font-weight:900; }

        .dp-setup { background:#0d1018; border-top:1px solid #1f2332; padding:16px 24px; display:grid; gap:12px; }
        .dp-setup h3 { margin:0; font-size:0.8rem; font-weight:900; letter-spacing:0.06em; text-transform:uppercase; color:#8a93ad; }
        .dp-row { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
        .dp-rlabel { font-weight:800; color:#c8cedd; min-width:200px; }
        .dp-num { width:64px; background:#0b0d14; border:1px solid #2a3045; color:#fff; border-radius:6px; padding:5px 7px; font-weight:800; text-align:center; }
        .dp-up { font-size:0.78rem; font-weight:800; color:#67e8f9; background:rgba(6,182,212,0.1); border:1px solid rgba(6,182,212,0.3); border-radius:8px; padding:6px 11px; cursor:pointer; }
        .dp-clr { font-size:0.72rem; font-weight:800; color:#fca5a5; background:transparent; border:1px solid rgba(239,68,68,0.3); border-radius:6px; padding:5px 8px; cursor:pointer; }
        .dp-hint { color:#5a6280; font-size:0.8rem; font-weight:700; }
        .dp-sel { background:#121520; border:1px solid #2a3045; color:#fff; border-radius:8px; padding:8px 12px; font-weight:800; }
      `}</style>

      <header className="dp-top">
        <p className="dp-mark">Discussion</p>
        <div className="dp-steps">
          {PHASES.map((p, i) => (
            <span key={p.id} className={`dp-step${i === idx ? " cur" : i < idx ? " done" : ""}`} onClick={() => goPhase(i)}>
              {i + 1}. {p.label}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="dp-btn" onClick={() => setSetup((v) => !v)}>{setup ? "Done" : "Set up"}</button>
          {onClose && <button className="dp-btn" onClick={() => { stopMusic(); onClose(); }}>✕ Close</button>}
        </div>
      </header>

      <main className="dp-main">
        <div className="dp-phase">{phase.icon} {phase.label}</div>
        <div className="dp-sub">{phase.sub}</div>

        {phase.id === "share" ? (
          <>
            <div className="dp-row" style={{ justifyContent: "center" }}>
              <select className="dp-sel" value={shareClass} onChange={(e) => setShareClass(e.target.value)}>
                {classNames.length === 0 && <option value="">No class — add in Spinner</option>}
                {classNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="dp-share-reel"><span className="dp-share-name">{shareName}</span></div>
            <button className="dp-a pri" onClick={spinShare} disabled={shareSpinning || classNames.length === 0}>{shareSpinning ? "Spinning…" : "🎤 Pick a sharer"}</button>
          </>
        ) : (
          <>
            {m ? (
              m.type.startsWith("video") ? (
                <video ref={videoRef} className="dp-media" src={m.url} loop playsInline />
              ) : (
                <img className="dp-media" src={m.url} alt={phase.label} />
              )
            ) : (
              <div className="dp-icon">{phase.icon}</div>
            )}
            <div className="dp-clock">{fmt(secondsLeft)}</div>
            <div className="dp-note">{finished ? "⏰ Time — tap Next phase" : ""}</div>
            <div className="dp-actions">
              <button className="dp-a pri" onClick={toggleRun}>{running ? "⏸ Pause" : secondsLeft <= 0 ? "↻ Restart" : "▶ Start"}</button>
              <button className="dp-a" onClick={reset}>Reset</button>
              <button className="dp-a" onClick={() => adjust(15)}>+15s</button>
              <button className="dp-a" onClick={() => adjust(-15)} disabled={secondsLeft < 15}>−15s</button>
            </div>
          </>
        )}

        <div className="dp-actions">
          <button className="dp-a" onClick={() => goPhase(idx - 1)} disabled={idx === 0}>‹ Back</button>
          <button className="dp-a next" onClick={() => goPhase(idx + 1)} disabled={idx + 1 >= PHASES.length}>Next phase ▶</button>
        </div>
      </main>

      {setup && (
        <section className="dp-setup">
          <h3>Set up the discussion — durations &amp; media (saved on this computer)</h3>
          {PHASES.filter((p) => p.timed).map((p) => {
            const has = !!media[p.id];
            return (
              <div className="dp-row" key={p.id}>
                <span className="dp-rlabel">{p.icon} {p.label}</span>
                <label className="dp-hint">seconds
                  <input className="dp-num" type="number" min={5} max={600} value={phaseSecs(p.id)}
                    onChange={(e) => saveDurations(p.id, Number(e.target.value))} style={{ marginLeft: 8 }} />
                </label>
                <label className="dp-up">{has ? "Replace image/video" : "Upload image/video"}
                  <input type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={(e) => uploadMedia(`disc:${p.id}`, e.target.files?.[0])} />
                </label>
                {has && <button className="dp-clr" onClick={() => clearMedia(`disc:${p.id}`)}>Remove media</button>}
                <label className="dp-up">Music
                  <input type="file" accept="audio/*" style={{ display: "none" }} onChange={(e) => uploadMedia(`disc:${p.id}:music`, e.target.files?.[0], true)} />
                </label>
                <button className="dp-clr" onClick={() => clearMedia(`disc:${p.id}:music`, true)}>Clear music</button>
              </div>
            );
          })}
          <p className="dp-hint">For Thinking Time, upload your “Abbie thinking” image. The Discuss phase accepts an image or a video. Music loops while that phase runs.</p>
        </section>
      )}
    </div>
  );
}
