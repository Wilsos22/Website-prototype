"use client";

// Teacher live session — pick a period, start a join code, watch students join
// in real time (polls every 3s). Backed by Supabase (sessions + session_joins).

import { useCallback, useEffect, useRef, useState } from "react";
import { teacherApiRequest, teacherPost } from "@/lib/teacherApi";
import SiteNav from "@/components/SiteNav";
import {
  LIVE_FLOW_MODE,
  clearStoredTeacherSession,
  getStoredTeacherSession,
  saveTeacherSession,
} from "@/lib/liveClassFlow";
import { SKILLS } from "@/lib/challengeSkills";
import {
  launchChallenge,
  endChallenge,
  fetchLeaderboard,
  type ChallengeRow,
  type LeaderRow,
} from "@/lib/challenges";

interface Period { id: string; name: string; }
interface Join { id: string; display_name: string | null; joined_at: string; }
interface Answer { id: string; display_name: string | null; answer: string | null; }

const TEACHER_SERVER_CLIENT = {} as never;

const DURATIONS = [
  { label: "2 min", value: 120 },
  { label: "3 min", value: 180 },
  { label: "5 min", value: 300 },
];

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "DOG";
  for (let i = 0; i < 3; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

export default function SessionPage() {
  const supabase = TEACHER_SERVER_CLIENT;
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

  // Live challenge (game) state
  const [chSkill, setChSkill] = useState(SKILLS[0].key);
  const [chLevel, setChLevel] = useState(1);
  const [chDuration, setChDuration] = useState(180);
  const [challenge, setChallenge] = useState<ChallengeRow | null>(null);
  const [board, setBoard] = useState<LeaderRow[]>([]);
  const [chSetup, setChSetup] = useState(false);
  const boardRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeSkill = SKILLS.find((s) => s.key === chSkill) || SKILLS[0];

  useEffect(() => {
    teacherApiRequest<{ periods: Period[] }>("/api/teacher/roster").then(({ periods: ps }) => {
      setPeriods(ps); if (ps[0]) setPeriodId(ps[0].id);
    }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Periods could not be loaded."));
  }, []);

  // Restore an already-open session if the teacher navigated away (e.g. to the
  // Control panel) and came back — otherwise the page looks empty and a second
  // "Start session" click spawns a duplicate with a new code, which is what made
  // it keep asking to start/join a new session.
  useEffect(() => {
    const stored = getStoredTeacherSession();
    if (!stored) return;
    let cancelled = false;
    (async () => {
      const [sessionResult, rosterResult] = await Promise.all([
        teacherApiRequest<{ session: { id: string; status: string; period_id: string; broadcast: string | null } }>(`/api/teacher/session?sessionId=${encodeURIComponent(stored.sessionId)}`),
        teacherApiRequest<{ students: Array<{ periodId: string }> }>("/api/teacher/roster"),
      ]).catch(() => [{ session: null }, { students: [] }] as const);
      if (cancelled) return;
      const s = sessionResult.session;
      if (!s || s.status !== "open") {
        clearStoredTeacherSession(stored.sessionId);
        return;
      }
      if (cancelled) return;
      setRosterCount(rosterResult.students.filter((student) => student.periodId === s.period_id).length);
      setBroadcast(s.broadcast ?? null);
      setSession({ id: s.id, code: stored.code, periodName: stored.periodName });
    })();
    return () => { cancelled = true; };
  }, []);

  const pollJoins = useCallback(async (sessionId: string) => {
    const result = await teacherApiRequest<{ joins: Join[] }>(`/api/teacher/session?sessionId=${encodeURIComponent(sessionId)}`);
    setJoins(result.joins);
  }, []);

  useEffect(() => {
    if (!session) return;
    pollJoins(session.id);
    pollRef.current = setInterval(() => pollJoins(session.id), 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [session, pollJoins]);

  // Load any poll already open for this session so the "Close question" control is
  // available even after a page reload — otherwise an orphaned open poll has no
  // off-switch and blocks every student who joins.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      const result = await teacherApiRequest<{ polls: Array<{ id: string; question: string; choices: string[] | null; status: string }> }>(
        `/api/teacher/session?sessionId=${encodeURIComponent(session.id)}`,
      );
      if (cancelled) return;
      const p = result.polls.find((candidate) => candidate.status === "open") ?? null;
      if (p) setPoll({ id: p.id, question: p.question, choices: p.choices && p.choices.length ? p.choices : null });
    })();
    return () => { cancelled = true; };
  }, [session]);

  async function start() {
    if (!periodId) return;
    setError(null);
    const code = makeCode();
    // Start held on the lesson page so joined students are locked in from the
    // moment they join (not free to wander) until you pick a tool or release them.
    let data: { id: string };
    try {
      const result = await teacherPost<{ session: { id: string } }>("/api/teacher/session", { action: "start", periodId, joinCode: code });
      data = result.session;
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Session could not be started."); return; }
    const periodName = periods.find((p) => p.id === periodId)?.name || "";
    const roster = await teacherApiRequest<{ students: Array<{ periodId: string }> }>("/api/teacher/roster");
    setRosterCount(roster.students.filter((student) => student.periodId === periodId).length);
    const sessionId = (data as { id: string }).id;
    saveTeacherSession(sessionId, code, periodName);
    setSession({ id: sessionId, code, periodName });
    setJoins([]); setBroadcast("/lesson");
  }
  async function end() {
    if (!session) return;
    // Close any polls still open for this session so they can't linger and block
    // students who later join (an orphaned open poll otherwise has no off-switch).
    await teacherPost("/api/teacher/session", { action: "close", sessionId: session.id });
    clearStoredTeacherSession(session.id);
    setSession(null); setJoins([]); setPoll(null); setAnswers([]); setBroadcast(null);
    setChallenge(null); setBoard([]);
  }
  async function setBroadcastTo(value: string | null) {
    if (!session) return;
    await teacherPost("/api/teacher/session", { action: "update", sessionId: session.id, broadcast: value });
    setBroadcast(value);
  }

  async function startChallenge() {
    if (!session) return;
    setError(null); setChSetup(false);
    const skill = SKILLS.find((s) => s.key === chSkill) || SKILLS[0];
    const title = `${skill.label} · ${skill.levels[chLevel - 1] || `Level ${chLevel}`}`;
    const { challenge: created, error: chErr } = await launchChallenge(supabase, {
      sessionId: session.id, skill: chSkill, title, level: chLevel, durationSeconds: chDuration,
    });
    if (chErr === "SETUP") { setChSetup(true); return; }
    if (chErr) { setError(chErr); return; }
    setChallenge(created);
    setBoard([]);
    await setBroadcastTo("/challenge");
  }
  async function stopChallenge() {
    if (!challenge) return;
    await endChallenge(supabase, challenge.id);
    setChallenge(null);
    await setBroadcastTo("/lesson");
  }

  // Poll the live leaderboard while a challenge is running.
  useEffect(() => {
    if (!supabase || !challenge) { setBoard([]); return; }
    const load = async () => setBoard(await fetchLeaderboard(supabase, challenge.id));
    load();
    boardRef.current = setInterval(load, 3000);
    return () => { if (boardRef.current) clearInterval(boardRef.current); };
  }, [supabase, challenge]);
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
    if (!session || !question.trim()) return;
    setError(null);
    const ch = mc ? choices.map((c) => c.trim()).filter(Boolean) : null;
    try {
      const result = await teacherPost<{ poll: { id: string } }>("/api/teacher/poll", {
        action: "create",
        sessionId: session.id,
        question: question.trim(),
        choices: ch,
        kind: ch && ch.length ? "multiple-choice" : "short-answer",
      });
      setPoll({ id: result.poll.id, question: question.trim(), choices: ch && ch.length ? ch : null });
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Question could not be sent."); return; }
    setAnswers([]);
  }
  async function closePoll() {
    if (!poll) return;
    await teacherPost("/api/teacher/poll", { action: "close", pollId: poll.id });
    setPoll(null); setAnswers([]); setQuestion(""); setMc(false); setChoices(["", "", "", ""]);
  }

  useEffect(() => {
    if (!poll) return;
    const fetchA = async () => {
      const result = await teacherApiRequest<{ answers: Answer[] }>(`/api/teacher/poll?pollId=${encodeURIComponent(poll.id)}`);
      setAnswers(result.answers);
    };
    fetchA();
    ansRef.current = setInterval(fetchA, 3000);
    return () => { if (ansRef.current) clearInterval(ansRef.current); };
  }, [poll]);

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
        .se-fld { font-size:0.74rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; color:#a89f8c; margin:14px 0 7px; }
        .se-fld:first-of-type { margin-top:0; }
        .se-skills { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:8px; }
        .se-skill { display:flex; align-items:center; gap:8px; text-align:left; background:#f6f1e6; border:1px solid #e7dec9; color:#5a5346;
          border-radius:12px; padding:11px 13px; font-weight:800; font-size:0.88rem; cursor:pointer; }
        .se-skill:hover { border-color:#14b8a6; }
        .se-skill.on { background:#14b8a6; border-color:#14b8a6; color:#04231f; }
        .se-skill-emoji { font-size:1.15rem; }
        .se-pills { display:flex; flex-wrap:wrap; gap:8px; }
        .se-pill { background:#f6f1e6; border:1px solid #e7dec9; color:#5a5346; border-radius:999px; padding:9px 15px; font-weight:800; font-size:0.88rem; cursor:pointer; }
        .se-pill:hover { border-color:#14b8a6; }
        .se-pill.on { background:#1c1d22; border-color:#1c1d22; color:#fff; }
        .se-chtitle { font-size:1.1rem; font-weight:900; color:#1c1d22; }
        .se-lb { display:flex; flex-direction:column; gap:6px; margin-top:10px; }
        .se-lb-row { display:flex; align-items:center; gap:12px; padding:11px 14px; border-radius:12px; background:#fbf7ef; border:1px solid #efe7d6; }
        .se-lb-rank { width:30px; font-size:1.1rem; font-weight:900; color:#5a5346; }
        .se-lb-name { flex:1; font-weight:800; color:#2a2a2e; }
        .se-lb-acc { font-weight:700; color:#a89f8c; font-size:0.85rem; }
        .se-lb-pts { font-weight:900; color:#14b8a6; font-size:1.05rem; min-width:48px; text-align:right; }
      `}</style>

      <SiteNav variant="teacher" />
      <div className="se-wrap">
        <h1 className="se-h1">Join with a code</h1>

        {!supabase && <div className="se-warn">Supabase isn&apos;t connected yet — add your keys in Vercel and redeploy.</div>}
        {error && <div className="se-err">{error}</div>}

        {supabase && !session && (
          <div className="se-card">
            <div className="se-row">
              <select className="se-sel" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
                {periods.length === 0 && <option value="">No periods — add rosters first</option>}
                {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button className="se-start" onClick={start} disabled={!periodId}>Start session</button>
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
                  <button key={s.value} className={`se-send${(broadcast || "free") === s.value ? " on" : ""}`} onClick={() => setBroadcastTo(s.value)}>{s.label}</button>
                ))}
              </div>
              <p className="se-empty" style={{ marginTop: 10 }}>
                {broadcast && broadcast !== "free"
                  ? `Joined students are following ${SENDS.find((mode) => mode.value === broadcast)?.label || broadcast}.`
                  : "Students are browsing freely."}
              </p>
            </div>

            <div className="se-card" id="challenge" style={{ scrollMarginTop: 80 }}>
              <h3 className="se-qh">Challenge - live game</h3>
              {chSetup && (
                <div className="se-warn" style={{ marginBottom: 12 }}>
                  One-time setup: open the Supabase SQL Editor and run <b>supabase/challenges.sql</b>, then try again.
                </div>
              )}
              {!challenge ? (
                <>
                  <div className="se-fld">Skill</div>
                  <div className="se-skills">
                    {SKILLS.map((s) => (
                      <button key={s.key} className={`se-skill${chSkill === s.key ? " on" : ""}`}
                        onClick={() => { setChSkill(s.key); setChLevel(1); }}>
                        <span className="se-skill-emoji">{s.emoji}</span>{s.label}
                      </button>
                    ))}
                  </div>

                  <div className="se-fld">Difficulty</div>
                  <div className="se-pills">
                    {activeSkill.levels.map((lvl, i) => (
                      <button key={i} className={`se-pill${chLevel === i + 1 ? " on" : ""}`} onClick={() => setChLevel(i + 1)}>
                        {i + 1}. {lvl}
                      </button>
                    ))}
                  </div>

                  <div className="se-fld">Length</div>
                  <div className="se-pills">
                    {DURATIONS.map((d) => (
                      <button key={d.value} className={`se-pill${chDuration === d.value ? " on" : ""}`} onClick={() => setChDuration(d.value)}>
                        {d.label}
                      </button>
                    ))}
                  </div>

                  <button className="se-start" style={{ marginTop: 16 }} onClick={startChallenge} disabled={!joins.length}>
                    Launch challenge
                  </button>
                  {!joins.length && <p className="se-empty" style={{ marginTop: 8 }}>Students need to join first.</p>}
                </>
              ) : (
                <>
                  <div className="se-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div className="se-chtitle">{activeSkill.emoji} {challenge.title}</div>
                    <button className="se-end" onClick={stopChallenge}>End challenge</button>
                  </div>
                  <div className="se-count" style={{ marginTop: 12 }}>Live leaderboard · {board.length} playing</div>
                  {board.length === 0 ? (
                    <span className="se-empty">Waiting for the first answers…</span>
                  ) : (
                    <div className="se-lb">
                      {board.slice(0, 10).map((r, i) => (
                        <div className="se-lb-row" key={r.key}>
                          <span className="se-lb-rank">{i + 1}</span>
                          <span className="se-lb-name">{r.name}</span>
                          <span className="se-lb-acc">{r.total ? Math.round((r.correct / r.total) * 100) : 0}%</span>
                          <span className="se-lb-pts">{r.points}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
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
                <button className="se-start" onClick={pushPoll} disabled={!question.trim()}>Push to class</button>
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
