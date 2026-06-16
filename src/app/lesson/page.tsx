"use client";

// Student LESSON page. Pulls today's lesson from /api/today and turns the
// Notion fields into a designed classroom view.

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

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

function fmtDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function shortDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isExternalLink(href: string) {
  return /^https?:\/\//i.test(href);
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
  const supplyItems = lesson ? (lesson.suppliesConfigured ? lines(lesson.supplies) : DEFAULT_SUPPLIES) : [];
  const toolItems = lesson ? (lesson.toolsConfigured ? parseTools(lesson.tools) : DEFAULT_TOOLS) : [];
  const exitHref = lesson?.exitTicketLink || lesson?.assignmentLink || "/join";
  const hasPrimaryActions = Boolean(lesson?.warmUpLink || lesson?.assignmentLink || exitHref);

  return (
    <main className="ls-page">
      <style>{`
        .ls-page {
          min-height: 100vh;
          background: #f6f8fb;
          color: #172033;
          font-family: Inter, ui-sans-serif, system-ui, sans-serif;
          box-sizing: border-box;
        }
        .ls-shell {
          width: min(1120px, calc(100% - 32px));
          margin: 0 auto;
          padding: 22px 0 44px;
        }
        .ls-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 20px;
        }
        .ls-nav {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .ls-link {
          color: #42526b;
          font-weight: 800;
          font-size: 0.92rem;
          text-decoration: none;
          border: 1px solid #d9e2ef;
          border-radius: 8px;
          padding: 9px 12px;
          background: #ffffff;
        }
        .ls-link:hover {
          border-color: #2563eb;
          color: #1d4ed8;
        }
        .ls-date {
          color: #64748b;
          font-weight: 800;
          font-size: 0.95rem;
          text-align: right;
        }

        .ls-hero {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 280px;
          gap: 22px;
          align-items: stretch;
          margin-bottom: 18px;
        }
        .ls-hero-main,
        .ls-hero-side,
        .ls-panel,
        .ls-action,
        .ls-empty {
          background: #ffffff;
          border: 1px solid #d9e2ef;
          border-radius: 8px;
          box-shadow: 0 16px 42px -34px rgba(15, 23, 42, 0.42);
        }
        .ls-hero-main {
          padding: 30px;
          border-left: 8px solid #2563eb;
        }
        .ls-kicker {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          color: #2563eb;
          font-size: 0.86rem;
          font-weight: 900;
          margin-bottom: 18px;
        }
        .ls-pill {
          display: inline-flex;
          align-items: center;
          min-height: 28px;
          border-radius: 999px;
          padding: 0 10px;
          background: #eff6ff;
          color: #1d4ed8;
          font-size: 0.82rem;
          font-weight: 900;
        }
        .ls-greeting {
          margin: 0 0 8px;
          color: #f97316;
          font-size: 1.05rem;
          font-weight: 900;
        }
        .ls-title {
          margin: 0;
          color: #111827;
          font-size: 2.55rem;
          font-weight: 950;
          line-height: 1.04;
        }
        .ls-sub {
          color: #475569;
          font-size: 1.12rem;
          font-weight: 650;
          line-height: 1.45;
          margin: 14px 0 0;
          max-width: 62ch;
        }
        .ls-hero-side {
          display: grid;
          align-content: space-between;
          gap: 18px;
          padding: 22px;
          background: #102033;
          color: #ffffff;
          border-color: #102033;
        }
        .ls-side-label {
          margin: 0 0 8px;
          color: #93c5fd;
          font-size: 0.82rem;
          font-weight: 900;
        }
        .ls-side-value {
          margin: 0;
          color: #ffffff;
          font-size: 1.08rem;
          font-weight: 850;
          line-height: 1.35;
        }

        .ls-actions {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 12px;
          margin-bottom: 18px;
        }
        .ls-action {
          display: grid;
          gap: 8px;
          padding: 18px;
          min-height: 112px;
          text-decoration: none;
          color: #172033;
        }
        .ls-action:hover {
          border-color: #2563eb;
          transform: translateY(-1px);
        }
        .ls-action strong {
          font-size: 1.03rem;
          color: #111827;
        }
        .ls-action span {
          color: #64748b;
          font-size: 0.92rem;
          font-weight: 700;
          line-height: 1.35;
        }
        .ls-action.is-warmup {
          border-top: 5px solid #f97316;
        }
        .ls-action.is-join {
          border-top: 5px solid #10b981;
        }
        .ls-action.is-assignment {
          border-top: 5px solid #2563eb;
        }
        .ls-action.is-disabled {
          border-top: 5px solid #94a3b8;
          cursor: default;
        }
        .ls-action.is-disabled:hover {
          border-color: #d9e2ef;
          transform: none;
        }

        .ls-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
          gap: 18px;
          align-items: start;
        }
        .ls-stack {
          display: grid;
          gap: 18px;
        }
        .ls-panel {
          padding: 22px;
        }
        .ls-panel-title {
          margin: 0 0 16px;
          color: #0f172a;
          font-size: 1.12rem;
          font-weight: 950;
        }
        .ls-panel-note {
          color: #64748b;
          margin: -8px 0 16px;
          font-size: 0.92rem;
          font-weight: 650;
        }
        .ls-agenda {
          display: grid;
          gap: 12px;
        }
        .ls-agenda-row {
          display: grid;
          grid-template-columns: 38px minmax(0, 1fr);
          gap: 12px;
          align-items: start;
          color: #172033;
          font-size: 1.02rem;
          font-weight: 760;
          line-height: 1.4;
        }
        .ls-num {
          width: 38px;
          height: 38px;
          border-radius: 8px;
          display: grid;
          place-items: center;
          background: #eaf2ff;
          color: #1d4ed8;
          font-weight: 950;
        }
        .ls-focus {
          color: #334155;
          font-size: 1rem;
          font-weight: 650;
          line-height: 1.65;
          margin: 0;
          white-space: pre-wrap;
        }
        .ls-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .ls-chip,
        .ls-toolbtn {
          display: inline-flex;
          align-items: center;
          min-height: 36px;
          border-radius: 8px;
          padding: 0 12px;
          font-size: 0.93rem;
          font-weight: 850;
        }
        .ls-chip {
          background: #f8fafc;
          border: 1px solid #d9e2ef;
          color: #42526b;
        }
        .ls-toolbtn {
          background: #ecfdf5;
          border: 1px solid #bbf7d0;
          color: #047857;
          text-decoration: none;
        }
        .ls-toolbtn:hover {
          border-color: #10b981;
        }
        .ls-assign {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          border-radius: 8px;
          padding: 0 16px;
          background: #2563eb;
          color: #ffffff;
          font-weight: 900;
          text-decoration: none;
          width: fit-content;
        }
        .ls-assign:hover {
          background: #1d4ed8;
        }
        .ls-due {
          color: #64748b;
          font-weight: 750;
          font-size: 0.92rem;
          margin-top: 10px;
        }
        .ls-exit {
          border-color: #fecaca;
          background: #fff7f7;
        }
        .ls-exit .ls-panel-title {
          color: #b91c1c;
        }
        .ls-exit p {
          color: #6b3640;
          font-weight: 700;
          margin: 0 0 16px;
          line-height: 1.45;
        }
        .ls-exit a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          border-radius: 8px;
          padding: 0 18px;
          background: #dc2626;
          color: #ffffff;
          font-weight: 900;
          text-decoration: none;
        }
        .ls-empty {
          padding: 34px;
          text-align: center;
          color: #64748b;
          font-weight: 700;
        }
        .ls-empty h2 {
          margin: 0 0 10px;
          color: #111827;
          font-size: 1.45rem;
        }
        .ls-muted {
          color: #64748b;
          font-weight: 700;
          line-height: 1.5;
          margin: 0;
        }

        .ls-poll-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.66);
          display: grid;
          place-items: center;
          z-index: 60;
          padding: 20px;
        }
        .ls-poll-card {
          background: #ffffff;
          border: 1px solid #d9e2ef;
          border-radius: 8px;
          padding: 30px 26px;
          max-width: 520px;
          width: 100%;
          box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.55);
          text-align: center;
        }
        .ls-poll-q {
          font-size: 1.8rem;
          font-weight: 950;
          color: #111827;
          margin-bottom: 20px;
          line-height: 1.2;
        }
        .ls-poll-choices {
          display: grid;
          gap: 12px;
        }
        .ls-poll-choice {
          background: #eef6ff;
          border: 2px solid #bfdbfe;
          color: #1d4ed8;
          border-radius: 8px;
          padding: 16px;
          font-size: 1.08rem;
          font-weight: 900;
          cursor: pointer;
        }
        .ls-poll-choice:hover {
          border-color: #2563eb;
        }
        .ls-poll-open {
          display: flex;
          gap: 8px;
        }
        .ls-poll-in {
          flex: 1;
          border: 2px solid #bfdbfe;
          border-radius: 8px;
          padding: 13px 15px;
          font-size: 1.04rem;
          font-weight: 750;
          box-sizing: border-box;
        }
        .ls-poll-send {
          background: #2563eb;
          color: #ffffff;
          border: none;
          border-radius: 8px;
          padding: 0 22px;
          font-weight: 900;
          cursor: pointer;
        }
        .ls-poll-sent {
          font-size: 1.45rem;
          font-weight: 950;
          color: #059669;
        }

        @media (max-width: 880px) {
          .ls-hero,
          .ls-grid,
          .ls-actions {
            grid-template-columns: 1fr;
          }
          .ls-hero-side {
            align-content: start;
          }
        }
        @media (max-width: 620px) {
          .ls-shell {
            width: min(100% - 24px, 1120px);
            padding-top: 14px;
          }
          .ls-top {
            align-items: flex-start;
            flex-direction: column;
          }
          .ls-date {
            text-align: left;
          }
          .ls-hero-main,
          .ls-hero-side,
          .ls-panel,
          .ls-action {
            padding: 18px;
          }
          .ls-title {
            font-size: 1.9rem;
          }
          .ls-sub {
            font-size: 1rem;
          }
          .ls-agenda-row {
            grid-template-columns: 34px minmax(0, 1fr);
            font-size: 0.98rem;
          }
          .ls-num {
            width: 34px;
            height: 34px;
          }
          .ls-poll-q {
            font-size: 1.35rem;
          }
          .ls-poll-open {
            flex-direction: column;
          }
          .ls-poll-send {
            min-height: 44px;
          }
        }
      `}</style>

      <div className="ls-shell">
        <header className="ls-top">
          <nav className="ls-nav" aria-label="Lesson navigation">
            <a className="ls-link" href="/">Home</a>
            <a className="ls-link" href="/lessons">Past days</a>
          </nav>
          <span className="ls-date">{date ? fmtDate(date) : ""}</span>
        </header>

        <section className="ls-hero" aria-label="Today lesson">
          <div className="ls-hero-main">
            <div className="ls-kicker">
              <span className="ls-pill">{lesson?.module || "Math 6"}</span>
              {lesson?.topic && <span>{lesson.topic}</span>}
            </div>
            {firstName && <p className="ls-greeting">Hi {firstName}</p>}
            <h1 className="ls-title">{loading ? "Loading today's lesson..." : lesson?.title || "Today's Lesson"}</h1>
            {lesson?.subtitle && <p className="ls-sub">{lesson.subtitle}</p>}
          </div>

          <aside className="ls-hero-side" aria-label="Lesson details">
            <div>
              <p className="ls-side-label">Today</p>
              <p className="ls-side-value">{date ? fmtDate(date) : "Loading"}</p>
            </div>
            <div>
              <p className="ls-side-label">Focus</p>
              <p className="ls-side-value">{lesson?.topic || "Classroom math practice"}</p>
            </div>
          </aside>
        </section>

        {!loading && !lesson && (
          <section className="ls-empty">
            <h2>No lesson is ready yet</h2>
            <p className="ls-muted">Check back in a moment or wait for your teacher to open today&apos;s lesson.</p>
          </section>
        )}

        {lesson && (
          <>
            {hasPrimaryActions && (
              <section className="ls-actions" aria-label="Lesson actions">
                {lesson.warmUpLink ? (
                  <a className="ls-action is-warmup" href={lesson.warmUpLink} target="_blank" rel="noopener noreferrer">
                    <strong>Warm-up</strong>
                    <span>Start the first task for today.</span>
                  </a>
                ) : (
                  <div className="ls-action is-disabled">
                    <strong>Warm-up</strong>
                    <span>No warm-up link has been added yet.</span>
                  </div>
                )}
                <a className="ls-action is-join" href="/join">
                  <strong>Join session</strong>
                  <span>Enter the code from the board.</span>
                </a>
                {lesson.assignmentLink && (
                  <a className="ls-action is-assignment" href={lesson.assignmentLink} target="_blank" rel="noopener noreferrer">
                    <strong>Assignment</strong>
                    <span>{lesson.dueDate ? `Due ${shortDate(lesson.dueDate)}` : "Open today's assignment."}</span>
                  </a>
                )}
              </section>
            )}

            <div className="ls-grid">
              <div className="ls-stack">
                <section className="ls-panel">
                  <h2 className="ls-panel-title">Agenda</h2>
                  <div className="ls-agenda">
                    {agendaItems.map((a, i) => (
                      <div className="ls-agenda-row" key={`${a}-${i}`}>
                        <span className="ls-num">{i + 1}</span>
                        <span>{a}</span>
                      </div>
                    ))}
                  </div>
                </section>

                {lesson.essentialIdeas && (
                  <section className="ls-panel">
                    <h2 className="ls-panel-title">Learning focus</h2>
                    <p className="ls-focus">{lesson.essentialIdeas}</p>
                  </section>
                )}
              </div>

              <aside className="ls-stack">
                {supplyItems.length > 0 && (
                  <section className="ls-panel">
                    <h2 className="ls-panel-title">Supplies</h2>
                    <div className="ls-list">{supplyItems.map((s, i) => <span className="ls-chip" key={`${s}-${i}`}>{s}</span>)}</div>
                  </section>
                )}

                {toolItems.length > 0 && (
                  <section className="ls-panel">
                    <h2 className="ls-panel-title">Tools</h2>
                    <p className="ls-panel-note">Tap a tool when you need it.</p>
                    <div className="ls-list">
                      {toolItems.map((t, i) => t.href
                        ? <a className="ls-toolbtn" href={t.href} key={`${t.label}-${i}`}>{t.label}</a>
                        : <span className="ls-chip" key={`${t.label}-${i}`}>{t.label}</span>)}
                    </div>
                  </section>
                )}

                {lesson.assignmentLink && (
                  <section className="ls-panel">
                    <h2 className="ls-panel-title">Assignment</h2>
                    <a className="ls-assign" href={lesson.assignmentLink} target="_blank" rel="noopener noreferrer">Open assignment</a>
                    {lesson.dueDate && <div className="ls-due">Due {fmtDate(lesson.dueDate)}</div>}
                  </section>
                )}

                <section className="ls-panel ls-exit">
                  <h2 className="ls-panel-title">Exit ticket</h2>
                  <p>Finish strong before class ends.</p>
                  <a href={exitHref} target={isExternalLink(exitHref) ? "_blank" : undefined} rel="noopener noreferrer">Start exit ticket</a>
                </section>
              </aside>
            </div>
          </>
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
