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

export default function AbbieTalk() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [sttSupported, setSttSupported] = useState(false);
  const [interim, setInterim] = useState("");

  const recRef = useRef<SR | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const heardRef = useRef("");
  const sendRef = useRef<(raw: string) => void>(() => {});
  const messagesRef = useRef<Msg[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    setSttSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    fetch("/api/today", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (d?.lesson) setLesson(d.lesson); }).catch(() => {});
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
        speak(data.reply);
      }
    } catch {
      setStatus("Network error reaching Abbie.");
    } finally {
      setThinking(false);
    }
  }, [thinking, lesson, speak]);

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
          <div className="ab-empty">{sttSupported ? "Hold the button and talk to her — or type below. She talks back." : "Type to her below — she talks back. (Voice input needs Chrome or Safari.)"}</div>
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
