"use client";

// Guided Equation Builder & Solver — vertical worked-solution layout.
// Build ax + b = c, then solve step by step. When you subtract from both sides,
// the opposite value drops in UNDERNEATH each side, the zero pair gets crossed
// out in red (squares stay — they don't vanish), the un-cancelled term carries
// down with an arrow, and the result lands one row lower. Columns stay aligned.

import { useEffect, useRef, useState, useCallback } from "react";
import { LiveToolBanner, useLiveToolConfig } from "./useLiveToolConfig";

type Op = "add" | "subtract" | "multiply" | "divide";
type Phase = "build" | "goal" | "tap-var" | "ask-op" | "ask-term" | "animating" | "solved";
interface Eq { coef: number; constant: number; rhs: number; }
interface StepOp { kind: "cancel" | "divide"; val: number; }
interface Row { eq: Eq; op?: StepOp; }

const OP_LABEL: Record<Op, string> = { add: "Add", subtract: "Subtract", multiply: "Multiply", divide: "Divide" };
const PRESETS: [number, number, number][] = [ [1, 5, 7], [2, 3, 4], [3, -4, 5], [4, 6, 3], [2, -7, 9] ];
const GOAL_CHOICES: { label: string; correct: boolean }[] = [
  { label: "Isolate the variable", correct: true },
  { label: "Make both sides as big as possible", correct: false },
  { label: "Get rid of the equals sign", correct: false },
  { label: "Remove the variable", correct: false },
];

function stepOf(eq: Eq): "constant" | "coefficient" | "done" {
  if (eq.constant !== 0) return "constant";
  if (eq.coef !== 1) return "coefficient";
  return "done";
}
function shuffle<T>(a: T[]): T[] { return [...a].sort(() => Math.random() - 0.5); }
function opSign(v: number): string { return `${v > 0 ? "−" : "+"} ${Math.abs(v)}`; }

export default function EquationBuilder() {
  const liveTool = useLiveToolConfig("/equation-builder");
  const [a, setA] = useState(2);
  const [b, setB] = useState(3);
  const [xAns, setXAns] = useState(4);
  const c = a * xAns + b;

  const [phase, setPhase] = useState<Phase>("build");
  const [rows, setRows] = useState<Row[]>([]);
  const [feedback, setFeedback] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [wrong, setWrong] = useState(0);

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
    const e: Eq = { coef: a, constant: b, rhs: c };
    setRows([{ eq: e }]);
    setWrong(0); setHint(null);
    if (stepOf(e) === "done") { setPhase("solved"); sSolved(); }
    else { setPhase("goal"); setFeedback(""); }
  }
  function loadPreset(p: [number, number, number]) { setA(p[0]); setB(p[1]); setXAns(p[2]); }

  useEffect(() => {
    if (!liveTool || liveTool.route !== "/equation-builder") return;
    setA(liveTool.config.coefficient);
    setB(liveTool.config.constant);
    setXAns(liveTool.config.solution);
    setPhase("build");
    setRows([]);
    setFeedback("");
    setHint(null);
    setWrong(0);
  }, [liveTool?.id]);

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
    if (stepOf(e) === "constant") return e.constant > 0 ? "subtract" : "add";
    return "divide";
  }
  function correctTerm(e: Eq): number { return stepOf(e) === "constant" ? Math.abs(e.constant) : e.coef; }
  function termChoices(e: Eq): number[] {
    const correct = correctTerm(e);
    const pool = [e.coef, Math.abs(e.constant), Math.abs(e.rhs), correct + 1, Math.max(2, correct - 1)].filter((n) => n > 0 && n !== correct);
    const distractors = shuffle(Array.from(new Set(pool))).slice(0, 3);
    return shuffle([correct, ...distractors]);
  }

  function giveHint() {
    if (!eq) return;
    if (phase === "ask-op") {
      setHint(step === "constant"
        ? `The constant is ${eq.constant > 0 ? "+" : "−"}${Math.abs(eq.constant)}. To undo it, do the OPPOSITE operation on both sides.`
        : `${eq.coef} is multiplying x. The opposite of multiplying is…`);
    } else if (phase === "ask-term") {
      setHint(step === "constant"
        ? `You're undoing ${eq.constant > 0 ? "+" : "−"}${Math.abs(eq.constant)} — which number cancels it to make a zero pair?`
        : `x is being multiplied by ${eq.coef}, so divide both sides by ${eq.coef}.`);
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
    if (t === correctTerm(eq)) {
      sCorrect(); setHint(null); setPhase("animating"); sCancel();
      const ne: Eq = step === "constant"
        ? { coef: eq.coef, constant: 0, rhs: eq.rhs - eq.constant }
        : { coef: 1, constant: 0, rhs: eq.rhs / eq.coef };
      const op: StepOp = step === "constant" ? { kind: "cancel", val: eq.constant } : { kind: "divide", val: eq.coef };
      setRows((r) => [...r, { eq: ne, op }]);
      window.setTimeout(() => advance(ne), 1100);
    } else {
      sWrong(); setWrong((w) => w + 1); giveHint();
      setFeedback("Close — that number won't cancel it. Peek at the hint.");
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
  function constChip(v: number, strike = false) {
    const pos = v > 0;
    return <span className={`eqb-chip ${pos ? "eqb-pos" : "eqb-neg"}${strike ? " eqb-strike" : ""}`}>{pos ? "+" : "−"}{Math.abs(v)}</span>;
  }
  function numChip(v: number) { return <span className="eqb-chip eqb-rhs">{v}</span>; }
  function underChip(label: string, strike = false) { return <span className={`eqb-under-chip${strike ? " eqb-strike" : ""}`}>{label}</span>; }

  // Build the aligned worked-solution cells (4 columns: coef | const | = | rhs)
  function workedCells(): React.ReactNode[] {
    const cells: React.ReactNode[] = [];
    rows.forEach((row, i) => {
      const e = row.eq;
      const nextOp = rows[i + 1]?.op;
      const constStrike = nextOp?.kind === "cancel";
      const isLast = i === rows.length - 1;
      // equation row
      cells.push(<div className="gc coef" key={`e${i}c`}>{varChip(e.coef, isLast && phase === "tap-var")}</div>);
      cells.push(<div className="gc const" key={`e${i}k`}>{e.constant !== 0 ? constChip(e.constant, constStrike) : null}</div>);
      cells.push(<div className="gc eq" key={`e${i}q`}><span className="eqb-eqsign">=</span></div>);
      cells.push(<div className="gc right" key={`e${i}r`}>{numChip(e.rhs)}</div>);
      // operation row (the step that creates the NEXT line)
      const op = rows[i + 1]?.op;
      if (op) {
        if (op.kind === "cancel") {
          cells.push(<div className="gc coef arrow" key={`o${i}c`}>↓</div>);
          cells.push(<div className="gc const" key={`o${i}k`}>{underChip(opSign(op.val), true)}</div>);
          cells.push(<div className="gc eq" key={`o${i}q`} />);
          cells.push(<div className="gc right" key={`o${i}r`}>{underChip(opSign(op.val))}</div>);
        } else {
          cells.push(<div className="gc coef" key={`o${i}c`}>{underChip(`÷ ${op.val}`)}</div>);
          cells.push(<div className="gc const" key={`o${i}k`} />);
          cells.push(<div className="gc eq" key={`o${i}q`} />);
          cells.push(<div className="gc right" key={`o${i}r`}>{underChip(`÷ ${op.val}`)}</div>);
        }
        // horizontal line between the operation and the result below it
        cells.push(<div className="gc hr" key={`o${i}hr`} />);
      }
    });
    return cells;
  }

  const solved = phase === "solved" && eq;
  const animMsg = rows[rows.length - 1]?.op?.kind === "divide" ? "Dividing both sides…" : "Subtracting from both sides — the zero pair cancels…";

  return (
    <div className="eqb-root">
      <style>{`
        .eqb-root { min-height:100vh; background:#0b0d14; color:#fff; font-family:Inter,ui-sans-serif,system-ui,sans-serif; display:grid; grid-template-rows:auto 1fr auto; }
        .eqb-top { display:flex; align-items:center; justify-content:space-between; padding:14px 24px; border-bottom:1px solid #1f2332; flex-wrap:wrap; gap:8px; }
        .eqb-mark { font-size:0.76rem; font-weight:900; letter-spacing:0.14em; text-transform:uppercase; color:#22c55e; margin:0; }
        .eqb-btn { font-size:0.8rem; font-weight:800; color:#8a93ad; background:transparent; border:1px solid #1f2332; border-radius:7px; padding:8px 13px; cursor:pointer; text-decoration:none; }
        .eqb-btn:hover { border-color:#22c55e; color:#fff; }

        .eqb-main { padding:24px; display:grid; gap:24px; align-content:start; justify-items:center; max-width:920px; margin:0 auto; width:100%; }

        .eqb-build { display:grid; gap:16px; justify-items:center; width:100%; }
        .eqb-preview { display:flex; align-items:center; gap:12px; justify-content:center; }
        .eqb-steppers { display:flex; gap:22px; flex-wrap:wrap; justify-content:center; }
        .eqb-stp { display:grid; justify-items:center; gap:6px; }
        .eqb-stp-label { font-size:0.72rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; color:#5a6280; }
        .eqb-stp-ctl { display:flex; align-items:center; gap:10px; }
        .eqb-stp-btn { width:38px; height:38px; border-radius:9px; border:1px solid #2a3045; background:#161a28; color:#fff; font-size:1.3rem; font-weight:900; cursor:pointer; }
        .eqb-stp-val { min-width:42px; text-align:center; font-size:1.5rem; font-weight:900; }
        .eqb-presets { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
        .eqb-preset { font-size:0.85rem; font-weight:800; color:#c8cedd; background:#121520; border:1px solid #1f2332; border-radius:999px; padding:7px 14px; cursor:pointer; }
        .eqb-preset:hover { border-color:#22c55e; }
        .eqb-start { font-size:1.2rem; font-weight:900; color:#fff; background:#22c55e; border:none; border-radius:13px; padding:15px 40px; cursor:pointer; box-shadow:0 10px 26px -10px #22c55e; }

        /* Worked solution — aligned columns, centered */
        .eqb-work { display:flex; justify-content:center; width:100%; }
        .eqb-grid { display:grid; grid-template-columns:auto auto auto auto; align-items:center; gap:10px 14px; }
        .gc { display:flex; align-items:center; min-height:1px; animation:eqbDrop 0.4s ease; }
        @keyframes eqbDrop { from{opacity:0; transform:translateY(-10px);} to{opacity:1; transform:none;} }
        .gc.coef { justify-content:flex-end; }
        .gc.const { justify-content:flex-start; }
        .gc.eq { justify-content:center; }
        .gc.right { justify-content:flex-start; }
        .gc.arrow { justify-content:flex-end; color:#22c55e; font-weight:900; font-size:1.7rem; }
        .gc.hr { grid-column:1 / -1; height:0; border-top:3px solid #6b7392; margin:3px 0; transform-origin:center; animation:eqbLineIn 0.45s ease; }
        @keyframes eqbLineIn { from{opacity:0; transform:scaleX(0.15);} to{opacity:1; transform:scaleX(1);} }

        .eqb-eqsign { font-size:clamp(1.8rem,5vw,2.8rem); font-weight:900; color:#8a93ad; }
        .eqb-chip { display:inline-flex; align-items:center; justify-content:center; font-weight:900; border-radius:11px; padding:10px 14px; font-size:clamp(1.3rem,3.6vw,2rem); min-width:48px; box-shadow:0 4px 12px -6px rgba(0,0,0,0.6); }
        .eqb-x { background:#22c55e; color:#04230f; }
        .eqb-x-click { cursor:pointer; outline:3px solid #bbf7d0; outline-offset:2px; animation:eqbPulse 0.9s ease-in-out infinite; }
        .eqb-pos { background:#f59e0b; color:#3a2503; }
        .eqb-neg { background:#ef4444; color:#3a0606; }
        .eqb-rhs { background:#4e6ef2; color:#06122e; }
        .eqb-under-chip { font-weight:900; color:#fca5a5; font-size:clamp(1.2rem,3.2vw,1.8rem); position:relative; padding:6px 12px; }
        .eqb-strike { position:relative; }
        .eqb-strike::after { content:""; position:absolute; left:0; right:0; top:50%; height:4px; background:#ef4444; border-radius:2px; transform:scaleX(0); transform-origin:left; animation:eqbStrike 0.5s ease forwards; animation-delay:0.3s; }
        @keyframes eqbStrike { to{transform:scaleX(1);} }
        @keyframes eqbPulse { 50%{opacity:0.5;} }

        .eqb-modal { position:fixed; inset:0; background:rgba(5,7,12,0.82); display:grid; place-items:center; z-index:40; padding:20px; }
        .eqb-modal-card { background:#121520; border:1px solid #2a3045; border-radius:18px; padding:26px 28px; max-width:520px; width:100%; display:grid; gap:16px; box-shadow:0 30px 80px -20px #000; }
        .eqb-q { font-size:clamp(1.1rem,2.8vw,1.5rem); font-weight:800; text-align:center; color:#e8ecf5; min-height:1.4em; }
        .eqb-choices { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; }
        .eqb-choice { font-size:1.15rem; font-weight:900; color:#fff; background:#161a28; border:1px solid #2a3045; border-radius:12px; padding:14px 26px; cursor:pointer; min-width:64px; transition:transform 120ms ease, border-color 140ms; }
        .eqb-choice:hover { transform:translateY(-1px); border-color:#22c55e; }
        .eqb-feedback { font-size:0.95rem; font-weight:700; color:#9aa3bd; text-align:center; min-height:1.3em; }
        .eqb-hint { background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.35); color:#fcd34d; border-radius:10px; padding:11px 16px; font-weight:700; font-size:0.92rem; max-width:560px; text-align:center; }
        .eqb-hintbtn { font-size:0.82rem; font-weight:800; color:#fcd34d; background:transparent; border:1px solid rgba(245,158,11,0.4); border-radius:8px; padding:8px 14px; cursor:pointer; }
        .eqb-solved { display:grid; justify-items:center; gap:14px; }
        .eqb-solved-eq { font-size:clamp(2.4rem,8vw,5rem); font-weight:900; color:#22c55e; }
        .eqb-foot { padding:12px 24px; border-top:1px solid #1f2332; display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; }
      `}</style>

      <header className="eqb-top">
        <p className="eqb-mark">Equation Builder</p>
        <div style={{ display: "flex", gap: 8 }}>
          {phase !== "build" && <button className="eqb-btn" onClick={reset}>↻ New equation</button>}
          <a className="eqb-btn" href="/">Home</a>
        </div>
      </header>

      <main className="eqb-main">
        <LiveToolBanner tool={liveTool} />
        {phase === "build" ? (
          <div className="eqb-build">
            <div className="eqb-preview">
              {varChip(a)}{b !== 0 && constChip(b)}<span className="eqb-eqsign">=</span>{numChip(c)}
            </div>
            <div className="eqb-steppers">
              {([["coefficient (a)", a, setA, 1, 6], ["constant (b)", b, setB, -10, 10], ["answer x", xAns, setXAns, 1, 12]] as [string, number, (n: number) => void, number, number][]).map(([labelText, val, set, min, max]) => (
                <div className="eqb-stp" key={labelText}>
                  <span className="eqb-stp-label">{labelText}</span>
                  <div className="eqb-stp-ctl">
                    <button className="eqb-stp-btn" onClick={() => set(Math.max(min, val - 1))}>−</button>
                    <span className="eqb-stp-val">{val}</span>
                    <button className="eqb-stp-btn" onClick={() => set(Math.min(max, val + 1))}>+</button>
                  </div>
                </div>
              ))}
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
                <div className="eqb-solved-eq">x = {eq!.rhs} 🎉</div>
                <p className="eqb-feedback">Solved{wrong === 0 ? " with no mistakes — nice!" : "!"} The variable is isolated.</p>
                <button className="eqb-start" onClick={reset}>↻ New equation</button>
              </div>
            ) : phase === "goal" ? (
              <div className="eqb-modal">
                <div className="eqb-modal-card">
                  <p className="eqb-q">First — what is your <strong>goal</strong> when solving an equation?</p>
                  <div className="eqb-choices" style={{ flexDirection: "column" }}>
                    {GOAL_CHOICES.map((g, i) => (
                      <button className="eqb-choice" key={i} onClick={() => pickGoal(g.correct)}>{g.label}</button>
                    ))}
                  </div>
                  {feedback && <p className="eqb-feedback">{feedback}</p>}
                </div>
              </div>
            ) : phase === "tap-var" ? (
              <p className="eqb-q">👆 Now <strong>tap the variable</strong> you’re solving for to begin.</p>
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
                {hint ? <div className="eqb-hint">💡 {hint}</div> : <button className="eqb-hintbtn" onClick={giveHint}>Need a hint?</button>}
              </>
            )}
          </>
        )}
      </main>

      <footer className="eqb-foot">
        <span className="eqb-feedback" style={{ minHeight: 0 }}>{phase !== "build" && !solved ? "Pick the operation, then the number. The opposite value drops under both sides and the zero pair crosses out." : ""}</span>
        <a className="eqb-btn" href="/control">Control panel</a>
      </footer>
    </div>
  );
}
