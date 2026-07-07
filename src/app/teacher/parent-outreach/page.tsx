"use client";

// Parent outreach — the end-of-day draft box. Non-submitters (a nudge home) and
// bright spots (praise home) across ALL periods, plus a "praise anyone" picker.
// Queue drafts through the day; review, edit, and send each from your Gmail.
// All parent data comes from the gated /api/outreach route (service role) — it
// never rides the browser anon path.

import { useCallback, useEffect, useState } from "react";
import SiteNav from "@/components/SiteNav";
import { gmailComposeUrl } from "@/lib/parentOutreach";

interface Concern { studentId: string; name: string; period: string; submitted: number; possible: number; email: string | null; hasEmail: boolean }
interface Praise { studentId: string; name: string; period: string; reason: string; email: string | null; hasEmail: boolean }
interface QueueItem { id: string; kind: string; name: string; toEmail: string | null; subject: string; body: string; reason: string | null; gmailUrl: string | null }
interface RosterItem { id: string; name: string; period: string }
interface Data { connected: boolean; possibleDays: number; concern: Concern[]; praise: Praise[]; queue: QueueItem[]; roster: RosterItem[]; error?: string }

export default function ParentOutreachPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string }>>({});
  const [praiseWho, setPraiseWho] = useState("");
  const [praiseWhy, setPraiseWhy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/outreach", { cache: "no-store" });
      setData(await res.json());
    } catch { setData({ connected: false, possibleDays: 0, concern: [], praise: [], queue: [], roster: [] }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const post = useCallback(async (payload: Record<string, unknown>, key: string) => {
    setBusy(key);
    try { await fetch("/api/outreach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); await load(); }
    finally { setBusy(null); }
  }, [load]);

  const queueDraft = (kind: "concern" | "praise", studentId: string, reason?: string) => post({ action: "queue", kind, studentId, reason }, `q:${studentId}`);
  const dismiss = (id: string) => post({ action: "dismiss", id }, `d:${id}`);
  const markSent = (id: string) => post({ action: "send", id }, `s:${id}`);
  const saveEdit = (id: string, subject: string, body: string) => post({ action: "update", id, subject, body }, `u:${id}`);

  const submitPraise = () => {
    if (!praiseWho) return;
    const who = data?.roster?.find((r) => r.id === praiseWho);
    const fn = (who?.name || "").split(/\s+/)[0] || "your student";
    const reason = praiseWhy.trim() || `${fn} is doing great work in math`;
    void queueDraft("praise", praiseWho, reason);
    setPraiseWho(""); setPraiseWhy("");
  };

  const d = data;
  return (
    <div className="po-page">
      <SiteNav variant="teacher" />
      <style>{`
        .po-page { min-height:100vh; background:var(--bdb-ground); color:var(--bdb-ink); font-family:var(--bdb-font); padding-bottom:56px; }
        .po-wrap { max-width:1040px; margin:0 auto; padding:20px clamp(16px,3vw,28px); }
        .po-h1 { font-size:1.7rem; font-weight:700; letter-spacing:-0.02em; margin:6px 0 2px; }
        .po-sub { color:var(--bdb-ink-soft); font-size:0.95rem; margin:0 0 18px; }
        .po-note { background:var(--bdb-card); border:1px solid var(--bdb-line); border-left:5px solid var(--bdb-amber); border-radius:var(--bdb-r); padding:12px 16px; margin:0 0 18px; font-size:0.9rem; color:var(--bdb-ink-soft); }
        .po-sec { font-size:0.72rem; font-weight:800; letter-spacing:0.13em; text-transform:uppercase; color:var(--bdb-ink-faint); margin:26px 2px 12px; }
        .po-row { display:flex; align-items:center; gap:12px; flex-wrap:wrap; background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r); padding:12px 15px; margin-bottom:10px; box-shadow:var(--bdb-shadow-sm); }
        .po-row .who { font-weight:700; }
        .po-row .meta { color:var(--bdb-ink-soft); font-size:0.85rem; }
        .po-row .spacer { flex:1; }
        .po-tag { font-size:0.72rem; font-weight:700; padding:3px 9px; border-radius:var(--bdb-r-pill); background:var(--bdb-ground-2); color:var(--bdb-ink-soft); }
        .po-tag.warn { background:#fff2ea; color:#b04a1e; }
        .po-btn { font:inherit; font-weight:700; font-size:0.83rem; padding:7px 13px; border-radius:var(--bdb-r-pill); border:1px solid var(--bdb-line); background:var(--bdb-ground-2); color:var(--bdb-ink); cursor:pointer; }
        .po-btn.p { background:var(--bdb-ink); color:#fff; border-color:var(--bdb-ink); }
        .po-btn.g { background:var(--bdb-green); color:#fff; border-color:var(--bdb-green); text-decoration:none; display:inline-block; }
        .po-btn:disabled { opacity:0.55; cursor:default; }
        .po-draft { background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r); padding:14px 16px; margin-bottom:12px; box-shadow:var(--bdb-shadow-sm); }
        .po-draft-top { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:8px; }
        .po-kind { font-size:0.7rem; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; padding:3px 9px; border-radius:var(--bdb-r-pill); }
        .po-kind.concern { background:#fff2ea; color:#b04a1e; }
        .po-kind.praise { background:#e7f7ee; color:#1c7a4a; }
        .po-in { font:inherit; width:100%; border:1px solid var(--bdb-line); border-radius:10px; padding:8px 11px; background:var(--bdb-ground); color:var(--bdb-ink); }
        .po-ta { font:inherit; width:100%; min-height:150px; border:1px solid var(--bdb-line); border-radius:10px; padding:10px 12px; background:var(--bdb-ground); color:var(--bdb-ink); resize:vertical; line-height:1.5; white-space:pre-wrap; }
        .po-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; align-items:center; }
        .po-empty { color:var(--bdb-ink-faint); font-size:0.9rem; padding:6px 2px; }
        .po-picker { display:flex; gap:8px; flex-wrap:wrap; align-items:center; background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r); padding:12px 15px; }
        .po-picker select, .po-picker input { font:inherit; padding:8px 11px; border-radius:10px; border:1px solid var(--bdb-line); background:var(--bdb-ground); color:var(--bdb-ink); }
        .po-picker input { flex:1; min-width:200px; }
      `}</style>

      <div className="po-wrap">
        <h1 className="po-h1">Parent outreach</h1>
        <p className="po-sub">Queue notes home through the day, then review and send them all here. Each opens pre-filled in your Gmail — you send from your own address.</p>

        {loading && <div className="po-empty">Loading.</div>}

        {d && !d.connected && (
          <div className="po-note">Supabase is not connected yet — add the keys in Vercel and redeploy. Once your rosters and parent emails are in, this page fills in automatically.</div>
        )}
        {d?.error && <div className="po-note">Couldn&apos;t read the data yet ({d.error}). If this is a fresh setup, run <b>supabase/parent-outreach.sql</b> (and the proficiency migrations) in the Supabase SQL editor.</div>}

        {d && d.connected && (
          <>
            {/* Draft queue */}
            <div className="po-sec">Drafts ready to send ({d.queue.length})</div>
            {d.queue.length === 0 ? (
              <div className="po-empty">No drafts queued yet. Queue some from the lists below.</div>
            ) : d.queue.map((q) => {
              const e = edits[q.id] || { subject: q.subject, body: q.body };
              const url = q.toEmail ? gmailComposeUrl(q.toEmail, e.subject, e.body) : null;
              return (
                <div className="po-draft" key={q.id}>
                  <div className="po-draft-top">
                    <span className={`po-kind ${q.kind}`}>{q.kind}</span>
                    <b>{q.name}</b>
                    <span className="meta" style={{ color: "var(--bdb-ink-soft)", fontSize: "0.85rem" }}>{q.toEmail || "no parent email on file"}</span>
                  </div>
                  <input className="po-in" style={{ marginBottom: 8 }} value={e.subject} onChange={(ev) => setEdits((s) => ({ ...s, [q.id]: { subject: ev.target.value, body: e.body } }))} />
                  <textarea className="po-ta" value={e.body} onChange={(ev) => setEdits((s) => ({ ...s, [q.id]: { subject: e.subject, body: ev.target.value } }))} />
                  <div className="po-actions">
                    {url ? <a className="po-btn g" href={url} target="_blank" rel="noopener noreferrer">Open in Gmail</a> : <span className="po-tag warn">add a parent email to send</span>}
                    <button className="po-btn" disabled={busy === `u:${q.id}`} onClick={() => saveEdit(q.id, e.subject, e.body)}>Save edits</button>
                    <span className="spacer" style={{ flex: 1 }} />
                    <button className="po-btn p" disabled={busy === `s:${q.id}`} onClick={() => markSent(q.id)}>Mark sent</button>
                    <button className="po-btn" disabled={busy === `d:${q.id}`} onClick={() => dismiss(q.id)}>Remove</button>
                  </div>
                </div>
              );
            })}

            {/* Concern candidates */}
            <div className="po-sec">Needs a nudge — behind on warm-ups ({d.concern.length})</div>
            {d.concern.length === 0 ? (
              <div className="po-empty">{d.possibleDays < 3 ? "Not enough warm-up days yet to flag anyone." : "Nobody is behind right now."}</div>
            ) : d.concern.map((c) => (
              <div className="po-row" key={c.studentId}>
                <span className="who">{c.name}</span>
                <span className="meta">{c.period}</span>
                <span className="po-tag">{c.submitted}/{c.possible} warm-ups</span>
                {!c.hasEmail && <span className="po-tag warn">no parent email</span>}
                <span className="spacer" />
                <button className="po-btn p" disabled={busy === `q:${c.studentId}`} onClick={() => queueDraft("concern", c.studentId)}>Queue draft</button>
              </div>
            ))}

            {/* Praise candidates */}
            <div className="po-sec">Bright spots — worth a note home ({d.praise.length})</div>
            {d.praise.length === 0 ? (
              <div className="po-empty">No auto-flagged bright spots yet. You can still praise anyone below.</div>
            ) : d.praise.map((p) => (
              <div className="po-row" key={p.studentId}>
                <span className="who">{p.name}</span>
                <span className="meta">{p.period} · {p.reason}</span>
                {!p.hasEmail && <span className="po-tag warn">no parent email</span>}
                <span className="spacer" />
                <button className="po-btn p" disabled={busy === `q:${p.studentId}`} onClick={() => queueDraft("praise", p.studentId, p.reason)}>Queue draft</button>
              </div>
            ))}

            {/* Praise anyone */}
            <div className="po-sec">Praise a student</div>
            <div className="po-picker">
              <select value={praiseWho} onChange={(e) => setPraiseWho(e.target.value)}>
                <option value="">Pick a student…</option>
                {(d.roster || []).map((r) => <option key={r.id} value={r.id}>{r.name}{r.period ? ` (${r.period})` : ""}</option>)}
              </select>
              <input value={praiseWhy} onChange={(e) => setPraiseWhy(e.target.value)} placeholder="What did they do? (e.g. really strong effort on ratios this week)" />
              <button className="po-btn p" disabled={!praiseWho || busy === `q:${praiseWho}`} onClick={submitPraise}>Queue praise</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
