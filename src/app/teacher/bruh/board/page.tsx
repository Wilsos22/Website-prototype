"use client";

// BRUH board — the front-of-room surface.
//
// This is only a renderer. Every decision (who is right, who explains, what the
// card is worth) already happened on the server; the animations here are theatre
// played over a result that exists in the database. That is why the interactive
// screen, a mouse and the iPad remote can all drive the same game without ever
// disagreeing about it.
//
// The clock is not counted down locally. The round carries ends_at and the API
// carries serverNow; we measure the offset between that and this machine's clock
// and render the difference. A backgrounded tab cannot stall the room.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bigQ, reelTargets, type BruhReward } from "@/lib/bruhGame";
import { BruhSound, loadSoundUrls } from "@/lib/bruhAudio";
import { teacherApiRequest, teacherPost } from "@/lib/teacherApi";
import type { BruhState, BruhTeamState } from "@/lib/bruhState";

const POLL_MS = 1000;
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
// Array order is DISPLAY order (sign, hundreds, tens, ones) so the readout
// spells the number. Stop order is driven purely by dur:
//
//   ones 1.9s -> tens 2.7s -> hundreds 4.3s -> sign 6.6s
//
// The digits land first, so the room learns the SIZE of the card and then has
// to sweat whether it is a plus or a minus. The housing flashes green/red the
// whole time and decelerates like a picker wheel onto the real colour exactly
// as the sign reel stops.
const SIGN_MS = 6600;
const REELS = [
  { key: "sign" as const, symbols: ["+", "−"], loops: 90, dur: SIGN_MS },
  { key: "hun" as const, symbols: DIGITS, loops: 24, dur: 4300 },
  { key: "ten" as const, symbols: DIGITS, loops: 15, dur: 2700 },
  { key: "one" as const, symbols: DIGITS, loops: 11, dur: 1900 },
];
// A draw that finished this long ago is never re-animated - it is just shown
// landed. Covers a board reload mid-reward, and a backgrounded tab whose
// timers were throttled.
const DRAW_SETTLED_MS = SIGN_MS + 4000;

function fmtClock(s: number): string {
  if (s < 0) s = 0;
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : String(s);
}

export default function BruhBoardPage() {
  const [gameId, setGameId] = useState("");
  const [state, setState] = useState<BruhState | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  const offsetRef = useRef(0);          // serverNow - Date.now()
  const soundRef = useRef<BruhSound | null>(null);
  const closingRef = useRef(false);
  const revealSeenRef = useRef<string>("");
  const [revealStep, setRevealStep] = useState(-1);
  const [revealOrder, setRevealOrder] = useState<string[]>([]);
  const [spotHot, setSpotHot] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [flash, setFlash] = useState<"gain" | "loss" | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; };
  const later = (fn: () => void, ms: number) => { timersRef.current.push(setTimeout(fn, ms)); };
  const serverNow = () => Date.now() + offsetRef.current;

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("game") || "";
    setGameId(id);
    soundRef.current = new BruhSound();
    void loadSoundUrls().then((urls) => soundRef.current?.setUrls(urls));
    return () => { soundRef.current?.stopAll(); clearTimers(); };
  }, []);

  const apply = useCallback((next: BruhState) => {
    offsetRef.current = Date.parse(next.serverNow) - Date.now();
    setState(next);
  }, []);

  const refresh = useCallback(async () => {
    if (!gameId) return;
    try {
      const next = await teacherApiRequest<BruhState>(`/api/teacher/bruh?gameId=${encodeURIComponent(gameId)}`);
      apply(next);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The game could not be read.");
    }
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
      const next = await teacherPost<BruhState>("/api/teacher/bruh", { ...body, gameId });
      apply(next);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not go through.");
    }
  }, [gameId, apply]);

  const round = state?.round ?? null;
  const teams = state?.teams ?? [];
  const phase = round?.phase ?? null;

  const secondsLeft = useMemo(() => {
    if (!round || phase !== "answering") return 0;
    return Math.max(0, Math.ceil((Date.parse(round.ends_at) - serverNow()) / 1000));
    // tick drives the recompute
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, phase, tick]);

  const explainLeft = useMemo(() => {
    if (!round?.explain_ends_at || phase !== "explain") return 0;
    return Math.ceil((Date.parse(round.explain_ends_at) - serverNow()) / 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, phase, tick]);

  // The round expiring is just another way of closing it. The student route
  // enforces the same deadline independently, so nothing sneaks in either way.
  useEffect(() => {
    if (phase !== "answering" || secondsLeft > 0 || closingRef.current || !round) return;
    closingRef.current = true;
    soundRef.current?.play("buzzer");
    void act({ action: "close-round", roundId: round.id }).finally(() => { closingRef.current = false; });
  }, [phase, secondsLeft, round, act]);

  const answered = teams.filter((t) => t.phase !== "idle").length;
  const correctTeams = useMemo(() => teams.filter((t) => t.phase === "correct"), [teams]);

  // ---- reveal: one team at a time, in a random order ----------------------
  useEffect(() => {
    if (phase !== "reveal" || !round) return;
    if (revealSeenRef.current === round.id) return;
    revealSeenRef.current = round.id;
    const shown = teams.filter((t) => t.answer !== null);
    const order = [...shown].sort(() => Math.random() - 0.5).map((t) => t.id);
    setRevealOrder(order);
    setRevealStep(-1);
    clearTimers();
    order.forEach((_, i) => {
      later(() => { setRevealStep(i); soundRef.current?.play("tick"); }, 900 + i * 1600);
    });
    later(() => setRevealStep(order.length), 900 + order.length * 1600);
  }, [phase, round, teams]);

  // ---- spotlight: sweep, then land on the team the server already picked ---
  useEffect(() => {
    if (phase !== "spotlight" || !round?.picked_team_id) return;
    const pool = correctTeams.map((t) => t.id);
    if (pool.length <= 1) { setSpotHot(round.picked_team_id); return; }
    clearTimers();
    const stops = pool.length * 3 + Math.max(0, pool.indexOf(round.picked_team_id));
    let i = 0;
    const step = () => {
      setSpotHot(pool[i % pool.length]);
      if (i >= stops) { setSpotHot(round.picked_team_id); return; }
      const t = i / stops;
      i += 1;
      later(step, 55 + Math.pow(t, 3) * 340);
    };
    step();
  }, [phase, round?.picked_team_id, round?.id, correctTeams]);

  // ---- the draw -----------------------------------------------------------
  const reward = (round?.reward ?? null) as (BruhReward & { appliedAt?: string }) | null;
  const targets = reward ? reelTargets(reward) : null;
  const finalKind: "gain" | "loss" | null = targets ? (targets.sign === 0 ? "gain" : "loss") : null;
  // Identity of THIS draw. The reward object is re-created by every poll, so
  // depending on the object itself re-ran the animation once a second and the
  // "Back to board" button never appeared.
  const drawKey = reward && round ? `${round.id}:${reward.key}:${reward.appliedAt ?? ""}` : "";

  useEffect(() => {
    if (!drawKey || !finalKind) { setDrawing(false); setFlash(null); return; }

    // A draw that already settled (board reloaded, or the tab was backgrounded
    // and its timers throttled) is shown landed rather than replayed.
    const age = reward?.appliedAt ? serverNow() - Date.parse(reward.appliedAt) : 0;
    if (age > DRAW_SETTLED_MS) { setDrawing(false); setFlash(finalKind); return; }

    setDrawing(true);
    setFlash("gain");
    soundRef.current?.play("spin", { loop: true });

    const timers: ReturnType<typeof setTimeout>[] = [];
    // Picker-wheel flash: alternate green/red, stretching the interval as it
    // goes, landing on the true colour as the sign reel stops.
    let t = 0;
    const step = () => {
      if (t >= SIGN_MS) {
        setFlash(finalKind);
        setDrawing(false);
        soundRef.current?.stop("spin");
        soundRef.current?.play(reward?.sound ?? (finalKind === "gain" ? "gain" : "loss"));
        return;
      }
      setFlash((prev) => (prev === "gain" ? "loss" : "gain"));
      const d = 55 + Math.pow(t / SIGN_MS, 2.6) * 700;
      t += d;
      timers.push(setTimeout(step, d));
    };
    step();

    // Belt and braces: whatever the animation does, the draw is landed by now,
    // so the teacher always gets a way back to the board.
    timers.push(setTimeout(() => {
      setFlash(finalKind);
      setDrawing(false);
      soundRef.current?.stop("spin");
    }, SIGN_MS + 1500));

    return () => { timers.forEach(clearTimeout); soundRef.current?.stop("spin"); };
    // serverNow/reward are read once at the start of a draw; drawKey is the
    // only thing that should retrigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawKey, finalKind]);

  const slotLanded = !!reward && !drawing;

  const B = round ? bigQ(round.prompt) : null;
  const leader = useMemo(() => [...teams].sort((a, b) => b.score - a.score)[0] ?? null, [teams]);

  if (!gameId) {
    return <Shell><div className="br-empty">No game selected. Start one from <a href="/teacher/bruh">the BRUH setup page</a>.</div></Shell>;
  }
  if (!state) {
    return <Shell><div className="br-empty">{error || "Loading the game."}</div></Shell>;
  }

  return (
    <Shell>
      <header className="br-rail">
        <div className="br-mark"><span className="br-bar" />BRUH<span className="br-sub">Live Review</span></div>
        <div className="br-spacer" />
        <div className="br-meta">
          <span><i>Played</i><b>{state.spent.length} / {state.game.questions.length}</b></span>
          <span><i>Lead</i><b>{leader ? leader.name : "--"}</b></span>
        </div>
        <div className="br-air" data-live={phase === "answering" || phase === "reveal"}>
          <span className="br-dot" />
          {phase === "answering" ? "Answers open" : phase === "reveal" ? "Reveal" : phase === "explain" ? "On the board" : phase === "reward" ? "Reward" : "Board"}
        </div>
        {/* Always available. Whatever the round is doing, one tap returns to the
            board - the teacher is never stranded mid-animation. */}
        {round && phase !== "done" && (
          <button className="br-link" onClick={() => void act({ action: "end-round", roundId: round.id })}>
            Back to board
          </button>
        )}
        {/* The persistent panel screen - it follows whatever game is on, so it
            never needs a game id. */}
        <a className="br-link" href="/teacher/scoreboard">Scoreboard</a>
      </header>

      <main className="br-view">
        {error && <div className="br-err">{error}</div>}

        {/* ---- the board ---- */}
        {!round || phase === "done" ? (
          <div className="br-boardwrap">
            <div className="br-bhead">
              <div>
                <h2>Pick a number</h2>
                <p>{state.game.questions.length - state.spent.length} left on the board</p>
              </div>
              {state.spent.length === state.game.questions.length && (
                <button className="br-btn primary" onClick={() => void act({ action: "finish" })}>Final scores</button>
              )}
            </div>
            <div className="br-tiles">
              {state.game.questions.map((q) => {
                const spent = state.spent.includes(q.n);
                return (
                  <button
                    key={q.n}
                    className="br-tile"
                    data-spent={spent}
                    disabled={spent}
                    aria-label={`Question ${q.n}${spent ? ", already played" : ""}`}
                    onClick={() => void act({ action: "open-round", questionN: q.n })}
                  >
                    <span>{q.n}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* ---- the question ---- */}
        {phase === "answering" && round && B && (
          <div className="br-q">
            <div className="br-qmain">
              <div className="br-qtag">
                <span className="br-qnum">{round.question_n}</span>
                <span className="br-qtopic">{B.lead || round.topic}</span>
              </div>
              <div className={`br-qtext${B.expr ? " expr" : ""}`} style={{ fontSize: B.size }}>{B.head}</div>
              {B.rest && <p className="br-qsub">{B.rest}</p>}
            </div>
            <aside className="br-qside">
              <div className="br-clock" data-urgent={secondsLeft <= 10}>{fmtClock(secondsLeft)}</div>
              <div className="br-tally"><b>{answered} / {teams.length}</b><i>Answers in</i></div>
              <button className="br-btn" onClick={() => void act({ action: "close-round", roundId: round.id })}>Close early</button>
            </aside>
          </div>
        )}

        {/* ---- the reveal ---- */}
        {phase === "reveal" && round && (
          <div className="br-reveal">
            <div className="br-answer">
              <span>Answer</span>
              <div className="br-avalue">{round.correctAnswer}</div>
            </div>
            <div className="br-slotstage">
              {revealStep >= 0 && revealStep < revealOrder.length && (() => {
                const t = teams.find((x) => x.id === revealOrder[revealStep]);
                if (!t) return null;
                return (
                  <div className="br-slotcard" data-v={t.phase === "correct" ? "in" : "out"} style={{ ["--tc" as string]: t.color }}>
                    <span className="br-eyebrow">Revealing</span>
                    <span className="br-sname">{t.name}</span>
                    <span className="br-swin">{t.answer}</span>
                    <span className="br-stamp">{t.phase === "correct" ? "Safe" : "Out"}</span>
                  </div>
                );
              })()}
            </div>
            <div className="br-mini">
              {revealOrder.slice(0, Math.max(0, revealStep)).map((id) => {
                const t = teams.find((x) => x.id === id);
                if (!t) return null;
                return (
                  <span key={id} className="br-minichip" data-v={t.phase === "correct" ? "in" : "out"} style={{ ["--tc" as string]: t.color }}>
                    <b>{t.name}</b><i>{t.answer}</i>
                  </span>
                );
              })}
            </div>
            {revealStep >= revealOrder.length && (
              <div className="br-row">
                <button className="br-btn primary lg" disabled={!correctTeams.length}
                  onClick={() => void act({ action: "pick", roundId: round.id })}>
                  {correctTeams.length ? "Pick who explains" : "Nobody got it"}
                </button>
                <button className="br-btn lg" onClick={() => void act({ action: "end-round", roundId: round.id })}>Back to board</button>
              </div>
            )}
          </div>
        )}

        {/* ---- spotlight ---- */}
        {phase === "spotlight" && round && (
          <div className="br-spot">
            <p className="br-eyebrow">{correctTeams.length} got it &mdash; picking one to explain</p>
            <div className="br-ring">
              {correctTeams.map((t) => (
                <div key={t.id} className="br-spod"
                  data-hot={spotHot === t.id && spotHot !== round.picked_team_id}
                  data-won={spotHot === round.picked_team_id && t.id === round.picked_team_id}>
                  {t.name}
                </div>
              ))}
            </div>
            {spotHot === round.picked_team_id && (
              <div className="br-winner">
                <div className="br-wname">{teams.find((t) => t.id === round.picked_team_id)?.name}</div>
                <p>Grab a marker. You are working this one out in front of everyone.</p>
                <div className="br-row" style={{ justifyContent: "center" }}>
                  <button className="br-btn primary lg" onClick={() => void act({ action: "to-board", roundId: round.id })}>Send them up</button>
                  <button className="br-btn" onClick={() => void act({ action: "pick", roundId: round.id })}>Pick someone else</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---- explain at the board ---- */}
        {phase === "explain" && round && B && (
          <div className="br-explain">
            <div className="br-ehead">
              <div className="br-eq">
                <div className="br-qtag">
                  <span className="br-qnum">{round.question_n}</span>
                  <span className="br-qtopic">
                    {teams.find((t) => t.id === round.picked_team_id)?.name} at the board{B.lead ? ` — ${B.lead}` : ""}
                  </span>
                </div>
                <div className={`br-etext${B.expr ? " expr" : ""}`}>{B.head}</div>
                {B.rest && <p className="br-esub">{B.rest}</p>}
              </div>
              <div className="br-emeta">
                <div className="br-etarget"><i>Answer</i><b>{round.correctAnswer}</b></div>
                <div className="br-eclock" data-over={explainLeft <= 0}>
                  <b>{explainLeft < 0 ? `+${fmtClock(-explainLeft)}` : fmtClock(explainLeft)}</b>
                  <i>{explainLeft <= 0 ? "Over" : "Explain"}</i>
                </div>
              </div>
            </div>
            {/* Deliberately empty: this is the room the student needs to write in
                with the board's own whiteboard tool. */}
            <div className="br-space"><span>Write your work here</span></div>
            <div className="br-efoot">
              <div className="br-vocab">
                <i>Your explanation must use</i>
                <div className="br-vchips">
                  {(round.vocab ?? []).map((w, i) => (
                    <span key={w} className="br-vchip" style={{ animationDelay: `${(0.15 + i * 0.14).toFixed(2)}s` }}>{w}</span>
                  ))}
                </div>
              </div>
              <div className="br-row">
                <button className="br-btn primary" onClick={() => void act({ action: "to-reward", roundId: round.id })}>Explanation accepted</button>
                <button className="br-btn" onClick={() => void act({ action: "pick", roundId: round.id })}>Pick someone else</button>
              </div>
            </div>
          </div>
        )}

        {/* ---- the draw ---- */}
        {phase === "reward" && round && (
          <div className="br-reward">
            <p className="br-eyebrow">{teams.find((t) => t.id === round.picked_team_id)?.name} &mdash; pull it</p>
            <div
              className="br-slot"
              data-kind={!reward ? "cycle" : (flash ?? "cycle")}
              data-landed={slotLanded}
              data-spin={drawing}
            >
              {REELS.map((r) => (
                <Reel key={r.key} plan={r} target={targets ? targets[r.key] : null} drawKey={drawKey} />
              ))}
            </div>
            {reward && slotLanded && (
              <div className="br-rule" data-kind={reward.kind}>
                <b>{reward.title}</b><span>{reward.desc}</span>
              </div>
            )}
            <div className="br-row">
              {!reward ? (
                <button className="br-btn primary lg" onClick={() => void act({ action: "draw", roundId: round.id })}>Pull</button>
              ) : slotLanded ? (
                <button className="br-btn primary lg" onClick={() => void act({ action: "end-round", roundId: round.id })}>Back to board</button>
              ) : null}
            </div>
          </div>
        )}
      </main>

      <footer className="br-pods">
        {teams.map((t) => (
          <Pod key={t.id} team={t} live={phase === "answering"} now={serverNow()} />
        ))}
      </footer>
    </Shell>
  );
}

// ---------------------------------------------------------------------------

/** One reel. Locks itself when its own duration elapses, not when the whole
 *  draw finishes, so the digits settle one at a time. */
function Reel({ plan, target, drawKey }: {
  plan: (typeof REELS)[number];
  target: number | null;
  drawKey: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || target === null) { setLocked(false); return; }
    const total = plan.loops * plan.symbols.length + target;
    el.style.transition = "none";
    el.style.transform = "translateY(0)";
    void el.offsetHeight;
    el.style.transition = `transform ${plan.dur}ms cubic-bezier(.17,.67,.2,1)`;
    el.style.transform = `translateY(-${total}em)`;
    setLocked(false);
    const t = setTimeout(() => setLocked(true), plan.dur);
    return () => clearTimeout(t);
  }, [target, plan, drawKey]);

  const total = target === null ? plan.symbols.length : plan.loops * plan.symbols.length + target;
  const cells = Array.from({ length: total + 1 }, (_, i) => plan.symbols[i % plan.symbols.length]);
  return (
    <div className="br-reel" data-reel={plan.key} data-locked={locked}>
      <div className="br-strip" ref={ref}>
        {cells.map((c, i) => <span key={i}>{c}</span>)}
      </div>
    </div>
  );
}

function Pod({ team, live, now }: { team: BruhTeamState; live: boolean; now: number }) {
  const lockLeft = team.lockedUntil ? Math.max(0, Math.ceil((Date.parse(team.lockedUntil) - now) / 1000)) : 0;
  const label = team.phase === "in" ? "Answer in"
    : team.phase === "locked" ? (live && lockLeft > 0 ? `Locked ${lockLeft}s` : "Missed")
    : team.phase === "correct" ? "Correct"
    : "Ready";
  return (
    <div className="br-pod" data-state={team.phase} style={{ ["--tc" as string]: team.color }}>
      <div className="br-ptop"><span className="br-pname">{team.name}</span><span className="br-pscore">{team.score}</span></div>
      <div className="br-pstate"><span className="br-lamp" />{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="br-stage">
      <style>{`
        .br-stage { position:fixed; inset:0; display:grid; grid-template-rows:auto 1fr auto; background:radial-gradient(120% 90% at 50% 0%, #0e161c 0%, #0b1014 62%), #0b1014; color:#f4efe4; font-family:var(--bdb-font); overflow:hidden; }
        .br-empty { display:grid; place-items:center; height:100vh; color:#64757e; font-size:15px; }
        .br-empty a { color:#fcaf38; }
        .br-err { position:absolute; top:10px; left:50%; transform:translateX(-50%); background:#f95335; color:#140905; font-size:12px; font-weight:800; padding:7px 14px; border-radius:7px; z-index:60; }

        .br-rail { display:flex; align-items:center; gap:16px; padding:0 20px; height:60px; border-bottom:1px solid #22313a; background:linear-gradient(180deg,#131b21,#0e161c); }
        .br-mark { display:flex; align-items:baseline; gap:8px; font-size:20px; font-weight:900; letter-spacing:-0.045em; }
        .br-bar { width:4px; height:19px; background:#fcaf38; transform:skewX(-12deg); align-self:center; }
        .br-sub { font-size:9px; font-weight:800; letter-spacing:0.22em; color:#64757e; text-transform:uppercase; }
        .br-spacer { flex:1; }
        .br-meta { display:flex; gap:24px; }
        .br-meta span { display:flex; flex-direction:column; gap:2px; }
        .br-meta i { font-size:8.5px; font-weight:800; letter-spacing:0.18em; text-transform:uppercase; color:#64757e; font-style:normal; }
        .br-meta b { font-size:14px; font-weight:800; font-variant-numeric:tabular-nums; }
        .br-air { display:flex; align-items:center; gap:7px; padding:6px 12px; border-radius:7px; background:#18232b; border:1px solid #22313a; font-size:9.5px; font-weight:800; letter-spacing:0.16em; text-transform:uppercase; color:#64757e; }
        .br-air[data-live="true"] { background:#f95335; border-color:#f95335; color:#140905; }
        .br-dot { width:6px; height:6px; border-radius:50%; background:currentColor; }
        .br-air[data-live="true"] .br-dot { animation:brPulse 1.1s ease-in-out infinite; }
        @keyframes brPulse { 50% { opacity:0.25; } }
        .br-link { font-family:inherit; cursor:pointer; font-size:10px; font-weight:800; letter-spacing:0.1em; text-transform:uppercase; color:#a9b6bd; text-decoration:none; border:1px solid #22313a; border-radius:7px; padding:8px 13px; }
        .br-link:hover { color:#f4efe4; border-color:#64757e; }

        .br-view { position:relative; overflow:hidden; display:flex; flex-direction:column; min-height:0; }
        .br-btn { padding:13px 24px; border-radius:8px; border:1px solid #22313a; background:#18232b; color:#f4efe4; font-size:12px; font-weight:800; letter-spacing:0.1em; text-transform:uppercase; cursor:pointer; font-family:inherit; transition:background .16s, transform .16s; }
        .br-btn:hover { background:#22303a; transform:translateY(-1px); }
        .br-btn:disabled { opacity:0.4; cursor:not-allowed; }
        .br-btn.primary { background:#fcaf38; border-color:#fcaf38; color:#1a1206; }
        .br-btn.primary:hover { background:#ffc257; }
        .br-btn.lg { padding:17px 38px; font-size:14px; }
        .br-row { display:flex; gap:12px; flex-wrap:wrap; }
        .br-eyebrow { font-size:10.5px; font-weight:800; letter-spacing:0.24em; text-transform:uppercase; color:#64757e; text-align:center; margin:0; }

        .br-boardwrap { flex:1; display:flex; flex-direction:column; padding:22px 30px 18px; min-height:0; }
        .br-bhead { display:flex; align-items:flex-end; justify-content:space-between; gap:18px; margin-bottom:16px; }
        .br-bhead h2 { font-size:clamp(19px,2.3vw,29px); font-weight:900; letter-spacing:-0.04em; margin:0; }
        .br-bhead p { font-size:12px; color:#64757e; margin:4px 0 0; font-weight:600; }
        .br-tiles { flex:1; display:grid; grid-template-columns:repeat(6,1fr); grid-auto-rows:1fr; gap:12px; min-height:0; }
        .br-tile { position:relative; border-radius:12px; background:linear-gradient(160deg,#18232b,#131b21); border:1px solid #22313a; color:#f4efe4; display:grid; place-items:center; font-size:clamp(22px,3vw,44px); font-weight:900; font-variant-numeric:tabular-nums; letter-spacing:-0.05em; cursor:pointer; font-family:inherit; transition:transform .18s cubic-bezier(.16,1,.3,1), background .18s, border-color .18s, color .18s; }
        .br-tile:hover:not([data-spent="true"]) { transform:translateY(-4px) scale(1.03); border-color:#fcaf38; background:linear-gradient(160deg,#fcaf38,#c8801a); color:#1a1206; }
        .br-tile[data-spent="true"] { background:transparent; border-style:dashed; border-color:#1a262e; color:#2f3f48; cursor:default; }

        .br-q { flex:1; display:grid; grid-template-columns:1fr 176px; min-height:0; }
        .br-qmain { padding:24px 40px; display:flex; flex-direction:column; justify-content:center; gap:20px; min-height:0; }
        .br-qtag { display:inline-flex; align-items:center; gap:10px; align-self:flex-start; }
        .br-qnum { background:#fcaf38; color:#1a1206; font-size:16px; font-weight:900; font-variant-numeric:tabular-nums; padding:5px 12px; border-radius:7px; }
        .br-qtopic { font-size:10px; font-weight:800; letter-spacing:0.2em; text-transform:uppercase; color:#64757e; }
        .br-qtext { font-weight:800; letter-spacing:-0.035em; line-height:1.06; text-wrap:balance; max-width:32ch; }
        .br-qtext.expr, .br-etext.expr { font-family:ui-monospace,Menlo,Consolas,monospace; letter-spacing:-0.02em; }
        .br-qsub { font-size:clamp(19px,2.2vw,33px); color:#a9b6bd; line-height:1.45; max-width:50ch; white-space:pre-line; margin:0; }
        .br-qside { border-left:1px solid #22313a; background:#0e161c; padding:20px 14px; display:flex; flex-direction:column; align-items:center; gap:14px; }
        .br-clock { font-size:34px; font-weight:900; font-variant-numeric:tabular-nums; letter-spacing:-0.06em; width:116px; height:116px; border-radius:50%; border:8px solid #fcaf38; display:grid; place-items:center; }
        .br-clock[data-urgent="true"] { border-color:#f95335; color:#f95335; animation:brTick 1s steps(1) infinite; }
        @keyframes brTick { 50% { opacity:0.5; } }
        .br-tally { display:grid; gap:2px; text-align:center; }
        .br-tally b { font-size:23px; font-weight:900; font-variant-numeric:tabular-nums; }
        .br-tally i { font-size:8.5px; font-weight:800; letter-spacing:0.16em; text-transform:uppercase; color:#64757e; font-style:normal; }
        .br-qside .br-btn { width:100%; margin-top:auto; padding:11px 8px; font-size:10px; }

        .br-reveal { flex:1; display:flex; flex-direction:column; justify-content:center; gap:26px; padding:30px 40px; min-height:0; }
        .br-answer { display:grid; gap:8px; }
        .br-answer span { font-size:10px; font-weight:800; letter-spacing:0.2em; text-transform:uppercase; color:#50a3a4; }
        .br-avalue { font-size:clamp(44px,6.5vw,92px); font-weight:900; letter-spacing:-0.055em; line-height:1; color:#6fd3d4; animation:brDrop .5s cubic-bezier(.16,1,.3,1) both; }
        @keyframes brDrop { from { opacity:0; transform:translateY(18px) scale(.96); filter:blur(6px); } }
        .br-slotstage { display:flex; justify-content:center; align-items:center; min-height:210px; }
        .br-slotcard { position:relative; width:min(620px,84vw); border-radius:14px; background:#131b21; border:1px solid #22313a; border-top:4px solid var(--tc,#22313a); padding:20px 30px 24px; display:grid; gap:7px; animation:brSlotIn .3s cubic-bezier(.3,1.4,.4,1) both; }
        @keyframes brSlotIn { from { opacity:0; transform:translateY(16px) scale(.92); } }
        .br-sname { font-size:clamp(20px,2.6vw,32px); font-weight:900; letter-spacing:-0.03em; }
        .br-swin { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:clamp(30px,4.2vw,56px); font-weight:800; letter-spacing:-0.02em; }
        .br-slotcard[data-v="in"] { border-color:#50a3a4; background:rgba(80,163,164,.13); box-shadow:0 0 36px rgba(80,163,164,.25); }
        .br-slotcard[data-v="in"] .br-swin { color:#6fd3d4; }
        .br-slotcard[data-v="out"] { border-color:#f95335; background:rgba(249,83,53,.09); animation:brShake .45s cubic-bezier(.36,.07,.19,.97); }
        .br-slotcard[data-v="out"] .br-swin { color:#f95335; }
        @keyframes brShake { 10%,90%{transform:translateX(-2px);} 20%,80%{transform:translateX(4px);} 30%,50%,70%{transform:translateX(-7px);} 40%,60%{transform:translateX(7px);} }
        .br-stamp { position:absolute; top:50%; right:22px; transform:translateY(-50%) rotate(-8deg); font-size:15px; font-weight:900; letter-spacing:0.18em; text-transform:uppercase; padding:5px 11px; border:2px solid currentColor; animation:brStamp .28s cubic-bezier(.3,1.4,.4,1) .08s both; }
        .br-slotcard[data-v="in"] .br-stamp { color:#6fd3d4; }
        .br-slotcard[data-v="out"] .br-stamp { color:#f95335; }
        @keyframes brStamp { from { opacity:0; transform:translateY(-50%) rotate(-8deg) scale(2.6); } }
        .br-mini { display:flex; gap:9px; flex-wrap:wrap; min-height:44px; }
        .br-minichip { border-radius:7px; padding:8px 13px; background:#131b21; border:1px solid #22313a; border-top:3px solid var(--tc,#22313a); display:flex; gap:8px; align-items:baseline; animation:brSlotIn .25s both; }
        .br-minichip b { font-size:12.5px; font-weight:800; }
        .br-minichip i { font-size:13px; font-weight:800; font-style:normal; font-variant-numeric:tabular-nums; }
        .br-minichip[data-v="in"] { border-color:#50a3a4; }
        .br-minichip[data-v="in"] i { color:#6fd3d4; }
        .br-minichip[data-v="out"] { opacity:0.5; }
        .br-minichip[data-v="out"] i { color:#f95335; }

        .br-spot { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:28px; padding:30px; min-height:0; }
        .br-ring { display:flex; gap:12px; flex-wrap:wrap; justify-content:center; }
        .br-spod { border-radius:11px; padding:20px 28px; background:#131b21; border:2px solid #22313a; font-size:clamp(17px,2vw,26px); font-weight:900; letter-spacing:-0.03em; transition:transform .12s, border-color .12s, background .12s, color .12s; }
        .br-spod[data-hot="true"] { border-color:#fcaf38; background:rgba(252,175,56,.16); transform:scale(1.09); }
        .br-spod[data-won="true"] { border-color:#fcaf38; background:#fcaf38; color:#1a1206; transform:scale(1.16); box-shadow:0 0 0 6px rgba(252,175,56,.2), 0 0 62px rgba(252,175,56,.42); }
        .br-winner { text-align:center; display:grid; gap:8px; animation:brDrop .45s cubic-bezier(.16,1,.3,1) both; }
        .br-wname { font-size:clamp(30px,4.4vw,58px); font-weight:900; letter-spacing:-0.05em; color:#fcaf38; line-height:1; }
        .br-winner p { font-size:15px; color:#a9b6bd; margin:0 0 10px; }

        .br-explain { flex:1; display:grid; grid-template-rows:auto 1fr auto; padding:14px 30px 12px; min-height:0; }
        .br-ehead { display:grid; grid-template-columns:1fr auto; align-items:start; gap:24px; padding-bottom:12px; border-bottom:1px solid #22313a; }
        .br-eq { display:grid; gap:6px; min-width:0; }
        .br-etext { font-size:clamp(22px,2.6vw,40px); font-weight:800; letter-spacing:-0.035em; line-height:1.1; max-width:34ch; }
        .br-esub { font-size:clamp(13px,1.2vw,17px); color:#a9b6bd; max-width:70ch; white-space:pre-line; margin:0; }
        .br-emeta { display:flex; align-items:center; gap:20px; flex-shrink:0; }
        .br-etarget i { display:block; font-size:9.5px; font-weight:800; letter-spacing:0.16em; text-transform:uppercase; color:#64757e; font-style:normal; }
        .br-etarget b { display:block; margin-top:3px; font-size:clamp(22px,2.2vw,34px); font-weight:900; letter-spacing:-0.03em; color:#6fd3d4; font-variant-numeric:tabular-nums; }
        .br-eclock { display:grid; justify-items:center; gap:2px; border-radius:8px; background:#131b21; border:1px solid #22313a; padding:7px 16px; min-width:112px; }
        .br-eclock b { font-size:clamp(26px,2.6vw,40px); font-weight:900; font-variant-numeric:tabular-nums; letter-spacing:-0.04em; line-height:1; }
        .br-eclock i { font-size:8px; font-weight:800; letter-spacing:0.18em; text-transform:uppercase; color:#64757e; font-style:normal; }
        .br-eclock[data-over="true"] { border-color:#f95335; background:rgba(249,83,53,.12); }
        .br-eclock[data-over="true"] b, .br-eclock[data-over="true"] i { color:#f95335; }
        .br-space { min-height:0; display:grid; place-items:center; }
        .br-space span { font-size:10px; font-weight:800; letter-spacing:0.3em; text-transform:uppercase; color:#232f36; user-select:none; }
        .br-efoot { display:grid; grid-template-columns:1fr auto; align-items:end; gap:24px; padding-top:10px; border-top:1px solid #22313a; }
        .br-vocab { display:grid; gap:7px; }
        .br-vocab > i { font-size:9.5px; font-weight:800; letter-spacing:0.22em; text-transform:uppercase; color:#64757e; font-style:normal; }
        .br-vchips { display:flex; gap:9px; flex-wrap:wrap; }
        .br-vchip { border-radius:7px; border:2px solid #fcaf38; color:#fcaf38; padding:7px 15px; font-weight:900; font-size:clamp(13px,1.4vw,20px); letter-spacing:0.04em; text-transform:uppercase; animation:brChip .4s cubic-bezier(.3,1.4,.4,1) both; }
        @keyframes brChip { from { opacity:0; transform:translateY(12px) scale(.85); } }

        .br-reward { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:26px; padding:30px; min-height:0; }
        /* The housing flashes while the reels turn (data-kind toggles), and only
           commits to a colour once data-landed goes true. The digits stay cream
           throughout, so nothing is "highlighted" before the sign lands. */
        .br-slot { display:flex; align-items:center; gap:6px; padding:24px 34px; border-radius:14px; background:#0b1014; border:2px solid #22313a; box-shadow:inset 0 6px 34px rgba(0,0,0,.6); font-size:clamp(56px,9.5vw,150px); font-weight:900; line-height:1; letter-spacing:-0.04em; font-variant-numeric:tabular-nums; transition:border-color .09s linear, box-shadow .09s linear; }
        .br-slot[data-kind="gain"] { border-color:#2f9e6f; box-shadow:inset 0 6px 34px rgba(0,0,0,.6), 0 0 44px rgba(47,158,111,.3); }
        .br-slot[data-kind="loss"] { border-color:#f95335; box-shadow:inset 0 6px 34px rgba(0,0,0,.6), 0 0 44px rgba(249,83,53,.3); }
        /* Once it lands the colour settles rather than snaps, and glows harder. */
        .br-slot[data-landed="true"] { transition:border-color .4s, box-shadow .4s; }
        .br-slot[data-landed="true"][data-kind="gain"] { box-shadow:inset 0 6px 34px rgba(0,0,0,.6), 0 0 66px rgba(47,158,111,.45); animation:brLand .5s cubic-bezier(.2,1.4,.3,1); }
        .br-slot[data-landed="true"][data-kind="loss"] { box-shadow:inset 0 6px 34px rgba(0,0,0,.6), 0 0 66px rgba(249,83,53,.45); animation:brLand .5s cubic-bezier(.2,1.4,.3,1); }
        @keyframes brLand { 35% { transform:scale(1.045); } }
        .br-reel { height:1em; width:.66em; overflow:hidden; position:relative; color:#64757e; transition:color .25s; }
        .br-reel[data-reel="sign"] { width:.62em; }
        .br-reel[data-locked="true"] { color:#f4efe4; }
        .br-slot[data-landed="true"][data-kind="gain"] .br-reel[data-locked="true"] { color:#4fd396; }
        .br-slot[data-landed="true"][data-kind="loss"] .br-reel[data-locked="true"] { color:#f95335; }
        .br-slot[data-spin="true"] .br-reel:not([data-locked="true"])::after { content:""; position:absolute; inset:0; background:linear-gradient(#0b1014, transparent 22%, transparent 78%, #0b1014); pointer-events:none; }
        .br-strip { display:flex; flex-direction:column; will-change:transform; }
        .br-strip > span { display:block; height:1em; line-height:1em; text-align:center; }
        .br-rule { display:grid; gap:5px; text-align:center; animation:brDrop .35s both; }
        .br-rule b { font-size:clamp(19px,2.1vw,30px); font-weight:900; letter-spacing:-0.03em; }
        .br-rule[data-kind="gain"] b { color:#4fd396; }
        .br-rule[data-kind="loss"] b { color:#f95335; }
        .br-rule[data-kind="wild"] b { color:#a89dff; }
        .br-rule span { font-size:14px; color:#a9b6bd; }

        .br-pods { border-top:1px solid #22313a; background:linear-gradient(180deg,#0e161c,#131b21); padding:12px 20px 14px; display:flex; gap:10px; overflow-x:auto; }
        .br-pod { flex:1; min-width:150px; border-radius:9px; background:#18232b; border:1px solid #22313a; border-top:3px solid var(--tc,#22313a); padding:10px 13px 11px; display:grid; gap:6px; transition:transform .22s cubic-bezier(.16,1,.3,1), background .22s, border-color .22s; }
        .br-ptop { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .br-pname { font-size:12.5px; font-weight:800; letter-spacing:-0.01em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .br-pscore { font-size:18px; font-weight:900; font-variant-numeric:tabular-nums; letter-spacing:-0.03em; }
        .br-pstate { font-size:9px; font-weight:800; letter-spacing:0.15em; text-transform:uppercase; color:#64757e; display:flex; align-items:center; gap:6px; min-height:12px; }
        .br-lamp { width:6px; height:6px; border-radius:50%; background:currentColor; flex-shrink:0; }
        .br-pod[data-state="in"] { border-color:#fcaf38; background:rgba(252,175,56,.12); transform:translateY(-4px); }
        .br-pod[data-state="in"] .br-pstate { color:#fcaf38; }
        .br-pod[data-state="locked"] { border-color:#f95335; background:rgba(249,83,53,.11); }
        .br-pod[data-state="locked"] .br-pstate { color:#f95335; }
        .br-pod[data-state="correct"] { border-color:#50a3a4; background:rgba(80,163,164,.16); transform:translateY(-4px); }
        .br-pod[data-state="correct"] .br-pstate { color:#6fd3d4; }

        @media (prefers-reduced-motion: reduce) {
          .br-stage *, .br-stage *::before, .br-stage *::after { animation-duration:.01ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; }
        }
      `}</style>
      {children}
    </div>
  );
}
