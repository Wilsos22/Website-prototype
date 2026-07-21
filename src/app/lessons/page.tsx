"use client";

// Lesson archive — all published lessons sorted by date, for absent students catching up.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
    weekday: "short",
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

function isToday(iso: string): boolean {
  return iso === new Date().toISOString().split("T")[0];
}

export default function LessonsPage() {
  const router = useRouter();
  const [lessons, setLessons] = useState<LessonData[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/lessons", { cache: "no-store" });
        const data = await res.json() as { lessons?: LessonData[]; error?: string };

        if (data.error) {
          setError(data.error);
        } else {
          setLessons(data.lessons ?? []);
        }
      } catch {
        setError("Couldn't load lessons.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = search.trim()
    ? lessons.filter(
        (l) =>
          l.title.toLowerCase().includes(search.toLowerCase()) ||
          l.topic.toLowerCase().includes(search.toLowerCase()) ||
          l.date.includes(search) ||
          l.essentialIdeas.toLowerCase().includes(search.toLowerCase()),
      )
    : lessons;

  return (
    <>
      <style>{`
        .lessons-root {
          min-height: 100vh;
          background-color: #F3F0E7;
          background-image: radial-gradient(circle,#CBC4B2 1px,transparent 1.3px);
          background-size: 18px 18px;
          font-family: var(--bdb-font);
        }
        .lessons-header {
          background: rgba(243,240,231,0.92);
          border-bottom: 1px solid rgba(120,110,90,0.18);
          padding: 20px 32px;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .lessons-wordmark {
          font-size: 0.82rem;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #2A6162;
          margin: 0;
        }
        .lessons-title {
          font-size: 1.5rem;
          font-weight: 900;
          color: #2E4A54;
          margin: 0;
        }
        .lessons-search {
          background: #F6F3EC;
          border: 2px solid #E3D9C2;
          border-radius: 8px;
          color: #2E4A54;
          font-size: 0.95rem;
          font-weight: 600;
          padding: 10px 14px;
          width: min(100%, 280px);
          transition: border-color 140ms ease;
        }
        .lessons-search:focus {
          outline: none;
          border-color: #2A6162;
        }
        .lessons-nav-link {
          font-size: 0.82rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #2A6162;
          border: 2px solid #E3D9C2;
          border-radius: 6px;
          padding: 8px 14px;
          text-decoration: none;
          transition: border-color 140ms ease;
        }
        .lessons-nav-link:hover { border-color: #2A6162; }

        /* Grid */
        .lessons-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
          padding: 28px 32px;
          max-width: 1280px;
          margin: 0 auto;
        }

        /* Card */
        .lesson-card {
          background: #fff;
          border: 2px solid #E3D9C2;
          border-radius: 12px;
          padding: 22px;
          display: grid;
          gap: 12px;
          text-decoration: none;
          color: inherit;
          transition: border-color 150ms ease, box-shadow 150ms ease;
          cursor: pointer;
          box-shadow: 0 2px 10px rgba(40,32,20,0.05);
        }
        .lesson-card:hover, .lesson-card:focus-visible {
          border-color: var(--bdb-teal);
          box-shadow: 0 6px 18px rgba(40,32,20,0.10);
          outline: none;
        }
        .lesson-card.today-card {
          border-color: #2A6162;
          background: #F1F8F7;
        }
        .lesson-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .lesson-card-date {
          font-size: 0.8rem;
          font-weight: 900;
          letter-spacing: 0.06em;
          color: #5f6877;
        }
        .lesson-card-today-badge {
          background: #2A6162;
          border-radius: 4px;
          color: #fff;
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.06em;
          padding: 2px 8px;
          text-transform: uppercase;
        }
        .lesson-card-module {
          background: #F6F3EC;
          border-radius: 4px;
          color: #5f6877;
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.06em;
          padding: 2px 8px;
          text-transform: uppercase;
        }
        .lesson-card-title {
          font-size: 1.15rem;
          font-weight: 900;
          color: #2E4A54;
          margin: 0;
          line-height: 1.25;
        }
        .lesson-card-subtitle {
          font-size: 0.88rem;
          font-weight: 600;
          color: #5f6877;
          margin: 2px 0 0;
          line-height: 1.4;
        }
        .lesson-card-ideas {
          font-size: 0.88rem;
          font-weight: 500;
          color: #5f6877;
          line-height: 1.5;
          margin: 0;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .lesson-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding-top: 8px;
          border-top: 1px solid #F6F3EC;
        }
        .lesson-assignment-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #2A6162;
          border-radius: 6px;
          color: #fff;
          font-size: 0.82rem;
          font-weight: 900;
          letter-spacing: 0.04em;
          padding: 7px 14px;
          text-decoration: none;
          transition: background 140ms ease;
        }
        .lesson-assignment-link:hover { background: #174783; }
        .lesson-due {
          font-size: 0.8rem;
          font-weight: 700;
          color: #8b92a0;
        }

        /* Empty / error */
        .lessons-empty {
          display: grid;
          place-items: center;
          min-height: 50vh;
          gap: 14px;
          text-align: center;
          padding: 40px;
        }
        .lessons-empty-icon { font-size: 3rem; }
        .lessons-empty-title { font-size: 1.3rem; font-weight: 900; color: #5f6877; margin: 0; }
        .lessons-empty-sub { color: #8b92a0; font-size: 0.95rem; max-width: 360px; margin: 0; }

        @media (max-width: 640px) {
          .lessons-header, .lessons-grid { padding-left: 16px; padding-right: 16px; }
          .lessons-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="lessons-root">
        <header className="lessons-header">
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <p className="lessons-wordmark">Big Dog Math</p>
            <h1 className="lessons-title">Past Lessons</h1>
          </div>
          <input
            className="lessons-search"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, date, or topic…"
            type="search"
            value={search}
          />
          <a className="lessons-nav-link" href="/today">Today</a>
        </header>

        {loading && (
          <div className="lessons-empty">
                        <p className="lessons-empty-title">Loading lessons…</p>
          </div>
        )}

        {!loading && error && (
          <div className="lessons-empty">
            <div className="lessons-empty-icon"></div>
            <p className="lessons-empty-title">Couldn't load lessons</p>
            <p className="lessons-empty-sub" style={{ fontFamily: "monospace", fontSize: "0.82rem" }}>
              {error}
            </p>
            {error.includes("NOTION_TOKEN") && (
              <p className="lessons-empty-sub">
                Add a <strong>NOTION_TOKEN</strong> environment variable in Vercel, then redeploy.
              </p>
            )}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="lessons-empty">
            <div className="lessons-empty-icon">{search ? "🔍" : "📭"}</div>
            <p className="lessons-empty-title">
              {search ? "No lessons match that search" : "No published lessons yet"}
            </p>
            <p className="lessons-empty-sub">
              {search
                ? "Try different keywords."
                : "Set a lesson's Publish Workflow to Published in Notion."}
            </p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="lessons-grid">
            {filtered.map((lesson) => (
              <div
                className={`lesson-card${isToday(lesson.date) ? " today-card" : ""}`}
                key={lesson.id}
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/lessons/${lesson.id}`)}
                onKeyDown={(event) => { if (event.key === "Enter") router.push(`/lessons/${lesson.id}`); }}
              >
                {/* Top row */}
                <div className="lesson-card-top">
                  <span className="lesson-card-date">{formatDate(lesson.date)}</span>
                  <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                    {isToday(lesson.date) && (
                      <span className="lesson-card-today-badge">Today</span>
                    )}
                    {lesson.module && (
                      <span className="lesson-card-module">{lesson.module}</span>
                    )}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <p className="lesson-card-title">{lesson.title || "Untitled Lesson"}</p>
                  {lesson.subtitle && (
                    <p className="lesson-card-subtitle">{lesson.subtitle}</p>
                  )}
                </div>

                {/* Essential ideas */}
                {lesson.essentialIdeas && (
                  <p className="lesson-card-ideas">{lesson.essentialIdeas}</p>
                )}

                {/* Footer */}
                <div className="lesson-card-footer">
                  {lesson.assignmentLink ? (
                    <a
                      className="lesson-assignment-link"
                      href={lesson.assignmentLink}
                      rel="noopener noreferrer"
                      target="_blank"
                      onClick={(event) => event.stopPropagation()}
                    >
                      Assignment
                    </a>
                  ) : (
                    <span />
                  )}
                  {lesson.dueDate && (
                    <span className="lesson-due">
                      Due {formatShortDate(lesson.dueDate)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
