"use client";

// Teacher-facing session dashboard: open question or fist-to-five, live distribution, anonymous questions feed.
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ToolHeader } from "./ToolHeader";

type SessionType = "question" | "fist-to-five";

interface StudentResponse {
  id: string;
  name: string;
  answer: string;
  rating?: number;
  submittedAt: string;
}

interface AnonQuestion {
  id: string;
  text: string;
  submittedAt: string;
}

interface QuestionSession {
  code: string;
  type: SessionType;
  question: string;
  createdAt: string;
  responses: StudentResponse[];
  anonQuestions: AnonQuestion[];
}

const FIST_LEVELS = [
  { rating: 0, label: "Not yet", color: "#c0392b" },
  { rating: 1, label: "Confused", color: "#e67e22" },
  { rating: 2, label: "Starting", color: "#d4ac0d" },
  { rating: 3, label: "Getting it", color: "#27ae60" },
  { rating: 4, label: "Got it", color: "#1a7a48" },
  { rating: 5, label: "Can explain", color: "#1565c0" },
] as const;

function FistDistribution({ responses }: { responses: StudentResponse[] }) {
  const counts = [0, 1, 2, 3, 4, 5].map(
    (r) => responses.filter((res) => res.rating === r).length,
  );
  const max = Math.max(...counts, 1);
  const total = responses.length;

  const lost = responses.filter((r) => r.rating !== undefined && r.rating <= 1).map((r) => r.name);
  const developing = responses.filter((r) => r.rating !== undefined && r.rating >= 2 && r.rating <= 3).map((r) => r.name);
  const solid = responses.filter((r) => r.rating !== undefined && r.rating >= 4).map((r) => r.name);

  return (
    <>
      <style>{`
        .dist-bar-row {
          display: grid;
          grid-template-columns: 80px 1fr 36px;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }
        .dist-bar-label {
          font-size: 0.82rem;
          font-weight: 800;
          color: var(--muted);
          text-align: right;
          line-height: 1.2;
        }
        .dist-bar-track {
          height: 36px;
          background: var(--surface-strong);
          border-radius: 6px;
          overflow: hidden;
          min-width: 0;
        }
        .dist-bar-fill {
          height: 100%;
          border-radius: 6px;
          display: flex;
          align-items: center;
          padding-left: 10px;
          transition: width 400ms ease;
          min-width: 0;
        }
        .dist-bar-names {
          font-size: 0.72rem;
          font-weight: 700;
          color: rgba(255,255,255,0.9);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .dist-bar-count {
          font-size: 1.05rem;
          font-weight: 900;
          color: var(--text);
          text-align: center;
        }
        .cluster-row {
          display: grid;
          grid-template-columns: 108px 1fr;
          gap: 10px;
          align-items: start;
          padding: 10px 0;
          border-bottom: 1px solid var(--line);
        }
        .cluster-row:last-child { border-bottom: none; }
        .cluster-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          padding: 5px 10px;
          font-size: 0.78rem;
          font-weight: 900;
          color: #fff;
          width: 100%;
        }
        .cluster-names {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text);
          line-height: 1.6;
        }
        .cluster-empty {
          color: var(--muted);
          font-style: italic;
          font-size: 0.85rem;
        }
      `}</style>

      <div style={{ display: "grid", gap: "24px" }}>
        <div>
          <h3 style={{ margin: "0 0 14px", fontSize: "0.95rem", fontWeight: 900, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Distribution — {total} response{total !== 1 ? "s" : ""}
          </h3>
          {FIST_LEVELS.map(({ rating, label, color }) => {
            const count = counts[rating];
            const pct = (count / max) * 100;
            const names = responses
              .filter((r) => r.rating === rating)
              .map((r) => r.name)
              .join(", ");

            return (
              <div className="dist-bar-row" key={rating}>
                <span className="dist-bar-label">{rating} {label}</span>
                <div className="dist-bar-track">
                  <div
                    className="dist-bar-fill"
                    style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%`, background: color }}
                  >
                    {names && <span className="dist-bar-names">{names}</span>}
                  </div>
                </div>
                <span className="dist-bar-count">{count}</span>
              </div>
            );
          })}
        </div>

        {total > 0 && (
          <div>
            <h3 style={{ margin: "0 0 12px", fontSize: "0.95rem", fontWeight: 900, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Clusters
            </h3>
            <div>
              <div className="cluster-row">
                <span className="cluster-badge" style={{ background: "#c0392b" }}>Needs help</span>
                <span className="cluster-names">
                  {lost.length > 0 ? lost.join(", ") : <span className="cluster-empty">—</span>}
                </span>
              </div>
              <div className="cluster-row">
                <span className="cluster-badge" style={{ background: "#d4ac0d" }}>Developing</span>
                <span className="cluster-names">
                  {developing.length > 0 ? developing.join(", ") : <span className="cluster-empty">—</span>}
                </span>
              </div>
              <div className="cluster-row">
                <span className="cluster-badge" style={{ background: "#1a7a48" }}>Solid</span>
                <span className="cluster-names">
                  {solid.length > 0 ? solid.join(", ") : <span className="cluster-empty">—</span>}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function AnonFeed({ questions }: { questions: AnonQuestion[] }) {
  if (questions.length === 0) {
    return (
      <p style={{ color: "var(--muted)", fontSize: "0.95rem", margin: 0 }}>
        No anonymous questions yet.
      </p>
    );
  }

  return (
    <ul className="responses-list">
      {[...questions].reverse().map((q) => (
        <li key={q.id} className="response-item" style={{ borderLeft: "4px solid var(--warning)" }}>
          <p className="response-answer" style={{ margin: 0 }}>{q.text}</p>
          <span style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 700 }}>
            {new Date(q.submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function QuestionTeacher() {
  const [sessionType, setSessionType] = useState<SessionType>("fist-to-five");
  const [prompt, setPrompt] = useState("");
  const [session, setSession] = useState<QuestionSession | null>(null);
  const [sessionHistory, setSessionHistory] = useState<QuestionSession[]>([]);
  const [status, setStatus] = useState("");
  const [activeTab, setActiveTab] = useState<"responses" | "anon">("responses");

  const loadSessionHistory = useCallback(async () => {
    const response = await fetch("/api/session", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { sessions: QuestionSession[] };
    setSessionHistory(data.sessions.slice(0, 8));
  }, []);

  const refreshSession = useCallback(
    async (code: string) => {
      const response = await fetch(`/api/session?code=${code}`, { cache: "no-store" });
      if (!response.ok) {
        setStatus("Session unavailable.");
        return;
      }
      const nextSession = (await response.json()) as QuestionSession;
      setSession(nextSession);
      setStatus("");
      await loadSessionHistory();
    },
    [loadSessionHistory],
  );

  useEffect(() => {
    const savedCode = window.localStorage.getItem("big-dog-board-session-code");
    loadSessionHistory();
    if (savedCode) {
      refreshSession(savedCode);
    }
  }, [loadSessionHistory, refreshSession]);

  useEffect(() => {
    if (!session?.code) return;
    const interval = window.setInterval(() => {
      refreshSession(session.code);
    }, 2000);
    return () => window.clearInterval(interval);
  }, [refreshSession, session?.code]);

  const startSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const questionText =
      sessionType === "fist-to-five"
        ? prompt.trim() || "Current concept"
        : prompt.trim();

    if (sessionType === "question" && !questionText) {
      setStatus("Enter a question first.");
      return;
    }

    setStatus("Starting...");

    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: questionText, type: sessionType }),
    });

    if (!response.ok) {
      setStatus("Failed to create session.");
      return;
    }

    const nextSession = (await response.json()) as QuestionSession;
    window.localStorage.setItem("big-dog-board-session-code", nextSession.code);
    setSession(nextSession);
    setPrompt("");
    setStatus("");
    setActiveTab("responses");
    await loadSessionHistory();
  };

  const openSession = (nextSession: QuestionSession) => {
    window.localStorage.setItem("big-dog-board-session-code", nextSession.code);
    setSession(nextSession);
    setStatus("");
  };

  const anonCount = session?.anonQuestions?.length ?? 0;

  return (
    <>
      <ToolHeader title="Start Question" />
      <main className="form-page">

        {/* Session creator */}
        <form className="form-panel" onSubmit={startSession}>
          <div className="field">
            <span>Session Type</span>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                className={`small-button${sessionType === "fist-to-five" ? " active" : ""}`}
                onClick={() => setSessionType("fist-to-five")}
                style={{ flex: 1 }}
                type="button"
              >
                ✋ Fist to Five
              </button>
              <button
                className={`small-button${sessionType === "question" ? " active" : ""}`}
                onClick={() => setSessionType("question")}
                style={{ flex: 1 }}
                type="button"
              >
                💬 Question
              </button>
            </div>
          </div>

          <label className="field">
            {sessionType === "fist-to-five" ? "Concept or topic (optional)" : "Question"}
            <input
              className="text-input"
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={
                sessionType === "fist-to-five"
                  ? "e.g. Adding fractions with unlike denominators"
                  : "Type a question for students"
              }
              type="text"
              value={prompt}
            />
          </label>

          <button className="big-button primary" type="submit">
            {sessionType === "fist-to-five" ? "Launch Fist to Five" : "Create Join Code"}
          </button>
          {status && <p role="status">{status}</p>}
        </form>

        {/* Active session */}
        {session && (
          <section className="responses-panel" aria-live="polite">
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h2 style={{ margin: 0 }}>
                  {session.type === "fist-to-five" ? "✋ Fist to Five" : "💬 Question"} — Live
                </h2>
                <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "0.9rem" }}>
                  {session.question}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div className="code-card" style={{ fontSize: "1.8rem", padding: "10px 18px" }}>
                  {session.code}
                </div>
                <span className="status-pill">{session.responses.length} in</span>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                className={`small-button${activeTab === "responses" ? " active" : ""}`}
                onClick={() => setActiveTab("responses")}
                type="button"
              >
                Responses ({session.responses.length})
              </button>
              <button
                className={`small-button${activeTab === "anon" ? " active" : ""}`}
                onClick={() => setActiveTab("anon")}
                style={activeTab === "anon" ? { background: "var(--warning)", borderColor: "var(--warning)" } : {}}
                type="button"
              >
                🔒 Questions
                {anonCount > 0 && (
                  <span style={{
                    background: activeTab === "anon" ? "rgba(255,255,255,0.3)" : "var(--warning)",
                    borderRadius: "99px",
                    color: "#fff",
                    fontSize: "0.72rem",
                    fontWeight: 900,
                    lineHeight: 1,
                    marginLeft: "6px",
                    padding: "2px 7px",
                  }}>
                    {anonCount}
                  </span>
                )}
              </button>
            </div>

            {/* Tab content */}
            {activeTab === "responses" && (
              <>
                {session.type === "fist-to-five" ? (
                  <FistDistribution responses={session.responses} />
                ) : (
                  <ul className="responses-list">
                    {session.responses.length === 0 && (
                      <li style={{ color: "var(--muted)", fontSize: "0.95rem", padding: "8px 0" }}>
                        Waiting for responses…
                      </li>
                    )}
                    {session.responses.map((response) => (
                      <li key={response.id} className="response-item">
                        <span className="response-name">{response.name}</span>
                        <p className="response-answer">{response.answer}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {activeTab === "anon" && (
              <AnonFeed questions={session.anonQuestions ?? []} />
            )}
          </section>
        )}

        {/* Session history */}
        {sessionHistory.length > 0 && (
          <section className="responses-panel">
            <h2>Recent Sessions</h2>
            <ul className="responses-list">
              {sessionHistory.map((historySession) => (
                <li key={historySession.code} className="response-item history-item">
                  <button
                    className="history-button"
                    onClick={() => openSession(historySession)}
                    type="button"
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span className="response-name">Code {historySession.code}</span>
                      <span style={{
                        background: historySession.type === "fist-to-five" ? "var(--positive)" : "var(--primary)",
                        borderRadius: "4px",
                        color: "#fff",
                        fontSize: "0.72rem",
                        fontWeight: 900,
                        padding: "2px 7px",
                      }}>
                        {historySession.type === "fist-to-five" ? "F2F" : "Q&A"}
                      </span>
                    </span>
                    <span>{historySession.question}</span>
                    <span className="history-meta">
                      {historySession.responses.length} response{historySession.responses.length !== 1 ? "s" : ""}
                      {(historySession.anonQuestions?.length ?? 0) > 0
                        ? ` · ${historySession.anonQuestions.length} question${historySession.anonQuestions.length !== 1 ? "s" : ""}`
                        : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
