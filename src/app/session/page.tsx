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
  liveTimerSeconds,
  saveTeacherSession,
  type LiveClassFlowSnapshot,
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
interface TodayLesson { id: string; lessonCode?: string; title?: string }

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

// A live, scaled-down look at one classroom surface. The iframe renders the
// real page (they poll on their own, so the thumbnail stays current) at a
// fixed 1280x800 logical size, scaled to the card. Clicks fall through to the
// card link, which opens the surface full size in its own window.
const PREVIEW_LOGICAL_WIDTH = 1280;
const PREVIEW_LOGICAL_HEIGHT = 800;

function ScreenPreview({ label, note, href, src }: { label: string; note: string; href: string; src: string }) {
  const frameRef = useRef<HTMLSpanElement | null>(null);
  const [scale, setScale] = useState(0.15);
  useEffect(() => {
    const measure = () => {
      const width = frameRef.current?.clientWidth;
      if (width) setScale(width / PREVIEW_LOGICAL_WIDTH);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return (
    <a className="se-screen-link se-screen-prev" href={href} target="_blank" rel="noreferrer">
      <span className="se-screen-prev-frame" ref={frameRef} aria-hidden="true">
        <iframe
          className="se-screen-prev-iframe"
          src={src}
          title={`${label} live preview`}
          loading="lazy"
          tabIndex={-1}
          style={{ transform: `scale(${scale})` }}
        />
      </span>
      <strong>{label}</strong><span>{note}</span>
    </a>
  );
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

  const [poll, setPoll] = useState<{ id: string; question: string; choices: string[] | null } | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const ansRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [broadcast, setBroadcast] = useState<string | null>(null);
  const [todayLesson, setTodayLesson] = useState<TodayLesson | null>(null);
  const [liveFlow, setLiveFlow] = useState<LiveClassFlowSnapshot | null>(null);
  const [flowBusy, setFlowBusy] = useState<string | null>(null);
  const [flowNote, setFlowNote] = useState<string | null>(null);
  const [, setTimerTick] = useState(0);

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

  // Today's published lesson powers the Begin button - straight into the
  // live class host with the lesson loaded and running.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/today", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { lesson: TodayLesson | null }) => {
        if (!cancelled && data.lesson?.id) setTodayLesson(data.lesson);
      })
      .catch(() => { /* the Begin button simply stays hidden */ });
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

  // Lesson transport: watch the live flow through the Remote's own endpoint.
  // The GET also runs the server's lazy automatic-pacing check, so a lesson
  // started here keeps advancing while this page is open - no control panel
  // needed. Returns nothing until the session is in Live Class Flow mode.
  useEffect(() => {
    if (!session) { setLiveFlow(null); return; }
    let stopped = false;
    const check = async () => {
      try {
        const result = await teacherApiRequest<{ session: { liveFlow: LiveClassFlowSnapshot | null } | null }>(
          `/api/control-remote?sessionId=${encodeURIComponent(session.id)}`,
        );
        if (!stopped) {
          setLiveFlow(result.session?.liveFlow || null);
          if (result.session) setBroadcast(LIVE_FLOW_MODE);
        }
      } catch { /* transient - retry next tick */ }
    };
    void check();
    const interval = setInterval(check, 3000);
    return () => { stopped = true; clearInterval(interval); };
  }, [session]);

  // One-second tick so the toolbar countdown runs between polls.
  useEffect(() => {
    if (!liveFlow?.timer?.running) return;
    const interval = setInterval(() => setTimerTick((tick) => tick + 1), 1000);
    return () => clearInterval(interval);
  }, [liveFlow?.timer?.running]);

  async function sendFlowAction(action: "start-lesson" | "previous" | "toggle-timer" | "next") {
    if (!session || flowBusy) return;
    setFlowBusy(action);
    setFlowNote(null);
    try {
      const payload: Record<string, unknown> = { action, sessionId: session.id };
      if (action === "start-lesson") payload.lessonCode = todayLesson?.lessonCode || "";
      const result = await teacherPost<{
        session?: { liveFlow: LiveClassFlowSnapshot | null };
        liveFlow?: LiveClassFlowSnapshot | null;
      }>("/api/control-remote", payload);
      const nextFlow = result.session?.liveFlow || result.liveFlow || null;
      if (nextFlow) {
        setLiveFlow(nextFlow);
        setBroadcast(LIVE_FLOW_MODE);
      }
    } catch (actionError) {
      setFlowNote(actionError instanceof Error ? actionError.message : "The lesson control did not go through.");
    } finally {
      setFlowBusy(null);
    }
  }

  // Ad-hoc questions now come from the lesson steps, so this page no longer
  // composes polls. The open-question card below survives purely as the
  // off-switch: an orphaned open poll otherwise blocks every student who joins.
  async function closePoll() {
    if (!poll) return;
    await teacherPost("/api/teacher/poll", { action: "close", pollId: poll.id });
    setPoll(null); setAnswers([]);
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
        .se-begin-wrap { display:grid; justify-items:center; gap:7px; margin:6px 0 14px; }
        .se-begin-lesson { color:#5a5346; font-size:0.92rem; font-weight:800; }
        .se-begin-wrap .se-start { display:inline-block; text-decoration:none; font-size:1.1rem; padding:15px 34px; }
        .se-flowbar { display:grid; justify-items:center; gap:10px; margin:6px 0 14px; }
        .se-flow-now { display:grid; gap:2px; }
        .se-flow-state { color:#1c1d22; font-size:1.15rem; font-weight:900; }
        .se-flow-meta { color:#7a7468; font-size:0.85rem; font-weight:800; font-variant-numeric:tabular-nums; }
        .se-flow-keys { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
        .se-flow-key { min-height:52px; min-width:110px; border:2px solid #e7dec9; border-radius:12px; background:#fbf7ef;
          color:#2a2a2e; padding:0 20px; font:inherit; font-size:1rem; font-weight:900; cursor:pointer; }
        .se-flow-key:hover:not(:disabled) { border-color:#14b8a6; }
        .se-flow-key:disabled { opacity:0.55; cursor:not-allowed; }
        .se-flow-key.primary { background:#14b8a6; border-color:#14b8a6; color:#04231f; }
        .se-flow-note { margin:0 0 10px; color:#92660a; font-size:0.88rem; font-weight:800; }
        .se-flow-none { margin:6px 0 14px; color:#a89f8c; font-size:0.9rem; font-weight:700; }
        .se-code-actions { display:flex; gap:14px; align-items:center; justify-content:center; }
        .se-host-link { color:#7a7468; font-size:0.86rem; font-weight:800; text-decoration:underline; }
        .se-host-link:hover { color:#14b8a6; }
        .se-collapse > summary { list-style:none; cursor:pointer; }
        .se-collapse > summary::-webkit-details-marker { display:none; }
        .se-collapse-summary { display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap; }
        .se-collapse-hint { color:#a89f8c; font-size:0.82rem; font-weight:800; }
        .se-collapse[open] .se-collapse-hint { display:none; }
        .se-collapse[open] > summary { margin-bottom:12px; }
        .se-screen-intro { margin:0 0 14px; color:#5a5346; font-size:0.92rem; font-weight:650; line-height:1.5; }
        .se-screen-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
        .se-screen-link { min-height:82px; box-sizing:border-box; display:flex; flex-direction:column; justify-content:center; gap:5px;
          border:1px solid #d9d1c1; border-radius:13px; background:#fbf7ef; color:#2a2a2e; padding:13px; text-decoration:none; }
        .se-screen-link:hover, .se-screen-link:focus-visible { border-color:#14b8a6; outline:3px solid rgba(20,184,166,0.18); outline-offset:2px; }
        .se-screen-link strong { font-size:0.98rem; font-weight:900; }
        .se-screen-link span { color:#7a7468; font-size:0.78rem; font-weight:700; line-height:1.35; }
        .se-screen-prev { justify-content:flex-start; gap:7px; padding:10px 10px 12px; }
        .se-screen-prev-frame { position:relative; display:block; width:100%; aspect-ratio:${PREVIEW_LOGICAL_WIDTH} / ${PREVIEW_LOGICAL_HEIGHT}; overflow:hidden;
          border:1px solid #e7dec9; border-radius:9px; background:#fff; }
        .se-screen-prev-iframe { position:absolute; top:0; left:0; width:${PREVIEW_LOGICAL_WIDTH}px; height:${PREVIEW_LOGICAL_HEIGHT}px; border:0; transform-origin:top left; pointer-events:none; }
        .se-remote-link { display:block; margin-top:10px; color:#5a5346; font-size:0.86rem; font-weight:800; text-decoration:underline; }
        .se-remote-link:hover { color:#14b8a6; }
        .se-count { font-size:1rem; font-weight:800; color:#5a5346; margin-bottom:10px; }
        .se-joins { display:flex; flex-wrap:wrap; gap:8px; }
        .se-chip { background:#e7f8f3; border:1px solid #b9ebdf; color:#0f766e; border-radius:999px; padding:9px 16px; font-weight:800; animation:sePop 0.3s ease; }
        .se-admissions { display:grid; gap:10px; }
        .se-admission-row { display:grid; grid-template-columns:minmax(92px,auto) minmax(190px,1fr) auto; gap:10px; align-items:center;
          border:1px solid #ffe2a8; background:#fffaf0; border-radius:12px; padding:12px; }
        .se-admission-code { color:#92660a; font-size:1.18rem; font-weight:900; letter-spacing:0.1em; }
        .se-admission-help { margin:0 0 12px; color:#7a7468; font-size:0.9rem; font-weight:650; line-height:1.45; }
        @media (max-width:560px) { .se-admission-row, .se-screen-grid { grid-template-columns:1fr; } .se-admission-row .se-start { width:100%; } }
        @keyframes sePop { from{transform:scale(0.85); opacity:0.4;} to{transform:none; opacity:1;} }
        .se-empty { color:#b3aa97; font-weight:600; }
        .se-warn { background:#fff7e6; border:1px solid #ffe2a8; color:#92660a; border-radius:14px; padding:16px 18px; font-weight:700; line-height:1.6; }
        .se-err { background:#fdecea; border:1px solid #f5c6c0; color:#b91c1c; border-radius:12px; padding:12px 16px; font-weight:700; }
        .se-qh { margin:0 0 12px; font-size:1.1rem; font-weight:900; color:#2a2a2e; }
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
        <h1 className="se-h1">Live session</h1>

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
              {liveFlow?.sequence ? (
                <div className="se-flowbar">
                  <div className="se-flow-now">
                    <span className="se-flow-state">{liveFlow.state?.label || "Lesson running"}</span>
                    <span className="se-flow-meta">
                      Step {liveFlow.sequence.currentIndex + 1} of {liveFlow.sequence.totalSteps}
                      {liveFlow.timer ? ` · ${Math.floor(liveTimerSeconds(liveFlow.timer) / 60)}:${String(liveTimerSeconds(liveFlow.timer) % 60).padStart(2, "0")}` : ""}
                    </span>
                  </div>
                  <div className="se-flow-keys">
                    <button className="se-flow-key" onClick={() => sendFlowAction("previous")} disabled={Boolean(flowBusy)}>
                      {flowBusy === "previous" ? "Sending" : "Back"}
                    </button>
                    <button className="se-flow-key" onClick={() => sendFlowAction("toggle-timer")} disabled={Boolean(flowBusy)}>
                      {flowBusy === "toggle-timer" ? "Sending" : liveFlow.timer?.running ? "Pause" : "Resume"}
                    </button>
                    <button className="se-flow-key primary" onClick={() => sendFlowAction("next")} disabled={Boolean(flowBusy)}>
                      {flowBusy === "next" ? "Sending" : "Next state"}
                    </button>
                  </div>
                </div>
              ) : todayLesson ? (
                <div className="se-begin-wrap">
                  <div className="se-begin-lesson">
                    {[todayLesson.lessonCode, todayLesson.title].filter(Boolean).join(" · ") || "Today's published lesson"}
                  </div>
                  <button className="se-start" onClick={() => sendFlowAction("start-lesson")} disabled={Boolean(flowBusy)}>
                    {flowBusy === "start-lesson" ? "Starting" : "Start today's lesson"}
                  </button>
                </div>
              ) : (
                <p className="se-flow-none">No lesson is published for today, so there is nothing to start yet.</p>
              )}
              {flowNote && <p className="se-flow-note" role="status">{flowNote}</p>}
              <div className="se-code-actions">
                <a className="se-host-link" href="/control">Open Live class host</a>
                <button className="se-end" onClick={end} disabled={ending}>{ending ? "Ending session" : "End session"}</button>
              </div>
            </div>
            <section className="se-card" aria-labelledby="classroom-screens-title">
              <h2 className="se-qh" id="classroom-screens-title">Classroom screens</h2>
              <p className="se-screen-intro">
                Live previews of what the room sees. Tap one to open it full size:
                Main on panel 1, Pace + Support on panel 2. Keep Live class host on the laptop.
              </p>
              <div className="se-screen-grid">
                <ScreenPreview
                  label="Main"
                  note="Problem, story, visuals, and live writing"
                  href={`/teacher/present?session=${encodeURIComponent(session.id)}`}
                  src={`/teacher/present?session=${encodeURIComponent(session.id)}`}
                />
                <ScreenPreview
                  label="Pace + Support"
                  note="Timer and the current student directions"
                  href={`/teacher/pace?session=${encodeURIComponent(session.id)}`}
                  src={`/teacher/pace?session=${encodeURIComponent(session.id)}`}
                />
                <ScreenPreview
                  label="Student"
                  note={broadcast && broadcast !== "free" && broadcast.startsWith("/")
                    ? `Following ${SENDS.find((mode) => mode.value === broadcast)?.label || broadcast}`
                    : "The students' default lesson view"}
                  href={broadcast?.startsWith("/") ? broadcast : "/lesson"}
                  src={`${broadcast?.startsWith("/") ? broadcast : "/lesson"}?teacherPreview=1`}
                />
              </div>
              <a className="se-remote-link" href={`/teacher/remote?session=${encodeURIComponent(session.id)}`} target="_blank" rel="noreferrer">
                Open iPad Remote - private controls, notes, Abbie, sound, and writing
              </a>
            </section>
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

            {challenge ? (
              <div className="se-card" id="challenge" style={{ scrollMarginTop: 80 }}>
                <h3 className="se-qh">Challenge - live game</h3>
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
              </div>
            ) : (
            <details className="se-card se-collapse" id="challenge" style={{ scrollMarginTop: 80 }}>
              <summary className="se-collapse-summary">
                <span className="se-qh" style={{ margin: 0 }}>Challenge - live game</span>
                <span className="se-collapse-hint">Open to launch a quick game</span>
              </summary>
              {chSetup && (
                <div className="se-warn" style={{ margin: "12px 0" }}>
                  One-time setup: open the Supabase SQL Editor and run <b>supabase/challenges.sql</b>, then try again.
                </div>
              )}
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
            </details>
            )}

            {poll && (
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
