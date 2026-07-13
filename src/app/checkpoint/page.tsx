"use client";

// Student SBAC checkpoint surface. When the teacher launches a checkpoint item,
// joined students are sent here; they answer the SBAC-modeled question, it's
// auto-graded against the key, and (if wrong) matched to a known misconception.
// Polls the session for the current open checkpoint.

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { getStoredStudentSession, type StoredStudentSession } from "@/lib/liveClassFlow";
import { gradeCheckpoint } from "@/lib/sbacCheckpoints";
import { getOpenCheckpoint, submitCheckpointResult, type CheckpointRun } from "@/lib/checkpoints";
import { SECURE_STUDENT_DATA, studentApiRequest } from "@/lib/studentApi";

type View = "loading" | "needjoin" | "waiting" | "answering" | "submitted";

function norm(s: string) {
  return s.trim().replace(/−/g, "-").replace(/\s+/g, "").replace(/%$/, "").toLowerCase();
}

export default function CheckpointPage() {
  const supabase = getSupabase();
  const [session, setSession] = useState<StoredStudentSession | null>(null);
  const [view, setView] = useState<View>("loading");
  const [run, setRun] = useState<CheckpointRun | null>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ correct: boolean; answer: string } | null>(null);
  const submittedRef = useRef<string | null>(null);

  useEffect(() => {
    const s = getStoredStudentSession();
    setSession(s);
    setView(s ? "waiting" : "needjoin");
  }, []);

  useEffect(() => {
    if (!supabase || !session) return;
    let stop = false;
    const tick = async () => {
      const cp = SECURE_STUDENT_DATA
        ? (await studentApiRequest<{ checkpoint: CheckpointRun | null }>(
          `/api/student/checkpoint?sessionId=${encodeURIComponent(session.sessionId)}`,
        )).checkpoint
        : await getOpenCheckpoint(supabase, session.sessionId);
      if (stop) return;
      if (!cp) {
        if (submittedRef.current) return;
        setRun(null);
        setView((v) => (v === "answering" ? "waiting" : v === "submitted" ? v : "waiting"));
        return;
      }
      if (cp.id !== run?.id && cp.id !== submittedRef.current) {
        setRun(cp); setText(""); setResult(null); setView("answering");
      }
    };
    void tick();
    const id = setInterval(tick, 3000);
    return () => { stop = true; clearInterval(id); };
  }, [supabase, session, run?.id]);

  const submit = useCallback(async () => {
    if (!supabase || !session || !run || !text.trim()) return;
    submittedRef.current = run.id;
    if (SECURE_STUDENT_DATA) {
      await studentApiRequest("/api/student/checkpoint", {
        method: "POST",
        body: JSON.stringify({ runId: run.id, sessionId: session.sessionId, answer: text.trim() }),
      });
      setResult({ correct: true, answer: "" });
      setView("submitted");
      return;
    }
    const isCorrect = gradeCheckpoint(text, run.correct_answer);
    let misconception: string | null = null;
    if (!isCorrect && Array.isArray(run.misses)) {
      const hit = run.misses.find((m) => m.answer && norm(m.answer) === norm(text));
      misconception = hit ? hit.misconception : null;
    }
    await submitCheckpointResult(supabase, {
      runId: run.id,
      sessionId: session.sessionId,
      studentId: session.studentId || null,
      displayName: session.name || null,
      answer: text.trim(),
      isCorrect,
      misconception,
      ccss: run.ccss,
    });
    setResult({ correct: isCorrect, answer: run.correct_answer });
    setView("submitted");
  }, [supabase, session, run, text]);

  return (
    <main className="cp">
      <style>{styles}</style>

      {view === "loading" && <div className="cp-mid"><p className="cp-soft">Loading…</p></div>}

      {view === "needjoin" && (
        <div className="cp-mid cp-card">
          <div className="cp-mark">Checkpoint</div>
          <h1 className="cp-h">Join your class first</h1>
          <p className="cp-soft">Checkpoints are part of a live class. Enter your teacher&apos;s code to join.</p>
          <a className="cp-btn" href="/">Enter class code</a>
        </div>
      )}

      {view === "waiting" && (
        <div className="cp-mid cp-card">
          <div className="cp-mark">Checkpoint</div>
          <h1 className="cp-h">Checkpoint</h1>
          <p className="cp-soft">Waiting for your teacher to start the checkpoint…</p>
        </div>
      )}

      {view === "answering" && run && (
        <div className="cp-mid">
          <div className="cp-card cp-q">
            <div className="cp-tag">Checkpoint{run.ccss ? ` · ${run.ccss}` : ""}</div>
            <h1 className="cp-prompt">{run.prompt}</h1>
            <input className="cp-input" value={text} placeholder="Type your answer" autoFocus
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} />
            <button className="cp-submit" onClick={() => void submit()} disabled={!text.trim()}>Turn in</button>
          </div>
        </div>
      )}

      {view === "submitted" && (
        <div className="cp-mid cp-card">
          <div className="cp-mark">Saved</div>
          <h1 className="cp-h">Turned in!</h1>
          <p className="cp-soft">Thanks{session ? `, ${session.name.split(" ")[0]}` : ""} — your answer was recorded.</p>
        </div>
      )}
    </main>
  );
}

const styles = `
  .cp { min-height:100vh; background:var(--bdb-ground); font-family:var(--bdb-font); color:var(--bdb-ink);
    display:flex; flex-direction:column; padding:clamp(14px,3vw,30px) 16px; box-sizing:border-box; }
  .cp-mid { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; text-align:center; }
  .cp-card { background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r-lg);
    box-shadow:var(--bdb-shadow); padding:30px 26px; max-width:480px; width:100%; }
  .cp-mark { color:var(--bdb-teal); font-size:0.85rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; }
  .cp-bounce { animation:cpB 1.4s ease-in-out infinite; }
  @keyframes cpB { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-7px);} }
  .cp-h { font-size:clamp(1.5rem,5vw,2rem); font-weight:800; letter-spacing:-0.02em; margin:10px 0 6px; }
  .cp-soft { color:var(--bdb-ink-soft); font-weight:500; }
  .cp-btn { display:inline-block; margin-top:14px; background:var(--bdb-teal); color:#fff; text-decoration:none; font-weight:800; padding:13px 24px; border-radius:var(--bdb-r); }
  .cp-q { text-align:left; }
  .cp-tag { font-size:0.74rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; color:var(--bdb-ink-faint); }
  .cp-prompt { font-size:clamp(1.25rem,4vw,1.7rem); font-weight:800; letter-spacing:-0.01em; margin:8px 0 16px; line-height:1.3; }
  .cp-input { width:100%; box-sizing:border-box; border:2px solid var(--bdb-line); border-radius:14px; padding:15px;
    font-family:inherit; font-size:1.3rem; font-weight:800; color:var(--bdb-ink); background:var(--bdb-ground); text-align:center; }
  .cp-input:focus { outline:none; border-color:var(--bdb-teal); }
  .cp-submit { width:100%; margin-top:12px; background:var(--bdb-teal); color:#fff; border:none; border-radius:14px;
    padding:15px 0; font-size:1.15rem; font-weight:900; cursor:pointer; }
  .cp-submit:disabled { opacity:0.4; cursor:default; }
`;
