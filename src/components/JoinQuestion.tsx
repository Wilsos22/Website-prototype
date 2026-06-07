"use client";

// Student-facing form for joining by code and submitting one short answer.
import { FormEvent, useState } from "react";

export function JoinQuestion() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("");

  const submitAnswer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("Submitting...");

    const response = await fetch("/api/session/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name, answer }),
    });

    if (!response.ok) {
      setStatus("Check the code and try again.");
      return;
    }

    setAnswer("");
    setStatus("Submitted.");
  };

  return (
    <main className="form-page">
      <section className="brand-block" aria-labelledby="join-title">
        <div className="brand-mark" aria-hidden="true">
          BDB
        </div>
        <h1 id="join-title" className="brand-title">
          Join Question
        </h1>
      </section>

      <form className="form-panel" onSubmit={submitAnswer}>
        <label className="field">
          Name
          <input
            className="text-input"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </label>
        <label className="field">
          Code
          <input
            className="text-input"
            inputMode="numeric"
            maxLength={4}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
            value={code}
          />
        </label>
        <label className="field">
          Answer
          <textarea
            className="text-area"
            onChange={(event) => setAnswer(event.target.value)}
            value={answer}
          />
        </label>
        <button className="big-button primary" type="submit">
          Submit Answer
        </button>
        {status && <p role="status">{status}</p>}
      </form>
    </main>
  );
}
