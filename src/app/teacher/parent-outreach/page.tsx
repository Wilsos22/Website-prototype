"use client";

// Parent outreach — surfaces who to contact from your Notion roster (parent of
// the day, top performers, behind on warm-ups) and writes a Draft into your
// Notion "Parent Contact Log" with one click. Each draft comes back with a Gmail
// send link (send from your own address) and a Notion link; you flip Draft ->
// Sent in Notion, and each student's page shows their full contact history.

import { useCallback, useEffect, useState } from "react";
import SiteNav from "@/components/SiteNav";

interface Cand { studentPageId: string; name: string; period: string; parentEmail: string | null; hasEmail: boolean }
interface Concern extends Cand { submitted: number; possible: number }
interface Praise extends Cand { avg: number; reason: string }
interface Data { connected: boolean; daily: Cand | null; concern: Concern[]; praise: Praise[]; roster: Cand[]; error?: string }
type DraftResult = { notionUrl?: string; gmailUrl?: string | null; error?: string; loading?: boolean };

export default function ParentOutreachPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<Record<string, DraftResult>>({});
  const [dailyWhy, setDailyWhy] = useState("");
  const [praiseWho, setPraiseWho] = useState("");
  const [praiseWhy, setPraiseWhy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await fetch("/api/outreach", { cache: "no-store" }); setData(await res.json()); }
    catch { setData({ connected: false, daily: null, concern: [], praise: [], roster: [] }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const draft = useCallback(async (key: string, payload: Record<string, unknown>) => {
    setResults((r) => ({ ...r, [key]: { loading: true } }));
    try {
      const res = await fetch("/api/outreach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "draft", ...payload }) });
      const d = await res.json();
      setResults((r) => ({ ...r, [key]: d.error ? { error: d.error } : { notionUrl: d.notionUrl, gmailUrl: d.gmailUrl } }));
    } catch { setResults((r) => ({ ...r, [key]: { error: "Couldn't reach the draft service." } })); }
  }, []);

  const draftFor = (kind: string, c: Cand, extra: Record<string, unknown> = {}) =>
    draft(`${kind}:${c.studentPageId}`, { kind, studentPageId: c.studentPageId, studentName: c.name, parentEmail: c.parentEmail, ...extra });

  const d = data;
  const Result = ({ k }: { k: string }) => {
    const r = results[k];
    if (!r) return null;
    if (r.loading) return <span className="po-muted">Drafting…</span>;
    if (r.error) return <span className="po-warn-t">{r.error}</span>;
    return (
      <span className="po-done">
        Drafted.
        {r.gmailUrl ? <a className="po-btn g" href={r.gmailUrl} target="_blank" rel="noopener noreferrer">Open in Gmail</a> : <span className="po-warn-t">no parent email</span>}
        {r.notionUrl && <a className="po-btn" href={r.notionUrl} target="_blank" rel="noopener noreferrer">Open in Notion</a>}
      </span>
    );
  };

  return (
    <div className="po-page">
      <SiteNav variant="teacher" />
      <style>{`
        .po-page { min-height:100vh; background:var(--bdb-ground); color:var(--bdb-ink); font-family:var(--bdb-font); padding-bottom:56px; }
        .po-wrap { max-width:1000px; margin:0 auto; padding:20px clamp(16px,3vw,28px); }
        .po-h1 { font-size:1.7rem; font-weight:700; letter-spacing:-0.02em; margin:6px 0 2px; }
        .po-sub { color:var(--bdb-ink-soft); font-size:0.95rem; margin:0 0 18px; }
        .po-note { background:var(--bdb-card); border:1px solid var(--bdb-line); border-left:5px solid var(--bdb-amber); border-radius:var(--bdb-r); padding:12px 16px; margin:0 0 16px; font-size:0.9rem; color:var(--bdb-ink-soft); }
        .po-sec { font-size:0.72rem; font-weight:800; letter-spacing:0.13em; text-transform:uppercase; color:var(--bdb-ink-faint); margin:26px 2px 12px; }
        .po-daily { background:var(--bdb-card); border:1px solid var(--bdb-line); border-left:5px solid var(--bdb-green); border-radius:var(--bdb-r-lg); padding:16px 18px; box-shadow:var(--bdb-shadow-sm); }
        .po-daily h2 { margin:0 0 2px; font-size:1.15rem; font-weight:700; }
        .po-daily .meta { color:var(--bdb-ink-soft); font-size:0.86rem; margin:0 0 10px; }
        .po-row { display:flex; align-items:center; gap:12px; flex-wrap:wrap; background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r); padding:12px 15px; margin-bottom:10px; box-shadow:var(--bdb-shadow-sm); }
        .po-row .who { font-weight:700; }
        .po-row .meta { color:var(--bdb-ink-soft); font-size:0.85rem; }
        .po-row .spacer { flex:1; }
        .po-tag { font-size:0.72rem; font-weight:700; padding:3px 9px; border-radius:var(--bdb-r-pill); background:var(--bdb-ground-2); color:var(--bdb-ink-soft); }
        .po-warn-t { font-size:0.8rem; font-weight:700; color:#b04a1e; }
        .po-muted { font-size:0.82rem; color:var(--bdb-ink-faint); }
        .po-done { display:inline-flex; align-items:center; gap:8px; font-size:0.83rem; font-weight:700; color:var(--bdb-green); flex-wrap:wrap; }
        .po-btn { font:inherit; font-weight:700; font-size:0.82rem; padding:6px 12px; border-radius:var(--bdb-r-pill); border:1px solid var(--bdb-line); background:var(--bdb-ground-2); color:var(--bdb-ink); cursor:pointer; text-decoration:none; display:inline-block; }
        .po-btn.p { background:var(--bdb-ink); color:#fff; border-color:var(--bdb-ink); }
        .po-btn.g { background:var(--bdb-green); color:#fff; border-color:var(--bdb-green); }
        .po-btn:disabled { opacity:0.55; cursor:default; }
        .po-picker { display:flex; gap:8px; flex-wrap:wrap; align-items:center; background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r); padding:12px 15px; }
        .po-picker select, .po-picker input, .po-in { font:inherit; padding:8px 11px; border-radius:10px; border:1px solid var(--bdb-line); background:var(--bdb-ground); color:var(--bdb-ink); }
        .po-picker input, .po-in { flex:1; min-width:200px; }
        .po-empty { color:var(--bdb-ink-faint); font-size:0.9rem; padding:6px 2px; }
      `}</style>

      <div className="po-wrap">
        <h1 className="po-h1">Parent outreach</h1>
        <p className="po-sub">One click drafts a note into your Notion Parent Contact Log and hands you a Gmail send link. Flip Draft to Sent in Notion; every student&apos;s page keeps their full contact history.</p>

        {loading && <div className="po-empty">Loading.</div>}
        {d && !d.connected && <div className="po-note">Notion roster isn&apos;t connected yet. Set NOTION_TOKEN + NOTION_ROSTER_DB_ID in Vercel and share the roster with the integration.</div>}
        {d?.error && <div className="po-note">Couldn&apos;t read Notion ({d.error}). Make sure the roster and the Parent Contact Log are both shared with your Big Dog Math integration.</div>}

        {d && d.connected && (
          <>
            {/* Parent of the day */}
            <div className="po-sec">Parent of the day</div>
            {d.daily ? (
              <div className="po-daily">
                <h2>{d.daily.name}</h2>
                <p className="meta">{d.daily.period} · a good-news note home{d.daily.hasEmail ? "" : " · no parent email on file"}</p>
                <div className="po-picker" style={{ border: "none", padding: 0, background: "none" }}>
                  <input className="po-in" value={dailyWhy} onChange={(e) => setDailyWhy(e.target.value)} placeholder="What did they do well? (optional — e.g. great focus during work time)" />
                  <button className="po-btn p" disabled={results[`praise:${d.daily.studentPageId}`]?.loading} onClick={() => draftFor("praise", d.daily!, { reason: dailyWhy.trim() || undefined })}>Draft positive note</button>
                </div>
                <div style={{ marginTop: 8 }}><Result k={`praise:${d.daily.studentPageId}`} /></div>
              </div>
            ) : <div className="po-empty">No roster loaded.</div>}

            {/* Doing great */}
            <div className="po-sec">Doing great — worth a note home ({d.praise.length})</div>
            {d.praise.length === 0 ? <div className="po-empty">No warm-up averages to rank yet.</div> : d.praise.map((p) => (
              <div className="po-row" key={p.studentPageId}>
                <span className="who">{p.name}</span>
                <span className="meta">{p.period} · avg {p.avg}</span>
                {!p.hasEmail && <span className="po-tag">no parent email</span>}
                <span className="spacer" />
                {results[`praise:${p.studentPageId}`] ? <Result k={`praise:${p.studentPageId}`} /> : <button className="po-btn p" onClick={() => draftFor("praise", p, { reason: p.reason })}>Draft praise</button>}
              </div>
            ))}

            {/* Behind on warm-ups */}
            <div className="po-sec">Behind on warm-ups ({d.concern.length})</div>
            {d.concern.length === 0 ? <div className="po-empty">Nobody is clearly behind right now.</div> : d.concern.map((c) => (
              <div className="po-row" key={c.studentPageId}>
                <span className="who">{c.name}</span>
                <span className="meta">{c.period}</span>
                <span className="po-tag">{c.submitted}/{c.possible} warm-ups</span>
                {!c.hasEmail && <span className="po-tag">no parent email</span>}
                <span className="spacer" />
                {results[`concern:${c.studentPageId}`] ? <Result k={`concern:${c.studentPageId}`} /> : <button className="po-btn p" onClick={() => draftFor("concern", c, { submitted: c.submitted, possible: c.possible })}>Draft nudge</button>}
              </div>
            ))}

            {/* Praise anyone */}
            <div className="po-sec">Praise a specific student</div>
            <div className="po-picker">
              <select value={praiseWho} onChange={(e) => setPraiseWho(e.target.value)}>
                <option value="">Pick a student…</option>
                {d.roster.map((r) => <option key={r.studentPageId} value={r.studentPageId}>{r.name}{r.period ? ` (${r.period})` : ""}</option>)}
              </select>
              <input value={praiseWhy} onChange={(e) => setPraiseWhy(e.target.value)} placeholder="What did they do? (e.g. strong effort on ratios this week)" />
              <button className="po-btn p" disabled={!praiseWho} onClick={() => {
                const s = d.roster.find((r) => r.studentPageId === praiseWho);
                if (s) void draftFor("praise", s, { reason: praiseWhy.trim() || undefined });
              }}>Queue praise</button>
            </div>
            {praiseWho && <div style={{ marginTop: 8 }}><Result k={`praise:${praiseWho}`} /></div>}
          </>
        )}
      </div>
    </div>
  );
}
