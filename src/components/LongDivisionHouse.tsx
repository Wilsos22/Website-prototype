"use client";

// Long Division — the standard algorithm in the "house" (M1.T3.L4 "Dividend in
// the House", 6.NS.3). Whole-number division only, on purpose. A guided,
// choreographed demo walks Divide, Multiply, Subtract, Bring down one step at a
// time: the active step and its digits pulse, the step's little equation
// assembles beside it, faint dotted trails arc the movement, the result travels
// into place and settles to black, the step greys, and the four steps reset for
// the next quotient digit. Support fades across the problem set. Optional-
// support: no scoring.

import { useEffect, useMemo, useRef, useState } from "react";

const C_TEAL = "#50a3a4";
const C_AMBER = "#fcaf38";
const C_CORAL = "#f95335";
const C_GREEN = "#2f9e6f";
const C_INK = "#201e1a";
const C_RED = "#e5322b";

type StepKind = "divide" | "multiply" | "subtract" | "bringdown";
const STEPS: { kind: StepKind; label: string; op: string; color: string }[] = [
  { kind: "divide", label: "Divide", op: "÷", color: C_TEAL },
  { kind: "multiply", label: "Multiply", op: "×", color: C_AMBER },
  { kind: "subtract", label: "Subtract", op: "−", color: C_CORAL },
  { kind: "bringdown", label: "Bring down", op: "↓", color: C_GREEN },
];

interface Cell { id: string; col: number; row: number; text: string; kind: string; revealAt: number }
interface Eq { a: number; b: number; c: number }
interface Move { step: StepKind; reveal: string[]; highlight: string[]; from: [number, number]; to: [number, number]; cycle: number; eq?: Eq }

const PROBLEMS = [
  { dividend: 738, divisor: 6 },
  { dividend: 84, divisor: 4 },
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
    moves.push({ step: "divide", reveal: [qId], highlight: [...currentIds, "divisor"], from: [c, 1], to: [c, 0], cycle: k, eq: { a: cur, b: divisor, c: q } });

    const prodIds: string[] = [];
    for (let j = 0; j < prodStr.length; j++) {
      const col = c - prodStr.length + 1 + j;
      const id = `p${k}_${j}`;
      cells.push({ id, col, row: prodRow, text: prodStr[j], kind: "product", revealAt: moves.length });
      prodIds.push(id);
    }
    moves.push({ step: "multiply", reveal: prodIds, highlight: [qId, "divisor"], from: [c, 0], to: [c, prodRow], cycle: k, eq: { a: q, b: divisor, c: prod } });

    const diffIds: string[] = [];
    for (let j = 0; j < diffStr.length; j++) {
      const col = c - diffStr.length + 1 + j;
      const id = `f${k}_${j}`;
      cells.push({ id, col, row: diffRow, text: diffStr[j], kind: "diff", revealAt: moves.length });
      diffIds.push(id);
    }
    moves.push({ step: "subtract", reveal: diffIds, highlight: [...currentIds, ...prodIds], from: [c, prodRow], to: [c, diffRow], cycle: k, eq: { a: cur, b: prod, c: diff } });

    if (c < nd - 1) {
      const bId = `b${k}`;
      cells.push({ id: bId, col: c + 1, row: diffRow, text: String(digits[c + 1]), kind: "bring", revealAt: moves.length });
      moves.push({ step: "bringdown", reveal: [bId], highlight: [`d${c + 1}`, bId], from: [c + 1, 1], to: [c + 1, diffRow], cycle: k });
      currentIds = [...diffIds, bId];
    } else {
      currentIds = diffIds;
    }
    cur = diff;
    k++;
  }
  return { cells, moves };
}

// layout
const CW = 46, CH = 52;
const SX = 8, SW = 186, SH = 54, SGAP = 10;
const stepTop = (i: number) => 14 + i * (SH + SGAP);
const stepMid = (i: number) => stepTop(i) + SH / 2;
const OX = 470, HTOP = 16;
const cx = (col: number) => OX + col * CW + CW / 2;
const cy = (row: number) => HTOP + row * CH + CH / 2;

const KIND_COLOR: Record<string, string> = { quotient: C_TEAL, product: C_AMBER, diff: C_CORAL, bring: C_GREEN, dividend: C_INK };

// phase counts per step: index of the "settled" phase
function phaseDurs(step: StepKind, flourish: boolean): number[] {
  if (!flourish) return [420];
  if (step === "divide") return [1100, 1300, 1300];
  return [1000, 1200];
}

export default function LongDivisionHouse() {
  const [pIdx, setPIdx] = useState(0);
  const [move, setMove] = useState(-1);
  const [phase, setPhase] = useState(0);
  const [auto, setAuto] = useState(false);
  const [replay, setReplay] = useState(0);

  const problem = PROBLEMS[pIdx];
  const { cells, moves } = useMemo(() => buildTrace(problem.dividend, problem.divisor), [problem.dividend, problem.divisor]);
  const nd = String(problem.dividend).length;
  const quotient = problem.dividend / problem.divisor;
  const done = move >= moves.length - 1;
  const active = move >= 0 && move < moves.length ? moves[move] : null;

  const showFlourish = pIdx === 0;
  const stepList = pIdx <= 3;
  const durs = active ? phaseDurs(active.step, showFlourish) : [];
  const FINAL = durs.length;
  const settled = phase >= FINAL;

  // drive the phase timeline whenever the active move (or a replay) changes
  useEffect(() => {
    if (move < 0 || move >= moves.length) return;
    const d = phaseDurs(moves[move].step, pIdx === 0);
    setPhase(0);
    let acc = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let p = 1; p <= d.length; p++) {
      acc += d[p - 1];
      timers.push(setTimeout(() => setPhase(p), acc));
    }
    return () => timers.forEach(clearTimeout);
  }, [move, moves, pIdx, replay]);

  // auto-advance once a step settles
  useEffect(() => {
    if (!auto || done || move < 0) return;
    if (settled) {
      const t = setTimeout(() => setMove((m) => Math.min(m + 1, moves.length - 1)), 650);
      return () => clearTimeout(t);
    }
  }, [auto, settled, move, done, moves.length]);

  function next() { setMove((m) => Math.min(m + 1, moves.length - 1)); }
  function loadProblem(i: number) { setPIdx(i); setMove(-1); setPhase(0); setAuto(false); }

  const cellById = (id: string) => cells.find((c) => c.id === id);
  const posOf = (id: string): [number, number] => {
    if (id === "divisor") return [OX - 20, cy(1)];
    const c = cellById(id);
    return c ? [cx(c.col), cy(c.row)] : [0, 0];
  };
  // center of the current chunk being divided (highlight cells minus divisor)
  function chunkPos(m: Move): [number, number] {
    const ids = m.highlight.filter((h) => h !== "divisor");
    if (!ids.length) return posOf("divisor");
    const ps = ids.map(posOf);
    return [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];
  }

  const maxRow = cells.reduce((m, c) => Math.max(m, c.row), 1);
  const width = OX + nd * CW + 92;
  const height = Math.max(stepTop(3) + SH + 12, HTOP + (maxRow + 1) * CH + 12);
  const barY = HTOP + CH;
  const rightX = OX + nd * CW + 6;

  const activeStepIdx = active ? STEPS.findIndex((s) => s.kind === active.step) : -1;
  const ey = active ? stepMid(activeStepIdx) : 0;

  // which phase a step's reveal cells become visible
  const revealPhase = (step: StepKind) => (step === "divide" && showFlourish ? FINAL : (showFlourish ? 1 : FINAL));
  function cellVisible(c: Cell): boolean {
    if (c.revealAt < 0) return true;
    if (c.revealAt < move) return true;
    if (c.revealAt === move) return phase >= revealPhase(active!.step);
    return false;
  }
  function cellHot(c: Cell): boolean {
    return c.revealAt === move && !settled && phase >= 1;
  }

  function arc(from: [number, number], to: [number, number], bow: number): string {
    const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2;
    return `M ${from[0]} ${from[1]} Q ${mx + bow} ${my - Math.abs(bow)} ${to[0]} ${to[1]}`;
  }

  // divide flourish geometry
  const divA = active && active.step === "divide" ? chunkPos(active) : [0, 0] as [number, number];
  const divQ = active && active.step === "divide" && active.reveal[0] ? posOf(active.reveal[0]) : [0, 0] as [number, number];
  const eqAx = 236, eqBx = 306, eqCx = 374;

  return (
    <div className="ld-wrap">
      <style>{`
        .ld-wrap { font-family:var(--bdb-font); color:var(--bdb-ink); max-width:960px; margin:0 auto; padding:16px clamp(10px,3vw,20px) 34px; }
        .ld-prompt { text-align:center; font-size:clamp(1.1rem,3.2vw,1.5rem); font-weight:800; margin:2px 0 4px; }
        .ld-sub { text-align:center; color:var(--bdb-ink-soft); font-size:0.92rem; margin:0 0 8px; min-height:20px; }
        .ld-svgwrap { overflow-x:auto; }
        .ld-pulse { animation:ldPulse 1.15s ease-in-out infinite; transform-box:fill-box; transform-origin:center; }
        @keyframes ldPulse { 0%,100% { opacity:1; } 50% { opacity:0.32; } }
        .ld-fly { transition:transform 1.15s cubic-bezier(.45,.05,.3,1), opacity .5s ease; }
        .ld-trail { transition:opacity .5s ease; }
        .ld-appear { animation:ldAppear .5s ease backwards; }
        @keyframes ldAppear { from { opacity:0; transform:translateY(-5px) scale(.7); } to { opacity:1; transform:none; } }
        .ld-bar { display:flex; gap:10px; justify-content:center; align-items:center; margin-top:14px; flex-wrap:wrap; }
        .ld-btn { font:inherit; font-weight:800; font-size:0.98rem; min-height:48px; padding:0 22px; border-radius:13px; border:2px solid var(--bdb-ink); background:var(--bdb-ink); color:#fff; cursor:pointer; }
        .ld-btn.ghost { background:var(--bdb-card); color:var(--bdb-ink); }
        .ld-pill { font:inherit; font-weight:800; font-size:0.88rem; min-height:42px; padding:0 14px; border-radius:999px; border:1px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink-soft); cursor:pointer; }
        .ld-pill.on { background:var(--bdb-ink); color:#fff; border-color:var(--bdb-ink); }
        .ld-probs { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-top:12px; }
        .ld-done { text-align:center; font-weight:900; font-size:clamp(1.2rem,3.6vw,1.6rem); margin-top:8px; color:${C_GREEN}; min-height:26px; }
        @media (prefers-reduced-motion: reduce) { .ld-pulse,.ld-fly,.ld-appear { animation:none; transition:none; } }
      `}</style>

      <div className="ld-prompt">{problem.dividend} ÷ {problem.divisor}</div>
      <div className="ld-sub">
        {pIdx === 0 ? "Full guidance: each step pulses, its equation builds, and the number travels into place."
          : pIdx === 1 ? "Less guidance now."
          : pIdx === 2 ? "Follow the numbered steps yourself."
          : pIdx === 3 ? "Just the step list to lean on."
          : "On your own."}
      </div>

      <div className="ld-svgwrap">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
          aria-label={`Long division of ${problem.dividend} by ${problem.divisor}`}>
          <defs>
            <marker id="ld-red" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill={C_RED} />
            </marker>
          </defs>

          {/* steps */}
          {stepList && STEPS.map((s, i) => {
            const isActive = activeStepIdx === i && move >= 0 && !settled;
            const isDone = move >= 0 && (activeStepIdx > i || (activeStepIdx === i && settled));
            const pulse = isActive && (phase === 0 || !showFlourish) && pIdx <= 2;
            return (
              <g key={s.kind} opacity={isDone ? 0.4 : 1} className={pulse ? "ld-pulse" : ""}>
                <rect x={SX} y={stepTop(i)} width={SW} height={SH} rx={13}
                  fill={isActive ? `color-mix(in srgb, ${s.color} 14%, var(--bdb-card))` : "var(--bdb-card)"}
                  stroke={isActive ? C_INK : "var(--bdb-line)"} strokeWidth={isActive ? 2.5 : 2} />
                <circle cx={SX + 30} cy={stepMid(i)} r={15} fill={isActive ? s.color : "var(--bdb-ground-2)"} />
                <text x={SX + 30} y={stepMid(i) + 6} textAnchor="middle" fontSize="16" fontWeight="900" fill={isActive ? "#fff" : "var(--bdb-ink-soft)"}>{i + 1}</text>
                <text x={SX + 56} y={stepMid(i) + 6} fontSize="19" fontWeight="800" fill="var(--bdb-ink)">{s.label}</text>
              </g>
            );
          })}

          {/* the active step's equation, assembling beside it */}
          {active && active.eq && phase >= 1 && showFlourish && (
            <g opacity={settled ? 0 : 1} style={{ transition: "opacity .4s ease" }}>
              {active.step !== "divide" && (
                <text className="ld-appear" x={eqAx} y={ey + 8} textAnchor="middle" fontSize="26" fontWeight="900" fill={STEPS[activeStepIdx].color}>{active.eq.a}</text>
              )}
              <text className="ld-appear" x={274} y={ey + 8} textAnchor="middle" fontSize="24" fontWeight="900" fill="var(--bdb-ink)">{STEPS[activeStepIdx].op}</text>
              {active.step !== "divide" && (
                <text className="ld-appear" x={eqBx} y={ey + 8} textAnchor="middle" fontSize="26" fontWeight="900" fill="var(--bdb-ink)">{active.eq.b}</text>
              )}
              <text className="ld-appear" x={340} y={ey + 8} textAnchor="middle" fontSize="24" fontWeight="900" fill="var(--bdb-ink)">=</text>
              {active.step !== "divide" && (
                <text className="ld-appear" x={eqCx} y={ey + 8} textAnchor="middle" fontSize="26" fontWeight="900" fill={STEPS[activeStepIdx].color}>{active.eq.c}</text>
              )}
            </g>
          )}

          {/* the house */}
          <path d={`M ${OX - 4} ${barY + CH} L ${OX - 4} ${barY} L ${rightX} ${barY}`}
            fill="none" stroke={C_INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <text x={OX - 16} y={cy(1) + 10} textAnchor="end" fontSize="30" fontWeight="900"
            fill={active && active.highlight.includes("divisor") && phase === 0 && showFlourish ? STEPS[activeStepIdx].color : C_INK}
            className={active && active.highlight.includes("divisor") && phase === 0 && pIdx <= 1 ? "ld-pulse" : ""}>{problem.divisor}</text>

          {/* cells */}
          {cells.filter(cellVisible).map((c) => {
            const hot = cellHot(c);
            const pulseSrc = active && phase === 0 && active.highlight.includes(c.id) && pIdx <= 1;
            return (
              <text key={c.id} x={cx(c.col)} y={cy(c.row) + 10} textAnchor="middle" fontSize="30" fontWeight="900"
                className={`${hot ? "ld-appear" : ""} ${pulseSrc ? "ld-pulse" : ""}`}
                fill={hot ? (KIND_COLOR[c.kind] || C_INK) : C_INK}>{c.text}</text>
            );
          })}

          {/* subtract: the minus sign + rule under the product */}
          {active && active.step === "subtract" && phase >= 1 && showFlourish && (() => {
            const p0 = posOf(active.highlight[active.highlight.length - 1]);
            const pcells = active.highlight.filter((h) => h.startsWith("p"));
            const leftX = Math.min(...pcells.map((id) => posOf(id)[0])) - 20;
            const rightXX = Math.max(...pcells.map((id) => posOf(id)[0])) + 20;
            const lineY = p0[1] + 22;
            return (
              <g>
                <text className="ld-appear" x={leftX - 8} y={p0[1] + 10} textAnchor="middle" fontSize="26" fontWeight="900" fill={C_CORAL}>−</text>
                <line className="ld-appear" x1={leftX} y1={lineY} x2={rightXX} y2={lineY} stroke={C_INK} strokeWidth="2.5" />
              </g>
            );
          })()}

          {/* bringdown: the red arrow */}
          {active && active.step === "bringdown" && phase >= 1 && showFlourish && (() => {
            const src = posOf(`d${active.to[0]}`);
            const dst = posOf(active.reveal[0]);
            return (
              <path className="ld-trail" d={arc([src[0], src[1] + 16], [dst[0], dst[1] - 16], 26)}
                fill="none" stroke={C_RED} strokeWidth="2.5" markerEnd="url(#ld-red)" />
            );
          })()}

          {/* DIVIDE flourish: dotted trails + flying ghosts + traveling quotient */}
          {active && active.step === "divide" && showFlourish && (
            <g>
              <path className="ld-trail" d={arc(divA, posOf("divisor"), 14)} fill="none" stroke={C_INK}
                strokeWidth="2" strokeDasharray="1.5 7" strokeLinecap="round" opacity={phase === 1 ? 0.55 : 0} />
              <path className="ld-trail" d={arc(posOf("divisor"), divQ, 20)} fill="none" stroke={C_TEAL}
                strokeWidth="2.5" strokeDasharray="1.5 7" strokeLinecap="round" opacity={phase === 2 ? 0.7 : 0} />

              <text className="ld-fly" x={eqAx} y={ey + 8} textAnchor="middle" fontSize="26" fontWeight="900" fill={C_TEAL}
                opacity={phase >= 1 && !settled ? 1 : 0}
                style={{ transform: phase >= 1 ? "translate(0px,0px)" : `translate(${divA[0] - eqAx}px, ${divA[1] - ey}px)` }}>{active.eq!.a}</text>
              <text className="ld-fly" x={eqBx} y={ey + 8} textAnchor="middle" fontSize="26" fontWeight="900" fill={C_INK}
                opacity={phase >= 1 && !settled ? 1 : 0}
                style={{ transform: phase >= 1 ? "translate(0px,0px)" : `translate(${posOf("divisor")[0] - eqBx}px, ${posOf("divisor")[1] - ey}px)` }}>{active.eq!.b}</text>
              <text className="ld-fly" x={divQ[0]} y={divQ[1] + 10} textAnchor="middle" fontSize="30" fontWeight="900" fill={C_TEAL}
                opacity={phase >= 1 && !settled ? 1 : 0}
                style={{ transform: phase >= 2 ? "translate(0px,0px)" : `translate(${eqCx - divQ[0]}px, ${ey - 2 - divQ[1]}px)` }}>{active.eq!.c}</text>
            </g>
          )}
        </svg>
      </div>

      <div className="ld-done">{done && settled ? `${problem.dividend} ÷ ${problem.divisor} = ${quotient}` : ""}</div>

      <div className="ld-bar">
        {!done ? (
          <button className="ld-btn" onClick={next}>{move < 0 ? "Start" : "Next step"}</button>
        ) : (
          <button className="ld-btn" onClick={() => setMove(-1)}>Replay</button>
        )}
        <button className="ld-btn ghost" onClick={() => setReplay((r) => r + 1)} disabled={!active || done}>Hint</button>
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
