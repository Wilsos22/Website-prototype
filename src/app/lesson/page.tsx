"use client";

// Student LESSON page — today's agenda, laid out vertically.
// Pulls today's lesson from /api/today (Notion). Sections: agenda, today's focus,
// supplies, tools you'll need, assignment/resources, and the exit ticket at the
// bottom. Fields not yet in Notion show sensible defaults the teacher can wire up.

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

interface LessonData {
  title: string; subtitle: string; essentialIdeas: string;
  assignmentLink: string; date: string; dueDate: string; topic: string; module: string;
  agenda?: string; supplies?: string; tools?: string; warmUpLink?: string; exitTicketLink?: string;
}

const TOOL_ROUTES: Record<string, string> = {
  "whiteboard": "/whiteboard", "number line": "/number-line-plus", "fraction bars": "/fraction-bars",
  "group bars": "/group-bars", "percent bar": "/percent-bar", "algebra tiles": "/algebra-tiles",
  "equation builder": "/equation-builder", "gems": "/order-of-operations", "order of operations": "/order-of-operations",
  "combine like terms": "/combine-like-terms", "proportions": "/proportions", "proportion builder": "/proportions", "timer": "/timer",
};
function lines(text?: string) { return (text || "").split(/[\n,]/).map((s) => s.trim()).filter(Boolean); }
function parseTools(text?: string): { label: string; href: string }[] {
  if (!text || !text.trim()) return DEFAULT_TOOLS;
  return lines(text).map((name) => ({ label: name, href: TOOL_ROUTES[name.toLowerCase()] || "" }));
}

const DEFAULT_AGENDA = ["Warm-Up", "Mini-lesson & notes", "Practice with a partner", "Independent practice", "Exit Ticket"];
const DEFAULT_SUPPLIES = ["Pencil", "Notebook or paper", "Chromebook (charged)"];
const DEFAULT_TOOLS: { label: string; href: string }[] = [
  { label: "Whiteboard", href: "/whiteboard" },
  { label: "Number Line", href: "/number-line-plus" },
  { label: "Percent Bar", href: "/percent-bar" },
];

function fmtDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

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
  const supplyItems = lesson?.supplies?.trim() ? lines(lesson.supplies) : DEFAULT_SUPPLIES;
  const toolItems = parseTools(lesson?.tools);
  const exitHref = lesson?.exitTicketLink || lesson?.assignmentLink || "/join";

  return (
    <main className="ls-page">
      <style>{`
        .ls-page { min-height:100vh; background:#fbf7ef; font-family:Inter,ui-sans-serif,system-ui,sans-serif; padding:0 0 40px; box-sizing:border-box; }
        .ls-top { display:flex; align-items:center; justify-content:space-between; padding:16px clamp(16px,4vw,40px); }
        .ls-back { color:#7a7468; font-weight:800; font-size:0.85rem; text-decoration:none; }
        .ls-date { color:#a89f8c; font-weight:800; font-size:0.85rem; }
        .ls-wrap { max-width:680px; margin:0 auto; padding:0 16px; display:grid; gap:16px; }

        .ls-hero { text-align:center; padding:8px 0 6px; }
        .ls-hey { font-size:clamp(1.3rem,3.4vw,1.9rem); font-weight:900; color:#ff6b3d; margin-bottom:6px; }
        .ls-tag { display:inline-block; background:#ffe6db; color:#c2410c; font-weight:900; font-size:0.72rem; letter-spacing:0.1em; text-transform:uppercase; border-radius:999px; padding:5px 12px; margin-bottom:10px; }
        .ls-title { font-family:Georgia,"Times New Roman",serif; font-size:clamp(1.8rem,5vw,2.8rem); font-weight:700; color:#1c1d22; margin:0; line-height:1.08; }
        .ls-sub { color:#7a7468; font-weight:600; font-size:clamp(1rem,2.4vw,1.2rem); margin:8px 0 0; }

        .ls-card { background:#fff; border:1px solid #efe7d6; border-radius:18px; padding:18px 20px; }
        .ls-card h2 { margin:0 0 12px; font-size:0.78rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; color:#a89f8c; }
        .ls-agenda { display:grid; gap:10px; }
        .ls-arow { display:flex; align-items:center; gap:12px; font-weight:700; color:#2a2a2e; }
        .ls-num { width:30px; height:30px; border-radius:50%; background:#fff1ea; color:#ff6b3d; font-weight:900; display:grid; place-items:center; flex:none; }
        .ls-list { display:flex; flex-wrap:wrap; gap:8px; }
        .ls-chip { background:#f6f1e6; border:1px solid #efe7d6; border-radius:999px; padding:8px 14px; font-weight:800; color:#5a5346; font-size:0.92rem; }
        .ls-toolbtn { display:inline-flex; align-items:center; gap:8px; background:#eef6ff; border:1px solid #d7e6fb; color:#1d4ed8; border-radius:12px; padding:10px 16px; font-weight:800; text-decoration:none; }
        .ls-focus { color:#4a4636; font-weight:600; line-height:1.6; white-space:pre-wrap; }
        .ls-assign { display:inline-flex; align-items:center; gap:8px; background:#4d8df6; color:#fff; border-radius:12px; padding:13px 22px; font-weight:900; text-decoration:none; }
        .ls-due { color:#9a9282; font-weight:700; font-size:0.9rem; margin-top:8px; }

        .ls-exit { background:#fff4f3; border:2px solid #ffd2cd; border-radius:20px; padding:22px; text-align:center; }
        .ls-exit h2 { color:#ef4444; }
        .ls-exit p { color:#7a5c5a; font-weight:600; margin:0 0 14px; }
        .ls-exit a { display:inline-flex; align-items:center; gap:8px; background:#ef4444; color:#fff; border-radius:12px; padding:13px 26px; font-weight:900; text-decoration:none; }
        .ls-muted { color:#b3aa97; font-weight:600; font-size:0.9rem; text-align:center; padding:20px; }
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

      <header className="ls-top">
        <a className="ls-back" href="/">← Home</a>
        <span className="ls-date">{date ? fmtDate(date) : ""}</span>
      </header>

      <div className="ls-wrap">
        <div className="ls-hero">
          {firstName && <div className="ls-hey">Hey {firstName}! 👋</div>}
          {lesson?.module && <span className="ls-tag">{lesson.module}</span>}
          <h1 className="ls-title">{loading ? "Loading…" : lesson?.title || "Today's Lesson"}</h1>
          {lesson?.subtitle && <p className="ls-sub">{lesson.subtitle}</p>}
        </div>

        {lesson?.warmUpLink && (
          <section className="ls-card" style={{ borderColor: "#ffd2a8", background: "#fff7ed" }}>
            <h2>Warm-Up</h2>
            <a className="ls-assign" style={{ background: "#ff6b3d" }} href={lesson.warmUpLink} target="_blank" rel="noopener noreferrer">Start the warm-up ↗</a>
          </section>
        )}

        <section className="ls-card">
          <h2>Today&apos;s agenda</h2>
          <div className="ls-agenda">
            {agendaItems.map((a, i) => (
              <div className="ls-arow" key={i}><span className="ls-num">{i + 1}</span>{a}</div>
            ))}
          </div>
        </section>

        {lesson?.essentialIdeas && (
          <section className="ls-card">
            <h2>Today&apos;s focus</h2>
            <p className="ls-focus">{lesson.essentialIdeas}</p>
          </section>
        )}

        <section className="ls-card">
          <h2>Supplies</h2>
          <div className="ls-list">{supplyItems.map((s, i) => <span className="ls-chip" key={i}>{s}</span>)}</div>
        </section>

        <section className="ls-card">
          <h2>Tools you&apos;ll need</h2>
          <div className="ls-list">
            {toolItems.map((t, i) => t.href
              ? <a className="ls-toolbtn" href={t.href} key={i}>{t.label} →</a>
              : <span className="ls-chip" key={i}>{t.label}</span>)}
          </div>
        </section>

        {lesson?.assignmentLink && (
          <section className="ls-card">
            <h2>Assignment &amp; resources</h2>
            <a className="ls-assign" href={lesson.assignmentLink} target="_blank" rel="noopener noreferrer">Open assignment ↗</a>
            {lesson.dueDate && <div className="ls-due">Due {fmtDate(lesson.dueDate)}</div>}
          </section>
        )}

        <section className="ls-exit">
          <h2>Exit Ticket</h2>
          <p>Finish strong — complete your exit ticket before the timer ends.</p>
          <a href={exitHref} target={exitHref.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">Start exit ticket →</a>
        </section>

        {!loading && !lesson && <p className="ls-muted">No lesson published for today yet. Your teacher will add today&apos;s agenda in Notion.</p>}
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
