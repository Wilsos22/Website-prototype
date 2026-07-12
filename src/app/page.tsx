"use client";

// Big Dog Math — STUDENT landing. Join is the main event: enter the class code to
// link to the teacher's live session. A quiet secondary option ("Absent or just
// exploring") drops into the full site (/explore) for own-time browsing.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { clearClassModeExitMarker, markStudentTab } from "@/lib/liveClassFlow";

const WARMUP_IDENTITY = process.env.NEXT_PUBLIC_WARMUP_IDENTITY_ENABLED === "true";

export default function StudentLanding() {
  const router = useRouter();
  const supabase = getSupabase();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [joinSess, setJoinSess] = useState<{ id: string; periodId: string } | null>(null);
  const [roster, setRoster] = useState<{ id: string; full_name: string }[]>([]);
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [warmupIdentityReady, setWarmupIdentityReady] = useState(!WARMUP_IDENTITY);

  useEffect(() => {
    try { const n = localStorage.getItem("bdm-student-name"); if (n) setName(n.trim().split(/\s+/)[0]); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!WARMUP_IDENTITY || !supabase) return;
    let stopped = false;
    const prepare = async () => {
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        if (!stopped) setWarmupIdentityReady(true);
        return;
      }
      const { error } = await supabase.auth.signInAnonymously();
      if (stopped) return;
      if (error) setJoinErr(`Warm-up identity is not available: ${error.message}`);
      else setWarmupIdentityReady(true);
    };
    void prepare();
    return () => { stopped = true; };
  }, [supabase]);

  async function submitCode() {
    setJoinErr(null);
    const c = code.trim().toUpperCase();
    if (c.length < 2) return;
    if (!supabase) { setJoinErr("Live sessions aren't set up yet."); return; }
    if (WARMUP_IDENTITY && !warmupIdentityReady) {
      setJoinErr("Big Dog is still preparing the verified warm-up. Try again in a moment.");
      return;
    }
    const { data: sess } = await supabase.from("sessions").select("id,period_id").eq("join_code", c).eq("status", "open").limit(1).maybeSingle();
    if (!sess) { setJoinErr("That code isn't open right now — check with your teacher."); return; }
    const s = sess as { id: string; period_id: string };
    if (WARMUP_IDENTITY) {
      try {
        clearClassModeExitMarker();
        localStorage.removeItem("bdm-student-name");
        localStorage.setItem("bdm-student-session", JSON.stringify({ sessionId: s.id, studentId: "", name: "" }));
        markStudentTab();
      } catch { /* ignore */ }
      router.push("/lesson");
      return;
    }
    const { data: studs } = await supabase.from("students").select("id,full_name").eq("period_id", s.period_id).order("full_name");
    setJoinSess({ id: s.id, periodId: s.period_id });
    setRoster((studs as { id: string; full_name: string }[]) || []);
  }

  async function pickName(s: { id: string; full_name: string }) {
    if (supabase && joinSess && !WARMUP_IDENTITY) {
      await supabase.from("session_joins").insert({ session_id: joinSess.id, student_id: s.id, display_name: s.full_name });
    }
    try {
      clearClassModeExitMarker();
      localStorage.setItem("bdm-student-name", s.full_name);
      if (joinSess) {
        localStorage.setItem("bdm-student-session", JSON.stringify({ sessionId: joinSess.id, studentId: s.id, name: s.full_name }));
        markStudentTab();
      }
    } catch { /* ignore */ }
    router.push("/lesson");
  }

  return (
    <main className="st-page">
      <style>{`
        .st-page { min-height:100vh; background:var(--bdb-ground); font-family:var(--bdb-font); color:var(--bdb-ink);
          padding:clamp(18px,4vw,44px) 16px; box-sizing:border-box; display:flex; flex-direction:column; align-items:center; }
        .st-banner { width:100%; max-width:min(440px, 86vw); margin-top:clamp(2px,1.5vw,12px); }
        .st-banner img { width:100%; height:auto; display:block; }
        .st-hello { margin:6px 0 2px; font-size:clamp(1.5rem,4vw,2.2rem); font-weight:700; letter-spacing:-0.02em; color:var(--bdb-ink); text-align:center; }
        .st-hello-sub { margin:0 0 clamp(16px,3vw,24px); color:var(--bdb-ink-soft); font-weight:500; font-size:clamp(0.98rem,2.4vw,1.12rem); text-align:center; }

        .st-cards { width:100%; max-width:440px; display:grid; gap:16px; }
        .st-join { border:none; border-radius:var(--bdb-r-lg); background:var(--bdb-card); padding:22px 22px 24px;
          box-shadow:0 18px 36px -22px rgba(80,163,164,0.55); border:2px solid color-mix(in srgb, var(--bdb-teal) 30%, transparent); }
        .st-join-h { margin:0 0 4px; font-size:1.25rem; font-weight:800; letter-spacing:-0.01em; color:var(--bdb-ink); }
        .st-join-sub { margin:0 0 14px; font-size:0.92rem; font-weight:500; color:var(--bdb-ink-soft); }
        .st-codebox { display:flex; gap:8px; }
        .st-code-in { flex:1; min-width:0; border:2px solid var(--bdb-teal); border-radius:12px; padding:14px 16px;
          font-size:1.3rem; font-weight:800; letter-spacing:0.18em; text-transform:uppercase; color:#0f5e5f; background:#fff; }
        .st-code-in:focus { outline:none; box-shadow:0 0 0 4px color-mix(in srgb, var(--bdb-teal) 22%, transparent); }
        .st-code-btn { background:var(--bdb-teal); color:#fff; border:none; border-radius:12px; padding:0 22px; font-weight:800; font-size:1.05rem; cursor:pointer; }
        .st-code-btn:hover { filter:brightness(1.04); }
        .st-joinerr { color:var(--bdb-coral); font-weight:600; font-size:0.9rem; margin-top:10px; }

        .st-namepick-label { font-size:0.78rem; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:var(--bdb-ink-faint); margin:0 0 10px; }
        .st-names { display:flex; flex-wrap:wrap; gap:8px; }
        .st-name { background:color-mix(in srgb, var(--bdb-teal) 14%, white); border:1px solid color-mix(in srgb, var(--bdb-teal) 35%, white);
          color:#0f5e5f; border-radius:999px; padding:10px 16px; font-weight:600; cursor:pointer; font-size:0.95rem; }
        .st-name:hover { border-color:var(--bdb-teal); }

        .st-explore { display:flex; align-items:center; justify-content:center; gap:8px; text-decoration:none;
          border:1px solid var(--bdb-line); border-radius:var(--bdb-r); background:var(--bdb-card); color:var(--bdb-ink-soft);
          padding:14px 16px; font-weight:600; font-size:0.95rem; transition:border-color 120ms, color 120ms; }
        .st-explore:hover { border-color:var(--bdb-coral); color:var(--bdb-ink); }
        .st-explore b { color:var(--bdb-ink); font-weight:700; }

        .st-foot { margin-top:auto; padding-top:26px; }
        .st-teacher { color:var(--bdb-ink-faint); font-size:0.78rem; font-weight:600; text-decoration:none; }
      `}</style>

      <div className="st-banner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/big-dog-logo.svg" alt="Big Dog Math" />
      </div>
      <h1 className="st-hello">{name ? `Hey ${name}!` : "Welcome!"}</h1>
      <p className="st-hello-sub">Enter your class code to join today&apos;s lesson.</p>

      <div className="st-cards">
        <div className="st-join">
          {!joinSess ? (
            <>
              <h2 className="st-join-h">Join your class</h2>
              <p className="st-join-sub">Your teacher will give you a code.</p>
              <div className="st-codebox">
                <input
                  className="st-code-in"
                  value={code}
                  placeholder="CODE"
                  maxLength={8}
                  autoFocus
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitCode(); }}
                />
                <button className="st-code-btn" onClick={submitCode}>Join</button>
              </div>
              {joinErr && <div className="st-joinerr">{joinErr}</div>}
            </>
          ) : (
            <>
              <p className="st-namepick-label">Tap your name</p>
              <div className="st-names">
                {roster.length === 0
                  ? <span className="st-joinerr">No students in this class yet.</span>
                  : roster.map((s) => <button key={s.id} className="st-name" onClick={() => pickName(s)}>{s.full_name}</button>)}
              </div>
            </>
          )}
        </div>

        <a className="st-explore" href="/explore">
          <span>Just looking around? <b>Explore the math tools →</b></span>
        </a>
      </div>

      <div className="st-foot">
        <a className="st-teacher" href="/teacher">Teacher →</a>
      </div>
    </main>
  );
}
