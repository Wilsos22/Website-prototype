"use client";

// Solo practice games — own-time play, no class session required. Reuses the
// same skill/problem engine as the live Challenge (src/lib/challengeSkills.ts)
// but runs entirely on the device: pick a game + level, play a timed round or
// an untimed practice run, get instant feedback and a score. Linked from
// /explore so students can practice whenever they want. (The teacher's live,
// leaderboard version still lives on /session.)

import { useCallback, useEffect, useRef, useState } from "react";
import { SKILLS, getSkill, checkAnswer, type Problem } from "@/lib/challengeSkills";

type View = "pick" | "playing" | "done";

const ROUND_SECONDS = 90;

function scorePoints(isCorrect: boolean, timeMs: number): number {
  if (!isCorrect) return 0;
  const speed = Math.max(0, Math.min(5, Math.round((3000 - timeMs) / 600)));
  return 10 + speed;
}

export default function PracticePage() {
  const [view, setView] = useState<View>("pick");
  const [skillKey, setSkillKey] = useState(SKILLS[0].key);
  const [level, setLevel] = useState(1);
  const [timed, setTimed] = useState(true);

  const [problem, setProblem] = useState<Problem | null>(null);
  const [entry, setEntry] = useState("");
  const [feedback, setFeedback] = useState<{ correct: boolean; points: number } | null>(null);

  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);

  const lockedRef = useRef(false);
  const startRef = useRef(0);
  const endRef = useRef(0);

  const skill = getSkill(skillKey) || SKILLS[0];

  const nextProblem = useCallback(() => {
    const sk = getSkill(skillKey) || SKILLS[0];
    setProblem(sk.generate(level));
    setEntry("");
    setFeedback(null);
    lockedRef.current = false;
    startRef.current = Date.now();
  }, [skillKey, level]);

  function startGame() {
    setScore(0); setCorrect(0); setTotal(0); setStreak(0); setBest(0);
    setSecondsLeft(ROUND_SECONDS);
    endRef.current = Date.now() + ROUND_SECONDS * 1000;
    setView("playing");
    const sk = getSkill(skillKey) || SKILLS[0];
    setProblem(sk.generate(level));
    setEntry(""); setFeedback(null); lockedRef.current = false;
    startRef.current = Date.now();
  }

  // game clock (timed mode only)
  useEffect(() => {
    if (view !== "playing" || !timed) return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.round((endRef.current - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) setView("done");
    }, 250);
    return () => clearInterval(id);
  }, [view, timed]);

  const grade = useCallback(
    (answerStr: string) => {
      if (lockedRef.current || !problem) return;
      const trimmed = answerStr.trim();
      if (problem.answerType === "number" && trimmed === "") return;
      const isCorrect = checkAnswer(answerStr, problem);
      const pts = scorePoints(isCorrect, Date.now() - startRef.current);
      lockedRef.current = true;
      setScore((s) => s + pts);
      setTotal((t) => t + 1);
      if (isCorrect) {
        setCorrect((c) => c + 1);
        setStreak((s) => { const n = s + 1; setBest((b) => Math.max(b, n)); return n; });
      } else {
        setStreak(0);
      }
      setFeedback({ correct: isCorrect, points: pts });
      setTimeout(() => {
        if (timed && Date.now() >= endRef.current) { setView("done"); return; }
        nextProblem();
      }, 650);
    },
    [problem, timed, nextProblem],
  );

  const pressKey = useCallback((k: string) => {
    if (lockedRef.current) return;
    setEntry((prev) => {
      if (k === "back") return prev.slice(0, -1);
      if (k === "neg") return prev.startsWith("-") ? prev.slice(1) : "-" + prev;
      if (prev.replace("-", "").length >= 6) return prev;
      return prev + k;
    });
  }, []);

  // physical keyboard support
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

  const accuracy = total ? Math.round((correct / total) * 100) : 0;

  return (
    <main className="pr">
      <style>{styles}</style>

      <header className="pr-top">
        <a className="pr-brand" href="/explore">
          <img className="pr-logo" src="/big-dog-mark.png" alt="" />
          <span className="pr-brand-name">bigdogmath</span>
        </a>
        <a className="pr-back" href="/explore">← Explore</a>
      </header>

      {view === "pick" && (
        <div className="pr-wrap">
          <h1 className="pr-h1">Practice Games</h1>
          <p className="pr-sub">Pick a game and a level. Beat your own score — no class code needed.</p>

          <div className="pr-fld">Game</div>
          <div className="pr-skills">
            {SKILLS.map((s) => (
              <button key={s.key} className={`pr-skill${skillKey === s.key ? " on" : ""}`}
                onClick={() => { setSkillKey(s.key); setLevel(1); }}>
                <span className="pr-skill-emoji">{s.emoji}</span>
                <span>
                  <span className="pr-skill-label">{s.label}</span>
                  <span className="pr-skill-blurb">{s.blurb}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="pr-fld">Level</div>
          <div className="pr-pills">
            {skill.levels.map((lvl, i) => (
              <button key={i} className={`pr-pill${level === i + 1 ? " on" : ""}`} onClick={() => setLevel(i + 1)}>
                {i + 1}. {lvl}
              </button>
            ))}
          </div>

          <div className="pr-fld">Mode</div>
          <div className="pr-pills">
            <button className={`pr-pill${timed ? " on" : ""}`} onClick={() => setTimed(true)}>⏱️ Timed (90s)</button>
            <button className={`pr-pill${!timed ? " on" : ""}`} onClick={() => setTimed(false)}>♾️ Practice (no timer)</button>
          </div>

          <button className="pr-start" onClick={startGame}>Start →</button>
        </div>
      )}

      {view === "playing" && problem && (
        <div className="pr-play">
          <div className="pr-hud">
            <div className="pr-hud-l">
              <span className="pr-pts">{score}</span>
              <span className="pr-pts-lbl">points</span>
            </div>
            {streak >= 2 && <div className="pr-streak">🔥 {streak} streak</div>}
            {timed
              ? <div className="pr-clock" data-low={secondsLeft <= 10}>{secondsLeft}s</div>
              : <button className="pr-done-btn" onClick={() => setView("done")}>Done</button>}
          </div>
          {timed && <div className="pr-bar"><div className="pr-bar-fill" style={{ width: `${(secondsLeft / ROUND_SECONDS) * 100}%` }} /></div>}

          <div className={`pr-qcard${feedback ? (feedback.correct ? " ok" : " no") : ""}`}>
            <div className="pr-skill-tag">{skill.emoji} {skill.label}</div>
            <div className="pr-prompt">{problem.prompt}</div>
            {problem.sub && <div className="pr-psub">{problem.sub}</div>}

            {feedback ? (
              <div className={`pr-fb ${feedback.correct ? "ok" : "no"}`}>
                {feedback.correct ? `✓ +${feedback.points}` : `✗  ${problem.answer}`}
              </div>
            ) : problem.answerType === "number" ? (
              <>
                <div className="pr-entry">{entry || <span className="pr-entry-ph">?</span>}</div>
                <div className="pr-keys">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
                    <button key={k} className="pr-key" onClick={() => pressKey(k)}>{k}</button>
                  ))}
                  {problem.allowNegative
                    ? <button className="pr-key pr-key-fn" onClick={() => pressKey("neg")}>±</button>
                    : <span />}
                  <button className="pr-key" onClick={() => pressKey("0")}>0</button>
                  <button className="pr-key pr-key-fn" onClick={() => pressKey("back")}>⌫</button>
                </div>
                <button className="pr-submit" onClick={() => grade(entry)} disabled={!entry}>Submit</button>
              </>
            ) : (
              <div className="pr-choices">
                {problem.choices?.map((c) => (
                  <button key={c} className="pr-choice" onClick={() => grade(c)}>{c}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {view === "done" && (
        <div className="pr-wrap pr-center">
          <div className="pr-card">
            <div className="pr-emoji">{accuracy >= 80 ? "🏆" : "🎉"}</div>
            <h1 className="pr-h1" style={{ marginTop: 8 }}>Nice work!</h1>
            <div className="pr-stats">
              <div><b>{score}</b><span>points</span></div>
              <div><b>{correct}/{total}</b><span>correct</span></div>
              <div><b>{accuracy}%</b><span>accuracy</span></div>
              <div><b>{best}</b><span>best streak</span></div>
            </div>
            <div className="pr-again">
              <button className="pr-start" onClick={startGame}>Play again →</button>
              <button className="pr-secondary" onClick={() => setView("pick")}>Pick another game</button>
            </div>
            <a className="pr-link" href="/explore">Back to Explore</a>
          </div>
        </div>
      )}
    </main>
  );
}

const styles = `
  .pr { min-height:100vh; background:var(--bdb-ground); font-family:var(--bdb-font); color:var(--bdb-ink);
    display:flex; flex-direction:column; }
  .pr-top { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;
    padding:14px clamp(16px,4vw,28px); border-bottom:1px solid var(--bdb-line); }
  .pr-brand { display:inline-flex; align-items:center; gap:9px; text-decoration:none; }
  .pr-logo { width:30px; height:30px; display:block; object-fit:contain; flex:none; }
  .pr-brand-name { font-weight:800; color:var(--bdb-ink); letter-spacing:-0.01em; }
  .pr-back { color:var(--bdb-ink-soft); font-weight:600; font-size:0.9rem; text-decoration:none;
    border:1px solid var(--bdb-line); border-radius:999px; padding:8px 14px; background:var(--bdb-card); }
  .pr-back:hover { border-color:var(--bdb-teal); color:var(--bdb-ink); }

  .pr-wrap { max-width:680px; width:100%; margin:0 auto; padding:clamp(18px,4vw,34px) 16px; box-sizing:border-box; }
  .pr-center { flex:1; display:flex; align-items:center; justify-content:center; }
  .pr-h1 { margin:0 0 4px; font-size:clamp(1.6rem,4.5vw,2.3rem); font-weight:800; letter-spacing:-0.02em; }
  .pr-sub { margin:0 0 18px; color:var(--bdb-ink-soft); font-weight:500; }
  .pr-fld { font-size:0.74rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase;
    color:var(--bdb-ink-faint); margin:20px 0 9px; }

  .pr-skills { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:10px; }
  .pr-skill { display:flex; align-items:center; gap:11px; text-align:left; background:var(--bdb-card);
    border:1px solid var(--bdb-line); border-radius:var(--bdb-r); padding:13px 14px; cursor:pointer;
    box-shadow:var(--bdb-shadow-sm); }
  .pr-skill:hover { border-color:var(--bdb-teal); }
  .pr-skill.on { border-color:var(--bdb-teal); background:color-mix(in srgb, var(--bdb-teal) 9%, white); }
  .pr-skill-emoji { font-size:1.5rem; flex:none; }
  .pr-skill-label { display:block; font-weight:800; color:var(--bdb-ink); }
  .pr-skill-blurb { display:block; font-size:0.82rem; color:var(--bdb-ink-soft); font-weight:500; margin-top:1px; }

  .pr-pills { display:flex; flex-wrap:wrap; gap:8px; }
  .pr-pill { background:var(--bdb-card); border:1px solid var(--bdb-line); color:var(--bdb-ink-soft);
    border-radius:999px; padding:10px 16px; font-weight:800; font-size:0.9rem; cursor:pointer; }
  .pr-pill:hover { border-color:var(--bdb-teal); }
  .pr-pill.on { background:var(--bdb-ink); border-color:var(--bdb-ink); color:#fff; }

  .pr-start { margin-top:24px; background:var(--bdb-teal); color:#fff; border:none; border-radius:var(--bdb-r);
    padding:15px 28px; font-weight:900; font-size:1.05rem; cursor:pointer; }
  .pr-start:hover { filter:brightness(1.04); }
  .pr-secondary { background:var(--bdb-card); color:var(--bdb-ink); border:1px solid var(--bdb-line);
    border-radius:var(--bdb-r); padding:15px 22px; font-weight:800; cursor:pointer; }

  .pr-play { max-width:480px; width:100%; margin:0 auto; padding:clamp(14px,3vw,24px) 16px; box-sizing:border-box;
    display:flex; flex-direction:column; gap:12px; }
  .pr-hud { display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .pr-hud-l { display:flex; align-items:baseline; gap:6px; }
  .pr-pts { font-size:1.7rem; font-weight:900; color:var(--bdb-ink); }
  .pr-pts-lbl { font-size:0.78rem; font-weight:700; color:var(--bdb-ink-faint); text-transform:uppercase; letter-spacing:0.08em; }
  .pr-streak { font-size:0.85rem; font-weight:800; color:var(--bdb-coral); }
  .pr-clock { font-size:1.2rem; font-weight:900; color:var(--bdb-ink-soft); min-width:48px; text-align:right; }
  .pr-clock[data-low="true"] { color:var(--bdb-coral); animation:prPulse 1s infinite; }
  @keyframes prPulse { 0%,100%{opacity:1;} 50%{opacity:0.45;} }
  .pr-done-btn { background:var(--bdb-card); border:1px solid var(--bdb-line); color:var(--bdb-ink-soft);
    border-radius:999px; padding:8px 16px; font-weight:800; cursor:pointer; }
  .pr-bar { height:8px; background:var(--bdb-ground-2,#efe7d6); border-radius:999px; overflow:hidden; }
  .pr-bar-fill { height:100%; background:var(--bdb-teal); border-radius:999px; transition:width 250ms linear; }

  .pr-qcard { background:var(--bdb-card); border:2px solid var(--bdb-line); border-radius:var(--bdb-r-lg);
    box-shadow:var(--bdb-shadow); padding:22px 20px 20px; text-align:center; transition:border-color 150ms, background 150ms; }
  .pr-qcard.ok { border-color:var(--bdb-green); background:color-mix(in srgb, var(--bdb-green) 8%, white); }
  .pr-qcard.no { border-color:var(--bdb-coral); background:color-mix(in srgb, var(--bdb-coral) 8%, white); }
  .pr-skill-tag { font-size:0.78rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:var(--bdb-ink-faint); }
  .pr-prompt { font-size:clamp(2rem,9vw,3rem); font-weight:900; letter-spacing:-0.01em; margin:10px 0 2px; }
  .pr-psub { font-size:1.1rem; font-weight:700; color:var(--bdb-teal); margin-bottom:4px; }
  .pr-fb { font-size:clamp(2rem,10vw,3.2rem); font-weight:900; padding:18px 0; }
  .pr-fb.ok { color:var(--bdb-green); } .pr-fb.no { color:var(--bdb-coral); }

  .pr-entry { min-height:54px; margin:10px 0; font-size:2.4rem; font-weight:900; color:var(--bdb-ink);
    border-bottom:3px solid var(--bdb-line); }
  .pr-entry-ph { color:var(--bdb-ink-faint); opacity:0.4; }
  .pr-keys { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin:6px 0 12px; }
  .pr-key { background:var(--bdb-ground); border:1px solid var(--bdb-line); border-radius:14px; padding:16px 0;
    font-size:1.5rem; font-weight:800; color:var(--bdb-ink); cursor:pointer; }
  .pr-key:active { transform:scale(0.95); }
  .pr-key-fn { color:var(--bdb-ink-soft); }
  .pr-submit { width:100%; background:var(--bdb-teal); color:#fff; border:none; border-radius:14px; padding:15px 0;
    font-size:1.15rem; font-weight:900; cursor:pointer; }
  .pr-submit:disabled { opacity:0.4; cursor:default; }
  .pr-choices { display:grid; gap:10px; margin-top:14px; }
  .pr-choice { background:var(--bdb-ground); border:2px solid var(--bdb-line); border-radius:14px; padding:16px;
    font-size:1.4rem; font-weight:800; color:var(--bdb-ink); cursor:pointer; }
  .pr-choice:hover { border-color:var(--bdb-teal); }
  .pr-choice:active { transform:scale(0.98); }

  .pr-card { background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r-lg);
    box-shadow:var(--bdb-shadow); padding:30px 26px; max-width:440px; width:100%; text-align:center; }
  .pr-emoji { font-size:3rem; line-height:1; }
  .pr-stats { display:flex; justify-content:center; flex-wrap:wrap; gap:20px; margin:16px 0 8px; }
  .pr-stats div { display:flex; flex-direction:column; }
  .pr-stats b { font-size:1.7rem; font-weight:900; color:var(--bdb-ink); }
  .pr-stats span { font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--bdb-ink-faint); }
  .pr-again { display:flex; flex-wrap:wrap; gap:10px; justify-content:center; margin-top:14px; }
  .pr-link { display:inline-block; margin-top:14px; color:var(--bdb-ink-faint); font-weight:700; font-size:0.85rem; text-decoration:none; }
`;
