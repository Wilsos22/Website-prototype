"use client";

// Long Division — the standard algorithm in the house (M1.T3.L4 "Dividend in
// the House", 6.NS.3), whole numbers only. Steps live beside the problem
// (Divide, Multiply, Subtract, Bring down); the active step highlights, done
// steps grey, and the four reset for each quotient digit. Three modes:
//   Teacher-led  — auto-plays the steps for front-of-room modeling.
//   Step by step — you advance one step at a time.
//   Practice     — the student types each number into an input box that sits in
//                  the exact right spot, so the tool guarantees WHERE each digit
//                  goes while the student supplies the value.
// Optional-support: no scoring.

import { useEffect, useMemo, useRef, useState } from "react";

const C_TEAL = "#50a3a4";
const C_AMBER = "#fcaf38";
const C_CORAL = "#f95335";
const C_GREEN = "#2f9e6f";
const C_INK = "#201e1a";

type StepKind = "divide" | "multiply" | "subtract" | "bringdown";
const STEPS: { kind: StepKind; label: string }[] = [
  { kind: "divide", label: "Divide" },
  { kind: "multiply", label: "Multiply" },
  { kind: "subtract", label: "Subtract" },
  { kind: "bringdown", label: "Bring down" },
];
type Mode = "teacher" | "step" | "practice";

interface Cell { id: string; col: number; row: number; text: string; kind: string; revealAt: number }
interface Move { step: StepKind; reveal: string[]; answer: number; prompt: string; cycle: number }

const PROBLEMS = [
  { dividend: 738, divisor: 6 },
  { dividend: 84, divisor: 4 },
  { dividend: 875, divisor: 5 },
  { dividend: 618, divisor: 6 },
  { dividend: 952, divisor: 7 },
];

function buildTrace(dividend: number, divisor: number): { cells: Cell[]; moves: Move[]; quotient: number } {
  const digits = String(dividend).split("").map(Number);
  const nd = digits.length;
  const cells: Cell[] = [];
  const moves: Move[] = [];
  digits.forEach((d, c) => cells.push({ id: `d${c}`, col: c, row: 1, text: String(d), kind: "dividend", revealAt: -1 }));

  let cur = 0, firstFound = false, k = 0;
  for (let c = 0; c < nd; c++) {
    cur = cur * 10 + digits[c];
    if (!firstFound && cur < divisor) continue;
    firstFound = true;
    const q = Math.floor(cur / divisor);
    const prod = q * divisor;
    const diff = cur - prod;
    const prodStr = String(prod), diffStr = String(diff);
    const prodRow = 2 + 2 * k, diffRow = 3 + 2 * k;

    cells.push({ id: `q${c}`, col: c, row: 0, text: String(q), kind: "quotient", revealAt: moves.length });
    moves.push({ step: "divide", reveal: [`q${c}`], answer: q, prompt: `How many ${divisor}s go into ${cur}?`, cycle: k });

    const prodIds: string[] = [];
    for (let j = 0; j < prodStr.length; j++) {
      const col = c - prodStr.length + 1 + j;
      cells.push({ id: `p${k}_${j}`, col, row: prodRow, text: prodStr[j], kind: "product", revealAt: moves.length });
      prodIds.push(`p${k}_${j}`);
    }
    moves.push({ step: "multiply", reveal: prodIds, answer: prod, prompt: `${q} × ${divisor} = ?`, cycle: k });

    const diffIds: string[] = [];
    for (let j = 0; j < diffStr.length; j++) {
      const col = c - diffStr.length + 1 + j;
      cells.push({ id: `f${k}_${j}`, col, row: diffRow, text: diffStr[j], kind: "diff", revealAt: moves.length });
      diffIds.push(`f${k}_${j}`);
    }
    moves.push({ step: "subtract", reveal: diffIds, answer: diff, prompt: `${cur} − ${prod} = ?`, cycle: k });

    if (c < nd - 1) {
      cells.push({ id: `b${k}`, col: c + 1, row: diffRow, text: String(digits[c + 1]), kind: "bring", revealAt: moves.length });
      moves.push({ step: "bringdown", reveal: [`b${k}`], answer: digits[c + 1], prompt: `Bring down the ${digits[c + 1]}.`, cycle: k });
    }
    cur = diff;
    k++;
  }
  return { cells, moves, quotient: Math.floor(dividend / divisor) };
}

const KIND_COLOR: Record<string, string> = { quotient: C_TEAL, product: C_AMBER, diff: C_CORAL, bring: C_GREEN, dividend: C_INK };

export default function LongDivision() {
  const [pIdx, setPIdx] = useState(0);
  const [mode, setMode] = useState<Mode>("teacher");
  const [move, setMove] = useState(-1); // last revealed move
  const [entry, setEntry] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [wrong, setWrong] = useState(0);

  const problem = PROBLEMS[pIdx];
  const { cells, moves, quotient } = useMemo(() => buildTrace(problem.dividend, problem.divisor), [problem.dividend, problem.divisor]);
  const nd = String(problem.dividend).length;
  const maxRow = cells.reduce((m, c) => Math.max(m, c.row), 1);
  const done = move >= moves.length - 1;

  // the move currently in focus: last revealed (teacher/step) or next to enter (practice)
  const focusIdx = mode === "practice" ? move + 1 : move;
  const focus = focusIdx >= 0 && focusIdx < moves.length ? moves[focusIdx] : null;
  const activeStepIdx = focus ? STEPS.findIndex((s) => s.kind === focus.step) : -1;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (mode !== "teacher" || done || move < -1) return;
    timer.current = setTimeout(() => setMove((m) => Math.min(m + 1, moves.length - 1)), move < 0 ? 700 : 1500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [mode, move, done, moves.length]);

  function reset(m: Mode = mode) { setMode(m); setMove(-1); setEntry(""); setNote(null); setWrong(0); }
  function loadProblem(i: number) { setPIdx(i); setMove(-1); setEntry(""); setNote(null); setWrong(0); }
  function nextStep() { setMove((m) => Math.min(m + 1, moves.length - 1)); }

  function submit() {
    if (!focus) return;
    const v = Number(entry.trim());
    if (!entry.trim() || !Number.isFinite(v)) return;
    if (v === focus.answer) {
      setNote(null); setEntry(""); setWrong(0);
      setMove(focusIdx);
    } else {
      setWrong((w) => w + 1);
      setNote(wrong >= 1 ? `${focus.prompt.replace("?", "")}= ${focus.answer}. Type ${focus.answer}.` : `Not quite. ${focus.prompt}`);
    }
  }

  const cellById = (id: string) => cells.find((c) => c.id === id);
  const shown = (c: Cell) => c.revealAt < 0 || c.revealAt <= move;
  // grid position of the active practice input (span the focus move's reveal cells)
  const inputSpan = (() => {
    if (mode !== "practice" || !focus || done && false) return null;
    if (!focus) return null;
    const rc = focus.reveal.map(cellById).filter(Boolean) as Cell[];
    if (!rc.length) return null;
    const cols = rc.map((c) => c.col);
    return { row: rc[0].row, min: Math.min(...cols), max: Math.max(...cols) };
  })();

  return (
    <div className="ld-wrap">
      <style>{`
        .ld-wrap { font-family:var(--bdb-font); color:var(--bdb-ink); max-width:820px; margin:0 auto; padding:16px clamp(10px,3vw,20px) 34px; }
        .ld-modebar { display:flex; justify-content:center; margin:0 0 12px; }
        .ld-modeseg { display:inline-flex; border:2px solid var(--bdb-line); border-radius:22px; overflow:hidden; background:var(--bdb-card); }
        .ld-modeseg button { font:inherit; font-weight:800; font-size:0.86rem; min-height:44px; padding:0 16px; border:none; background:transparent; color:var(--bdb-ink-soft); cursor:pointer; }
        .ld-modeseg button.on { background:var(--bdb-ink); color:#fff; }
        .ld-prompt { text-align:center; font-size:clamp(1.2rem,3.6vw,1.6rem); font-weight:900; margin:2px 0 2px; }
        .ld-cap { text-align:center; color:var(--bdb-ink-soft); font-weight:700; font-size:clamp(0.95rem,2.8vw,1.12rem); margin:0 0 16px; min-height:24px; }
        .ld-main { display:flex; gap:clamp(20px,6vw,56px); justify-content:center; align-items:flex-start; }
        .ld-steps { display:flex; flex-direction:column; gap:8px; width:170px; flex:none; }
        .ld-step { display:flex; align-items:center; gap:10px; padding:10px 12px; border:2px solid var(--bdb-line); border-radius:12px; background:var(--bdb-card); }
        .ld-step .n { display:grid; place-items:center; width:26px; height:26px; border-radius:50%; background:var(--bdb-ground-2); color:var(--bdb-ink-soft); font-weight:900; font-size:0.9rem; flex:none; }
        .ld-step .t { font-weight:800; font-size:0.98rem; }
        .ld-step.on { border-color:var(--bdb-ink); background:color-mix(in srgb, ${C_TEAL} 12%, var(--bdb-card)); }
        .ld-step.on .n { background:${C_TEAL}; color:#fff; }
        .ld-step.done { opacity:0.4; }
        .ld-housewrap { display:flex; align-items:flex-start; gap:10px; }
        .ld-divisor { font-size:30px; font-weight:900; line-height:52px; padding-top:52px; }
        .ld-grid { display:grid; }
        .ld-cellbox { display:grid; place-items:center; width:46px; height:52px; }
        .ld-cellbox.bar { border-top:3px solid ${C_INK}; }
        .ld-cellbox.wall { border-left:3px solid ${C_INK}; }
        .ld-digit { font-size:30px; font-weight:900; }
        .ld-digit.appear { animation:ldIn .3s cubic-bezier(.34,.8,.3,1) backwards; }
        @keyframes ldIn { from { opacity:0; transform:translateY(-5px) scale(.7); } to { opacity:1; transform:none; } }
        .ld-in { width:100%; height:44px; font:inherit; font-size:24px; font-weight:900; text-align:center; border:3px solid ${C_TEAL}; border-radius:8px; background:#fff; color:var(--bdb-ink); padding:0; }
        .ld-done { text-align:center; font-weight:900; font-size:clamp(1.3rem,4vw,1.7rem); color:${C_GREEN}; margin-top:14px; min-height:28px; }
        .ld-note { text-align:center; min-height:26px; margin-top:10px; }
        .ld-note-in { display:inline-block; color:var(--bdb-coral); font-weight:800; font-size:clamp(1rem,3vw,1.25rem); padding:8px 16px; border-radius:12px; background:color-mix(in srgb, var(--bdb-coral) 12%, transparent); }
        .ld-bar2 { display:flex; gap:10px; justify-content:center; align-items:center; margin-top:16px; flex-wrap:wrap; }
        .ld-btn { font:inherit; font-weight:800; font-size:0.98rem; min-height:48px; padding:0 22px; border-radius:13px; border:2px solid var(--bdb-ink); background:var(--bdb-ink); color:#fff; cursor:pointer; }
        .ld-btn.ghost { background:var(--bdb-card); color:var(--bdb-ink); }
        .ld-btn:disabled { opacity:0.4; cursor:not-allowed; }
        .ld-probs { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-top:12px; }
        .ld-pill { font:inherit; font-weight:800; font-size:0.88rem; min-height:42px; padding:0 14px; border-radius:999px; border:1px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink-soft); cursor:pointer; }
        .ld-pill.on { background:var(--bdb-ink); color:#fff; border-color:var(--bdb-ink); }
        @media (prefers-reduced-motion: reduce) { .ld-digit.appear { animation:none; } }
      `}</style>

      <div className="ld-modebar">
        <div className="ld-modeseg">
          <button className={mode === "teacher" ? "on" : ""} onClick={() => reset("teacher")}>Teacher-led</button>
          <button className={mode === "step" ? "on" : ""} onClick={() => reset("step")}>Step by step</button>
          <button className={mode === "practice" ? "on" : ""} onClick={() => reset("practice")}>Practice</button>
        </div>
      </div>

      <div className="ld-prompt">{problem.dividend} ÷ {problem.divisor}</div>
      <div className="ld-cap">
        {done ? "Solved." : focus ? focus.prompt : mode === "practice" ? "Fill each box. Start: how many fit into the first digits?" : mode === "teacher" ? "Watch each step." : "Click Next step to begin."}
      </div>

      <div className="ld-main">
        <div className="ld-steps">
          {STEPS.map((s, i) => {
            const on = activeStepIdx === i && !done;
            const isDone = !done && activeStepIdx > i;
            return (
              <div key={s.kind} className={`ld-step ${on ? "on" : ""} ${isDone ? "done" : ""}`}>
                <span className="n">{i + 1}</span><span className="t">{s.label}</span>
              </div>
            );
          })}
        </div>

        <div className="ld-housewrap">
          <div className="ld-divisor">{problem.divisor}</div>
          <div className="ld-grid" style={{ gridTemplateColumns: `repeat(${nd}, 46px)`, gridTemplateRows: `repeat(${maxRow + 1}, 52px)` }}>
            {cells.filter(shown).map((c) => (
              <div key={c.id} className={`ld-cellbox ${c.row === 1 ? "bar" : ""} ${c.row === 1 && c.col === 0 ? "wall" : ""}`} style={{ gridColumn: c.col + 1, gridRow: c.row + 1 }}>
                <span className={`ld-digit ${c.revealAt === move ? "appear" : ""}`} style={{ color: KIND_COLOR[c.kind] || C_INK }}>{c.text}</span>
              </div>
            ))}
            {inputSpan && !done && (
              <div className="ld-cellbox" style={{ gridColumn: `${inputSpan.min + 1} / ${inputSpan.max + 2}`, gridRow: inputSpan.row + 1, width: "auto", padding: "0 3px" }}>
                <input className="ld-in" value={entry} inputMode="numeric" autoFocus aria-label="your answer"
                  onChange={(e) => { setEntry(e.target.value.replace(/\D/g, "")); setNote(null); }}
                  onKeyDown={(e) => e.key === "Enter" && submit()} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="ld-done">{done ? `${problem.dividend} ÷ ${problem.divisor} = ${quotient}` : ""}</div>
      <div className="ld-note">{note && <span key={note} className="ld-note-in">{note}</span>}</div>

      <div className="ld-bar2">
        {mode === "practice" && !done ? (
          <button className="ld-btn" disabled={!entry.trim()} onClick={submit}>Check</button>
        ) : mode === "step" && !done ? (
          <button className="ld-btn" onClick={nextStep}>{move < 0 ? "Start" : "Next step"}</button>
        ) : done ? (
          <button className="ld-btn" onClick={() => reset()}>Replay</button>
        ) : (
          <button className="ld-btn ghost" onClick={() => reset()}>Restart</button>
        )}
        {pIdx + 1 < PROBLEMS.length && (
          <button className="ld-btn ghost" onClick={() => loadProblem(pIdx + 1)}>Next problem</button>
        )}
      </div>

      <div className="ld-probs">
        {PROBLEMS.map((p, i) => (
          <button key={i} className={`ld-pill ${i === pIdx ? "on" : ""}`} onClick={() => loadProblem(i)}>{p.dividend} ÷ {p.divisor}</button>
        ))}
      </div>
    </div>
  );
}
