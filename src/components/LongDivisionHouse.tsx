"use client";

// Long Division — the standard algorithm in the "house" (M1.T3.L4 "Dividend in
// the House", 6.NS.3). Whole-number division only, on purpose: long division is
// its own idea, not tied to decimals. A guided demo walks the Divide, Multiply,
// Subtract, Bring down cycle one step at a time — the active step and its digits
// blink, an arching arrow shows the move, completed steps grey, and the four
// steps reset for each new quotient digit. Support fades across the problem set
// (arrows, then blinking, then the step list) until the student works a bare
// house; a Hint re-lights the current step on demand. Optional-support: no
// scoring.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const C_TEAL = "#50a3a4";
const C_AMBER = "#fcaf38";
const C_CORAL = "#f95335";
const C_GREEN = "#2f9e6f";
const C_INK = "#201e1a";

type StepKind = "divide" | "multiply" | "subtract" | "bringdown";
const STEPS: { kind: StepKind; label: string; op: string }[] = [
  { kind: "divide", label: "Divide", op: "÷" },
  { kind: "multiply", label: "Multiply", op: "×" },
  { kind: "subtract", label: "Subtract", op: "−" },
  { kind: "bringdown", label: "Bring down", op: "↓" },
];

interface Cell { id: string; col: number; row: number; text: string; kind: string; revealAt: number }
interface Move { step: StepKind; reveal: string[]; highlight: string[]; arrow: { type: StepKind; from: [number, number]; to: [number, number] }; cycle: number }

// All whole-number, exact quotients, first digit >= divisor (no leading gap).
const PROBLEMS = [
  { dividend: 84, divisor: 4 },
  { dividend: 738, divisor: 6 },
  { dividend: 875, divisor: 5 },
  { dividend: 618, divisor: 6 }, // a zero in the quotient
  { dividend: 952, divisor: 7 },
];

function buildTrace(dividend: number, divisor: number): { cells: Cell[]; moves: Move[] } {
  const digits = String(dividend).split("").map(Number);
  const nd = digits.length;
  const cells: Cell[] = [];
  const moves: Move[] = [];
  digits.forEach((d, c) => cells.push({ id: `d${c}`, col: c, row: 1, text: String(d), kind: "dividend", revealAt: -1 }));

  let cur = 0;
  let firstFound = false;
  let k = 0;
  let currentIds: string[] = [];

  for (let c = 0; c < nd; c++) {
    cur = cur * 10 + digits[c];
    if (!firstFound) {
      currentIds = digits.slice(0, c + 1).map((_, i) => `d${i}`);
      if (cur < divisor) continue;
    }
    firstFound = true;
    const q = Math.floor(cur / divisor);
    const prod = q * divisor;
    const diff = cur - prod;
    const prodStr = String(prod);
    const diffStr = String(diff);
    const prodRow = 2 + 2 * k;
    const diffRow = 3 + 2 * k;

    const qId = `q${c}`;
    cells.push({ id: qId, col: c, row: 0, text: String(q), kind: "quotient", revealAt: moves.length });
    moves.push({ step: "divide", reveal: [qId], highlight: [...currentIds, "divisor"], arrow: { type: "divide", from: [c, 1], to: [c, 0] }, cycle: k });

    const prodIds: string[] = [];
    for (let j = 0; j < prodStr.length; j++) {
      const col = c - prodStr.length + 1 + j;
      const id = `p${k}_${j}`;
      cells.push({ id, col, row: prodRow, text: prodStr[j], kind: "product", revealAt: moves.length });
      prodIds.push(id);
    }
    moves.push({ step: "multiply", reveal: prodIds, highlight: [qId, "divisor"], arrow: { type: "multiply", from: [c, 0], to: [c, prodRow] }, cycle: k });

    const diffIds: string[] = [];
    for (let j = 0; j < diffStr.length; j++) {
      const col = c - diffStr.length + 1 + j;
      const id = `f${k}_${j}`;
      cells.push({ id, col, row: diffRow, text: diffStr[j], kind: "diff", revealAt: moves.length });
      diffIds.push(id);
    }
    moves.push({ step: "subtract", reveal: diffIds, highlight: [...currentIds, ...prodIds], arrow: { type: "subtract", from: [c, prodRow], to: [c, diffRow] }, cycle: k });

    if (c < nd - 1) {
      const bId = `b${k}`;
      cells.push({ id: bId, col: c + 1, row: diffRow, text: String(digits[c + 1]), kind: "bring", revealAt: moves.length });
      moves.push({ step: "bringdown", reveal: [bId], highlight: [`d${c + 1}`, bId], arrow: { type: "bringdown", from: [c + 1, 1], to: [c + 1, diffRow] }, cycle: k });
      currentIds = [...diffIds, bId];
    } else {
      currentIds = diffIds;
    }
    cur = diff; // continue from the remainder, then the next bring-down appends a digit
    k++;
  }
  return { cells, moves };
}

const CW = 46;
const CH = 52;
const OX = 74;
const TOP = 14;
const cx = (col: number) => OX + col * CW + CW / 2;
const cy = (row: number) => TOP + row * CH + CH / 2;

const KIND_COLOR: Record<string, string> = { quotient: C_TEAL, product: C_AMBER, diff: C_CORAL, bring: C_GREEN, dividend: C_INK };

export default function LongDivisionHouse() {
  const [pIdx, setPIdx] = useState(0);
  const [move, setMove] = useState(-1);
  const [hint, setHint] = useState(false);
  const [auto, setAuto] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const problem = PROBLEMS[pIdx];
  const { cells, moves } = useMemo(() => buildTrace(problem.dividend, problem.divisor), [problem.dividend, problem.divisor]);
  const nd = String(problem.dividend).length;
  const quotient = problem.dividend / problem.divisor;
  const done = move >= moves.length - 1;
  const active = move >= 0 && move < moves.length ? moves[move] : null;

  // fading supports
  const showArrows = hint || pIdx === 0;
  const blinkOn = hint || pIdx <= 1;
  const highlightSteps = hint || pIdx <= 2;
  const showStepList = pIdx <= 3;

  const next = useCallback(() => setMove((m) => Math.min(m + 1, moves.length - 1)), [moves.length]);

  useEffect(() => {
    if (!auto || done) return;
    const t = setTimeout(next, 1400);
    return () => clearTimeout(t);
  }, [auto, done, move, next]);

  useEffect(() => () => { if (hintTimer.current) clearTimeout(hintTimer.current); }, []);

  function loadProblem(i: number) {
    setPIdx(i); setMove(-1); setHint(false); setAuto(false);
  }
  function fireHint() {
    if (!active) return;
    setHint(true);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(false), 2000);
  }

  const maxRow = cells.reduce((m, c) => Math.max(m, c.row), 1);
  const width = OX + nd * CW + 72; // right margin for the subtract / bring-down arcs
  const height = TOP + (maxRow + 1) * CH + 10;
  const barY = TOP + CH;
  const rightX = OX + nd * CW + 6;

  const shownCells = cells.filter((c) => c.revealAt <= move);
  const hlSet = new Set(active ? [...active.reveal, ...active.highlight] : []);
  const activeStepIdx = active ? STEPS.findIndex((s) => s.kind === active.step) : -1;

  // arrow path for the active move
  function arrowPath(a: Move["arrow"]): { d: string; mid: [number, number] } {
    const [fc, fr] = a.from;
    const [tc, tr] = a.to;
    const x1 = cx(fc), y1 = cy(fr), x2 = cx(tc), y2 = cy(tr);
    if (a.type === "divide") {
      const d = `M ${x1} ${y1 - 16} Q ${x1 - 26} ${(y1 + y2) / 2} ${x2} ${y2 + 16}`;
      return { d, mid: [x1 - 20, (y1 + y2) / 2] };
    }
    if (a.type === "multiply") {
      const d = `M ${x1} ${y1 + 16} Q ${x1 + 30} ${(y1 + y2) / 2} ${x2} ${y2 - 16}`;
      return { d, mid: [x1 + 26, (y1 + y2) / 2] };
    }
    if (a.type === "subtract") {
      const d = `M ${x1 + 20} ${y1} Q ${x1 + 36} ${(y1 + y2) / 2} ${x2 + 20} ${y2}`;
      return { d, mid: [x1 + 34, (y1 + y2) / 2] };
    }
    // bringdown
    const d = `M ${x1} ${y1 + 16} Q ${x2 + 34} ${(y1 + y2) / 2} ${x2} ${y2 - 14}`;
    return { d, mid: [x2 + 30, (y1 + y2) / 2] };
  }

  return (
    <div className="ld-wrap">
      <style>{`
        .ld-wrap { font-family:var(--bdb-font); color:var(--bdb-ink); max-width:900px; margin:0 auto; padding:16px clamp(10px,3vw,20px) 34px; }
        .ld-prompt { text-align:center; font-size:clamp(1.1rem,3.2vw,1.5rem); font-weight:800; margin:2px 0 4px; }
        .ld-sub { text-align:center; color:var(--bdb-ink-soft); font-size:0.92rem; margin:0 0 14px; min-height:20px; }
        .ld-main { display:flex; gap:18px; align-items:flex-start; justify-content:center; flex-wrap:wrap; }
        .ld-steps { display:flex; flex-direction:column; gap:8px; width:168px; flex:none; }
        .ld-step { display:flex; align-items:center; gap:10px; padding:9px 12px; border:2px solid var(--bdb-line); border-radius:12px; background:var(--bdb-card); }
        .ld-step .n { display:grid; place-items:center; width:26px; height:26px; border-radius:50%; background:var(--bdb-ground-2); color:var(--bdb-ink-soft); font-weight:900; font-size:0.9rem; flex:none; }
        .ld-step .t { font-weight:800; font-size:0.98rem; }
        .ld-step.active { border-color:var(--bdb-ink); background:color-mix(in srgb, ${C_TEAL} 12%, var(--bdb-card)); }
        .ld-step.active .n { background:${C_TEAL}; color:#fff; }
        .ld-step.done { opacity:0.42; }
        .ld-step.blink { animation:ldBlink 1s ease-in-out infinite; }
        .ld-svgwrap { overflow-x:auto; }
        .ld-cell { animation:ldPop .28s cubic-bezier(.34,.8,.3,1) backwards; }
        .ld-blink { animation:ldBlink 1s ease-in-out infinite; transform-box:fill-box; transform-origin:center; }
        @keyframes ldBlink { 0%,100% { opacity:1; } 50% { opacity:0.28; } }
        @keyframes ldPop { from { opacity:0; transform:translateY(-6px) scale(.7); } to { opacity:1; transform:none; } }
        .ld-bar { display:flex; gap:10px; justify-content:center; align-items:center; margin-top:18px; flex-wrap:wrap; }
        .ld-btn { font:inherit; font-weight:800; font-size:0.98rem; min-height:48px; padding:0 22px; border-radius:13px; border:2px solid var(--bdb-ink); background:var(--bdb-ink); color:#fff; cursor:pointer; }
        .ld-btn:disabled { opacity:0.4; cursor:not-allowed; }
        .ld-btn.ghost { background:var(--bdb-card); color:var(--bdb-ink); }
        .ld-pill { font:inherit; font-weight:800; font-size:0.88rem; min-height:42px; padding:0 14px; border-radius:999px; border:1px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink-soft); cursor:pointer; }
        .ld-pill.on { background:var(--bdb-ink); color:#fff; border-color:var(--bdb-ink); }
        .ld-probs { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-top:12px; }
        .ld-done { text-align:center; font-weight:900; font-size:clamp(1.2rem,3.6vw,1.6rem); margin-top:12px; color:${C_GREEN}; min-height:26px; }
        @media (prefers-reduced-motion: reduce) { .ld-blink, .ld-step.blink { animation:none; } .ld-cell { animation:none; } }
      `}</style>

      <div className="ld-prompt">{problem.dividend} ÷ {problem.divisor}</div>
      <div className="ld-sub">
        {pIdx === 0 ? "Full guidance: every step blinks and an arrow shows the move."
          : pIdx === 1 ? "The arrows are gone now — the steps still light up."
          : pIdx === 2 ? "No blinking. Follow the numbered steps yourself."
          : pIdx === 3 ? "Just the step list to lean on."
          : "On your own. Use Hint if you get stuck."}
      </div>

      <div className="ld-main">
        {showStepList && (
          <div className="ld-steps">
            {STEPS.map((s, i) => {
              const isActive = highlightSteps && activeStepIdx === i;
              const isDone = highlightSteps && activeStepIdx > i;
              return (
                <div key={s.kind} className={`ld-step ${isActive ? "active" : ""} ${isDone ? "done" : ""} ${isActive && blinkOn ? "blink" : ""}`}>
                  <span className="n">{i + 1}</span>
                  <span className="t">{s.label}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="ld-svgwrap">
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
            aria-label={`Long division of ${problem.dividend} by ${problem.divisor}`}>
            <defs>
              <marker id="ld-ah" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill={C_INK} />
              </marker>
            </defs>

            {/* the house: top bar over dividend, left wall */}
            <path d={`M ${OX - 4} ${barY + CH} L ${OX - 4} ${barY} L ${rightX} ${barY}`}
              fill="none" stroke={C_INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            {/* divisor */}
            <text x={OX - 14} y={cy(1) + 10} textAnchor="end" fontSize="30" fontWeight="900" fill={C_INK}>{problem.divisor}</text>

            {/* cells */}
            {shownCells.map((c) => {
              const hot = hlSet.has(c.id) || (c.kind === "dividend" && false);
              return (
                <g key={c.id} className="ld-cell">
                  {hot && (
                    <rect x={cx(c.col) - 19} y={cy(c.row) - 22} width="38" height="42" rx="7"
                      fill={`color-mix(in srgb, ${KIND_COLOR[c.kind] || C_INK} 20%, transparent)`}
                      className={blinkOn ? "ld-blink" : ""} />
                  )}
                  <text x={cx(c.col)} y={cy(c.row) + 10} textAnchor="middle" fontSize="30" fontWeight="900"
                    fill={KIND_COLOR[c.kind] || C_INK} className={hot && blinkOn ? "ld-blink" : ""}>{c.text}</text>
                </g>
              );
            })}

            {/* active arrow */}
            {active && showArrows && (() => {
              const { d, mid } = arrowPath(active.arrow);
              return (
                <g>
                  <path d={d} fill="none" stroke={C_INK} strokeWidth="2.5" markerEnd="url(#ld-ah)" opacity="0.85" />
                  <circle cx={mid[0]} cy={mid[1]} r="12" fill="var(--bdb-card)" stroke={C_INK} strokeWidth="1.5" />
                  <text x={mid[0]} y={mid[1] + 6} textAnchor="middle" fontSize="17" fontWeight="900" fill={C_INK}>{STEPS[activeStepIdx]?.op}</text>
                </g>
              );
            })()}
          </svg>
        </div>
      </div>

      <div className="ld-done">{done ? `${problem.dividend} ÷ ${problem.divisor} = ${quotient}` : ""}</div>

      <div className="ld-bar">
        {!done ? (
          <button className="ld-btn" onClick={next}>{move < 0 ? "Start" : "Next step"}</button>
        ) : (
          <button className="ld-btn" onClick={() => setMove(-1)}>Replay</button>
        )}
        <button className="ld-btn ghost" onClick={fireHint} disabled={!active || done}>Hint</button>
        <button className={`ld-pill ${auto ? "on" : ""}`} onClick={() => setAuto((a) => !a)}>{auto ? "Auto-lead: on" : "Auto-lead"}</button>
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
