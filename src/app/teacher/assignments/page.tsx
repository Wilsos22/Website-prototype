"use client";

// Teacher: create practice assignments ("do 10 rounds of the Expression
// Simplifier") and read the formative results — who finished, class accuracy,
// and the most-missed problems. Assignments show up for students on Explore and
// at /assignment/<id>; every attempt is logged like the live-game data.

import { useCallback, useEffect, useState } from "react";
import { teacherApiRequest } from "@/lib/teacherApi";
import SiteNav from "@/components/SiteNav";
import { SKILLS, getSkill } from "@/lib/challengeSkills";
import {
  listAssignments,
  createAssignment,
  setAssignmentStatus,
  deleteAssignment,
  getAssignmentResults,
  type Assignment,
  type AssignmentStudentAgg,
  type AssignmentMissAgg,
} from "@/lib/assignments";

interface Period { id: string; name: string; }

const TEACHER_SERVER_CLIENT = {} as never;

export default function TeacherAssignmentsPage() {
  const supabase = TEACHER_SERVER_CLIENT;
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showClosed, setShowClosed] = useState(false);

  // create form
  const [skillKey, setSkillKey] = useState(SKILLS[0].key);
  const [level, setLevel] = useState(1);
  const [rounds, setRounds] = useState(10);
  const [periodId, setPeriodId] = useState("");
  const [due, setDue] = useState("");
  const [title, setTitle] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [open, setOpen] = useState<Assignment | null>(null);
  const [students, setStudents] = useState<AssignmentStudentAgg[]>([]);
  const [misses, setMisses] = useState<AssignmentMissAgg[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const skill = getSkill(skillKey) || SKILLS[0];

  const refresh = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { assignments: rows, missing: miss } = await listAssignments(supabase, { includeClosed: true });
    setMissing(miss);
    setAssignments(rows);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void refresh();
    teacherApiRequest<{ periods: Period[] }>("/api/teacher/roster")
      .then((result) => setPeriods(result.periods))
      .catch(() => setPeriods([]));
  }, [refresh]);

  async function create() {
    if (!supabase) return;
    setFormError(null);
    const finalTitle = title.trim() || `${skill.label} — ${rounds} rounds`;
    const { error } = await createAssignment(supabase, {
      periodId: periodId || null,
      skill: skillKey,
      title: finalTitle,
      level,
      targetRounds: Math.max(1, Math.min(50, rounds)),
      dueLabel: due.trim() || null,
    });
    if (error === "SETUP") { setFormError("One-time setup: run supabase/formative.sql in Supabase, then try again."); return; }
    if (error) { setFormError(error); return; }
    setTitle(""); setDue("");
    await refresh();
  }

  const openResults = useCallback(async (a: Assignment) => {
    if (!supabase) return;
    setOpen(a); setDetailLoading(true); setStudents([]); setMisses([]);
    const { students: s, misses: m } = await getAssignmentResults(supabase, a.id, a.target_rounds);
    setStudents(s); setMisses(m); setDetailLoading(false);
  }, [supabase]);

  async function toggleStatus(a: Assignment) {
    if (!supabase) return;
    await setAssignmentStatus(supabase, a.id, a.status === "open" ? "closed" : "open");
    await refresh();
  }
  async function remove(a: Assignment) {
    if (!supabase) return;
    await deleteAssignment(supabase, a.id);
    if (open?.id === a.id) setOpen(null);
    await refresh();
  }

  const visible = assignments.filter((a) => showClosed || a.status === "open");
  const finishedCount = students.filter((s) => s.done).length;
  const classAccuracy = students.length
    ? Math.round((students.reduce((s, x) => s + x.correct, 0) / Math.max(1, students.reduce((s, x) => s + x.total, 0))) * 100)
    : 0;
  const periodName = (id: string | null) => periods.find((p) => p.id === id)?.name || (id ? "" : "All classes");

  return (
    <main className="ta">
      <style>{styles}</style>
      <SiteNav variant="teacher" />
      <div className="ta-wrap">
        <h1 className="ta-h1">Practice assignments</h1>
        <p className="ta-sub">Set targeted practice for a class or as homework — results are tracked by student.</p>

        {!supabase && <div className="ta-warn">Supabase isn&apos;t connected yet — add your keys in Vercel and redeploy.</div>}
        {missing && <div className="ta-warn">Run <b>supabase/formative.sql</b> in the Supabase SQL editor to start collecting assignment data.</div>}

        {!open && (
          <>
            <div className="ta-card">
              <h3 className="ta-ch">New assignment</h3>
              <div className="ta-form">
                <label className="ta-field">Skill
                  <select className="ta-input" value={skillKey} onChange={(e) => { setSkillKey(e.target.value); setLevel(1); }}>
                    {SKILLS.map((s) => <option key={s.key} value={s.key}>{s.emoji} {s.label}</option>)}
                  </select>
                </label>
                <label className="ta-field">Level
                  <select className="ta-input" value={level} onChange={(e) => setLevel(Number(e.target.value))}>
                    {skill.levels.map((lvl, i) => <option key={i} value={i + 1}>{i + 1}. {lvl}</option>)}
                  </select>
                </label>
                <label className="ta-field">Rounds
                  <input className="ta-input" type="number" min={1} max={50} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} />
                </label>
                <label className="ta-field">Class
                  <select className="ta-input" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
                    <option value="">All classes</option>
                    {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label className="ta-field wide">Title (optional)
                  <input className="ta-input" value={title} placeholder={`${skill.label} — ${rounds} rounds`} onChange={(e) => setTitle(e.target.value)} />
                </label>
                <label className="ta-field wide">Due note (optional)
                  <input className="ta-input" value={due} placeholder="e.g. Homework — due Friday" onChange={(e) => setDue(e.target.value)} />
                </label>
              </div>
              {formError && <div className="ta-err">{formError}</div>}
              <button className="ta-btn pri" onClick={create} disabled={!supabase}>Create assignment</button>
            </div>

            <div className="ta-listhead">
              <h3 className="ta-ch" style={{ margin: 0 }}>Your assignments</h3>
              <label className="ta-toggle"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show closed</label>
            </div>
            {loading ? <p className="ta-soft">Loading…</p> : visible.length === 0 ? (
              <div className="ta-card"><p className="ta-soft">No assignments yet — create one above.</p></div>
            ) : (
              <div className="ta-list">
                {visible.map((a) => {
                  const sk = getSkill(a.skill);
                  return (
                    <div key={a.id} className={`ta-row${a.status === "closed" ? " closed" : ""}`}>
                      <span className="ta-row-emoji">{sk?.label.slice(0, 1) || "P"}</span>
                      <button className="ta-row-main" onClick={() => openResults(a)}>
                        <span className="ta-row-title">{a.title}</span>
                        <span className="ta-row-meta">{a.target_rounds} rounds · {periodName(a.period_id)}{a.due_label ? ` · ${a.due_label}` : ""}{a.status === "closed" ? " · closed" : ""}</span>
                      </button>
                      <button className="ta-mini" onClick={() => toggleStatus(a)}>{a.status === "open" ? "Close" : "Reopen"}</button>
                      <button className="ta-mini danger" onClick={() => remove(a)}>Delete</button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {open && (
          <>
            <button className="ta-back" onClick={() => setOpen(null)}>All assignments</button>
            <div className="ta-card">
              <div className="ta-d-head">
                <div>
                  <div className="ta-d-title">{getSkill(open.skill)?.emoji} {open.title}</div>
                  <div className="ta-row-meta">{open.target_rounds} rounds · {periodName(open.period_id)}{open.due_label ? ` · ${open.due_label}` : ""}</div>
                </div>
                {!detailLoading && students.length > 0 && (
                  <div className="ta-d-stats">
                    <div><b>{finishedCount}</b><span>finished</span></div>
                    <div><b>{classAccuracy}%</b><span>accuracy</span></div>
                  </div>
                )}
              </div>
            </div>

            {detailLoading ? <p className="ta-soft">Loading…</p> : students.length === 0 ? (
              <div className="ta-card"><p className="ta-soft">No one has worked on this yet.</p></div>
            ) : (
              <>
                <div className="ta-card">
                  <h3 className="ta-ch">Most-missed problems</h3>
                  {misses.length === 0 ? <p className="ta-soft">No misses yet.</p> : (
                    <div className="ta-miss">
                      {misses.map((m) => (
                        <div className="ta-miss-row" key={m.prompt}>
                          <span className="ta-miss-q">{m.prompt}</span>
                          <span className="ta-miss-a">= {m.correct_answer}</span>
                          <span className="ta-miss-n">{m.wrong}/{m.total} missed</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="ta-card">
                  <h3 className="ta-ch">By student</h3>
                  <div className="ta-students">
                    {students.map((s) => {
                      const acc = s.total ? Math.round((s.correct / s.total) * 100) : 0;
                      const flag = acc < 60;
                      return (
                        <div className={`ta-st-row${flag ? " flag" : ""}`} key={s.key}>
                          <span className="ta-st-name">{s.name}{s.done ? " - complete" : ""}</span>
                          <span className="ta-st-bar"><span className="ta-st-fill" style={{ width: `${acc}%`, background: flag ? "#f95335" : "#2f9e6f" }} /></span>
                          <span className="ta-st-acc">{s.correct}/{s.total}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="ta-soft" style={{ marginTop: 10 }}>Complete means the student reached the round target. Highlighted rows are below 60%.</p>
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
  .ta { min-height:100vh; background:var(--bdb-ground); font-family:var(--bdb-font); color:var(--bdb-ink); padding-bottom:50px; }
  .ta-wrap { max-width:760px; margin:0 auto; padding:0 16px; display:grid; gap:14px; }
  .ta-h1 { font-size:clamp(1.7rem,5vw,2.4rem); font-weight:800; letter-spacing:-0.02em; margin:8px 0 0; }
  .ta-sub { color:var(--bdb-ink-soft); font-weight:500; margin:0; }
  .ta-soft { color:var(--bdb-ink-soft); font-weight:500; }
  .ta-warn { background:#fff7e6; border:1px solid #ffe2a8; color:#92660a; border-radius:14px; padding:14px 16px; font-weight:600; }
  .ta-err { background:#fdecea; border:1px solid #f5c6c0; color:#b91c1c; border-radius:12px; padding:10px 14px; font-weight:700; margin-bottom:10px; }
  .ta-card { background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r-lg); box-shadow:var(--bdb-shadow-sm); padding:18px 20px; }
  .ta-ch { margin:0 0 12px; font-size:1.05rem; font-weight:900; }
  .ta-form { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-bottom:14px; }
  .ta-field { display:flex; flex-direction:column; gap:5px; font-size:0.74rem; font-weight:900; letter-spacing:0.06em; text-transform:uppercase; color:var(--bdb-ink-faint); }
  .ta-field.wide { grid-column:1 / -1; }
  .ta-input { border:2px solid var(--bdb-line); border-radius:11px; padding:10px 12px; font-family:inherit; font-size:1rem; font-weight:700; color:var(--bdb-ink); background:var(--bdb-ground); }
  .ta-btn { border:none; border-radius:12px; padding:12px 22px; font-family:inherit; font-weight:900; cursor:pointer; }
  .ta-btn.pri { background:var(--bdb-teal); color:#fff; }
  .ta-listhead { display:flex; align-items:center; justify-content:space-between; margin-top:4px; }
  .ta-toggle { font-size:0.85rem; font-weight:700; color:var(--bdb-ink-soft); display:flex; align-items:center; gap:6px; }
  .ta-list { display:grid; gap:8px; }
  .ta-row { display:flex; align-items:center; gap:12px; background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r); padding:12px 14px; box-shadow:var(--bdb-shadow-sm); }
  .ta-row.closed { opacity:0.6; }
  .ta-row-emoji { font-size:1.4rem; }
  .ta-row-main { flex:1; text-align:left; background:none; border:none; cursor:pointer; display:flex; flex-direction:column; gap:2px; }
  .ta-row-title { font-weight:800; color:var(--bdb-ink); }
  .ta-row-meta { font-size:0.82rem; color:var(--bdb-ink-faint); font-weight:600; }
  .ta-mini { background:var(--bdb-ground); border:1px solid var(--bdb-line); border-radius:999px; padding:7px 12px; font-weight:800; font-size:0.8rem; color:var(--bdb-ink-soft); cursor:pointer; }
  .ta-mini:hover { border-color:var(--bdb-teal); }
  .ta-mini.danger:hover { border-color:var(--bdb-coral); color:var(--bdb-coral); }
  .ta-back { align-self:flex-start; background:none; border:none; color:var(--bdb-ink-soft); font-weight:800; cursor:pointer; font-size:0.9rem; padding:4px 0; }
  .ta-d-head { display:flex; align-items:center; justify-content:space-between; gap:14px; }
  .ta-d-title { font-size:1.2rem; font-weight:900; }
  .ta-d-stats { display:flex; gap:18px; text-align:right; }
  .ta-d-stats b { display:block; font-size:1.6rem; font-weight:900; color:var(--bdb-teal); }
  .ta-d-stats span { font-size:0.7rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--bdb-ink-faint); }
  .ta-miss { display:flex; flex-direction:column; gap:7px; }
  .ta-miss-row { display:flex; align-items:center; gap:10px; padding:10px 13px; border-radius:11px; background:var(--bdb-ground); }
  .ta-miss-q { flex:1; font-weight:800; }
  .ta-miss-a { font-weight:700; color:var(--bdb-green); font-size:0.9rem; }
  .ta-miss-n { font-weight:800; color:var(--bdb-coral); font-size:0.82rem; min-width:88px; text-align:right; }
  .ta-students { display:flex; flex-direction:column; gap:7px; }
  .ta-st-row { display:flex; align-items:center; gap:12px; padding:9px 12px; border-radius:11px; background:var(--bdb-ground); }
  .ta-st-row.flag { background:color-mix(in srgb, var(--bdb-coral) 9%, white); }
  .ta-st-name { width:150px; font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ta-st-bar { flex:1; height:10px; background:var(--bdb-ground-2,#efe7d6); border-radius:999px; overflow:hidden; }
  .ta-st-fill { display:block; height:100%; border-radius:999px; }
  .ta-st-acc { font-weight:700; color:var(--bdb-ink-soft); font-size:0.85rem; min-width:42px; text-align:right; }
`;
