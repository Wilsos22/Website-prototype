"use client";

// Student LESSON page. Pulls today's lesson from /api/today and turns the
// Notion fields into a designed classroom view (cream / Abbie theme).

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import SiteNav from "@/components/SiteNav";
import TodaysBoards from "@/components/TodaysBoards";
import {
  ensureAnonymousStudentSession,
  SECURE_STUDENT_DATA,
  studentApiRequest,
} from "@/lib/studentApi";

interface LessonData {
  title: string;
  subtitle: string;
  essentialIdeas: string;
  assignmentLink: string;
  date: string;
  dueDate: string;
  topic: string;
  module: string;
  agenda?: string;
  supplies?: string;
  tools?: string;
  suppliesConfigured?: boolean;
  toolsConfigured?: boolean;
  warmUpLink?: string;
  exitTicketLink?: string;
  learningIntention?: string;
  successCriteria?: string;
  discussionPrompt?: string;
  practiceProblems?: string;
}

const TOOL_ROUTES: Record<string, string> = {
  "whiteboard": "/whiteboard", "number line": "/number-line-plus", "fraction bars": "/fraction-bars",
  "group bars": "/group-bars", "percent bar": "/percent-bar", "algebra tiles": "/algebra-tiles",
  "equation builder": "/equation-builder", "gems": "/order-of-operations", "order of operations": "/order-of-operations",
  "combine like terms": "/combine-like-terms", "proportions": "/proportions", "proportion builder": "/proportions", "timer": "/timer",
  "balance beam": "/balance-beam",
  "box method": "/area-model", "distributive area method": "/distributive-area", "distributive area": "/distributive-area",
  "area explorer": "/area-explorer", "area of shapes": "/area-explorer",
  "ratio explainer": "/ratio-explainer", "ratios explainer": "/ratio-explainer",
  "divisibility": "/divisibility", "divisibility rules": "/divisibility",
  "place value": "/place-value", "place value reader": "/place-value",
  "place value mirror": "/place-value-mirror", "place value chart": "/place-value-mirror",
};
function lines(text?: string) {
  return (text || "").split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
}
function cleanItem(item: string) {
  return item.trim().replace(/^[-*]\s*/, "").replace(/^\d+[.)]\s*/, "").trim();
}
function textItems(text?: string) {
  return (text || "")
    .split(/\n|;/)
    .map(cleanItem)
    .filter(Boolean);
}
function sentenceItems(text?: string) {
  return (text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map(cleanItem)
    .filter(Boolean);
}
function uniqueItems(items: string[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function buildConceptItems(lesson: LessonData) {
  return uniqueItems([
    ...textItems(lesson.learningIntention),
    ...textItems(lesson.successCriteria),
    ...sentenceItems(lesson.essentialIdeas),
  ]).slice(0, 6);
}
function buildActivityItems(lesson: LessonData, agendaItems: string[]) {
  const agendaActivities = agendaItems.filter((item) => {
    const low = item.toLowerCase();
    return !low.includes("warm") && !low.includes("exit") && !low.includes("assignment");
  });

  return uniqueItems([
    ...textItems(lesson.practiceProblems),
    lesson.discussionPrompt ? `Discuss: ${lesson.discussionPrompt}` : "",
    ...agendaActivities,
  ].filter(Boolean)).slice(0, 5);
}
function parseTools(text?: string): { label: string; href: string }[] {
  return lines(text).map((name) => ({ label: name, href: TOOL_ROUTES[name.toLowerCase()] || "" }));
}

const DEFAULT_AGENDA = ["Warm-Up", "Mini-lesson & notes", "Practice with a partner", "Independent practice", "Exit Ticket"];
const DEFAULT_SUPPLIES = ["Pencil", "Notebook or paper", "Chromebook (charged)"];
const DEFAULT_TOOLS: { label: string; href: string }[] = [
  { label: "Whiteboard", href: "/whiteboard" },
  { label: "Number Line", href: "/number-line-plus" },
  { label: "Percent Bar", href: "/percent-bar" },
];
const WARMUP_IDENTITY_PLACEHOLDER = "BDM_AUTH_USER_ID";

function fmtDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
function isExternalLink(href: string) { return /^https?:\/\//i.test(href); }

export default function LessonPage() {
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState("");
  const supabase = getSupabase();
  const [sess, setSess] = useState<{ sessionId: string; studentId: string; name: string } | null>(null);
  const [activePoll, setActivePoll] = useState<{ id: string; question: string; choices: string[] | null } | null>(null);
  const [answered, setAnswered] = useState<string[]>([]);
  const [answerText, setAnswerText] = useState("");
  const [sent, setSent] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const n = localStorage.getItem("bdm-student-name"); if (n) setFirstName(n.trim().split(/\s+/)[0]);
      const s = localStorage.getItem("bdm-student-session"); if (s) setSess(JSON.parse(s));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!SECURE_STUDENT_DATA || !supabase) return;
    let stopped = false;
    const prepare = async () => {
      try {
        await ensureAnonymousStudentSession();
        const { data } = await supabase.auth.getSession();
        if (!stopped) setAuthUserId(data.session?.user.id ?? null);
      } catch {
        if (!stopped) setAuthUserId(null);
      }
    };
    void prepare();
    return () => { stopped = true; };
  }, [supabase]);

  useEffect(() => {
    if (!sess || !supabase) return;
    let stop = false;
    const tick = async () => {
      let raw: { id: string; question: string; choices: string[] | null } | null = null;
      if (SECURE_STUDENT_DATA) {
        try {
          const result = await studentApiRequest<{
            poll: { id: string; question: string; choices: string[] | null } | null;
          }>(`/api/student/session-state?sessionId=${encodeURIComponent(sess.sessionId)}`);
          raw = result.poll;
        } catch {
          raw = null;
        }
      } else {
        const { data } = await supabase.from("polls").select("id,question,choices")
          .eq("session_id", sess.sessionId).eq("status", "open").order("created_at", { ascending: false }).limit(1).maybeSingle();
        raw = data as { id: string; question: string; choices: string[] | null } | null;
      }
      if (stop) return;
      // Ignore blank/malformed polls, and treat an empty choices array as open-
      // ended, so a bad row can't drop an unanswerable full-screen block on the class.
      const p = raw && raw.question && raw.question.trim()
        ? { id: raw.id, question: raw.question, choices: Array.isArray(raw.choices) && raw.choices.length ? raw.choices : null }
        : null;
      if (p && !answered.includes(p.id)) { setActivePoll(p); setSent(false); } else setActivePoll(null);
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => { stop = true; clearInterval(id); };
  }, [sess, supabase, answered]);

  async function submitPoll(ans: string) {
    if (!supabase || !activePoll || !sess || !ans.trim()) return;
    setPollError(null);
    try {
      if (SECURE_STUDENT_DATA) {
        await studentApiRequest("/api/student/poll-answer", {
          method: "POST",
          body: JSON.stringify({ pollId: activePoll.id, answer: ans.trim() }),
        });
      } else {
        const { error } = await supabase.from("poll_answers").insert({ poll_id: activePoll.id, student_id: sess.studentId, display_name: sess.name, answer: ans.trim() });
        if (error) throw error;
      }
    } catch (error) {
      setPollError(error instanceof Error ? error.message : "Your answer could not be sent. Try again.");
      return;
    }
    setAnswered((a) => [...a, activePoll.id]); setSent(true); setAnswerText("");
    setTimeout(() => setActivePoll(null), 1300);
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/today", { cache: "no-store" });
        const data = await res.json() as { lesson: LessonData | null; date: string };
        setLesson(data.lesson); setDate(data.date || "");
      } catch { /* ignore */ } finally { setLoading(false); }
    })();
  }, []);

  const agendaItems = lesson?.agenda?.trim() ? lesson.agenda.split("\n").map((s) => s.trim()).filter(Boolean) : DEFAULT_AGENDA;
  const supplyItems = lesson ? (lesson.suppliesConfigured ? lines(lesson.supplies) : DEFAULT_SUPPLIES) : [];
  const toolItems = lesson ? (lesson.toolsConfigured ? parseTools(lesson.tools) : DEFAULT_TOOLS) : [];
  const lessonDate = lesson?.date || date;
  const topicLabel = lesson?.topic || lesson?.module || "Math 6";
  const conceptItems = lesson ? buildConceptItems(lesson) : [];
  const activityItems = lesson ? buildActivityItems(lesson, agendaItems) : [];
  const exitHref = lesson?.exitTicketLink || "/exit-ticket";
  const warmupHref = lesson?.warmUpLink && authUserId
    ? lesson.warmUpLink
      .replaceAll(WARMUP_IDENTITY_PLACEHOLDER, encodeURIComponent(authUserId))
      .replaceAll(encodeURIComponent(WARMUP_IDENTITY_PLACEHOLDER), encodeURIComponent(authUserId))
    : lesson?.warmUpLink || "";

  return (
    <main className="ls-page">
      <style>{`
        .ls-page { min-height:100vh; background:var(--bdb-ground); color:var(--bdb-ink); font-family:var(--bdb-font); }
        .ls-wrap { max-width:1120px; margin:0 auto; padding:10px clamp(16px,3vw,32px) 60px; }
        .ls-hero { display:grid; grid-template-columns:minmax(0,1fr) 330px; gap:18px; align-items:stretch; margin-top:4px; }
        .ls-hero-main { background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r); padding:clamp(22px,4vw,36px); box-shadow:var(--bdb-shadow-sm); }
        .ls-kicker { color:var(--bdb-coral); font-size:0.78rem; font-weight:800; letter-spacing:0.1em; text-transform:uppercase; margin-bottom:14px; }
        .ls-title { max-width:780px; margin:0; color:var(--bdb-ink); font-size:clamp(2.2rem,5.7vw,4.3rem); font-weight:800; letter-spacing:0; line-height:0.98; }
        .ls-sub { max-width:64ch; margin:16px 0 0; color:var(--bdb-ink-soft); font-size:clamp(1.02rem,2.2vw,1.25rem); font-weight:550; line-height:1.48; }
        .ls-hey { margin:0 0 12px; color:var(--bdb-teal); font-size:clamp(1.05rem,2vw,1.35rem); font-weight:800; }
        .ls-meta { display:grid; gap:12px; }
        .ls-meta-card { background:var(--bdb-ink); color:#fff; border-radius:var(--bdb-r); padding:20px; min-height:132px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:var(--bdb-shadow); }
        .ls-meta-card.topic { background:var(--bdb-teal); }
        .ls-meta-label { color:rgba(255,255,255,0.72); font-size:0.75rem; font-weight:800; letter-spacing:0.09em; text-transform:uppercase; }
        .ls-meta-value { font-size:clamp(1.28rem,2.6vw,1.65rem); font-weight:800; line-height:1.1; }
        .ls-module { color:rgba(255,255,255,0.78); font-size:0.9rem; font-weight:750; margin-top:8px; }
        .ls-actions { display:grid; grid-template-columns:1fr; gap:12px; margin-top:18px; }
        .ls-action { display:flex; align-items:center; justify-content:space-between; gap:14px; min-height:72px; border-radius:var(--bdb-r); padding:16px 18px; font-weight:800; text-decoration:none; border:1px solid transparent; }
        .ls-action.primary { background:var(--bdb-coral); color:#fff; box-shadow:0 16px 32px -18px rgba(249,83,53,0.65); }
        .ls-action.idle { background:color-mix(in srgb, var(--bdb-coral) 9%, white); border-color:color-mix(in srgb, var(--bdb-coral) 26%, white); color:#8a3324; }
        .ls-action span { display:block; color:inherit; opacity:0.78; font-size:0.86rem; font-weight:700; margin-top:3px; }
        .ls-action-word { flex:none; font-size:0.82rem; letter-spacing:0.08em; text-transform:uppercase; opacity:0.78; }

        .ls-sections { display:grid; gap:18px; margin-top:20px; }
        .ls-section { background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r); padding:clamp(20px,3.4vw,30px); box-shadow:var(--bdb-shadow-sm); }
        .ls-section-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:18px; }
        .ls-eyebrow { margin:0 0 6px; color:var(--bdb-ink-faint); font-size:0.74rem; font-weight:850; letter-spacing:0.1em; text-transform:uppercase; }
        .ls-h2 { margin:0; color:var(--bdb-ink); font-size:clamp(1.45rem,3vw,2.15rem); font-weight:800; letter-spacing:0; line-height:1.08; }
        .ls-section-copy { max-width:58ch; margin:8px 0 0; color:var(--bdb-ink-soft); font-size:1rem; font-weight:550; line-height:1.55; }
        .ls-concepts { background:linear-gradient(135deg, color-mix(in srgb, var(--bdb-amber) 13%, white), var(--bdb-card) 58%); border-color:color-mix(in srgb, var(--bdb-amber) 36%, white); }
        .ls-concept-layout { display:grid; grid-template-columns:minmax(260px,0.72fr) minmax(0,1fr); gap:22px; align-items:start; }
        .ls-concept-summary { border-left:5px solid var(--bdb-amber); padding-left:16px; color:#5f4931; font-size:1.05rem; font-weight:650; line-height:1.62; white-space:pre-wrap; }
        .ls-concept-list { display:grid; gap:10px; margin:0; padding:0; list-style:none; }
        .ls-concept-item { display:flex; gap:11px; align-items:flex-start; color:var(--bdb-ink); font-size:1rem; font-weight:650; line-height:1.45; }
        .ls-dot { width:10px; height:10px; border-radius:50%; background:var(--bdb-teal); margin-top:7px; flex:none; }
        .ls-empty { margin:0; color:var(--bdb-ink-soft); font-weight:600; line-height:1.55; }

        .ls-activity-grid { display:grid; grid-template-columns:minmax(0,1fr) 330px; gap:20px; align-items:start; }
        .ls-number-list { display:grid; gap:10px; margin:0; padding:0; list-style:none; }
        .ls-number-item { display:grid; grid-template-columns:38px minmax(0,1fr); gap:12px; align-items:start; }
        .ls-num { width:38px; height:38px; border-radius:50%; display:grid; place-items:center; background:var(--bdb-teal); color:#fff; font-weight:850; }
        .ls-number-text { padding-top:7px; color:var(--bdb-ink); font-size:1.02rem; font-weight:650; line-height:1.42; }
        .ls-side-panel { background:var(--bdb-ground-2); border:1px solid var(--bdb-line); border-radius:var(--bdb-r-sm); padding:16px; }
        .ls-side-title { margin:0 0 12px; color:var(--bdb-ink); font-size:1rem; font-weight:850; }
        .ls-list { display:flex; flex-wrap:wrap; gap:8px; }
        .ls-pill { background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r-pill); color:var(--bdb-ink-soft); padding:8px 12px; font-size:0.9rem; font-weight:700; }
        .ls-tool { display:inline-flex; align-items:center; min-height:38px; background:color-mix(in srgb, var(--bdb-teal) 13%, white); border:1px solid color-mix(in srgb, var(--bdb-teal) 32%, white); color:#0f5e5f; border-radius:var(--bdb-r-sm); padding:8px 12px; font-weight:800; text-decoration:none; }
        .ls-tool:hover { border-color:var(--bdb-teal); }
        .ls-link-card { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; border:1px solid var(--bdb-line); border-radius:var(--bdb-r-sm); padding:18px; background:var(--bdb-ground); }
        .ls-link-title { margin:0; color:var(--bdb-ink); font-size:1.12rem; font-weight:850; }
        .ls-link-copy { margin:5px 0 0; color:var(--bdb-ink-soft); font-size:0.95rem; font-weight:600; line-height:1.42; }
        .ls-link-button { display:inline-flex; align-items:center; justify-content:center; min-height:44px; padding:0 18px; border-radius:var(--bdb-r-sm); background:var(--bdb-teal); color:#fff; font-weight:850; text-decoration:none; white-space:nowrap; }
        .ls-link-button.coral { background:var(--bdb-coral); }
        .ls-link-button.idle { background:var(--bdb-ink); }
        .ls-status { display:inline-flex; margin-top:10px; color:var(--bdb-ink-faint); font-size:0.88rem; font-weight:750; }
        .ls-muted { color:var(--bdb-ink-faint); font-weight:650; text-align:center; padding:34px 20px; background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r); }
        .ls-boards { overflow:hidden; }
        .ls-board-list { display:grid; gap:14px; }
        .ls-board-link { display:block; }
        .ls-board-image { width:100%; height:auto; display:block; border-radius:var(--bdb-r-sm); border:1px solid var(--bdb-line); background:#fff; }

        .ls-poll-overlay { position:fixed; inset:0; background:rgba(32,30,26,0.62); display:grid; place-items:center; z-index:60; padding:20px; }
        .ls-poll-card { background:var(--bdb-card); border-radius:22px; padding:30px 26px; max-width:520px; width:100%; box-shadow:var(--bdb-shadow-lg); text-align:center; }
        .ls-poll-q { font-size:clamp(1.4rem,4vw,2rem); font-weight:700; color:var(--bdb-ink); margin-bottom:20px; line-height:1.2; }
        .ls-poll-choices { display:grid; gap:12px; }
        .ls-poll-choice { background:color-mix(in srgb, var(--bdb-teal) 14%, white); border:2px solid color-mix(in srgb, var(--bdb-teal) 30%, white); color:#0f5e5f; border-radius:14px; padding:16px; font-size:1.15rem; font-weight:700; cursor:pointer; }
        .ls-poll-choice:hover { border-color:var(--bdb-teal); }
        .ls-poll-open { display:flex; gap:8px; }
        .ls-poll-in { flex:1; border:2px solid color-mix(in srgb, var(--bdb-teal) 30%, white); border-radius:12px; padding:13px 15px; font-size:1.1rem; font-weight:600; box-sizing:border-box; }
        .ls-poll-send { background:var(--bdb-teal); color:#fff; border:none; border-radius:12px; padding:0 22px; font-weight:700; cursor:pointer; }
        .ls-poll-sent { font-size:1.6rem; font-weight:700; color:var(--bdb-green); }
        .ls-poll-error { color:var(--bdb-coral); font-weight:700; margin-top:12px; }
        @media (max-width:840px) {
          .ls-hero, .ls-concept-layout, .ls-activity-grid { grid-template-columns:1fr; }
          .ls-meta { grid-template-columns:1fr 1fr; }
        }
        @media (max-width:560px) {
          .ls-wrap { padding-inline:14px; }
          .ls-meta { grid-template-columns:1fr; }
          .ls-section-head, .ls-link-card { display:block; }
          .ls-link-button { width:100%; margin-top:14px; }
          .ls-poll-open { flex-direction:column; }
          .ls-poll-send { min-height:48px; }
        }
      `}</style>

      <SiteNav variant="student" />
      <div className="ls-wrap">
        <div className="ls-hero">
          <section className="ls-hero-main">
            {firstName && <p className="ls-hey">Hey {firstName}.</p>}
            <div className="ls-kicker">Student lesson page</div>
            <h1 className="ls-title">{loading ? "Loading..." : lesson?.title || "Today's Lesson"}</h1>
            {lesson?.subtitle && <p className="ls-sub">{lesson.subtitle}</p>}

            {lesson && (
              <div className="ls-actions">
                {warmupHref ? (
                  <a className="ls-action primary" href={warmupHref} target="_blank" rel="noopener noreferrer">
                    <b>Start the warm-up<span>Open today's first task.</span></b>
                    <span className="ls-action-word">Open</span>
                  </a>
                ) : (
                  <div className="ls-action idle">
                    <b>Warm-up<span>Your teacher will share the warm-up when it is ready.</span></b>
                    <span className="ls-action-word">Soon</span>
                  </div>
                )}
              </div>
            )}
          </section>

          <aside className="ls-meta" aria-label="Lesson details">
            <div className="ls-meta-card">
              <span className="ls-meta-label">Date</span>
              <span className="ls-meta-value">{lessonDate ? fmtDate(lessonDate) : "Today"}</span>
            </div>
            <div className="ls-meta-card topic">
              <span className="ls-meta-label">Topic</span>
              <span className="ls-meta-value">{topicLabel}</span>
              {lesson?.module && <span className="ls-module">{lesson.module}</span>}
            </div>
          </aside>
        </div>

        {!loading && !lesson && (
          <p className="ls-muted">No lesson is published for today yet. Your teacher will open today&apos;s lesson soon.</p>
        )}

        {lesson && (
          <div className="ls-sections">
            <section className="ls-section ls-concepts">
              <div className="ls-section-head">
                <div>
                  <p className="ls-eyebrow">Absent student start here</p>
                  <h2 className="ls-h2">Important lesson concepts</h2>
                  <p className="ls-section-copy">These are the ideas you need before you try the activity or assignment.</p>
                </div>
              </div>

              <div className="ls-concept-layout">
                <div className="ls-concept-summary">
                  {lesson.essentialIdeas || lesson.subtitle || "Read the lesson title, then ask your teacher which notes to copy before starting the practice."}
                </div>
                {conceptItems.length > 0 ? (
                  <ul className="ls-concept-list">
                    {conceptItems.map((item) => (
                      <li className="ls-concept-item" key={item}>
                        <span className="ls-dot" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="ls-empty">Your teacher has not added concept notes yet. Copy the class notes first, then begin the activity.</p>
                )}
              </div>
            </section>

            <section className="ls-section">
              <div className="ls-section-head">
                <div>
                  <p className="ls-eyebrow">Activity</p>
                  <h2 className="ls-h2">What we are doing in class</h2>
                  <p className="ls-section-copy">Use this section to catch the main classroom task, discussion prompt, and any tools you need.</p>
                </div>
              </div>

              <div className="ls-activity-grid">
                <div>
                  {activityItems.length > 0 ? (
                    <ol className="ls-number-list">
                      {activityItems.map((item, i) => (
                        <li className="ls-number-item" key={item}>
                          <span className="ls-num">{i + 1}</span>
                          <span className="ls-number-text">{item}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="ls-empty">Your teacher will give the activity directions in class. If you were absent, start with the concept notes above.</p>
                  )}
                </div>

                <aside className="ls-side-panel">
                  <h3 className="ls-side-title">Helpful tools and supplies</h3>
                  <div className="ls-list">
                    {toolItems.map((t, i) => t.href
                      ? <a className="ls-tool" href={t.href} key={`${t.label}-${i}`}>{t.label}</a>
                      : <span className="ls-pill" key={`${t.label}-${i}`}>{t.label}</span>)}
                    {supplyItems.map((s, i) => <span className="ls-pill" key={`${s}-${i}`}>{s}</span>)}
                  </div>
                </aside>
              </div>
            </section>

            <section className="ls-section">
              <div className="ls-section-head">
                <div>
                  <p className="ls-eyebrow">Assignment</p>
                  <h2 className="ls-h2">Practice to turn in</h2>
                  <p className="ls-section-copy">This is the work connected to today's lesson.</p>
                </div>
              </div>

              <div className="ls-link-card">
                <div>
                  <p className="ls-link-title">{lesson.assignmentLink ? "Open the assignment" : "Assignment link coming soon"}</p>
                  <p className="ls-link-copy">
                    {lesson.assignmentLink
                      ? "Open the assigned practice and complete the problems your teacher selected."
                      : "Your teacher will post the assignment link when it is ready."}
                  </p>
                  {lesson.dueDate && <span className="ls-status">Due {fmtDate(lesson.dueDate)}</span>}
                </div>
                {lesson.assignmentLink && (
                  <a className="ls-link-button" href={lesson.assignmentLink} target="_blank" rel="noopener noreferrer">Open assignment</a>
                )}
              </div>
            </section>

            <TodaysBoards date={lessonDate} />

            <section className="ls-section">
              <div className="ls-section-head">
                <div>
                  <p className="ls-eyebrow">Exit ticket</p>
                  <h2 className="ls-h2">Show what you understood</h2>
                  <p className="ls-section-copy">Answer on your own. Use your notes, model, or explanation from today's activity.</p>
                </div>
              </div>

              <div className="ls-link-card">
                <div>
                  <p className="ls-link-title">{lesson.exitTicketLink ? "Open the exit ticket" : "Wait for the live exit ticket"}</p>
                  <p className="ls-link-copy">
                    {lesson.exitTicketLink
                      ? "Complete the exit ticket after the activity."
                      : "When your teacher starts the live exit ticket, this button takes you to the waiting screen."}
                  </p>
                </div>
                <a className={`ls-link-button ${lesson.exitTicketLink ? "coral" : "idle"}`} href={exitHref} target={isExternalLink(exitHref) ? "_blank" : undefined} rel="noopener noreferrer">
                  {lesson.exitTicketLink ? "Open exit ticket" : "Open waiting screen"}
                </a>
              </div>
            </section>
          </div>
        )}
      </div>

      {activePoll && (
        <div className="ls-poll-overlay">
          <div className="ls-poll-card">
            {sent ? <div className="ls-poll-sent">Answer sent.</div> : (
              <>
                <div className="ls-poll-q">{activePoll.question}</div>
                {activePoll.choices ? (
                  <div className="ls-poll-choices">
                    {activePoll.choices.map((c) => <button key={c} className="ls-poll-choice" onClick={() => submitPoll(c)}>{c}</button>)}
                  </div>
                ) : (
                  <div className="ls-poll-open">
                    <input className="ls-poll-in" value={answerText} placeholder="Your answer" autoFocus
                      onChange={(e) => setAnswerText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submitPoll(answerText); }} />
                    <button className="ls-poll-send" onClick={() => submitPoll(answerText)}>Send</button>
                  </div>
                )}
                {pollError && <div className="ls-poll-error">{pollError}</div>}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
