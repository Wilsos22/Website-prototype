"use client";

// Student Challenge surface — the live game. When the teacher launches a
// challenge for this session, the screen jumps here (via ClassSync broadcast),
// counts down, then serves auto-generated problems on the chosen skill. Every
// answer is scored (accuracy + speed bonus) and saved to Supabase, feeding the
// live leaderboard and the teacher's formative-data view.

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { getStoredStudentSession, type StoredStudentSession } from "@/lib/liveClassFlow";
import { getSkill, checkAnswer, type Problem } from "@/lib/challengeSkills";
import {
  getLatestChallenge,
  recordAttempt,
  scoreAttempt,
  fetchLeaderboard,
  type ChallengeRow,
  type LeaderRow,
} from "@/lib/challenges";

type View = "loading" | "needjoin" | "waiting" | "countdown" | "playing" | "ended";

export default function ChallengePage() {
  const supabase = getSupabase();
  const [session, setSession] = useState<StoredStudentSession | null>(null);
  const [view, setView] = useState<View>("loading");
  const [challenge, setChallenge] = useState<ChallengeRow | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [entry, setEntry] = useState("");
  const [locked, setLocked] = useState(false);
  const [feedback, setFeedback] = useState<{ correct: boolean; points: number } | null>(null);

  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);
  const [streak, setStreak] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [count, setCount] = useState(3);
  const [board, setBoard] = useState<LeaderRow[]>([]);

  const sessionRef = useRef<StoredStudentSession | null>(null);
  const playingIdRef = useRef<string | null>(null);
  const startRef = useRef<number>(0);
  const endRef = useRef<number>(0);
  const lockedRef = useRef(false);

  const skill = challenge ? getSkill(challenge.skill) : undefined;

  useEffect(() => {
    const s = getStoredStudentSession();
    sessionRef.current = s;
    setSession(s);
    setView(s ? "waiting" : "needjoin");
  }, []);

  const nextProblem = useCallback((ch: ChallengeRow) => {
    const sk = getSkill(ch.skill);
    if (!sk) return;
    setProblem(sk.generate(ch.level));
    setEntry("");
    startRef.current = Date.now();
  }, []);

  // begin a freshly-detected open challenge
  const beginChallenge = useCallback(
    (ch: ChallengeRow) => {
      playingIdRef.current = ch.id;
      endRef.current = new Date(ch.started_at).getTime() + ch.duration_seconds * 1000;
      setChallenge(ch);
      setScore(0); setCorrect(0); setTotal(0); setStreak(0);
      setFeedback(null); setLocked(false); lockedRef.current = false;
      if (Date.now() >= endRef.current) { setView("ended"); return; }
      setCount(3);
      setView("countdown");
    },
    [],
  );

  // poll for the session's latest challenge (start new rounds, detect end)
  useEffect(() => {
    if (!supabase || !session) return;
    let stop = false;
    const tick = async () => {
      const { challenge: latest } = await getLatestChallenge(supabase, session.sessionId);
      if (stop) return;
      if (!latest || latest.status === "closed") {
        if (playingIdRef.current && latest && latest.id === playingIdRef.current) {
          setView((v) => (v === "playing" || v === "countdown" ? "ended" : v));
        } else if (!playingIdRef.current) {
          setView((v) => (v === "loading" || v === "waiting" ? "waiting" : v));
        }
        return;
      }
      // an open challenge exists
      if (latest.id !== playingIdRef.current) beginChallenge(latest);
    };
    tick();
    const id = setInterval(tick, 2500);
    return () => { stop = true; clearInterval(id); };
  }, [supabase, session, beginChallenge]);

  // countdown 3..2..1
  useEffect(() => {
    if (view !== "countdown" || !challenge) return;
    if (count <= 0) {
      setView("playing");
      nextProblem(challenge);
      return;
    }
    const id = setTimeout(() => setCount((c) => c - 1), 800);
    return () => clearTimeout(id);
  }, [view, count, challenge, nextProblem]);

  // game clock
  useEffect(() => {
    if (view !== "playing") return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.round((endRef.current - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) setView("ended");
    }, 250);
    return () => clearInterval(id);
  }, [view]);

  // live leaderboard while playing / on the results screen
  useEffect(() => {
    if (!supabase || !challenge || (view !== "playing" && view !== "ended")) return;
    let stop = false;
    const load = async () => {
      const rows = await fetchLeaderboard(supabase, challenge.id);
      if (!stop) setBoard(rows);
    };
    load();
    const id = setInterval(load, 3000);
    return () => { stop = true; clearInterval(id); };
  }, [supabase, challenge, view]);

  const grade = useCallback(
    (answerStr: string) => {
      if (lockedRef.current || !problem || !challenge || !supabase) return;
      const trimmed = answerStr.trim();
      if (problem.answerType === "number" && trimmed === "") return;
      const isCorrect = checkAnswer(answerStr, problem);
      const timeMs = Date.now() - startRef.current;
      const pts = scoreAttempt(isCorrect, timeMs);
      lockedRef.current = true;
      setLocked(true);
      setScore((s) => s + pts);
      setTotal((t) => t + 1);
      if (isCorrect) { setCorrect((c) => c + 1); setStreak((s) => s + 1); } else setStreak(0);
      setFeedback({ correct: isCorrect, points: pts });
      const sess = sessionRef.current;
      recordAttempt(supabase, {
        challenge_id: challenge.id,
        session_id: challenge.session_id,
        student_id: sess?.studentId ?? null,
        display_name: sess?.name ?? null,
        prompt: problem.sub ? `${problem.prompt}  (${problem.sub})` : problem.prompt,
        correct_answer: problem.answer,
        answer: answerStr,
        is_correct: isCorrect,
        points: pts,
        time_ms: timeMs,
      });
      setTimeout(() => {
        setFeedback(null);
        setLocked(false);
        lockedRef.current = false;
        if (Date.now() >= endRef.current) { setView("ended"); return; }
        nextProblem(challenge);
      }, 650);
    },
    [problem, challenge, supabase, nextProblem],
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
    if (view !== "playing" || !problem) return;
    const onKey = (e: KeyboardEvent) => {
      if (problem.answerType !== "number") return;
      if (e.key >= "0" && e.key <= "9") pressKey(e.key);
      else if (e.key === "Backspace") pressKey("back");
      else if (e.key === "-") pressKey("neg");
      else if (e.key === "Enter") grade(entry);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, problem, entry, pressKey, grade]);

  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  const myRank = session ? board.findIndex((r) => r.key === session.studentId) + 1 : 0;

  return (
    <main className="cg">
      <style>{styles}</style>

      {view === "loading" && <div className="cg-mid"><p className="cg-soft">Loading…</p></div>}

      {view === "needjoin" && (
        <div className="cg-mid cg-card">
          <div className="cg-emoji">🎮</div>
          <h1 className="cg-h">Join your class to play</h1>
          <p className="cg-soft">Challenges are part of a live class session. Tap below and enter your teacher&apos;s code.</p>
          <a className="cg-btn" href="/">Enter class code →</a>
        </div>
      )}

      {view === "waiting" && (
        <div className="cg-mid cg-card">
          <div className="cg-emoji cg-bounce">⏳</div>
          <h1 className="cg-h">Get ready{session ? `, ${session.name.split(" ")[0]}` : ""}!</h1>
          <p className="cg-soft">Waiting for your teacher to start the challenge…</p>
          <div className="cg-dots"><span /><span /><span /></div>
        </div>
      )}

      {view === "countdown" && (
        <div className="cg-mid">
          <p className="cg-soft" style={{ marginBottom: 6 }}>{skill?.emoji} {challenge?.title}</p>
          <div className="cg-count">{count > 0 ? count : "GO!"}</div>
        </div>
      )}

      {view === "playing" && problem && (
        <div className="cg-play">
          <div className="cg-hud">
            <div className="cg-hud-l">
              <span className="cg-pts">{score}</span>
              <span className="cg-pts-lbl">points</span>
            </div>
            {streak >= 2 && <div className="cg-streak">🔥 {streak} streak</div>}
            <div className="cg-clock" data-low={secondsLeft <= 10}>{secondsLeft}s</div>
          </div>
          <div className="cg-bar"><div className="cg-bar-fill" style={{ width: `${challenge ? (secondsLeft / challenge.duration_seconds) * 100 : 0}%` }} /></div>

          <div className={`cg-qcard${feedback ? (feedback.correct ? " ok" : " no") : ""}`}>
            <div className="cg-skill">{skill?.emoji} {skill?.label}</div>
            <div className="cg-prompt">{problem.prompt}</div>
            {problem.sub && <div className="cg-sub">{problem.sub}</div>}

            {feedback ? (
              <div className={`cg-fb ${feedback.correct ? "ok" : "no"}`}>
                {feedback.correct ? `✓ +${feedback.points}` : "✗"}
              </div>
            ) : problem.answerType === "number" ? (
              <>
                <div className="cg-entry">{entry || <span className="cg-entry-ph">?</span>}</div>
                <div className="cg-keys">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
                    <button key={k} className="cg-key" onClick={() => pressKey(k)}>{k}</button>
                  ))}
                  {problem.allowNegative
                    ? <button className="cg-key cg-key-fn" onClick={() => pressKey("neg")}>±</button>
                    : <span />}
                  <button className="cg-key" onClick={() => pressKey("0")}>0</button>
                  <button className="cg-key cg-key-fn" onClick={() => pressKey("back")}>⌫</button>
                </div>
                <button className="cg-submit" onClick={() => grade(entry)} disabled={!entry}>Submit</button>
              </>
            ) : (
              <div className="cg-choices">
                {problem.choices?.map((c) => (
                  <button key={c} className="cg-choice" onClick={() => grade(c)}>{c}</button>
                ))}
              </div>
            )}
          </div>

          {board.length > 0 && (
            <div className="cg-mini">
              {board.slice(0, 3).map((r, i) => (
                <span key={r.key} className={`cg-mini-row${session && r.key === session.studentId ? " me" : ""}`}>
                  <b>{["🥇", "🥈", "🥉"][i]}</b> {r.name.split(" ")[0]} · {r.points}
                </span>
              ))}
              {myRank > 3 && <span className="cg-mini-row me">You · #{myRank} · {score}</span>}
            </div>
          )}
        </div>
      )}

      {view === "ended" && (
        <div className="cg-mid">
          <div className="cg-card cg-results">
            <div className="cg-emoji">{myRank === 1 ? "🏆" : "🎉"}</div>
            <h1 className="cg-h">{myRank === 1 ? "You won!" : myRank > 0 ? `You finished #${myRank}` : "Time!"}</h1>
            <div className="cg-stats">
              <div><b>{score}</b><span>points</span></div>
              <div><b>{correct}/{total}</b><span>correct</span></div>
              <div><b>{accuracy}%</b><span>accuracy</span></div>
            </div>
            {board.length > 0 && (
              <div className="cg-final">
                {board.slice(0, 5).map((r, i) => (
                  <div key={r.key} className={`cg-final-row${session && r.key === session.studentId ? " me" : ""}`}>
                    <span className="cg-final-rank">{["🥇", "🥈", "🥉"][i] || `${i + 1}`}</span>
                    <span className="cg-final-name">{r.name}</span>
                    <span className="cg-final-pts">{r.points}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="cg-soft" style={{ marginTop: 14 }}>Nice work! Waiting for the next round…</p>
            <a className="cg-link" href="/lesson">Back to lesson</a>
          </div>
        </div>
      )}
    </main>
  );
}

const styles = `
  .cg { min-height:100vh; background:var(--bdb-ground); font-family:var(--bdb-font); color:var(--bdb-ink);
    padding:clamp(14px,3vw,30px) 16px 40px; box-sizing:border-box; display:flex; flex-direction:column; }
  .cg-mid { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; text-align:center; }
  .cg-card { background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r-lg);
    box-shadow:var(--bdb-shadow); padding:30px 26px; max-width:440px; width:100%; }
  .cg-emoji { font-size:3rem; line-height:1; }
  .cg-bounce { animation:cgB 1.2s ease-in-out infinite; }
  @keyframes cgB { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-8px);} }
  .cg-h { font-size:clamp(1.5rem,5vw,2rem); font-weight:800; letter-spacing:-0.02em; margin:10px 0 6px; }
  .cg-soft { color:var(--bdb-ink-soft); font-weight:500; font-size:1rem; }
  .cg-btn { display:inline-block; margin-top:16px; background:var(--bdb-teal); color:#fff; text-decoration:none;
    font-weight:800; padding:13px 24px; border-radius:var(--bdb-r); }
  .cg-link { display:inline-block; margin-top:8px; color:var(--bdb-ink-faint); font-weight:700; font-size:0.85rem; text-decoration:none; }
  .cg-dots { display:flex; gap:8px; margin-top:6px; }
  .cg-dots span { width:10px; height:10px; border-radius:50%; background:var(--bdb-teal); opacity:0.3; animation:cgD 1.2s infinite; }
  .cg-dots span:nth-child(2){ animation-delay:0.2s; } .cg-dots span:nth-child(3){ animation-delay:0.4s; }
  @keyframes cgD { 0%,100%{opacity:0.3;} 50%{opacity:1;} }
  .cg-count { font-size:clamp(5rem,28vw,11rem); font-weight:900; color:var(--bdb-amber); line-height:1; animation:cgPop 0.8s ease; }
  @keyframes cgPop { from{transform:scale(0.4); opacity:0;} to{transform:scale(1); opacity:1;} }

  .cg-play { max-width:480px; width:100%; margin:0 auto; display:flex; flex-direction:column; gap:12px; }
  .cg-hud { display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .cg-hud-l { display:flex; align-items:baseline; gap:6px; }
  .cg-pts { font-size:1.7rem; font-weight:900; color:var(--bdb-ink); }
  .cg-pts-lbl { font-size:0.78rem; font-weight:700; color:var(--bdb-ink-faint); text-transform:uppercase; letter-spacing:0.08em; }
  .cg-streak { font-size:0.85rem; font-weight:800; color:var(--bdb-coral); }
  .cg-clock { font-size:1.2rem; font-weight:900; color:var(--bdb-ink-soft); min-width:48px; text-align:right; }
  .cg-clock[data-low="true"] { color:var(--bdb-coral); animation:cgPulse 1s infinite; }
  @keyframes cgPulse { 0%,100%{opacity:1;} 50%{opacity:0.45;} }
  .cg-bar { height:8px; background:var(--bdb-ground-2); border-radius:999px; overflow:hidden; }
  .cg-bar-fill { height:100%; background:var(--bdb-teal); border-radius:999px; transition:width 250ms linear; }

  .cg-qcard { background:var(--bdb-card); border:2px solid var(--bdb-line); border-radius:var(--bdb-r-lg);
    box-shadow:var(--bdb-shadow); padding:22px 20px 20px; text-align:center; transition:border-color 150ms, background 150ms; }
  .cg-qcard.ok { border-color:var(--bdb-green); background:color-mix(in srgb, var(--bdb-green) 8%, white); }
  .cg-qcard.no { border-color:var(--bdb-coral); background:color-mix(in srgb, var(--bdb-coral) 8%, white); }
  .cg-skill { font-size:0.78rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:var(--bdb-ink-faint); }
  .cg-prompt { font-size:clamp(2rem,9vw,3rem); font-weight:900; letter-spacing:-0.01em; margin:10px 0 2px; }
  .cg-sub { font-size:1.1rem; font-weight:700; color:var(--bdb-teal); margin-bottom:4px; }
  .cg-fb { font-size:clamp(2.4rem,12vw,4rem); font-weight:900; padding:18px 0; }
  .cg-fb.ok { color:var(--bdb-green); } .cg-fb.no { color:var(--bdb-coral); }

  .cg-entry { min-height:54px; margin:10px 0; font-size:2.4rem; font-weight:900; color:var(--bdb-ink);
    border-bottom:3px solid var(--bdb-line); }
  .cg-entry-ph { color:var(--bdb-ink-faint); opacity:0.4; }
  .cg-keys { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin:6px 0 12px; }
  .cg-key { background:var(--bdb-ground); border:1px solid var(--bdb-line); border-radius:14px; padding:16px 0;
    font-size:1.5rem; font-weight:800; color:var(--bdb-ink); cursor:pointer; }
  .cg-key:active { transform:scale(0.95); background:var(--bdb-ground-2); }
  .cg-key-fn { color:var(--bdb-ink-soft); }
  .cg-submit { width:100%; background:var(--bdb-teal); color:#fff; border:none; border-radius:14px; padding:15px 0;
    font-size:1.15rem; font-weight:900; cursor:pointer; }
  .cg-submit:disabled { opacity:0.4; cursor:default; }
  .cg-choices { display:grid; gap:10px; margin-top:14px; }
  .cg-choice { background:var(--bdb-ground); border:2px solid var(--bdb-line); border-radius:14px; padding:16px;
    font-size:1.4rem; font-weight:800; color:var(--bdb-ink); cursor:pointer; }
  .cg-choice:hover { border-color:var(--bdb-teal); }
  .cg-choice:active { transform:scale(0.98); }

  .cg-mini { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; }
  .cg-mini-row { background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:999px;
    padding:7px 13px; font-size:0.85rem; font-weight:700; color:var(--bdb-ink-soft); }
  .cg-mini-row.me { background:var(--bdb-ink); color:#fff; }
  .cg-mini-row b { font-style:normal; }

  .cg-results { text-align:center; }
  .cg-stats { display:flex; justify-content:center; gap:22px; margin:14px 0 4px; }
  .cg-stats div { display:flex; flex-direction:column; }
  .cg-stats b { font-size:1.8rem; font-weight:900; color:var(--bdb-ink); }
  .cg-stats span { font-size:0.74rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--bdb-ink-faint); }
  .cg-final { margin-top:16px; display:flex; flex-direction:column; gap:6px; text-align:left; }
  .cg-final-row { display:flex; align-items:center; gap:10px; padding:9px 13px; border-radius:12px;
    background:var(--bdb-ground); font-weight:700; }
  .cg-final-row.me { background:color-mix(in srgb, var(--bdb-amber) 22%, white); }
  .cg-final-rank { width:26px; font-weight:900; }
  .cg-final-name { flex:1; }
  .cg-final-pts { font-weight:900; color:var(--bdb-teal); }
`;
