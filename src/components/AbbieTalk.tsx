"use client";

// Proof-of-concept: talk to Abbiliathan. Push-to-talk (Web Speech STT) → Claude
// (/api/abbie, in character) → browser speech synthesis. Text box as a fallback.

import { useCallback, useEffect, useRef, useState } from "react";

interface Msg { role: "user" | "assistant"; content: string }
interface Lesson { title?: string; learningIntention?: string; successCriteria?: string }

// Minimal shape for the (un-typed) Web Speech API.
interface SRResult { readonly isFinal: boolean; readonly length: number; readonly [i: number]: { readonly transcript: string } }
interface SREvent { readonly resultIndex: number; readonly results: ArrayLike<SRResult> }
interface SR { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: SREvent) => void) | null; onend: (() => void) | null; onerror: (() => void) | null }

// Default physical push-to-talk key (map a Stream Deck button's Hotkey to it).
// Override live with ?ptt=<key> in the URL — e.g. ?ptt=F13 — no redeploy needed.
// Add ?debug=1 to see exactly what key the page receives when you press it.
const TRIGGER_KEY = "F8";

export default function AbbieTalk() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [sttSupported, setSttSupported] = useState(false);
  const [interim, setInterim] = useState("");
  const [triggerKey, setTriggerKey] = useState(TRIGGER_KEY);
  const [debug, setDebug] = useState(false);
  const [lastKey, setLastKey] = useState("");

  const recRef = useRef<SR | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const heardRef = useRef("");
  const sendRef = useRef<(raw: string) => void>(() => {});
  const messagesRef = useRef<Msg[]>([]);
  const listeningRef = useRef(false);
  const thinkingRef = useRef(false);
  const startedPressRef = useRef(false);
  const triggerKeyRef = useRef(TRIGGER_KEY);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { listeningRef.current = listening; }, [listening]);
  useEffect(() => { thinkingRef.current = thinking; }, [thinking]);
  useEffect(() => { triggerKeyRef.current = triggerKey; }, [triggerKey]);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    setSttSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    fetch("/api/today", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (d?.lesson) setLesson(d.lesson); }).catch(() => {});
  }, []);

  // Push-to-talk config from the URL: ?ptt=F13 changes + remembers the trigger key;
  // ?debug=1 shows a live readout of every key the page receives — so you can see
  // exactly what your Stream Deck button is sending.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const ptt = q.get("ptt");
      if (ptt) {
        setTriggerKey(ptt);
        try { localStorage.setItem("bdm-ptt-key", ptt); } catch { /* ignore */ }
      } else {
        let saved: string | null = null;
        try { saved = localStorage.getItem("bdm-ptt-key"); } catch { /* ignore */ }
        if (saved) setTriggerKey(saved);
      }
      setDebug(q.get("debug") === "1");
    } catch { /* ignore */ }
  }, []);

  // Pre-warm the microphone once so push-to-talk engages instantly instead of
  // cold-starting the audio device on every press. Released on unmount.
  useEffect(() => {
    if (!sttSupported) return;
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia?.({ audio: true })
      .then((s) => { if (cancelled) s.getTracks().forEach((t) => t.stop()); else micStreamRef.current = s; })
      .catch(() => { /* fall back to per-press mic acquisition */ });
    return () => {
      cancelled = true;
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    };
  }, [sttSupported]);

  const speak = useCallback((line: string) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(line);
      u.rate = 1.02;
      u.pitch = 0.9;
      synth.speak(u);
    } catch { /* ignore */ }
  }, []);

  // Abbie's real voice: ElevenLabs (server-side, key stays on Vercel). Falls back
  // to the browser's robotic speechSynthesis if the voice route isn't configured.
  const speakVoice = useCallback(async (line: string) => {
    try {
      const res = await fetch("/api/abbie/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: line }),
      });
      if (!res.ok) { speak(line); return; }
      const buf = await res.arrayBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
      try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
      let audio = audioRef.current;
      if (!audio) { audio = new Audio(); audioRef.current = audio; }
      audio.pause();
      audio.src = url;
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch {
      speak(line); // autoplay blocked or network error → robotic fallback
    }
  }, [speak]);

  const send = useCallback(async (raw: string) => {
    const content = raw.trim();
    if (!content || thinking) return;
    setStatus(null);
    const next = [...messagesRef.current, { role: "user" as const, content }];
    setMessages(next);
    setText("");
    setThinking(true);
    try {
      const res = await fetch("/api/abbie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, lesson }),
      });
      const data = await res.json();
      if (data.error) { setStatus(data.error); }
      else if (data.reply) {
        setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
        void speakVoice(data.reply);
      }
    } catch {
      setStatus("Network error reaching Abbie.");
    } finally {
      setThinking(false);
    }
  }, [thinking, lesson, speakVoice]);

  // Keep the persistent recognizer's onend handler pointed at the latest send().
  useEffect(() => { sendRef.current = send; }, [send]);

  // Build the recognizer once and reuse it — recreating it on every press adds
  // noticeable start-up lag. interimResults gives live "it's hearing me" feedback.
  const ensureRecognizer = useCallback((): SR | null => {
    if (recRef.current) return recRef.current;
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i += 1) t += e.results[i][0]?.transcript || "";
      heardRef.current = t.trim();
      setInterim(t.trim());
    };
    rec.onerror = () => { setStatus("Didn't catch that — try again."); };
    rec.onend = () => {
      setListening(false);
      const said = heardRef.current.trim();
      setInterim("");
      if (said) sendRef.current(said);
    };
    recRef.current = rec;
    return rec;
  }, []);

  const startListening = useCallback(() => {
    if (listening || thinking) return;
    const rec = ensureRecognizer();
    if (!rec) return;
    heardRef.current = "";
    setInterim("");
    setListening(true);
    setStatus(null);
    try { rec.start(); } catch { /* already listening — ignore */ }
  }, [listening, thinking, ensureRecognizer]);

  const stopListening = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* ignore */ }
  }, []);

  // Physical push-to-talk (e.g. a Stream Deck key mapped to TRIGGER_KEY). Hold the
  // key to talk and release to send, OR tap once to start and tap again to send —
  // whichever your Stream Deck sends. Only fires while this browser tab is focused.
  useEffect(() => {
    if (!sttSupported) return;
    let downAt = 0;
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
    };
    const onDown = (e: KeyboardEvent) => {
      if (debug) setLastKey(`${e.key}  ·  code=${e.code}${e.ctrlKey ? " +ctrl" : ""}${e.altKey ? " +alt" : ""}${e.shiftKey ? " +shift" : ""}${e.metaKey ? " +cmd" : ""}`);
      if (e.key !== triggerKeyRef.current || e.repeat || isTyping()) return;
      e.preventDefault();
      downAt = Date.now();
      if (!listeningRef.current && !thinkingRef.current) { startedPressRef.current = true; startListening(); }
      else { startedPressRef.current = false; }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key !== triggerKeyRef.current) return;
      e.preventDefault();
      const held = Date.now() - downAt;
      if (held >= 350) { if (listeningRef.current) stopListening(); }            // hold-to-talk → release sends
      else if (!startedPressRef.current && listeningRef.current) stopListening(); // tap-again → send
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, [sttSupported, startListening, stopListening, debug]);

  return (
    <div className="ab-wrap">
      <style>{`
        .ab-wrap { display:flex; flex-direction:column; height:100%; gap:14px; }
        .ab-log { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:12px; padding:4px; }
        .ab-empty { margin:auto; color:#8a93ad; font-size:1.05rem; text-align:center; max-width:30ch; line-height:1.5; }
        .ab-row { display:flex; gap:10px; max-width:84%; }
        .ab-row.user { align-self:flex-end; flex-direction:row-reverse; }
        .ab-av { width:34px; height:34px; border-radius:50%; flex:none; display:grid; place-items:center; overflow:hidden; }
        .ab-av.abbie { background:#14241f; }
        .ab-av.abbie img { width:30px; height:30px; object-fit:contain; }
        .ab-av.me { background:#1b2233; color:#9fb0c8; font-weight:800; font-size:0.85rem; }
        .ab-bub { padding:11px 15px; border-radius:14px; font-size:1.02rem; line-height:1.4; }
        .ab-row.abbie .ab-bub { background:#141a27; color:#e8ecf5; }
        .ab-row.user .ab-bub { background:#1d3a37; color:#d8f5ee; }
        .ab-status { color:#f5b915; font-size:0.85rem; font-weight:600; min-height:18px; text-align:center; }
        .ab-controls { display:flex; gap:10px; align-items:center; }
        .ab-talk { flex:none; min-height:56px; padding:0 22px; border-radius:14px; border:none; font-weight:800; font-size:1rem; cursor:pointer; touch-action:none; user-select:none; background:#5eead4; color:#06231f; }
        .ab-talk.on { background:#ff4d4d; color:#fff; }
        .ab-talk:disabled { opacity:0.5; cursor:default; }
        .ab-in { flex:1; min-height:56px; border-radius:14px; border:1px solid #2a3550; background:#0f1420; color:#e8ecf5; padding:0 16px; font:inherit; font-size:1rem; }
        .ab-send { flex:none; min-height:56px; padding:0 20px; border-radius:14px; border:1px solid #2a3550; background:#141a27; color:#e8ecf5; font-weight:800; cursor:pointer; }
        .ab-send:disabled { opacity:0.5; cursor:default; }
      `}</style>

      <div className="ab-log">
        {messages.length === 0 ? (
          <div className="ab-empty">{sttSupported ? "Hold the button — or your Stream Deck key — and talk. Or type below. She talks back out loud." : "Type to her below — she talks back. (Voice input needs Chrome or Safari.)"}</div>
        ) : messages.map((m, i) => (
          <div className={`ab-row ${m.role === "user" ? "user" : "abbie"}`} key={i}>
            <div className={`ab-av ${m.role === "user" ? "me" : "abbie"}`}>
              {m.role === "user" ? "You" : (/* eslint-disable-next-line @next/next/no-img-element */ <img src="/big-dog-mark.png" alt="" />)}
            </div>
            <div className="ab-bub">{m.content}</div>
          </div>
        ))}
        {thinking && (
          <div className="ab-row abbie">
            <div className="ab-av abbie">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/big-dog-mark.png" alt="" /></div>
            <div className="ab-bub" style={{ color: "#8a93ad" }}>…thinking</div>
          </div>
        )}
      </div>

      {debug && (
        <div style={{ fontSize: "0.8rem", color: "#9fb0c8", background: "#141a27", border: "1px solid #2a3550", borderRadius: 10, padding: "8px 12px", textAlign: "center", lineHeight: 1.6 }}>
          PTT debug · trigger key = <b style={{ color: "#5eead4" }}>{triggerKey}</b><br />
          last key received = <b style={{ color: "#f5b915" }}>{lastKey || "— press your Stream Deck button —"}</b>
        </div>
      )}
      <div className="ab-status">{listening ? (interim ? `“${interim}”` : "Listening — release to send.") : status}</div>

      <div className="ab-controls">
        {sttSupported && (
          <button
            className={`ab-talk${listening ? " on" : ""}`}
            disabled={thinking}
            onPointerDown={(e) => { e.preventDefault(); startListening(); }}
            onPointerUp={(e) => { e.preventDefault(); stopListening(); }}
            onPointerLeave={() => { if (listening) stopListening(); }}
          >
            {listening ? "Listening…" : "Hold to talk"}
          </button>
        )}
        <input
          className="ab-in"
          value={text}
          placeholder="…or type to Abbie"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void send(text); }}
        />
        <button className="ab-send" disabled={thinking || !text.trim()} onClick={() => void send(text)}>Send</button>
      </div>
    </div>
  );
}
