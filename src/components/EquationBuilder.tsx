"use client";

// Guided Equation Builder & Solver — student-facing solving reps.
// Equations generate themselves (one-step only — x ± b = c, ax = c, x/a = c;
// on Level Up! the variable can sit on either side); the picking engine is not
// student-facing. A teacher can still deploy a specific problem through Live
// Flow and it loads here automatically. The student states the goal,
// identifies the actual variable (not the coefficient), picks the first move,
// watches the inverse drop onto both sides above a horizontal line, sees the
// zero pair make 0 and vanish while the variable term drops to the next line,
// and computes the other side themselves — then celebrates and rolls straight
// into the next one, with a running "in a row" session count.

import { useCallback, useEffect, useRef, useState } from "react";
import { reportToolResult } from "@/lib/toolEvidence";
import { LiveToolBanner, useLiveToolConfig } from "./useLiveToolConfig";

type Phase = "idle" | "goal" | "tap-var" | "move" | "anim" | "zero" | "write" | "celebrate";
type Level = "regular" | "levelup";
interface Line { coef: number; constant: number; rhs: number; div?: number; flip?: boolean; zeroed?: boolean; opAfter?: PendingOp }
type PendingOp = { kind: "cancel" | "divide" | "times"; val: number };
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

// One-step equations only (x ± b = c, ax = c, or x/a = c) — two-step is 7th
// grade. The solve engine still handles a teacher-deployed two-step problem.
function genProblem(levelUp = false): Line {
  // On Level Up! the variable can live on either side of the equals sign.
  const flip = levelUp && Math.random() < 0.5;
  const roll = Math.random();
  if (roll < 0.4) {
    const b = (Math.random() < 0.5 ? 1 : -1) * ri(2, 9);
    const x = b < 0 ? ri(-b + 1, 14) : ri(1, 12);
    return { coef: 1, constant: b, rhs: x + b, flip };
  }
  if (roll < 0.7) {
    const a = ri(2, 9); const x = ri(2, 12);
    return { coef: a, constant: 0, rhs: a * x, flip };
  }
  const a = ri(2, 9); const q = ri(2, 12);
  return { coef: 1, constant: 0, div: a, rhs: q, flip };
}

function stepOf(l: Line): "cancel" | "divide" | "times" | "done" {
  if (l.constant !== 0) return "cancel";
  if ((l.div ?? 1) > 1) return "times";
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
  if (s === "times") {
    const a = l.div!;
    return shuffle([
      { label: `Multiply both sides by ${a}`, correct: true },
      { label: `Divide both sides by ${a}`, correct: false },
      { label: `Add ${a} to both sides`, correct: false },
      { label: `Multiply both sides by ${Math.abs(l.rhs)}`, correct: false },
    ]);
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

  // identify the variable
  const [tapWrong, setTapWrong] = useState<Set<string>>(new Set());
  const [tapHit, setTapHit] = useState(false);
  const [varFound, setVarFound] = useState(false);

  // level-switch acknowledgement
  const [levelFx, setLevelFx] = useState<Level | null>(null);
  const levelFxTimer = useRef<number | null>(null);

  // first-move question
  const [moves, setMoves] = useState<MoveChoice[]>([]);
  const [moveWrong, setMoveWrong] = useState<Set<number>>(new Set());
  const [moveHit, setMoveHit] = useState<number | null>(null);

  // write-in for the side the student computes
  const [rhsInput, setRhsInput] = useState("");
  const [rhsOk, setRhsOk] = useState<"idle" | "ok" | "bad">("idle");

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
    let lvl: Level = "regular";
    try {
      const l = localStorage.getItem("eqb-level"); if (l === "regular" || l === "levelup") lvl = l;
    } catch { /* ignore */ }
    setLevel(lvl);
    setLines([genProblem(lvl === "levelup")]);
  }, []);
  function saveLevel(l: Level) {
    if (l === level) return;
    setLevel(l);
    try { localStorage.setItem("eqb-level", l); } catch { /* ignore */ }
    // acknowledge the switch: little fanfare + floating badge
    tone(l === "levelup" ? [392, 523, 659, 784] : [659, 523], 0.09, 0.18);
    setLevelFx(l);
    if (levelFxTimer.current) window.clearTimeout(levelFxTimer.current);
    levelFxTimer.current = window.setTimeout(() => setLevelFx(null), 1500);
    // a fresh problem picks up the new level's rules (e.g. x on either side)
    if (phase === "idle") { resetQuestionState(); setLines([genProblem(l === "levelup")]); }
  }

  // A teacher-deployed problem replaces the generated one.
  useEffect(() => {
    if (!liveTool || liveTool.route !== "/equation-builder") return;
    const { coefficient, constant, solution } = liveTool.config;
    freshQuestion({ coef: coefficient, constant, rhs: coefficient * solution + constant });
  }, [liveTool?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Evidence: one report per solved equation (only fires inside a live session).
  useEffect(() => {
    if (phase !== "celebrate") return;
    const l = lines[lines.length - 1];
    const pid = l.div ? `x/${l.div}=${l.rhs}` : `${l.coef > 1 ? l.coef : ""}x${l.constant !== 0 ? (l.constant > 0 ? `+${l.constant}` : l.constant) : ""}=${l.rhs}`;
    const wrong = goalWrong.size + tapWrong.size + moveWrong.size;
    reportToolResult({ tool: "equation-builder", correct: wrong === 0, problemId: pid });
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function resetQuestionState() {
    setPendingOp(null); setFeedback(""); setHint(null);
    setGoalWrong(new Set()); setGoalHit(null); setGoalText(""); setGoalTries(0);
    setTapWrong(new Set()); setTapHit(false); setVarFound(false);
    setMoves([]); setMoveWrong(new Set()); setMoveHit(null);
    setRhsInput(""); setRhsOk("idle");
    setConfetti([]);
  }
  function freshQuestion(problem?: Line) {
    resetQuestionState();
    setLines([problem ?? genProblem(level === "levelup")]);
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
      window.setTimeout(() => { setPhase("tap-var"); setFeedback("Identify the variable."); }, 650);
    } else {
      sWrong();
      setGoalWrong((w) => new Set(w).add(i));
    }
  }
  function submitGoalText() {
    if (goalTextOk(goalText)) {
      setGoalHit(0); sCorrect();
      window.setTimeout(() => { setPhase("tap-var"); setFeedback("Identify the variable."); }, 650);
    } else {
      sWrong(); setGoalTries((t) => t + 1);
      setFeedback(goalTries >= 2 ? "Hint: it starts with “isolate…” — what do you want to happen to the variable?" : "Not quite — what do you want the variable to end up like?");
    }
  }

  // ── tap the variable itself ──
  function tapPart(part: "coef" | "const" | "rhs" | "div" | "x") {
    if (phase !== "tap-var" || tapHit) return;
    if (part === "x") {
      setTapHit(true); setVarFound(true); sCorrect();
      window.setTimeout(() => {
        setTapWrong(new Set());
        beginMove("What is the first move I can make to isolate the variable?");
      }, 600);
      return;
    }
    sWrong();
    setTapWrong((w) => new Set(w).add(part));
    setFeedback(part === "coef"
      ? "No — that's a coefficient. Remember: a variable is always a symbol, not a number. Try again."
      : part === "div"
      ? "No — that's a divisor. Remember: a variable is always a symbol, not a number. Try again."
      : "No — that's a constant. Remember: a variable is always a symbol, not a number. Try again.");
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
      const s = stepOf(l);
      const op: PendingOp = s === "cancel" ? { kind: "cancel", val: l.constant }
        : s === "times" ? { kind: "times", val: l.div! }
        : { kind: "divide", val: l.coef };
      window.setTimeout(() => {
        setPendingOp(op); setPhase("anim"); sDrop();
        setFeedback(op.kind === "cancel" ? "The inverse drops onto BOTH sides…" : op.kind === "times" ? "Multiply both sides…" : "Divide both sides…");
        window.setTimeout(() => {
          if (op.kind === "cancel") {
            // show the zero pair making 0, let it vanish, then auto-drop the
            // variable term to the next line — the student computes the other side
            setPhase("zero");
            setFeedback(`${sign(l.constant)}${Math.abs(l.constant)} and ${sign(-l.constant)}${Math.abs(l.constant)} make a zero pair — that's 0!`);
            window.setTimeout(() => {
              setLines((ls) => [...ls.slice(0, -1), { ...ls[ls.length - 1], zeroed: true }]);
              sDrop();
              setPhase("write"); setFeedback("It vanishes — now do the math on the other side.");
            }, 1500);
          }
          else if (op.kind === "times") { setPhase("write"); setFeedback("The divisor cancels — now compute the other side."); }
          else { setPhase("write"); setFeedback("The coefficient cancels — now compute the other side."); }
        }, 1100);
      }, 550);
    } else {
      sWrong();
      setMoveWrong((w) => {
        const nw = new Set(w).add(i);
        if (nw.size >= 2) {
          const s = stepOf(l);
          setHint(s === "cancel"
            ? `The constant is ${sign(l.constant)}${Math.abs(l.constant)}. Undo it with the OPPOSITE operation — on both sides.`
            : s === "times"
            ? `x is divided by ${l.div}. Undo division with its inverse.`
            : `x is multiplied by ${l.coef}. Undo multiplication with its inverse.`);
        }
        return nw;
      });
    }
  }

  // ── write the result on the side the student computes ──
  const rhsExpected = pendingOp?.kind === "cancel" ? cur.rhs - cur.constant
    : pendingOp?.kind === "times" ? cur.rhs * pendingOp.val
    : pendingOp ? cur.rhs / pendingOp.val : 0;

  function checkRhs() {
    if (rhsInput.trim() === "") return;
    if (Number(rhsInput) === rhsExpected) { setRhsOk("ok"); sCorrect(); }
    else {
      setRhsOk("bad"); sWrong();
      setFeedback(pendingOp?.kind === "cancel"
        ? `Recompute ${cur.rhs} ${sign(-cur.constant)} ${Math.abs(cur.constant)}.`
        : pendingOp?.kind === "times"
        ? `Recompute ${cur.rhs} × ${pendingOp.val}.`
        : `Recompute ${cur.rhs} ÷ ${pendingOp?.val}.`);
    }
  }
  useEffect(() => {
    if (phase !== "write" || !pendingOp || rhsOk !== "ok") return;
    const t = window.setTimeout(() => {
      const next: Line = pendingOp.kind === "cancel"
        ? { coef: cur.coef, div: cur.div, constant: 0, rhs: rhsExpected, flip: cur.flip }
        : { coef: 1, constant: 0, rhs: rhsExpected, flip: cur.flip };
      // keep the inverse annotations + rule on the finished line, like paper
      setLines((l) => [...l.slice(0, -1), { ...l[l.length - 1], opAfter: pendingOp }, next]);
      setPendingOp(null);
      setRhsInput(""); setRhsOk("idle");
      if (stepOf(next) === "done") {
        setPhase("celebrate"); setFeedback(""); sSolved();
        setStreak((s) => s + 1);
        setConfetti(Array.from({ length: 26 }, () => ({ left: ri(2, 98), delay: Math.random() * 0.5, hue: ri(0, 360), drift: ri(-80, 80) })));
      } else {
        beginMove("The constant is gone. What's the next move to isolate the variable?", next);
      }
    }, 550);
    return () => window.clearTimeout(t);
  }, [phase, pendingOp, rhsOk]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── glyph renderers (big squared-off characters — no boxes) ──
  function varTerm(l: Line, opts: { tapZone?: boolean; pullable?: boolean; faded?: boolean } = {}) {
    const xEl = (
      <span
        className={`eq-g eq-x${opts.tapZone ? " eq-tap eq-tap-x" : ""}`}
        onClick={opts.tapZone ? () => tapPart("x") : undefined}
      >x</span>
    );
    let inner: React.ReactNode;
    if ((l.div ?? 1) > 1) {
      inner = (
        <span className="eq-frac">
          {xEl}
          <span className="eq-fracbar" />
          <span
            className={`eq-g eq-coef${opts.tapZone ? " eq-tap" : ""}${opts.tapZone && tapWrong.has("div") ? " eq-wrongglyph" : ""}`}
            onClick={opts.tapZone ? () => tapPart("div") : undefined}
          >{l.div}</span>
        </span>
      );
    } else {
      const coefEl = l.coef !== 1 && (
        <span
          className={`eq-g eq-coef${opts.tapZone ? " eq-tap" : ""}${opts.tapZone && tapWrong.has("coef") ? " eq-wrongglyph" : ""}`}
          onClick={opts.tapZone ? () => tapPart("coef") : undefined}
        >{l.coef}</span>
      );
      inner = <>{coefEl}{xEl}</>;
    }
    return <span className={`eq-term${opts.faded ? " eq-faded" : ""}`}>{inner}</span>;
  }

  function renderWorked() {
    const out: React.ReactNode[] = [];
    lines.forEach((l, i) => {
      const isLast = i === lines.length - 1;
      const liveOp = isLast && pendingOp && (phase === "anim" || phase === "zero" || phase === "write") ? pendingOp : null;
      const shownOp = liveOp ?? l.opAfter ?? null;

      const flip = !!l.flip;
      // in the fraction form, drop the = and the other side to the bar's level
      const fshift = (l.div ?? 1) > 1 ? " eq-fshift" : "";
      const pushRow = (varCell: React.ReactNode, constCell: React.ReactNode, eqCell: React.ReactNode, rhsCell: React.ReactNode) => {
        if (flip) out.push(rhsCell, eqCell, varCell, constCell);
        else out.push(varCell, constCell, eqCell, rhsCell);
      };

      pushRow(
        <div className="eq-cell c-var" key={`v${i}`}>
          {varTerm(l, { tapZone: isLast && phase === "tap-var" })}
          {shownOp?.kind === "divide" && <span className="eq-under eq-drop">÷ {shownOp.val}</span>}
          {shownOp?.kind === "times" && <span className="eq-under eq-drop">× {shownOp.val}</span>}
        </div>,
        <div className="eq-cell c-const" key={`c${i}`}>
          {l.constant !== 0 && (
            <span className={`eq-zwrap${l.zeroed ? " eq-vanish" : ""}`}>
              <span
                className={`eq-g eq-const${isLast && phase === "tap-var" ? " eq-tap" : ""}${tapWrong.has("const") && isLast ? " eq-wrongglyph" : ""}`}
                onClick={isLast && phase === "tap-var" ? () => tapPart("const") : undefined}
              >{sign(l.constant)} {Math.abs(l.constant)}</span>
              {shownOp?.kind === "cancel" && <span className="eq-under eq-drop">{sign(-shownOp.val)} {Math.abs(shownOp.val)}</span>}
              {isLast && phase === "zero" && <span className="eq-zeropop">= 0</span>}
            </span>
          )}
        </div>,
        <div className="eq-cell c-eq" key={`e${i}`}><span className={`eq-g eq-equals${fshift}`}>=</span></div>,
        <div className="eq-cell c-rhs" key={`r${i}`}>
          <span
            className={`eq-g eq-rhs${fshift}${isLast && phase === "tap-var" ? " eq-tap" : ""}${tapWrong.has("rhs") && isLast ? " eq-wrongglyph" : ""}`}
            onClick={isLast && phase === "tap-var" ? () => tapPart("rhs") : undefined}
          >{l.rhs}</span>
          {shownOp && (
            <span className="eq-under eq-drop">
              {shownOp.kind === "cancel" ? `${sign(-shownOp.val)} ${Math.abs(shownOp.val)}` : shownOp.kind === "times" ? `× ${shownOp.val}` : `÷ ${shownOp.val}`}
            </span>
          )}
        </div>
      );

      if (shownOp) out.push(<div className="eq-rule" key={`hr${i}`} />);
      if (liveOp) {
        // pending next line
        const rhsInputCell = (disabled: boolean) => (
          <div className="eq-cell c-rhs" key={`pr${i}`}>
            <input
              className={`eq-input${rhsOk === "ok" ? " ok" : rhsOk === "bad" ? " bad" : ""}`}
              type="number" inputMode="numeric" placeholder="?" disabled={disabled || rhsOk === "ok"}
              value={rhsInput}
              onChange={(e) => { setRhsInput(e.target.value); setRhsOk("idle"); }}
              onBlur={checkRhs}
              onKeyDown={(e) => { if (e.key === "Enter") checkRhs(); }}
              aria-label="Compute the other side"
            />
          </div>
        );
        if (phase === "write") {
          // the variable term drops down to the next line by itself; the
          // student computes the other side
          pushRow(
            <div className="eq-cell c-var" key={`pv${i}`}>
              <span className="eq-term eq-landed">
                {liveOp.kind === "cancel" && cur.coef !== 1 && <span className="eq-g eq-coef">{cur.coef}</span>}
                <span className="eq-g eq-x">x</span>
              </span>
            </div>,
            <div className="eq-cell c-const" key={`pc${i}`} />,
            <div className="eq-cell c-eq" key={`pe${i}`}><span className="eq-g eq-equals eq-faded">=</span></div>,
            rhsInputCell(false)
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
        .eqb-lvlwrap { position:relative; display:inline-flex; }
        .eqb-seg.bump { animation:eqbBump 0.5s cubic-bezier(0.2,1.6,0.4,1); }
        @keyframes eqbBump { 35%{ transform:scale(1.12); } }
        .eqb-lvlfx { position:absolute; left:50%; top:calc(100% + 6px); transform:translateX(-50%); white-space:nowrap; font-weight:800; font-size:0.8rem; background:var(--bdb-ink); color:#fff; border-radius:999px; padding:6px 14px; z-index:30; pointer-events:none; animation:eqbFxPop 1.5s ease forwards; }
        .eqb-lvlfx.up { background:var(--bdb-coral); }
        @keyframes eqbFxPop { 0%{opacity:0; transform:translateX(-50%) translateY(-6px) scale(0.5);} 18%{opacity:1; transform:translateX(-50%) translateY(0) scale(1.08);} 30%{transform:translateX(-50%) scale(1);} 80%{opacity:1;} 100%{opacity:0; transform:translateX(-50%) translateY(8px);} }

        /* inverse-operations key — always a box pinned on the left, the
           + ↔ − pair stacked on top of the × ↔ ÷ pair */
        .eqb-key { position:fixed; left:clamp(8px,1.6vw,26px); top:50%; transform:translateY(-50%); z-index:10; background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:16px; padding:14px 16px; box-shadow:var(--bdb-shadow-sm); display:grid; gap:10px; justify-items:center; }
        .eqb-key-title { font-size:0.68rem; font-weight:800; letter-spacing:0.09em; text-transform:uppercase; color:var(--bdb-ink-faint); max-width:110px; text-align:center; }
        .eqb-key-row { display:flex; align-items:center; gap:10px; font-family:var(--bdb-font); font-weight:800; font-size:1.5rem; color:var(--bdb-ink); }
        .eqb-key-row .arr { color:var(--bdb-coral); font-size:1.2rem; }
        @media (max-width:820px) { .eqb-key { padding:10px; gap:6px; } .eqb-key-row { font-size:1.1rem; gap:7px; } .eqb-key-title { font-size:0.58rem; max-width:80px; } }
        .eqb-streak { margin-left:auto; margin-right:auto; display:inline-flex; align-items:center; gap:8px; font-weight:800; font-size:1.02rem; background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:999px; padding:8px 18px; box-shadow:var(--bdb-shadow-sm); }
        .eqb-streak b { color:var(--bdb-coral); font-size:1.2rem; }
        .eqb-new { font-size:0.84rem; font-weight:600; color:var(--bdb-ink-soft); background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:999px; padding:8px 14px; cursor:pointer; }
        .eqb-new:hover { border-color:var(--bdb-ink-faint); color:var(--bdb-ink); }

        .eqb-main { flex:1; padding:clamp(18px,3vw,34px); display:flex; flex-direction:column; gap:clamp(14px,2.4vw,22px); align-items:center; max-width:980px; margin:0 auto; width:100%; box-sizing:border-box; }

        /* ── the equation: big, serif, colored characters ── */
        /* column-gap stays 0 so an empty constant column takes no width —
           spacing comes from the = sign and from non-empty constant content */
        .eq-work { display:grid; grid-template-columns:minmax(0,auto) minmax(0,auto) auto minmax(0,auto); align-items:start; column-gap:0; row-gap:clamp(10px,2vw,18px); justify-content:center; margin-top:clamp(14px,3vh,34px); }
        .eq-work.roomy { margin-top:clamp(24px,7vh,64px); }
        .eq-cell.c-eq { margin:0 clamp(10px,2.2vw,20px); }
        .eq-cell.c-const > * { margin-left:clamp(10px,2.2vw,20px); }
        .eq-work.flip .c-var { align-items:flex-start; }
        .eq-work.flip .c-rhs { align-items:flex-end; }
        .eq-cell { display:flex; flex-direction:column; align-items:center; gap:4px; min-height:1px; animation:eqIn 0.4s ease; }
        .eq-cell.c-var { align-items:flex-end; }
        .eq-cell.c-const, .eq-cell.c-rhs { align-items:flex-start; }
        @keyframes eqIn { from{opacity:0; transform:translateY(-8px);} to{opacity:1; transform:none;} }
        .eq-g { font-family:var(--bdb-font); font-weight:800; font-size:clamp(3.4rem,10vw,6.6rem); line-height:1.06; white-space:nowrap; }
        .eq-coef, .eq-const, .eq-equals, .eq-rhs { color:var(--bdb-ink); }
        .eq-x { color:var(--bdb-ink); font-style:italic; padding-right:2px; border-radius:10px; }
        /* once the student identifies the variable it stays highlighted, like a highlighter */
        .eq-found .eq-x { background:color-mix(in srgb, var(--bdb-amber) 55%, white); box-shadow:0 0 0 2px color-mix(in srgb, var(--bdb-amber) 70%, white); padding:0 6px; }
        .eq-zero { color:var(--bdb-ink-faint); }
        .eq-faded { opacity:0.45; }
        .eq-fshift { padding-top:0.57em; }
        .eq-term { display:inline-flex; align-items:baseline; }

        .eq-tap { cursor:pointer; border-radius:14px; padding:0 6px; transition:background 130ms, box-shadow 130ms; }
        .eq-tap:hover { background:color-mix(in srgb, var(--bdb-amber) 22%, transparent); }
        .eq-tap-x { box-shadow:0 0 0 0 transparent; }
        .eq-wrongglyph { background:color-mix(in srgb, #ef4444 16%, transparent); box-shadow:0 0 0 3px color-mix(in srgb, #ef4444 45%, transparent); border-radius:14px; }

        .eq-under { font-family:var(--bdb-font); font-weight:700; font-size:clamp(2rem,5.6vw,3.4rem); color:var(--bdb-coral); white-space:nowrap; }
        .eq-drop { animation:eqDropIn 0.7s cubic-bezier(0.2,1.4,0.4,1); }
        @keyframes eqDropIn { from{opacity:0; transform:translateY(-46px) scale(0.7);} 60%{opacity:1;} to{opacity:1; transform:none;} }
        .eq-rule { grid-column:1 / -1; height:0; border-top:4px solid var(--bdb-ink); border-radius:2px; margin:2px 0; animation:eqRule 0.5s ease; }
        @keyframes eqRule { from{opacity:0; transform:scaleX(0.1);} to{opacity:1; transform:scaleX(1);} }

        /* x over a divisor, rendered as a stacked fraction */
        .eq-frac { display:inline-flex; flex-direction:column; align-items:center; gap:2px; }
        .eq-fracbar { height:5px; min-width:60px; width:100%; background:var(--bdb-ink); border-radius:3px; }

        .eq-landed { animation:eqDropIn 0.5s cubic-bezier(0.2,1.4,0.4,1); }

        /* the zero pair announces "= 0", then the whole stack vanishes */
        .eq-zwrap { display:flex; flex-direction:column; align-items:center; gap:4px; }
        .eq-vanish { animation:eqVanish 0.6s ease forwards; }
        @keyframes eqVanish { to { opacity:0; transform:scale(0.7); } }
        .eq-zeropop { font-family:var(--bdb-font); font-weight:700; font-size:clamp(1.3rem,3.4vw,2rem); color:var(--bdb-green); background:color-mix(in srgb, var(--bdb-green) 14%, white); border:3px solid var(--bdb-green); border-radius:14px; padding:2px 14px; animation:eqZeroPop 0.55s cubic-bezier(0.2,1.5,0.4,1); }
        @keyframes eqZeroPop { from { opacity:0; transform:scale(0.2); } to { opacity:1; transform:scale(1); } }

        .eq-input { font-family:var(--bdb-font); font-weight:700; font-size:clamp(2.2rem,6vw,3.6rem); text-align:center; width:clamp(110px,18vw,180px); padding:6px 8px; border-radius:16px; border:3px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink); outline:none; }
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

        /* ── goal popup: zooms out of the middle toward you ── */
        .eqb-modal { position:fixed; inset:0; background:rgba(32,30,26,0.5); display:grid; place-items:center; z-index:40; padding:20px; animation:eqbFade 0.25s ease; }
        @keyframes eqbFade { from{opacity:0;} }
        .eqb-modal-card { background:var(--bdb-card); border-radius:20px; padding:28px 30px; max-width:540px; width:100%; display:grid; gap:16px; box-shadow:var(--bdb-shadow-lg); animation:eqbZoom 0.45s cubic-bezier(0.2,1.3,0.4,1); }
        @keyframes eqbZoom { from{opacity:0; transform:scale(0.25);} to{opacity:1; transform:scale(1);} }
        .eqb-goal-input { font:inherit; font-weight:600; font-size:1.06rem; padding:13px 16px; border-radius:12px; border:2px solid var(--bdb-line); outline:none; width:100%; box-sizing:border-box; }
        .eqb-goal-input:focus { border-color:var(--bdb-teal); }

        /* ── celebration ── */
        .eqb-celebrate { display:grid; justify-items:center; gap:12px; text-align:center; }
        .eqb-solved-eq { font-family:var(--bdb-font); font-size:clamp(3.2rem,10vw,6rem); font-weight:800; color:var(--bdb-green); animation:eqDropIn 0.6s cubic-bezier(0.2,1.4,0.4,1); }
        .eqb-cheer { font-size:1.12rem; font-weight:700; color:var(--bdb-ink); }
        .eqb-confetti { position:fixed; inset:0; pointer-events:none; overflow:hidden; z-index:50; }
        .eqb-cf { position:absolute; top:-14px; width:10px; height:16px; border-radius:3px; animation:eqbFall 1.8s ease-in forwards; }
        @keyframes eqbFall { to { transform:translateY(105vh) translateX(var(--drift)) rotate(560deg); opacity:0.8; } }
      `}</style>

      <div className="eqb-strip">
        <div className="eqb-streak" title="Equations solved this session">⭐ <b>{streak}</b> in a row</div>
        <div className="eqb-lvlwrap">
          <div className={`eqb-seg lvl${levelFx ? " bump" : ""}`} role="group" aria-label="Difficulty">
            <button className={level === "regular" ? "on" : ""} onClick={() => saveLevel("regular")}>Regular</button>
            <button className={level === "levelup" ? "on" : ""} onClick={() => saveLevel("levelup")}>Level Up!</button>
          </div>
          {levelFx && (
            <div className={`eqb-lvlfx${levelFx === "levelup" ? " up" : ""}`}>
              {levelFx === "levelup" ? "⬆ Level Up! mode" : "Regular mode"}
            </div>
          )}
        </div>
        <button className="eqb-new" onClick={() => freshQuestion()}>↻ New equation</button>
      </div>

      <main className="eqb-main">
        <LiveToolBanner tool={liveTool} />

        <aside className="eqb-key" aria-label="Inverse operations key">
          <div className="eqb-key-title">Inverse operations</div>
          <div className="eqb-key-row"><span>+</span><span className="arr">↔</span><span>−</span></div>
          <div className="eqb-key-row"><span>×</span><span className="arr">↔</span><span>÷</span></div>
        </aside>

        <div className={`eq-work${varFound ? " eq-found" : ""}${phase === "idle" ? " roomy" : ""}${lines[0]?.flip ? " flip" : ""}`}>{renderWorked()}</div>

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

        {(phase === "tap-var" || phase === "move" || phase === "anim" || phase === "zero" || phase === "write") && (
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
