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

  return (
    <>
      <style>{`
        .today-root {
          min-height: 100vh;
          background: #0b0d14;
          color: #fff;
          font-family: Inter, ui-sans-serif, system-ui, sans-serif;
          display: grid;
          grid-template-rows: auto 1fr auto;
        }

        /* Top bar */
        .today-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 32px;
          border-bottom: 1px solid #1f2332;
        }
        .today-wordmark {
          font-size: 0.8rem;
          font-weight: 900;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #4e6ef2;
          margin: 0;
        }
        .today-date-display {
          font-size: 0.9rem;
          font-weight: 700;
          color: #5a6280;
          letter-spacing: 0.04em;
        }
        .today-nav-link {
          font-size: 0.82rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #3a4460;
          border: 1px solid #1f2332;
          border-radius: 6px;
          padding: 6px 14px;
          text-decoration: none;
          transition: border-color 150ms ease, color 150ms ease;
        }
        .today-nav-link:hover {
          border-color: #4e6ef2;
          color: #8ba0f8;
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
          background: rgba(78, 110, 242, 0.15);
          border: 1px solid rgba(78, 110, 242, 0.3);
          border-radius: 6px;
          padding: 5px 12px;
          font-size: 0.78rem;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #8ba0f8;
          width: fit-content;
        }
        .today-title {
          margin: 0;
          font-size: clamp(2rem, 6vw, 3.6rem);
          font-weight: 900;
          line-height: 1.05;
          color: #fff;
        }
        .today-subtitle {
          margin: 8px 0 0;
          font-size: clamp(1rem, 2.5vw, 1.35rem);
          font-weight: 600;
          color: #5a6280;
          line-height: 1.4;
        }

        /* Cards */
        .today-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
        }
        .today-card {
          background: #121520;
          border: 1px solid #1f2332;
          border-radius: 12px;
          padding: 22px 24px;
          display: grid;
          gap: 10px;
        }
        .today-card-label {
          font-size: 0.75rem;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #3a4460;
          margin: 0;
        }
        .today-card-content {
          font-size: 1.02rem;
          font-weight: 600;
          color: #c8cedd;
          line-height: 1.6;
          margin: 0;
          white-space: pre-wrap;
        }
        .today-card.highlight {
          border-color: rgba(78, 110, 242, 0.35);
          background: rgba(78, 110, 242, 0.06);
        }
        .today-card.highlight .today-card-label {
          color: #6880d8;
        }
        .today-card.highlight .today-card-content {
          color: #d8e0ff;
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
        .today-due {
          font-size: 0.9rem;
          font-weight: 700;
          color: #5a6280;
          margin-top: 4px;
        }

        /* Join section */
        .today-join-section {
          background: #121520;
          border: 1px solid #1f2332;
          border-radius: 12px;
          padding: 22px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .today-join-label {
          font-size: 0.75rem;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #3a4460;
          margin: 0 0 6px;
        }
        .today-join-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: 1px solid #1f2332;
          border-radius: 8px;
          color: #8ba0f8;
          font-size: 0.9rem;
          font-weight: 800;
          padding: 10px 16px;
          text-decoration: none;
          transition: border-color 140ms ease;
          letter-spacing: 0.04em;
        }
        .today-join-link:hover {
          border-color: #4e6ef2;
        }

        /* Empty / error states */
        .today-empty {
          display: grid;
          place-items: center;
          min-height: 50vh;
          gap: 16px;
          text-align: center;
          color: #3a4460;
        }
        .today-empty-icon {
          font-size: 3.5rem;
          opacity: 0.5;
        }
        .today-empty-title {
          font-size: 1.4rem;
          font-weight: 900;
          color: #3a4460;
          margin: 0;
        }
        .today-empty-sub {
          color: #2a3050;
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
          color: #e88;
          font-family: "SFMono-Regular", Consolas, monospace;
          max-width: 600px;
        }

        /* Footer */
        .today-footer {
          padding: 14px 32px;
          border-top: 1px solid #1f2332;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .today-footer-text {
          font-size: 0.8rem;
          color: #2a3050;
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
          <a className="today-nav-link" href="/lessons">Past Days →</a>
        </header>

        {/* Main */}
        <div className="today-main">
          {loading && (
            <div className="today-empty">
              <div className="today-empty-icon">📘</div>
              <p className="today-empty-title">Loading…</p>
            </div>
          )}

          {!loading && error && (
            <div className="today-empty">
              <div className="today-empty-icon">⚠️</div>
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
              <div className="today-empty-icon">📭</div>
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
                  📘 {lesson.module}
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

                {lesson.assignmentLink && (
                  <div className="today-card">
                    <p className="today-card-label">Assignment</p>
                    <a
                      className="today-assignment-btn"
                      href={lesson.assignmentLink}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Open Assignment ↗
                    </a>
                    {lesson.dueDate && (
                      <p className="today-due">Due {formatShortDate(lesson.dueDate)}</p>
                    )}
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
                  Join Session →
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
