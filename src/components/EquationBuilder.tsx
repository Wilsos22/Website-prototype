"use client";

// Guided Equation Builder & Solver.
// Build ax + b = c (always an equals sign between the two sides, tiles auto-aligned),
// then solve step-by-step:
//   • "What inverse operation isolates the variable?" → pick add/subtract/multiply/divide
//   • "Subtract what / Divide by what?" → pick the term
//   • the term cancels as a ZERO PAIR (red box + poof + sound) and the equation
//     DROPS to the next line, with a plain-English explanation on the left
//   • repeat until x is isolated. Hints help if a student is stuck.

import { useRef, useState, useCallback } from "react";

type Op = "add" | "subtract" | "multiply" | "divide";
type Phase = "build" | "ask-op" | "ask-term" | "animating" | "solved";
interface Eq { coef: number; constant: number; rhs: number; }
interface Row { eq: Eq; note: string; }
interface Anim { kind: "cancel" | "divide"; n: number; }

const OP_LABEL: Record<Op, string> = { add: "Add", subtract: "Subtract", multiply: "Multiply", divide: "Divide" };
const PRESETS: [number, number, number][] = [ /* a, b, x */ [1, 5, 7], [2, 3, 4], [3, -4, 5], [4, 6, 3], [2, -7, 9] ];

function stepOf(eq: Eq): "constant" | "coefficient" | "done" {
  if (eq.constant !== 0) return "constant";
  if (eq.coef !== 1) return "coefficient";
  return "done";
}
function shuffle<T>(a: T[]): T[] { return [...a].sort(() => Math.random() - 0.5); }

export default function EquationBuilder() {
  const [a, setA] = useState(2);
  const [b, setB] = useState(3);
  const [xAns, setXAns] = useState(4);
  const c = a * xAns + b;

  const [phase, setPhase] = useState<Phase>("build");
  const [rows, setRows] = useState<Row[]>([]);
  const [anim, setAnim] = useState<Anim | null>(null);
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
    setRows([{ eq: e, note: "Start" }]);
    setWrong(0); setHint(null); setAnim(null);
    if (stepOf(e) === "done") { setPhase("solved"); sSolved(); }
    else { setPhase("ask-op"); setFeedback(askOpText(e)); }
  }

  function loadPreset(p: [number, number, number]) { setA(p[0]); setB(p[1]); setXAns(p[2]); }

  function askOpText(e: Eq): string {
    return stepOf(e) === "constant"
      ? "What inverse operation gets the variable term by itself?"
      : "What operation isolates x now?";
  }
  function correctOp(e: Eq): Op {
    if (stepOf(e) === "constant") return e.constant > 0 ? "subtract" : "add";
    return "divide";
  }
  function correctTerm(e: Eq): number {
    return stepOf(e) === "constant" ? Math.abs(e.constant) : e.coef;
  }
  function termChoices(e: Eq): number[] {
    const correct = correctTerm(e);
    const pool = [e.coef, Math.abs(e.constant), Math.abs(e.rhs), correct + 1, Math.max(2, correct - 1)]
      .filter((n) => n > 0 && n !== correct);
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
      setFeedback(step === "constant"
        ? `Yes — ${OP_LABEL[op]} from both sides. ${OP_LABEL[op]} what?`
        : `Right — ${OP_LABEL[op]} both sides. By what?`);
      setPhase("ask-term");
    } else {
      sWrong(); setWrong((w) => w + 1); giveHint();
      setFeedback("Not quite — think about the opposite operation. Check the hint.");
    }
  }

  function pickTerm(t: number) {
    if (!eq) return;
    if (t === correctTerm(eq)) {
      sCorrect(); setHint(null); setPhase("animating");
      if (step === "constant") {
        setAnim({ kind: "cancel", n: eq.constant }); sCancel();
        window.setTimeout(() => {
          const ne: Eq = { coef: eq.coef, constant: 0, rhs: eq.rhs - eq.constant };
          const sign = eq.constant > 0 ? "−" : "+";
          setRows((r) => [...r, { eq: ne, note: `${sign}${Math.abs(eq.constant)} from both sides · +${Math.abs(eq.constant)} and −${Math.abs(eq.constant)} make a zero pair → cancel` }]);
          setAnim(null); advance(ne);
        }, 1700);
      } else {
        setAnim({ kind: "divide", n: eq.coef }); sCancel();
        window.setTimeout(() => {
          const ne: Eq = { coef: 1, constant: 0, rhs: eq.rhs / eq.coef };
          setRows((r) => [...r, { eq: ne, note: `÷${eq.coef} on both sides · ${eq.coef}x ÷ ${eq.coef} = x` }]);
          setAnim(null); advance(ne);
        }, 1700);
      }
    } else {
      sWrong(); setWrong((w) => w + 1); giveHint();
      setFeedback("Close — that number won't cancel it. Peek at the hint.");
    }
  }

  function advance(ne: Eq) {
    if (stepOf(ne) === "done") { setPhase("solved"); setFeedback(""); sSolved(); }
    else { setPhase("ask-op"); setFeedback(askOpText(ne)); }
  }

  function reset() { setPhase("build"); setRows([]); setAnim(null); setFeedback(""); setHint(null); setWrong(0); }

  // ── chip rendering ────────────────────────────────────────────────────
  function varChip(coef: number) {
    return <span className="eqb-chip eqb-x">{coef === 1 ? "x" : `${coef}x`}</span>;
  }
  function constChip(v: number, cancel = false) {
    const pos = v > 0;
    return <span className={`eqb-chip ${pos ? "eqb-pos" : "eqb-neg"}${cancel ? " eqb-cancel" : ""}`}>{pos ? "+" : "−"}{Math.abs(v)}</span>;
  }
  function numChip(v: number) {
    return <span className="eqb-chip eqb-rhs">{v}</span>;
  }

  function EquationRow({ row, active }: { row: Row; active: boolean }) {
    const e = row.eq;
    const showZeroPair = active && anim?.kind === "cancel";
    return (
      <div className="eqb-row">
        <div className="eqb-note">{row.note !== "Start" ? row.note : ""}</div>
        <div className="eqb-eq">
          <span className="eqb-side">
            {varChip(e.coef)}
            {e.constant !== 0 && constChip(e.constant, showZeroPair)}
            {showZeroPair && <span className="eqb-zero" aria-hidden>{constChip(-e.constant, true)}<em>zero pair = 0</em></span>}
          </span>
          <span className="eqb-eqsign">=</span>
          <span className="eqb-side">
            {numChip(e.rhs)}
            {showZeroPair && <span className="eqb-incoming">{constChip(-e.constant)}</span>}
            {active && anim?.kind === "divide" && <span className="eqb-divlabel">÷{anim.n}</span>}
          </span>
          {active && anim?.kind === "divide" && <span className="eqb-divlabel-left">÷{anim.n}</span>}
        </div>
      </div>
    );
  }

  const solved = phase === "solved" && eq;

  return (
    <div className="eqb-root">
      <style>{`
        .eqb-root { min-height:100vh; background:#0b0d14; color:#fff; font-family:Inter,ui-sans-serif,system-ui,sans-serif; display:grid; grid-template-rows:auto 1fr auto; }
        .eqb-top { display:flex; align-items:center; justify-content:space-between; padding:14px 24px; border-bottom:1px solid #1f2332; flex-wrap:wrap; gap:8px; }
        .eqb-mark { font-size:0.76rem; font-weight:900; letter-spacing:0.14em; text-transform:uppercase; color:#22c55e; margin:0; }
        .eqb-btn { font-size:0.8rem; font-weight:800; color:#8a93ad; background:transparent; border:1px solid #1f2332; border-radius:7px; padding:8px 13px; cursor:pointer; text-decoration:none; }
        .eqb-btn:hover { border-color:#22c55e; color:#fff; }

        .eqb-main { padding:24px; display:grid; gap:22px; align-content:start; justify-items:center; max-width:920px; margin:0 auto; width:100%; }

        /* Builder */
        .eqb-build { display:grid; gap:16px; justify-items:center; width:100%; }
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

        /* Worked solution */
        .eqb-rows { display:grid; gap:14px; width:100%; }
        .eqb-row { display:grid; grid-template-columns:1fr auto; gap:18px; align-items:center; animation:eqbDrop 0.5s ease; }
        @keyframes eqbDrop { from{opacity:0; transform:translateY(-14px);} to{opacity:1; transform:none;} }
        .eqb-note { text-align:right; font-size:0.86rem; font-weight:700; color:#5a6280; line-height:1.4; }
        .eqb-eq { display:flex; align-items:center; gap:16px; justify-self:end; }
        .eqb-side { display:flex; align-items:center; gap:8px; position:relative; }
        .eqb-eqsign { font-size:clamp(1.8rem,5vw,2.8rem); font-weight:900; color:#8a93ad; }
        .eqb-chip { display:inline-flex; align-items:center; justify-content:center; font-weight:900; border-radius:11px; padding:10px 14px; font-size:clamp(1.2rem,3.4vw,1.9rem); min-width:46px; box-shadow:0 4px 12px -6px rgba(0,0,0,0.6); }
        .eqb-x { background:#22c55e; color:#04230f; }
        .eqb-pos { background:#f59e0b; color:#3a2503; }
        .eqb-neg { background:#ef4444; color:#3a0606; }
        .eqb-rhs { background:#4e6ef2; color:#06122e; }
        .eqb-cancel { animation:eqbPoof 1.6s ease forwards; }
        @keyframes eqbPoof { 0%{} 55%{box-shadow:0 0 0 3px #ef4444; transform:scale(1.06);} 100%{opacity:0.12; transform:scale(0.6) rotate(-8deg);} }
        .eqb-zero { position:absolute; left:0; top:-40px; display:flex; flex-direction:column; align-items:center; gap:2px; }
        .eqb-zero em { font-style:normal; font-size:0.7rem; font-weight:800; color:#fca5a5; white-space:nowrap; }
        .eqb-incoming { animation:eqbFly 1.6s ease; }
        @keyframes eqbFly { 0%{opacity:0; transform:translateX(-90px) scale(0.6);} 60%{opacity:1; transform:translateX(0) scale(1.05);} 100%{opacity:1; transform:none;} }
        .eqb-divlabel,.eqb-divlabel-left { font-size:1rem; font-weight:900; color:#67e8f9; background:rgba(6,182,212,0.12); border:1px solid rgba(6,182,212,0.4); border-radius:8px; padding:4px 9px; animation:eqbPulse 0.8s ease-in-out infinite; }
        .eqb-divlabel-left { position:absolute; left:-54px; }
        @keyframes eqbPulse { 50%{opacity:0.5;} }

        /* Guided panel */
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
        {phase === "build" ? (
          <div className="eqb-build">
            <div className="eqb-rows"><div className="eqb-row"><div className="eqb-note" /><div className="eqb-eq">
              {varChip(a)}{b !== 0 && constChip(b)}<span className="eqb-eqsign">=</span>{numChip(c)}
            </div></div></div>
            <div className="eqb-steppers">
              {([["coefficient (a)", a, setA, 1, 6], ["constant (b)", b, setB, -10, 10], ["answer x", xAns, setXAns, 1, 12]] as [string, number, (n: number) => void, number, number][]).map(([label, val, set, min, max]) => (
                <div className="eqb-stp" key={label}>
                  <span className="eqb-stp-label">{label}</span>
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
            <div className="eqb-rows">
              {rows.map((r, i) => <EquationRow key={i} row={r} active={i === rows.length - 1} />)}
            </div>

            {solved ? (
              <div className="eqb-solved">
                <div className="eqb-solved-eq">x = {eq!.rhs} 🎉</div>
                <p className="eqb-feedback">Solved{wrong === 0 ? " with no mistakes — nice!" : "!"} The variable is isolated.</p>
                <button className="eqb-start" onClick={reset}>↻ New equation</button>
              </div>
            ) : phase === "animating" ? (
              <p className="eqb-q">{anim?.kind === "cancel" ? "Zero pair — they cancel out…" : "Dividing both sides…"}</p>
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
        <span className="eqb-feedback" style={{ minHeight: 0 }}>{phase !== "build" && !solved ? "Pick the operation, then the number. Watch the zero pair cancel and drop to the next line." : ""}</span>
        <a className="eqb-btn" href="/control">Control panel</a>
      </footer>
    </div>
  );
}
