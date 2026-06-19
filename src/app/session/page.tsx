"use client";

// Teacher live session — pick a period, start a join code, watch students join
// in real time (polls every 3s). Backed by Supabase (sessions + session_joins).

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import SiteNav from "@/components/SiteNav";
import {
  LIVE_FLOW_MODE,
  clearStoredTeacherSession,
  saveTeacherSession,
} from "@/lib/liveClassFlow";

interface Period { id: string; name: string; }
interface Join { id: string; display_name: string | null; joined_at: string; }
interface Answer { id: string; display_name: string | null; answer: string | null; }

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

  const [question, setQuestion] = useState("");
  const [mc, setMc] = useState(false);
  const [choices, setChoices] = useState(["", "", "", ""]);
  const [poll, setPoll] = useState<{ id: string; question: string; choices: string[] | null } | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const ansRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [broadcast, setBroadcast] = useState<string | null>(null);

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
    const sessionId = (data as { id: string }).id;
    saveTeacherSession(sessionId, code, periodName);
    setSession({ id: sessionId, code, periodName });
    setJoins([]); setBroadcast(null);
  }
  async function end() {
    if (!supabase || !session) return;
    await supabase.from("sessions").update({ status: "closed", ended_at: new Date().toISOString(), broadcast: null }).eq("id", session.id);
    clearStoredTeacherSession(session.id);
    setSession(null); setJoins([]); setPoll(null); setAnswers([]); setBroadcast(null);
  }
  async function setBroadcastTo(value: string | null) {
    if (!supabase || !session) return;
    await supabase.from("sessions").update({ broadcast: value }).eq("id", session.id);
    setBroadcast(value);
  }
  const SENDS: { label: string; value: string }[] = [
    { label: "Free (browse)", value: "free" },
    { label: "Lesson page", value: "/lesson" },
    { label: "Whiteboard", value: "/whiteboard" },
    { label: "Number Line", value: "/number-line-plus" },
    { label: "Percent Bar", value: "/percent-bar" },
    { label: "Equation Builder", value: "/equation-builder" },
    { label: "GEMS", value: "/order-of-operations" },
    { label: "Live Class Flow", value: LIVE_FLOW_MODE },
  ];

  async function pushPoll() {
    if (!supabase || !session || !question.trim()) return;
    setError(null);
    const ch = mc ? choices.map((c) => c.trim()).filter(Boolean) : null;
    const payload = {
      session_id: session.id,
      question: question.trim(),
      choices: ch,
      kind: ch && ch.length ? "multiple-choice" : "short-answer",
      status: "open",
    };
    let { data, error } = await supabase.from("polls").insert(payload).select("id").single();
    // Existing poll tables do not yet have kind. Keep their original short
    // answer / multiple-choice behavior working until the migration is run.
    if (error) {
      const fallback = await supabase.from("polls").insert({
        session_id: session.id,
        question: question.trim(),
        choices: ch,
        status: "open",
      }).select("id").single();
      data = fallback.data;
      error = fallback.error;
    }
    if (error) { setError(error.message); return; }
    setPoll({ id: (data as { id: string }).id, question: question.trim(), choices: ch && ch.length ? ch : null });
    setAnswers([]);
  }
  async function closePoll() {
    if (!supabase || !poll) return;
    await supabase.from("polls").update({ status: "closed" }).eq("id", poll.id);
    setPoll(null); setAnswers([]); setQuestion(""); setMc(false); setChoices(["", "", "", ""]);
  }

  useEffect(() => {
    if (!poll || !supabase) return;
    const fetchA = async () => {
      const { data } = await supabase.from("poll_answers").select("id,display_name,answer").eq("poll_id", poll.id).order("created_at");
      setAnswers((data as Answer[]) || []);
    };
    fetchA();
    ansRef.current = setInterval(fetchA, 3000);
    return () => { if (ansRef.current) clearInterval(ansRef.current); };
  }, [poll, supabase]);

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
        .se-qh { margin:0 0 12px; font-size:1.1rem; font-weight:900; color:#2a2a2e; }
        .se-qin { width:100%; min-height:66px; border:2px solid #e7dec9; border-radius:12px; padding:12px 14px; font-size:1.05rem; font-weight:700; color:#2a2a2e; background:#fbf7ef; resize:vertical; box-sizing:border-box; }
        .se-mc { display:flex; align-items:center; gap:8px; font-weight:800; color:#5a5346; margin:12px 0; font-size:0.95rem; }
        .se-choices { display:grid; gap:8px; margin-bottom:12px; }
        .se-choice { border:2px solid #e7dec9; border-radius:11px; padding:10px 13px; font-weight:700; color:#2a2a2e; background:#fbf7ef; }
        .se-tally { display:grid; gap:12px; margin-top:14px; }
        .se-tallylabel { font-weight:800; color:#2a2a2e; margin-bottom:5px; }
        .se-bar { height:16px; background:#f0ece1; border-radius:999px; overflow:hidden; }
        .se-barfill { height:100%; background:#14b8a6; border-radius:999px; transition:width 400ms ease; }
        .se-sends { display:flex; flex-wrap:wrap; gap:8px; }
        .se-send { background:#f6f1e6; border:1px solid #e7dec9; color:#5a5346; border-radius:999px; padding:9px 15px; font-weight:800; cursor:pointer; font-size:0.9rem; }
        .se-send:hover { border-color:#14b8a6; }
        .se-send.on { background:#14b8a6; border-color:#14b8a6; color:#04231f; }
      `}</style>

      <SiteNav variant="teacher" />
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

            <div className="se-card">
              <h3 className="se-qh">Class mode — send screens to</h3>
              <div className="se-sends">
                {SENDS.map((s) => (
                  <button key={s.value} className={`se-send${(broadcast || "free") === s.value ? " on" : ""}`} onClick={() => setBroadcastTo(s.value === "free" ? null : s.value)}>{s.label}</button>
                ))}
              </div>
              <p className="se-empty" style={{ marginTop: 10 }}>
                {broadcast && broadcast !== "free"
                  ? `Joined students are following ${SENDS.find((mode) => mode.value === broadcast)?.label || broadcast}.`
                  : "Students are browsing freely."}
              </p>
            </div>

            {!poll ? (
              <div className="se-card">
                <h3 className="se-qh">Ask a question</h3>
                <textarea className="se-qin" value={question} placeholder="Type your question…" onChange={(e) => setQuestion(e.target.value)} />
                <label className="se-mc"><input type="checkbox" checked={mc} onChange={(e) => setMc(e.target.checked)} /> Multiple choice</label>
                {mc && (
                  <div className="se-choices">
                    {choices.map((c, i) => (
                      <input key={i} className="se-choice" value={c} placeholder={`Choice ${i + 1}`}
                        onChange={(e) => setChoices((cs) => cs.map((x, j) => (j === i ? e.target.value : x)))} />
                    ))}
                  </div>
                )}
                <button className="se-start" onClick={pushPoll} disabled={!question.trim()}>Push to class →</button>
              </div>
            ) : (
              <div className="se-card">
                <div className="se-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <h3 className="se-qh" style={{ margin: 0 }}>{poll.question}</h3>
                  <button className="se-end" onClick={closePoll}>Close question</button>
                </div>
                <div className="se-count" style={{ marginTop: 12 }}>Answers: {answers.length}</div>
                {poll.choices ? (
                  <div className="se-tally">
                    {poll.choices.map((ch) => {
                      const n = answers.filter((a) => a.answer === ch).length;
                      const pct = answers.length ? Math.round((n / answers.length) * 100) : 0;
                      return (
                        <div className="se-tallyrow" key={ch}>
                          <div className="se-tallylabel">{ch} · {n}</div>
                          <div className="se-bar"><div className="se-barfill" style={{ width: `${pct}%` }} /></div>
                        </div>
                      );
                    })}
                  </div>
                ) : answers.length === 0 ? (
                  <span className="se-empty">Waiting for answers…</span>
                ) : (
                  <div className="se-joins">
                    {answers.map((a) => <span className="se-chip" key={a.id} style={{ background: "#eef6ff", borderColor: "#d7e6fb", color: "#1d4ed8" }}>{a.display_name || "Student"}: {a.answer}</span>)}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
