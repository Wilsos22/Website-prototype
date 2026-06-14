"use client";

// Big Dog Math — STUDENT home (free / normal).
// Students can open Today's Lesson anytime — no code required. "Join with a code"
// is optional, only when the teacher runs a live session (for questions / class mode).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

export default function StudentHome() {
  const router = useRouter();
  const supabase = getSupabase();
  const [name, setName] = useState("");
  const [showJoin, setShowJoin] = useState(false);
  const [code, setCode] = useState("");
  const [joinSess, setJoinSess] = useState<{ id: string; periodId: string } | null>(null);
  const [roster, setRoster] = useState<{ id: string; full_name: string }[]>([]);
  const [joinErr, setJoinErr] = useState<string | null>(null);

  useEffect(() => {
    try { const n = localStorage.getItem("bdm-student-name"); if (n) setName(n.trim().split(/\s+/)[0]); } catch { /* ignore */ }
  }, []);

  async function submitCode() {
    setJoinErr(null);
    const c = code.trim().toUpperCase();
    if (c.length < 2) return;
    if (!supabase) { setJoinErr("Live sessions aren't set up yet."); return; }
    const { data: sess } = await supabase.from("sessions").select("id,period_id").eq("join_code", c).eq("status", "open").limit(1).maybeSingle();
    if (!sess) { setJoinErr("That code isn't open right now — check with your teacher."); return; }
    const s = sess as { id: string; period_id: string };
    const { data: studs } = await supabase.from("students").select("id,full_name").eq("period_id", s.period_id).order("full_name");
    setJoinSess({ id: s.id, periodId: s.period_id });
    setRoster((studs as { id: string; full_name: string }[]) || []);
  }
  async function pickName(s: { id: string; full_name: string }) {
    if (supabase && joinSess) {
      await supabase.from("session_joins").insert({ session_id: joinSess.id, student_id: s.id, display_name: s.full_name });
    }
    try {
      localStorage.setItem("bdm-student-name", s.full_name);
      if (joinSess) localStorage.setItem("bdm-student-session", JSON.stringify({ sessionId: joinSess.id, studentId: s.id, name: s.full_name }));
    } catch { /* ignore */ }
    router.push("/lesson");
  }

  return (
    <main className="st-page">
      <style>{`
        .st-page { min-height:100vh; background:#fbf7ef; font-family:Inter,ui-sans-serif,system-ui,sans-serif; padding:clamp(18px,4vw,44px) 16px; box-sizing:border-box; display:flex; flex-direction:column; align-items:center; }
        .st-banner { width:100%; max-width:560px; }
        .st-banner img { width:100%; height:auto; border-radius:22px; display:block; box-shadow:0 14px 30px -16px rgba(255,107,61,0.55); }
        .st-hello { margin:18px 0 4px; font-family:Georgia,"Times New Roman",serif; font-size:clamp(1.5rem,4vw,2.2rem); font-weight:700; color:#1c1d22; text-align:center; }
        .st-hello-sub { margin:0 0 clamp(20px,4vw,32px); color:#7a7468; font-weight:600; font-size:clamp(0.95rem,2.4vw,1.15rem); text-align:center; }

        .st-cards { width:100%; max-width:460px; display:grid; gap:14px; }
        .st-card { text-align:left; border:1px solid #efe7d6; background:#fff; border-radius:20px; padding:20px 22px; cursor:pointer; transition:transform 140ms ease, box-shadow 140ms ease, border-color 140ms; display:flex; align-items:center; gap:16px; }
        .st-card:hover { transform:translateY(-2px); box-shadow:0 14px 28px -16px rgba(0,0,0,0.3); }
        .st-ico { width:56px; height:56px; border-radius:16px; display:grid; place-items:center; flex:none; color:#fff; }
        .st-ico svg { width:30px; height:30px; }
        .st-card.primary { border-color:transparent; box-shadow:0 12px 26px -14px rgba(34,197,94,0.5); }
        .st-title { font-size:1.25rem; font-weight:900; color:#2a2a2e; }
        .st-sub { font-size:0.88rem; font-weight:600; color:#9a9282; margin-top:2px; }

        .st-codebox { display:flex; gap:8px; margin-top:12px; }
        .st-code-in { flex:1; border:2px solid #2dd4bf; border-radius:12px; padding:11px 14px; font-size:1.1rem; font-weight:800; letter-spacing:0.16em; text-transform:uppercase; color:#0f766e; background:#fff; }
        .st-code-btn { background:#14b8a6; color:#04231f; border:none; border-radius:12px; padding:0 20px; font-weight:900; cursor:pointer; }
        .st-joinerr { color:#b91c1c; font-weight:700; font-size:0.9rem; margin-top:8px; }
        .st-namepick-label { font-size:0.8rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; color:#0f766e; margin:12px 0 8px; }
        .st-names { display:flex; flex-wrap:wrap; gap:8px; }
        .st-name { background:#e7f8f3; border:1px solid #b9ebdf; color:#0f766e; border-radius:999px; padding:10px 16px; font-weight:800; cursor:pointer; font-size:0.95rem; }
        .st-name:hover { border-color:#14b8a6; }
        .st-foot { margin-top:auto; padding-top:26px; }
        .st-teacher { color:#c9c0ad; font-size:0.78rem; font-weight:700; text-decoration:none; }
      `}</style>

      <div className="st-banner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/big-dog-logo.png" alt="Big Dog Math — Abbie" />
      </div>
      <h1 className="st-hello">{name ? `Hey ${name}!` : "Welcome!"}</h1>
      <p className="st-hello-sub">Tap “Today’s Lesson” to get started.</p>

      <div className="st-cards">
        <div className="st-card primary" style={{ background: "#22c55e" }} onClick={() => router.push("/lesson")}>
          <span className="st-ico" style={{ background: "rgba(255,255,255,0.25)" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3 h9 l4 4 v14 H6 Z" /><path d="M15 3 v4 h4" /><line x1="9" y1="13" x2="16" y2="13" /><line x1="9" y1="17" x2="16" y2="17" /></svg>
          </span>
          <div>
            <div className="st-title" style={{ color: "#fff" }}>Today&apos;s Lesson</div>
            <div className="st-sub" style={{ color: "rgba(255,255,255,0.9)" }}>Warm-up, agenda, and today&apos;s work</div>
          </div>
        </div>

        <div className="st-card" onClick={() => setShowJoin((v) => !v)}>
          <span className="st-ico" style={{ background: "#14b8a6" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 10 h8 M8 14 h5" /></svg>
          </span>
          <div style={{ flex: 1 }}>
            <div className="st-title">Join with a code</div>
            <div className="st-sub">Only when your teacher gives a code</div>
          </div>
        </div>

        {showJoin && (
          <div className="st-card" style={{ display: "block", cursor: "default" }}>
            {!joinSess ? (
              <>
                <div className="st-codebox">
                  <input className="st-code-in" value={code} placeholder="CODE" maxLength={8} autoFocus
                    onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submitCode(); }} />
                  <button className="st-code-btn" onClick={submitCode}>Join</button>
                </div>
                {joinErr && <div className="st-joinerr">{joinErr}</div>}
              </>
            ) : (
              <>
                <div className="st-namepick-label">Tap your name</div>
                <div className="st-names">
                  {roster.length === 0
                    ? <span className="st-joinerr">No students in this class yet.</span>
                    : roster.map((s) => <button key={s.id} className="st-name" onClick={() => pickName(s)}>{s.full_name}</button>)}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="st-foot"><a className="st-teacher" href="/control">Teacher</a></div>
    </main>
  );
}
