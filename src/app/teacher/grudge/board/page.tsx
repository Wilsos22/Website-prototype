"use client";

// Grudge Ball board - the front-of-room surface and the interactive steal panel.
//
// Only a renderer: who's right, who shoots, what gets erased all live in the
// database. Kids walk up to this panel and tap X's off rivals by hand; the server
// validates every tap. Clocks derive from the round's ends_at against the
// serverNow the API returns - nothing counts down locally.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bigQ } from "@/lib/bruhGame";
import { teacherApiRequest, teacherPost } from "@/lib/teacherApi";
import type { GrudgeState, GrudgeTeamState } from "@/lib/grudgeState";

const POLL_MS = 1000;

function fmtClock(s: number): string {
  if (s < 0) s = 0;
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : String(s);
}

export default function GrudgeBoardPage() {
  const [gameId, setGameId] = useState("");
  const [state, setState] = useState<GrudgeState | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [reviveFor, setReviveFor] = useState<string | null>(null); // team choosing a source

  const offsetRef = useRef(0);
  const closingRef = useRef(false);
  const shootClosingRef = useRef(false);
  const revealSeenRef = useRef("");
  const [revealStep, setRevealStep] = useState(-1);
  const [revealOrder, setRevealOrder] = useState<string[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; };
  const later = (fn: () => void, ms: number) => { timersRef.current.push(setTimeout(fn, ms)); };
  const serverNow = () => Date.now() + offsetRef.current;

  useEffect(() => {
    setGameId(new URLSearchParams(window.location.search).get("game") || "");
    return () => clearTimers();
  }, []);

  const apply = useCallback((next: GrudgeState) => {
    offsetRef.current = Date.parse(next.serverNow) - Date.now();
    setState(next);
  }, []);

  const refresh = useCallback(async () => {
    if (!gameId) return;
    try {
      apply(await teacherApiRequest<GrudgeState>(`/api/teacher/grudge?gameId=${encodeURIComponent(gameId)}`));
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "The game could not be read."); }
  }, [gameId, apply]);

  useEffect(() => {
    if (!gameId) return;
    void refresh();
    const poll = window.setInterval(() => void refresh(), POLL_MS);
    const clock = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => { window.clearInterval(poll); window.clearInterval(clock); };
  }, [gameId, refresh]);

  const act = useCallback(async (body: Record<string, unknown>) => {
    try {
      apply(await teacherPost<GrudgeState>("/api/teacher/grudge", { ...body, gameId }));
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "That did not go through."); }
  }, [gameId, apply]);

  const round = state?.round ?? null;
  const teams = state?.teams ?? [];
  const phase = round?.phase ?? null;

  const secondsLeft = useMemo(() => {
    if (!round || phase !== "answering") return 0;
    return Math.max(0, Math.ceil((Date.parse(round.ends_at) - serverNow()) / 1000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, phase, tick]);

  const explainLeft = useMemo(() => {
    if (!round?.explain_ends_at || phase !== "explain") return 0;
    return Math.ceil((Date.parse(round.explain_ends_at) - serverNow()) / 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, phase, tick]);

  const shootLeft = useMemo(() => {
    if (!round?.shoot_ends_at || phase !== "shoot") return 0;
    return Math.max(0, Math.ceil((Date.parse(round.shoot_ends_at) - serverNow()) / 1000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, phase, tick]);

  // Answer window expiring closes the round (the student route enforces the same).
  useEffect(() => {
    if (phase !== "answering" || secondsLeft > 0 || closingRef.current || !round) return;
    closingRef.current = true;
    void act({ action: "close-round", roundId: round.id }).finally(() => { closingRef.current = false; });
  }, [phase, secondsLeft, round, act]);

  // Shoot window expiring moves to the steal.
  useEffect(() => {
    if (phase !== "shoot" || shootLeft > 0 || shootClosingRef.current || !round) return;
    shootClosingRef.current = true;
    void act({ action: "close-shoot", roundId: round.id }).finally(() => { shootClosingRef.current = false; });
  }, [phase, shootLeft, round, act]);

  const answered = teams.filter((t) => t.phase !== "idle").length;
  const correctTeams = useMemo(() => teams.filter((t) => t.phase === "correct"), [teams]);
  const champion = teams.find((t) => t.id === round?.champion_team_id) ?? null;
  const budget = round ? Math.max(0, round.makes - round.makes_spent) : 0;

  // Reveal: one team at a time, random order (reuses BRUH's beat).
  useEffect(() => {
    if (phase !== "reveal" || !round) return;
    if (revealSeenRef.current === round.id) return;
    revealSeenRef.current = round.id;
    const order = teams.filter((t) => t.answer !== null).sort(() => Math.random() - 0.5).map((t) => t.id);
    setRevealOrder(order); setRevealStep(-1); clearTimers();
    order.forEach((_, i) => later(() => setRevealStep(i), 800 + i * 1400));
    later(() => setRevealStep(order.length), 800 + order.length * 1400);
  }, [phase, round, teams]);

  const B = round ? bigQ(round.prompt) : null;
  const leader = useMemo(() => [...teams].sort((a, b) => b.lives - a.lives)[0] ?? null, [teams]);
  const reviveTeams = teams.filter((t) => t.reviveReady);

  if (!gameId) return <Shell><div className="gb-empty">No game selected. Start one from <a href="/teacher/grudge">grudge setup</a>.</div></Shell>;
  if (!state) return <Shell><div className="gb-empty">{error || "Loading the game."}</div></Shell>;

  const eligibleChampions = correctTeams.filter((t) => !t.out);

  return (
    <Shell>
      <header className="gb-rail">
        <div className="gb-mark"><span className="gb-bar" />GRUDGE<span className="gb-sub">Ball</span></div>
        <div className="gb-spacer" />
        <div className="gb-meta">
          <span><i>Played</i><b>{state.spent.length} / {state.game.questions.length}</b></span>
          <span><i>Lead</i><b>{leader ? leader.name : "--"}</b></span>
        </div>
        <div className="gb-air" data-live={phase === "answering" || phase === "shoot"}>
          <span className="gb-dot" />
          {phase === "answering" ? "Answers open" : phase === "reveal" ? "Reveal" : phase === "explain" ? "On the board"
            : phase === "shoot" ? "Shooting" : phase === "steal" ? "Steal" : "Board"}
        </div>
        {round && phase !== "done" && (
          <button className="gb-link" onClick={() => void act({ action: "end-round", roundId: round.id })}>Back to board</button>
        )}
      </header>

      <main className="gb-view">
        {error && <div className="gb-err">{error}</div>}

        {/* revive prompt band - always visible when someone's earned it */}
        {reviveTeams.length > 0 && phase !== "steal" && !reviveFor && (
          <div className="gb-reviveband">
            {reviveTeams.map((t) => (
              <button key={t.id} className="gb-revive" style={{ ["--tc" as string]: t.color }}
                onClick={() => setReviveFor(t.id)}>
                {t.name} is back with a grudge - revive
              </button>
            ))}
          </div>
        )}

        {/* revive source picker overlay */}
        {reviveFor && (() => {
          const rt = teams.find((t) => t.id === reviveFor);
          const targets = teams.filter((t) => t.id !== reviveFor && t.lives > 0);
          return (
            <div className="gb-overlay">
              <p className="gb-eyebrow">{rt?.name} comes back with {state.game.revive_lives} X&apos;s &mdash; take them from</p>
              <div className="gb-ring">
                {targets.map((t) => (
                  <button key={t.id} className="gb-spod" data-nemesis={t.id === rt?.nemesis_team_id}
                    style={{ ["--tc" as string]: t.color }}
                    onClick={() => { void act({ action: "revive", teamId: reviveFor, sourceId: t.id }); setReviveFor(null); }}>
                    {t.name}{t.id === rt?.nemesis_team_id ? " (nemesis)" : ""}
                  </button>
                ))}
              </div>
              <button className="gb-btn" onClick={() => setReviveFor(null)}>Cancel</button>
            </div>
          );
        })()}

        {/* board */}
        {(!round || phase === "done") && !reviveFor && (
          <div className="gb-boardwrap">
            <div className="gb-bhead">
              <div><h2>Pick a number</h2><p>{state.game.questions.length - state.spent.length} left</p></div>
              {state.spent.length === state.game.questions.length && (
                <button className="gb-btn primary" onClick={() => void act({ action: "finish" })}>Final scores</button>
              )}
            </div>
            <div className="gb-tiles">
              {state.game.questions.map((q) => {
                const spent = state.spent.includes(q.n);
                return (
                  <button key={q.n} className="gb-tile" data-spent={spent} disabled={spent}
                    onClick={() => void act({ action: "open-round", questionN: q.n })}><span>{q.n}</span></button>
                );
              })}
            </div>
          </div>
        )}

        {/* question */}
        {phase === "answering" && round && B && !reviveFor && (
          <div className="gb-q">
            <div className="gb-qmain">
              <div className="gb-qtag"><span className="gb-qnum">{round.question_n}</span><span className="gb-qtopic">{B.lead || round.topic}</span></div>
              <div className={`gb-qtext${B.expr ? " expr" : ""}`} style={{ fontSize: B.size }}>{B.head}</div>
              {B.rest && <p className="gb-qsub">{B.rest}</p>}
            </div>
            <aside className="gb-qside">
              <div className="gb-clock" data-urgent={secondsLeft <= 10}>{fmtClock(secondsLeft)}</div>
              <div className="gb-tally"><b>{answered} / {teams.length}</b><i>Answers in</i></div>
              <button className="gb-btn" onClick={() => void act({ action: "close-round", roundId: round.id })}>Close early</button>
            </aside>
          </div>
        )}

        {/* reveal + pick a champion */}
        {phase === "reveal" && round && !reviveFor && (
          <div className="gb-reveal">
            <div className="gb-answer"><span>Answer</span><div className="gb-avalue">{round.correctAnswer}</div></div>
            <div className="gb-mini">
              {revealOrder.slice(0, Math.max(0, revealStep + 1)).map((id) => {
                const t = teams.find((x) => x.id === id); if (!t) return null;
                return (
                  <span key={id} className="gb-minichip" data-v={t.phase === "correct" ? "in" : "out"} style={{ ["--tc" as string]: t.color }}>
                    <b>{t.name}</b><i>{t.answer}</i>
                  </span>
                );
              })}
            </div>
            {revealStep >= revealOrder.length && (
              <div className="gb-pick">
                {eligibleChampions.length ? (
                  <>
                    <p className="gb-eyebrow">Tap the team that shoots</p>
                    <div className="gb-ring">
                      {eligibleChampions.map((t) => (
                        <button key={t.id} className="gb-spod" style={{ ["--tc" as string]: t.color }}
                          onClick={() => void act({ action: "pick-champion", roundId: round.id, teamId: t.id })}>{t.name}</button>
                      ))}
                    </div>
                    <button className="gb-btn" onClick={() => void act({ action: "end-round", roundId: round.id })}>Skip - back to board</button>
                  </>
                ) : (
                  <>
                    <p className="gb-eyebrow">{correctTeams.length ? "Only out teams got it - no shooter" : "Nobody got it"}</p>
                    <button className="gb-btn primary lg" onClick={() => void act({ action: "end-round", roundId: round.id })}>Back to board</button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* explain at the board */}
        {phase === "explain" && round && B && !reviveFor && (
          <div className="gb-explain">
            <div className="gb-ehead">
              <div className="gb-eq">
                <div className="gb-qtag"><span className="gb-qnum">{round.question_n}</span>
                  <span className="gb-qtopic">{champion?.name} at the board{B.lead ? ` — ${B.lead}` : ""}</span></div>
                <div className={`gb-etext${B.expr ? " expr" : ""}`}>{B.head}</div>
                {B.rest && <p className="gb-esub">{B.rest}</p>}
              </div>
              <div className="gb-emeta">
                <div className="gb-etarget"><i>Answer</i><b>{round.correctAnswer}</b></div>
                <div className="gb-eclock" data-over={explainLeft <= 0}>
                  <b>{explainLeft < 0 ? `+${fmtClock(-explainLeft)}` : fmtClock(explainLeft)}</b>
                  <i>{explainLeft <= 0 ? "Over" : "Explain"}</i>
                </div>
              </div>
            </div>
            <div className="gb-space"><span>Write your work here</span></div>
            <div className="gb-efoot">
              <div className="gb-vocab"><i>Your explanation must use</i>
                <div className="gb-vchips">
                  {(round.vocab ?? []).map((w, i) => (
                    <span key={w} className="gb-vchip" style={{ animationDelay: `${(0.15 + i * 0.14).toFixed(2)}s` }}>{w}</span>
                  ))}
                </div>
              </div>
              <div className="gb-row">
                <button className="gb-btn primary" onClick={() => void act({ action: "to-shoot", roundId: round.id })}>To the hoop</button>
                <button className="gb-btn" onClick={() => void act({ action: "end-round", roundId: round.id })}>Skip shot</button>
              </div>
            </div>
          </div>
        )}

        {/* shoot: giant MAKE button + counter */}
        {phase === "shoot" && round && !reviveFor && (
          <div className="gb-shoot">
            <p className="gb-eyebrow">{champion?.name} &mdash; shoot</p>
            <div className="gb-shootclock" data-urgent={shootLeft <= 5}>{shootLeft}</div>
            <button className="gb-makebtn" onClick={() => void act({ action: "make", roundId: round.id })}>
              <span className="gb-maketally">{round.makes}</span>
              <span className="gb-makelabel">makes &mdash; tap on every basket</span>
            </button>
            <div className="gb-row">
              <button className="gb-btn" onClick={() => void act({ action: "make", roundId: round.id, delta: -1 })}>Undo make</button>
              <button className="gb-btn primary" onClick={() => void act({ action: "close-shoot", roundId: round.id })}>Done shooting</button>
            </div>
          </div>
        )}

        {/* steal: the interactive X-grid */}
        {phase === "steal" && round && !reviveFor && (
          <div className="gb-steal">
            <div className="gb-stealhead">
              <p className="gb-eyebrow">{champion?.name} &mdash; knock off {budget} X{budget === 1 ? "" : "'s"}</p>
              <div className="gb-budget" data-done={budget === 0}>{budget} left</div>
            </div>
            <div className="gb-grid2">
              {teams.filter((t) => t.id !== champion?.id).map((t) => (
                <div key={t.id} className="gb-col" data-out={t.out} style={{ ["--tc" as string]: t.color }}>
                  <div className="gb-colname">{t.name}</div>
                  <div className="gb-pips">
                    {Array.from({ length: Math.max(t.lives, 0) }, (_, i) => (
                      <button key={i} className="gb-pip" disabled={budget === 0 || t.out || i !== t.lives - 1}
                        aria-label={`Erase an X from ${t.name}`}
                        onClick={() => void act({ action: "erase", roundId: round.id, targetId: t.id })}>&times;</button>
                    ))}
                  </div>
                  <div className="gb-collives">{t.out ? "OUT - safe" : `${t.lives} X${t.lives === 1 ? "" : "'s"}`}</div>
                </div>
              ))}
            </div>
            <div className="gb-row" style={{ justifyContent: "center" }}>
              <button className="gb-btn primary lg" onClick={() => void act({ action: "end-round", roundId: round.id })}>
                {budget === 0 ? "Back to board" : "Done - back to board"}
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="gb-pods">
        {teams.map((t) => (
          <div key={t.id} className="gb-pod" data-state={t.phase} data-out={t.out} style={{ ["--tc" as string]: t.color }}>
            <div className="gb-ptop"><span className="gb-pname">{t.name}</span><span className="gb-plives">{t.lives}</span></div>
            <div className="gb-pbar">
              {Array.from({ length: Math.max(t.lives, 0) }, (_, i) => <i key={i} />)}
            </div>
            <div className="gb-pstate">
              {t.out ? (t.reviveReady ? "READY TO REVIVE" : `OUT - ${t.wins_while_out}/${state.game.revive_wins} back`)
                : t.phase === "correct" ? "CORRECT" : t.phase === "in" ? "ANSWER IN" : t.phase === "locked" ? "MISSED" : "READY"}
            </div>
          </div>
        ))}
      </footer>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="gb-stage">
      <style>{`
        .gb-stage { position:fixed; inset:0; display:grid; grid-template-rows:auto 1fr auto; background:radial-gradient(120% 90% at 50% 0%, #121a12 0%, #0b0f0b 62%), #0b0f0b; color:#eef2ea; font-family:var(--bdb-font); overflow:hidden; }
        .gb-empty { display:grid; place-items:center; height:100vh; color:#6b7a6b; font-size:15px; } .gb-empty a { color:#f0623b; }
        .gb-err { position:absolute; top:10px; left:50%; transform:translateX(-50%); background:#f95335; color:#160a06; font-size:12px; font-weight:800; padding:7px 14px; border-radius:7px; z-index:60; }
        .gb-rail { display:flex; align-items:center; gap:16px; padding:0 20px; height:60px; border-bottom:1px solid #24301f; background:linear-gradient(180deg,#141c14,#0e120e); }
        .gb-mark { display:flex; align-items:baseline; gap:8px; font-size:20px; font-weight:900; letter-spacing:-0.045em; }
        .gb-bar { width:4px; height:19px; background:#f0623b; transform:skewX(-12deg); align-self:center; }
        .gb-sub { font-size:9px; font-weight:800; letter-spacing:0.22em; color:#6b7a6b; text-transform:uppercase; }
        .gb-spacer { flex:1; }
        .gb-meta { display:flex; gap:24px; } .gb-meta span { display:flex; flex-direction:column; gap:2px; }
        .gb-meta i { font-size:8.5px; font-weight:800; letter-spacing:0.18em; text-transform:uppercase; color:#6b7a6b; font-style:normal; }
        .gb-meta b { font-size:14px; font-weight:800; font-variant-numeric:tabular-nums; }
        .gb-air { display:flex; align-items:center; gap:7px; padding:6px 12px; border-radius:7px; background:#182218; border:1px solid #24301f; font-size:9.5px; font-weight:800; letter-spacing:0.16em; text-transform:uppercase; color:#6b7a6b; }
        .gb-air[data-live="true"] { background:#f0623b; border-color:#f0623b; color:#160a06; }
        .gb-dot { width:6px; height:6px; border-radius:50%; background:currentColor; }
        .gb-air[data-live="true"] .gb-dot { animation:gbPulse 1.1s ease-in-out infinite; }
        @keyframes gbPulse { 50% { opacity:0.25; } }
        .gb-link { font-family:inherit; cursor:pointer; font-size:10px; font-weight:800; letter-spacing:0.1em; text-transform:uppercase; color:#9db09d; text-decoration:none; border:1px solid #24301f; border-radius:7px; padding:8px 13px; background:transparent; }
        .gb-link:hover { color:#eef2ea; border-color:#6b7a6b; }
        .gb-view { position:relative; overflow:hidden; display:flex; flex-direction:column; min-height:0; }
        .gb-btn { padding:13px 24px; border-radius:8px; border:1px solid #24301f; background:#182218; color:#eef2ea; font-size:12px; font-weight:800; letter-spacing:0.1em; text-transform:uppercase; cursor:pointer; font-family:inherit; transition:background .16s, transform .16s; }
        .gb-btn:hover { background:#22301f; transform:translateY(-1px); } .gb-btn:disabled { opacity:0.4; cursor:not-allowed; }
        .gb-btn.primary { background:#f0623b; border-color:#f0623b; color:#160a06; } .gb-btn.primary:hover { background:#ff7a55; }
        .gb-btn.lg { padding:17px 38px; font-size:14px; }
        .gb-row { display:flex; gap:12px; flex-wrap:wrap; }
        .gb-eyebrow { font-size:10.5px; font-weight:800; letter-spacing:0.24em; text-transform:uppercase; color:#6b7a6b; text-align:center; margin:0; }

        .gb-reviveband { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; padding:12px; }
        .gb-revive { font-family:inherit; cursor:pointer; border-radius:9px; border:2px solid var(--tc,#f0623b); background:rgba(240,98,59,.14); color:#eef2ea; font-size:13px; font-weight:900; letter-spacing:0.02em; padding:12px 18px; animation:gbPulse 1.4s ease-in-out infinite; }
        .gb-overlay { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:24px; padding:30px; }

        .gb-boardwrap { flex:1; display:flex; flex-direction:column; padding:22px 30px 18px; min-height:0; }
        .gb-bhead { display:flex; align-items:flex-end; justify-content:space-between; gap:18px; margin-bottom:16px; }
        .gb-bhead h2 { font-size:clamp(19px,2.3vw,29px); font-weight:900; letter-spacing:-0.04em; margin:0; }
        .gb-bhead p { font-size:12px; color:#6b7a6b; margin:4px 0 0; font-weight:600; }
        .gb-tiles { flex:1; display:grid; grid-template-columns:repeat(6,1fr); grid-auto-rows:1fr; gap:12px; min-height:0; }
        .gb-tile { position:relative; border-radius:12px; background:linear-gradient(160deg,#182218,#111811); border:1px solid #24301f; color:#eef2ea; display:grid; place-items:center; font-size:clamp(22px,3vw,44px); font-weight:900; font-variant-numeric:tabular-nums; letter-spacing:-0.05em; cursor:pointer; font-family:inherit; transition:transform .18s cubic-bezier(.16,1,.3,1), background .18s, border-color .18s, color .18s; }
        .gb-tile:hover:not([data-spent="true"]) { transform:translateY(-4px) scale(1.03); border-color:#f0623b; background:linear-gradient(160deg,#f0623b,#c04220); color:#160a06; }
        .gb-tile[data-spent="true"] { background:transparent; border-style:dashed; border-color:#1a2418; color:#37432f; cursor:default; }

        .gb-q { flex:1; display:grid; grid-template-columns:1fr 176px; min-height:0; }
        .gb-qmain { padding:24px 40px; display:flex; flex-direction:column; justify-content:center; gap:20px; min-height:0; }
        .gb-qtag { display:inline-flex; align-items:center; gap:10px; align-self:flex-start; }
        .gb-qnum { background:#f0623b; color:#160a06; font-size:16px; font-weight:900; font-variant-numeric:tabular-nums; padding:5px 12px; border-radius:7px; }
        .gb-qtopic { font-size:10px; font-weight:800; letter-spacing:0.2em; text-transform:uppercase; color:#6b7a6b; }
        .gb-qtext { font-weight:800; letter-spacing:-0.035em; line-height:1.06; text-wrap:balance; max-width:32ch; }
        .gb-qtext.expr, .gb-etext.expr { font-family:ui-monospace,Menlo,Consolas,monospace; letter-spacing:-0.02em; }
        .gb-qsub { font-size:clamp(19px,2.2vw,33px); color:#9db09d; line-height:1.45; max-width:50ch; white-space:pre-line; margin:0; }
        .gb-qside { border-left:1px solid #24301f; background:#0e120e; padding:20px 14px; display:flex; flex-direction:column; align-items:center; gap:14px; }
        .gb-clock { font-size:34px; font-weight:900; font-variant-numeric:tabular-nums; letter-spacing:-0.06em; width:116px; height:116px; border-radius:50%; border:8px solid #f0623b; display:grid; place-items:center; }
        .gb-clock[data-urgent="true"] { border-color:#f95335; color:#f95335; animation:gbTick 1s steps(1) infinite; }
        @keyframes gbTick { 50% { opacity:0.5; } }
        .gb-tally { display:grid; gap:2px; text-align:center; }
        .gb-tally b { font-size:23px; font-weight:900; font-variant-numeric:tabular-nums; }
        .gb-tally i { font-size:8.5px; font-weight:800; letter-spacing:0.16em; text-transform:uppercase; color:#6b7a6b; font-style:normal; }
        .gb-qside .gb-btn { width:100%; margin-top:auto; padding:11px 8px; font-size:10px; }

        .gb-reveal { flex:1; display:flex; flex-direction:column; justify-content:center; gap:24px; padding:30px 40px; min-height:0; }
        .gb-answer { display:grid; gap:8px; }
        .gb-answer span { font-size:10px; font-weight:800; letter-spacing:0.2em; text-transform:uppercase; color:#3fbf7f; }
        .gb-avalue { font-size:clamp(40px,6vw,84px); font-weight:900; letter-spacing:-0.055em; line-height:1; color:#5fd89b; }
        .gb-mini { display:flex; gap:9px; flex-wrap:wrap; min-height:44px; }
        .gb-minichip { border-radius:7px; padding:8px 13px; background:#111811; border:1px solid #24301f; border-top:3px solid var(--tc,#24301f); display:flex; gap:8px; align-items:baseline; animation:gbIn .25s both; }
        @keyframes gbIn { from { opacity:0; transform:translateY(10px) scale(.92); } }
        .gb-minichip b { font-size:12.5px; font-weight:800; } .gb-minichip i { font-size:13px; font-weight:800; font-style:normal; font-variant-numeric:tabular-nums; }
        .gb-minichip[data-v="in"] { border-color:#3fbf7f; } .gb-minichip[data-v="in"] i { color:#5fd89b; }
        .gb-minichip[data-v="out"] { opacity:0.5; } .gb-minichip[data-v="out"] i { color:#f95335; }
        .gb-pick, .gb-shoot { display:flex; flex-direction:column; align-items:center; gap:22px; }
        .gb-ring { display:flex; gap:12px; flex-wrap:wrap; justify-content:center; }
        .gb-spod { font-family:inherit; cursor:pointer; border-radius:11px; padding:20px 28px; background:#111811; border:2px solid var(--tc,#24301f); color:#eef2ea; font-size:clamp(17px,2vw,26px); font-weight:900; letter-spacing:-0.03em; transition:transform .12s, background .12s; }
        .gb-spod:hover { transform:scale(1.06); background:rgba(240,98,59,.12); }
        .gb-spod[data-nemesis="true"] { border-color:#f95335; box-shadow:0 0 0 3px rgba(249,83,53,.25); }

        .gb-explain { flex:1; display:grid; grid-template-rows:auto 1fr auto; padding:14px 30px 12px; min-height:0; }
        .gb-ehead { display:grid; grid-template-columns:1fr auto; align-items:start; gap:24px; padding-bottom:12px; border-bottom:1px solid #24301f; }
        .gb-eq { display:grid; gap:6px; min-width:0; }
        .gb-etext { font-size:clamp(22px,2.6vw,40px); font-weight:800; letter-spacing:-0.035em; line-height:1.1; max-width:34ch; }
        .gb-esub { font-size:clamp(13px,1.2vw,17px); color:#9db09d; max-width:70ch; white-space:pre-line; margin:0; }
        .gb-emeta { display:flex; align-items:center; gap:20px; flex-shrink:0; }
        .gb-etarget i { display:block; font-size:9.5px; font-weight:800; letter-spacing:0.16em; text-transform:uppercase; color:#6b7a6b; font-style:normal; }
        .gb-etarget b { display:block; margin-top:3px; font-size:clamp(22px,2.2vw,34px); font-weight:900; letter-spacing:-0.03em; color:#5fd89b; font-variant-numeric:tabular-nums; }
        .gb-eclock { display:grid; justify-items:center; gap:2px; border-radius:8px; background:#111811; border:1px solid #24301f; padding:7px 16px; min-width:112px; }
        .gb-eclock b { font-size:clamp(26px,2.6vw,40px); font-weight:900; font-variant-numeric:tabular-nums; letter-spacing:-0.04em; line-height:1; }
        .gb-eclock i { font-size:8px; font-weight:800; letter-spacing:0.18em; text-transform:uppercase; color:#6b7a6b; font-style:normal; }
        .gb-eclock[data-over="true"] { border-color:#f95335; background:rgba(249,83,53,.12); } .gb-eclock[data-over="true"] b, .gb-eclock[data-over="true"] i { color:#f95335; }
        .gb-space { min-height:0; display:grid; place-items:center; }
        .gb-space span { font-size:10px; font-weight:800; letter-spacing:0.3em; text-transform:uppercase; color:#1e281a; user-select:none; }
        .gb-efoot { display:grid; grid-template-columns:1fr auto; align-items:end; gap:24px; padding-top:10px; border-top:1px solid #24301f; }
        .gb-vocab { display:grid; gap:7px; }
        .gb-vocab > i { font-size:9.5px; font-weight:800; letter-spacing:0.22em; text-transform:uppercase; color:#6b7a6b; font-style:normal; }
        .gb-vchips { display:flex; gap:9px; flex-wrap:wrap; }
        .gb-vchip { border-radius:7px; border:2px solid #f0623b; color:#f0623b; padding:7px 15px; font-weight:900; font-size:clamp(13px,1.4vw,20px); letter-spacing:0.04em; text-transform:uppercase; animation:gbChip .4s cubic-bezier(.3,1.4,.4,1) both; }
        @keyframes gbChip { from { opacity:0; transform:translateY(12px) scale(.85); } }

        .gb-shoot { flex:1; justify-content:center; padding:20px; }
        .gb-shootclock { font-size:clamp(56px,10vw,150px); font-weight:900; font-variant-numeric:tabular-nums; letter-spacing:-0.06em; line-height:1; }
        .gb-shootclock[data-urgent="true"] { color:#f95335; animation:gbTick 1s steps(1) infinite; }
        .gb-makebtn { font-family:inherit; cursor:pointer; display:grid; gap:4px; place-items:center; width:min(560px,84vw); padding:36px; border-radius:20px; border:3px solid #f0623b; background:rgba(240,98,59,.12); color:#eef2ea; transition:transform .08s, background .12s; }
        .gb-makebtn:active { transform:scale(.98); background:rgba(240,98,59,.24); }
        .gb-maketally { font-size:clamp(60px,11vw,160px); font-weight:900; font-variant-numeric:tabular-nums; line-height:1; color:#f0623b; }
        .gb-makelabel { font-size:12px; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; color:#9db09d; }

        .gb-steal { flex:1; display:flex; flex-direction:column; gap:16px; padding:18px 26px; min-height:0; }
        .gb-stealhead { display:flex; align-items:center; justify-content:space-between; gap:16px; }
        .gb-budget { font-size:15px; font-weight:900; letter-spacing:0.05em; text-transform:uppercase; color:#f0623b; border:2px solid #f0623b; border-radius:8px; padding:8px 16px; }
        .gb-budget[data-done="true"] { color:#6b7a6b; border-color:#24301f; }
        .gb-grid2 { flex:1; display:grid; grid-auto-flow:column; grid-auto-columns:1fr; gap:12px; min-height:0; }
        .gb-col { border-radius:12px; background:#111811; border:1px solid #24301f; border-top:4px solid var(--tc,#24301f); padding:12px 10px; display:flex; flex-direction:column; gap:8px; min-height:0; }
        .gb-col[data-out="true"] { opacity:0.45; }
        .gb-colname { font-size:14px; font-weight:800; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .gb-pips { flex:1; display:flex; flex-wrap:wrap; gap:6px; align-content:flex-start; justify-content:center; min-height:0; overflow:auto; }
        .gb-pip { font-family:inherit; width:clamp(30px,3.2vw,52px); height:clamp(30px,3.2vw,52px); border-radius:9px; border:2px solid var(--tc,#f0623b); background:rgba(255,255,255,.04); color:var(--tc,#f0623b); font-size:clamp(16px,1.8vw,26px); font-weight:900; cursor:pointer; display:grid; place-items:center; transition:transform .1s, background .1s; }
        .gb-pip:hover:not(:disabled) { background:var(--tc); color:#0b0f0b; transform:scale(1.08); }
        .gb-pip:disabled { cursor:default; opacity:0.85; }
        .gb-pip:disabled:not(:last-child) { }
        .gb-collives { font-size:11px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; text-align:center; color:#9db09d; }

        .gb-pods { border-top:1px solid #24301f; background:linear-gradient(180deg,#0e120e,#141c14); padding:12px 20px 14px; display:flex; gap:10px; overflow-x:auto; }
        .gb-pod { flex:1; min-width:150px; border-radius:9px; background:#182218; border:1px solid #24301f; border-top:3px solid var(--tc,#24301f); padding:10px 13px 11px; display:grid; gap:6px; }
        .gb-pod[data-out="true"] { opacity:0.6; border-style:dashed; }
        .gb-ptop { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .gb-pname { font-size:12.5px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .gb-plives { font-size:18px; font-weight:900; font-variant-numeric:tabular-nums; letter-spacing:-0.03em; color:var(--tc); }
        .gb-pbar { display:flex; flex-wrap:wrap; gap:3px; min-height:8px; }
        .gb-pbar i { width:8px; height:8px; border-radius:2px; background:var(--tc,#f0623b); }
        .gb-pstate { font-size:9px; font-weight:800; letter-spacing:0.13em; text-transform:uppercase; color:#6b7a6b; }
        .gb-pod[data-state="correct"] .gb-pstate { color:#5fd89b; }
        .gb-pod[data-state="in"] .gb-pstate { color:#f0623b; }

        @media (prefers-reduced-motion: reduce) { .gb-stage *, .gb-stage *::before, .gb-stage *::after { animation-duration:.01ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; } }
      `}</style>
      {children}
    </div>
  );
}
