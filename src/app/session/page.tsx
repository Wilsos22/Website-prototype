"use client";

// Teacher live session — pick a period, start a join code, watch students join
// in real time (polls every 3s). Backed by Supabase (sessions + session_joins).

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";

interface Period { id: string; name: string; }
interface Join { id: string; display_name: string | null; joined_at: string; }

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "DOG";
  for (let i = 0; i < 3; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

export default function SessionPage() {
  const supabase = getSupabase();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [session, setSession] = useState<{ id: string; code: string; periodName: string } | null>(null);
  const [joins, setJoins] = useState<Join[]>([]);
  const [rosterCount, setRosterCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("periods").select("id,name").order("sort_order").then(({ data }) => {
      const ps = (data as Period[]) || [];
      setPeriods(ps); if (ps[0]) setPeriodId(ps[0].id);
    });
  }, [supabase]);

  const pollJoins = useCallback(async (sessionId: string) => {
    if (!supabase) return;
    const { data } = await supabase.from("session_joins").select("id,display_name,joined_at").eq("session_id", sessionId).order("joined_at");
    setJoins((data as Join[]) || []);
  }, [supabase]);

  useEffect(() => {
    if (!session) return;
    pollJoins(session.id);
    pollRef.current = setInterval(() => pollJoins(session.id), 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [session, pollJoins]);

  async function start() {
    if (!supabase || !periodId) return;
    setError(null);
    const code = makeCode();
    const { data, error } = await supabase.from("sessions").insert({ period_id: periodId, join_code: code, status: "open" }).select("id").single();
    if (error) { setError(error.message); return; }
    const periodName = periods.find((p) => p.id === periodId)?.name || "";
    const { count } = await supabase.from("students").select("id", { count: "exact", head: true }).eq("period_id", periodId);
    setRosterCount(count || 0);
    setSession({ id: (data as { id: string }).id, code, periodName });
    setJoins([]);
  }
  async function end() {
    if (!supabase || !session) return;
    await supabase.from("sessions").update({ status: "closed", ended_at: new Date().toISOString() }).eq("id", session.id);
    setSession(null); setJoins([]);
  }

  return (
    <main className="se-page">
      <style>{`
        .se-page { min-height:100vh; background:#fbf7ef; font-family:Inter,ui-sans-serif,system-ui,sans-serif; padding:0 0 50px; }
        .se-top { display:flex; align-items:center; justify-content:space-between; padding:16px clamp(16px,4vw,40px); }
        .se-back { color:#7a7468; font-weight:800; font-size:0.85rem; text-decoration:none; }
        .se-mark { font-size:0.76rem; font-weight:900; letter-spacing:0.14em; text-transform:uppercase; color:#14b8a6; }
        .se-wrap { max-width:680px; margin:0 auto; padding:0 16px; display:grid; gap:18px; }
        .se-h1 { font-family:Georgia,"Times New Roman",serif; font-size:clamp(1.8rem,5vw,2.6rem); font-weight:700; color:#1c1d22; margin:6px 0 0; }
        .se-card { background:#fff; border:1px solid #efe7d6; border-radius:18px; padding:20px; }
        .se-row { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
        .se-sel { border:2px solid #e7dec9; border-radius:11px; padding:11px 14px; font-size:1rem; font-weight:800; color:#2a2a2e; background:#fbf7ef; }
        .se-start { background:#14b8a6; color:#04231f; border:none; border-radius:12px; padding:13px 26px; font-weight:900; cursor:pointer; font-size:1rem; }
        .se-end { background:#fff; color:#ef4444; border:1px solid #efd6d2; border-radius:11px; padding:11px 18px; font-weight:900; cursor:pointer; }
        .se-code-wrap { text-align:center; padding:8px 0; }
        .se-code-label { font-size:0.8rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; color:#a89f8c; }
        .se-code { font-size:clamp(3rem,12vw,6rem); font-weight:900; letter-spacing:0.12em; color:#14b8a6; line-height:1.1; }
        .se-count { font-size:1rem; font-weight:800; color:#5a5346; margin-bottom:10px; }
        .se-joins { display:flex; flex-wrap:wrap; gap:8px; }
        .se-chip { background:#e7f8f3; border:1px solid #b9ebdf; color:#0f766e; border-radius:999px; padding:9px 16px; font-weight:800; animation:sePop 0.3s ease; }
        @keyframes sePop { from{transform:scale(0.85); opacity:0.4;} to{transform:none; opacity:1;} }
        .se-empty { color:#b3aa97; font-weight:600; }
        .se-warn { background:#fff7e6; border:1px solid #ffe2a8; color:#92660a; border-radius:14px; padding:16px 18px; font-weight:700; line-height:1.6; }
        .se-err { background:#fdecea; border:1px solid #f5c6c0; color:#b91c1c; border-radius:12px; padding:12px 16px; font-weight:700; }
      `}</style>

      <header className="se-top">
        <a className="se-back" href="/control">← Control panel</a>
        <span className="se-mark">Live Session</span>
      </header>

      <div className="se-wrap">
        <h1 className="se-h1">Join with a code</h1>

        {!supabase && <div className="se-warn">Supabase isn&apos;t connected yet — add your keys in Vercel and redeploy.</div>}
        {error && <div className="se-err">⚠ {error}</div>}

        {supabase && !session && (
          <div className="se-card">
            <div className="se-row">
              <select className="se-sel" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
                {periods.length === 0 && <option value="">No periods — add rosters first</option>}
                {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button className="se-start" onClick={start} disabled={!periodId}>Start session →</button>
            </div>
            <p className="se-empty" style={{ marginTop: 12 }}>Pick a class period and start a session. Students enter the code on their home screen.</p>
          </div>
        )}

        {supabase && session && (
          <>
            <div className="se-card se-code-wrap">
              <div className="se-code-label">{session.periodName} · code</div>
              <div className="se-code">{session.code}</div>
              <button className="se-end" onClick={end}>End session</button>
            </div>
            <div className="se-card">
              <div className="se-count">Joined: {joins.length}{rosterCount ? ` of ${rosterCount}` : ""}</div>
              {joins.length === 0 ? <span className="se-empty">Waiting for students to join…</span>
                : <div className="se-joins">{joins.map((j) => <span className="se-chip" key={j.id}>{j.display_name || "Student"}</span>)}</div>}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
