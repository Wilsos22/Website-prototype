"use client";

// Big Dog Math — STUDENT home (free / normal).
// Students can open Today's Lesson anytime — no code required. "Join with a code"
// is optional, only when the teacher runs a live session (for questions / class mode).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { clearClassModeExitMarker } from "@/lib/liveClassFlow";

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
      clearClassModeExitMarker();
      localStorage.setItem("bdm-student-name", s.full_name);
      if (joinSess) localStorage.setItem("bdm-student-session", JSON.stringify({ sessionId: joinSess.id, studentId: s.id, name: s.full_name }));
    } catch { /* ignore */ }
    router.push("/lesson");
  }

  return (
    <main className="st-page">
      <style>{`
        .st-page { min-height:100vh; background:var(--bdb-ground); font-family:var(--bdb-font); color:var(--bdb-ink); padding:clamp(18px,4vw,44px) 16px; box-sizing:border-box; display:flex; flex-direction:column; align-items:center; }
        .st-banner { width:100%; max-width:min(480px, 90vw); margin-top:clamp(2px,1.5vw,12px); }
        .st-banner img { width:100%; height:auto; display:block; }
        .st-hello { margin:2px 0 2px; font-family:var(--bdb-font); font-size:clamp(1.5rem,4vw,2.2rem); font-weight:700; letter-spacing:-0.02em; color:var(--bdb-ink); text-align:center; }
        .st-hello-sub { margin:0 0 clamp(12px,2.5vw,18px); color:var(--bdb-ink-soft); font-weight:500; font-size:clamp(0.95rem,2.4vw,1.1rem); text-align:center; }

        .st-cards { width:100%; max-width:460px; display:grid; gap:14px; }
        .st-card { text-align:left; border:1px solid var(--bdb-line); background:var(--bdb-card); border-radius:var(--bdb-r); padding:18px 20px; cursor:pointer; transition:transform 130ms ease, box-shadow 130ms ease, border-color 130ms; display:flex; align-items:center; gap:16px; box-shadow:var(--bdb-shadow-sm); }
        .st-card:hover { transform:translateY(-2px); box-shadow:var(--bdb-shadow); }
        .st-ico { width:52px; height:52px; border-radius:13px; display:grid; place-items:center; flex:none; color:#fff; }
        .st-ico svg { width:28px; height:28px; }
        .st-card.primary { border-color:transparent; box-shadow:0 14px 28px -16px rgba(249,83,53,0.55); }
        .st-title { font-size:1.18rem; font-weight:700; letter-spacing:-0.01em; color:var(--bdb-ink); }
        .st-sub { font-size:0.88rem; font-weight:500; color:var(--bdb-ink-soft); margin-top:2px; }

        .st-codebox { display:flex; gap:8px; margin-top:12px; }
        .st-code-in { flex:1; border:2px solid var(--bdb-teal); border-radius:12px; padding:11px 14px; font-size:1.1rem; font-weight:700; letter-spacing:0.16em; text-transform:uppercase; color:#0f5e5f; background:#fff; }
        .st-code-btn { background:var(--bdb-teal); color:#fff; border:none; border-radius:12px; padding:0 20px; font-weight:700; cursor:pointer; }
        .st-joinerr { color:var(--bdb-coral); font-weight:600; font-size:0.9rem; margin-top:8px; }
        .st-namepick-label { font-size:0.78rem; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:var(--bdb-ink-faint); margin:12px 0 8px; }
        .st-names { display:flex; flex-wrap:wrap; gap:8px; }
        .st-name { background:color-mix(in srgb, var(--bdb-teal) 14%, white); border:1px solid color-mix(in srgb, var(--bdb-teal) 35%, white); color:#0f5e5f; border-radius:999px; padding:10px 16px; font-weight:600; cursor:pointer; font-size:0.95rem; }
        .st-name:hover { border-color:var(--bdb-teal); }
        .st-foot { margin-top:auto; padding-top:26px; }
        .st-teacher { color:var(--bdb-ink-faint); font-size:0.78rem; font-weight:600; text-decoration:none; }
      `}</style>

      <div className="st-banner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/big-dog-logo.svg" alt="Big Dog Math" />
      </div>
      <h1 className="st-hello">{name ? `Hey ${name}!` : "Welcome!"}</h1>
      <p className="st-hello-sub">Tap “Today’s Lesson” to get started.</p>

      <div className="st-cards">
        <div className="st-card primary" style={{ background: "#f95335" }} onClick={() => router.push("/lesson")}>
          <span className="st-ico" style={{ background: "rgba(255,255,255,0.25)" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3 h9 l4 4 v14 H6 Z" /><path d="M15 3 v4 h4" /><line x1="9" y1="13" x2="16" y2="13" /><line x1="9" y1="17" x2="16" y2="17" /></svg>
          </span>
          <div>
            <div className="st-title" style={{ color: "#fff" }}>Today&apos;s Lesson</div>
            <div className="st-sub" style={{ color: "rgba(255,255,255,0.9)" }}>Warm-up, agenda, and today&apos;s work</div>
          </div>
        </div>

        <div className="st-card" onClick={() => setShowJoin((v) => !v)}>
          <span className="st-ico" style={{ background: "#50a3a4" }}>
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

      <div className="st-foot">
        <a className="st-teacher" href="/teacher">Teacher →</a>
      </div>
    </main>
  );
}
