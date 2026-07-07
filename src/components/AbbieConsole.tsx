"use client";

// Abbie Console — summon the Abbiliathan 3000 from the teacher control panel.
// Two quiet ways in (no open student mic): tap a MOOD button, or TYPE a line and
// she says it in her own voice. She knows the current classroom state, so her
// line fits the room. Her reply shows as a big projector bubble the class sees,
// and (unless voice is muted) she says it out loud through her real voice.

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import {
  fetchPendingAbbieQuestions,
  markAbbieQuestionAnswered,
  dismissAbbieQuestion,
  type AbbieQuestion,
} from "@/lib/abbieQuestions";

interface Lesson { title?: string; learningIntention?: string; successCriteria?: string }

interface Mood {
  id: string;
  tone: string;
  label: string;
  dir: string;
}

// Each mood is a stage direction handed to Abbie's brain — she phrases the line
// herself, in character, so it never sounds canned. `tone` is a scannable dot
// color, not decoration for its own sake.
const MOODS: Mood[] = [
  { id: "hype", tone: "#ff6b3d", label: "Hype us up", dir: "Pump up the class — we're about to get into it. Bring real energy, keep it short." },
  { id: "goal", tone: "#2dd4bf", label: "Today's goal", dir: "Tell the class what we're working on today and why it's worth their time — use the learning intention. Make it land; don't be dry." },
  { id: "move", tone: "#4d8df6", label: "Move us on", dir: "Wrap up what we're doing and push the class to the next thing. Keep it moving." },
  { id: "settle", tone: "#f5b915", label: "Settle the room", dir: "The room's getting loud. Pull them back and refocus them — deadpan, not a nag." },
  { id: "roast", tone: "#a855f7", label: "Roast dad", dir: "Roast dad for the class about something true — the Red Bulls, the dancing, the slang, the knees. One clean burn." },
  { id: "stuck", tone: "#22c55e", label: "We're stuck", dir: "The class is stuck and getting frustrated. Remind them being confused is step one, and nudge them to just try something." },
];

const LS_VOICE = "bdm-abbie-voice-on";

export default function AbbieConsole({ stateLabel, stateDesc, sessionId }: { stateLabel?: string; stateDesc?: string; sessionId?: string | null }) {
  const supabase = getSupabase();
  const [open, setOpen] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [typed, setTyped] = useState("");
  const [lesson, setLesson] = useState<Lesson | null>(null);

  // Moderated "Ask Abbie" queue — pending student questions, edited in place.
  const [queue, setQueue] = useState<AbbieQuestion[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [answeringId, setAnsweringId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dismissRef = useRef<number | null>(null);
  const broadcastClearRef = useRef<number | null>(null);

  // Pop Abbie's line onto joined student screens (own sessions.abbie column, so
  // it works whatever mode students are in), then clear it a few seconds later
  // so a late-joining device doesn't resurface a stale line.
  const broadcast = useCallback((text: string) => {
    if (!supabase || !sessionId) return;
    const payload = { nonce: `${Date.now()}-${Math.round(Math.random() * 1e6)}`, text, at: new Date().toISOString() };
    void supabase.from("sessions").update({ abbie: payload }).eq("id", sessionId);
    if (broadcastClearRef.current) window.clearTimeout(broadcastClearRef.current);
    broadcastClearRef.current = window.setTimeout(() => {
      void supabase.from("sessions").update({ abbie: null }).eq("id", sessionId);
    }, 15000);
  }, [supabase, sessionId]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(LS_VOICE);
      if (v === "0") setVoiceOn(false);
    } catch { /* ignore */ }
    fetch("/api/today", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.lesson) setLesson(d.lesson); })
      .catch(() => { /* no lesson today is fine */ });
  }, []);

  // Poll the moderated "Ask Abbie" queue for this session's pending questions.
  useEffect(() => {
    if (!supabase || !sessionId) { setQueue([]); return; }
    let stopped = false;
    const load = async () => {
      const rows = await fetchPendingAbbieQuestions(sessionId);
      if (!stopped) setQueue(rows);
    };
    void load();
    const interval = window.setInterval(load, 2500);
    const channel = supabase
      .channel(`abbie-q-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "abbie_questions", filter: `session_id=eq.${sessionId}` },
        () => { void load(); },
      )
      .subscribe();
    return () => {
      stopped = true;
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [supabase, sessionId]);

  const setVoice = useCallback((on: boolean) => {
    setVoiceOn(on);
    try { localStorage.setItem(LS_VOICE, on ? "1" : "0"); } catch { /* ignore */ }
    if (!on) { try { audioRef.current?.pause(); window.speechSynthesis?.cancel(); } catch { /* ignore */ } }
  }, []);

  // Robotic browser fallback if the ElevenLabs voice route isn't configured.
  const speakFallback = useCallback((text: string) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02; u.pitch = 0.9;
      synth.speak(u);
    } catch { /* ignore */ }
  }, []);

  const speak = useCallback(async (text: string) => {
    try {
      const res = await fetch("/api/abbie/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) { speakFallback(text); return; }
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
      speakFallback(text);
    }
  }, [speakFallback]);

  const contextString = useCallback(() => {
    if (!stateLabel) return "";
    return stateDesc ? `Classroom state: "${stateLabel}" — ${stateDesc}` : `Classroom state: "${stateLabel}"`;
  }, [stateLabel, stateDesc]);

  const showLine = useCallback((text: string) => {
    setLine(text);
    // Collapse the control panel so the class sees an unobstructed speech bubble
    // on the projector — the mood grid is the teacher's remote, not for the room.
    setOpen(false);
    if (dismissRef.current) window.clearTimeout(dismissRef.current);
    // Leave the bubble up long enough to read/hear, then clear it on its own.
    dismissRef.current = window.setTimeout(() => setLine(null), 16000);
  }, []);

  const summon = useCallback(async (direction: string): Promise<string | null> => {
    if (thinking) return null;
    setThinking(true);
    setError(null);
    try {
      const res = await fetch("/api/abbie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: `[Stage direction — you are speaking out loud to the whole class right now. ${direction}]` }],
          lesson,
          context: contextString(),
        }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return null; }
      if (data.reply) {
        showLine(data.reply);
        broadcast(data.reply);
        if (voiceOn) void speak(data.reply);
        return data.reply as string;
      }
      return null;
    } catch {
      setError("Couldn't reach Abbie's brain — check the connection.");
      return null;
    } finally {
      setThinking(false);
    }
  }, [thinking, lesson, contextString, showLine, broadcast, voiceOn, speak]);

  const sendTyped = useCallback(() => {
    const t = typed.trim();
    if (!t) return;
    setTyped("");
    void summon(`Say this to the class, in your own voice: ${t}`);
  }, [typed, summon]);

  // Approve a queued student question: Abbie answers it for the class, then the
  // row is marked answered. Uses the edited text if the teacher tweaked it.
  const answerQuestion = useCallback(async (q: AbbieQuestion) => {
    if (thinking) return;
    const text = (edits[q.id] ?? q.question).trim();
    if (!text) return;
    setAnsweringId(q.id);
    const who = q.display_name ? `A student named ${q.display_name}` : "A student";
    const reply = await summon(`${who} asked, during class: "${text}". Answer them out loud for the whole room, in your voice. Keep it short; if it's a math question, actually help them think it through rather than just giving the answer.`);
    if (reply) await markAbbieQuestionAnswered(q.id, reply);
    setQueue((qs) => qs.filter((row) => row.id !== q.id));
    setEdits((e) => { const n = { ...e }; delete n[q.id]; return n; });
    setAnsweringId(null);
  }, [thinking, edits, summon]);

  const dismiss = useCallback(async (id: string) => {
    setQueue((qs) => qs.filter((row) => row.id !== id));
    await dismissAbbieQuestion(id);
  }, []);

  return (
    <>
      <style>{`
        .abc-fab { position:fixed; right:18px; bottom:18px; z-index:70; display:flex; align-items:center; gap:9px; border:1px solid #1f4d45; border-radius:999px; background:#0d1f1b; color:#5eead4; padding:11px 16px 11px 12px; font:inherit; font-weight:900; font-size:0.9rem; cursor:pointer; box-shadow:0 10px 30px rgba(0,0,0,0.45); }
        .abc-fab:hover { border-color:#2dd4bf; color:#a7f3d0; }
        .abc-fab img { width:26px; height:26px; object-fit:contain; }
        .abc-fab .dotlive { width:8px; height:8px; border-radius:50%; background:#f5b915; box-shadow:0 0 0 0 rgba(245,185,21,0.6); animation:abcPulse 1.6s ease-in-out infinite; }
        @keyframes abcPulse { 0%,100%{opacity:1;} 50%{opacity:0.3;} }

        .abc-panel { position:fixed; right:18px; bottom:18px; z-index:71; width:min(94vw,420px); border:1px solid #23413b; border-radius:18px; background:#0c1512; box-shadow:0 24px 60px rgba(0,0,0,0.6); overflow:hidden; }
        .abc-head { display:flex; align-items:center; gap:10px; padding:14px 16px; border-bottom:1px solid #17302b; background:#0d1f1b; }
        .abc-mark { width:34px; height:34px; border-radius:50%; background:#14241f; display:grid; place-items:center; overflow:hidden; flex:none; }
        .abc-mark img { width:30px; height:30px; object-fit:contain; }
        .abc-title { font-weight:900; color:#e8fff9; font-size:0.98rem; line-height:1.1; }
        .abc-sub { font-size:0.72rem; color:#5f8a80; font-weight:700; }
        .abc-x { margin-left:auto; background:transparent; border:1px solid #23413b; color:#7fb3a8; border-radius:8px; width:30px; height:30px; cursor:pointer; font-weight:900; }
        .abc-x:hover { color:#fff; border-color:#2dd4bf; }

        .abc-body { padding:14px 16px; display:grid; gap:13px; }
        .abc-ctx { font-size:0.74rem; font-weight:800; color:#6f9a90; display:flex; align-items:center; gap:7px; }
        .abc-ctx b { color:#a7f3d0; }
        .abc-moods { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .abc-mood { display:flex; align-items:center; gap:9px; border:1px solid #23413b; border-radius:11px; background:#101d19; color:#d6f5ee; padding:11px 12px; font:inherit; font-weight:850; font-size:0.9rem; cursor:pointer; text-align:left; }
        .abc-mood:hover:not(:disabled) { border-color:#2dd4bf; background:#12241f; }
        .abc-mood:disabled { opacity:0.45; cursor:default; }
        .abc-dot { width:10px; height:10px; border-radius:50%; flex:none; }

        .abc-typerow { display:flex; gap:8px; }
        .abc-in { flex:1; min-width:0; background:#0a1310; border:1px solid #23413b; color:#eafff9; border-radius:11px; padding:11px 13px; font:inherit; font-weight:700; font-size:0.92rem; }
        .abc-in:focus { outline:none; border-color:#2dd4bf; }
        .abc-say { flex:none; border:1px solid #2dd4bf; background:#0f3630; color:#5eead4; border-radius:11px; padding:0 16px; font:inherit; font-weight:900; cursor:pointer; }
        .abc-say:disabled { opacity:0.45; cursor:default; }

        .abc-foot { display:flex; align-items:center; justify-content:space-between; gap:10px; padding-top:2px; }
        .abc-voice { display:flex; align-items:center; gap:8px; font-size:0.8rem; font-weight:800; color:#8fb8af; cursor:pointer; user-select:none; }
        .abc-toggle { width:38px; height:22px; border-radius:999px; border:1px solid #23413b; background:#0a1310; position:relative; transition:background 140ms; flex:none; }
        .abc-toggle.on { background:#0f3630; border-color:#2dd4bf; }
        .abc-knob { position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:#5f8a80; transition:transform 140ms, background 140ms; }
        .abc-toggle.on .abc-knob { transform:translateX(16px); background:#5eead4; }
        .abc-err { color:#fca5a5; font-size:0.78rem; font-weight:800; }

        .abc-badge { min-width:20px; height:20px; padding:0 5px; margin-left:2px; border-radius:999px; background:#f95335; color:#fff; font-size:0.72rem; font-weight:900; display:inline-flex; align-items:center; justify-content:center; }

        /* Moderated "Ask Abbie" queue */
        .abc-queue { display:grid; gap:9px; border-top:1px solid #17302b; padding-top:12px; }
        .abc-queue-title { font-size:0.7rem; font-weight:900; letter-spacing:0.09em; text-transform:uppercase; color:#8fb8af; }
        .abc-qitem { display:grid; gap:7px; border:1px solid #23413b; border-radius:12px; background:#101d19; padding:11px 12px; }
        .abc-qwho { font-size:0.74rem; font-weight:800; color:#6f9a90; }
        .abc-qtext { width:100%; box-sizing:border-box; resize:vertical; background:#0a1310; border:1px solid #23413b; color:#eafff9; border-radius:9px; padding:8px 10px; font:inherit; font-weight:600; font-size:0.9rem; line-height:1.35; }
        .abc-qtext:focus { outline:none; border-color:#2dd4bf; }
        .abc-qactions { display:flex; gap:8px; }
        .abc-qapprove { flex:1; border:1px solid #2dd4bf; background:#0f3630; color:#5eead4; border-radius:9px; padding:9px 10px; font:inherit; font-weight:900; font-size:0.84rem; cursor:pointer; }
        .abc-qapprove:disabled { opacity:0.5; cursor:default; }
        .abc-qdismiss { border:1px solid #3a2420; background:transparent; color:#e79a8f; border-radius:9px; padding:9px 12px; font:inherit; font-weight:800; font-size:0.84rem; cursor:pointer; }
        .abc-qdismiss:hover:not(:disabled) { border-color:#f95335; color:#fca5a5; }
        .abc-qdismiss:disabled { opacity:0.5; cursor:default; }

        /* Projector bubble — what the class sees when Abbie speaks */
        .abc-stage { position:fixed; left:50%; bottom:26px; transform:translateX(-50%); z-index:72; width:min(92vw,860px); }
        .abc-bubble { position:relative; display:flex; gap:16px; align-items:flex-start; background:#0d1f1b; border:1px solid #1f4d45; border-left:6px solid #2dd4bf; border-radius:18px; padding:20px 24px; box-shadow:0 20px 60px rgba(0,0,0,0.55); animation:abcIn 0.32s cubic-bezier(0.2,1.3,0.4,1); }
        @keyframes abcIn { from{opacity:0; transform:translateY(14px);} to{opacity:1; transform:none;} }
        .abc-bavatar { width:56px; height:56px; border-radius:50%; background:#14241f; display:grid; place-items:center; overflow:hidden; flex:none; }
        .abc-bavatar img { width:50px; height:50px; object-fit:contain; }
        .abc-bname { font-size:0.72rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; color:#5eead4; margin-bottom:3px; }
        .abc-btext { color:#f3fffb; font-size:clamp(1.2rem,2.6vw,1.7rem); font-weight:800; line-height:1.3; }
        .abc-bclose { position:absolute; top:10px; right:12px; background:transparent; border:none; color:#5f8a80; font-size:1.1rem; font-weight:900; cursor:pointer; line-height:1; }
        .abc-bclose:hover { color:#fff; }
        .abc-thinking { color:#5eead4; font-weight:800; font-size:0.86rem; padding:2px 2px 0; }
      `}</style>

      {!open && (
        <button className="abc-fab" onClick={() => setOpen(true)} title="Summon the Abbiliathan 3000">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/big-dog-mark.png" alt="" />
          <span className="dotlive" />
          Abbie
          {queue.length > 0 && <span className="abc-badge" aria-label={`${queue.length} pending questions`}>{queue.length}</span>}
        </button>
      )}

      {open && (
        <div className="abc-panel" role="dialog" aria-label="Summon Abbie">
          <div className="abc-head">
            <div className="abc-mark">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/big-dog-mark.png" alt="" /></div>
            <div>
              <div className="abc-title">Abbiliathan 3000</div>
              <div className="abc-sub">tap a mood or tell her what to say</div>
            </div>
            <button className="abc-x" onClick={() => setOpen(false)} aria-label="Close">×</button>
          </div>

          <div className="abc-body">
            {stateLabel && <div className="abc-ctx">she knows you&apos;re in <b>{stateLabel}</b></div>}

            <div className="abc-moods">
              {MOODS.map((m) => (
                <button key={m.id} className="abc-mood" disabled={thinking} onClick={() => summon(m.dir)}>
                  <span className="abc-dot" style={{ background: m.tone }} />{m.label}
                </button>
              ))}
            </div>

            <div className="abc-typerow">
              <input
                className="abc-in"
                value={typed}
                placeholder="Tell Abbie what to say…"
                disabled={thinking}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendTyped(); }}
              />
              <button className="abc-say" disabled={thinking || !typed.trim()} onClick={sendTyped}>Say it</button>
            </div>

            {thinking && <div className="abc-thinking">…Abbie&apos;s thinking</div>}
            {error && <div className="abc-err">{error}</div>}

            {queue.length > 0 && (
              <div className="abc-queue">
                <div className="abc-queue-title">Student questions ({queue.length})</div>
                {queue.map((q) => (
                  <div key={q.id} className="abc-qitem">
                    <div className="abc-qwho">{q.display_name || "A student"} asked</div>
                    <textarea
                      className="abc-qtext"
                      value={edits[q.id] ?? q.question}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      rows={2}
                    />
                    <div className="abc-qactions">
                      <button className="abc-qapprove" disabled={thinking} onClick={() => answerQuestion(q)}>
                        {answeringId === q.id ? "Answering…" : "Approve — Abbie answers"}
                      </button>
                      <button className="abc-qdismiss" disabled={answeringId === q.id} onClick={() => dismiss(q.id)}>Dismiss</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="abc-foot">
              <label className="abc-voice" onClick={() => setVoice(!voiceOn)}>
                <span className={`abc-toggle${voiceOn ? " on" : ""}`}><span className="abc-knob" /></span>
                {voiceOn ? "Voice on" : "Text only"}
              </label>
            </div>
          </div>
        </div>
      )}

      {line && (
        <div className="abc-stage" aria-live="polite">
          <div className="abc-bubble">
            <button className="abc-bclose" onClick={() => setLine(null)} aria-label="Dismiss">×</button>
            <div className="abc-bavatar">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/big-dog-mark.png" alt="" /></div>
            <div>
              <div className="abc-bname">Abbie</div>
              <div className="abc-btext">{line}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
