"use client";

// Student exit-ticket surface. When the teacher launches an exit ticket from the
// Exit Ticket state, joined students are sent here; they answer one prompt
// (short answer, multiple choice, or a 0–5 confidence check) and it's saved to
// exit_ticket_responses. Polls the session for the current open ticket.

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { getStoredStudentSession, type StoredStudentSession } from "@/lib/liveClassFlow";
import { getOpenExitTicket, submitExitResponse, type ExitTicket } from "@/lib/exitTickets";

type View = "loading" | "needjoin" | "waiting" | "answering" | "submitted";

export default function ExitTicketPage() {
  const supabase = getSupabase();
  const [session, setSession] = useState<StoredStudentSession | null>(null);
  const [view, setView] = useState<View>("loading");
  const [ticket, setTicket] = useState<ExitTicket | null>(null);
  const [text, setText] = useState("");
  const submittedIdRef = useRef<string | null>(null);

  useEffect(() => {
    const s = getStoredStudentSession();
    setSession(s);
    setView(s ? "waiting" : "needjoin");
  }, []);

  // Poll for the session's current open exit ticket.
  useEffect(() => {
    if (!supabase || !session) return;
    let stop = false;
    const tick = async () => {
      const t = await getOpenExitTicket(supabase, session.sessionId);
      if (stop) return;
      if (!t) {
        if (submittedIdRef.current) return; // stay on the thank-you screen
        setTicket(null);
        setView((v) => (v === "answering" ? "waiting" : v === "submitted" ? v : "waiting"));
        return;
      }
      if (t.id !== ticket?.id && t.id !== submittedIdRef.current) {
        setTicket(t);
        setText("");
        setView("answering");
      }
    };
    void tick();
    const id = setInterval(tick, 3000);
    return () => { stop = true; clearInterval(id); };
  }, [supabase, session, ticket?.id]);

  const submit = useCallback(async (answer: string) => {
    if (!supabase || !session || !ticket || !answer.trim()) return;
    submittedIdRef.current = ticket.id;
    await submitExitResponse(supabase, {
      exitTicketId: ticket.id,
      sessionId: session.sessionId,
      studentId: session.studentId || null,
      displayName: session.name || null,
      response: answer.trim(),
    });
    setView("submitted");
  }, [supabase, session, ticket]);

  return (
    <main className="et">
      <style>{styles}</style>

      {view === "loading" && <div className="et-mid"><p className="et-soft">Loading…</p></div>}

      {view === "needjoin" && (
        <div className="et-mid et-card">
          <div className="et-emoji">🎟️</div>
          <h1 className="et-h">Join your class first</h1>
          <p className="et-soft">Exit tickets are part of a live class. Enter your teacher&apos;s code to join.</p>
          <a className="et-btn" href="/">Enter class code →</a>
        </div>
      )}

      {view === "waiting" && (
        <div className="et-mid et-card">
          <div className="et-emoji et-bounce">🎟️</div>
          <h1 className="et-h">Exit ticket</h1>
          <p className="et-soft">Waiting for your teacher to start the exit ticket…</p>
        </div>
      )}

      {view === "answering" && ticket && (
        <div className="et-mid">
          <div className="et-card et-q">
            <div className="et-tag">Exit ticket</div>
            <h1 className="et-prompt">{ticket.prompt}</h1>

            {ticket.kind === "short-answer" && (
              <>
                <textarea className="et-text" value={text} placeholder="Type your answer…" onChange={(e) => setText(e.target.value)} autoFocus />
                <button className="et-submit" onClick={() => submit(text)} disabled={!text.trim()}>Turn in →</button>
              </>
            )}

            {ticket.kind === "multiple-choice" && (
              <div className="et-choices">
                {(ticket.choices || []).map((c) => (
                  <button key={c} className="et-choice" onClick={() => submit(c)}>{c}</button>
                ))}
              </div>
            )}

            {ticket.kind === "fist-to-five" && (
              <>
                <p className="et-soft" style={{ marginBottom: 10 }}>0 = lost · 5 = I&apos;ve got it</p>
                <div className="et-fist">
                  {["0","1","2","3","4","5"].map((n) => (
                    <button key={n} className="et-fist-btn" onClick={() => submit(n)}>{n}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {view === "submitted" && (
        <div className="et-mid et-card">
          <div className="et-emoji">✅</div>
          <h1 className="et-h">Turned in!</h1>
          <p className="et-soft">Thanks{session ? `, ${session.name.split(" ")[0]}` : ""} — have a great day.</p>
        </div>
      )}
    </main>
  );
}

const styles = `
  .et { min-height:100vh; background:var(--bdb-ground); font-family:var(--bdb-font); color:var(--bdb-ink);
    display:flex; flex-direction:column; padding:clamp(14px,3vw,30px) 16px; box-sizing:border-box; }
  .et-mid { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; text-align:center; }
  .et-card { background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r-lg);
    box-shadow:var(--bdb-shadow); padding:30px 26px; max-width:460px; width:100%; }
  .et-emoji { font-size:3rem; line-height:1; }
  .et-bounce { animation:etB 1.4s ease-in-out infinite; }
  @keyframes etB { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-7px);} }
  .et-h { font-size:clamp(1.5rem,5vw,2rem); font-weight:800; letter-spacing:-0.02em; margin:10px 0 6px; }
  .et-soft { color:var(--bdb-ink-soft); font-weight:500; }
  .et-btn { display:inline-block; margin-top:14px; background:var(--bdb-teal); color:#fff; text-decoration:none; font-weight:800; padding:13px 24px; border-radius:var(--bdb-r); }
  .et-q { text-align:left; }
  .et-tag { font-size:0.74rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; color:var(--bdb-ink-faint); }
  .et-prompt { font-size:clamp(1.3rem,4.5vw,1.8rem); font-weight:800; letter-spacing:-0.01em; margin:8px 0 16px; }
  .et-text { width:100%; min-height:130px; box-sizing:border-box; border:2px solid var(--bdb-line); border-radius:14px;
    padding:14px; font-family:inherit; font-size:1.1rem; font-weight:600; color:var(--bdb-ink); background:var(--bdb-ground); resize:vertical; }
  .et-submit { width:100%; margin-top:12px; background:var(--bdb-teal); color:#fff; border:none; border-radius:14px;
    padding:15px 0; font-size:1.15rem; font-weight:900; cursor:pointer; }
  .et-submit:disabled { opacity:0.4; cursor:default; }
  .et-choices { display:grid; gap:10px; }
  .et-choice { background:var(--bdb-ground); border:2px solid var(--bdb-line); border-radius:14px; padding:16px;
    font-size:1.2rem; font-weight:800; color:var(--bdb-ink); cursor:pointer; text-align:left; }
  .et-choice:hover { border-color:var(--bdb-teal); }
  .et-fist { display:grid; grid-template-columns:repeat(6,1fr); gap:8px; }
  .et-fist-btn { background:var(--bdb-ground); border:2px solid var(--bdb-line); border-radius:14px; padding:18px 0;
    font-size:1.5rem; font-weight:900; color:var(--bdb-ink); cursor:pointer; }
  .et-fist-btn:hover { border-color:var(--bdb-teal); }
`;
