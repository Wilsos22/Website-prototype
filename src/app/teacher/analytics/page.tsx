"use client";

import { useEffect, useMemo, useState } from "react";

interface FormResponseData {
  id: string;
  formTitle: string;
  responseEmail: string;
  submittedAt: string;
  score: number | null;
  maxScore: number | null;
  week: string;
}

interface WeeklyEmailStats {
  email: string;
  week: string;
  formTitle: string;
  submissions: number;
  averageScore: number | null;
  lowScoreCount: number;
}

interface WeeklyFormStats {
  formTitle: string;
  week: string;
  submissions: number;
  averageScore: number | null;
  minScore: number | null;
  maxScore: number | null;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function key(...parts: string[]) {
  return parts.map(normalize).join("||");
}

function scoreText(value: number | null) {
  return value === null ? "-" : value.toFixed(1);
}

function getWeeklyEmailStats(responses: FormResponseData[], lowScoreThreshold: number): WeeklyEmailStats[] {
  const groups = new Map<string, WeeklyEmailStats & { totalScore: number; scoreCount: number }>();

  for (const response of responses) {
    const groupKey = key(response.responseEmail, response.week, response.formTitle);
    const existing = groups.get(groupKey) ?? {
      email: response.responseEmail,
      week: response.week,
      formTitle: response.formTitle,
      submissions: 0,
      averageScore: null,
      lowScoreCount: 0,
      totalScore: 0,
      scoreCount: 0,
    };

    existing.submissions += 1;
    if (response.score !== null) {
      existing.totalScore += response.score;
      existing.scoreCount += 1;
      existing.averageScore = existing.totalScore / existing.scoreCount;
      if (response.score < lowScoreThreshold) existing.lowScoreCount += 1;
    }
    groups.set(groupKey, existing);
  }

  return Array.from(groups.values()).map((item) => ({
    email: item.email,
    week: item.week,
    formTitle: item.formTitle,
    submissions: item.submissions,
    averageScore: item.scoreCount ? Number((item.averageScore ?? 0).toFixed(2)) : null,
    lowScoreCount: item.lowScoreCount,
  }));
}

function getWeeklyFormStats(responses: FormResponseData[]): WeeklyFormStats[] {
  const groups = new Map<string, WeeklyFormStats & { totalScore: number; scoreCount: number }>();

  for (const response of responses) {
    const groupKey = key(response.formTitle, response.week);
    const existing = groups.get(groupKey) ?? {
      formTitle: response.formTitle,
      week: response.week,
      submissions: 0,
      averageScore: null,
      minScore: null,
      maxScore: null,
      totalScore: 0,
      scoreCount: 0,
    };

    existing.submissions += 1;
    if (response.score !== null) {
      existing.totalScore += response.score;
      existing.scoreCount += 1;
      existing.averageScore = existing.totalScore / existing.scoreCount;
      existing.minScore = existing.minScore === null ? response.score : Math.min(existing.minScore, response.score);
      existing.maxScore = existing.maxScore === null ? response.score : Math.max(existing.maxScore, response.score);
    }
    groups.set(groupKey, existing);
  }

  return Array.from(groups.values()).map((item) => ({
    formTitle: item.formTitle,
    week: item.week,
    submissions: item.submissions,
    averageScore: item.scoreCount ? Number((item.averageScore ?? 0).toFixed(2)) : null,
    minScore: item.minScore,
    maxScore: item.maxScore,
  }));
}

export default function TeacherAnalyticsPage() {
  const [responses, setResponses] = useState<FormResponseData[]>([]);
  const [selectedTitle, setSelectedTitle] = useState("");
  const [selectedEmail, setSelectedEmail] = useState("");
  const [lowScoreThreshold, setLowScoreThreshold] = useState(60);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/form-responses", { cache: "no-store" });
        const data = await res.json() as { responses?: FormResponseData[]; error?: string };
        if (!res.ok || data.error) throw new Error(data.error || "Could not load form responses.");
        setResponses(data.responses ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load form responses.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const titles = useMemo(() => Array.from(new Set(responses.map((item) => item.formTitle))).sort(), [responses]);
  const filteredResponses = useMemo(() => responses.filter((response) => {
    const matchesTitle = !selectedTitle || response.formTitle === selectedTitle;
    const matchesEmail = !selectedEmail || response.responseEmail.toLowerCase().includes(selectedEmail.toLowerCase());
    return matchesTitle && matchesEmail;
  }), [responses, selectedEmail, selectedTitle]);

  const weeklyEmailStats = useMemo(() => getWeeklyEmailStats(filteredResponses, lowScoreThreshold), [filteredResponses, lowScoreThreshold]);
  const weeklyFormStats = useMemo(() => getWeeklyFormStats(filteredResponses), [filteredResponses]);
  const lowRows = weeklyEmailStats.filter((row) => row.averageScore !== null && row.averageScore < lowScoreThreshold);

  return (
    <main className="ta-page">
      <style>{`
        .ta-page { min-height:100vh; background:#f6f8fb; color:#172033; font-family:Inter,ui-sans-serif,system-ui,sans-serif; padding:24px; box-sizing:border-box; }
        .ta-shell { width:min(1120px,100%); margin:0 auto; display:grid; gap:18px; }
        .ta-top { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
        .ta-back { color:#42526b; font-weight:800; text-decoration:none; border:1px solid #d9e2ef; border-radius:8px; padding:9px 12px; background:#fff; }
        .ta-title { margin:0; color:#111827; font-size:clamp(2rem,4vw,3rem); font-weight:950; line-height:1.05; }
        .ta-sub { margin:6px 0 0; color:#64748b; font-weight:700; }
        .ta-panel { background:#fff; border:1px solid #d9e2ef; border-radius:8px; padding:20px; box-shadow:0 16px 42px -34px rgba(15,23,42,0.42); overflow-x:auto; }
        .ta-filters { display:flex; gap:12px; align-items:end; flex-wrap:wrap; }
        .ta-field { display:grid; gap:6px; color:#475569; font-weight:850; font-size:0.88rem; }
        .ta-field input, .ta-field select { min-height:40px; border:1px solid #cbd5e1; border-radius:8px; padding:8px 10px; font:inherit; min-width:180px; }
        .ta-metric-row { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; }
        .ta-metric { background:#102033; color:#fff; border-radius:8px; padding:18px; }
        .ta-metric-label { margin:0 0 8px; color:#93c5fd; font-size:0.78rem; font-weight:900; text-transform:uppercase; letter-spacing:0.08em; }
        .ta-metric-value { margin:0; font-size:2rem; font-weight:950; }
        .ta-section-title { margin:0 0 14px; color:#0f172a; font-size:1.1rem; font-weight:950; }
        .ta-note, .ta-empty { color:#64748b; font-weight:700; margin:0; }
        .ta-error { color:#9f1239; background:#fff1f2; border:1px solid #fecdd3; border-radius:8px; padding:14px; white-space:pre-wrap; }
        .ta-table { width:100%; border-collapse:collapse; font-size:0.92rem; }
        .ta-table th, .ta-table td { border-bottom:1px solid #e2e8f0; padding:10px 12px; text-align:left; vertical-align:top; }
        .ta-table th { color:#475569; font-size:0.75rem; font-weight:950; letter-spacing:0.08em; text-transform:uppercase; }
        .ta-low { background:#fff7ed; }
        @media (max-width:640px) {
          .ta-page { padding:14px; }
          .ta-field, .ta-field input, .ta-field select { width:100%; min-width:0; }
        }
      `}</style>

      <div className="ta-shell">
        <header className="ta-top">
          <div>
            <h1 className="ta-title">Form Analytics</h1>
            <p className="ta-sub">Warm-up submissions from Notion, grouped for quick follow-up.</p>
          </div>
          <a className="ta-back" href="/teacher">Teacher tools</a>
        </header>

        {loading && <section className="ta-panel"><p className="ta-note">Loading form responses...</p></section>}
        {!loading && error && <section className="ta-panel"><pre className="ta-error">Failed to load analytics: {error}</pre></section>}

        {!loading && !error && (
          <>
            <section className="ta-panel">
              <div className="ta-filters">
                <label className="ta-field">
                  Form
                  <select value={selectedTitle} onChange={(event) => setSelectedTitle(event.target.value)}>
                    <option value="">All forms</option>
                    {titles.map((title) => <option key={title} value={title}>{title}</option>)}
                  </select>
                </label>
                <label className="ta-field">
                  Email
                  <input value={selectedEmail} onChange={(event) => setSelectedEmail(event.target.value)} placeholder="student email" />
                </label>
                <label className="ta-field">
                  Low score threshold
                  <input type="number" min={0} max={100} value={lowScoreThreshold} onChange={(event) => setLowScoreThreshold(Number(event.target.value) || 0)} />
                </label>
              </div>
            </section>

            <section className="ta-metric-row">
              <div className="ta-metric"><p className="ta-metric-label">Responses</p><p className="ta-metric-value">{filteredResponses.length}</p></div>
              <div className="ta-metric"><p className="ta-metric-label">Forms</p><p className="ta-metric-value">{titles.length}</p></div>
              <div className="ta-metric"><p className="ta-metric-label">Low-score groups</p><p className="ta-metric-value">{lowRows.length}</p></div>
            </section>

            <section className="ta-panel">
              <h2 className="ta-section-title">Weekly Submissions by Email</h2>
              {weeklyEmailStats.length === 0 ? <p className="ta-empty">No matching submissions.</p> : (
                <table className="ta-table">
                  <thead><tr><th>Email</th><th>Form</th><th>Week</th><th>Submissions</th><th>Average</th><th>Low Scores</th></tr></thead>
                  <tbody>
                    {weeklyEmailStats.map((row) => (
                      <tr className={row.averageScore !== null && row.averageScore < lowScoreThreshold ? "ta-low" : ""} key={key(row.email, row.formTitle, row.week)}>
                        <td>{row.email || "-"}</td><td>{row.formTitle}</td><td>{row.week || "-"}</td><td>{row.submissions}</td><td>{scoreText(row.averageScore)}</td><td>{row.lowScoreCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="ta-panel">
              <h2 className="ta-section-title">Weekly Average by Form</h2>
              {weeklyFormStats.length === 0 ? <p className="ta-empty">No matching form averages.</p> : (
                <table className="ta-table">
                  <thead><tr><th>Form</th><th>Week</th><th>Submissions</th><th>Average</th><th>Min</th><th>Max</th></tr></thead>
                  <tbody>
                    {weeklyFormStats.map((row) => (
                      <tr key={key(row.formTitle, row.week)}>
                        <td>{row.formTitle}</td><td>{row.week || "-"}</td><td>{row.submissions}</td><td>{scoreText(row.averageScore)}</td><td>{scoreText(row.minScore)}</td><td>{scoreText(row.maxScore)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

