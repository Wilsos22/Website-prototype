"use client";

// Teacher: read daily exit-ticket responses. Lists recent tickets; open one to
// see every student's answer (a live tally for multiple-choice / fist-to-five,
// or the full list for short answers) — the read that shapes tomorrow's lesson.

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import SiteNav from "@/components/SiteNav";
import {
  listRecentExitTickets,
  getExitResponses,
  type ExitTicket,
  type ExitResponseRow,
} from "@/lib/exitTickets";

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const KIND_LABEL: Record<string, string> = {
  "short-answer": "Short answer",
  "multiple-choice": "Multiple choice",
  "fist-to-five": "Fist to five",
};

export default function TeacherExitTicketsPage() {
  const supabase = getSupabase();
  const [tickets, setTickets] = useState<ExitTicket[]>([]);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<ExitTicket | null>(null);
  const [responses, setResponses] = useState<ExitResponseRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    (async () => {
      const { tickets: rows, missing: miss } = await listRecentExitTickets(supabase);
      setMissing(miss); setTickets(rows); setLoading(false);
    })();
  }, [supabase]);

  const openTicket = useCallback(async (t: ExitTicket) => {
    if (!supabase) return;
    setOpen(t); setDetailLoading(true); setResponses([]);
    setResponses(await getExitResponses(supabase, t.id));
    setDetailLoading(false);
  }, [supabase]);

  // tally for choice-style tickets
  const tally = (() => {
    if (!open || open.kind === "short-answer") return null;
    const buckets = open.kind === "fist-to-five" ? ["0", "1", "2", "3", "4", "5"] : (open.choices || []);
    const counts = buckets.map((b) => ({ label: b, n: responses.filter((r) => (r.response || "") === b).length }));
    return counts;
  })();

  return (
    <main className="ex">
      <style>{styles}</style>
      <SiteNav variant="teacher" />
      <div className="ex-wrap">
        <h1 className="ex-h1">Exit tickets</h1>
        <p className="ex-sub">End-of-lesson responses, by class and day. Read before you plan tomorrow.</p>

        {!supabase && <div className="ex-warn">Supabase isn&apos;t connected yet — add your keys in Vercel and redeploy.</div>}
        {missing && <div className="ex-warn">Run <b>supabase/formative.sql</b> in the Supabase SQL editor to start collecting exit tickets.</div>}
        {loading && <p className="ex-soft">Loading…</p>}
        {!loading && supabase && !missing && tickets.length === 0 && (
          <div className="ex-card"><p className="ex-soft">No exit tickets yet. Add the <b>📝 Exit Ticket</b> state to a lesson and send it during class.</p></div>
        )}

        {!open && tickets.length > 0 && (
          <div className="ex-list">
            {tickets.map((t) => (
              <button key={t.id} className="ex-row" onClick={() => openTicket(t)}>
                <span className="ex-row-emoji">🎟️</span>
                <span className="ex-row-main">
                  <span className="ex-row-title">{t.prompt}</span>
                  <span className="ex-row-meta">{fmtWhen(t.created_at)} · {KIND_LABEL[t.kind] || t.kind}{t.status === "open" ? " · open" : ""}</span>
                </span>
                <span className="ex-row-go">View →</span>
              </button>
            ))}
          </div>
        )}

        {open && (
          <>
            <button className="ex-back" onClick={() => setOpen(null)}>← All exit tickets</button>
            <div className="ex-card">
              <div className="ex-d-title">{open.prompt}</div>
              <div className="ex-row-meta">{fmtWhen(open.created_at)} · {KIND_LABEL[open.kind] || open.kind} · {responses.length} responses</div>
            </div>

            {detailLoading ? <p className="ex-soft">Loading…</p> : responses.length === 0 ? (
              <div className="ex-card"><p className="ex-soft">No responses yet.</p></div>
            ) : tally ? (
              <div className="ex-card">
                <h3 className="ex-ch">Tally</h3>
                <div className="ex-tally">
                  {tally.map((b) => {
                    const pct = responses.length ? Math.round((b.n / responses.length) * 100) : 0;
                    return (
                      <div className="ex-tally-row" key={b.label}>
                        <span className="ex-tally-lab">{b.label}</span>
                        <span className="ex-tally-bar"><span className="ex-tally-fill" style={{ width: `${pct}%` }} /></span>
                        <span className="ex-tally-n">{b.n}</span>
                      </div>
                    );
                  })}
                </div>
                <h3 className="ex-ch" style={{ marginTop: 16 }}>Who answered</h3>
                <div className="ex-names">
                  {responses.map((r) => <span className="ex-name" key={r.id}>{r.display_name || "Student"}: <b>{r.response}</b></span>)}
                </div>
              </div>
            ) : (
              <div className="ex-card">
                <h3 className="ex-ch">Responses</h3>
                <div className="ex-answers">
                  {responses.map((r) => (
                    <div className="ex-answer" key={r.id}>
                      <span className="ex-answer-name">{r.display_name || "Student"}</span>
                      <span className="ex-answer-text">{r.response}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

const styles = `
  .ex { min-height:100vh; background:var(--bdb-ground); font-family:var(--bdb-font); color:var(--bdb-ink); padding-bottom:50px; }
  .ex-wrap { max-width:760px; margin:0 auto; padding:0 16px; display:grid; gap:14px; }
  .ex-h1 { font-size:clamp(1.7rem,5vw,2.4rem); font-weight:800; letter-spacing:-0.02em; margin:8px 0 0; }
  .ex-sub { color:var(--bdb-ink-soft); font-weight:500; margin:0; }
  .ex-soft { color:var(--bdb-ink-soft); font-weight:500; }
  .ex-warn { background:#fff7e6; border:1px solid #ffe2a8; color:#92660a; border-radius:14px; padding:14px 16px; font-weight:600; }
  .ex-card { background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r-lg); box-shadow:var(--bdb-shadow-sm); padding:18px 20px; }
  .ex-list { display:grid; gap:8px; }
  .ex-row { display:flex; align-items:center; gap:13px; text-align:left; width:100%; background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r); padding:14px 16px; cursor:pointer; box-shadow:var(--bdb-shadow-sm); }
  .ex-row:hover { border-color:var(--bdb-teal); }
  .ex-row-emoji { font-size:1.4rem; }
  .ex-row-main { display:flex; flex-direction:column; flex:1; min-width:0; }
  .ex-row-title { font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ex-row-meta { font-size:0.82rem; color:var(--bdb-ink-faint); font-weight:600; }
  .ex-row-go { font-weight:800; color:var(--bdb-teal); font-size:0.88rem; }
  .ex-back { align-self:flex-start; background:none; border:none; color:var(--bdb-ink-soft); font-weight:800; cursor:pointer; font-size:0.9rem; padding:4px 0; }
  .ex-d-title { font-size:1.2rem; font-weight:900; margin-bottom:4px; }
  .ex-ch { margin:0 0 12px; font-size:1.05rem; font-weight:900; }
  .ex-tally { display:flex; flex-direction:column; gap:8px; }
  .ex-tally-row { display:flex; align-items:center; gap:12px; }
  .ex-tally-lab { width:80px; font-weight:800; }
  .ex-tally-bar { flex:1; height:14px; background:var(--bdb-ground-2,#efe7d6); border-radius:999px; overflow:hidden; }
  .ex-tally-fill { display:block; height:100%; background:var(--bdb-teal); border-radius:999px; transition:width 300ms ease; }
  .ex-tally-n { font-weight:900; color:var(--bdb-ink); min-width:28px; text-align:right; }
  .ex-names { display:flex; flex-wrap:wrap; gap:8px; }
  .ex-name { background:var(--bdb-ground); border:1px solid var(--bdb-line); border-radius:999px; padding:7px 13px; font-weight:600; font-size:0.85rem; }
  .ex-answers { display:flex; flex-direction:column; gap:8px; }
  .ex-answer { display:flex; flex-direction:column; gap:2px; padding:11px 14px; border-radius:11px; background:var(--bdb-ground); }
  .ex-answer-name { font-weight:800; font-size:0.84rem; color:var(--bdb-ink-soft); }
  .ex-answer-text { font-weight:600; color:var(--bdb-ink); }
`;
