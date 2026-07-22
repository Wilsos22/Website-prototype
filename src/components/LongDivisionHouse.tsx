"use client";

// Long Division — the standard algorithm in the "house" (M1.T3.L4 "Dividend in
// the House", 6.NS.3). Whole-number division only, on purpose. A guided,
// choreographed demo walks Divide, Multiply, Subtract, Bring down one step at a
// time, to Steele's frame-by-frame spec (Vercel toolbar, 7/19): the digits
// themselves drag from the house to the side equation one at a time, the
// finished equation wave-highlights left to right before the answer appears,
// and the answer drags back into the house. Subtract draws its minus sign and
// bar inside the house stroke by stroke, wave-highlights the column downward,
// and the difference fades in slowly. Bring down draws its arrow before the
// digit lands. Support fades across the problem set, but Auto-lead always
// runs the full choreography - that IS the leading. No scoring.

import { useEffect, useMemo, useState } from "react";

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

// Choreography phases per step (Steele's spec). Phase 0 is always the first
// pulse: the digit that is about to travel highlights in the house.
// divide:   pulse A -> A drags to the side -> divisor pulses -> divisor drags
//           over -> wave left-to-right across "a ÷ b" and "=" lands -> the
//           answer appears -> the answer drags up into the quotient.
// multiply: same shape; the answer drags DOWN into the house under the digit.
// subtract: A drags over -> product pulses -> product drags over -> the minus
//           sign draws itself in the house -> the bar draws itself -> the
//           column wave-highlights downward -> the difference fades in slowly.
// bringdown: the next digit pulses -> the arrow draws down -> the digit lands.
const PH = {
  divide: { dragA: 1, pulseB: 2, dragB: 3, wave: 4, ans: 5, travel: 6, final: 7 },
  multiply: { dragA: 1, pulseB: 2, dragB: 3, wave: 4, ans: 5, travel: 6, final: 7 },
  subtract: { dragA: 1, pulseB: 2, dragB: 3, minus: 4, line: 5, waveDown: 6, ans: 7, final: 8 },
  bringdown: { arrow: 1, num: 2, final: 3 },
} as const;

function phaseDurs(step: StepKind, flourish: boolean): number[] {
  if (!flourish) return [420];
  if (step === "divide") return [620, 700, 500, 700, 760, 560, 850];
  if (step === "multiply") return [620, 700, 500, 700, 760, 560, 850];
  if (step === "subtract") return [620, 700, 500, 700, 560, 560, 720, 950];
  return [620, 780, 680]; // bringdown
}

// equation-piece x positions beside the step words
const EQ = { a: 236, op: 274, b: 306, eq: 340, c: 374 };

// A ghost digit that sits on its house source, then drags to a destination
// when its phase arrives. Rendered at the destination with a starting offset
// so the transform transition carries it in. Hoisted to module level so React
// keeps the same <text> node across phase renders - the transition needs it.
function Ghost({ id, move, phase, text, from, to, dragAt, color, size = 26, wave }: {
  id: string; move: number; phase: number; text: string | number;
  from: [number, number]; to: [number, number];
  dragAt: number; color: string; size?: number; wave?: number | null;
}) {
  const dragging = phase >= dragAt;
  return (
    <text
      key={`${id}:${move}`}
      className={`ld-drag${wave != null ? " ld-wave" : ""}`}
      x={to[0]} y={to[1]} textAnchor="middle" fontSize={size} fontWeight="900" fill={color}
      opacity={phase >= dragAt - 1 ? 1 : 0}
      style={{
        transform: dragging ? "translate(0px, 0px)" : `translate(${from[0] - to[0]}px, ${from[1] - to[1]}px)`,
        animationDelay: wave != null ? `${wave}s` : undefined,
      }}
    >{text}</text>
  );
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

  // Auto-lead always gets the full choreography - watching the process IS the
  // point of being led. Manual mode fades the support across the problem set.
  const showFlourish = pIdx === 0 || auto;
  const stepList = pIdx <= 3;
  const durs = active ? phaseDurs(active.step, showFlourish) : [];
  const FINAL = durs.length;
  const settled = phase >= FINAL;

  useEffect(() => {
    if (move < 0 || move >= moves.length) return;
    const d = phaseDurs(moves[move].step, pIdx === 0 || auto);
    setPhase(0);
    let acc = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let p = 1; p <= d.length; p++) {
      acc += d[p - 1];
      timers.push(setTimeout(() => setPhase(p), acc));
    }
    return () => timers.forEach(clearTimeout);
  }, [move, moves, pIdx, replay, auto]);

  useEffect(() => {
    if (!auto || done || move < 0) return;
    if (settled) {
      const t = setTimeout(() => setMove((m) => Math.min(m + 1, moves.length - 1)), 650);
      return () => clearTimeout(t);
    }
  }, [auto, settled, move, done, moves.length]);

  function next() { setMove((m) => Math.min(m + 1, moves.length - 1)); }
  // Back re-enters the previous step from its first frame, so a student can
  // rewatch any part of the choreography (Steele's toolbar ask).
  function back() { setAuto(false); setMove((m) => Math.max(-1, m - 1)); }
  function loadProblem(i: number) { setPIdx(i); setMove(-1); setPhase(0); setAuto(false); }

  const cellById = (id: string) => cells.find((c) => c.id === id);
  const posOf = (id: string): [number, number] => {
    if (id === "divisor") return [OX - 20, cy(1)];
    const c = cellById(id);
    return c ? [cx(c.col), cy(c.row)] : [0, 0];
  };
  const centroid = (ids: string[]): [number, number] => {
    if (!ids.length) return [0, 0];
    const pts = ids.map(posOf);
    return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  };

  const maxRow = cells.reduce((m, c) => Math.max(m, c.row), 1);
  const width = OX + nd * CW + 92;
  const height = Math.max(stepTop(3) + SH + 12, HTOP + (maxRow + 1) * CH + 12);
  const barY = HTOP + CH;
  const rightX = OX + nd * CW + 6;

  const activeStepIdx = active ? STEPS.findIndex((s) => s.kind === active.step) : -1;
  const ey = active ? stepMid(activeStepIdx) : 0;

  // The two operands of the active step, in house terms: A is the number that
  // travels first, B second. Divide: current number, then the divisor.
  // Multiply: the new quotient digit, then the divisor. Subtract: the current
  // number, then the product under it.
  const srcA: string[] = active
    ? active.step === "divide" ? active.highlight.filter((h) => h !== "divisor")
      : active.step === "multiply" ? [active.highlight[0]]
        : active.step === "subtract" ? active.highlight.filter((h) => !h.startsWith("p"))
          : [`d${active.to[0]}`]
    : [];
  const srcB: string[] = active
    ? active.step === "subtract" ? active.highlight.filter((h) => h.startsWith("p"))
      : active.step === "bringdown" ? []
        : ["divisor"]
    : [];

  // a step's reveal cells appear at a specific phase
  const revealPhase = (step: StepKind) => {
    if (!showFlourish) return 1;
    if (step === "divide") return PH.divide.final;
    if (step === "multiply") return PH.multiply.final;
    if (step === "subtract") return PH.subtract.ans;
    return PH.bringdown.num;
  };
  function cellVisible(c: Cell): boolean {
    if (c.revealAt < 0) return true;
    if (c.revealAt < move) return true;
    if (c.revealAt === move) return phase >= revealPhase(active!.step);
    return false;
  }
  function cellHot(c: Cell): boolean {
    return c.revealAt === move && !settled && phase >= 1;
  }
  // Pulse the digit whose turn it is: A at phase 0, B at its own pulse phase.
  function cellPulseNow(id: string): boolean {
    if (!active || settled) return false;
    if (!showFlourish) return phase === 0 && active.highlight.includes(id);
    if (phase === 0) return srcA.includes(id);
    const ph = PH[active.step] as { pulseB?: number };
    if (ph.pulseB && phase === ph.pulseB) return srcB.includes(id);
    return false;
  }
  // Subtract's downward wave: the current number, then the product under it.
  function cellWaveDelay(id: string): number | null {
    if (!active || active.step !== "subtract" || !showFlourish) return null;
    if (phase !== PH.subtract.waveDown) return null;
    if (srcA.includes(id)) return srcA.indexOf(id) * 0.1;
    if (srcB.includes(id)) return 0.24 + srcB.indexOf(id) * 0.1;
    return null;
  }

  function arc(from: [number, number], to: [number, number], bow: number): string {
    const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2;
    return `M ${from[0]} ${from[1]} Q ${mx + bow} ${my - Math.abs(bow)} ${to[0]} ${to[1]}`;
  }

  // Active-step side equation as choreography: op token, wave timing, answer.
  function flourishEquation() {
    if (!active || !showFlourish || settled || !active.eq) return null;
    const step = active.step;
    if (step === "bringdown") return null;
    const ph = PH[step] as { dragA: number; pulseB: number; dragB: number; wave?: number; minus?: number; ans: number; travel?: number };
    const color = STEPS[activeStepIdx].color;
    const y = ey + 8;
    const fromA = centroid(srcA);
    const fromB = step === "subtract" ? centroid(srcB) : posOf("divisor");
    const waving = "wave" in ph && ph.wave != null && phase === ph.wave;
    const opAt = step === "subtract" ? (ph.pulseB as number) : ph.dragA;
    return (
      <g>
        {/* operand A drags in from the house */}
        <Ghost id="eqA" move={move} phase={phase} text={active.eq.a} from={[fromA[0], fromA[1] + 2]} to={[EQ.a, y]} dragAt={ph.dragA} color={color} wave={waving ? 0 : null} />
        {/* the operation sign waits at the side for A to land next to */}
        {phase >= opAt && (
          <text className={`ld-appear${waving ? " ld-wave" : ""}`} style={waving ? { animationDelay: "0.12s" } : undefined}
            x={EQ.op} y={y} textAnchor="middle" fontSize="22" fontWeight="900" fill="var(--bdb-ink)">{STEPS[activeStepIdx].op}</text>
        )}
        {/* operand B drags in */}
        <Ghost id="eqB" move={move} phase={phase} text={active.eq.b} from={[fromB[0], fromB[1] + 2]} to={[EQ.b, y]} dragAt={ph.dragB} color="var(--bdb-ink)" wave={waving ? 0.24 : null} />
        {/* the equals sign lands as the wave reaches it */}
        {(("wave" in ph && ph.wave != null && phase >= ph.wave) || (step === "subtract" && phase >= (ph as { ans: number }).ans)) && (
          <text className="ld-appear" style={waving ? { animationDelay: "0.4s" } : undefined}
            x={EQ.eq} y={y} textAnchor="middle" fontSize="22" fontWeight="900" fill="var(--bdb-ink)">=</text>
        )}
        {/* the answer appears, then (divide, multiply) drags into the house */}
        {phase >= ph.ans && ph.travel != null ? (
          <Ghost
            id="eqC" move={move} phase={phase} text={active.eq.c}
            from={[EQ.c, y]}
            to={step === "divide"
              ? [posOf(active.reveal[0])[0], posOf(active.reveal[0])[1] + 10]
              : [centroid(active.reveal)[0], centroid(active.reveal)[1] + 10]}
            dragAt={ph.travel} color={color} size={30}
          />
        ) : phase >= ph.ans ? (
          <text className="ld-appear-slow" x={EQ.c} y={y} textAnchor="middle" fontSize="24" fontWeight="900" fill={color}>{active.eq.c}</text>
        ) : null}
        {/* dotted trail for the traveling answer */}
        {ph.travel != null && phase === ph.travel && (
          <path className="ld-trail" d={arc([EQ.c, y - 8], step === "divide"
            ? [posOf(active.reveal[0])[0], posOf(active.reveal[0])[1] - 14]
            : [centroid(active.reveal)[0], centroid(active.reveal)[1] - 14], 22)}
            fill="none" stroke={color} strokeWidth="2.5" strokeDasharray="1.5 7" strokeLinecap="round" opacity={0.7} />
        )}
      </g>
    );
  }

  return (
    <div className="ld-wrap">
      <style>{`
        .ld-wrap { font-family:var(--bdb-font); color:var(--bdb-ink); max-width:960px; margin:0 auto; padding:16px clamp(10px,3vw,20px) 34px; }
        .ld-prompt { text-align:center; font-size:clamp(1.1rem,3.2vw,1.5rem); font-weight:800; margin:2px 0 4px; }
        .ld-sub { text-align:center; color:var(--bdb-ink-soft); font-size:0.92rem; margin:0 0 8px; min-height:20px; }
        .ld-svgwrap { overflow-x:auto; }
        .ld-pulse { animation:ldPulse 1.15s ease-in-out infinite; transform-box:fill-box; transform-origin:center; }
        @keyframes ldPulse { 0%,100% { opacity:1; } 50% { opacity:0.32; } }
        .ld-drag { transition:transform .62s cubic-bezier(.45,.05,.3,1), opacity .3s ease; }
        .ld-trail { transition:opacity .5s ease; }
        .ld-appear { animation:ldAppear .45s ease backwards; }
        .ld-appear-slow { animation:ldAppear 1s ease backwards; }
        @keyframes ldAppear { from { opacity:0; transform:translateY(-5px) scale(.7); } to { opacity:1; transform:none; } }
        .ld-wave { animation:ldWaveKick .5s ease both; transform-box:fill-box; transform-origin:center; }
        @keyframes ldWaveKick { 0% { transform:scale(1); } 45% { transform:scale(1.4); } 100% { transform:scale(1); } }
        .ld-wavecell { animation:ldWaveKick .5s ease both; transform-box:fill-box; transform-origin:center; }
        .ld-drawline { stroke-dasharray:1; animation:ldDraw .55s ease both; }
        .ld-drawpath { stroke-dasharray:1; animation:ldDraw .75s ease both; }
        @keyframes ldDraw { from { stroke-dashoffset:1; } to { stroke-dashoffset:0; } }
        .ld-bar { display:flex; gap:10px; justify-content:center; align-items:center; margin-top:14px; flex-wrap:wrap; }
        .ld-btn { font:inherit; font-weight:800; font-size:0.98rem; min-height:48px; padding:0 22px; border-radius:13px; border:2px solid var(--bdb-ink); background:var(--bdb-ink); color:#fff; cursor:pointer; }
        .ld-btn.ghost { background:var(--bdb-card); color:var(--bdb-ink); }
        .ld-btn:disabled { opacity:0.4; cursor:default; }
        .ld-pill { font:inherit; font-weight:800; font-size:0.88rem; min-height:42px; padding:0 14px; border-radius:999px; border:1px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink-soft); cursor:pointer; }
        .ld-pill.on { background:var(--bdb-ink); color:#fff; border-color:var(--bdb-ink); }
        .ld-probs { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-top:12px; }
        .ld-done { text-align:center; font-weight:900; font-size:clamp(1.2rem,3.6vw,1.6rem); margin-top:8px; color:${C_GREEN}; min-height:26px; }
        @media (prefers-reduced-motion: reduce) { .ld-pulse,.ld-drag,.ld-appear,.ld-appear-slow,.ld-wave,.ld-wavecell,.ld-drawline,.ld-drawpath { animation:none; transition:none; } }
      `}</style>

      <div className="ld-prompt">{problem.dividend} ÷ {problem.divisor}</div>
      <div className="ld-sub">
        {auto ? "Auto-lead: watch each digit travel, the equation wave, and the answer land."
          : pIdx === 0 ? "Full guidance: each digit travels to its equation, and the answer travels back."
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
            const pulse = isActive && (phase === 0 || !showFlourish) && (pIdx <= 2 || auto);
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

          {/* parked side equations: every completed step of this cycle keeps
              its equation beside its step word until the next cycle begins */}
          {showFlourish && active && STEPS.map((s, i) => {
            const mvIdx = moves.findIndex((mv) => mv.cycle === active.cycle && mv.step === s.kind);
            if (mvIdx < 0) return null;
            const mv = moves[mvIdx];
            if (!mv.eq) return null; // bring down has no side equation
            if (mvIdx > move) return null;
            // the active step's live equation is drawn by the ghosts below
            if (mvIdx === move && !settled) return null;
            const y = stepMid(i) + 8;
            return (
              <g key={`eq${i}`}>
                <text x={EQ.a} y={y} textAnchor="middle" fontSize="24" fontWeight="900" fill={s.color}>{mv.eq.a}</text>
                <text x={EQ.op} y={y} textAnchor="middle" fontSize="22" fontWeight="900" fill="var(--bdb-ink)">{s.op}</text>
                <text x={EQ.b} y={y} textAnchor="middle" fontSize="24" fontWeight="900" fill="var(--bdb-ink)">{mv.eq.b}</text>
                <text x={EQ.eq} y={y} textAnchor="middle" fontSize="22" fontWeight="900" fill="var(--bdb-ink)">=</text>
                <text x={EQ.c} y={y} textAnchor="middle" fontSize="24" fontWeight="900" fill={s.color}>{mv.eq.c}</text>
              </g>
            );
          })}

          {/* the house */}
          <path d={`M ${OX - 4} ${barY + CH} L ${OX - 4} ${barY} L ${rightX} ${barY}`}
            fill="none" stroke={C_INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <text x={OX - 16} y={cy(1) + 10} textAnchor="end" fontSize="30" fontWeight="900"
            fill={cellPulseNow("divisor") ? STEPS[activeStepIdx]?.color || C_INK : C_INK}
            className={cellPulseNow("divisor") ? "ld-pulse" : ""}>{problem.divisor}</text>

          {/* cells */}
          {cells.filter(cellVisible).map((c) => {
            const hot = cellHot(c);
            const pulseSrc = cellPulseNow(c.id);
            const waveDelay = cellWaveDelay(c.id);
            const slow = hot && active?.step === "subtract";
            return (
              <text key={c.id} x={cx(c.col)} y={cy(c.row) + 10} textAnchor="middle" fontSize="30" fontWeight="900"
                className={`${hot ? (slow ? "ld-appear-slow" : "ld-appear") : ""} ${pulseSrc ? "ld-pulse" : ""} ${waveDelay != null ? "ld-wavecell" : ""}`}
                style={waveDelay != null ? { animationDelay: `${waveDelay}s` } : undefined}
                fill={hot ? (KIND_COLOR[c.kind] || C_INK) : C_INK}>{c.text}</text>
            );
          })}

          {/* subtract, in the house: the minus sign draws itself, then the bar,
              stroke by stroke, before the column waves downward */}
          {active && active.step === "subtract" && showFlourish && (() => {
            const pcells = active.highlight.filter((h) => h.startsWith("p"));
            if (!pcells.length) return null;
            const p0 = posOf(pcells[pcells.length - 1]);
            const leftX = Math.min(...pcells.map((id) => posOf(id)[0])) - 20;
            const rightXX = Math.max(...pcells.map((id) => posOf(id)[0])) + 20;
            const lineY = p0[1] + 22;
            return (
              <g>
                {phase >= PH.subtract.minus && (
                  <line className="ld-drawline" pathLength={1}
                    x1={leftX - 14} y1={p0[1] + 2} x2={leftX - 2} y2={p0[1] + 2}
                    stroke={C_CORAL} strokeWidth="4" strokeLinecap="round" />
                )}
                {phase >= PH.subtract.line && (
                  <line className="ld-drawline" pathLength={1}
                    x1={leftX} y1={lineY} x2={rightXX} y2={lineY} stroke={C_INK} strokeWidth="2.5" strokeLinecap="round" />
                )}
              </g>
            );
          })()}

          {/* bringdown: the red arrow draws down first, then the digit lands */}
          {active && active.step === "bringdown" && showFlourish && phase >= PH.bringdown.arrow && (() => {
            const src = posOf(`d${active.to[0]}`);
            const dst = posOf(active.reveal[0]);
            return (
              <path className="ld-drawpath" d={arc([src[0], src[1] + 16], [dst[0], dst[1] - 16], 26)} pathLength={1}
                fill="none" stroke={C_RED} strokeWidth="2.5"
                markerEnd={phase >= PH.bringdown.num ? "url(#ld-red)" : undefined} />
            );
          })()}

          {/* the active step's equation, built by traveling digits */}
          {flourishEquation()}
        </svg>
      </div>

      <div className="ld-done">{done && settled ? `${problem.dividend} ÷ ${problem.divisor} = ${quotient}` : ""}</div>

      <div className="ld-bar">
        <button className="ld-btn ghost" onClick={back} disabled={move < 0}>Back</button>
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
