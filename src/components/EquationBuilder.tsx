"use client";

// Guided Equation Builder & Solver — student-facing solving reps.
// Equations generate themselves (1-step or 2-step); the picking engine is not
// student-facing. A teacher can still deploy a specific problem through Live
// Flow and it loads here automatically. The student states the goal, taps the
// actual variable (not the coefficient), picks the first move, watches the
// inverse drop onto both sides above a horizontal line, drags the remaining
// variable term down to the next line, writes the 0 and computes the other
// side themselves — then celebrates and rolls straight into the next one,
// with a running "in a row" count for the session.

import { useCallback, useEffect, useRef, useState } from "react";
import { LiveToolBanner, useLiveToolConfig } from "./useLiveToolConfig";

type Phase = "idle" | "goal" | "tap-var" | "move" | "anim" | "pull" | "write" | "celebrate";
type Level = "regular" | "levelup";
type Steps = "one" | "two" | "mix";
interface Line { coef: number; constant: number; rhs: number; showZero?: boolean; opAfter?: PendingOp }
type PendingOp = { kind: "cancel" | "divide"; val: number };
interface MoveChoice { label: string; correct: boolean }

const GOAL_CHOICES: { label: string; correct: boolean }[] = [
  { label: "Isolate the variable", correct: true },
  { label: "Make both sides as big as possible", correct: false },
  { label: "Get rid of the equals sign", correct: false },
  { label: "Remove the variable", correct: false },
];

function ri(lo: number, hi: number): number { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
function shuffle<T>(a: T[]): T[] { return [...a].sort(() => Math.random() - 0.5); }
function sign(v: number): string { return v > 0 ? "+" : "−"; }

function genProblem(steps: Steps): Line {
  const kind = steps === "one" ? (Math.random() < 0.5 ? "add" : "mul")
    : steps === "two" ? "two"
    : (["add", "mul", "two", "two"] as const)[ri(0, 3)];
  if (kind === "add") {
    const b = (Math.random() < 0.5 ? 1 : -1) * ri(2, 9);
    const x = b < 0 ? ri(-b + 1, 14) : ri(1, 12);
    return { coef: 1, constant: b, rhs: x + b };
  }
  if (kind === "mul") {
    const a = ri(2, 9); const x = ri(2, 12);
    return { coef: a, constant: 0, rhs: a * x };
  }
  const a = ri(2, 6);
  const b = (Math.random() < 0.5 ? 1 : -1) * ri(2, 9);
  const x = ri(2, 12);
  return { coef: a, constant: b, rhs: a * x + b };
}

function stepOf(l: Line): "cancel" | "divide" | "done" {
  if (l.constant !== 0) return "cancel";
  if (l.coef !== 1) return "divide";
  return "done";
}

function moveChoicesFor(l: Line): MoveChoice[] {
  const s = stepOf(l);
  if (s === "cancel") {
    const b = Math.abs(l.constant);
    const correct = l.constant > 0 ? `Subtract ${b} from both sides` : `Add ${b} to both sides`;
    const wrongs = [
      l.constant > 0 ? `Add ${b} to both sides` : `Subtract ${b} from both sides`,
      `Divide both sides by ${l.coef > 1 ? l.coef : b}`,
      `Subtract ${Math.abs(l.rhs)} from both sides`,
    ];
    return shuffle([{ label: correct, correct: true }, ...wrongs.map((w) => ({ label: w, correct: false }))]);
  }
  const a = l.coef;
  return shuffle([
    { label: `Divide both sides by ${a}`, correct: true },
    { label: `Multiply both sides by ${a}`, correct: false },
    { label: `Subtract ${a} from both sides`, correct: false },
    { label: `Divide both sides by ${Math.abs(l.rhs)}`, correct: false },
  ]);
}

function goalTextOk(t: string): boolean {
  const s = t.toLowerCase();
  const hasVar = /variable|\bx\b|letter/.test(s);
  const iso = /isolat|alone|by itself|on its own|separate/.test(s);
  return hasVar && iso;
}

export default function EquationBuilder() {
  const liveTool = useLiveToolConfig("/equation-builder");
  const [level, setLevel] = useState<Level>("regular");
  const [steps, setSteps] = useState<Steps>("mix");
  const [streak, setStreak] = useState(0);

  // Fixed starter so server + client render identically; randomized after mount.
  const [lines, setLines] = useState<Line[]>([{ coef: 2, constant: 7, rhs: 13 }]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pendingOp, setPendingOp] = useState<PendingOp | null>(null);
  const [feedback, setFeedback] = useState("");
  const [hint, setHint] = useState<string | null>(null);

  // goal question
  const [goalWrong, setGoalWrong] = useState<Set<number>>(new Set());
  const [goalHit, setGoalHit] = useState<number | null>(null);
  const [goalText, setGoalText] = useState("");
  const [goalTries, setGoalTries] = useState(0);

  // tap the variable
  const [tapWrong, setTapWrong] = useState<Set<string>>(new Set());
  const [tapHit, setTapHit] = useState(false);

  // first-move question
  const [moves, setMoves] = useState<MoveChoice[]>([]);
  const [moveWrong, setMoveWrong] = useState<Set<number>>(new Set());
  const [moveHit, setMoveHit] = useState<number | null>(null);

  // pull-down drag + write-in
  const [pulled, setPulled] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [pullMisses, setPullMisses] = useState(0);
  const [zeroInput, setZeroInput] = useState("");
  const [rhsInput, setRhsInput] = useState("");
  const [zeroOk, setZeroOk] = useState<"idle" | "ok" | "bad">("idle");
  const [rhsOk, setRhsOk] = useState<"idle" | "ok" | "bad">("idle");
  const dropRef = useRef<HTMLDivElement | null>(null);

  const [confetti, setConfetti] = useState<{ left: number; delay: number; hue: number; drift: number }[]>([]);

  const audioRef = useRef<AudioContext | null>(null);
  const cur = lines[lines.length - 1];
  const step = stepOf(cur);

  const tone = useCallback((freqs: number[], gap = 0.12, dur = 0.16) => {
    try {
      audioRef.current = audioRef.current ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const ctx = audioRef.current;
      freqs.forEach((f, i) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.value = f; o.type = f < 200 ? "square" : "sine"; o.connect(g); g.connect(ctx.destination);
        const t = ctx.currentTime + i * gap;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.start(t); o.stop(t + dur + 0.02);
      });
    } catch { /* ignore */ }
  }, []);
  const sCorrect = useCallback(() => tone([523, 784]), [tone]);
  const sWrong = useCallback(() => tone([180, 140]), [tone]);
  const sDrop = useCallback(() => tone([700, 500, 320], 0.08, 0.12), [tone]);
  const sSolved = useCallback(() => tone([523, 659, 784, 1047], 0.1, 0.2), [tone]);

  useEffect(() => {
    let s: Steps = "mix";
    try {
      const l = localStorage.getItem("eqb-level"); if (l === "regular" || l === "levelup") setLevel(l);
      const st = localStorage.getItem("eqb-steps"); if (st === "one" || st === "two" || st === "mix") s = st;
    } catch { /* ignore */ }
    setSteps(s);
    setLines([genProblem(s)]);
  }, []);
  function saveLevel(l: Level) { setLevel(l); try { localStorage.setItem("eqb-level", l); } catch { /* ignore */ } }
  function saveSteps(s: Steps) {
    setSteps(s); try { localStorage.setItem("eqb-steps", s); } catch { /* ignore */ }
    if (phase === "idle") setLines([genProblem(s)]);
  }

  // A teacher-deployed problem replaces the generated one.
  useEffect(() => {
    if (!liveTool || liveTool.route !== "/equation-builder") return;
    const { coefficient, constant, solution } = liveTool.config;
    freshQuestion({ coef: coefficient, constant, rhs: coefficient * solution + constant });
  }, [liveTool?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function resetQuestionState() {
    setPendingOp(null); setFeedback(""); setHint(null);
    setGoalWrong(new Set()); setGoalHit(null); setGoalText(""); setGoalTries(0);
    setTapWrong(new Set()); setTapHit(false);
    setMoves([]); setMoveWrong(new Set()); setMoveHit(null);
    setPulled(false); setDrag(null); setPullMisses(0);
    setZeroInput(""); setRhsInput(""); setZeroOk("idle"); setRhsOk("idle");
    setConfetti([]);
  }
  function freshQuestion(problem?: Line) {
    resetQuestionState();
    setLines([problem ?? genProblem(steps)]);
    setPhase("idle");
  }

  function startSolving() {
    resetQuestionState();
    setLines((l) => [l[0]]);
    setPhase("goal");
  }

  // ── goal ──
  function pickGoal(i: number) {
    if (goalHit !== null) return;
    if (GOAL_CHOICES[i].correct) {
      setGoalHit(i); sCorrect();
      window.setTimeout(() => { setPhase("tap-var"); setFeedback("Tap the variable you're solving for."); }, 650);
    } else {
      sWrong();
      setGoalWrong((w) => new Set(w).add(i));
    }
  }
  function submitGoalText() {
    if (goalTextOk(goalText)) {
      setGoalHit(0); sCorrect();
      window.setTimeout(() => { setPhase("tap-var"); setFeedback("Tap the variable you're solving for."); }, 650);
    } else {
      sWrong(); setGoalTries((t) => t + 1);
      setFeedback(goalTries >= 2 ? "Hint: it starts with “isolate…” — what do you want to happen to the variable?" : "Not quite — what do you want the variable to end up like?");
    }
  }

  // ── tap the variable itself ──
  function tapPart(part: "coef" | "const" | "rhs" | "x") {
    if (phase !== "tap-var" || tapHit) return;
    if (part === "x") {
      setTapHit(true); sCorrect();
      window.setTimeout(() => {
        setTapWrong(new Set());
        beginMove("What is the first move I can make to isolate the variable?");
      }, 500);
      return;
    }
    sWrong();
    setTapWrong((w) => new Set(w).add(part));
    setFeedback(part === "coef"
      ? `That's the coefficient — the number multiplying the variable. Tap the letter itself.`
      : part === "const"
      ? "That's the constant. Tap the variable — the letter you're solving for."
      : "That side is just a number. Tap the variable — the letter.");
  }

  function beginMove(q: string, line?: Line) {
    setMoves(moveChoicesFor(line ?? lines[lines.length - 1]));
    setMoveWrong(new Set()); setMoveHit(null); setHint(null);
    setFeedback(q);
    setPhase("move");
  }

  // ── first move ──
  function pickMove(i: number) {
    if (moveHit !== null) return;
    const l = lines[lines.length - 1];
    if (moves[i].correct) {
      setMoveHit(i); sCorrect(); setHint(null);
      const op: PendingOp = stepOf(l) === "cancel" ? { kind: "cancel", val: l.constant } : { kind: "divide", val: l.coef };
      window.setTimeout(() => {
        setPendingOp(op); setPhase("anim"); sDrop();
        setFeedback(op.kind === "cancel" ? "The inverse drops onto BOTH sides…" : "Divide both sides…");
        window.setTimeout(() => {
          if (op.kind === "cancel") { setPhase("pull"); setFeedback("Now pull down the remaining terms — drag the variable term to the next line."); }
          else { setPhase("write"); setFeedback("The coefficient cancels — now compute the other side."); }
        }, 1100);
      }, 550);
    } else {
      sWrong();
      setMoveWrong((w) => {
        const nw = new Set(w).add(i);
        if (nw.size >= 2) setHint(stepOf(l) === "cancel"
          ? `The constant is ${sign(l.constant)}${Math.abs(l.constant)}. Undo it with the OPPOSITE operation — on both sides.`
          : `x is multiplied by ${l.coef}. Undo multiplication with its inverse.`);
        return nw;
      });
    }
  }

  // ── drag the variable term down ──
  function onTermPointerDown(e: React.PointerEvent) {
    if (phase !== "pull" || pulled) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ x: e.clientX, y: e.clientY });
  }
  function onTermPointerMove(e: React.PointerEvent) {
    if (drag) setDrag({ x: e.clientX, y: e.clientY });
  }
  function onTermPointerUp(e: React.PointerEvent) {
    if (!drag) return;
    const r = dropRef.current?.getBoundingClientRect();
    const pad = 34;
    if (r && e.clientX > r.left - pad && e.clientX < r.right + pad && e.clientY > r.top - pad && e.clientY < r.bottom + pad) {
      landPull();
    } else {
      setPullMisses((m) => m + 1);
      if (pullMisses >= 1) setHint("Drag the variable term straight down into the dashed box on the next line.");
    }
    setDrag(null);
  }
  function landPull() {
    setPulled(true); sDrop();
    setPhase("write");
    setFeedback("It copies down. Now write what each side becomes.");
  }

  // ── write the results ──
  const zeroExpected = 0;
  const rhsExpected = pendingOp?.kind === "cancel" ? cur.rhs - cur.constant : pendingOp ? cur.rhs / pendingOp.val : 0;

  function checkZero() {
    if (zeroInput.trim() === "") return;
    if (Number(zeroInput) === zeroExpected) { setZeroOk("ok"); sCorrect(); }
    else { setZeroOk("bad"); sWrong(); setFeedback(`${sign(cur.constant)}${Math.abs(cur.constant)} and ${sign(-cur.constant)}${Math.abs(cur.constant)} make a zero pair — what's left?`); }
  }
  function checkRhs() {
    if (rhsInput.trim() === "") return;
    if (Number(rhsInput) === rhsExpected) { setRhsOk("ok"); sCorrect(); }
    else {
      setRhsOk("bad"); sWrong();
      setFeedback(pendingOp?.kind === "cancel"
        ? `Recompute ${cur.rhs} ${sign(-cur.constant)} ${Math.abs(cur.constant)}.`
        : `Recompute ${cur.rhs} ÷ ${pendingOp?.val}.`);
    }
  }
  useEffect(() => {
    if (phase !== "write" || !pendingOp) return;
    const need = pendingOp.kind === "cancel" ? zeroOk === "ok" && rhsOk === "ok" : rhsOk === "ok";
    if (!need) return;
    const t = window.setTimeout(() => {
      const next: Line = pendingOp.kind === "cancel"
        ? { coef: cur.coef, constant: 0, rhs: rhsExpected, showZero: true }
        : { coef: 1, constant: 0, rhs: rhsExpected };
      // keep the inverse annotations + rule on the finished line, like paper
      setLines((l) => [...l.slice(0, -1), { ...l[l.length - 1], opAfter: pendingOp }, next]);
      setPendingOp(null); setPulled(false);
      setZeroInput(""); setRhsInput(""); setZeroOk("idle"); setRhsOk("idle");
      if (stepOf(next) === "done") {
        setPhase("celebrate"); setFeedback(""); sSolved();
        setStreak((s) => s + 1);
        setConfetti(Array.from({ length: 26 }, () => ({ left: ri(2, 98), delay: Math.random() * 0.5, hue: ri(0, 360), drift: ri(-80, 80) })));
      } else {
        beginMove("The constant is gone. What's the next move to isolate the variable?", next);
      }
    }, 550);
    return () => window.clearTimeout(t);
  }, [phase, pendingOp, zeroOk, rhsOk]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── glyph renderers (big serif, colored characters — no boxes) ──
  function varTerm(l: Line, opts: { tapZone?: boolean; pullable?: boolean; faded?: boolean } = {}) {
    const coefEl = l.coef !== 1 && (
      <span
        className={`eq-g eq-coef${opts.tapZone ? " eq-tap" : ""}${opts.tapZone && tapWrong.has("coef") ? " eq-wrongglyph" : ""}`}
        onClick={opts.tapZone ? () => tapPart("coef") : undefined}
      >{l.coef}</span>
    );
    const xEl = (
      <span
        className={`eq-g eq-x${opts.tapZone ? " eq-tap eq-tap-x" : ""}${opts.tapZone && tapHit ? " eq-hitglyph" : ""}`}
        onClick={opts.tapZone ? () => tapPart("x") : undefined}
      >x</span>
    );
    const inner = <>{coefEl}{xEl}</>;
    if (opts.pullable) {
      return (
        <span
          className={`eq-term eq-pullable${drag ? " eq-dragging" : ""}`}
          onPointerDown={onTermPointerDown} onPointerMove={onTermPointerMove} onPointerUp={onTermPointerUp}
        >{inner}</span>
      );
    }
    return <span className={`eq-term${opts.faded ? " eq-faded" : ""}`}>{inner}</span>;
  }

  function renderWorked() {
    const out: React.ReactNode[] = [];
    lines.forEach((l, i) => {
      const isLast = i === lines.length - 1;
      const liveOp = isLast && pendingOp && (phase === "anim" || phase === "pull" || phase === "write") ? pendingOp : null;
      const shownOp = liveOp ?? l.opAfter ?? null;

      out.push(
        <div className="eq-cell c-var" key={`v${i}`}>
          {varTerm(l, {
            tapZone: isLast && phase === "tap-var",
            pullable: isLast && phase === "pull" && !pulled,
            faded: false,
          })}
          {shownOp?.kind === "divide" && <span className="eq-under eq-drop">÷ {shownOp.val}</span>}
        </div>
      );
      out.push(
        <div className="eq-cell c-const" key={`c${i}`}>
          {l.constant !== 0 ? (
            <span
              className={`eq-g eq-const${isLast && phase === "tap-var" ? " eq-tap" : ""}${tapWrong.has("const") && isLast ? " eq-wrongglyph" : ""}`}
              onClick={isLast && phase === "tap-var" ? () => tapPart("const") : undefined}
            >{sign(l.constant)} {Math.abs(l.constant)}</span>
          ) : l.showZero ? (
            <span className="eq-g eq-zero">+ 0</span>
          ) : null}
          {shownOp?.kind === "cancel" && <span className="eq-under eq-drop">{sign(-shownOp.val)} {Math.abs(shownOp.val)}</span>}
        </div>
      );
      out.push(<div className="eq-cell c-eq" key={`e${i}`}><span className="eq-g eq-equals">=</span></div>);
      out.push(
        <div className="eq-cell c-rhs" key={`r${i}`}>
          <span
            className={`eq-g eq-rhs${isLast && phase === "tap-var" ? " eq-tap" : ""}${tapWrong.has("rhs") && isLast ? " eq-wrongglyph" : ""}`}
            onClick={isLast && phase === "tap-var" ? () => tapPart("rhs") : undefined}
          >{l.rhs}</span>
          {shownOp && <span className="eq-under eq-drop">{shownOp.kind === "cancel" ? `${sign(-shownOp.val)} ${Math.abs(shownOp.val)}` : `÷ ${shownOp.val}`}</span>}
        </div>
      );

      if (shownOp) out.push(<div className="eq-rule" key={`hr${i}`} />);
      if (liveOp) {
        // pending next line
        if (liveOp.kind === "cancel") {
          out.push(
            <div className="eq-cell c-var" key={`pv${i}`}>
              {pulled ? (
                <span className="eq-term eq-landed">{cur.coef !== 1 && <span className="eq-g eq-coef">{cur.coef}</span>}<span className="eq-g eq-x">x</span></span>
              ) : (
                <div className={`eq-slot${drag ? " eq-slot-hot" : ""}`} ref={dropRef}>{phase === "pull" ? "drop here" : ""}</div>
              )}
            </div>
          );
          out.push(
            <div className="eq-cell c-const" key={`pc${i}`}>
              <input
                className={`eq-input${zeroOk === "ok" ? " ok" : zeroOk === "bad" ? " bad" : ""}`}
                type="number" inputMode="numeric" placeholder="?" disabled={!pulled || zeroOk === "ok"}
                value={zeroInput}
                onChange={(e) => { setZeroInput(e.target.value); setZeroOk("idle"); }}
                onBlur={checkZero}
                onKeyDown={(e) => { if (e.key === "Enter") checkZero(); }}
                aria-label="What does the zero pair make?"
              />
            </div>
          );
          out.push(<div className="eq-cell c-eq" key={`pe${i}`}><span className="eq-g eq-equals eq-faded">=</span></div>);
          out.push(
            <div className="eq-cell c-rhs" key={`pr${i}`}>
              <input
                className={`eq-input${rhsOk === "ok" ? " ok" : rhsOk === "bad" ? " bad" : ""}`}
                type="number" inputMode="numeric" placeholder="?" disabled={!pulled || rhsOk === "ok"}
                value={rhsInput}
                onChange={(e) => { setRhsInput(e.target.value); setRhsOk("idle"); }}
                onBlur={checkRhs}
                onKeyDown={(e) => { if (e.key === "Enter") checkRhs(); }}
                aria-label="Compute the right side"
              />
            </div>
          );
        } else if (phase === "write") {
          out.push(
            <div className="eq-cell c-var" key={`pv${i}`}><span className="eq-term eq-landed"><span className="eq-g eq-x">x</span></span></div>
          );
          out.push(<div className="eq-cell c-const" key={`pc${i}`} />);
          out.push(<div className="eq-cell c-eq" key={`pe${i}`}><span className="eq-g eq-equals eq-faded">=</span></div>);
          out.push(
            <div className="eq-cell c-rhs" key={`pr${i}`}>
              <input
                className={`eq-input${rhsOk === "ok" ? " ok" : rhsOk === "bad" ? " bad" : ""}`}
                type="number" inputMode="numeric" placeholder="?" autoFocus
                value={rhsInput}
                onChange={(e) => { setRhsInput(e.target.value); setRhsOk("idle"); }}
                onBlur={checkRhs}
                onKeyDown={(e) => { if (e.key === "Enter") checkRhs(); }}
                aria-label="Compute the right side"
              />
            </div>
          );
        }
      }
    });
    return out;
  }

  const solvedX = phase === "celebrate" ? cur.rhs : null;

  return (
    <div className="eqb-root">
      <style>{`
        .eqb-root { min-height:calc(100vh - 50px); background:var(--bdb-ground); color:var(--bdb-ink); font-family:var(--bdb-font); display:flex; flex-direction:column; }

        .eqb-strip { display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:12px clamp(16px,3vw,30px); border-bottom:1px solid var(--bdb-line); }
        .eqb-seg { display:inline-flex; background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:999px; padding:3px; }
        .eqb-seg button { border:none; background:transparent; border-radius:999px; padding:7px 14px; font:inherit; font-weight:600; font-size:0.82rem; color:var(--bdb-ink-soft); cursor:pointer; }
        .eqb-seg button.on { background:var(--bdb-ink); color:#fff; }
        .eqb-seg.lvl button.on { background:var(--bdb-coral); }
        .eqb-streak { margin-left:auto; margin-right:auto; display:inline-flex; align-items:center; gap:8px; font-weight:800; font-size:1.02rem; background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:999px; padding:8px 18px; box-shadow:var(--bdb-shadow-sm); }
        .eqb-streak b { color:var(--bdb-coral); font-size:1.2rem; }
        .eqb-new { font-size:0.84rem; font-weight:600; color:var(--bdb-ink-soft); background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:999px; padding:8px 14px; cursor:pointer; }
        .eqb-new:hover { border-color:var(--bdb-ink-faint); color:var(--bdb-ink); }

        .eqb-main { flex:1; padding:clamp(18px,3vw,34px); display:flex; flex-direction:column; gap:clamp(14px,2.4vw,22px); align-items:center; max-width:980px; margin:0 auto; width:100%; box-sizing:border-box; }

        /* ── the equation: big, serif, colored characters ── */
        .eq-work { display:grid; grid-template-columns:minmax(90px,auto) minmax(90px,auto) auto minmax(90px,auto); align-items:start; column-gap:clamp(10px,2.4vw,22px); row-gap:clamp(10px,2vw,18px); justify-content:center; margin-top:6px; }
        .eq-cell { display:flex; flex-direction:column; align-items:center; gap:4px; min-height:1px; animation:eqIn 0.4s ease; }
        .eq-cell.c-var { align-items:flex-end; }
        .eq-cell.c-const, .eq-cell.c-rhs { align-items:flex-start; }
        @keyframes eqIn { from{opacity:0; transform:translateY(-8px);} to{opacity:1; transform:none;} }
        .eq-g { font-family:Georgia, "Times New Roman", serif; font-weight:700; font-size:clamp(2.5rem,7.5vw,4.4rem); line-height:1.06; white-space:nowrap; }
        .eq-coef { color:#2456b8; }
        .eq-x { color:#0c7268; font-style:italic; padding-right:2px; }
        .eq-const { color:#c2410c; }
        .eq-equals { color:var(--bdb-ink); }
        .eq-rhs { color:#6d28d9; }
        .eq-zero { color:var(--bdb-ink-faint); }
        .eq-faded { opacity:0.45; }
        .eq-term { display:inline-flex; align-items:baseline; }

        .eq-tap { cursor:pointer; border-radius:14px; padding:0 6px; transition:background 130ms, box-shadow 130ms; }
        .eq-tap:hover { background:color-mix(in srgb, var(--bdb-amber) 22%, transparent); }
        .eq-tap-x { box-shadow:0 0 0 0 transparent; }
        .eq-wrongglyph { background:color-mix(in srgb, #ef4444 16%, transparent); box-shadow:0 0 0 3px color-mix(in srgb, #ef4444 45%, transparent); border-radius:14px; }
        .eq-hitglyph { background:color-mix(in srgb, var(--bdb-green) 18%, transparent); box-shadow:0 0 0 3px color-mix(in srgb, var(--bdb-green) 55%, transparent); border-radius:14px; }

        .eq-under { font-family:Georgia, "Times New Roman", serif; font-weight:700; font-size:clamp(1.5rem,4.2vw,2.5rem); color:var(--bdb-coral); white-space:nowrap; }
        .eq-drop { animation:eqDropIn 0.7s cubic-bezier(0.2,1.4,0.4,1); }
        @keyframes eqDropIn { from{opacity:0; transform:translateY(-46px) scale(0.7);} 60%{opacity:1;} to{opacity:1; transform:none;} }
        .eq-rule { grid-column:1 / -1; height:0; border-top:4px solid var(--bdb-ink); border-radius:2px; margin:2px 0; animation:eqRule 0.5s ease; }
        @keyframes eqRule { from{opacity:0; transform:scaleX(0.1);} to{opacity:1; transform:scaleX(1);} }

        .eq-pullable { cursor:grab; touch-action:none; border-radius:16px; padding:2px 8px; background:color-mix(in srgb, var(--bdb-teal) 14%, transparent); box-shadow:0 0 0 3px color-mix(in srgb, var(--bdb-teal) 45%, transparent); animation:eqPulse 1.1s ease-in-out infinite; user-select:none; }
        .eq-pullable:active, .eq-dragging { cursor:grabbing; }
        .eq-slot { min-width:clamp(90px,16vw,150px); min-height:clamp(52px,9vw,84px); border:3px dashed var(--bdb-ink-faint); border-radius:16px; display:grid; place-items:center; color:var(--bdb-ink-faint); font-weight:700; font-size:0.82rem; letter-spacing:0.04em; text-transform:uppercase; }
        .eq-slot-hot { border-color:var(--bdb-teal); color:var(--bdb-teal); background:color-mix(in srgb, var(--bdb-teal) 8%, transparent); }
        .eq-landed { animation:eqDropIn 0.5s cubic-bezier(0.2,1.4,0.4,1); }
        .eq-ghost { position:fixed; z-index:60; pointer-events:none; transform:translate(-50%,-50%) scale(0.92); opacity:0.9; }

        .eq-input { font-family:Georgia, "Times New Roman", serif; font-weight:700; font-size:clamp(1.7rem,4.6vw,2.7rem); text-align:center; width:clamp(84px,14vw,130px); padding:6px 8px; border-radius:14px; border:3px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink); outline:none; }
        .eq-input:focus { border-color:var(--bdb-teal); }
        .eq-input.ok { border-color:var(--bdb-green); background:color-mix(in srgb, var(--bdb-green) 10%, white); color:var(--bdb-green); }
        .eq-input.bad { border-color:#ef4444; background:color-mix(in srgb, #ef4444 8%, white); animation:eqShake 0.35s ease; }
        .eq-input:disabled { opacity:0.45; }
        @keyframes eqShake { 25%{transform:translateX(-5px);} 75%{transform:translateX(5px);} }
        .eq-input::-webkit-outer-spin-button, .eq-input::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
        .eq-input[type=number] { -moz-appearance:textfield; appearance:textfield; }

        /* ── prompts, choices, feedback ── */
        .eqb-q { font-size:clamp(1.06rem,2.6vw,1.4rem); font-weight:700; text-align:center; color:var(--bdb-ink); min-height:1.3em; margin:0; }
        .eqb-choices { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; max-width:720px; }
        .eqb-choice { font-size:1.02rem; font-weight:700; color:var(--bdb-ink); background:var(--bdb-card); border:2px solid var(--bdb-line); border-radius:14px; padding:13px 22px; cursor:pointer; transition:transform 120ms ease, border-color 140ms, background 140ms; }
        .eqb-choice:hover { transform:translateY(-1px); border-color:var(--bdb-teal); }
        .eqb-choice.wrong { background:color-mix(in srgb, #ef4444 14%, white); border-color:#ef4444; color:#b91c1c; transform:none; cursor:default; }
        .eqb-choice.right { background:color-mix(in srgb, var(--bdb-green) 16%, white); border-color:var(--bdb-green); color:#166534; }
        .eqb-feedback { font-size:0.96rem; font-weight:600; color:var(--bdb-ink-soft); text-align:center; min-height:1.2em; margin:0; }
        .eqb-hint { background:color-mix(in srgb, var(--bdb-amber) 16%, white); border:1px solid color-mix(in srgb, var(--bdb-amber) 40%, white); color:#8a5a0b; border-radius:12px; padding:11px 16px; font-weight:600; font-size:0.93rem; max-width:560px; text-align:center; }

        /* start button — pulses like it's floating above the page */
        .eqb-start { font-size:1.3rem; font-weight:800; color:#fff; background:var(--bdb-coral); border:none; border-radius:16px; padding:17px 46px; cursor:pointer; box-shadow:0 14px 30px -10px color-mix(in srgb, var(--bdb-coral) 75%, transparent); animation:eqbFloat 1.5s ease-in-out infinite; }
        @keyframes eqbFloat {
          0%,100% { transform:translateY(0) scale(1); box-shadow:0 14px 30px -10px color-mix(in srgb, var(--bdb-coral) 75%, transparent); }
          50% { transform:translateY(-5px) scale(1.035); box-shadow:0 24px 42px -12px color-mix(in srgb, var(--bdb-coral) 85%, transparent); }
        }
        @keyframes eqPulse { 50%{ box-shadow:0 0 0 8px color-mix(in srgb, var(--bdb-teal) 18%, transparent); } }

        /* ── goal popup: zooms out of the middle toward you ── */
        .eqb-modal { position:fixed; inset:0; background:rgba(32,30,26,0.5); display:grid; place-items:center; z-index:40; padding:20px; animation:eqbFade 0.25s ease; }
        @keyframes eqbFade { from{opacity:0;} }
        .eqb-modal-card { background:var(--bdb-card); border-radius:20px; padding:28px 30px; max-width:540px; width:100%; display:grid; gap:16px; box-shadow:var(--bdb-shadow-lg); animation:eqbZoom 0.45s cubic-bezier(0.2,1.3,0.4,1); }
        @keyframes eqbZoom { from{opacity:0; transform:scale(0.25);} to{opacity:1; transform:scale(1);} }
        .eqb-goal-input { font:inherit; font-weight:600; font-size:1.06rem; padding:13px 16px; border-radius:12px; border:2px solid var(--bdb-line); outline:none; width:100%; box-sizing:border-box; }
        .eqb-goal-input:focus { border-color:var(--bdb-teal); }

        /* ── celebration ── */
        .eqb-celebrate { display:grid; justify-items:center; gap:12px; text-align:center; }
        .eqb-solved-eq { font-family:Georgia, "Times New Roman", serif; font-size:clamp(2.6rem,8vw,4.6rem); font-weight:700; color:var(--bdb-green); animation:eqDropIn 0.6s cubic-bezier(0.2,1.4,0.4,1); }
        .eqb-cheer { font-size:1.12rem; font-weight:700; color:var(--bdb-ink); }
        .eqb-confetti { position:fixed; inset:0; pointer-events:none; overflow:hidden; z-index:50; }
        .eqb-cf { position:absolute; top:-14px; width:10px; height:16px; border-radius:3px; animation:eqbFall 1.8s ease-in forwards; }
        @keyframes eqbFall { to { transform:translateY(105vh) translateX(var(--drift)) rotate(560deg); opacity:0.8; } }
      `}</style>

      <div className="eqb-strip">
        <div className="eqb-seg" role="group" aria-label="Equation type">
          <button className={steps === "one" ? "on" : ""} onClick={() => saveSteps("one")}>1-step</button>
          <button className={steps === "two" ? "on" : ""} onClick={() => saveSteps("two")}>2-step</button>
          <button className={steps === "mix" ? "on" : ""} onClick={() => saveSteps("mix")}>Mix</button>
        </div>
        <div className="eqb-streak" title="Equations solved this session">⭐ <b>{streak}</b> in a row</div>
        <div className="eqb-seg lvl" role="group" aria-label="Difficulty">
          <button className={level === "regular" ? "on" : ""} onClick={() => saveLevel("regular")}>Regular</button>
          <button className={level === "levelup" ? "on" : ""} onClick={() => saveLevel("levelup")}>Level Up!</button>
        </div>
        <button className="eqb-new" onClick={() => freshQuestion()}>↻ New equation</button>
      </div>

      <main className="eqb-main">
        <LiveToolBanner tool={liveTool} />

        <div className="eq-work">{renderWorked()}</div>

        {phase === "idle" && (
          <>
            <button className="eqb-start" onClick={startSolving}>Start solving →</button>
            <p className="eqb-feedback">Isolate the variable, step by step. Every solve adds to your count.</p>
          </>
        )}

        {phase === "goal" && (
          <div className="eqb-modal">
            <div className="eqb-modal-card">
              <p className="eqb-q">First — what is your goal when solving an equation?</p>
              {level === "regular" ? (
                <div className="eqb-choices" style={{ flexDirection: "column", display: "flex" }}>
                  {GOAL_CHOICES.map((g, i) => (
                    <button
                      key={i}
                      className={`eqb-choice${goalWrong.has(i) ? " wrong" : ""}${goalHit === i ? " right" : ""}`}
                      onClick={() => pickGoal(i)}
                      disabled={goalWrong.has(i)}
                    >{g.label}</button>
                  ))}
                </div>
              ) : (
                <>
                  <input
                    className="eqb-goal-input" autoFocus placeholder="Type your answer…"
                    value={goalText} onChange={(e) => setGoalText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submitGoalText(); }}
                  />
                  <button className="eqb-choice" onClick={submitGoalText}>Check →</button>
                </>
              )}
              {feedback && <p className="eqb-feedback">{feedback}</p>}
            </div>
          </div>
        )}

        {(phase === "tap-var" || phase === "move" || phase === "anim" || phase === "pull" || phase === "write") && (
          <>
            <p className="eqb-q">{feedback}</p>
            {phase === "move" && (
              <div className="eqb-choices">
                {moves.map((m, i) => (
                  <button
                    key={i}
                    className={`eqb-choice${moveWrong.has(i) ? " wrong" : ""}${moveHit === i ? " right" : ""}`}
                    onClick={() => pickMove(i)}
                    disabled={moveWrong.has(i)}
                  >{m.label}</button>
                ))}
              </div>
            )}
            {hint && <div className="eqb-hint">{hint}</div>}
          </>
        )}

        {phase === "celebrate" && solvedX !== null && (
          <div className="eqb-celebrate">
            <div className="eqb-solved-eq">x = {solvedX}</div>
            <p className="eqb-cheer">The variable is isolated! Ready for another? Let&apos;s see how many you can do in a row.</p>
            <button className="eqb-start" onClick={() => freshQuestion()}>Next equation →</button>
          </div>
        )}
      </main>

      {drag && (
        <span className="eq-ghost" style={{ left: drag.x, top: drag.y }}>
          <span className="eq-term">{cur.coef !== 1 && <span className="eq-g eq-coef">{cur.coef}</span>}<span className="eq-g eq-x">x</span></span>
        </span>
      )}

      {confetti.length > 0 && (
        <div className="eqb-confetti" aria-hidden>
          {confetti.map((c, i) => (
            <span
              key={i}
              className="eqb-cf"
              style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, background: `hsl(${c.hue} 85% 60%)`, ["--drift" as string]: `${c.drift}px` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
