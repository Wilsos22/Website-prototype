"use client";

// Teacher formative-data view. Every challenge a class plays leaves a trail of
// attempts; this page rolls them up into who's getting it (per-student accuracy)
// and what's tripping them up (most-missed problems) — the formative read.

import { useCallback, useEffect, useState } from "react";
import { teacherApiRequest } from "@/lib/teacherApi";
import SiteNav from "@/components/SiteNav";
import { getSkill } from "@/lib/challengeSkills";
import { type ChallengeRow, type LeaderRow } from "@/lib/challenges";
interface StudentAgg { key: string; name: string; correct: number; total: number; points: number; }
interface MissAgg { prompt: string; correct_answer: string; wrong: number; total: number; }

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function TeacherChallengesPage() {
  const [challenges, setChallenges] = useState<ChallengeRow[]>([]);
  const [periodNames, setPeriodNames] = useState<Record<string, string>>({});
  const [sessionPeriod, setSessionPeriod] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState<ChallengeRow | null>(null);
  const [students, setStudents] = useState<StudentAgg[]>([]);
  const [misses, setMisses] = useState<MissAgg[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const result = await teacherApiRequest<{
          challenges: ChallengeRow[];
          sessions: Array<{ id: string; period_id: string }>;
          periods: Array<{ id: string; name: string }>;
        }>("/api/teacher/challenge");
        setChallenges(result.challenges);
        setSessionPeriod(Object.fromEntries(result.sessions.map((session) => [session.id, session.period_id])));
        setPeriodNames(Object.fromEntries(result.periods.map((period) => [period.id, period.name])));
      } catch {
        setMissing(true);
      }
      setLoading(false);
    })();
  }, []);

  const openChallenge = useCallback(async (ch: ChallengeRow) => {
    setOpen(ch); setDetailLoading(true); setStudents([]); setMisses([]);
    const result = await teacherApiRequest<{ leaderboard: LeaderRow[]; misses: MissAgg[] }>(
      `/api/teacher/challenge?challengeId=${encodeURIComponent(ch.id)}`,
    );
    setStudents(result.leaderboard);
    setMisses(result.misses);
    setDetailLoading(false);
  }, []);

  const classAccuracy = students.length
    ? Math.round((students.reduce((s, x) => s + x.correct, 0) / Math.max(1, students.reduce((s, x) => s + x.total, 0))) * 100)
    : 0;

  return (
    <main className="tc">
      <style>{styles}</style>
      <SiteNav variant="teacher" />
      <div className="tc-wrap">
        <h1 className="tc-h1">Challenge results</h1>
        <p className="tc-sub">Formative data from every game your classes have played.</p>

        {missing && <div className="tc-warn">Run <b>supabase/challenges.sql</b> in the Supabase SQL editor to start collecting game data.</div>}
        {loading && <p className="tc-soft">Loading…</p>}
        {!loading && !missing && challenges.length === 0 && (
          <div className="tc-card"><p className="tc-soft">No challenges yet. Launch one from the <a href="/session">Session</a> page.</p></div>
        )}

        {!open && challenges.length > 0 && (
          <div className="tc-list">
            {challenges.map((ch) => {
              const skill = getSkill(ch.skill);
              const period = periodNames[sessionPeriod[ch.session_id] || ""] || "";
              return (
                <button key={ch.id} className="tc-row" onClick={() => openChallenge(ch)}>
                  <span className="tc-row-emoji">{skill?.label.slice(0, 1) || "G"}</span>
                  <span className="tc-row-main">
                    <span className="tc-row-title">{ch.title}</span>
                    <span className="tc-row-meta">{fmtWhen(ch.started_at)}{period ? ` · ${period}` : ""}</span>
                  </span>
                  <span className="tc-row-go">View →</span>
                </button>
              );
            })}
          </div>
        )}

        {open && (
          <>
            <button className="tc-back" onClick={() => setOpen(null)}>← All results</button>
            <div className="tc-card">
              <div className="tc-d-head">
                <div>
                  <div className="tc-d-title">{getSkill(open.skill)?.emoji} {open.title}</div>
                  <div className="tc-row-meta">{fmtWhen(open.started_at)}{periodNames[sessionPeriod[open.session_id] || ""] ? ` · ${periodNames[sessionPeriod[open.session_id] || ""]}` : ""}</div>
                </div>
                {!detailLoading && students.length > 0 && (
                  <div className="tc-d-stat"><b>{classAccuracy}%</b><span>class accuracy</span></div>
                )}
              </div>
            </div>

            {detailLoading ? (
              <p className="tc-soft">Loading…</p>
            ) : students.length === 0 ? (
              <div className="tc-card"><p className="tc-soft">No answers were recorded for this challenge.</p></div>
            ) : (
              <>
                <div className="tc-card">
                  <h3 className="tc-ch">Most-missed problems</h3>
                  {misses.length === 0 ? (
                    <p className="tc-soft">Everyone got it; no misses.</p>
                  ) : (
                    <div className="tc-miss">
                      {misses.map((m) => (
                        <div className="tc-miss-row" key={m.prompt}>
                          <span className="tc-miss-q">{m.prompt}</span>
                          <span className="tc-miss-a">= {m.correct_answer}</span>
                          <span className="tc-miss-n">{m.wrong}/{m.total} missed</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="tc-card">
                  <h3 className="tc-ch">By student</h3>
                  <div className="tc-students">
                    {students.map((s) => {
                      const acc = s.total ? Math.round((s.correct / s.total) * 100) : 0;
                      const flag = acc < 60;
                      return (
                        <div className={`tc-st-row${flag ? " flag" : ""}`} key={s.key}>
                          <span className="tc-st-name">{s.name}</span>
                          <span className="tc-st-bar"><span className="tc-st-fill" style={{ width: `${acc}%`, background: flag ? "#f95335" : "#2f9e6f" }} /></span>
                          <span className="tc-st-acc">{s.correct}/{s.total}</span>
                          <span className="tc-st-pts">{s.points}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="tc-soft" style={{ marginTop: 10 }}>Highlighted rows are below 60% — worth a check-in.</p>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

const styles = `
  .tc { min-height:100vh; background:var(--bdb-ground); font-family:var(--bdb-font); color:var(--bdb-ink); padding-bottom:50px; }
  .tc-wrap { max-width:760px; margin:0 auto; padding:0 16px; display:grid; gap:14px; }
  .tc-h1 { font-size:clamp(1.7rem,5vw,2.4rem); font-weight:800; letter-spacing:-0.02em; margin:8px 0 0; }
  .tc-sub { color:var(--bdb-ink-soft); font-weight:500; margin:0; }
  .tc-soft { color:var(--bdb-ink-soft); font-weight:500; }
  .tc-warn { background:#fff7e6; border:1px solid #ffe2a8; color:#92660a; border-radius:14px; padding:14px 16px; font-weight:600; }
  .tc-card { background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r-lg); box-shadow:var(--bdb-shadow-sm); padding:18px 20px; }
  .tc-list { display:grid; gap:8px; }
  .tc-row { display:flex; align-items:center; gap:13px; text-align:left; width:100%; background:var(--bdb-card);
    border:1px solid var(--bdb-line); border-radius:var(--bdb-r); padding:14px 16px; cursor:pointer; box-shadow:var(--bdb-shadow-sm); }
  .tc-row:hover { border-color:var(--bdb-teal); }
  .tc-row-emoji { font-size:1.5rem; }
  .tc-row-main { display:flex; flex-direction:column; flex:1; }
  .tc-row-title { font-weight:800; }
  .tc-row-meta { font-size:0.82rem; color:var(--bdb-ink-faint); font-weight:600; }
  .tc-row-go { font-weight:800; color:var(--bdb-teal); font-size:0.88rem; }
  .tc-back { align-self:flex-start; background:none; border:none; color:var(--bdb-ink-soft); font-weight:800; cursor:pointer; font-size:0.9rem; padding:4px 0; }
  .tc-d-head { display:flex; align-items:center; justify-content:space-between; gap:14px; }
  .tc-d-title { font-size:1.2rem; font-weight:900; }
  .tc-d-stat { text-align:right; } .tc-d-stat b { display:block; font-size:1.7rem; font-weight:900; color:var(--bdb-teal); }
  .tc-d-stat span { font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--bdb-ink-faint); }
  .tc-ch { margin:0 0 12px; font-size:1.05rem; font-weight:900; }
  .tc-miss { display:flex; flex-direction:column; gap:7px; }
  .tc-miss-row { display:flex; align-items:center; gap:10px; padding:10px 13px; border-radius:11px; background:var(--bdb-ground); }
  .tc-miss-q { flex:1; font-weight:800; }
  .tc-miss-a { font-weight:700; color:var(--bdb-green); font-size:0.9rem; }
  .tc-miss-n { font-weight:800; color:var(--bdb-coral); font-size:0.82rem; min-width:88px; text-align:right; }
  .tc-students { display:flex; flex-direction:column; gap:7px; }
  .tc-st-row { display:flex; align-items:center; gap:12px; padding:9px 12px; border-radius:11px; background:var(--bdb-ground); }
  .tc-st-row.flag { background:color-mix(in srgb, var(--bdb-coral) 9%, white); }
  .tc-st-name { width:130px; font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .tc-st-bar { flex:1; height:10px; background:var(--bdb-ground-2); border-radius:999px; overflow:hidden; }
  .tc-st-fill { display:block; height:100%; border-radius:999px; }
  .tc-st-acc { font-weight:700; color:var(--bdb-ink-soft); font-size:0.85rem; min-width:42px; text-align:right; }
  .tc-st-pts { font-weight:900; color:var(--bdb-teal); min-width:48px; text-align:right; }
`;
