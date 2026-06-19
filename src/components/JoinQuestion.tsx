"use client";

// Redesigned student-facing join flow: code entry → dynamic session response (question or fist-to-five).
// Anonymous question can be submitted at any time once a session is active.
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import {
  LIVE_FLOW_MODE,
  LIVE_FLOW_ROUTE,
  STUDENT_SESSION_KEY,
} from "@/lib/liveClassFlow";

type SessionType = "question" | "fist-to-five";

interface SessionInfo {
  code: string;
  type: SessionType;
  question: string;
}

type Step = "enter" | "respond" | "done";

const FIST_LEVELS = [
  { rating: 0, label: "Not yet", color: "#c0392b", textColor: "#fff" },
  { rating: 1, label: "Confused", color: "#e67e22", textColor: "#fff" },
  { rating: 2, label: "Starting", color: "#d4ac0d", textColor: "#fff" },
  { rating: 3, label: "Getting it", color: "#27ae60", textColor: "#fff" },
  { rating: 4, label: "Got it", color: "#1a7a48", textColor: "#fff" },
  { rating: 5, label: "Can explain", color: "#1565c0", textColor: "#fff" },
] as const;

export function JoinQuestion() {
  const router = useRouter();
  const supabase = getSupabase();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>("enter");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("");
  const [submittedRating, setSubmittedRating] = useState<number | null>(null);

  // Anonymous question state
  const [anonOpen, setAnonOpen] = useState(false);
  const [anonText, setAnonText] = useState("");
  const [anonStatus, setAnonStatus] = useState("");

  useEffect(() => {
    try {
      localStorage.removeItem(STUDENT_SESSION_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const lookupSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanCode = code.trim().toUpperCase();

    if (!cleanName || cleanCode.length < 2) {
      setStatus("Enter your name and the code from the board.");
      return;
    }
    setStatus("Looking up code...");

    if (supabase) {
      const { data: liveSession, error: liveError } = await supabase
        .from("sessions")
        .select("id,period_id,broadcast,status")
        .eq("join_code", cleanCode)
        .eq("status", "open")
        .limit(1)
        .maybeSingle();

      if (liveError) {
        setStatus(liveError.message);
        return;
      }

      if (liveSession) {
        const row = liveSession as {
          id: string;
          period_id: string;
          broadcast: string | null;
          status: string;
        };
        const { error: joinError } = await supabase.from("session_joins").insert({
          session_id: row.id,
          display_name: cleanName,
        });

        if (joinError) {
          setStatus(joinError.message);
          return;
        }

        try {
          localStorage.setItem("bdm-student-name", cleanName);
          localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify({
            sessionId: row.id,
            studentId: "",
            name: cleanName,
          }));
        } catch {
          /* ignore */
        }

        const target = row.broadcast === LIVE_FLOW_MODE
          ? LIVE_FLOW_ROUTE
          : row.broadcast && row.broadcast !== "free"
            ? row.broadcast
            : "/lesson";
        router.push(target);
        return;
      }
    }

    const res = await fetch(`/api/session?code=${cleanCode}`, { cache: "no-store" });

    if (!res.ok) {
      setStatus("Code not found — double-check with your teacher.");
      return;
    }

    const data = (await res.json()) as SessionInfo;
    setSession(data);
    setStatus("");
    setStep("respond");
  };

  const submitAnswer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!answer.trim()) return;
    setStatus("Submitting...");

    const res = await fetch("/api/session/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name, answer }),
    });

    if (!res.ok) {
      setStatus("Something went wrong. Try again.");
      return;
    }

    setStep("done");
    setStatus("");
  };

  const submitRating = async (rating: number) => {
    setSubmittedRating(rating);

    const res = await fetch("/api/session/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name, answer: "", rating }),
    });

    if (!res.ok) {
      setSubmittedRating(null);
      setStatus("Something went wrong. Try again.");
      return;
    }

    setStep("done");
  };

  const submitAnonQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!anonText.trim()) return;
    setAnonStatus("Sending...");

    const res = await fetch("/api/session/anon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, text: anonText }),
    });

    if (!res.ok) {
      setAnonStatus("Couldn't send. Try again.");
      return;
    }

    setAnonText("");
    setAnonStatus("Sent! Your teacher will see it.");
    setTimeout(() => {
      setAnonOpen(false);
      setAnonStatus("");
    }, 1800);
  };

  return (
    <>
      <style>{`
        .join-root {
          min-height: 100vh;
          background: #0f1117;
          color: #fff;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px;
          font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        }
        .join-card {
          width: min(100%, 520px);
          background: #1a1d27;
          border: 2px solid #2a2e3d;
          border-radius: 16px;
          padding: 36px 32px;
          display: grid;
          gap: 28px;
        }
        .join-wordmark {
          font-size: 0.85rem;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #4e6ef2;
          margin: 0;
        }
        .join-heading {
          margin: 0;
          font-size: clamp(1.6rem, 5vw, 2.4rem);
          font-weight: 900;
          line-height: 1.1;
          color: #fff;
        }
        .join-sub {
          margin: 6px 0 0;
          color: #8b92a8;
          font-size: 1rem;
        }
        .join-field {
          display: grid;
          gap: 8px;
        }
        .join-label {
          font-size: 0.85rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #8b92a8;
        }
        .join-input {
          background: #0f1117;
          border: 2px solid #2a2e3d;
          border-radius: 10px;
          color: #fff;
          font-size: 1.15rem;
          font-weight: 700;
          padding: 14px 16px;
          width: 100%;
          transition: border-color 150ms ease;
        }
        .join-input:focus {
          outline: none;
          border-color: #4e6ef2;
        }
        .join-input.code-input {
          font-size: 2rem;
          letter-spacing: 0.2em;
          text-align: center;
        }
        .join-btn {
          background: #4e6ef2;
          border: none;
          border-radius: 10px;
          color: #fff;
          cursor: pointer;
          font-size: 1.1rem;
          font-weight: 900;
          padding: 16px;
          width: 100%;
          transition: background 140ms ease, transform 140ms ease;
        }
        .join-btn:hover {
          background: #3b5be6;
          transform: translateY(-1px);
        }
        .join-btn:active {
          transform: none;
        }
        .join-status {
          color: #8b92a8;
          font-size: 0.95rem;
          text-align: center;
          margin: 0;
        }
        .join-status.error {
          color: #e05555;
        }

        /* Fist-to-five grid */
        .f2f-prompt {
          background: #0f1117;
          border: 2px solid #2a2e3d;
          border-radius: 10px;
          padding: 16px;
          color: #cbd0e0;
          font-size: 1.05rem;
          font-weight: 600;
          line-height: 1.5;
        }
        .f2f-instruct {
          font-size: 0.9rem;
          color: #6b7494;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          margin: 0 0 4px;
        }
        .f2f-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .f2f-btn {
          border: none;
          border-radius: 12px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 18px 10px;
          transition: transform 150ms ease, box-shadow 150ms ease;
          -webkit-tap-highlight-color: transparent;
        }
        .f2f-btn:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 28px rgb(0 0 0 / 40%);
        }
        .f2f-btn:active {
          transform: scale(0.96);
        }
        .f2f-btn.selected {
          outline: 4px solid #fff;
          outline-offset: 2px;
        }
        .f2f-num {
          font-size: 2.8rem;
          font-weight: 900;
          line-height: 1;
        }
        .f2f-label {
          font-size: 0.78rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          opacity: 0.9;
        }

        /* Done state */
        .done-icon {
          font-size: 4rem;
          text-align: center;
        }
        .done-text {
          font-size: 1.6rem;
          font-weight: 900;
          color: #fff;
          text-align: center;
          margin: 0;
        }
        .done-sub {
          color: #6b7494;
          text-align: center;
          margin: 0;
          font-size: 0.95rem;
        }
        .done-rating-badge {
          text-align: center;
          font-size: 1.1rem;
          font-weight: 800;
          padding: 12px 20px;
          border-radius: 10px;
          display: inline-block;
          margin: 0 auto;
        }

        /* Anonymous question */
        .anon-trigger {
          background: transparent;
          border: 2px solid #2a2e3d;
          border-radius: 10px;
          color: #6b7494;
          cursor: pointer;
          font-size: 0.9rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          padding: 12px;
          text-align: center;
          text-transform: uppercase;
          transition: border-color 150ms ease, color 150ms ease;
          width: 100%;
        }
        .anon-trigger:hover {
          border-color: #4e6ef2;
          color: #a0a8c0;
        }
        .anon-overlay {
          position: fixed;
          inset: 0;
          background: rgb(0 0 0 / 72%);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          z-index: 100;
          padding: 16px;
        }
        .anon-sheet {
          background: #1a1d27;
          border: 2px solid #2a2e3d;
          border-radius: 16px;
          padding: 28px 24px;
          width: min(100%, 520px);
          display: grid;
          gap: 20px;
        }
        .anon-title {
          font-size: 1.25rem;
          font-weight: 900;
          margin: 0;
          color: #fff;
        }
        .anon-note {
          font-size: 0.88rem;
          color: #6b7494;
          margin: 4px 0 0;
          font-weight: 600;
        }
        .anon-textarea {
          background: #0f1117;
          border: 2px solid #2a2e3d;
          border-radius: 10px;
          color: #fff;
          font-size: 1rem;
          min-height: 100px;
          padding: 14px;
          resize: none;
          width: 100%;
          font-family: inherit;
        }
        .anon-textarea:focus {
          outline: none;
          border-color: #4e6ef2;
        }
        .anon-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .anon-cancel {
          background: transparent;
          border: 2px solid #2a2e3d;
          border-radius: 10px;
          color: #8b92a8;
          cursor: pointer;
          font-size: 1rem;
          font-weight: 800;
          padding: 14px;
          transition: border-color 140ms ease;
        }
        .anon-cancel:hover {
          border-color: #4a5068;
        }
        .anon-submit {
          background: #4e6ef2;
          border: none;
          border-radius: 10px;
          color: #fff;
          cursor: pointer;
          font-size: 1rem;
          font-weight: 900;
          padding: 14px;
          transition: background 140ms ease;
        }
        .anon-submit:hover {
          background: #3b5be6;
        }

        @media (max-width: 480px) {
          .join-card { padding: 24px 18px; }
          .f2f-grid { grid-template-columns: repeat(2, 1fr); }
          .f2f-btn { padding: 16px 8px; }
        }
      `}</style>

      <div className="join-root">
        <div className="join-card">
          <div>
            <p className="join-wordmark">Big Dog Math</p>
          </div>

          {step === "enter" && (
            <form onSubmit={lookupSession} style={{ display: "grid", gap: "20px" }}>
              <div>
                <h1 className="join-heading">Join Session</h1>
                <p className="join-sub">Enter your name and the code from the board.</p>
              </div>

              <div className="join-field">
                <label className="join-label" htmlFor="join-name">Your Name</label>
                <input
                  autoCapitalize="words"
                  autoComplete="given-name"
                  className="join-input"
                  id="join-name"
                  onChange={(e) => setName(e.target.value)}
                  placeholder="First name"
                  type="text"
                  value={name}
                />
              </div>

              <div className="join-field">
                <label className="join-label" htmlFor="join-code">Session Code</label>
                <input
                  className="join-input code-input"
                  id="join-code"
                  autoCapitalize="characters"
                  autoComplete="off"
                  inputMode="text"
                  maxLength={8}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
                  placeholder="DOG123"
                  value={code}
                />
              </div>

              <button className="join-btn" type="submit">
                Join →
              </button>

              {status && (
                <p className={`join-status ${status.includes("not found") || status.includes("Enter") ? "error" : ""}`} role="status">
                  {status}
                </p>
              )}
            </form>
          )}

          {step === "respond" && session?.type === "fist-to-five" && (
            <div style={{ display: "grid", gap: "20px" }}>
              <div>
                <h1 className="join-heading">Fist to Five</h1>
                <p className="join-sub">How well do you understand this right now?</p>
              </div>

              {session.question && (
                <div className="f2f-prompt">
                  <p className="f2f-instruct">Concept</p>
                  {session.question}
                </div>
              )}

              <div>
                <p className="f2f-instruct" style={{ marginBottom: "12px" }}>
                  Tap your number — 0 means lost, 5 means you could explain it
                </p>
                <div className="f2f-grid">
                  {FIST_LEVELS.map(({ rating, label, color, textColor }) => (
                    <button
                      className={`f2f-btn${submittedRating === rating ? " selected" : ""}`}
                      key={rating}
                      onClick={() => submitRating(rating)}
                      style={{ background: color, color: textColor }}
                      type="button"
                    >
                      <span className="f2f-num">{rating}</span>
                      <span className="f2f-label">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {status && <p className="join-status error" role="status">{status}</p>}

              <button
                className="anon-trigger"
                onClick={() => setAnonOpen(true)}
                type="button"
              >
                🔒 Ask a question anonymously
              </button>
            </div>
          )}

          {step === "respond" && session?.type === "question" && (
            <form onSubmit={submitAnswer} style={{ display: "grid", gap: "20px" }}>
              <div>
                <h1 className="join-heading">Your Answer</h1>
              </div>

              {session.question && (
                <div className="f2f-prompt">
                  {session.question}
                </div>
              )}

              <div className="join-field">
                <label className="join-label" htmlFor="join-answer">Answer</label>
                <textarea
                  className="join-input anon-textarea"
                  id="join-answer"
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Write your answer here"
                  rows={4}
                  value={answer}
                />
              </div>

              <button className="join-btn" type="submit">
                Submit Answer
              </button>

              {status && <p className="join-status error" role="status">{status}</p>}

              <button
                className="anon-trigger"
                onClick={() => setAnonOpen(true)}
                type="button"
              >
                🔒 Ask a question anonymously
              </button>
            </form>
          )}

          {step === "done" && (
            <div style={{ display: "grid", gap: "20px", textAlign: "center" }}>
              <div className="done-icon">
                {submittedRating !== null && submittedRating >= 4 ? "🙌" : submittedRating !== null && submittedRating <= 1 ? "✊" : "👍"}
              </div>
              <p className="done-text">
                {submittedRating !== null
                  ? `You rated a ${submittedRating}`
                  : "Answer submitted!"}
              </p>

              {submittedRating !== null && (
                <div
                  className="done-rating-badge"
                  style={{
                    background: FIST_LEVELS[submittedRating].color,
                    color: FIST_LEVELS[submittedRating].textColor,
                  }}
                >
                  {FIST_LEVELS[submittedRating].label}
                </div>
              )}

              <p className="done-sub">
                Your teacher has your response. Keep working!
              </p>

              <button
                className="anon-trigger"
                onClick={() => setAnonOpen(true)}
                type="button"
              >
                🔒 Ask a question anonymously
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Anonymous question sheet */}
      {anonOpen && session && (
        <div className="anon-overlay" onClick={(e) => e.target === e.currentTarget && setAnonOpen(false)}>
          <div className="anon-sheet">
            <div>
              <h2 className="anon-title">Ask Anonymously</h2>
              <p className="anon-note">Only your teacher will see this. Your name won't be shown.</p>
            </div>

            <form onSubmit={submitAnonQuestion} style={{ display: "grid", gap: "16px" }}>
              <textarea
                autoFocus
                className="anon-textarea"
                onChange={(e) => setAnonText(e.target.value)}
                placeholder="What's your question?"
                value={anonText}
              />

              {anonStatus && (
                <p
                  className="join-status"
                  role="status"
                  style={{ color: anonStatus.includes("Sent") ? "#27ae60" : undefined }}
                >
                  {anonStatus}
                </p>
              )}

              <div className="anon-actions">
                <button
                  className="anon-cancel"
                  onClick={() => setAnonOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button className="anon-submit" type="submit">
                  Send →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
