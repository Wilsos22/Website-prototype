"use client";

// Student LESSON page. Pulls today's lesson from /api/today and turns the
// Notion fields into a designed classroom view (cream / Abbie theme).

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import SiteNav from "@/components/SiteNav";

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
}

const TOOL_ROUTES: Record<string, string> = {
  "whiteboard": "/whiteboard", "number line": "/number-line-plus", "fraction bars": "/fraction-bars",
  "group bars": "/group-bars", "percent bar": "/percent-bar", "algebra tiles": "/algebra-tiles",
  "equation builder": "/equation-builder", "gems": "/order-of-operations", "order of operations": "/order-of-operations",
  "combine like terms": "/combine-like-terms", "proportions": "/proportions", "proportion builder": "/proportions", "timer": "/timer",
};
function lines(text?: string) {
  return (text || "").split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
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
const BADGE = ["#ff6b3d", "#14b8a6", "#22c55e", "#f5b915", "#4d8df6", "#8b5cf6"];

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

  useEffect(() => {
    try {
      const n = localStorage.getItem("bdm-student-name"); if (n) setFirstName(n.trim().split(/\s+/)[0]);
      const s = localStorage.getItem("bdm-student-session"); if (s) setSess(JSON.parse(s));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!sess || !supabase) return;
    let stop = false;
    const tick = async () => {
      const { data } = await supabase.from("polls").select("id,question,choices")
        .eq("session_id", sess.sessionId).eq("status", "open").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (stop) return;
      const p = data as { id: string; question: string; choices: string[] | null } | null;
      if (p && !answered.includes(p.id)) { setActivePoll(p); setSent(false); } else setActivePoll(null);
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => { stop = true; clearInterval(id); };
  }, [sess, supabase, answered]);

  async function submitPoll(ans: string) {
    if (!supabase || !activePoll || !sess || !ans.trim()) return;
    await supabase.from("poll_answers").insert({ poll_id: activePoll.id, student_id: sess.studentId, display_name: sess.name, answer: ans.trim() });
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
  const exitHref = lesson?.exitTicketLink || lesson?.assignmentLink || "/join";

  return (
    <main className="ls-page">
      <style>{`
        .ls-page { min-height:100vh; background:#fbf7ef; color:#2a2a2e; font-family:Inter,ui-sans-serif,system-ui,sans-serif; box-sizing:border-box; }
        .ls-wrap { max-width:720px; margin:0 auto; padding:0 16px 56px; }
        .ls-top { display:flex; align-items:center; justify-content:space-between; padding:16px 4px; }
        .ls-back { color:#7a7468; font-weight:800; font-size:0.88rem; text-decoration:none; }
        .ls-back:hover { color:#2a2a2e; }
        .ls-date { color:#a89f8c; font-weight:800; font-size:0.88rem; }

        .ls-hero { text-align:center; padding:6px 0 10px; }
        .ls-datehero { color:#a89f8c; font-weight:800; font-size:0.85rem; margin-bottom:10px; }
        .ls-hey { font-size:clamp(1.2rem,3.2vw,1.7rem); font-weight:900; color:#ff6b3d; margin-bottom:6px; }
        .ls-tag { display:inline-flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-bottom:12px; }
        .ls-chiptag { background:#ffe6db; color:#c2410c; font-weight:900; font-size:0.74rem; letter-spacing:0.06em; text-transform:uppercase; border-radius:999px; padding:5px 12px; }
        .ls-chiptag.t2 { background:#d8f3ec; color:#0f766e; }
        .ls-title { font-family:Georgia,"Times New Roman",serif; font-size:clamp(2rem,6vw,3.2rem); font-weight:700; color:#1c1d22; margin:0; line-height:1.05; }
        .ls-sub { color:#7a7468; font-weight:600; font-size:clamp(1rem,2.5vw,1.25rem); margin:10px auto 0; max-width:48ch; line-height:1.5; }
        .ls-stripe { display:flex; gap:5px; justify-content:center; margin:16px 0 4px; }
        .ls-stripe span { width:34px; height:7px; border-radius:4px; }

        .ls-cards { display:grid; gap:16px; margin-top:18px; }
        .ls-card { background:#fff; border:1px solid #efe7d6; border-radius:20px; padding:22px 24px; }
        .ls-h2 { margin:0 0 16px; font-size:0.8rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; color:#a89f8c; }

        .ls-warm { background:linear-gradient(180deg,#ff7a4d,#ff6b3d); border:none; display:flex; align-items:center; gap:18px; text-decoration:none; box-shadow:0 14px 30px -16px rgba(255,107,61,0.7); }
        .ls-warm-ico { width:56px; height:56px; border-radius:16px; background:rgba(255,255,255,0.22); display:grid; place-items:center; flex:none; }
        .ls-warm-ico svg { width:30px; height:30px; }
        .ls-warm-txt b { display:block; color:#fff; font-size:1.3rem; font-weight:900; }
        .ls-warm-txt span { color:rgba(255,255,255,0.9); font-weight:700; font-size:0.95rem; }

        .ls-agenda { display:grid; gap:0; }
        .ls-arow { display:flex; align-items:center; gap:16px; }
        .ls-railcol { display:flex; flex-direction:column; align-items:center; }
        .ls-num { width:46px; height:46px; border-radius:50%; display:grid; place-items:center; color:#fff; font-weight:900; font-size:1.2rem; flex:none; box-shadow:0 5px 0 0 rgba(0,0,0,0.10); }
        .ls-rail { width:4px; flex:1; min-height:20px; background:#efe7d6; border-radius:2px; margin:3px 0; }
        .ls-atext { font-size:1.1rem; font-weight:800; color:#2a2a2e; padding:8px 0; }

        .ls-two { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        @media (max-width:560px){ .ls-two { grid-template-columns:1fr; } }
        .ls-list { display:flex; flex-wrap:wrap; gap:8px; }
        .ls-pill { background:#f6f1e6; border:1px solid #efe7d6; border-radius:999px; padding:9px 15px; font-weight:800; color:#5a5346; font-size:0.92rem; }
        .ls-tool { display:inline-flex; align-items:center; gap:6px; background:#eef6ff; border:1px solid #d7e6fb; color:#1d4ed8; border-radius:12px; padding:10px 15px; font-weight:800; text-decoration:none; }
        .ls-tool:hover { border-color:#4d8df6; }
        .ls-focus { color:#4a4636; font-weight:600; line-height:1.7; white-space:pre-wrap; margin:0; font-size:1.02rem; }
        .ls-focuscard { background:#fff8ec; border-color:#ffe2a8; }
        .ls-focuscard .ls-h2 { color:#b8860b; }
        .ls-assign { display:inline-flex; align-items:center; gap:8px; background:#4d8df6; color:#fff; border-radius:13px; padding:14px 24px; font-weight:900; text-decoration:none; }
        .ls-due { color:#9a9282; font-weight:700; font-size:0.9rem; margin-top:10px; }

        .ls-exit { background:#fff4f3; border:2px solid #ffd2cd; text-align:center; }
        .ls-exit .ls-h2 { color:#ef4444; }
        .ls-exit p { color:#7a5c5a; font-weight:600; margin:0 0 16px; font-size:1.05rem; }
        .ls-exit a { display:inline-flex; align-items:center; gap:8px; background:#ef4444; color:#fff; border-radius:13px; padding:15px 30px; font-weight:900; text-decoration:none; font-size:1.05rem; }
        .ls-muted { color:#b3aa97; font-weight:600; text-align:center; padding:24px; }

        .ls-poll-overlay { position:fixed; inset:0; background:rgba(28,29,34,0.62); display:grid; place-items:center; z-index:60; padding:20px; }
        .ls-poll-card { background:#fff; border-radius:24px; padding:30px 26px; max-width:520px; width:100%; box-shadow:0 30px 80px -20px #000; text-align:center; }
        .ls-poll-q { font-size:clamp(1.4rem,4vw,2rem); font-weight:900; color:#1c1d22; margin-bottom:20px; line-height:1.2; }
        .ls-poll-choices { display:grid; gap:12px; }
        .ls-poll-choice { background:#eef6ff; border:2px solid #d7e6fb; color:#1d4ed8; border-radius:14px; padding:16px; font-size:1.15rem; font-weight:900; cursor:pointer; }
        .ls-poll-choice:hover { border-color:#4d8df6; }
        .ls-poll-open { display:flex; gap:8px; }
        .ls-poll-in { flex:1; border:2px solid #d7e6fb; border-radius:12px; padding:13px 15px; font-size:1.1rem; font-weight:700; box-sizing:border-box; }
        .ls-poll-send { background:#4d8df6; color:#fff; border:none; border-radius:12px; padding:0 22px; font-weight:900; cursor:pointer; }
        .ls-poll-sent { font-size:1.6rem; font-weight:900; color:#22c55e; }
      `}</style>

      <SiteNav variant="student" />
      <div className="ls-wrap">
        <div className="ls-hero">
          {date && <div className="ls-datehero">{fmtDate(date)}</div>}
          {firstName && <div className="ls-hey">Hey {firstName}! 👋</div>}
          <div className="ls-tag">
            {lesson?.module && <span className="ls-chiptag">{lesson.module}</span>}
            {lesson?.topic && <span className="ls-chiptag t2">{lesson.topic}</span>}
          </div>
          <h1 className="ls-title">{loading ? "Loading…" : lesson?.title || "Today's Lesson"}</h1>
          {lesson?.subtitle && <p className="ls-sub">{lesson.subtitle}</p>}
          <div className="ls-stripe">
            <span style={{ background: "#14b8a6" }} /><span style={{ background: "#8a5a2b" }} /><span style={{ background: "#f5b915" }} /><span style={{ background: "#ff6b3d" }} /><span style={{ background: "#4d8df6" }} />
          </div>
        </div>

        {!loading && !lesson && <p className="ls-muted">No lesson published for today yet — your teacher will open today&apos;s lesson soon.</p>}

        {lesson && (
          <div className="ls-cards">
            {lesson.warmUpLink && (
              <a className="ls-card ls-warm" href={lesson.warmUpLink} target="_blank" rel="noopener noreferrer">
                <span className="ls-warm-ico"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M8 5 v14 l11 -7 Z" fill="#fff" stroke="none" /></svg></span>
                <span className="ls-warm-txt"><b>Start the Warm-Up</b><span>Begin today&apos;s first task →</span></span>
              </a>
            )}

            <section className="ls-card">
              <h2 className="ls-h2">Today&apos;s plan</h2>
              <div className="ls-agenda">
                {agendaItems.map((a, i) => (
                  <div className="ls-arow" key={i}>
                    <div className="ls-railcol">
                      <div className="ls-num" style={{ background: BADGE[i % BADGE.length] }}>{i + 1}</div>
                      {i < agendaItems.length - 1 && <div className="ls-rail" />}
                    </div>
                    <div className="ls-atext">{a}</div>
                  </div>
                ))}
              </div>
            </section>

            {(supplyItems.length > 0 || toolItems.length > 0) && (
              <div className="ls-two">
                {supplyItems.length > 0 && (
                  <section className="ls-card">
                    <h2 className="ls-h2">Supplies</h2>
                    <div className="ls-list">{supplyItems.map((s, i) => <span className="ls-pill" key={i}>{s}</span>)}</div>
                  </section>
                )}
                {toolItems.length > 0 && (
                  <section className="ls-card">
                    <h2 className="ls-h2">Tools you&apos;ll need</h2>
                    <div className="ls-list">
                      {toolItems.map((t, i) => t.href
                        ? <a className="ls-tool" href={t.href} key={i}>{t.label} →</a>
                        : <span className="ls-pill" key={i}>{t.label}</span>)}
                    </div>
                  </section>
                )}
              </div>
            )}

            {lesson.essentialIdeas && (
              <section className="ls-card ls-focuscard">
                <h2 className="ls-h2">Today&apos;s focus</h2>
                <p className="ls-focus">{lesson.essentialIdeas}</p>
              </section>
            )}

            {lesson.assignmentLink && (
              <section className="ls-card">
                <h2 className="ls-h2">Assignment</h2>
                <a className="ls-assign" href={lesson.assignmentLink} target="_blank" rel="noopener noreferrer">Open assignment ↗</a>
                {lesson.dueDate && <div className="ls-due">Due {fmtDate(lesson.dueDate)}</div>}
              </section>
            )}

            <section className="ls-card ls-exit">
              <h2 className="ls-h2">Exit Ticket</h2>
              <p>Finish strong — complete your exit ticket before the timer ends.</p>
              <a href={exitHref} target={isExternalLink(exitHref) ? "_blank" : undefined} rel="noopener noreferrer">Start exit ticket →</a>
            </section>
          </div>
        )}
      </div>

      {activePoll && (
        <div className="ls-poll-overlay">
          <div className="ls-poll-card">
            {sent ? <div className="ls-poll-sent">✓ Answer sent!</div> : (
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
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
