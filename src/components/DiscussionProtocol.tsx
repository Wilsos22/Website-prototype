"use client";

// Discussion Protocol - a guided three-round routine launched from the
// Discussion state in the control panel:
//   1. Think + Write (2 min)
//   2. Discuss + Revise (2 min)
//   3. Share with the spinner (2 min)
// Each round advances automatically while lesson pacing is on and holds at zero
// when pacing is manual. Images, videos, and music are saved on this computer.

import { useEffect, useRef, useState, useCallback } from "react";
import {
  isDiscussionRemoteAction,
  shouldRunNavigationDestination,
  type DiscussionPhaseSnapshot,
  type TeacherRemoteCommand,
} from "@/lib/liveClassFlow";
import {
  DISCUSSION_ROUND_COUNT,
  DISCUSSION_ROUNDS,
  discussionRoundForAction,
  discussionRoundIndex,
  nextDiscussionRound,
  normalizeDiscussionPhaseSnapshot,
} from "@/lib/discussionProtocol";

type StudentSupports = {
  sentenceStems: string;
  keyVocabulary: string;
};

const LS_CLASSES = "bdm-spinner-classes-v1";
const LS_CURRENT = "bdm-spinner-current-v1";
const LS_STUDENT_MEDIA = "bdm-disc-student-media-v1";
const LS_STUDENT_SUPPORTS = "bdm-disc-student-supports-v1";

const DEFAULT_STUDENT_SUPPORTS: Record<string, StudentSupports> = {
  table: {
    sentenceStems: [
      "I agree with ___ because...",
      "I disagree because...",
      "Can you explain how you got...?",
      "My strategy was...",
      "I want to add on by...",
      "I changed my thinking because...",
    ].join("\n"),
    keyVocabulary: [
      "strategy",
      "evidence",
      "justify",
      "represent",
      "equivalent",
      "revise",
    ].join("\n"),
  },
};

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
function inferStudentMediaType(url: string): "image" | "video" | "embed" {
  const clean = url.split("?")[0].toLowerCase();
  if (/\.(mp4|webm|ogg|mov|m4v)$/.test(clean)) return "video";
  if (/\.(png|jpe?g|gif|webp|avif|svg)$/.test(clean)) return "image";
  return "embed";
}
function normalizeStudentMediaUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.includes("youtube.com") && parsed.searchParams.get("v")) {
      return `https://www.youtube.com/embed/${parsed.searchParams.get("v")}`;
    }
    if (parsed.hostname === "youtu.be") {
      const videoId = parsed.pathname.replace("/", "");
      return videoId ? `https://www.youtube.com/embed/${videoId}` : trimmed;
    }
    if (parsed.hostname.includes("vimeo.com")) {
      const videoId = parsed.pathname.split("/").filter(Boolean).pop();
      return videoId ? `https://player.vimeo.com/video/${videoId}` : trimmed;
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}
function parseSentenceStems(rawText: string): string[] {
  return rawText
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}
function parseVocabulary(rawText: string): string[] {
  return rawText
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function DiscussionProtocol({
  onClose,
  onFlowChange,
  onComplete,
  automaticPacing = false,
  initialFlow,
  remoteCommand,
  onRemoteCommandHandled,
}: {
  onClose?: () => void;
  onFlowChange?: (snapshot: DiscussionPhaseSnapshot) => void;
  onComplete?: () => void;
  automaticPacing?: boolean;
  initialFlow?: DiscussionPhaseSnapshot | null;
  remoteCommand?: TeacherRemoteCommand | null;
  onRemoteCommandHandled?: (command: TeacherRemoteCommand) => void;
}) {
  const normalizedInitialFlow = normalizeDiscussionPhaseSnapshot(initialFlow);
  const initialIndex = normalizedInitialFlow ? discussionRoundIndex(normalizedInitialFlow.id) : 0;
  const initialPhase = DISCUSSION_ROUNDS[initialIndex];
  const initialSeconds = normalizedInitialFlow?.secondsLeft ?? initialPhase.defaultSeconds;
  const [idx, setIdx] = useState(initialIndex);
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [running, setRunning] = useState(Boolean(normalizedInitialFlow?.running));
  const [finished, setFinished] = useState(Boolean(normalizedInitialFlow?.finished));
  const [setup, setSetup] = useState(false);
  const [media, setMedia] = useState<Record<string, { url: string; type: string }>>({});
  const [studentMediaUrls, setStudentMediaUrls] = useState<Record<string, string>>({});
  const [studentSupports, setStudentSupports] = useState<Record<string, StudentSupports>>(DEFAULT_STUDENT_SUPPORTS);

  // share picker
  const [shareName, setShareName] = useState<string>(normalizedInitialFlow?.selectedSharer || "Waiting");
  const [selectedSharer, setSelectedSharer] = useState<string | null>(normalizedInitialFlow?.selectedSharer || null);
  const [shareSpinning, setShareSpinning] = useState(false);
  const [shareClass, setShareClass] = useState<string>("");

  const secRef = useRef(initialSeconds);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shareTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const autoProgressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledRemoteCommandRef = useRef<string | null>(null);
  const onCompleteRef = useRef(onComplete);

  const phase = DISCUSSION_ROUNDS[idx];
  const phaseTotalSeconds = phase.defaultSeconds;
  const currentSupport = studentSupports[phase.id] ?? { sentenceStems: "", keyVocabulary: "" };

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const studentMediaUrl = normalizeStudentMediaUrl(studentMediaUrls[phase.id] || "");
    onFlowChange?.({
      id: phase.id,
      label: phase.label,
      subtitle: phase.subtitle,
      timed: true,
      totalSeconds: phaseTotalSeconds,
      secondsLeft,
      running,
      finished,
      media: studentMediaUrl ? { url: studentMediaUrl, type: inferStudentMediaType(studentMediaUrl) } : null,
      sentenceStems: parseSentenceStems(currentSupport.sentenceStems),
      keyVocabulary: parseVocabulary(currentSupport.keyVocabulary),
      selectedSharer: phase.id === "share" ? selectedSharer : null,
      roundNumber: phase.roundNumber,
      roundCount: DISCUSSION_ROUND_COUNT,
    });
  }, [currentSupport.keyVocabulary, currentSupport.sentenceStems, finished, onFlowChange, phase.id, phase.label, phase.roundNumber, phase.subtitle, phaseTotalSeconds, running, secondsLeft, selectedSharer, studentMediaUrls]);

  useEffect(() => {
    const incomingFlow = normalizeDiscussionPhaseSnapshot(initialFlow);
    const incomingSharer = incomingFlow?.id === "share" ? incomingFlow.selectedSharer || null : null;
    if (!incomingSharer || incomingSharer === selectedSharer) return;
    setSelectedSharer(incomingSharer);
    setShareName(incomingSharer);
  }, [initialFlow, selectedSharer]);

  // Load media, student supports, and the share class.
  useEffect(() => {
    try {
      const studentMedia = localStorage.getItem(LS_STUDENT_MEDIA);
      if (studentMedia) setStudentMediaUrls(JSON.parse(studentMedia) as Record<string, string>);
      const supports = localStorage.getItem(LS_STUDENT_SUPPORTS);
      if (supports) {
        setStudentSupports({
          ...DEFAULT_STUDENT_SUPPORTS,
          ...(JSON.parse(supports) as Record<string, StudentSupports>),
        });
      }
      setShareClass(localStorage.getItem(LS_CURRENT) || "");
    } catch { /* ignore */ }
    (async () => {
      const next: Record<string, { url: string; type: string }> = {};
      for (const p of DISCUSSION_ROUNDS) {
        const blob = await idbGet(`disc:${p.id}`).catch(() => undefined);
        if (blob) next[p.id] = { url: URL.createObjectURL(blob), type: blob.type };
      }
      setMedia(next);
    })();
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (autoProgressTimerRef.current) clearTimeout(autoProgressTimerRef.current);
      shareTimers.current.forEach(clearTimeout);
    };
  }, []);

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
      const n = Math.max(0, secRef.current - 1); secRef.current = n; setSecondsLeft(n);
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

  useEffect(() => {
    if (!finished || !automaticPacing) return;
    autoProgressTimerRef.current = setTimeout(() => {
      autoProgressTimerRef.current = null;
      const nextRound = nextDiscussionRound(phase.id);
      if (nextRound) {
        goPhase(discussionRoundIndex(nextRound.id), true);
        return;
      }
      onCompleteRef.current?.();
    }, 2600);
    return () => {
      if (autoProgressTimerRef.current) clearTimeout(autoProgressTimerRef.current);
      autoProgressTimerRef.current = null;
    };
    // The canonical round transition is driven only by the completed round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automaticPacing, finished, idx, phase.id]);

  function toggleRun() {
    if (secondsLeft <= 0) { secRef.current = phase.defaultSeconds; setSecondsLeft(secRef.current); setFinished(false); }
    const willRun = !running; setRunning(willRun);
    if (willRun) { playPhaseMusic(phase.id); if (videoRef.current) videoRef.current.play().catch(() => {}); }
    else { if (musicRef.current) musicRef.current.pause(); if (videoRef.current) videoRef.current.pause(); }
  }
  function reset() { goPhase(idx, false); }
  function adjust(d: number) { secRef.current = Math.max(0, secRef.current + d); setSecondsLeft(secRef.current); if (d > 0) setFinished(false); }
  function goPhase(n: number, startImmediately = false) {
    if (n < 0 || n >= DISCUSSION_ROUNDS.length) return;
    stopMusic();
    const nextPhase = DISCUSSION_ROUNDS[n];
    setIdx(n);
    secRef.current = nextPhase.defaultSeconds;
    setSecondsLeft(secRef.current);
    setRunning(startImmediately);
    setFinished(false);
    if (startImmediately) void playPhaseMusic(nextPhase.id);
  }
  function goAdjacentPhase(n: number) {
    const keepRunning = shouldRunNavigationDestination(
      automaticPacing ? "automatic" : "manual",
      running,
      finished,
      null,
    );
    goPhase(n, keepRunning);
  }

  useEffect(() => {
    if (
      !remoteCommand
      || remoteCommand.nonce === handledRemoteCommandRef.current
      || !isDiscussionRemoteAction(remoteCommand.action)
    ) return;
    handledRemoteCommandRef.current = remoteCommand.nonce;

    const goRemotePhase = (targetIndex: number) => {
      if (targetIndex === idx) {
        reset();
        return;
      }
      const keepRunning = shouldRunNavigationDestination(
        automaticPacing ? "automatic" : "manual",
        running,
        finished,
        null,
      );
      goPhase(targetIndex, keepRunning);
    };

    const requestedRound = discussionRoundForAction(remoteCommand.action);
    if (requestedRound) goRemotePhase(discussionRoundIndex(requestedRound.id));
    else if (remoteCommand.action === "discussion-previous") goAdjacentPhase(idx - 1);
    else if (remoteCommand.action === "discussion-next") goAdjacentPhase(idx + 1);
    else if (remoteCommand.action === "discussion-restart") reset();
    else if (remoteCommand.action === "discussion-toggle") toggleRun();

    onRemoteCommandHandled?.(remoteCommand);
    // The command nonce is the event identity. The phase handlers intentionally
    // operate on the current render's phase and timer state exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteCommand?.nonce]);

  function saveStudentMediaUrl(id: string, url: string) {
    const next = { ...studentMediaUrls, [id]: url };
    if (!url.trim()) delete next[id];
    setStudentMediaUrls(next);
    try { localStorage.setItem(LS_STUDENT_MEDIA, JSON.stringify(next)); } catch { /* ignore */ }
  }
  function saveStudentSupport(id: string, field: keyof StudentSupports, value: string) {
    const next = {
      ...studentSupports,
      [id]: {
        ...(studentSupports[id] ?? { sentenceStems: "", keyVocabulary: "" }),
        [field]: value,
      },
    };
    setStudentSupports(next);
    try { localStorage.setItem(LS_STUDENT_SUPPORTS, JSON.stringify(next)); } catch { /* ignore */ }
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
      const selectedClass = shareClass || localStorage.getItem(LS_CURRENT) || "";
      names = classes[selectedClass]?.names ?? [];
      if (selectedClass && selectedClass !== shareClass) setShareClass(selectedClass);
    } catch { /* ignore */ }
    if (names.length === 0) return;
    setShareSpinning(true);
    const pick = sample(names) ?? "—";
    shareTimers.current.forEach(clearTimeout); shareTimers.current = [];
    const cyc = setInterval(() => setShareName(sample(names) ?? "—"), 70);
    const stop = setTimeout(() => {
      clearInterval(cyc);
      setShareName(pick);
      setSelectedSharer(pick);
      setShareSpinning(false);
      tone([880, 0]);
    }, 1600);
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
        .dp-visual { display:grid; place-items:center; width:clamp(120px,22vw,220px); aspect-ratio:1; border:2px solid rgba(6,182,212,0.55); border-radius:50%; background:rgba(6,182,212,0.08); color:${accent}; font-size:clamp(3.5rem,10vw,7rem); font-weight:950; line-height:1; letter-spacing:-0.08em; }
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
        .dp-url { flex:1 1 280px; min-width:min(100%,280px); background:#0b0d14; border:1px solid #2a3045; color:#fff; border-radius:8px; padding:8px 10px; font:inherit; font-size:0.86rem; font-weight:750; }
        .dp-url:focus { outline:none; border-color:${accent}; }
        .dp-supports { width:calc(100% - 212px); display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin-left:212px; }
        .dp-support-field { display:grid; gap:6px; color:#c8cedd; font-size:0.76rem; font-weight:900; letter-spacing:0.06em; text-transform:uppercase; }
        .dp-support-text { min-height:112px; resize:vertical; background:#0b0d14; border:1px solid #2a3045; color:#fff; border-radius:8px; padding:10px 12px; font:inherit; font-size:0.86rem; font-weight:750; line-height:1.35; text-transform:none; letter-spacing:0; }
        .dp-support-text:focus { outline:none; border-color:${accent}; }
        .dp-up { font-size:0.78rem; font-weight:800; color:#67e8f9; background:rgba(6,182,212,0.1); border:1px solid rgba(6,182,212,0.3); border-radius:8px; padding:6px 11px; cursor:pointer; }
        .dp-clr { font-size:0.72rem; font-weight:800; color:#fca5a5; background:transparent; border:1px solid rgba(239,68,68,0.3); border-radius:6px; padding:5px 8px; cursor:pointer; }
        .dp-hint { color:#5a6280; font-size:0.8rem; font-weight:700; }
        .dp-sel { background:#121520; border:1px solid #2a3045; color:#fff; border-radius:8px; padding:8px 12px; font-weight:800; }
        @media (max-width:760px) { .dp-supports { width:100%; grid-template-columns:1fr; margin-left:0; } }
      `}</style>

      <header className="dp-top">
        <p className="dp-mark">Discussion</p>
        <div className="dp-steps">
          {DISCUSSION_ROUNDS.map((p, i) => (
            <span key={p.id} className={`dp-step${i === idx ? " cur" : i < idx ? " done" : ""}`} onClick={() => goAdjacentPhase(i)}>
              {p.buttonLabel}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="dp-btn" onClick={() => setSetup((v) => !v)}>{setup ? "Done" : "Set up"}</button>
          {onClose && <button className="dp-btn" onClick={() => { stopMusic(); onClose(); }}>Close</button>}
        </div>
      </header>

      <main className="dp-main">
        <div className="dp-phase">{phase.label}</div>
        <div className="dp-sub">{phase.subtitle}</div>

        {phase.spinner ? (
          <>
            <div className="dp-row" style={{ justifyContent: "center" }}>
              <select className="dp-sel" value={shareClass} onChange={(e) => setShareClass(e.target.value)}>
                {classNames.length === 0 && <option value="">No class - add in Spinner</option>}
                {classNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="dp-share-reel"><span className="dp-share-name">{shareName}</span></div>
            <button className="dp-a pri" onClick={spinShare} disabled={shareSpinning || classNames.length === 0}>{shareSpinning ? "Spinning..." : "Pick a sharer"}</button>
          </>
        ) : (
          m ? (
            m.type.startsWith("video") ? (
              <video ref={videoRef} className="dp-media" src={m.url} loop playsInline />
            ) : (
              <img className="dp-media" src={m.url} alt={phase.label} />
            )
          ) : (
            <div className="dp-visual" aria-hidden="true">{phase.visual}</div>
          )
        )}

        <div className="dp-clock">{fmt(secondsLeft)}</div>
        <div className="dp-note">{finished
          ? automaticPacing
            ? idx + 1 < DISCUSSION_ROUNDS.length ? "Time. Moving to the next round." : "Time. Moving to the next state."
            : idx + 1 < DISCUSSION_ROUNDS.length ? "Time. Tap Next round." : "Time. Continue when the class is ready."
          : ""}</div>
        <div className="dp-actions">
          <button className="dp-a pri" onClick={toggleRun}>{running ? "Pause" : secondsLeft <= 0 ? "Restart" : "Start"}</button>
          <button className="dp-a" onClick={reset}>Reset</button>
          <button className="dp-a" onClick={() => adjust(15)}>+15s</button>
          <button className="dp-a" onClick={() => adjust(-15)} disabled={secondsLeft < 15}>-15s</button>
        </div>

        <div className="dp-actions">
          <button className="dp-a" onClick={() => goAdjacentPhase(idx - 1)} disabled={idx === 0}>Back</button>
          <button className="dp-a next" onClick={() => goAdjacentPhase(idx + 1)} disabled={idx + 1 >= DISCUSSION_ROUNDS.length}>Next round</button>
        </div>
      </main>

      {setup && (
        <section className="dp-setup">
          <h3>Set up the discussion - teacher media and student screen media</h3>
          {DISCUSSION_ROUNDS.map((p) => {
            const has = !!media[p.id];
            const support = studentSupports[p.id] ?? { sentenceStems: "", keyVocabulary: "" };
            return (
              <div className="dp-row" key={p.id}>
                <span className="dp-rlabel">{p.buttonLabel}</span>
                <span className="dp-hint">120 seconds</span>
                <label className="dp-up">{has ? "Replace teacher image/video" : "Upload teacher image/video"}
                  <input type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={(e) => uploadMedia(`disc:${p.id}`, e.target.files?.[0])} />
                </label>
                {has && <button className="dp-clr" onClick={() => clearMedia(`disc:${p.id}`)}>Remove teacher media</button>}
                <label className="dp-up">Teacher music
                  <input type="file" accept="audio/*" style={{ display: "none" }} onChange={(e) => uploadMedia(`disc:${p.id}:music`, e.target.files?.[0], true)} />
                </label>
                <button className="dp-clr" onClick={() => clearMedia(`disc:${p.id}:music`, true)}>Clear music</button>
                <input
                  className="dp-url"
                  value={studentMediaUrls[p.id] || ""}
                  onChange={(e) => saveStudentMediaUrl(p.id, e.target.value)}
                  placeholder="Student screen media URL: GIF, image, MP4/WebM, YouTube, Vimeo"
                />
                {p.id === "table" && (
                  <div className="dp-supports">
                    <label className="dp-support-field">
                      Sentence stems
                      <textarea
                        className="dp-support-text"
                        value={support.sentenceStems}
                        onChange={(e) => saveStudentSupport(p.id, "sentenceStems", e.target.value)}
                        placeholder="One stem per line"
                      />
                    </label>
                    <label className="dp-support-field">
                      Key vocabulary
                      <textarea
                        className="dp-support-text"
                        value={support.keyVocabulary}
                        onChange={(e) => saveStudentSupport(p.id, "keyVocabulary", e.target.value)}
                        placeholder="One word per line, or separate with commas"
                      />
                    </label>
                  </div>
                )}
              </div>
            );
          })}
          <p className="dp-hint">Teacher uploads stay on this computer. Student screen media must be a web link students can load, such as a hosted GIF, image, MP4/WebM, YouTube, or Vimeo link.</p>
        </section>
      )}
    </div>
  );
}
