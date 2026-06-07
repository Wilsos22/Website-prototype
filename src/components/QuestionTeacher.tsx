"use client";

// Teacher-facing question session with a local persistent history and live polling.
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ToolHeader } from "./ToolHeader";

interface StudentResponse {
  id: string;
  name: string;
  answer: string;
  submittedAt: string;
}

interface QuestionSession {
  code: string;
  question: string;
  createdAt: string;
  responses: StudentResponse[];
}

export function QuestionTeacher() {
  const [question, setQuestion] = useState("");
  const [session, setSession] = useState<QuestionSession | null>(null);
  const [sessionHistory, setSessionHistory] = useState<QuestionSession[]>([]);
  const [status, setStatus] = useState("");

  const loadSessionHistory = useCallback(async () => {
    const response = await fetch("/api/session", { cache: "no-store" });

    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as { sessions: QuestionSession[] };
    setSessionHistory(data.sessions.slice(0, 6));
  }, []);

  const refreshSession = useCallback(async (code: string) => {
    const response = await fetch(`/api/session?code=${code}`, { cache: "no-store" });

    if (!response.ok) {
      setStatus("Session unavailable.");
      return;
    }

    const nextSession = (await response.json()) as QuestionSession;
    setSession(nextSession);
    setStatus("");
    await loadSessionHistory();
  }, [loadSessionHistory]);

  useEffect(() => {
    const savedCode = window.localStorage.getItem("big-dog-board-session-code");
    loadSessionHistory();

    if (savedCode) {
      refreshSession(savedCode);
    }
  }, [loadSessionHistory, refreshSession]);

  useEffect(() => {
    if (!session?.code) {
      return;
    }

    const interval = window.setInterval(() => {
      refreshSession(session.code);
    }, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshSession, session?.code]);

  const startSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("Starting...");

    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });

    if (!response.ok) {
      setStatus("Enter a question first.");
      return;
    }

    const nextSession = (await response.json()) as QuestionSession;
    window.localStorage.setItem("big-dog-board-session-code", nextSession.code);
    setSession(nextSession);
    setQuestion("");
    setStatus("");
    await loadSessionHistory();
  };

  const openSession = (nextSession: QuestionSession) => {
    window.localStorage.setItem("big-dog-board-session-code", nextSession.code);
    setSession(nextSession);
    setStatus("");
  };

  return (
    <>
      <ToolHeader title="Start Question" />
      <main className="form-page">
        <form className="form-panel" onSubmit={startSession}>
          <label className="field">
            Question
            <textarea
              className="text-area"
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Type a short question"
              value={question}
            />
          </label>
          <button className="big-button primary" type="submit">
            Create Join Code
          </button>
          {status && <p role="status">{status}</p>}
        </form>

        {session && (
          <section className="responses-panel" aria-live="polite">
            <div>
              <h2>Join Code</h2>
              <div className="code-card">{session.code}</div>
            </div>
            <div>
              <h2>Question</h2>
              <p>{session.question}</p>
            </div>
            <div>
              <h2>Responses ({session.responses.length})</h2>
              <button
                className="small-button"
                onClick={() => refreshSession(session.code)}
                type="button"
              >
                Refresh
              </button>
              <ul className="responses-list">
                {session.responses.map((response) => (
                  <li key={response.id} className="response-item">
                    <span className="response-name">{response.name}</span>
                    <p className="response-answer">{response.answer}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

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
                    <span className="response-name">Code {historySession.code}</span>
                    <span>{historySession.question}</span>
                    <span className="history-meta">
                      {historySession.responses.length} responses
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
