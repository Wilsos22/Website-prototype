"use client";

// Student daily page — pulls today's published lesson from Notion and shows it on Chromebooks / main display.
import { useEffect, useState } from "react";

interface LessonData {
  id: string;
  title: string;
  subtitle: string;
  essentialIdeas: string;
  assignmentLink: string;
  date: string;
  dueDate: string;
  topic: string;
  module: string;
  warmUpLink: string;
  exitTicketLink: string;
  requiredPaperWork: string;
  requiredDigitalWork: string;
  optionalSupport: string;
  bigDogChallenge: string;
  dueAndTurnIn: string;
  helpPath: string;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatShortDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function TodayPage() {
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/today", { cache: "no-store" });
        const data = await res.json() as { lesson: LessonData | null; date: string; error?: string };

        if (data.error) {
          setError(data.error);
        } else {
          setLesson(data.lesson);
          setDate(data.date);
        }
      } catch {
        setError("Couldn't load today's lesson.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const workCategories = lesson ? [
    { label: "Required Paper Work", body: lesson.requiredPaperWork },
    { label: "Required Digital Work", body: lesson.requiredDigitalWork },
    { label: "Optional Support", body: lesson.optionalSupport },
    { label: "Challenge", body: lesson.bigDogChallenge },
  ].filter((category) => category.body?.trim()) : [];

  return (
    <>
      <style>{`
        .today-root {
          min-height: 100vh;
          background: radial-gradient(circle at 14% 10%, rgba(79, 93, 168, 0.09), transparent 28%), var(--bdb-ground);
          color: var(--bdb-ink);
          font-family: var(--bdb-font);
          display: grid;
          grid-template-rows: auto 1fr auto;
        }

        /* Top bar */
        .today-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 32px;
          border-bottom: 1px solid var(--bdb-line);
        }
        .today-wordmark {
          font-size: 0.8rem;
          font-weight: 900;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #4f5da8;
          margin: 0;
        }
        .today-date-display {
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--bdb-ink-soft);
          letter-spacing: 0.04em;
        }
        .today-nav-link {
          font-size: 0.82rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--bdb-ink-soft);
          border: 1px solid var(--bdb-line);
          background: #fff;
          border-radius: 6px;
          padding: 6px 14px;
          text-decoration: none;
          transition: border-color 150ms ease, color 150ms ease;
        }
        .today-nav-link:hover {
          border-color: #4f5da8;
          color: #4f5da8;
        }

        /* Main content */
        .today-main {
          display: grid;
          align-content: start;
          gap: 28px;
          padding: 40px 32px;
          max-width: 900px;
          margin: 0 auto;
          width: 100%;
        }

        /* Lesson hero */
        .today-lesson-tag {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(79, 93, 168, 0.09);
          border: 1px solid rgba(79, 93, 168, 0.28);
          border-radius: 6px;
          padding: 5px 12px;
          font-size: 0.78rem;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #4f5da8;
          width: fit-content;
        }
        .today-title {
          margin: 0;
          font-size: clamp(2rem, 6vw, 3.6rem);
          font-weight: 900;
          line-height: 1.05;
          color: var(--bdb-ink);
        }
        .today-subtitle {
          margin: 8px 0 0;
          font-size: clamp(1rem, 2.5vw, 1.35rem);
          font-weight: 600;
          color: var(--bdb-ink-soft);
          line-height: 1.4;
        }

        /* Cards */
        .today-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
        }
        .today-card {
          background: #fff;
          border: 1px solid var(--bdb-line);
          border-radius: 12px;
          padding: 22px 24px;
          display: grid;
          gap: 10px;
          box-shadow: var(--bdb-shadow-sm);
        }
        .today-card-label {
          font-size: 0.75rem;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #4f5da8;
          margin: 0;
        }
        .today-card-content {
          font-size: 1.02rem;
          font-weight: 600;
          color: var(--bdb-ink);
          line-height: 1.6;
          margin: 0;
          white-space: pre-wrap;
        }
        .today-card.highlight {
          border-color: rgba(79, 93, 168, 0.32);
          background: rgba(79, 93, 168, 0.07);
        }
        .today-card.highlight .today-card-label {
          color: #4f5da8;
        }
        .today-card.highlight .today-card-content {
          color: var(--bdb-ink);
          font-size: 1.1rem;
        }

        /* Assignment button */
        .today-assignment-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          background: #4e6ef2;
          border: none;
          border-radius: 10px;
          color: #fff;
          cursor: pointer;
          font-size: 1rem;
          font-weight: 900;
          padding: 14px 22px;
          text-decoration: none;
          transition: background 140ms ease, transform 140ms ease;
          width: fit-content;
        }
        .today-assignment-btn:hover {
          background: #3b5be6;
          transform: translateY(-1px);
        }
        .today-assignment-btn.is-warmup {
          background: #35785a;
        }
        .today-assignment-btn.is-warmup:hover {
          background: #285f46;
        }
        .today-assignment-btn.is-exit {
          background: #8a3d50;
        }
        .today-assignment-btn.is-exit:hover {
          background: #6f3040;
        }
        .today-due {
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--bdb-ink-soft);
          margin-top: 4px;
        }

        /* Join section */
        .today-join-section {
          background: #fff;
          border: 1px solid var(--bdb-line);
          border-radius: 12px;
          padding: 22px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          box-shadow: var(--bdb-shadow-sm);
        }
        .today-join-label {
          font-size: 0.75rem;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #4f5da8;
          margin: 0 0 6px;
        }
        .today-join-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: 1px solid var(--bdb-line);
          border-radius: 8px;
          color: #4f5da8;
          font-size: 0.9rem;
          font-weight: 800;
          padding: 10px 16px;
          text-decoration: none;
          transition: border-color 140ms ease;
          letter-spacing: 0.04em;
        }
        .today-join-link:hover {
          border-color: #4f5da8;
        }

        /* Empty / error states */
        .today-empty {
          display: grid;
          place-items: center;
          min-height: 50vh;
          gap: 16px;
          text-align: center;
          color: var(--bdb-ink-soft);
        }
        .today-empty-title {
          font-size: 1.4rem;
          font-weight: 900;
          color: var(--bdb-ink);
          margin: 0;
        }
        .today-empty-sub {
          color: var(--bdb-ink-soft);
          font-size: 0.95rem;
          max-width: 360px;
          margin: 0;
        }
        .today-error-note {
          background: rgba(192, 57, 43, 0.1);
          border: 1px solid rgba(192, 57, 43, 0.3);
          border-radius: 8px;
          padding: 14px 18px;
          font-size: 0.88rem;
          color: #8a3d50;
          font-family: "SFMono-Regular", Consolas, monospace;
          max-width: 600px;
        }

        /* Footer */
        .today-footer {
          padding: 14px 32px;
          border-top: 1px solid var(--bdb-line);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .today-footer-text {
          font-size: 0.8rem;
          color: var(--bdb-ink-soft);
          font-weight: 700;
        }

        @media (max-width: 640px) {
          .today-topbar, .today-main, .today-footer { padding-left: 18px; padding-right: 18px; }
          .today-main { padding-top: 28px; }
        }
      `}</style>

      <div className="today-root">
        {/* Top bar */}
        <header className="today-topbar">
          <p className="today-wordmark">Big Dog Math</p>
          <span className="today-date-display">
            {date ? formatDate(date) : "Loading…"}
          </span>
          <a className="today-nav-link" href="/lessons">Past Days</a>
        </header>

        {/* Main */}
        <div className="today-main">
          {loading && (
            <div className="today-empty">
              <p className="today-empty-title">Loading…</p>
            </div>
          )}

          {!loading && error && (
            <div className="today-empty">
              <p className="today-empty-title">Couldn't load lesson</p>
              <div className="today-error-note">{error}</div>
              {error.includes("NOTION_TOKEN") && (
                <p className="today-empty-sub">
                  Add a <strong>NOTION_TOKEN</strong> environment variable in your Vercel project settings, then redeploy.
                </p>
              )}
            </div>
          )}

          {!loading && !error && !lesson && (
            <div className="today-empty">
              <p className="today-empty-title">No lesson published today</p>
              <p className="today-empty-sub">
                Set a lesson's <em>Publish Workflow</em> to <strong>Published</strong> and its <em>Date</em> to today in Notion.
              </p>
            </div>
          )}

          {!loading && !error && lesson && (
            <>
              {/* Tag */}
              {lesson.module && (
                <div className="today-lesson-tag">
                  {lesson.module}
                </div>
              )}

              {/* Title block */}
              <div>
                <h1 className="today-title">{lesson.title || "Today's Lesson"}</h1>
                {lesson.subtitle && (
                  <p className="today-subtitle">{lesson.subtitle}</p>
                )}
              </div>

              {/* Cards */}
              <div className="today-cards">
                {lesson.essentialIdeas && (
                  <div className="today-card highlight" style={{ gridColumn: "1 / -1" }}>
                    <p className="today-card-label">Essential Ideas</p>
                    <p className="today-card-content">{lesson.essentialIdeas}</p>
                  </div>
                )}

                {lesson.warmUpLink && (
                  <div className="today-card">
                    <p className="today-card-label">Warm-Up</p>
                    <a
                      className="today-assignment-btn is-warmup"
                      href={lesson.warmUpLink}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Start Warm-Up
                    </a>
                  </div>
                )}

                {workCategories.map((category) => (
                  <div className={`today-card${category.label === "Required Paper Work" ? " highlight" : ""}`} key={category.label}>
                    <p className="today-card-label">{category.label}</p>
                    <p className="today-card-content">{category.body}</p>
                  </div>
                ))}

                {lesson.assignmentLink && (
                  <div className="today-card">
                    <p className="today-card-label">Assignment</p>
                    <a
                      className="today-assignment-btn"
                      href={lesson.assignmentLink}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Open Assignment
                    </a>
                    {lesson.dueDate && (
                      <p className="today-due">Due {formatShortDate(lesson.dueDate)}</p>
                    )}
                  </div>
                )}

                {lesson.exitTicketLink && (
                  <div className="today-card">
                    <p className="today-card-label">Exit Ticket</p>
                    <a
                      className="today-assignment-btn is-exit"
                      href={lesson.exitTicketLink}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Open Exit Ticket
                    </a>
                  </div>
                )}

                {lesson.topic && (
                  <div className="today-card">
                    <p className="today-card-label">Topic</p>
                    <p className="today-card-content">{lesson.topic}</p>
                  </div>
                )}
              </div>

              {/* Join session */}
              <div className="today-join-section">
                <div>
                  <p className="today-join-label">Polls & Questions</p>
                  <p style={{ margin: 0, color: "#5a6280", fontSize: "0.9rem", fontWeight: 600 }}>
                    Enter the code your teacher shows on the board
                  </p>
                </div>
                <a className="today-join-link" href="/join">
                  Join Session
                </a>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="today-footer">
          <span className="today-footer-text">Big Dog Math — {date ? formatDate(date) : ""}</span>
          <a className="today-nav-link" href="/">Dashboard</a>
        </footer>
      </div>
    </>
  );
}
