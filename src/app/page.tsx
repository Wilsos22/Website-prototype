"use client";

// Big Dog Math — STUDENT start page.
// A numbered 1→2→3 journey: Warm-Up → Join with a code → Lesson.
// Only the active step is tappable (it gently shakes); finished steps grey out
// with a check; upcoming steps stay locked. Step 3 opens the lesson agenda.
// Teacher tools are NOT on this page (they live behind the control panel).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

interface Step { id: string; title: string; sub: string; color: string; }
const STEPS: Step[] = [
  { id: "warmup", title: "Warm-Up", sub: "Start your warm-up", color: "#ff6b3d" },
  { id: "join", title: "Join with a Code", sub: "Enter today's class code", color: "#14b8a6" },
  { id: "lesson", title: "Today's Lesson", sub: "See today's agenda", color: "#22c55e" },
];
const LS = "bdm-student-flow-v1";

export default function StudentHome() {
  const router = useRouter();
  const supabase = getSupabase();
  const [done, setDone] = useState(0);
  const [code, setCode] = useState("");
  const [mounted, setMounted] = useState(false);
  const [joinSess, setJoinSess] = useState<{ id: string; periodId: string } | null>(null);
  const [roster, setRoster] = useState<{ id: string; full_name: string }[]>([]);
  const [joinErr, setJoinErr] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(LS);
      if (raw) { const o = JSON.parse(raw); if (o.date === new Date().toDateString()) setDone(o.done || 0); }
    } catch { /* ignore */ }
  }, []);

  function save(n: number) {
    setDone(n);
    try { localStorage.setItem(LS, JSON.stringify({ date: new Date().toDateString(), done: n })); } catch { /* ignore */ }
  }
  function activate(i: number) {
    if (i !== done) return;
    if (STEPS[i].id === "join") return; // join advances via the code box
    if (STEPS[i].id === "lesson") { save(3); router.push("/lesson"); return; }
    save(i + 1);
  }
  async function submitCode() {
    setJoinErr(null);
    const c = code.trim().toUpperCase();
    if (c.length < 2) return;
    if (!supabase) { save(2); setCode(""); return; }
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
    setJoinSess(null); setRoster([]); setCode(""); save(2);
  }

  const cur = mounted ? done : 0;

  return (
    <main className="st-page">
      <style>{`
        .st-page { min-height:100vh; background:#fbf7ef; font-family:Inter,ui-sans-serif,system-ui,sans-serif; padding:clamp(18px,4vw,44px) 16px; box-sizing:border-box; display:flex; flex-direction:column; align-items:center; }
        .st-banner { width:100%; max-width:560px; }
        .st-banner img { width:100%; height:auto; border-radius:22px; display:block; box-shadow:0 14px 30px -16px rgba(255,107,61,0.55); }
        .st-hello { margin:18px 0 4px; font-family:Georgia,"Times New Roman",serif; font-size:clamp(1.5rem,4vw,2.2rem); font-weight:700; color:#1c1d22; text-align:center; }
        .st-hello-sub { margin:0 0 clamp(20px,4vw,34px); color:#7a7468; font-weight:600; font-size:clamp(0.95rem,2.4vw,1.15rem); text-align:center; }

        .st-flow { width:100%; max-width:460px; display:grid; gap:0; }
        .st-step { display:flex; align-items:stretch; gap:16px; }
        .st-railcol { display:flex; flex-direction:column; align-items:center; }
        .st-badge { width:58px; height:58px; border-radius:50%; display:grid; place-items:center; font-size:1.6rem; font-weight:900; color:#fff; flex:none; box-shadow:0 6px 0 0 rgba(0,0,0,0.12); transition:all 200ms ease; }
        .st-rail { width:4px; flex:1; min-height:24px; background:#e7dec9; border-radius:2px; margin:4px 0; }
        .st-rail.filled { background:#cde9d3; }

        .st-card { flex:1; background:#fff; border:1px solid #efe7d6; border-radius:18px; padding:16px 18px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; gap:10px; transition:transform 140ms ease, box-shadow 140ms ease, border-color 140ms; }
        .st-card.active { cursor:pointer; border-color:transparent; box-shadow:0 12px 26px -14px rgba(0,0,0,0.3); animation:stShake 1.6s ease-in-out infinite; }
        .st-card.active:hover { transform:translateY(-2px); }
        @keyframes stShake { 0%,92%,100%{transform:none;} 94%{transform:rotate(-1.1deg) translateX(-2px);} 96%{transform:rotate(1.1deg) translateX(2px);} 98%{transform:rotate(-0.6deg);} }
        .st-card.done { opacity:0.65; }
        .st-card.locked { opacity:0.5; }
        .st-title { font-size:1.15rem; font-weight:900; color:#2a2a2e; }
        .st-sub { font-size:0.85rem; font-weight:600; color:#9a9282; margin-top:2px; }
        .st-go { font-size:0.85rem; font-weight:900; letter-spacing:0.04em; text-transform:uppercase; }
        .st-codebox { display:flex; gap:8px; margin:2px 0 14px; }
        .st-code-in { flex:1; border:2px solid #2dd4bf; border-radius:12px; padding:11px 14px; font-size:1.1rem; font-weight:800; letter-spacing:0.16em; text-transform:uppercase; color:#0f766e; background:#fff; }
        .st-code-btn { background:#14b8a6; color:#04231f; border:none; border-radius:12px; padding:0 20px; font-weight:900; cursor:pointer; }
        .st-joinerr { color:#b91c1c; font-weight:700; font-size:0.9rem; margin:2px 0 14px; }
        .st-namepick { margin:2px 0 14px; }
        .st-namepick-label { font-size:0.8rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; color:#0f766e; margin-bottom:8px; }
        .st-names { display:flex; flex-wrap:wrap; gap:8px; }
        .st-name { background:#e7f8f3; border:1px solid #b9ebdf; color:#0f766e; border-radius:999px; padding:10px 16px; font-weight:800; cursor:pointer; font-size:0.95rem; }
        .st-name:hover { border-color:#14b8a6; }

        .st-foot { margin-top:auto; padding-top:26px; display:flex; gap:16px; align-items:center; }
        .st-reset { background:none; border:none; color:#b3aa97; font-weight:700; font-size:0.85rem; cursor:pointer; text-decoration:underline; }
        .st-teacher { color:#c9c0ad; font-size:0.78rem; font-weight:700; text-decoration:none; }
        .st-done-banner { background:rgba(34,197,94,0.12); border:1px solid rgba(34,197,94,0.4); color:#15803d; font-weight:800; border-radius:14px; padding:12px 18px; margin-bottom:14px; text-align:center; width:100%; max-width:460px; }
      `}</style>

      <div className="st-banner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/big-dog-logo.png" alt="Big Dog Math — Abbie" />
      </div>
      <h1 className="st-hello">Let&apos;s get started</h1>
      <p className="st-hello-sub">Follow the steps in order.</p>

      {cur >= 3 && <div className="st-done-banner">🎉 All set! Tap “Today&apos;s Lesson” to open your agenda.</div>}

      <div className="st-flow">
        {STEPS.map((s, i) => {
          const state = i < cur ? "done" : i === cur ? "active" : "locked";
          const isJoinActive = s.id === "join" && state === "active";
          return (
            <div className="st-step" key={s.id}>
              <div className="st-railcol">
                <div className="st-badge" style={{ background: state === "locked" ? "#c9c0ad" : s.color }}>
                  {state === "done" ? "✓" : i + 1}
                </div>
                {i < STEPS.length - 1 && <div className={`st-rail${i < cur ? " filled" : ""}`} />}
              </div>
              <div style={{ flex: 1 }}>
                <div className={`st-card ${state}`} onClick={() => state === "active" && activate(i)}>
                  <div>
                    <div className="st-title">{s.title}</div>
                    <div className="st-sub">{state === "done" ? "Done" : state === "locked" ? "Locked" : s.sub}</div>
                  </div>
                  {state === "active" && <span className="st-go" style={{ color: s.color }}>{s.id === "lesson" ? "Open →" : s.id === "join" ? "" : "Tap →"}</span>}
                </div>
                {isJoinActive && !joinSess && (
                  <>
                    <div className="st-codebox">
                      <input className="st-code-in" value={code} placeholder="CODE" maxLength={8}
                        onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submitCode(); }} />
                      <button className="st-code-btn" onClick={submitCode}>Join</button>
                    </div>
                    {joinErr && <div className="st-joinerr">{joinErr}</div>}
                  </>
                )}
                {isJoinActive && joinSess && (
                  <div className="st-namepick">
                    <div className="st-namepick-label">Tap your name</div>
                    <div className="st-names">
                      {roster.length === 0
                        ? <span className="st-joinerr">No students in this class yet.</span>
                        : roster.map((s) => <button key={s.id} className="st-name" onClick={() => pickName(s)}>{s.full_name}</button>)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="st-foot">
        {cur > 0 && <button className="st-reset" onClick={() => save(0)}>Start over</button>}
        <a className="st-teacher" href="/control">Teacher</a>
      </div>
    </main>
  );
}
