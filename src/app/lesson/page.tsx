"use client";

// Student LESSON page — today's agenda, laid out vertically.
// Pulls today's lesson from /api/today (Notion). Sections: agenda, today's focus,
// supplies, tools you'll need, assignment/resources, and the exit ticket at the
// bottom. Fields not yet in Notion show sensible defaults the teacher can wire up.

import { useEffect, useState } from "react";

interface LessonData {
  title: string; subtitle: string; essentialIdeas: string;
  assignmentLink: string; date: string; dueDate: string; topic: string; module: string;
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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/today", { cache: "no-store" });
        const data = await res.json() as { lesson: LessonData | null; date: string };
        setLesson(data.lesson); setDate(data.date || "");
      } catch { /* ignore */ } finally { setLoading(false); }
    })();
  }, []);

  return (
    <main className="ls-page">
      <style>{`
        .ls-page { min-height:100vh; background:#fbf7ef; font-family:Inter,ui-sans-serif,system-ui,sans-serif; padding:0 0 40px; box-sizing:border-box; }
        .ls-top { display:flex; align-items:center; justify-content:space-between; padding:16px clamp(16px,4vw,40px); }
        .ls-back { color:#7a7468; font-weight:800; font-size:0.85rem; text-decoration:none; }
        .ls-date { color:#a89f8c; font-weight:800; font-size:0.85rem; }
        .ls-wrap { max-width:680px; margin:0 auto; padding:0 16px; display:grid; gap:16px; }

        .ls-hero { text-align:center; padding:8px 0 6px; }
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
      `}</style>

      <header className="ls-top">
        <a className="ls-back" href="/">← Home</a>
        <span className="ls-date">{date ? fmtDate(date) : ""}</span>
      </header>

      <div className="ls-wrap">
        <div className="ls-hero">
          {lesson?.module && <span className="ls-tag">{lesson.module}</span>}
          <h1 className="ls-title">{loading ? "Loading…" : lesson?.title || "Today's Lesson"}</h1>
          {lesson?.subtitle && <p className="ls-sub">{lesson.subtitle}</p>}
        </div>

        <section className="ls-card">
          <h2>Today&apos;s agenda</h2>
          <div className="ls-agenda">
            {DEFAULT_AGENDA.map((a, i) => (
              <div className="ls-arow" key={a}><span className="ls-num">{i + 1}</span>{a}</div>
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
          <div className="ls-list">{DEFAULT_SUPPLIES.map((s) => <span className="ls-chip" key={s}>{s}</span>)}</div>
        </section>

        <section className="ls-card">
          <h2>Tools you&apos;ll need</h2>
          <div className="ls-list">
            {DEFAULT_TOOLS.map((t) => <a className="ls-toolbtn" href={t.href} key={t.href}>{t.label} →</a>)}
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
          <a href={lesson?.assignmentLink || "/join"} target={lesson?.assignmentLink ? "_blank" : undefined} rel="noopener noreferrer">Start exit ticket →</a>
        </section>

        {!loading && !lesson && <p className="ls-muted">No lesson published for today yet. Your teacher will add today&apos;s agenda in Notion.</p>}
      </div>
    </main>
  );
}
