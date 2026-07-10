"use client";

// Area Explorer — M1.T2 (6.G.A.1). Solve mode: pick a shape from the bank, get
// a labeled figure on a unit grid, tap the measurements into the formula
// (a slant/diagonal decoy chip makes "use the slant, not the height" a real
// wrong choice), compute the area, then name the unit WITH its exponent. One
// SVG draws the grid + shape + dimension marks in a single coordinate space so
// nothing drifts. Squared corners + unit grid on purpose. Sandbox + Composite
// modes land next.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reportToolResult } from "@/lib/toolEvidence";

type ShapeType = "rectangle" | "square" | "parallelogram" | "triangle" | "trapezoid";
type Phase = "bank" | "substitute" | "compute" | "unit" | "done";
type MarkKind = "base" | "height" | "b2";

const UNITS = ["units", "cm", "m", "in", "ft"];
const C_BASE = "#50a3a4";
const C_HEIGHT = "#fcaf38";
const C_B2 = "#f95335";

// Label placement: keep the height pill on the opposite side from the slant
// decoy so the two never collide (decoy sits left on para/trapezoid, right on
// triangle, and is a centered diagonal on rectangle/square).
const HEIGHT_OFF: Record<ShapeType, number> = { rectangle: 40, square: 40, parallelogram: 40, triangle: -44, trapezoid: 40 };
const DECOY_OFF: Record<ShapeType, [number, number]> = { rectangle: [30, -16], square: [30, -16], parallelogram: [-30, -14], triangle: [36, -14], trapezoid: [-30, -14] };

const SHAPE_NAMES: Record<ShapeType, string> = {
  rectangle: "Rectangle", square: "Square", parallelogram: "Parallelogram", triangle: "Triangle", trapezoid: "Trapezoid",
};

const rand = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const round1 = (n: number) => Math.round(n * 10) / 10;
const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

type Pt = [number, number];

interface Slot { id: string; value: number; color: string; ghost: string; mark: MarkKind }
type Token = { t: "text"; v: string } | { t: "slot"; slot: Slot };
interface Mark { a: Pt; b: Pt; value: number; label: string }
interface HeightMark extends Mark { foot: Pt }
interface DecoyMark { a: Pt; b: Pt; value: number; name: string }

interface Shape {
  type: ShapeType;
  unit: string;
  cols: number; rows: number;
  verts: Pt[];
  base: Mark;
  height: HeightMark;
  decoy: DecoyMark;
  base2?: Mark;
  formula: Token[];
  slots: Slot[];
  chips: number[];
  area: number;
  problemId: string;
}

// ── Shape generation ────────────────────────────────────────────────────────
function makeShape(type: ShapeType): Shape {
  const unit = UNITS[rand(0, UNITS.length - 1)];
  const slot = (id: string, value: number, color: string, ghost: string, mark: MarkKind): Slot => ({ id, value, color, ghost, mark });

  if (type === "rectangle" || type === "square") {
    const b = type === "square" ? rand(3, 8) : rand(3, 10);
    const h = type === "square" ? b : rand(3, 8);
    const diag = round1(Math.hypot(b, h));
    const slots: Slot[] = type === "square"
      ? [slot("s1", b, C_BASE, "s", "base"), slot("s2", b, C_HEIGHT, "s", "height")]
      : [slot("b", b, C_BASE, "b", "base"), slot("h", h, C_HEIGHT, "h", "height")];
    const formula: Token[] = [{ t: "text", v: "A =" }, { t: "slot", slot: slots[0] }, { t: "text", v: "×" }, { t: "slot", slot: slots[1] }];
    const chips = shuffle(Array.from(new Set([b, h, diag])));
    return {
      type, unit, cols: b, rows: h,
      verts: [[0, 0], [b, 0], [b, h], [0, h]],
      base: { a: [0, h], b: [b, h], value: b, label: type === "square" ? "s" : "b" },
      height: { a: [0, 0], b: [0, h], foot: [0, h], value: h, label: type === "square" ? "s" : "h" },
      decoy: { a: [0, 0], b: [b, h], value: diag, name: "diagonal" },
      formula, slots, chips, area: b * h, problemId: `${type}-${b}x${h}-${unit}`,
    };
  }

  if (type === "parallelogram") {
    const b = rand(4, 9), h = rand(3, 7), k = rand(1, 4);
    const slant = round1(Math.hypot(k, h));
    const slots = [slot("b", b, C_BASE, "b", "base"), slot("h", h, C_HEIGHT, "h", "height")];
    const formula: Token[] = [{ t: "text", v: "A =" }, { t: "slot", slot: slots[0] }, { t: "text", v: "×" }, { t: "slot", slot: slots[1] }];
    const chips = shuffle(Array.from(new Set([b, h, slant])));
    return {
      type, unit, cols: b + k, rows: h,
      verts: [[k, 0], [b + k, 0], [b, h], [0, h]],
      base: { a: [0, h], b: [b, h], value: b, label: "b" },
      height: { a: [k, 0], b: [k, h], foot: [k, h], value: h, label: "h" },
      decoy: { a: [0, h], b: [k, 0], value: slant, name: "slant" },
      formula, slots, chips, area: b * h, problemId: `parallelogram-${b}x${h}s${k}-${unit}`,
    };
  }

  if (type === "triangle") {
    let b = rand(4, 10), h = rand(3, 8);
    while ((b * h) % 2 !== 0) { b = rand(4, 10); h = rand(3, 8); }
    const a = rand(2, b - 1); // apex x — kept off the edges so the height sits clearly inside
    const slant = round1(Math.hypot(b - a, h)); // right slant edge
    const slots = [slot("b", b, C_BASE, "b", "base"), slot("h", h, C_HEIGHT, "h", "height")];
    const formula: Token[] = [{ t: "text", v: "A = ½ ×" }, { t: "slot", slot: slots[0] }, { t: "text", v: "×" }, { t: "slot", slot: slots[1] }];
    const chips = shuffle(Array.from(new Set([b, h, slant])));
    return {
      type, unit, cols: b, rows: h,
      verts: [[a, 0], [0, h], [b, h]],
      base: { a: [0, h], b: [b, h], value: b, label: "b" },
      height: { a: [a, 0], b: [a, h], foot: [a, h], value: h, label: "h" },
      decoy: { a: [b, h], b: [a, 0], value: slant, name: "slant" },
      formula, slots, chips, area: (b * h) / 2, problemId: `triangle-${b}x${h}a${a}-${unit}`,
    };
  }

  // trapezoid
  let b1 = rand(5, 10), b2 = rand(2, b1 - 2), h = rand(3, 7);
  while (((b1 + b2) * h) % 2 !== 0) { b1 = rand(5, 10); b2 = rand(2, b1 - 2); h = rand(3, 7); }
  const o = rand(1, Math.max(1, b1 - b2));
  const slant = round1(Math.hypot(o, h)); // left leg
  const slots = [
    slot("b1", b1, C_BASE, "b₁", "base"),
    slot("b2", b2, C_B2, "b₂", "b2"),
    slot("h", h, C_HEIGHT, "h", "height"),
  ];
  const formula: Token[] = [
    { t: "text", v: "A = ½ × (" }, { t: "slot", slot: slots[0] }, { t: "text", v: "+" }, { t: "slot", slot: slots[1] }, { t: "text", v: ") ×" }, { t: "slot", slot: slots[2] },
  ];
  const chips = shuffle(Array.from(new Set([b1, b2, h, slant])));
  return {
    type, unit, cols: Math.max(b1, o + b2), rows: h,
    verts: [[o, 0], [o + b2, 0], [b1, h], [0, h]],
    base: { a: [0, h], b: [b1, h], value: b1, label: "b₁" },
    height: { a: [o, 0], b: [o, h], foot: [o, h], value: h, label: "h" },
    decoy: { a: [0, h], b: [o, 0], value: slant, name: "slant" },
    base2: { a: [o, 0], b: [o + b2, 0], value: b2, label: "b₂" },
    formula, slots, chips, area: ((b1 + b2) * h) / 2, problemId: `trapezoid-${b1}-${b2}x${h}o${o}-${unit}`,
  };
}

// point-in-polygon (ray cast) for the count-squares self-check
function inPoly(x: number, y: number, verts: Pt[]) {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const [xi, yi] = verts[i], [xj, yj] = verts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export default function AreaExplorer() {
  const [phase, setPhase] = useState<Phase>("bank");
  const [shape, setShape] = useState<Shape | null>(null);
  const [placed, setPlaced] = useState<Record<string, number | null>>({});
  const [picked, setPicked] = useState<number | null>(null);
  const [focusSlot, setFocusSlot] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [wrongSteps, setWrongSteps] = useState(0);
  const [firstTag, setFirstTag] = useState<string | null>(null);
  const [showCount, setShowCount] = useState(false);
  const [whySquared, setWhySquared] = useState(false);
  const [finePointer, setFinePointer] = useState(false);
  const solvedRef = useRef(false);

  useEffect(() => { setFinePointer(window.matchMedia?.("(pointer: fine)").matches ?? false); }, []);

  const flagWrong = useCallback((tag: string) => {
    setWrongSteps((w) => w + 1);
    setFirstTag((t) => t ?? tag);
  }, []);

  const startShape = useCallback((s: Shape) => {
    setShape(s);
    setPlaced(Object.fromEntries(s.slots.map((sl) => [sl.id, null])));
    setPicked(null); setFocusSlot(null); setAnswer(""); setNote(null);
    setWrongSteps(0); setFirstTag(null); setShowCount(false); setWhySquared(false);
    solvedRef.current = false;
    setPhase("substitute");
  }, []);

  const pickShape = useCallback((type: ShapeType) => startShape(makeShape(type)), [startShape]);
  const resetProblem = useCallback(() => { if (shape) startShape({ ...shape }); }, [shape, startShape]);
  const randomSame = useCallback(() => { if (shape) startShape(makeShape(shape.type)); }, [shape, startShape]);

  const back = useCallback(() => {
    setNote(null);
    if (phase === "done") { setPhase("unit"); return; }
    if (phase === "unit") { setAnswer(""); setPhase("compute"); return; }
    if (phase === "compute") { setPhase("substitute"); return; }
    if (phase === "substitute") { setPhase("bank"); setShape(null); return; }
  }, [phase]);

  const allFilled = useMemo(
    () => Boolean(shape && shape.slots.every((sl) => placed[sl.id] === sl.value)),
    [shape, placed],
  );

  function placeInSlot(slotId: string, value: number) {
    if (!shape) return;
    const sl = shape.slots.find((s) => s.id === slotId);
    if (!sl) return;
    if (value === shape.decoy.value) {
      setNote(shape.decoy.name === "diagonal"
        ? "That's the diagonal, not a side you multiply. Use the base and the height."
        : "That's the slant side, not the height. The height has the right-angle mark — use the dashed length.");
      flagWrong("slant-for-height");
      setPicked(null);
      return;
    }
    if (value !== sl.value) {
      setNote(sl.mark === "height"
        ? "Check which side that is. The height goes straight up from the base."
        : shape.type === "square"
        ? "A square's sides are equal — both blanks are the same number."
        : "Not that measurement — look at what each side is labeled.");
      flagWrong("swapped-dims");
      setPicked(null);
      return;
    }
    setNote(null);
    setPlaced((p) => ({ ...p, [slotId]: value }));
    setPicked(null);
    setFocusSlot(null);
  }

  function onChipTap(value: number) {
    if (focusSlot) { placeInSlot(focusSlot, value); return; }
    setPicked((cur) => (cur === value ? null : value));
  }
  function onSlotTap(slotId: string) {
    if (picked != null) { placeInSlot(slotId, picked); return; }
    setFocusSlot((cur) => (cur === slotId ? null : slotId));
  }

  function submitCompute() {
    if (!shape) return;
    if (Number(answer) === shape.area) { setNote(null); setPhase("unit"); return; }
    if (shape.type === "triangle") { setNote("Not yet — did you take half? A triangle is half of base × height."); }
    else if (shape.type === "trapezoid") { setNote("Not yet — add the two bases first, then take half."); }
    else { setNote("Not yet — multiply base times height. Count the squares to check."); }
    flagWrong("compute-error");
  }

  function chooseUnit(exp: 0 | 2 | 3) {
    if (!shape) return;
    if (exp === 2) {
      setNote(null);
      if (!solvedRef.current) {
        solvedRef.current = true;
        reportToolResult({ tool: "area-explorer", correct: wrongSteps === 0, standardId: "6.G.A.1", misconception: firstTag, problemId: shape.problemId });
      }
      setPhase("done");
      return;
    }
    if (exp === 0) { setNote("That measures length. Area is how much surface a shape covers — that's 2D."); flagWrong("linear-unit"); }
    else { setNote("That's for 3D solids. This shape is flat, so it's 2D."); flagWrong("cubed-unit"); }
  }

  const activeMark: MarkKind | null = useMemo(() => {
    const id = focusSlot ?? (picked != null ? null : null);
    if (!id || !shape) return null;
    return shape.slots.find((s) => s.id === id)?.mark ?? null;
  }, [focusSlot, picked, shape]);

  return (
    <div className="ae-wrap">
      <style>{`
        .ae-wrap { --ae-carry:cubic-bezier(.34,.8,.3,1); font-family:var(--bdb-font); color:var(--bdb-ink); max-width:820px; margin:0 auto; padding:14px clamp(10px,3vw,20px) 34px; }
        .ae-prompt { text-align:center; font-size:clamp(1.1rem,3.2vw,1.5rem); font-weight:800; margin:2px 0 4px; min-height:30px; }
        .ae-sub { text-align:center; color:var(--bdb-ink-soft); font-size:0.9rem; margin:0 0 12px; min-height:18px; }
        .ae-tools { display:flex; gap:8px; justify-content:center; margin-bottom:12px; }
        .ae-tbtn { font:inherit; font-weight:700; font-size:0.82rem; padding:6px 13px; border-radius:999px; border:1px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink-soft); cursor:pointer; }
        .ae-tbtn:active, .ae-tbtn:focus-visible { color:var(--bdb-ink); }
        .ae-bank { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; max-width:720px; margin:14px auto 0; }
        .ae-shapecard { display:grid; place-items:center; gap:8px; min-height:120px; padding:14px; border:2px solid var(--bdb-line); border-radius:0; background:var(--bdb-card); color:var(--bdb-ink); font-weight:800; font-size:1rem; cursor:pointer; }
        .ae-shapecard:active, .ae-shapecard:focus-visible { border-color:var(--bdb-ink); }
        .ae-stage { display:grid; justify-items:center; gap:6px; }
        .ae-svg { width:100%; max-width:560px; height:auto; touch-action:none; }
        .ae-mark-pulse { animation:aePulse 1s ease-in-out infinite; transform-box:fill-box; transform-origin:center; }
        @keyframes aePulse { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
        .ae-formula { display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:8px; font-weight:900; font-size:clamp(1.3rem,4vw,1.9rem); margin:12px 0 4px; }
        .ae-slot { display:inline-grid; place-items:center; min-width:56px; min-height:52px; padding:0 8px; border:3px solid var(--bdb-line); border-radius:0; background:#fff; color:var(--bdb-ink); cursor:pointer; }
        .ae-slot .ghost { color:var(--bdb-ink-faint); font-weight:800; }
        .ae-slot.on { outline:3px solid var(--bdb-ink); outline-offset:2px; }
        .ae-slot.ok { color:#fff; }
        .ae-chips { display:flex; flex-wrap:wrap; gap:10px; justify-content:center; margin:10px 0 2px; }
        .ae-chip { min-width:58px; min-height:56px; padding:0 14px; border:2px solid var(--bdb-ink); border-radius:0; background:var(--bdb-card); color:var(--bdb-ink); font:inherit; font-weight:900; font-size:1.2rem; cursor:pointer; }
        .ae-chip.picked { background:var(--bdb-ink); color:#fff; transform:scale(1.06); }
        .ae-answer { width:120px; font:inherit; font-size:1.3rem; font-weight:900; text-align:center; padding:6px; border:3px solid var(--bdb-ink); border-radius:0; background:#fff; color:var(--bdb-ink); }
        .ae-unitchips { display:flex; gap:10px; justify-content:center; margin:8px 0; flex-wrap:wrap; }
        .ae-uchip { min-width:74px; min-height:56px; padding:0 16px; border:2px solid var(--bdb-ink); border-radius:0; background:var(--bdb-card); color:var(--bdb-ink); font:inherit; font-weight:900; font-size:1.25rem; cursor:pointer; }
        .ae-bar { display:flex; gap:8px; justify-content:center; align-items:center; margin-top:14px; flex-wrap:wrap; }
        .ae-btn { font:inherit; font-weight:700; font-size:0.9rem; padding:9px 16px; border-radius:11px; border:1px solid var(--bdb-line); background:var(--bdb-ink); color:#fff; cursor:pointer; }
        .ae-btn.ghost { background:var(--bdb-card); color:var(--bdb-ink); }
        .ae-btn:disabled { opacity:0.42; cursor:not-allowed; }
        .ae-link { font:inherit; font-weight:700; font-size:0.82rem; color:var(--bdb-ink-soft); background:none; border:none; text-decoration:underline; cursor:pointer; }
        .ae-note { text-align:center; color:var(--bdb-coral); font-weight:700; font-size:0.9rem; min-height:20px; margin-top:8px; }
        .ae-why { max-width:480px; margin:8px auto 0; text-align:center; color:var(--bdb-ink-soft); font-size:0.92rem; line-height:1.5; }
        .ae-done .eq { text-align:center; font-size:clamp(1.6rem,5vw,2.6rem); font-weight:900; margin:8px 0; }
        @media (prefers-reduced-motion: reduce) { .ae-mark-pulse, .ae-chip.picked { animation:none; } }
      `}</style>

      {phase === "bank" && (
        <>
          <div className="ae-prompt">Which shape do you want to find the area of?</div>
          <div className="ae-sub">Pick a shape to measure.</div>
          <div className="ae-bank">
            {(Object.keys(SHAPE_NAMES) as ShapeType[]).map((t) => (
              <button key={t} className="ae-shapecard" onClick={() => pickShape(t)}>
                <ShapeIcon type={t} />
                <span>{SHAPE_NAMES[t]}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {phase !== "bank" && shape && (
        <>
          <div className="ae-prompt">
            {phase === "substitute" && "Put each measurement into the formula."}
            {phase === "compute" && "Now solve it."}
            {phase === "unit" && "What unit is the area measured in?"}
            {phase === "done" && `${SHAPE_NAMES[shape.type]} solved`}
          </div>
          <div className="ae-sub">
            {phase === "substitute" && (picked != null ? "Now tap the blank where it goes." : focusSlot ? "Now tap the measurement that belongs there." : "Tap a number, then tap where it goes.")}
            {phase === "compute" && "Work out the area, then enter it."}
            {phase === "unit" && "Length, area, or volume? Pick the unit."}
            {phase === "done" && "Same area, however you measured it."}
          </div>

          <div className="ae-tools">
            <button className="ae-tbtn" onClick={back}>Back</button>
            <button className="ae-tbtn" onClick={resetProblem}>Reset</button>
            <button className="ae-tbtn" onClick={randomSame}>Random</button>
          </div>

          <div className="ae-stage">
            <ShapeSvg shape={shape} phase={phase} activeMark={activeMark} showCount={showCount} whySquared={whySquared} />

            {phase === "substitute" && (
              <>
                <div className="ae-formula">
                  {shape.formula.map((tok, i) =>
                    tok.t === "text" ? <span key={i}>{tok.v}</span> : (
                      <button key={i} className={`ae-slot ${focusSlot === tok.slot.id ? "on" : ""} ${placed[tok.slot.id] === tok.slot.value ? "ok" : ""}`}
                        style={placed[tok.slot.id] === tok.slot.value ? { background: tok.slot.color, borderColor: tok.slot.color } : { borderColor: tok.slot.color }}
                        onClick={() => onSlotTap(tok.slot.id)}>
                        {placed[tok.slot.id] === tok.slot.value ? placed[tok.slot.id] : <span className="ghost">{tok.slot.ghost}</span>}
                      </button>
                    ))}
                </div>
                <div className="ae-chips">
                  {shape.chips.map((v) => (
                    <button key={v} className={`ae-chip ${picked === v ? "picked" : ""}`} onClick={() => onChipTap(v)}>{v}</button>
                  ))}
                </div>
                <div className="ae-bar">
                  <button className="ae-link" onClick={() => setShowCount((c) => !c)}>{showCount ? "Hide the squares" : "Count the squares"}</button>
                  <button className="ae-btn" disabled={!allFilled} onClick={() => { setNote(null); setPhase("compute"); }}>Compute</button>
                </div>
              </>
            )}

            {phase === "compute" && (
              <>
                <div className="ae-formula">
                  {shape.formula.map((tok, i) =>
                    tok.t === "text" ? <span key={i}>{tok.v}</span> : (
                      <span key={i} className="ae-slot ok" style={{ background: tok.slot.color, borderColor: tok.slot.color, color: "#fff" }}>{tok.slot.value}</span>
                    ))}
                  <span>=</span>
                  <input className="ae-answer" value={answer} inputMode="numeric" autoFocus={finePointer}
                    onChange={(e) => { setAnswer(e.target.value.replace(/\D/g, "")); setNote(null); }}
                    onKeyDown={(e) => e.key === "Enter" && submitCompute()} aria-label="area answer" />
                </div>
                <div className="ae-bar">
                  <button className="ae-link" onClick={() => setShowCount((c) => !c)}>{showCount ? "Hide the squares" : "Count the squares"}</button>
                  <button className="ae-btn" onClick={submitCompute}>Check</button>
                </div>
              </>
            )}

            {phase === "unit" && (
              <>
                <div className="ae-formula"><span>A = {shape.area}</span><span style={{ color: "var(--bdb-ink-faint)" }}>?</span></div>
                <div className="ae-unitchips">
                  <button className="ae-uchip" onClick={() => chooseUnit(0)}>{shape.unit}</button>
                  <button className="ae-uchip" onClick={() => chooseUnit(2)}>{shape.unit}&sup2;</button>
                  <button className="ae-uchip" onClick={() => chooseUnit(3)}>{shape.unit}&sup3;</button>
                </div>
                <div className="ae-bar">
                  <button className="ae-link" onClick={() => setWhySquared((w) => !w)}>{whySquared ? "Got it" : "Why squared?"}</button>
                </div>
                {whySquared && <p className="ae-why">Each little square is 1 square {shape.unit} — 1 {shape.unit} across and 1 {shape.unit} up. Area counts how many cover the shape, so the unit is squared.</p>}
              </>
            )}

            {phase === "done" && (
              <div className="ae-done">
                <div className="eq">A = {shape.area} {shape.unit}&sup2;</div>
                <div className="ae-bar">
                  <button className="ae-btn ghost" onClick={() => { setShape(null); setPhase("bank"); }}>New shape</button>
                  <button className="ae-btn" onClick={randomSame}>Same shape again</button>
                </div>
              </div>
            )}
          </div>

          <div className="ae-note">{note}</div>
        </>
      )}
    </div>
  );
}

// ── Shape rendering ─────────────────────────────────────────────────────────
function ShapeSvg({ shape, phase, activeMark, showCount, whySquared }: { shape: Shape; phase: Phase; activeMark: MarkKind | null; showCount: boolean; whySquared: boolean }) {
  const U = Math.max(28, Math.min(52, Math.floor(Math.min(460 / shape.cols, 300 / shape.rows))));
  const M = Math.round(1.4 * U);
  const sx = (gx: number) => M + gx * U;
  const sy = (gy: number) => M + gy * U;
  const W = 2 * M + shape.cols * U;
  const H = 2 * M + shape.rows * U;
  const solved = phase === "done";
  const region = solved ? `color-mix(in srgb, ${C_BASE} 42%, transparent)` : `color-mix(in srgb, ${C_BASE} 20%, transparent)`;

  const countCells = useMemo(() => {
    if (!showCount && !whySquared) return [];
    const cells: Pt[] = [];
    for (let gy = 0; gy < shape.rows; gy++) for (let gx = 0; gx < shape.cols; gx++) {
      if (inPoly(gx + 0.5, gy + 0.5, shape.verts)) cells.push([gx, gy]);
    }
    return whySquared ? cells.slice(0, 1) : cells;
  }, [showCount, whySquared, shape]);

  const pts = shape.verts.map((v) => `${sx(v[0])},${sy(v[1])}`).join(" ");
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

  const pill = (at: Pt, dx: number, dy: number, text: string, color: string, muted = false) => {
    const cx = sx(at[0]) + dx, cy = sy(at[1]) + dy;
    const w = Math.max(30, 13 + text.length * 10), hgt = 24;
    return (
      <g key={`${text}-${cx}-${cy}`} className={!muted && activeMark && ((color === C_BASE && activeMark === "base") || (color === C_HEIGHT && activeMark === "height") || (color === C_B2 && activeMark === "b2")) ? "ae-mark-pulse" : undefined}>
        <rect x={cx - w / 2} y={cy - hgt / 2} width={w} height={hgt} rx={5} fill="var(--bdb-card)" stroke={muted ? "var(--bdb-line)" : color} strokeWidth={1.5} />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={15} fontWeight={900} fill={muted ? "var(--bdb-ink-faint)" : color}>{text}</text>
      </g>
    );
  };

  const bm = mid(shape.base.a, shape.base.b);
  const hm = mid(shape.height.a, shape.height.b);
  const dm = mid(shape.decoy.a, shape.decoy.b);
  const b2m = shape.base2 ? mid(shape.base2.a, shape.base2.b) : null;
  const foot = shape.height.foot;
  const raSign = shape.height.a[0] <= shape.base.b[0] ? 1 : -1; // right-angle mark direction along base

  return (
    <svg className="ae-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${shape.type} on a grid`}>
      <defs>
        <pattern id={`ae-cell-${shape.type}`} width={U} height={U} patternUnits="userSpaceOnUse">
          <path d={`M ${U} 0 L 0 0 0 ${U}`} fill="none" stroke="var(--bdb-line)" strokeWidth={1} opacity={0.75} />
        </pattern>
      </defs>
      <rect x={M} y={M} width={shape.cols * U} height={shape.rows * U} fill={`url(#ae-cell-${shape.type})`} />

      {/* count-squares / why-squared shading */}
      {countCells.map(([gx, gy]) => (
        <rect key={`c-${gx}-${gy}`} x={sx(gx)} y={sy(gy)} width={U} height={U} fill={whySquared ? C_HEIGHT : C_BASE} opacity={whySquared ? 0.6 : 0.28} />
      ))}

      {/* shape */}
      <polygon points={pts} fill={region} stroke="var(--bdb-ink)" strokeWidth={3} strokeLinejoin="miter" />

      {/* decoy edge (faint) */}
      <line x1={sx(shape.decoy.a[0])} y1={sy(shape.decoy.a[1])} x2={sx(shape.decoy.b[0])} y2={sy(shape.decoy.b[1])} stroke="var(--bdb-ink-faint)" strokeWidth={2} strokeDasharray="2 4" />

      {/* base bracket */}
      <path d={`M ${sx(shape.base.a[0])} ${sy(shape.base.a[1]) + 10} L ${sx(shape.base.a[0])} ${sy(shape.base.a[1]) + 16} L ${sx(shape.base.b[0])} ${sy(shape.base.b[1]) + 16} L ${sx(shape.base.b[0])} ${sy(shape.base.b[1]) + 10}`}
        fill="none" stroke={C_BASE} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

      {/* perpendicular height (dashed) + right-angle mark */}
      <line x1={sx(shape.height.a[0])} y1={sy(shape.height.a[1])} x2={sx(shape.height.b[0])} y2={sy(shape.height.b[1])} stroke={C_HEIGHT} strokeWidth={2.5} strokeDasharray="7 5" />
      <path d={`M ${sx(foot[0]) + raSign * 9} ${sy(foot[1])} L ${sx(foot[0]) + raSign * 9} ${sy(foot[1]) - 9} L ${sx(foot[0])} ${sy(foot[1]) - 9}`} fill="none" stroke={C_HEIGHT} strokeWidth={2} />

      {/* pills */}
      {pill(bm, 0, 30, `${shape.base.label} = ${shape.base.value}`, C_BASE)}
      {pill(hm, HEIGHT_OFF[shape.type], 0, `${shape.height.label} = ${shape.height.value}`, C_HEIGHT)}
      {shape.base2 && b2m && pill(b2m, 0, -28, `${shape.base2.label} = ${shape.base2.value}`, C_B2)}
      {pill(dm, DECOY_OFF[shape.type][0], DECOY_OFF[shape.type][1], `${shape.decoy.name} ${shape.decoy.value}`, "var(--bdb-ink-faint)", true)}
    </svg>
  );
}

function ShapeIcon({ type }: { type: ShapeType }) {
  const stroke = "var(--bdb-ink)";
  const fill = `color-mix(in srgb, ${C_BASE} 22%, transparent)`;
  const shapes: Record<ShapeType, string> = {
    rectangle: "6,10 42,10 42,34 6,34",
    square: "12,8 40,8 40,36 12,36",
    parallelogram: "14,10 46,10 34,34 2,34",
    triangle: "24,8 44,34 4,34",
    trapezoid: "16,10 34,10 46,34 2,34",
  };
  return (
    <svg width={48} height={44} viewBox="0 0 48 44" aria-hidden="true">
      <polygon points={shapes[type]} fill={fill} stroke={stroke} strokeWidth={2.5} strokeLinejoin="miter" />
    </svg>
  );
}
