"use client";

// Student assignment player — open from a homepage/explore assignment card or a
// direct link. Identifies the student (so results are tracked by name), then runs
// the assignment's skill for its target number of rounds using the shared game
// engine. Every answer is logged to assignment_attempts (formative data) and the
// student can resume toward the target if they leave and come back.

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { getSkill, checkAnswer, type Problem } from "@/lib/challengeSkills";
import {
  getAssignment,
  countStudentAttempts,
  recordAssignmentAttempt,
  type Assignment,
} from "@/lib/assignments";

type View = "loading" | "notfound" | "identify" | "playing" | "done";
interface Period { id: string; name: string; }
interface Student { id: string; full_name: string; }

const NAME_KEY = "bdm-student-name";
const SID_KEY = "bdm-student-id";

function scorePoints(isCorrect: boolean, timeMs: number): number {
  if (!isCorrect) return 0;
  const speed = Math.max(0, Math.min(5, Math.round((3000 - timeMs) / 600)));
  return 10 + speed;
}

export default function AssignmentPlayerPage() {
  const supabase = getSupabase();
  const params = useParams();
  const assignmentId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string);

  const [view, setView] = useState<View>("loading");
  const [assignment, setAssignment] = useState<Assignment | null>(null);

  const [name, setName] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);

  const [problem, setProblem] = useState<Problem | null>(null);
  const [entry, setEntry] = useState("");
  const [feedback, setFeedback] = useState<{ correct: boolean; points: number } | null>(null);
  const [doneCount, setDoneCount] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [points, setPoints] = useState(0);

  const lockedRef = useRef(false);
  const startRef = useRef(0);
  const doneRef = useRef(0);

  const skill = assignment ? getSkill(assignment.skill) : undefined;
  const target = assignment?.target_rounds ?? 10;

  // Load the assignment + any stored identity.
  useEffect(() => {
    if (!supabase || !assignmentId) { setView("notfound"); return; }
    (async () => {
      const a = await getAssignment(supabase, assignmentId);
      if (!a) { setView("notfound"); return; }
      setAssignment(a);
      let storedName: string | null = null;
      let storedId: string | null = null;
      try {
        storedName = localStorage.getItem(NAME_KEY);
        storedId = localStorage.getItem(SID_KEY);
      } catch { /* ignore */ }
      if (storedName) {
        setName(storedName);
        setStudentId(storedId);
        void beginFor(a, storedId, storedName);
      } else {
        setView("identify");
        const { data } = await supabase.from("periods").select("id,name").order("sort_order");
        const ps = (data as Period[]) || [];
        setPeriods(ps);
        if (ps[0]) { setPeriodId(ps[0].id); void loadStudents(ps[0].id); }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, assignmentId]);

  async function loadStudents(pid: string) {
    if (!supabase) return;
    const { data } = await supabase.from("students").select("id,full_name").eq("period_id", pid).order("full_name");
    setStudents((data as Student[]) || []);
  }

  const newProblem = useCallback((a: Assignment) => {
    const sk = getSkill(a.skill);
    if (!sk) return;
    setProblem(sk.generate(a.level));
    setEntry("");
    setFeedback(null);
    lockedRef.current = false;
    startRef.current = Date.now();
  }, []);

  const beginFor = useCallback(async (a: Assignment, sid: string | null, who: string) => {
    let already = 0;
    if (supabase) already = await countStudentAttempts(supabase, a.id, { studentId: sid, name: who });
    doneRef.current = already;
    setDoneCount(already);
    setCorrect(0); setPoints(0);
    if (already >= a.target_rounds) { setView("done"); return; }
    setView("playing");
    newProblem(a);
  }, [supabase, newProblem]);

  function pickStudent(s: Student) {
    setName(s.full_name);
    setStudentId(s.id);
    try { localStorage.setItem(NAME_KEY, s.full_name); localStorage.setItem(SID_KEY, s.id); } catch { /* ignore */ }
    if (assignment) void beginFor(assignment, s.id, s.full_name);
  }

  const grade = useCallback((answerStr: string) => {
    if (lockedRef.current || !problem || !assignment) return;
    if (problem.answerType === "number" && answerStr.trim() === "") return;
    const isCorrect = checkAnswer(answerStr, problem);
    const pts = scorePoints(isCorrect, Date.now() - startRef.current);
    lockedRef.current = true;
    const roundIndex = doneRef.current;
    doneRef.current += 1;
    setDoneCount(doneRef.current);
    if (isCorrect) { setCorrect((c) => c + 1); setPoints((p) => p + pts); }
    setFeedback({ correct: isCorrect, points: pts });
    if (supabase) {
      void recordAssignmentAttempt(supabase, {
        assignment_id: assignment.id,
        student_id: studentId,
        display_name: name,
        skill: assignment.skill,
        prompt: problem.sub ? `${problem.prompt}  (${problem.sub})` : problem.prompt,
        correct_answer: problem.answer,
        answer: answerStr,
        is_correct: isCorrect,
        points: pts,
        time_ms: Date.now() - startRef.current,
        round_index: roundIndex,
      });
    }
    setTimeout(() => {
      if (doneRef.current >= (assignment.target_rounds ?? 10)) { setView("done"); return; }
      newProblem(assignment);
    }, 700);
  }, [problem, assignment, supabase, studentId, name, newProblem]);

  const pressKey = useCallback((k: string) => {
    if (lockedRef.current) return;
    setEntry((prev) => {
      if (k === "back") return prev.slice(0, -1);
      if (k === "neg") return prev.startsWith("-") ? prev.slice(1) : "-" + prev;
      if (prev.replace("-", "").length >= 6) return prev;
      return prev + k;
    });
  }, []);

  useEffect(() => {
    if (view !== "playing" || !problem || problem.answerType !== "number") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") pressKey(e.key);
      else if (e.key === "Backspace") pressKey("back");
      else if (e.key === "-") pressKey("neg");
      else if (e.key === "Enter") grade(entry);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, problem, entry, pressKey, grade]);

  const accuracy = doneCount ? Math.round((correct / doneCount) * 100) : 0;
  const pct = Math.min(100, Math.round((doneCount / target) * 100));

  return (
    <main className="as">
      <style>{styles}</style>
      <header className="as-top">
        <a className="as-brand" href="/explore"><img className="as-logo" src="/big-dog-mark.png" alt="" /><span className="as-brand-name">bigdogmath</span></a>
        <a className="as-back" href="/explore">← Explore</a>
      </header>

      {view === "loading" && <div className="as-mid"><p className="as-soft">Loading…</p></div>}

      {view === "notfound" && (
        <div className="as-mid as-card">
          <div className="as-emoji">🔎</div>
          <h1 className="as-h">Assignment not found</h1>
          <p className="as-soft">It may have been closed. Check with your teacher.</p>
          <a className="as-btn" href="/explore">Back to Explore</a>
        </div>
      )}

      {view === "identify" && assignment && (
        <div className="as-wrap">
          <h1 className="as-h1">{skill?.emoji} {assignment.title}</h1>
          <p className="as-sub">{target} rounds · {skill?.levels[assignment.level - 1]}. First, find your name.</p>
          <div className="as-fld">Class period</div>
          <select className="as-select" value={periodId} onChange={(e) => { setPeriodId(e.target.value); void loadStudents(e.target.value); }}>
            {periods.length === 0 && <option value="">No periods yet</option>}
            {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="as-fld">Your name</div>
          {students.length === 0 ? (
            <p className="as-soft">No names in this class yet.</p>
          ) : (
            <div className="as-names">
              {students.map((s) => <button key={s.id} className="as-name" onClick={() => pickStudent(s)}>{s.full_name}</button>)}
            </div>
          )}
        </div>
      )}

      {view === "playing" && problem && assignment && (
        <div className="as-play">
          <div className="as-hud">
            <span className="as-who">{name?.split(" ")[0]}</span>
            <span className="as-prog-txt">{doneCount} / {target}</span>
          </div>
          <div className="as-bar"><div className="as-bar-fill" style={{ width: `${pct}%` }} /></div>

          <div className={`as-qcard${feedback ? (feedback.correct ? " ok" : " no") : ""}`}>
            <div className="as-skill">{skill?.emoji} {skill?.label}</div>
            <div className="as-prompt">{problem.prompt}</div>
            {problem.sub && <div className="as-psub">{problem.sub}</div>}

            {feedback ? (
              <div className={`as-fb ${feedback.correct ? "ok" : "no"}`}>{feedback.correct ? `✓ +${feedback.points}` : `✗  ${problem.answer}`}</div>
            ) : problem.answerType === "number" ? (
              <>
                <div className="as-entry">{entry || <span className="as-entry-ph">?</span>}</div>
                <div className="as-keys">
                  {["1","2","3","4","5","6","7","8","9"].map((k) => <button key={k} className="as-key" onClick={() => pressKey(k)}>{k}</button>)}
                  {problem.allowNegative ? <button className="as-key as-key-fn" onClick={() => pressKey("neg")}>±</button> : <span />}
                  <button className="as-key" onClick={() => pressKey("0")}>0</button>
                  <button className="as-key as-key-fn" onClick={() => pressKey("back")}>⌫</button>
                </div>
                <button className="as-submit" onClick={() => grade(entry)} disabled={!entry}>Submit</button>
              </>
            ) : (
              <div className="as-choices">
                {problem.choices?.map((c) => <button key={c} className="as-choice" onClick={() => grade(c)}>{c}</button>)}
              </div>
            )}
          </div>
        </div>
      )}

      {view === "done" && assignment && (
        <div className="as-mid">
          <div className="as-card as-results">
            <div className="as-emoji">{accuracy >= 80 ? "🏆" : "✅"}</div>
            <h1 className="as-h">Assignment complete!</h1>
            <p className="as-soft">{skill?.emoji} {assignment.title}</p>
            <div className="as-stats">
              <div><b>{doneCount}</b><span>rounds</span></div>
              <div><b>{correct}/{doneCount}</b><span>this session</span></div>
              <div><b>{points}</b><span>points</span></div>
            </div>
            <p className="as-soft" style={{ marginTop: 12 }}>Your results were sent to your teacher.</p>
            <a className="as-btn" href="/explore">Back to Explore</a>
          </div>
        </div>
      )}
    </main>
  );
}

const styles = `
  .as { min-height:100vh; background:var(--bdb-ground); font-family:var(--bdb-font); color:var(--bdb-ink); display:flex; flex-direction:column; }
  .as-top { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:14px clamp(16px,4vw,28px); border-bottom:1px solid var(--bdb-line); }
  .as-brand { display:inline-flex; align-items:center; gap:9px; text-decoration:none; }
  .as-logo { width:30px; height:30px; display:block; object-fit:contain; }
  .as-brand-name { font-weight:800; color:var(--bdb-ink); }
  .as-back { color:var(--bdb-ink-soft); font-weight:600; font-size:0.9rem; text-decoration:none; border:1px solid var(--bdb-line); border-radius:999px; padding:8px 14px; background:var(--bdb-card); }
  .as-wrap { max-width:680px; width:100%; margin:0 auto; padding:clamp(18px,4vw,30px) 16px; box-sizing:border-box; }
  .as-mid { flex:1; display:flex; align-items:center; justify-content:center; padding:20px; }
  .as-h1 { margin:0 0 4px; font-size:clamp(1.5rem,4.5vw,2.2rem); font-weight:800; letter-spacing:-0.02em; }
  .as-h { font-size:clamp(1.4rem,5vw,2rem); font-weight:800; letter-spacing:-0.02em; margin:8px 0 6px; }
  .as-sub { margin:0 0 16px; color:var(--bdb-ink-soft); font-weight:500; }
  .as-soft { color:var(--bdb-ink-soft); font-weight:500; }
  .as-fld { font-size:0.74rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; color:var(--bdb-ink-faint); margin:18px 0 8px; }
  .as-select { width:100%; max-width:320px; border:2px solid var(--bdb-line); border-radius:12px; padding:11px 14px; font-family:inherit; font-size:1rem; font-weight:700; color:var(--bdb-ink); background:var(--bdb-card); }
  .as-names { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:8px; }
  .as-name { background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:12px; padding:13px; font-weight:800; color:var(--bdb-ink); cursor:pointer; box-shadow:var(--bdb-shadow-sm); }
  .as-name:hover { border-color:var(--bdb-teal); }
  .as-btn { display:inline-block; margin-top:14px; background:var(--bdb-teal); color:#fff; text-decoration:none; font-weight:800; padding:13px 24px; border-radius:var(--bdb-r); }

  .as-play { max-width:480px; width:100%; margin:0 auto; padding:clamp(14px,3vw,24px) 16px; box-sizing:border-box; display:flex; flex-direction:column; gap:12px; }
  .as-hud { display:flex; align-items:center; justify-content:space-between; }
  .as-who { font-weight:800; color:var(--bdb-ink); }
  .as-prog-txt { font-weight:900; color:var(--bdb-teal); }
  .as-bar { height:10px; background:var(--bdb-ground-2,#efe7d6); border-radius:999px; overflow:hidden; }
  .as-bar-fill { height:100%; background:var(--bdb-teal); border-radius:999px; transition:width 300ms ease; }
  .as-qcard { background:var(--bdb-card); border:2px solid var(--bdb-line); border-radius:var(--bdb-r-lg); box-shadow:var(--bdb-shadow); padding:22px 20px 20px; text-align:center; transition:border-color 150ms, background 150ms; }
  .as-qcard.ok { border-color:var(--bdb-green); background:color-mix(in srgb, var(--bdb-green) 8%, white); }
  .as-qcard.no { border-color:var(--bdb-coral); background:color-mix(in srgb, var(--bdb-coral) 8%, white); }
  .as-skill { font-size:0.78rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:var(--bdb-ink-faint); }
  .as-prompt { font-size:clamp(2rem,9vw,3rem); font-weight:900; letter-spacing:-0.01em; margin:10px 0 2px; }
  .as-psub { font-size:1.1rem; font-weight:700; color:var(--bdb-teal); margin-bottom:4px; }
  .as-fb { font-size:clamp(2rem,10vw,3.2rem); font-weight:900; padding:18px 0; }
  .as-fb.ok { color:var(--bdb-green); } .as-fb.no { color:var(--bdb-coral); }
  .as-entry { min-height:54px; margin:10px 0; font-size:2.4rem; font-weight:900; color:var(--bdb-ink); border-bottom:3px solid var(--bdb-line); }
  .as-entry-ph { color:var(--bdb-ink-faint); opacity:0.4; }
  .as-keys { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin:6px 0 12px; }
  .as-key { background:var(--bdb-ground); border:1px solid var(--bdb-line); border-radius:14px; padding:16px 0; font-size:1.5rem; font-weight:800; color:var(--bdb-ink); cursor:pointer; }
  .as-key:active { transform:scale(0.95); }
  .as-key-fn { color:var(--bdb-ink-soft); }
  .as-submit { width:100%; background:var(--bdb-teal); color:#fff; border:none; border-radius:14px; padding:15px 0; font-size:1.15rem; font-weight:900; cursor:pointer; }
  .as-submit:disabled { opacity:0.4; cursor:default; }
  .as-choices { display:grid; gap:10px; margin-top:14px; }
  .as-choice { background:var(--bdb-ground); border:2px solid var(--bdb-line); border-radius:14px; padding:16px; font-size:1.4rem; font-weight:800; color:var(--bdb-ink); cursor:pointer; }
  .as-choice:hover { border-color:var(--bdb-teal); }
  .as-card { background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r-lg); box-shadow:var(--bdb-shadow); padding:30px 26px; max-width:440px; width:100%; text-align:center; }
  .as-emoji { font-size:3rem; line-height:1; }
  .as-results { text-align:center; }
  .as-stats { display:flex; justify-content:center; flex-wrap:wrap; gap:20px; margin:16px 0 4px; }
  .as-stats div { display:flex; flex-direction:column; }
  .as-stats b { font-size:1.7rem; font-weight:900; color:var(--bdb-ink); }
  .as-stats span { font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--bdb-ink-faint); }
`;
