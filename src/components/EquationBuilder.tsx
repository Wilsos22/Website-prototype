"use client";

// Guided Equation Builder & Solver — aligned worked-solution on a fixed grid.
// Build ax + b = c, then solve. When you subtract (or add) to both sides, the
// opposite value stacks under each side; on the variable side the +b and −b
// form a zero pair that a red box animates over (the boxes STAY, they don't
// vanish); the result then drops one row lower. Columns stay aligned on a grid.

import { useEffect, useRef, useState, useCallback } from "react";
import { reportToolResult } from "@/lib/toolEvidence";
import { LiveToolBanner, useLiveToolConfig } from "./useLiveToolConfig";

type Op = "add" | "subtract" | "multiply" | "divide";
type Phase = "build" | "goal" | "tap-var" | "ask-op" | "ask-term" | "compute" | "animating" | "solved";
interface Eq { coef: number; divisor: number; constant: number; rhs: number }
interface StepOp { kind: "cancel" | "divide" | "multiply"; val: number }
interface Row { eq: Eq; op?: StepOp }

const OP_LABEL: Record<Op, string> = { add: "Add", subtract: "Subtract", multiply: "Multiply", divide: "Divide" };
const PRESETS: [number, number, number][] = [[1, 5, 7], [2, 3, 4], [3, -4, 5], [4, 6, 3], [2, -7, 9]];
const GOAL_CHOICES: { label: string; correct: boolean }[] = [
  { label: "Isolate the variable", correct: true },
  { label: "Make both sides as big as possible", correct: false },
  { label: "Get rid of the equals sign", correct: false },
  { label: "Remove the variable", correct: false },
];

function stepOf(eq: Eq): "constant" | "coefficient" | "divisor" | "done" {
  if (eq.constant !== 0) return "constant";
  if (eq.coef !== 1) return "coefficient";
  if (eq.divisor !== 1) return "divisor";
  return "done";
}
function shuffle<T>(a: T[]): T[] { return [...a].sort(() => Math.random() - 0.5); }
function opSign(v: number): string { return `${v > 0 ? "−" : "+"} ${Math.abs(v)}`; }

export default function EquationBuilder() {
  const liveTool = useLiveToolConfig("/equation-builder");
  const [a, setA] = useState(2);
  const [b, setB] = useState(3);
  const [xAns, setXAns] = useState(4);
  const [varOp, setVarOp] = useState<"×" | "÷">("×");
  const isDiv = varOp === "÷";
  const xUse = isDiv ? Math.max(a, Math.round(xAns / a) * a) : xAns;
  const c = isDiv ? xUse / a + b : a * xUse + b;

  const [phase, setPhase] = useState<Phase>("build");
  const [rows, setRows] = useState<Row[]>([]);
  const [feedback, setFeedback] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [wrong, setWrong] = useState(0);
  const [mode, setMode] = useState<"beginner" | "advanced">("beginner");
  const [pending, setPending] = useState<{ ne: Eq; op: StepOp; expr: string; answer: number } | null>(null);
  const [computeInput, setComputeInput] = useState("");

  const audioRef = useRef<AudioContext | null>(null);
  const eq = rows.length ? rows[rows.length - 1].eq : null;
  const step = eq ? stepOf(eq) : "done";

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
  const sCancel = useCallback(() => tone([700, 500, 320], 0.08, 0.12), [tone]);
  const sSolved = useCallback(() => tone([523, 659, 784, 1047], 0.1, 0.2), [tone]);

  function startSolve() {
    const e: Eq = { coef: isDiv ? 1 : a, divisor: isDiv ? a : 1, constant: b, rhs: c };
    setRows([{ eq: e }]);
    setWrong(0); setHint(null);
    if (stepOf(e) === "done") { setPhase("solved"); sSolved(); }
    else if (mode === "beginner") { setPhase("goal"); setFeedback(""); }
    else { setPhase("ask-op"); setFeedback(askOpText(e)); }
  }
  function loadPreset(p: [number, number, number]) { setVarOp("×"); setA(p[0]); setB(p[1]); setXAns(p[2]); }

  useEffect(() => {
    if (!liveTool || liveTool.route !== "/equation-builder") return;
    setA(liveTool.config.coefficient);
    setB(liveTool.config.constant);
    setXAns(liveTool.config.solution);
    setVarOp("×");
    setPhase("build"); setRows([]); setFeedback(""); setHint(null); setWrong(0);
  }, [liveTool?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Evidence: one report per solved equation (only fires inside a live session).
  useEffect(() => {
    if (phase !== "solved") return;
    reportToolResult({ tool: "equation-builder", correct: wrong === 0, problemId: `${a}${varOp}x+${b}=${c}` });
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickGoal(correct: boolean) {
    if (correct) { sCorrect(); setFeedback(""); setPhase("tap-var"); }
    else { sWrong(); setWrong((w) => w + 1); setFeedback("Not quite — solving an equation means getting the variable by itself."); }
  }
  function tapVar() {
    if (phase !== "tap-var" || !eq) return;
    sCorrect(); setPhase("ask-op"); setFeedback(askOpText(eq));
  }

  function askOpText(e: Eq): string {
    return stepOf(e) === "constant" ? "What inverse operation gets the variable term by itself?" : "What operation isolates x now?";
  }
  function correctOp(e: Eq): Op {
    const s = stepOf(e);
    if (s === "constant") return e.constant > 0 ? "subtract" : "add";
    if (s === "divisor") return "multiply";
    return "divide";
  }
  function correctTerm(e: Eq): number {
    const s = stepOf(e);
    if (s === "constant") return Math.abs(e.constant);
    if (s === "divisor") return e.divisor;
    return e.coef;
  }
  function termChoices(e: Eq): number[] {
    const correct = correctTerm(e);
    const pool = [e.coef, e.divisor, Math.abs(e.constant), Math.abs(e.rhs), correct + 1, Math.max(2, correct - 1)].filter((n) => n > 0 && n !== correct);
    const distractors = shuffle(Array.from(new Set(pool))).slice(0, 3);
    return shuffle([correct, ...distractors]);
  }

  function giveHint() {
    if (!eq) return;
    if (phase === "ask-op") {
      setHint(step === "constant"
        ? `The constant is ${eq.constant > 0 ? "+" : "−"}${Math.abs(eq.constant)}. To undo it, do the OPPOSITE operation on both sides.`
        : step === "divisor"
        ? `The ${eq.divisor} is underneath x (it's dividing x). Underneath it, multiply it.`
        : `The ${eq.coef} is beside x (it's multiplying x). Beside it, divide it.`);
    } else if (phase === "ask-term") {
      setHint(step === "constant"
        ? `You're undoing ${eq.constant > 0 ? "+" : "−"}${Math.abs(eq.constant)} — which number cancels it to make a zero pair?`
        : step === "divisor"
        ? `x is divided by ${eq.divisor}, so multiply both sides by ${eq.divisor}.`
        : `x is multiplied by ${eq.coef}, so divide both sides by ${eq.coef}.`);
    }
  }

  function pickOp(op: Op) {
    if (!eq) return;
    if (op === correctOp(eq)) {
      sCorrect(); setHint(null);
      setFeedback(step === "constant" ? `Yes — ${OP_LABEL[op]} from both sides. ${OP_LABEL[op]} what?` : `Right — ${OP_LABEL[op]} both sides. By what?`);
      setPhase("ask-term");
    } else {
      sWrong(); setWrong((w) => w + 1); giveHint();
      setFeedback("Not quite — think about the opposite operation. Check the hint.");
    }
  }

  function pickTerm(t: number) {
    if (!eq) return;
    if (t !== correctTerm(eq)) {
      sWrong(); setWrong((w) => w + 1); giveHint();
      setFeedback("Close — that number won't isolate x. Peek at the hint.");
      return;
    }
    sCorrect(); setHint(null);
    // build the resulting equation AND the arithmetic the student still has to do
    let ne: Eq, op: StepOp, expr: string, answer: number;
    if (step === "constant") {
      answer = eq.rhs - eq.constant;
      ne = { coef: eq.coef, divisor: eq.divisor, constant: 0, rhs: answer };
      op = { kind: "cancel", val: eq.constant };
      expr = `${eq.rhs} ${eq.constant > 0 ? "−" : "+"} ${Math.abs(eq.constant)}`;
    } else if (step === "divisor") {
      answer = eq.rhs * eq.divisor;
      ne = { coef: 1, divisor: 1, constant: 0, rhs: answer };
      op = { kind: "multiply", val: eq.divisor };
      expr = `${eq.rhs} × ${eq.divisor}`;
    } else {
      answer = eq.rhs / eq.coef;
      ne = { coef: 1, divisor: 1, constant: 0, rhs: answer };
      op = { kind: "divide", val: eq.coef };
      expr = `${eq.rhs} ÷ ${eq.coef}`;
    }
    setPending({ ne, op, expr, answer });
    setComputeInput(""); setFeedback(""); setPhase("compute");
  }

  function submitCompute() {
    if (!pending) return;
    if (Number(computeInput) === pending.answer) {
      sCorrect(); setPhase("animating"); sCancel();
      const { ne, op } = pending;
      setRows((r) => [...r, { eq: ne, op }]);
      setPending(null);
      window.setTimeout(() => advance(ne), 1300);
    } else {
      sWrong(); setWrong((w) => w + 1);
      setFeedback(`Not yet — recompute ${pending.expr}.`);
    }
  }

  function advance(ne: Eq) {
    if (stepOf(ne) === "done") { setPhase("solved"); setFeedback(""); sSolved(); }
    else { setPhase("ask-op"); setFeedback(askOpText(ne)); }
  }
  function reset() { setPhase("build"); setRows([]); setFeedback(""); setHint(null); setWrong(0); }

  // ── chips ──
  function varChip(coef: number, clickable = false) {
    return <span className={`eqb-chip eqb-x${clickable ? " eqb-x-click" : ""}`} onClick={clickable ? tapVar : undefined}>{coef === 1 ? "x" : `${coef}x`}</span>;
  }
  function constChip(v: number) {
    const pos = v > 0;
    return <span className={`eqb-chip ${pos ? "eqb-pos" : "eqb-neg"}`}>{pos ? "+" : "−"}{Math.abs(v)}</span>;
  }
  function numChip(v: number) { return <span className="eqb-chip eqb-rhs">{v}</span>; }
  function underChip(label: string) { return <span className="eqb-under-chip">{label}</span>; }

  // Aligned worked-solution cells. 4 fixed columns: coef | const | = | rhs.
  function fracCoef(coef: number) {
    return (
      <span className="eqb-frac">
        <span className="num"><span className="eqb-canc">{coef}</span><span className="eqb-xkeep">x</span></span>
        <span className="bar" />
        <span className="den"><span className="eqb-canc">{coef}</span></span>
      </span>
    );
  }
  function fracRhs(rhs: number, a: number) {
    return (
      <span className="eqb-frac">
        <span className="num">{rhs}</span>
        <span className="bar" />
        <span className="den">{a}</span>
      </span>
    );
  }
  // x over a divisor; when cancel, the divisor is struck (it's being multiplied away)
  function varFrac(divisor: number, cancel: boolean, clickable: boolean) {
    const f = (
      <span className="eqb-frac">
        <span className="num"><span className="eqb-xkeep">x</span></span>
        <span className="bar" />
        <span className="den">{cancel ? <span className="eqb-canc">{divisor}</span> : divisor}</span>
      </span>
    );
    return clickable ? <span className="eqb-x-click eqb-fracwrap" onClick={tapVar}>{f}</span> : f;
  }
  function workedCells(): React.ReactNode[] {
    const cells: React.ReactNode[] = [];
    rows.forEach((row, i) => {
      const e = row.eq;
      const nextOp = rows[i + 1]?.op;
      const cancel = nextOp?.kind === "cancel";
      const divide = nextOp?.kind === "divide";
      const multiply = nextOp?.kind === "multiply";
      const isLast = i === rows.length - 1;

      // ── equation row ──
      const coefContent = divide
        ? fracCoef(e.coef)
        : e.divisor > 1
        ? varFrac(e.divisor, multiply, isLast && phase === "tap-var")
        : varChip(e.coef, isLast && phase === "tap-var");
      cells.push(<div className="gc coef" key={`e${i}c`}>{coefContent}</div>);
      cells.push(
        <div className="gc const" key={`e${i}k`}>
          {e.constant !== 0 ? (
            cancel ? (
              <span className="eqb-zero">
                {constChip(e.constant)}
                <span className="eqb-zero-neg">{opSign(nextOp!.val)}</span>
                <span className="eqb-redbox" />
              </span>
            ) : constChip(e.constant)
          ) : null}
        </div>
      );
      cells.push(<div className="gc eq" key={`e${i}q`}><span className="eqb-eqsign">=</span></div>);
      cells.push(<div className="gc right" key={`e${i}r`}>{divide ? fracRhs(e.rhs, nextOp!.val) : numChip(e.rhs)}</div>);

      // ── operation row (creates the NEXT line) ──
      if (cancel) {
        cells.push(<div className="gc coef arrow" key={`o${i}c`}>↓</div>);
        cells.push(<div className="gc const" key={`o${i}k`} />);
        cells.push(<div className="gc eq" key={`o${i}q`} />);
        cells.push(<div className="gc right" key={`o${i}r`}>{underChip(opSign(nextOp!.val))}</div>);
        cells.push(<div className="gc hr" key={`o${i}hr`} />);
      } else if (divide) {
        // the fraction bars above already show the ÷ on both sides — just rule the line
        cells.push(<div className="gc hr" key={`o${i}hr`} />);
      } else if (multiply) {
        cells.push(<div className="gc coef" key={`o${i}c`}>{underChip(`× ${nextOp!.val}`)}</div>);
        cells.push(<div className="gc const" key={`o${i}k`} />);
        cells.push(<div className="gc eq" key={`o${i}q`} />);
        cells.push(<div className="gc right" key={`o${i}r`}>{underChip(`× ${nextOp!.val}`)}</div>);
        cells.push(<div className="gc hr" key={`o${i}hr`} />);
      }
    });
    return cells;
  }

  const solved = phase === "solved" && eq;
  const lastKind = rows[rows.length - 1]?.op?.kind;
  const animMsg = lastKind === "divide" ? "Dividing both sides…" : lastKind === "multiply" ? "Multiplying both sides…" : "The zero pair is covered — it cancels to 0…";

  return (
    <div className="eqb-root">
      <style>{`
        .eqb-root { min-height:100vh; background:var(--bdb-ground); color:var(--bdb-ink); font-family:var(--bdb-font); display:flex; flex-direction:column; }
        .eqb-top { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:14px clamp(16px,3vw,30px); border-bottom:1px solid var(--bdb-line); }
        .eqb-mark { font-size:0.74rem; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:var(--bdb-ink-faint); margin:0; }
        .eqb-btn { font-size:0.84rem; font-weight:600; color:var(--bdb-ink-soft); background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r-pill); padding:8px 14px; cursor:pointer; text-decoration:none; }
        .eqb-btn:hover { border-color:var(--bdb-ink-faint); color:var(--bdb-ink); }

        .eqb-main { flex:1; padding:clamp(18px,3vw,34px); display:flex; flex-direction:column; gap:clamp(16px,3vw,28px); align-items:center; max-width:1040px; margin:0 auto; width:100%; box-sizing:border-box; }

        .eqb-build { display:grid; gap:18px; justify-items:center; }
        .eqb-preview { display:flex; align-items:center; gap:clamp(12px,2vw,20px); justify-content:center; padding:14px 18px; border:3px solid var(--bdb-ink); border-radius:16px; background:#fff; box-shadow:0 14px 0 var(--bdb-ink); }
        .eqb-steppers { display:flex; gap:22px; flex-wrap:wrap; justify-content:center; }
        .eqb-stp { display:grid; justify-items:center; gap:6px; }
        .eqb-stp-label { font-size:0.7rem; font-weight:700; letter-spacing:0.07em; text-transform:uppercase; color:var(--bdb-ink-faint); }
        .eqb-stp-ctl { display:flex; align-items:center; gap:10px; }
        .eqb-stp-btn { width:38px; height:38px; border-radius:10px; border:1px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink); font-size:1.3rem; font-weight:700; cursor:pointer; }
        .eqb-stp-val { min-width:42px; text-align:center; font-size:1.5rem; font-weight:800; }
        .eqb-presets { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
        .eqb-preset { font-size:0.85rem; font-weight:600; color:var(--bdb-ink-soft); background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:999px; padding:7px 14px; cursor:pointer; }
        .eqb-preset:hover { border-color:var(--bdb-ink-faint); }
        .eqb-start { font-size:clamp(1.25rem,2.8vw,1.65rem); font-weight:900; color:#fff; background:var(--bdb-coral); border:none; border-radius:16px; padding:18px 48px; cursor:pointer; box-shadow:0 10px 0 color-mix(in srgb,var(--bdb-coral) 70%,black); animation:eqbCall 1.2s ease-in-out infinite; }
        @keyframes eqbCall { 50% { transform:translateY(-2px); filter:brightness(1.04); } }

        /* Worked solution — fixed columns so every row lines up */
        .eqb-work { display:flex; justify-content:center; width:100%; }
        .eqb-grid { display:grid; grid-template-columns:clamp(104px,18vw,164px) clamp(92px,16vw,144px) clamp(52px,8vw,68px) clamp(96px,16vw,150px); align-items:center; gap:18px 14px; }
        .gc { display:flex; align-items:center; min-height:1px; animation:eqbDrop 0.4s ease; }
        @keyframes eqbDrop { from{opacity:0; transform:translateY(-10px);} to{opacity:1; transform:none;} }
        .gc.coef { justify-content:flex-end; }
        .gc.const { justify-content:flex-start; }
        .gc.eq { justify-content:center; }
        .gc.right { justify-content:flex-start; }
        .gc.arrow { justify-content:flex-end; color:var(--bdb-teal); font-weight:800; font-size:1.7rem; }
        .gc.hr { grid-column:1 / -1; height:0; border-top:3px solid var(--bdb-ink-faint); margin:2px 0; animation:eqbLineIn 0.45s ease; }
        @keyframes eqbLineIn { from{opacity:0; transform:scaleX(0.15);} to{opacity:1; transform:scaleX(1);} }

        .eqb-eqsign { font-size:clamp(2.4rem,6vw,3.6rem); font-weight:900; color:var(--bdb-ink-soft); }
        .eqb-chip { display:inline-flex; align-items:center; justify-content:center; font-weight:900; border-radius:14px; padding:12px 18px; font-size:clamp(1.7rem,4.8vw,2.9rem); min-width:58px; border:2px solid transparent; }
        .eqb-x { background:color-mix(in srgb,var(--bdb-teal) 20%,white); color:color-mix(in srgb,var(--bdb-teal) 80%,black); border-color:var(--bdb-teal); }
        .eqb-x-click { cursor:pointer; box-shadow:0 0 0 3px color-mix(in srgb,var(--bdb-teal) 45%,white); animation:eqbPulse 1s ease-in-out infinite; }
        .eqb-pos { background:color-mix(in srgb,var(--bdb-amber) 22%,white); color:#8a5a0b; border-color:var(--bdb-amber); }
        .eqb-neg { background:color-mix(in srgb,var(--bdb-coral) 18%,white); color:#9a3412; border-color:var(--bdb-coral); }
        .eqb-rhs { background:color-mix(in srgb,#4d8df6 18%,white); color:#0c447c; border-color:#4d8df6; }
        .eqb-under-chip { font-weight:900; color:var(--bdb-coral); font-size:clamp(1.35rem,3.8vw,2.1rem); padding:4px 10px; }

        /* division shown as a fraction with the coefficient cancelling */
        .eqb-frac { display:inline-grid; justify-items:center; gap:3px; }
        .eqb-frac .num, .eqb-frac .den { font-weight:900; font-size:clamp(1.7rem,4.8vw,2.9rem); display:inline-flex; }
        .eqb-frac .bar { width:100%; min-width:46px; height:3px; background:var(--bdb-ink); border-radius:2px; }
        .eqb-xkeep { color:color-mix(in srgb,var(--bdb-teal) 80%,black); }
        .eqb-canc { position:relative; color:var(--bdb-ink-soft); }
        .eqb-canc::after { content:""; position:absolute; left:-3px; right:-3px; top:45%; height:3px; background:var(--bdb-coral); border-radius:2px; transform:rotate(-18deg) scaleX(0); transform-origin:center; animation:eqbStrike 0.5s ease 0.25s forwards; }
        @keyframes eqbStrike { to{ transform:rotate(-18deg) scaleX(1); } }
        .eqb-rule { font-size:0.86rem; font-weight:600; color:#0f5e5f; background:color-mix(in srgb,var(--bdb-teal) 12%,white); border:1px solid color-mix(in srgb,var(--bdb-teal) 30%,white); border-radius:10px; padding:8px 14px; text-align:center; max-width:520px; }
        .eqb-modepick { display:grid; gap:7px; justify-items:center; }
        .eqb-modes { display:inline-flex; background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r-pill); padding:3px; }
        .eqb-modes button { border:none; background:transparent; border-radius:var(--bdb-r-pill); padding:8px 20px; font:inherit; font-weight:600; font-size:0.9rem; color:var(--bdb-ink-soft); cursor:pointer; }
        .eqb-modes button.on { background:var(--bdb-ink); color:#fff; }

        /* zero pair: +b with −b stacked under it, red box covers BOTH (they stay) */
        .eqb-zero { position:relative; display:inline-flex; }
        .eqb-zero-neg { position:absolute; left:50%; top:calc(100% + 16px); transform:translateX(-50%); font-weight:800; color:var(--bdb-coral); font-size:clamp(1.15rem,3.2vw,1.7rem); white-space:nowrap; }
        .eqb-redbox { position:absolute; left:-9px; right:-9px; top:-9px; height:calc(200% + 34px); border:3px solid var(--bdb-coral); background:color-mix(in srgb,var(--bdb-coral) 14%,transparent); border-radius:13px; transform-origin:top center; animation:eqbCover 0.5s ease forwards; pointer-events:none; }
        @keyframes eqbCover { from{opacity:0; transform:scale(0.6);} to{opacity:1; transform:scale(1);} }
        @keyframes eqbPulse { 50%{opacity:0.55;} }

        .eqb-modal { position:fixed; inset:0; background:rgba(32,30,26,0.55); display:grid; place-items:center; z-index:40; padding:20px; }
        .eqb-modal-card { background:var(--bdb-card); border-radius:18px; padding:26px 28px; max-width:520px; width:100%; display:grid; gap:16px; box-shadow:var(--bdb-shadow-lg); }
        .eqb-q { font-size:clamp(1.1rem,2.8vw,1.45rem); font-weight:700; text-align:center; color:var(--bdb-ink); min-height:1.3em; }
        .eqb-choices { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; }
        .eqb-choice { font-size:1.1rem; font-weight:700; color:var(--bdb-ink); background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:12px; padding:13px 24px; cursor:pointer; min-width:64px; transition:transform 120ms ease, border-color 140ms; }
        .eqb-choice:hover { transform:translateY(-1px); border-color:var(--bdb-teal); }
        .eqb-feedback { font-size:0.95rem; font-weight:600; color:var(--bdb-ink-soft); text-align:center; min-height:1.2em; }
        .eqb-hint { background:color-mix(in srgb,var(--bdb-amber) 16%,white); border:1px solid color-mix(in srgb,var(--bdb-amber) 40%,white); color:#8a5a0b; border-radius:12px; padding:11px 16px; font-weight:600; font-size:0.93rem; max-width:560px; text-align:center; }
        .eqb-hintbtn { font-size:0.84rem; font-weight:600; color:#8a5a0b; background:transparent; border:1px solid color-mix(in srgb,var(--bdb-amber) 45%,white); border-radius:10px; padding:8px 14px; cursor:pointer; }
        .eqb-cinput { font-size:1.7rem; font-weight:800; text-align:center; background:var(--bdb-ground); border:2px solid var(--bdb-line); border-radius:12px; color:var(--bdb-ink); padding:12px; width:160px; margin:0 auto; }
        .eqb-fracwrap { cursor:pointer; display:inline-flex; padding:4px 8px; border-radius:10px; }
        .eqb-solved { display:grid; justify-items:center; gap:14px; }
        .eqb-solved-eq { font-size:clamp(2.4rem,8vw,4.6rem); font-weight:800; color:var(--bdb-green); }
      `}</style>

      <header className="eqb-top">
        <p className="eqb-mark">Equation Builder</p>
        <div style={{ display: "flex", gap: 8 }}>
          {phase !== "build" && <button className="eqb-btn" onClick={reset}>↻ New equation</button>}
          <a className="eqb-btn" href="/teacher">Tools</a>
        </div>
      </header>

      <main className="eqb-main">
        <LiveToolBanner tool={liveTool} />
        {phase === "build" ? (
          <div className="eqb-build">
            <div className="eqb-preview">
              {isDiv ? varFrac(a, false, false) : varChip(a)}{b !== 0 && constChip(b)}<span className="eqb-eqsign">=</span>{numChip(c)}
            </div>
            <div className="eqb-modepick">
              <span className="eqb-stp-label">Mode for this lesson</span>
              <div className="eqb-modes">
                <button className={mode === "beginner" ? "on" : ""} onClick={() => setMode("beginner")}>Beginner</button>
                <button className={mode === "advanced" ? "on" : ""} onClick={() => setMode("advanced")}>Advanced</button>
              </div>
            </div>
            <div className="eqb-steppers">
              <div className="eqb-stp">
                <span className="eqb-stp-label">x term</span>
                <div className="eqb-stp-ctl">
                  <div className="eqb-modes" style={{ marginRight: 4 }}>
                    <button className={!isDiv ? "on" : ""} onClick={() => setVarOp("×")}>× a</button>
                    <button className={isDiv ? "on" : ""} onClick={() => { setVarOp("÷"); if (a < 2) setA(2); }}>÷ a</button>
                  </div>
                  <button className="eqb-stp-btn" onClick={() => setA(Math.max(isDiv ? 2 : 1, a - 1))}>−</button>
                  <span className="eqb-stp-val">{a}</span>
                  <button className="eqb-stp-btn" onClick={() => setA(Math.min(6, a + 1))}>+</button>
                </div>
              </div>
              <div className="eqb-stp">
                <span className="eqb-stp-label">constant (b)</span>
                <div className="eqb-stp-ctl">
                  <button className="eqb-stp-btn" onClick={() => setB(Math.max(-10, b - 1))}>−</button>
                  <span className="eqb-stp-val">{b}</span>
                  <button className="eqb-stp-btn" onClick={() => setB(Math.min(10, b + 1))}>+</button>
                </div>
              </div>
              <div className="eqb-stp">
                <span className="eqb-stp-label">answer x</span>
                <div className="eqb-stp-ctl">
                  <button className="eqb-stp-btn" onClick={() => setXAns(Math.max(1, xAns - 1))}>−</button>
                  <span className="eqb-stp-val">{xUse}</span>
                  <button className="eqb-stp-btn" onClick={() => setXAns(Math.min(24, xAns + 1))}>+</button>
                </div>
              </div>
            </div>
            <div className="eqb-presets">
              {PRESETS.map((p, i) => (
                <button className="eqb-preset" key={i} onClick={() => loadPreset(p)}>{p[0] === 1 ? "x" : `${p[0]}x`} {p[1] >= 0 ? `+ ${p[1]}` : `− ${-p[1]}`} = {p[0] * p[2] + p[1]}</button>
              ))}
            </div>
            <button className="eqb-start" onClick={startSolve}>Start solving →</button>
            <p className="eqb-feedback">Build any equation, then solve it together step by step.</p>
          </div>
        ) : (
          <>
            <div className="eqb-work"><div className="eqb-grid">{workedCells()}</div></div>

            {solved ? (
              <div className="eqb-solved">
                <div className="eqb-solved-eq">x = {eq!.rhs}</div>
                <p className="eqb-feedback">Solved{wrong === 0 ? " with no mistakes — nice!" : "!"} The variable is isolated.</p>
                <button className="eqb-start" onClick={reset}>↻ New equation</button>
              </div>
            ) : phase === "goal" ? (
              <div className="eqb-modal">
                <div className="eqb-modal-card">
                  <p className="eqb-q">First — what is your goal when solving an equation?</p>
                  <div className="eqb-choices" style={{ flexDirection: "column" }}>
                    {GOAL_CHOICES.map((g, i) => (
                      <button className="eqb-choice" key={i} onClick={() => pickGoal(g.correct)}>{g.label}</button>
                    ))}
                  </div>
                  {feedback && <p className="eqb-feedback">{feedback}</p>}
                </div>
              </div>
            ) : phase === "tap-var" ? (
              <p className="eqb-q">Now tap the variable you&apos;re solving for to begin.</p>
            ) : phase === "compute" && pending ? (
              <div className="eqb-modal">
                <div className="eqb-modal-card">
                  <p className="eqb-feedback" style={{ minHeight: 0 }}>Now do the math:</p>
                  <p className="eqb-q" style={{ fontSize: "clamp(1.6rem,5vw,2.4rem)" }}>{pending.expr} = ?</p>
                  <input className="eqb-cinput" type="number" autoFocus value={computeInput}
                    onChange={(e) => setComputeInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submitCompute(); }} />
                  {feedback && <p className="eqb-feedback" style={{ color: "var(--bdb-coral)" }}>{feedback}</p>}
                  <button className="eqb-start" onClick={submitCompute}>Check →</button>
                </div>
              </div>
            ) : phase === "animating" ? (
              <p className="eqb-q">{animMsg}</p>
            ) : (
              <>
                <p className="eqb-q">{feedback}</p>
                <div className="eqb-choices">
                  {phase === "ask-op"
                    ? (["add", "subtract", "multiply", "divide"] as Op[]).map((op) => (
                        <button className="eqb-choice" key={op} onClick={() => pickOp(op)}>{OP_LABEL[op]}</button>
                      ))
                    : eq && termChoices(eq).map((t) => (
                        <button className="eqb-choice" key={t} onClick={() => pickTerm(t)}>{t}</button>
                      ))}
                </div>
                {(step === "coefficient" || step === "divisor") && <div className="eqb-rule">Beside it, divide it. Underneath it, multiply it.</div>}
                {hint ? <div className="eqb-hint">{hint}</div> : <button className="eqb-hintbtn" onClick={giveHint}>Need a hint?</button>}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
