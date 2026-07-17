"use client";

// Big Dog Math — STUDENT landing. Join is the main event: enter the class code to
// link to the teacher's live session. A quiet secondary option ("Absent or just
// exploring") drops into the full site (/explore) for own-time browsing.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import {
  clearClassModeExitMarker,
  clearStoredStudentSession,
  markStudentTab,
  type StoredStudentSession,
} from "@/lib/liveClassFlow";
import {
  ensureAnonymousStudentSession,
  personalizeWarmupLink,
  SECURE_STUDENT_DATA,
  StudentApiError,
  studentApiRequest,
} from "@/lib/studentApi";
import { STUDENT_SESSION_READY_EVENT } from "@/components/ClassSync";

type ClaimedStudent = { id: string; name: string; email: string };
type WarmupSessionLesson = { code: string; title: string };

const REQUIRE_GOOGLE_AUTH = process.env.NEXT_PUBLIC_REQUIRE_STUDENT_GOOGLE_AUTH === "true";
const WARMUP_IDENTITY = process.env.NEXT_PUBLIC_WARMUP_IDENTITY_ENABLED === "true";

export default function StudentLanding() {
  const router = useRouter();
  const supabase = getSupabase();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [joinSess, setJoinSess] = useState<{ id: string; periodId: string; syncKey: string } | null>(null);
  const [roster, setRoster] = useState<{ id: string; full_name: string }[]>([]);
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [warmupHref, setWarmupHref] = useState<string | null>(null);
  const [warmupToken, setWarmupToken] = useState<string | null>(null);
  const [sessionLesson, setSessionLesson] = useState<WarmupSessionLesson | null>(null);
  const [identityReady, setIdentityReady] = useState(false);
  const [helpRequestCode, setHelpRequestCode] = useState<string | null>(null);
  const [requestingHelp, setRequestingHelp] = useState(false);
  const [authLoading, setAuthLoading] = useState(REQUIRE_GOOGLE_AUTH);
  const [student, setStudent] = useState<ClaimedStudent | null>(null);

  useEffect(() => {
    try { const n = localStorage.getItem("bdm-student-name"); if (n) setName(n.trim().split(/\s+/)[0]); } catch { /* ignore */ }
    if (SECURE_STUDENT_DATA) {
      void (async () => {
        try {
          const pending = sessionStorage.getItem("bdm-pending-class-code");
          if (pending) {
            await ensureAnonymousStudentSession();
            const link = await fetchWarmupLink(pending);
            setCode(pending);
            setPendingCode(pending);
            setIdentityReady(false);
            setWarmupToken(link.warmupToken);
            setSessionLesson(link.lesson);
            if (!link.open) {
              resetPendingSession("That session ended. Enter the new class code.");
              return;
            }
            setWarmupHref(link.href);
          }
        } catch (error) {
          if (error instanceof StudentApiError && error.code === "session_not_open") {
            resetPendingSession("That session ended. Enter the new class code.");
          } else {
            setJoinErr(error instanceof Error ? error.message : "Secure student sign-in is unavailable.");
          }
        }
      })();
    }
  }, []);

  useEffect(() => {
    if (!REQUIRE_GOOGLE_AUTH) return;
    if (!supabase) {
      setJoinErr("School sign-in is not configured yet.");
      setAuthLoading(false);
      return;
    }
    let stopped = false;
    const loadStudent = async () => {
      try {
        const result = await studentApiRequest<{ student: ClaimedStudent }>("/api/student/claim", { method: "POST" });
        if (!stopped) {
          setStudent(result.student);
          setName(result.student.name.trim().split(/\s+/)[0]);
        }
      } catch (error) {
        if (!stopped && error instanceof StudentApiError && error.code !== "student_session_missing") {
          setJoinErr(error.message);
        }
      } finally {
        if (!stopped) setAuthLoading(false);
      }
    };
    void loadStudent();
    return () => { stopped = true; };
  }, [supabase]);

  async function fetchWarmupLink(classCode: string): Promise<{
    open: boolean;
    href: string | null;
    warmupToken: string;
    lesson: WarmupSessionLesson | null;
  }> {
    const data = await studentApiRequest<{
      sessionId: string;
      warmupToken: string;
      warmUpLink: string | null;
      lesson: WarmupSessionLesson | null;
    }>("/api/student/warmup-start", {
      method: "POST",
      body: JSON.stringify({ code: classCode }),
    });
    // A class code must resolve only to the lesson the teacher loaded into that
    // live session. Falling back to a date-based lesson can open an unrelated or
    // superseded form when the teacher has not selected a lesson yet. The same
    // server call also rotates the one-time token if the teacher replaces the
    // assigned Form.
    const link = data.warmUpLink || null;
    return {
      open: true,
      href: link ? personalizeWarmupLink(link, data.warmupToken) : null,
      warmupToken: data.warmupToken,
      lesson: data.lesson || null,
    };
  }

  function resetPendingSession(message: string | null = null) {
    setPendingCode(null);
    setWarmupHref(null);
    setWarmupToken(null);
    setSessionLesson(null);
    setIdentityReady(false);
    setHelpRequestCode(null);
    clearStoredStudentSession();
    try { sessionStorage.removeItem("bdm-pending-class-code"); } catch { /* ignore */ }
    if (message) setJoinErr(message);
  }

  // The teacher may load the lesson after Chromebooks have already accepted
  // the class code. Keep checking that specific live session throughout Warm-Up
  // so a replaced Form link appears without a refresh. Never substitute a
  // date-based lesson.
  useEffect(() => {
    if (!SECURE_STUDENT_DATA || !pendingCode) return;
    let stopped = false;
    let checking = false;
    const refreshWarmup = async () => {
      if (checking || stopped) return;
      checking = true;
      try {
        const result = await fetchWarmupLink(pendingCode);
        if (stopped) return;
        if (!result.open) {
          resetPendingSession("That session ended. Enter the new class code.");
          return;
        }
        if (warmupToken && warmupToken !== result.warmupToken) {
          clearStoredStudentSession();
          setIdentityReady(false);
          setHelpRequestCode(null);
        }
        setWarmupToken(result.warmupToken);
        setWarmupHref(result.href);
        setSessionLesson(result.lesson);
      } catch (error) {
        if (error instanceof StudentApiError && error.code === "session_not_open") {
          resetPendingSession("That session ended. Enter the new class code.");
        } else if (error instanceof StudentApiError && error.code === "warmup_form_not_connected") {
          setJoinErr(error.message);
        }
        // Other temporary lookup failures are retried while the code is pending.
      } finally {
        checking = false;
      }
    };
    void refreshWarmup();
    const interval = window.setInterval(refreshWarmup, 3000);
    window.addEventListener("focus", refreshWarmup);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWarmup);
    };
    // fetchWarmupLink reads and binds only the session-scoped URL for pendingCode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCode, warmupToken]);

  async function signInWithGoogle() {
    setJoinErr(null);
    if (!supabase) {
      setJoinErr("School sign-in is not configured yet.");
      return;
    }
    const options: { redirectTo: string; queryParams?: Record<string, string> } = {
      redirectTo: `${window.location.origin}/auth/callback?next=/`,
    };
    const domain = process.env.NEXT_PUBLIC_STUDENT_EMAIL_DOMAIN?.trim();
    if (domain) options.queryParams = { hd: domain };
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options });
    if (error) setJoinErr(`School sign-in is not available: ${error.message}`);
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setStudent(null);
    setName("");
    setJoinSess(null);
    setRoster([]);
    setJoinErr(null);
    setPendingCode(null);
    setWarmupHref(null);
    setWarmupToken(null);
    setSessionLesson(null);
    setIdentityReady(false);
    setHelpRequestCode(null);
    try {
      localStorage.removeItem("bdm-student-session");
      sessionStorage.removeItem("bdm-pending-class-code");
    } catch { /* ignore */ }
  }

  function saveVerifiedJoin(result: { session: StoredStudentSession }) {
    clearClassModeExitMarker();
    localStorage.setItem("bdm-student-name", result.session.name);
    localStorage.setItem("bdm-student-session", JSON.stringify(result.session));
    if (result.session.syncKey) sessionStorage.setItem("bdm-pending-class-code", result.session.syncKey);
    setIdentityReady(true);
    markStudentTab();
    window.dispatchEvent(new Event(STUDENT_SESSION_READY_EVENT));
  }

  useEffect(() => {
    if (!SECURE_STUDENT_DATA || !pendingCode || identityReady) return;
    let stopped = false;
    let checking = false;
    const check = async () => {
      if (checking || stopped) return;
      checking = true;
      try {
        const status = await studentApiRequest<{ sessionId: string; complete: boolean }>(
          "/api/student/warmup-status",
          { method: "POST", body: JSON.stringify({ code: pendingCode }) },
        );
        if (!status.complete) return;
        const result = await studentApiRequest<{ session: StoredStudentSession }>(
          "/api/student/join",
          { method: "POST", body: JSON.stringify({ code: pendingCode }) },
        );
        if (!stopped && result.session.sessionId === status.sessionId) saveVerifiedJoin(result);
      } catch (error) {
        const waitingForForm = error instanceof StudentApiError
          && (error.code === "warmup_verification_required" || error.code === "warmup_not_complete");
        if (!waitingForForm && error instanceof StudentApiError && error.code === "session_not_open") {
          resetPendingSession("That session ended. Enter the new class code.");
        } else if (!waitingForForm) {
          setJoinErr(error instanceof Error ? error.message : "Warm-up verification could not be checked.");
        }
      } finally {
        checking = false;
      }
    };
    void check();
    const interval = window.setInterval(check, 3000);
    window.addEventListener("focus", check);
    return () => { stopped = true; window.clearInterval(interval); window.removeEventListener("focus", check); };
    // saveVerifiedJoin only writes the verified session to stable browser storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityReady, pendingCode]);

  async function requestTeacherHelp() {
    if (!pendingCode || requestingHelp) return;
    setRequestingHelp(true);
    setJoinErr(null);
    try {
      const result = await studentApiRequest<{ request: { requestCode: string } }>(
        "/api/student/admission-request",
        { method: "POST", body: JSON.stringify({ code: pendingCode }) },
      );
      setHelpRequestCode(result.request.requestCode);
    } catch (error) {
      setJoinErr(error instanceof Error ? error.message : "Teacher help could not be requested.");
    } finally {
      setRequestingHelp(false);
    }
  }

  async function submitCode() {
    setJoinErr(null);
    const c = code.trim().toUpperCase();
    if (c.length < 2) return;
    if (!supabase) { setJoinErr("Live sessions aren't set up yet."); return; }
    if (SECURE_STUDENT_DATA) {
      setJoining(true);
      try {
        if (REQUIRE_GOOGLE_AUTH && !student) {
          setJoinErr("Sign in with your school Google account first.");
          return;
        }
        const codeResponse = await fetch("/api/student/session-code", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: c }),
        });
        const codeResult = await codeResponse.json().catch(() => ({})) as { open?: boolean; error?: string };
        if (!codeResponse.ok || !codeResult.open) {
          setJoinErr(codeResult.error || "That code is not open right now. Check with your teacher.");
          return;
        }
        await ensureAnonymousStudentSession();
        const link = await fetchWarmupLink(c);
        clearStoredStudentSession();
        sessionStorage.setItem("bdm-pending-class-code", c);
        setCode(c);
        setPendingCode(c);
        setIdentityReady(false);
        setWarmupToken(link.warmupToken);
        setSessionLesson(link.lesson);
        setHelpRequestCode(null);
        if (!link.open) {
          resetPendingSession("That session ended. Enter the new class code.");
          return;
        }
        setWarmupHref(link.href);
      } catch (error) {
        sessionStorage.removeItem("bdm-pending-class-code");
        setPendingCode(null);
        setWarmupHref(null);
        setWarmupToken(null);
        setSessionLesson(null);
        setJoinErr(error instanceof Error ? error.message : "The class could not be joined.");
      } finally {
        setJoining(false);
      }
      return;
    }
    const { data: sess } = await supabase.from("sessions").select("id,period_id").eq("join_code", c).eq("status", "open").limit(1).maybeSingle();
    if (!sess) { setJoinErr("That code isn't open right now — check with your teacher."); return; }
    const s = sess as { id: string; period_id: string };
    const { data: studs } = await supabase.from("students").select("id,full_name").eq("period_id", s.period_id).order("full_name");
    setJoinSess({ id: s.id, periodId: s.period_id, syncKey: c });
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
        localStorage.setItem("bdm-student-session", JSON.stringify({
          sessionId: joinSess.id,
          studentId: s.id,
          name: s.full_name,
          syncKey: joinSess.syncKey,
        }));
        markStudentTab();
      }
    } catch { /* ignore */ }
    router.push("/lesson");
  }

  const moduleNumber = sessionLesson?.code.match(/^M(\d+)/i)?.[1] || "";
  const topicNumber = sessionLesson?.code.match(/\.T(\d+)/i)?.[1] || "";

  return (
    <main className="st-page">
      <style>{`
        .st-page { min-height:100vh; background:var(--bdb-ground); font-family:var(--bdb-font); color:var(--bdb-ink);
          padding:clamp(18px,4vw,44px) 16px; box-sizing:border-box; display:flex; flex-direction:column; align-items:center; }
        .st-banner { width:100%; max-width:min(320px, 74vw); margin-top:clamp(2px,1vw,8px); }
        .st-banner img { width:100%; height:auto; display:block; }
        .st-hello { margin:4px 0 2px; font-size:clamp(1.35rem,3vw,1.8rem); font-weight:700; letter-spacing:-0.02em; color:var(--bdb-ink); text-align:center; }
        .st-hello-sub { margin:0 0 clamp(14px,2.4vw,20px); color:var(--bdb-ink-soft); font-weight:500; font-size:clamp(0.94rem,1.8vw,1.04rem); text-align:center; }

        .st-cards { width:100%; max-width:${pendingCode ? "680px" : "440px"}; display:grid; gap:16px; }
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
        .st-warmup { display:grid; gap:10px; text-align:left; }
        .st-lesson-card { display:grid; gap:10px; border:1px solid color-mix(in srgb,var(--bdb-teal) 28%,white); border-radius:16px;
          background:linear-gradient(135deg,color-mix(in srgb,var(--bdb-teal) 9%,white),#fff); padding:16px; }
        .st-lesson-kicker { margin:0; color:var(--bdb-teal); font-size:0.7rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
        .st-lesson-title { margin:0; color:var(--bdb-ink); font-size:clamp(1.35rem,3vw,1.8rem); font-weight:850; line-height:1.12; }
        .st-lesson-meta { display:flex; flex-wrap:wrap; gap:7px; }
        .st-lesson-pill { border:1px solid color-mix(in srgb,var(--bdb-teal) 30%,white); border-radius:999px; background:#fff;
          color:#0f5e5f; padding:6px 10px; font-size:0.76rem; font-weight:850; }
        .st-warmup-label { margin:0; color:var(--bdb-teal); font-size:0.72rem; font-weight:850; letter-spacing:0.1em; text-transform:uppercase; }
        .st-warmup-copy { margin:0; color:var(--bdb-ink-soft); font-size:0.94rem; font-weight:600; line-height:1.45; }
        .st-warmup-wait { margin:2px 0 0; color:var(--bdb-ink-faint); font-size:0.86rem; font-weight:700; }
        .st-warmup-action { background:var(--bdb-amber); border-color:var(--bdb-amber); color:#3d2a12; font-weight:900;
          box-shadow:0 14px 28px -18px rgba(252,175,56,0.9); }
        .st-warmup-action:hover { border-color:var(--bdb-amber); color:#3d2a12; filter:brightness(1.03); }
        .st-challenge-action { background:var(--bdb-teal); border-color:var(--bdb-teal); color:#fff; text-align:left; }
        .st-challenge-action:hover { border-color:var(--bdb-teal); color:#fff; filter:brightness(1.03); }
        .st-warmup-tools { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
        .st-link-btn { border:0; background:transparent; color:var(--bdb-ink-soft); padding:4px 0; font:inherit;
          font-size:0.82rem; font-weight:750; text-decoration:underline; cursor:pointer; }
        .st-help-code { margin:0; border:1px solid color-mix(in srgb, var(--bdb-amber) 58%, white); border-radius:10px;
          background:color-mix(in srgb, var(--bdb-amber) 12%, white); color:var(--bdb-ink); padding:10px 12px;
          font-size:0.86rem; font-weight:700; line-height:1.4; }
        .st-help-code strong { letter-spacing:0.12em; font-size:1rem; }

        .st-namepick-label { font-size:0.78rem; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:var(--bdb-ink-faint); margin:0 0 10px; }
        .st-names { display:flex; flex-wrap:wrap; gap:8px; }
        .st-name { background:color-mix(in srgb, var(--bdb-teal) 14%, white); border:1px solid color-mix(in srgb, var(--bdb-teal) 35%, white);
          color:#0f5e5f; border-radius:999px; padding:10px 16px; font-weight:600; cursor:pointer; font-size:0.95rem; }
        .st-name:hover { border-color:var(--bdb-teal); }
        .st-auth { display:grid; gap:10px; margin-bottom:16px; }
        .st-auth-btn { width:100%; border:1px solid var(--bdb-line); background:#fff; color:var(--bdb-ink); border-radius:12px;
          min-height:48px; padding:11px 16px; font:inherit; font-weight:750; cursor:pointer; }
        .st-auth-btn:hover { border-color:var(--bdb-teal); }
        .st-auth-who { display:flex; align-items:center; justify-content:space-between; gap:12px; border:1px solid var(--bdb-line);
          border-radius:12px; padding:10px 12px; background:color-mix(in srgb, var(--bdb-teal) 8%, white); }
        .st-auth-who p { margin:0; min-width:0; }
        .st-auth-name { font-weight:800; color:var(--bdb-ink); }
        .st-auth-email { color:var(--bdb-ink-soft); font-size:0.78rem; overflow:hidden; text-overflow:ellipsis; }
        .st-signout { border:0; background:transparent; color:var(--bdb-ink-soft); text-decoration:underline; cursor:pointer; font:inherit; font-size:0.8rem; }

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
      <p className="st-hello-sub">{pendingCode ? "Your class code is accepted. Start the warm-up, then return here." : "Enter your class code to start today's lesson."}</p>

      <div className="st-cards">
        <div className="st-join">
          {pendingCode ? (
            <div className="st-warmup">
              <section className="st-lesson-card" aria-label="Today's lesson">
                <p className="st-lesson-kicker">Today&apos;s lesson</p>
                <h2 className="st-lesson-title">{sessionLesson?.title || "Your teacher is connecting today's lesson"}</h2>
                <div className="st-lesson-meta">
                  {moduleNumber ? <span className="st-lesson-pill">Module {moduleNumber}</span> : null}
                  {topicNumber ? <span className="st-lesson-pill">Topic {topicNumber}</span> : null}
                  {sessionLesson?.code ? <span className="st-lesson-pill">{sessionLesson.code}</span> : null}
                  <span className="st-lesson-pill">Class {pendingCode}</span>
                </div>
              </section>
              <p className="st-warmup-label">Warm-up</p>
              <h2 className="st-join-h">{warmupHref ? "Start today's warm-up" : "Waiting for your teacher"}</h2>
              <p className="st-warmup-copy">
                {warmupHref
                  ? "Complete all five Google Form questions. This homepage stays open underneath so you can come right back."
                  : "Your teacher is selecting the lesson. The assigned warm-up will appear here when it is ready."}
              </p>
              {warmupHref ? (
                <a className="st-explore st-warmup-action" href={warmupHref} target="_blank" rel="noopener noreferrer">
                  Open today's warm-up
                </a>
              ) : (
                <p className="st-warmup-wait">Keep this page open. The assigned warm-up will appear automatically.</p>
              )}
              <p className="st-warmup-wait" role="status" aria-live="polite">
                {identityReady
                  ? "Warm-up connected. Choose a challenge while class gets ready."
                  : "After you submit, return here. Big Dog will connect your response automatically."}
              </p>
              {joinErr && <div className="st-joinerr" role="alert">{joinErr}</div>}
              {helpRequestCode && (
                <p className="st-help-code" role="status">
                  Tell your teacher this help code: <strong>{helpRequestCode}</strong>
                </p>
              )}
              {identityReady && (
                <a className="st-explore st-challenge-action" href="/practice">
                  <span><b>Challenge activities</b><br />Choose any practice game and work to beat your score.</span>
                </a>
              )}
              <div className="st-warmup-tools">
                {!identityReady && !helpRequestCode && (
                  <button className="st-link-btn" type="button" onClick={requestTeacherHelp} disabled={requestingHelp}>
                    {requestingHelp ? "Requesting help" : "Warm-up not connecting? Ask for help"}
                  </button>
                )}
                <button className="st-link-btn" type="button" onClick={() => resetPendingSession()}>
                  Use a different code
                </button>
              </div>
            </div>
          ) : REQUIRE_GOOGLE_AUTH && authLoading ? (
            <p className="st-join-sub">Checking your school sign-in.</p>
          ) : REQUIRE_GOOGLE_AUTH && !student ? (
            <div className="st-auth">
              <h2 className="st-join-h">Sign in to join your class</h2>
              <p className="st-join-sub">Use the school Google account already connected to your Chromebook.</p>
              <button className="st-auth-btn" onClick={signInWithGoogle}>Continue with school Google</button>
              {joinErr && <div className="st-joinerr">{joinErr}</div>}
            </div>
          ) : SECURE_STUDENT_DATA || !joinSess ? (
            <>
              {REQUIRE_GOOGLE_AUTH && student && (
                <div className="st-auth-who">
                  <p>
                    <span className="st-auth-name">{student.name}</span><br />
                    <span className="st-auth-email">{student.email}</span>
                  </p>
                  <button className="st-signout" onClick={signOut}>Not you?</button>
                </div>
              )}
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
                <button className="st-code-btn" onClick={submitCode} disabled={joining}>{joining ? "Checking" : "Join"}</button>
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

        {!pendingCode && (
          <a className="st-explore" href="/explore">
            <span>Just looking around? <b>Explore the math tools</b></span>
          </a>
        )}
      </div>

      <div className="st-foot">
        <a className="st-teacher" href="/teacher">Teacher</a>
      </div>
    </main>
  );
}
