"use client";

// Student "Ask Abbie" affordance. Mounted once in the root layout (next to
// AbbieStudentBubble). For a device that joined a class session, a small button
// lets a student type a question for Abbie. It lands in the teacher's approval
// queue - nobody triggers Abbie by yelling; the teacher is always the gate.
// One outstanding question per student. Silent no-op if not joined.

import { useEffect, useRef, useState } from "react";
import {
  getStoredStudentSession,
  getStoredStudentSessionId,
  getStoredTeacherSessionId,
  isStudentTab,
} from "@/lib/liveClassFlow";
import { submitAbbieQuestion } from "@/lib/abbieQuestions";

export default function AbbieStudentAsk() {
  const [joined, setJoined] = useState(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const msgTimer = useRef<number | null>(null);

  useEffect(() => {
    // A teacher device shouldn't get the student ask button (unless this tab
    // explicitly joined as a student, for side-by-side testing).
    if (getStoredTeacherSessionId() && !isStudentTab()) return;
    setJoined(Boolean(getStoredStudentSessionId()));
  }, []);

  if (!joined) return null;

  const flash = (m: string) => {
    setMsg(m);
    if (msgTimer.current) window.clearTimeout(msgTimer.current);
    msgTimer.current = window.setTimeout(() => setMsg(null), 3200);
  };

  const send = async () => {
    const sessionId = getStoredStudentSessionId();
    const student = getStoredStudentSession();
    if (!sessionId || sending) return;
    setSending(true);
    const res = await submitAbbieQuestion(
      sessionId,
      { studentId: student?.studentId, name: student?.name },
      text,
    );
    setSending(false);
    if (res.ok) {
      setText("");
      setOpen(false);
      flash("Sent to Abbie - she'll get to it.");
    } else if (res.reason === "already-pending") {
      flash("You've already got a question in line.");
    } else if (res.reason === "empty") {
      flash("Type a question first.");
    } else {
      flash("Couldn't send that - try again.");
    }
  };

  return (
    <>
      <style>{`
        .asa-fab { position:fixed; left:18px; bottom:18px; z-index:78; display:flex; align-items:center; gap:8px; border:1px solid #1f4d45; border-radius:999px; background:#0d1f1b; color:#5eead4; padding:11px 16px 11px 12px; font:inherit; font-weight:900; font-size:0.9rem; cursor:pointer; box-shadow:0 10px 30px rgba(0,0,0,0.4); }
        .asa-fab:hover { border-color:#2dd4bf; color:#a7f3d0; }
        .asa-fab img { width:24px; height:24px; object-fit:contain; }

        .asa-panel { position:fixed; left:18px; bottom:18px; z-index:79; width:min(92vw,360px); border:1px solid #23413b; border-radius:16px; background:#0c1512; box-shadow:0 24px 60px rgba(0,0,0,0.55); overflow:hidden; }
        .asa-head { display:flex; align-items:center; gap:9px; padding:12px 14px; border-bottom:1px solid #17302b; background:#0d1f1b; }
        .asa-mark { width:30px; height:30px; border-radius:50%; background:#14241f; display:grid; place-items:center; overflow:hidden; flex:none; }
        .asa-mark img { width:26px; height:26px; object-fit:contain; }
        .asa-title { font-weight:900; color:#e8fff9; font-size:0.92rem; }
        .asa-sub { font-size:0.7rem; color:#5f8a80; font-weight:700; }
        .asa-x { margin-left:auto; background:transparent; border:1px solid #23413b; color:#7fb3a8; border-radius:8px; width:28px; height:28px; cursor:pointer; font-weight:900; }
        .asa-x:hover { color:#fff; border-color:#2dd4bf; }
        .asa-body { padding:12px 14px; display:grid; gap:10px; }
        .asa-in { width:100%; box-sizing:border-box; min-height:84px; resize:vertical; background:#0a1310; border:1px solid #23413b; color:#eafff9; border-radius:11px; padding:11px 13px; font:inherit; font-weight:600; font-size:0.95rem; }
        .asa-in:focus { outline:none; border-color:#2dd4bf; }
        .asa-send { border:1px solid #2dd4bf; background:#0f3630; color:#5eead4; border-radius:11px; padding:11px 14px; font:inherit; font-weight:900; cursor:pointer; }
        .asa-send:disabled { opacity:0.45; cursor:default; }
        .asa-note { font-size:0.74rem; color:#5f8a80; font-weight:700; }

        .asa-toast { position:fixed; left:18px; bottom:74px; z-index:79; max-width:min(88vw,340px); background:#0d1f1b; border:1px solid #2dd4bf; color:#d6f5ee; border-radius:12px; padding:10px 14px; font-weight:800; font-size:0.86rem; box-shadow:0 12px 30px rgba(0,0,0,0.45); }
      `}</style>

      {!open && (
        <button className="asa-fab" onClick={() => { setOpen(true); setMsg(null); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/big-dog-mark.png" alt="" />
          Ask Abbie
        </button>
      )}

      {open && (
        <div className="asa-panel" role="dialog" aria-label="Ask Abbie">
          <div className="asa-head">
            <div className="asa-mark">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/big-dog-mark.png" alt="" /></div>
            <div>
              <div className="asa-title">Ask Abbie</div>
              <div className="asa-sub">your teacher picks what she answers</div>
            </div>
            <button className="asa-x" onClick={() => setOpen(false)} aria-label="Close">×</button>
          </div>
          <div className="asa-body">
            <textarea
              className="asa-in"
              value={text}
              placeholder="What do you want to ask Abbie?"
              maxLength={280}
              disabled={sending}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(); }}
            />
            <button className="asa-send" disabled={sending || !text.trim()} onClick={send}>
              {sending ? "Sending…" : "Send to Abbie"}
            </button>
            <div className="asa-note">She won't see it until your teacher says so.</div>
          </div>
        </div>
      )}

      {msg && <div className="asa-toast" role="status">{msg}</div>}
    </>
  );
}
