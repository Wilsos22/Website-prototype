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
interface Join { id: string; student_id: string | null; display_name: string | null; joined_at: string; }
interface Answer { id: string; display_name: string | null; answer: string | null; }
interface RosterStudent {
  id: string;
  periodId: string;
  fullName: string;
  email: string | null;
  identityLinked: boolean;
}
interface AdmissionRequest { id: string; requestCode: string; requestedAt: string; }
interface TeacherSessionRow {
  id: string;
  status: string;
  period_id: string;
  join_code: string | null;
  broadcast: string | null;
}

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
  const [session, setSession] = useState<{ id: string; code: string; periodName: string; periodId: string } | null>(null);
  const [joins, setJoins] = useState<Join[]>([]);
  const [rosterStudents, setRosterStudents] = useState<RosterStudent[]>([]);
  const [rosterCount, setRosterCount] = useState(0);
  const [admissionRequests, setAdmissionRequests] = useState<AdmissionRequest[]>([]);
  const [admissionSelections, setAdmissionSelections] = useState<Record<string, string>>({});
  const [admittingRequestCode, setAdmittingRequestCode] = useState<string | null>(null);
  const [admissionError, setAdmissionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [ending, setEnding] = useState(false);
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

  // Recover the server's open session, even when this browser does not have the
  // local teacher-session marker. Teacher Home, Control, and this page must all
  // resolve to the same server row instead of offering to start a duplicate.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const roster = await teacherApiRequest<{ periods: Period[]; students: RosterStudent[] }>("/api/teacher/roster");
        if (cancelled) return;
        setPeriods(roster.periods);
        setRosterStudents(roster.students);
        setPeriodId((current) => current || roster.periods[0]?.id || "");

        const requestedSessionId = new URLSearchParams(window.location.search).get("sessionId")?.trim() || "";
        const stored = getStoredTeacherSession();
        let openSession: TeacherSessionRow | null = null;

        if (requestedSessionId) {
          const result = await teacherApiRequest<{ session: TeacherSessionRow }>(
            `/api/teacher/session?sessionId=${encodeURIComponent(requestedSessionId)}`,
          ).catch(() => ({ session: null }));
          if (result.session?.status === "open") {
            openSession = result.session;
          }
        }

        if (!openSession) {
          const result = await teacherApiRequest<{ sessions: TeacherSessionRow[] }>("/api/teacher/session");
          openSession = result.sessions.find((candidate) => candidate.status === "open") ?? null;
        }

        if (cancelled) return;
        if (!openSession) {
          if (stored) clearStoredTeacherSession(stored.sessionId);
          return;
        }

        const periodName = roster.periods.find((period) => period.id === openSession.period_id)?.name
          || (stored?.sessionId === openSession.id ? stored.periodName : "")
          || "Class";
        const code = openSession.join_code
          || (stored?.sessionId === openSession.id ? stored.code : "")
          || "----";
        setRosterCount(roster.students.filter((student) => student.periodId === openSession.period_id).length);
        setBroadcast(openSession.broadcast);
        setSession({ id: openSession.id, code, periodName, periodId: openSession.period_id });
        saveTeacherSession(openSession.id, code, periodName);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "The current session could not be loaded.");
        }
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const pollJoins = useCallback(async (sessionId: string) => {
    const result = await teacherApiRequest<{ joins: Join[]; admissionRequests?: AdmissionRequest[] }>(`/api/teacher/session?sessionId=${encodeURIComponent(sessionId)}`);
    setJoins(result.joins);
    setAdmissionRequests(result.admissionRequests || []);
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
    // Start in free mode so students can complete the assigned warm-up from the
    // homepage before Begin lesson starts synchronized pacing.
    let data: { id: string; broadcast: string | null };
    try {
      const result = await teacherPost<{ session: { id: string; broadcast: string | null } }>("/api/teacher/session", { action: "start", periodId, joinCode: code });
      data = result.session;
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Session could not be started."); return; }
    const periodName = periods.find((p) => p.id === periodId)?.name || "";
    const roster = await teacherApiRequest<{ students: RosterStudent[] }>("/api/teacher/roster");
    setRosterStudents(roster.students);
    setRosterCount(roster.students.filter((student) => student.periodId === periodId).length);
    const sessionId = data.id;
    saveTeacherSession(sessionId, code, periodName);
    setSession({ id: sessionId, code, periodName, periodId });
    setJoins([]); setAdmissionRequests([]); setBroadcast(data.broadcast || "free");
  }
  async function end() {
    if (!session || ending) return;
    if (!window.confirm("End this session for every connected student?")) return;
    // Close any polls still open for this session so they can't linger and block
    // students who later join (an orphaned open poll otherwise has no off-switch).
    setEnding(true);
    setError(null);
    try {
      await teacherPost("/api/teacher/session", { action: "close", sessionId: session.id });
      clearStoredTeacherSession(session.id);
      setSession(null); setJoins([]); setAdmissionRequests([]); setPoll(null); setAnswers([]); setBroadcast(null);
      setChallenge(null); setBoard([]);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The session could not be ended.");
    } finally {
      setEnding(false);
    }
  }
  async function admitStudent(request: AdmissionRequest) {
    if (!session || admittingRequestCode) return;
    const studentEmail = admissionSelections[request.id];
    if (!studentEmail) {
      setAdmissionError("Choose the student whose Chromebook shows this approval code.");
      return;
    }
    setAdmissionError(null);
    setAdmittingRequestCode(request.requestCode);
    try {
      await teacherPost("/api/teacher/session", {
        action: "admit",
        sessionId: session.id,
        requestCode: request.requestCode,
        studentEmail,
      });
      setAdmissionSelections((current) => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
      await pollJoins(session.id);
    } catch (actionError) {
      setAdmissionError(actionError instanceof Error ? actionError.message : "The student could not be admitted.");
    } finally {
      setAdmittingRequestCode(null);
    }
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
        .se-admissions { display:grid; gap:10px; }
        .se-admission-row { display:grid; grid-template-columns:minmax(92px,auto) minmax(190px,1fr) auto; gap:10px; align-items:center;
          border:1px solid #ffe2a8; background:#fffaf0; border-radius:12px; padding:12px; }
        .se-admission-code { color:#92660a; font-size:1.18rem; font-weight:900; letter-spacing:0.1em; }
        .se-admission-help { margin:0 0 12px; color:#7a7468; font-size:0.9rem; font-weight:650; line-height:1.45; }
        @media (max-width:560px) { .se-admission-row { grid-template-columns:1fr; } .se-admission-row .se-start { width:100%; } }
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

        {supabase && initializing && (
          <div className="se-card"><p className="se-empty">Checking for an open session.</p></div>
        )}

        {supabase && !initializing && !session && (
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
              <button className="se-end" onClick={end} disabled={ending}>{ending ? "Ending session" : "End session"}</button>
            </div>
            {admissionRequests.length > 0 && (
              <div className="se-card">
                <h3 className="se-qh">Waiting for teacher: {admissionRequests.length}</h3>
                <p className="se-admission-help">Match the code on the Chromebook, choose the student, then admit.</p>
                {admissionError && <div className="se-err" style={{ marginBottom: 10 }} role="status">{admissionError}</div>}
                <div className="se-admissions">
                  {admissionRequests.map((request) => {
                    const availableStudents = rosterStudents.filter((student) =>
                      student.periodId === session.periodId &&
                      Boolean(student.email) &&
                      !joins.some((join) => join.student_id === student.id),
                    );
                    return (
                      <div className="se-admission-row" key={request.id}>
                        <strong className="se-admission-code">{request.requestCode}</strong>
                        <select
                          className="se-sel"
                          aria-label={`Student for approval code ${request.requestCode}`}
                          value={admissionSelections[request.id] || ""}
                          onChange={(event) => setAdmissionSelections((current) => ({
                            ...current,
                            [request.id]: event.target.value,
                          }))}
                        >
                          <option value="">Choose student</option>
                          {availableStudents.map((student) => (
                            <option key={student.id} value={student.email || ""}>{student.fullName}</option>
                          ))}
                        </select>
                        <button
                          className="se-start"
                          onClick={() => admitStudent(request)}
                          disabled={!admissionSelections[request.id] || admittingRequestCode !== null}
                        >
                          {admittingRequestCode === request.requestCode ? "Admitting" : "Admit"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
                        {s.label}
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
                    <div className="se-chtitle">{challenge.title}</div>
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
