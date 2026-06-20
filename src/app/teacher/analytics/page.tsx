"use client";

// Warm-up insights — formative, fast.
// Reads the pre-computed "Warm-Up Weekly Summaries" DB (triage: missing, low,
// completion, status) plus links into each day's Google Forms summary.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface WeeklySummary {
  id: string;
  student: string;
  studentEmail: string;
  period: string;
  week: string;
  weekNumber: number | null;
  weekStart: string;
  expectedDays: string;
  expectedNum: number | null;
  submittedCount: number | null;
  missingDays: string;
  weeklyAvgScore: number | null;
  completion: number | null;
  status: string;
}
interface WarmupForm {
  id: string;
  name: string;
  className: string;
  date: string;
  summaryUrl: string;
  responseSheet: string;
}

const SCOPES = [
  { label: "Last 2 weeks", days: 14 },
  { label: "This week", days: 7 },
  { label: "Last 4 weeks", days: 28 },
];

function studentLabel(s: WeeklySummary) {
  if (s.student && !/^week/i.test(s.student)) return s.student;
  const email = s.studentEmail || "";
  return email ? email.split("@")[0] : "Student";
}
function avgText(v: number | null) { return v === null ? "—" : v.toFixed(1); }
function expectedText(s: WeeklySummary) {
  const exp = s.expectedNum !== null ? String(s.expectedNum) : (s.expectedDays || "?");
  return `${s.submittedCount ?? 0} / ${exp}`;
}
function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function statusKind(status: string): "ok" | "warn" | "bad" {
  const s = status.toLowerCase();
  if (s.includes("complete")) return "ok";
  if (s.includes("no submission")) return "bad";
  return "warn";
}

export default function WarmupInsightsPage() {
  const [summaries, setSummaries] = useState<WeeklySummary[]>([]);
  const [forms, setForms] = useState<WarmupForm[]>([]);
  const [days, setDays] = useState(14);
  const [period, setPeriod] = useState("");
  const [threshold, setThreshold] = useState(3);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    setLoading(true); setError("");
    (async () => {
      try {
        const res = await fetch(`/api/warmup-summaries?days=${days}`);
        const data = await res.json() as { summaries?: WeeklySummary[]; forms?: WarmupForm[]; error?: string };
        if (stop) return;
        if (!res.ok || data.error) throw new Error(data.error || "Could not load warm-up insights.");
        setSummaries(data.summaries ?? []);
        setForms(data.forms ?? []);
      } catch (err) {
        if (!stop) setError(err instanceof Error ? err.message : "Could not load warm-up insights.");
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => { stop = true; };
  }, [days]);

  const periods = useMemo(
    () => Array.from(new Set(summaries.map((s) => s.period).filter(Boolean))).sort(),
    [summaries]
  );
  const rows = useMemo(
    () => summaries.filter((s) => !period || s.period === period),
    [summaries, period]
  );

  const isFlagged = (s: WeeklySummary) =>
    s.status.toLowerCase().includes("missing") ||
    s.status.toLowerCase().includes("no submission") ||
    (s.weeklyAvgScore !== null && s.weeklyAvgScore < threshold);

  const needsFollowUp = useMemo(() => rows.filter(isFlagged).sort((a, b) =>
    (b.weekStart || "").localeCompare(a.weekStart || "") ||
    (a.weeklyAvgScore ?? 99) - (b.weeklyAvgScore ?? 99)
  ), [rows, threshold]);

  const missing = useMemo(() => rows.filter((s) =>
    s.status && !s.status.toLowerCase().includes("complete")
  ).sort((a, b) => studentLabel(a).localeCompare(studentLabel(b))), [rows]);

  const lowAvg = useMemo(() => rows.filter((s) => s.weeklyAvgScore !== null)
    .sort((a, b) => (a.weeklyAvgScore ?? 0) - (b.weeklyAvgScore ?? 0)), [rows]);

  const periodOverview = useMemo(() => {
    const map = new Map<string, { period: string; n: number; avgSum: number; avgN: number; compSum: number; compN: number; flagged: number }>();
    for (const s of rows) {
      const k = s.period || "—";
      const e = map.get(k) ?? { period: k, n: 0, avgSum: 0, avgN: 0, compSum: 0, compN: 0, flagged: 0 };
      e.n += 1;
      if (s.weeklyAvgScore !== null) { e.avgSum += s.weeklyAvgScore; e.avgN += 1; }
      if (s.completion !== null) { e.compSum += s.completion; e.compN += 1; }
      if (isFlagged(s)) e.flagged += 1;
      map.set(k, e);
    }
    return Array.from(map.values()).sort((a, b) => a.period.localeCompare(b.period));
  }, [rows, threshold]);

  const formsByDate = useMemo(() => {
    const map = new Map<string, WarmupForm[]>();
    for (const f of forms) { const k = f.date || "—"; (map.get(k) ?? map.set(k, []).get(k)!).push(f); }
    return Array.from(map.entries()).sort((a, b) => (b[0]).localeCompare(a[0]));
  }, [forms]);

  return (
    <div className="wi">
      <style>{`
        .wi { min-height:100vh; background:var(--bdb-ground); color:var(--bdb-ink); font-family:var(--bdb-font); }
        .wi-wrap { max-width:1100px; margin:0 auto; padding:clamp(16px,3vw,30px) clamp(14px,3vw,28px) 56px; }
        .wi-top { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:6px; }
        .wi-h1 { margin:0; font-size:clamp(1.6rem,3.4vw,2.2rem); font-weight:700; letter-spacing:-0.02em; }
        .wi-sub { margin:4px 0 0; color:var(--bdb-ink-soft); font-size:0.96rem; }
        .wi-back { color:var(--bdb-ink-soft); font-weight:600; font-size:0.86rem; text-decoration:none; border:1px solid var(--bdb-line); background:var(--bdb-card); border-radius:var(--bdb-r-pill); padding:8px 14px; }

        .wi-controls { display:flex; gap:10px; align-items:end; flex-wrap:wrap; margin:18px 0 6px; }
        .wi-field { display:grid; gap:5px; font-size:0.74rem; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:var(--bdb-ink-faint); }
        .wi-field select, .wi-field input { min-height:40px; border:1px solid var(--bdb-line); border-radius:var(--bdb-r-sm); padding:8px 11px; font:inherit; font-weight:600; color:var(--bdb-ink); background:var(--bdb-card); min-width:150px; }
        .wi-seg { display:inline-flex; background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r-pill); padding:3px; gap:3px; }
        .wi-seg button { border:none; background:transparent; border-radius:var(--bdb-r-pill); padding:7px 14px; font:inherit; font-weight:600; font-size:0.86rem; color:var(--bdb-ink-soft); cursor:pointer; }
        .wi-seg button.on { background:var(--bdb-ink); color:#fff; }

        .wi-metrics { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin:16px 0 8px; }
        .wi-metric { background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r); padding:14px 16px; box-shadow:var(--bdb-shadow-sm); }
        .wi-metric .ml { margin:0 0 6px; font-size:0.72rem; font-weight:700; letter-spacing:0.07em; text-transform:uppercase; color:var(--bdb-ink-faint); }
        .wi-metric .mv { margin:0; font-size:1.7rem; font-weight:700; letter-spacing:-0.02em; }

        .wi-card { background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r); box-shadow:var(--bdb-shadow-sm); padding:18px 20px; margin-top:18px; }
        .wi-card.accent { border-left:5px solid var(--bdb-coral); }
        .wi-card h2 { margin:0 0 3px; font-size:1.08rem; font-weight:700; }
        .wi-card .ch { color:var(--bdb-ink-soft); font-size:0.86rem; margin:0 0 14px; }
        .wi-empty { color:var(--bdb-ink-faint); font-size:0.92rem; }

        .wi-table { width:100%; border-collapse:collapse; font-size:0.9rem; }
        .wi-table th, .wi-table td { text-align:left; padding:9px 12px; border-bottom:1px solid var(--bdb-line); white-space:nowrap; }
        .wi-table th { font-size:0.7rem; font-weight:700; letter-spacing:0.07em; text-transform:uppercase; color:var(--bdb-ink-faint); }
        .wi-table td.num { font-variant-numeric:tabular-nums; }
        .wi-table tr:last-child td { border-bottom:none; }
        .wi-student { font-weight:600; }
        .wi-email { color:var(--bdb-ink-faint); font-size:0.8rem; }

        .badge { display:inline-block; padding:3px 10px; border-radius:var(--bdb-r-pill); font-size:0.76rem; font-weight:700; }
        .badge.ok { background:color-mix(in srgb,var(--bdb-green) 16%,white); color:#1c6b4a; }
        .badge.warn { background:color-mix(in srgb,var(--bdb-amber) 22%,white); color:#8a5a0b; }
        .badge.bad { background:color-mix(in srgb,var(--bdb-coral) 16%,white); color:#9a3412; }

        .wi-daily { display:grid; gap:14px; }
        .wi-day h3 { margin:0 0 8px; font-size:0.82rem; font-weight:700; color:var(--bdb-ink-soft); }
        .wi-forms { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:10px; }
        .wi-form { border:1px solid var(--bdb-line); border-radius:var(--bdb-r-sm); padding:12px 14px; background:var(--bdb-ground); }
        .wi-form .fn { font-weight:600; font-size:0.92rem; margin:0 0 8px; }
        .wi-form .fl { display:flex; gap:8px; flex-wrap:wrap; }
        .wi-form a { font-size:0.8rem; font-weight:700; text-decoration:none; padding:6px 11px; border-radius:var(--bdb-r-pill); }
        .wi-form a.primary { background:var(--bdb-teal); color:#fff; }
        .wi-form a.ghost { border:1px solid var(--bdb-line); color:var(--bdb-ink-soft); }

        .wi-err { background:color-mix(in srgb,var(--bdb-coral) 8%,white); border:1px solid color-mix(in srgb,var(--bdb-coral) 30%,white); color:#9a3412; border-radius:var(--bdb-r); padding:16px; white-space:pre-wrap; font-size:0.9rem; }
        @media (max-width:640px){ .wi-card { overflow-x:auto; } }
      `}</style>

      <div className="wi-wrap">
        <header className="wi-top">
          <div>
            <h1 className="wi-h1">Warm-up insights</h1>
            <p className="wi-sub">Who needs follow-up, who&apos;s missing, and how each class is trending.</p>
          </div>
          <Link className="wi-back" href="/teacher">← Back to tools</Link>
        </header>

        <div className="wi-controls">
          <div className="wi-field">Scope
            <div className="wi-seg">
              {SCOPES.map((s) => (
                <button key={s.days} className={days === s.days ? "on" : ""} onClick={() => setDays(s.days)}>{s.label}</button>
              ))}
            </div>
          </div>
          <label className="wi-field">Period
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="">All periods</option>
              {periods.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="wi-field">Flag weekly avg below
            <input type="number" min={0} max={5} step={0.5} value={threshold} onChange={(e) => setThreshold(Number(e.target.value) || 0)} />
          </label>
        </div>

        {loading && <section className="wi-card"><p className="wi-empty">Loading warm-up insights…</p></section>}
        {!loading && error && (
          <section className="wi-card"><pre className="wi-err">{error}

If this mentions sharing: open the “Warm-Up Weekly Summaries” database in Notion → ••• → Connections → add “Big Dog Math”.</pre></section>
        )}

        {!loading && !error && (
          <>
            <section className="wi-metrics">
              <div className="wi-metric"><p className="ml">Flagged this window</p><p className="mv">{needsFollowUp.length}</p></div>
              <div className="wi-metric"><p className="ml">Missing warm-ups</p><p className="mv">{missing.length}</p></div>
              <div className="wi-metric"><p className="ml">Student-weeks</p><p className="mv">{rows.length}</p></div>
              <div className="wi-metric"><p className="ml">Forms in range</p><p className="mv">{forms.length}</p></div>
            </section>

            <section className="wi-card accent">
              <h2>Needs follow-up</h2>
              <p className="ch">Missing days, no submissions, or weekly average below {threshold}. Your action list.</p>
              {needsFollowUp.length === 0 ? <p className="wi-empty">Nobody flagged in this window (or summaries haven&apos;t refreshed yet).</p> : (
                <table className="wi-table">
                  <thead><tr><th>Student</th><th>Period</th><th>Week</th><th>Submitted</th><th>Avg</th><th>Status</th></tr></thead>
                  <tbody>
                    {needsFollowUp.map((s) => (
                      <tr key={s.id}>
                        <td><span className="wi-student">{studentLabel(s)}</span><br /><span className="wi-email">{s.studentEmail}</span></td>
                        <td>{s.period || "—"}</td>
                        <td>{s.week || "—"}</td>
                        <td className="num">{expectedText(s)}</td>
                        <td className="num">{avgText(s.weeklyAvgScore)}</td>
                        <td><span className={`badge ${statusKind(s.status)}`}>{s.status || "—"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="wi-card">
              <h2>Class overview</h2>
              <p className="ch">Per-period averages and completion across the selected window.</p>
              {periodOverview.length === 0 ? <p className="wi-empty">No data yet.</p> : (
                <table className="wi-table">
                  <thead><tr><th>Period</th><th>Student-weeks</th><th>Avg score</th><th>Avg completion</th><th>Flagged</th></tr></thead>
                  <tbody>
                    {periodOverview.map((o) => (
                      <tr key={o.period}>
                        <td className="wi-student">{o.period}</td>
                        <td className="num">{o.n}</td>
                        <td className="num">{o.avgN ? (o.avgSum / o.avgN).toFixed(1) : "—"}</td>
                        <td className="num">{o.compN ? `${Math.round(o.compSum / o.compN)}%` : "—"}</td>
                        <td className="num">{o.flagged}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="wi-card">
              <h2>Missing warm-ups</h2>
              <p className="ch">Anyone not marked complete — submitted vs expected, and which days are missing.</p>
              {missing.length === 0 ? <p className="wi-empty">No missing warm-ups in this window.</p> : (
                <table className="wi-table">
                  <thead><tr><th>Student</th><th>Period</th><th>Week</th><th>Submitted</th><th>Missing days</th></tr></thead>
                  <tbody>
                    {missing.map((s) => (
                      <tr key={s.id}>
                        <td><span className="wi-student">{studentLabel(s)}</span><br /><span className="wi-email">{s.studentEmail}</span></td>
                        <td>{s.period || "—"}</td>
                        <td>{s.week || "—"}</td>
                        <td className="num">{expectedText(s)}</td>
                        <td style={{ whiteSpace: "normal" }}>{s.missingDays || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="wi-card">
              <h2>Lowest weekly averages</h2>
              <p className="ch">Sorted low to high — quick read on who&apos;s struggling.</p>
              {lowAvg.length === 0 ? <p className="wi-empty">No scored weeks yet.</p> : (
                <table className="wi-table">
                  <thead><tr><th>Student</th><th>Period</th><th>Week</th><th>Avg</th><th>Completion</th></tr></thead>
                  <tbody>
                    {lowAvg.slice(0, 40).map((s) => (
                      <tr key={s.id}>
                        <td><span className="wi-student">{studentLabel(s)}</span><br /><span className="wi-email">{s.studentEmail}</span></td>
                        <td>{s.period || "—"}</td>
                        <td>{s.week || "—"}</td>
                        <td className="num">{avgText(s.weeklyAvgScore)}</td>
                        <td className="num">{s.completion === null ? "—" : `${s.completion}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="wi-card">
              <h2>Daily summaries by period</h2>
              <p className="ch">Open each day&apos;s Google Forms summary for the full charts.</p>
              {forms.length === 0 ? (
                <p className="wi-empty">No form links in range. (Share the “Warm up Links” database with the Big Dog Math integration to show these.)</p>
              ) : (
                <div className="wi-daily">
                  {formsByDate.map(([date, list]) => (
                    <div className="wi-day" key={date}>
                      <h3>{fmtDate(date)}</h3>
                      <div className="wi-forms">
                        {list.map((f) => (
                          <div className="wi-form" key={f.id}>
                            <p className="fn">{f.className || f.name || "Warm-up"}</p>
                            <div className="fl">
                              {f.summaryUrl && <a className="primary" href={f.summaryUrl} target="_blank" rel="noopener noreferrer">Open summary ↗</a>}
                              {f.responseSheet && <a className="ghost" href={f.responseSheet} target="_blank" rel="noopener noreferrer">Responses</a>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
