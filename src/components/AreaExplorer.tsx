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

// Decoy (slant/diagonal) label offset from its edge midpoint, kept clear of the
// shape's other marks (decoy sits left on para/trapezoid, right on triangle, and
// is a centered diagonal on rectangle/square).
const DECOY_OFF: Record<ShapeType, [number, number]> = { rectangle: [34, -18], square: [34, -18], parallelogram: [-34, -16], triangle: [40, -16], trapezoid: [-34, -16] };

const SHAPE_NAMES: Record<ShapeType, string> = {
  rectangle: "Rectangle", square: "Square", parallelogram: "Parallelogram", triangle: "Triangle", trapezoid: "Trapezoid",
};

const rand = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
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
// Optional fixed dims make a shape deterministic — used by the Practice mode's
// curated task set so every student works the same assigned builds.
interface FixedDims { b?: number; h?: number; k?: number; a?: number; b1?: number; b2?: number; o?: number; unit?: string; problemId?: string }

function makeShape(type: ShapeType, fixed?: FixedDims): Shape {
  const unit = fixed?.unit ?? UNITS[rand(0, UNITS.length - 1)];
  const slot = (id: string, value: number, color: string, ghost: string, mark: MarkKind): Slot => ({ id, value, color, ghost, mark });

  if (type === "rectangle" || type === "square") {
    let b = fixed?.b ?? (type === "square" ? rand(3, 8) : rand(3, 10));
    let h = type === "square" ? b : fixed?.h ?? rand(3, 8);
    // A random rectangle must READ as a rectangle — keep the sides at least
    // 3 apart so it never looks like the square tile next door.
    if (type === "rectangle" && fixed?.b == null) {
      while (Math.abs(b - h) < 3) { b = rand(3, 10); h = rand(3, 8); }
    }
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
      formula, slots, chips, area: b * h, problemId: fixed?.problemId ?? `${type}-${b}x${h}-${unit}`,
    };
  }

  if (type === "parallelogram") {
    const b = fixed?.b ?? rand(4, 9), h = fixed?.h ?? rand(3, 7), k = fixed?.k ?? rand(1, 4);
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
      formula, slots, chips, area: b * h, problemId: fixed?.problemId ?? `parallelogram-${b}x${h}s${k}-${unit}`,
    };
  }

  if (type === "triangle") {
    let b = fixed?.b ?? rand(4, 10), h = fixed?.h ?? rand(3, 8);
    while ((b * h) % 2 !== 0 && fixed?.b == null) { b = rand(4, 10); h = rand(3, 8); }
    const a = fixed?.a ?? rand(2, b - 1); // apex x — kept off the edges so the height sits clearly inside
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
      formula, slots, chips, area: (b * h) / 2, problemId: fixed?.problemId ?? `triangle-${b}x${h}a${a}-${unit}`,
    };
  }

  // trapezoid
  let b1 = fixed?.b1 ?? rand(5, 10), b2 = fixed?.b2 ?? rand(2, b1 - 2), h = fixed?.h ?? rand(3, 7);
  while (((b1 + b2) * h) % 2 !== 0 && fixed?.b1 == null) { b1 = rand(5, 10); b2 = rand(2, b1 - 2); h = rand(3, 7); }
  const o = fixed?.o ?? rand(1, Math.max(1, b1 - b2));
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
    formula, slots, chips, area: ((b1 + b2) * h) / 2, problemId: fixed?.problemId ?? `trapezoid-${b1}-${b2}x${h}o${o}-${unit}`,
  };
}

// ── Practice mode: the assigned task set (M1.T2-P1) ─────────────────────────
// A curated, deterministic sequence every student completes in order: four
// assigned builds (one per shape — copied onto the paper evidence card), one
// slanted-side error analysis, and a final check. Progress and completion are
// saved on the device so students can show the confirmed state before closing
// the Chromebook.
interface PracticeTask { title: string; type: ShapeType; fixed: FixedDims; note: string }

const PRACTICE_TASKS: PracticeTask[] = [
  { title: "Build 1 — Rectangle", type: "rectangle", fixed: { b: 7, h: 4, unit: "cm", problemId: "practice-1-rectangle-7x4" },
    note: "Copy this figure onto your evidence card: mark the base, the height, and the square units." },
  { title: "Build 2 — Parallelogram", type: "parallelogram", fixed: { b: 8, h: 5, k: 2, unit: "m", problemId: "practice-2-parallelogram-8x5" },
    note: "Copy this figure onto your evidence card. Careful — one of those numbers is the slant." },
  { title: "Build 3 — Triangle", type: "triangle", fixed: { b: 10, h: 4, a: 3, unit: "in", problemId: "practice-3-triangle-10x4" },
    note: "Copy this figure onto your evidence card: mark the base and the PERPENDICULAR height." },
  { title: "Build 4 — Trapezoid", type: "trapezoid", fixed: { b1: 9, b2: 5, h: 4, o: 2, unit: "ft", problemId: "practice-4-trapezoid-9-5x4" },
    note: "Copy this figure onto your evidence card: label both bases and the height." },
  { title: "Error analysis", type: "parallelogram", fixed: { b: 6, h: 4, k: 3, unit: "cm", problemId: "practice-5-error-slant" },
    note: "A student used the slant side as the height. Put the CORRECT measurements in the formula, then write the fix on your card." },
  { title: "Final check — Triangle", type: "triangle", fixed: { b: 8, h: 6, a: 5, unit: "m", problemId: "practice-6-triangle-8x6" },
    note: "Last one. Every measurement, the right formula, the right unit." },
];

const PRACTICE_KEY = "bdm-area-practice-v1";
interface PracticeResult { firstTry: boolean; wrongs: number }
interface PracticeSave { idx: number; results: (PracticeResult | null)[]; confirmedAt: string | null }

function loadPractice(): PracticeSave {
  const empty: PracticeSave = { idx: 0, results: PRACTICE_TASKS.map(() => null), confirmedAt: null };
  try {
    const raw = window.localStorage.getItem(PRACTICE_KEY);
    if (!raw) return empty;
    const p = JSON.parse(raw) as PracticeSave;
    if (typeof p.idx !== "number" || !Array.isArray(p.results)) return empty;
    return {
      idx: Math.max(0, Math.min(PRACTICE_TASKS.length, p.idx)),
      results: PRACTICE_TASKS.map((_, i) => p.results[i] ?? null),
      confirmedAt: typeof p.confirmedAt === "string" ? p.confirmedAt : null,
    };
  } catch { return empty; }
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
  const [mode, setMode] = useState<"solve" | "practice" | "sandbox" | "composite">("solve");
  const [phase, setPhase] = useState<Phase>("bank");
  const [shape, setShape] = useState<Shape | null>(null);
  const [placed, setPlaced] = useState<Record<string, number | null>>({});
  const [slotEntry, setSlotEntry] = useState(""); // what the student is typing into the active blank
  const [answer, setAnswer] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [wrongSteps, setWrongSteps] = useState(0);
  const [firstTag, setFirstTag] = useState<string | null>(null);
  const [showCount, setShowCount] = useState(false);
  const [whySquared, setWhySquared] = useState(false);
  const [finePointer, setFinePointer] = useState(false);
  const solvedRef = useRef(false);

  // Practice mode: current task, per-task results, and the confirmed state —
  // persisted on the device so completion survives a reload and can be shown
  // to the teacher before the Chromebook closes.
  const [pIdx, setPIdx] = useState(0);
  const [pResults, setPResults] = useState<(PracticeResult | null)[]>(() => PRACTICE_TASKS.map(() => null));
  const [pConfirmedAt, setPConfirmedAt] = useState<string | null>(null);
  // Hydration gate as STATE, not a ref: the save effect must not run until the
  // loaded values have actually rendered, or a remount can overwrite the saved
  // progress with the initial empty state.
  const [pHydrated, setPHydrated] = useState(false);

  useEffect(() => { setFinePointer(window.matchMedia?.("(pointer: fine)").matches ?? false); }, []);

  useEffect(() => {
    const saved = loadPractice();
    setPIdx(saved.idx); setPResults(saved.results); setPConfirmedAt(saved.confirmedAt);
    setPHydrated(true);
  }, []);

  useEffect(() => {
    if (!pHydrated) return;
    try {
      window.localStorage.setItem(PRACTICE_KEY, JSON.stringify({ idx: pIdx, results: pResults, confirmedAt: pConfirmedAt } satisfies PracticeSave));
    } catch { /* storage unavailable — practice still works, it just won't survive a reload */ }
  }, [pHydrated, pIdx, pResults, pConfirmedAt]);

  const flagWrong = useCallback((tag: string) => {
    setWrongSteps((w) => w + 1);
    setFirstTag((t) => t ?? tag);
  }, []);

  const startShape = useCallback((s: Shape) => {
    setShape(s);
    setPlaced(Object.fromEntries(s.slots.map((sl) => [sl.id, null])));
    setSlotEntry(""); setAnswer(""); setNote(null);
    setWrongSteps(0); setFirstTag(null); setShowCount(false); setWhySquared(false);
    solvedRef.current = false;
    setPhase("substitute");
  }, []);

  const pickShape = useCallback((type: ShapeType) => startShape(makeShape(type)), [startShape]);
  const resetProblem = useCallback(() => { if (shape) startShape({ ...shape }); }, [shape, startShape]);
  const randomSame = useCallback(() => { if (shape) startShape(makeShape(shape.type)); }, [shape, startShape]);

  // Entering practice (or advancing to the next task) starts that task's shape.
  useEffect(() => {
    if (!pHydrated || mode !== "practice") return;
    if (pIdx < PRACTICE_TASKS.length) {
      const t = PRACTICE_TASKS[pIdx];
      startShape(makeShape(t.type, t.fixed));
    }
  }, [pHydrated, mode, pIdx, startShape]);

  const practiceAdvance = useCallback(() => {
    setPIdx((i) => Math.min(PRACTICE_TASKS.length, i + 1));
  }, []);
  const practiceRestart = useCallback(() => {
    if (!window.confirm("Start the whole practice set over? Your saved progress will be cleared.")) return;
    setPResults(PRACTICE_TASKS.map(() => null));
    setPConfirmedAt(null);
    setPIdx(0);
    // start task 1 directly — the pIdx effect won't re-fire if we were already on it
    startShape(makeShape(PRACTICE_TASKS[0].type, PRACTICE_TASKS[0].fixed));
  }, [startShape]);

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

  // Students type each measurement themselves, in formula order — the base
  // before the height (and b1 before b2 before h on a trapezoid). The next
  // blank only opens once the current one is right.
  const activeSlot = useMemo(
    () => (shape ? shape.slots.find((sl) => placed[sl.id] !== sl.value) ?? null : null),
    [shape, placed],
  );

  function submitSlotEntry() {
    if (!shape || !activeSlot) return;
    const raw = slotEntry.trim();
    if (!raw) return;
    const value = Number(raw);
    if (!Number.isFinite(value)) { setSlotEntry(""); return; }
    if (value === shape.decoy.value) {
      setNote(shape.decoy.name === "diagonal"
        ? "That's the diagonal, not a side you multiply. Use the base and the height."
        : "That's the slant side, not the height. The height has the right-angle mark — use the dashed length.");
      flagWrong("slant-for-height");
      setSlotEntry("");
      return;
    }
    if (value !== activeSlot.value) {
      setNote(activeSlot.mark === "height"
        ? "Check the figure again — the height goes straight up from the base."
        : shape.type === "square"
        ? "A square's sides are equal — both blanks are the same number."
        : "Check the figure again — find the labeled measurement for this blank.");
      flagWrong("swapped-dims");
      setSlotEntry("");
      return;
    }
    setNote(null);
    setPlaced((p) => ({ ...p, [activeSlot.id]: value }));
    setSlotEntry("");
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
        // Practice: record the task result the moment it's solved, so progress
        // is saved even if the Chromebook closes on the done screen. The retry
        // count is the "clicks until correct" look-for made visible.
        if (mode === "practice" && pIdx < PRACTICE_TASKS.length) {
          setPResults((rs) => rs.map((r, i) => (i === pIdx ? { firstTry: wrongSteps === 0, wrongs: wrongSteps } : r)));
        }
      }
      setPhase("done");
      return;
    }
    if (exp === 0) { setNote("That measures length. Area is how much surface a shape covers — that's 2D."); flagWrong("linear-unit"); }
    else { setNote("That's for 3D solids. This shape is flat, so it's 2D."); flagWrong("cubed-unit"); }
  }

  // Pulse the figure label for whichever measurement the student is typing now.
  const activeMark: MarkKind | null = phase === "substitute" ? activeSlot?.mark ?? null : null;

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
        .ae-svg { width:100%; max-width:560px; height:auto; touch-action:none; user-select:none; -webkit-user-select:none; }
        .ae-mark-pulse { animation:aePulse 1s ease-in-out infinite; transform-box:fill-box; transform-origin:center; }
        @keyframes aePulse { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
        .ae-formula { display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:8px; font-weight:900; font-size:clamp(1.3rem,4vw,1.9rem); margin:12px 0 4px; }
        .ae-slot { display:inline-grid; place-items:center; min-width:56px; min-height:52px; padding:0 8px; border:3px solid var(--bdb-line); border-radius:0; background:#fff; color:var(--bdb-ink); }
        .ae-slot .ghost { color:var(--bdb-ink-faint); font-weight:800; }
        .ae-slot.ok { color:#fff; }
        .ae-slot.dim { opacity:0.5; background:var(--bdb-ground-2); }
        .ae-slotin { width:92px; min-height:52px; font:inherit; font-size:1.25rem; font-weight:900; text-align:center; padding:0 8px; border:3px solid var(--bdb-ink); border-radius:0; background:#fff; color:var(--bdb-ink); }
        .ae-slotin::placeholder { color:var(--bdb-ink-faint); font-weight:800; }
        .ae-answer { width:120px; font:inherit; font-size:1.3rem; font-weight:900; text-align:center; padding:6px; border:3px solid var(--bdb-ink); border-radius:0; background:#fff; color:var(--bdb-ink); }
        .ae-unitchips { display:flex; gap:10px; justify-content:center; margin:8px 0; flex-wrap:wrap; }
        .ae-uchip { min-width:74px; min-height:56px; padding:0 16px; border:2px solid var(--bdb-ink); border-radius:0; background:var(--bdb-card); color:var(--bdb-ink); font:inherit; font-weight:900; font-size:1.25rem; cursor:pointer; }
        .ae-bar { display:flex; gap:8px; justify-content:center; align-items:center; margin-top:14px; flex-wrap:wrap; }
        .ae-btn { font:inherit; font-weight:700; font-size:0.9rem; padding:9px 16px; border-radius:11px; border:1px solid var(--bdb-line); background:var(--bdb-ink); color:#fff; cursor:pointer; }
        .ae-btn.ghost { background:var(--bdb-card); color:var(--bdb-ink); }
        .ae-btn:disabled { opacity:0.42; cursor:not-allowed; }
        .ae-link { font:inherit; font-weight:700; font-size:0.82rem; color:var(--bdb-ink-soft); background:none; border:none; text-decoration:underline; cursor:pointer; }
        .ae-note { text-align:center; min-height:26px; margin-top:12px; }
        .ae-note .ae-note-in { display:inline-block; color:var(--bdb-coral); font-weight:800; font-size:clamp(1.05rem,3.2vw,1.4rem); line-height:1.35; padding:8px 16px; border-radius:12px; background:color-mix(in srgb, var(--bdb-coral) 12%, transparent); animation:aeNotePop .32s var(--ae-carry); }
        @keyframes aeNotePop { from { transform:scale(.9); opacity:0; } to { transform:scale(1); opacity:1; } }
        .ae-why { max-width:520px; margin:12px auto 0; text-align:center; color:var(--bdb-ink); font-weight:600; font-size:clamp(1.02rem,2.8vw,1.22rem); line-height:1.55; }
        .ae-done .eq { text-align:center; font-size:clamp(1.6rem,5vw,2.6rem); font-weight:900; margin:8px 0; }
        .ae-modebar { display:flex; justify-content:center; margin:0 0 14px; }
        .ae-modeseg { display:inline-flex; border:2px solid var(--bdb-line); border-radius:999px; overflow:hidden; background:var(--bdb-card); }
        .ae-modeseg button { font:inherit; font-weight:800; font-size:0.9rem; min-height:44px; padding:0 22px; border:none; background:transparent; color:var(--bdb-ink-soft); cursor:pointer; }
        .ae-modeseg button.on { background:var(--bdb-ink); color:#fff; }
        .ae-stats { display:flex; flex-wrap:wrap; gap:10px; justify-content:center; margin:12px 0 2px; }
        .ae-stat { display:grid; justify-items:center; gap:2px; min-width:82px; padding:8px 14px; border:1px solid var(--bdb-line); border-radius:0; background:var(--bdb-card); }
        .ae-stat span { font-size:0.66rem; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; color:var(--bdb-ink-faint); }
        .ae-stat b { font-size:1.4rem; font-weight:900; }
        .ae-stat.hl { border-color:var(--bdb-ink); }
        .ae-stat.muted b { color:var(--bdb-ink-faint); }
        .ae-slide { animation:aeSlide .72s var(--ae-carry) forwards; }
        @keyframes aeSlide { to { transform:translateX(var(--dx)); } }
        .ae-flip { animation:aeFlip .85s var(--ae-carry) forwards; transform-box:view-box; }
        @keyframes aeFlip { from { transform:rotate(180deg); } to { transform:rotate(0deg); } }
        .ae-count-cell { animation:aeCountIn .34s var(--ae-carry) backwards; transform-box:fill-box; transform-origin:center; }
        @keyframes aeCountIn { from { opacity:0; transform:scale(.55); } 60% { opacity:1; transform:scale(1.09); } to { opacity:1; transform:scale(1); } }
        .ae-soon { font-size:0.72rem; font-weight:800; color:var(--bdb-ink-faint); }
        .ae-ptask { text-align:center; margin:0 auto 6px; width:max-content; max-width:100%; font-size:0.8rem; font-weight:800; letter-spacing:0.05em; text-transform:uppercase; color:var(--bdb-teal); border:2px solid color-mix(in srgb, var(--bdb-teal) 45%, transparent); border-radius:999px; padding:4px 14px; background:color-mix(in srgb, var(--bdb-teal) 10%, var(--bdb-card)); }
        .ae-plist { width:min(440px,100%); margin:6px auto 0; border:2px solid var(--bdb-line); background:var(--bdb-card); }
        .ae-prow { display:flex; justify-content:space-between; gap:10px; padding:9px 14px; border-bottom:1px solid var(--bdb-line); font-size:0.92rem; }
        .ae-prow:last-child { border-bottom:none; }
        .ae-prow-name { font-weight:700; }
        .ae-prow-res { font-weight:800; color:var(--bdb-ink-soft); }
        .ae-prow-res.good { color:var(--bdb-green); }
        .ae-pconfirm { max-width:460px; margin:12px auto 0; text-align:center; font-weight:700; font-size:0.95rem; color:var(--bdb-ink-soft); }
        .ae-pconfirm.on { color:var(--bdb-green); font-weight:800; font-size:1.05rem; border:2px solid color-mix(in srgb, var(--bdb-green) 45%, transparent); background:color-mix(in srgb, var(--bdb-green) 10%, var(--bdb-card)); padding:12px 16px; }
        @media (prefers-reduced-motion: reduce) { .ae-mark-pulse { animation:none; } .ae-slide { animation:none; transform:translateX(var(--dx)); } .ae-flip { animation:none; } .ae-count-cell { animation:none; } }
      `}</style>

      <div className="ae-modebar">
        <div className="ae-modeseg">
          <button className={mode === "solve" ? "on" : ""} onClick={() => setMode("solve")}>Solve</button>
          <button className={mode === "practice" ? "on" : ""} onClick={() => setMode("practice")}>Practice</button>
          <button className={mode === "composite" ? "on" : ""} onClick={() => setMode("composite")}>Composite</button>
          <button className={mode === "sandbox" ? "on" : ""} onClick={() => setMode("sandbox")}>Sandbox</button>
        </div>
      </div>

      {mode === "sandbox" && <AreaSandbox />}
      {mode === "composite" && <AreaComposite />}

      {mode === "solve" && phase === "bank" && (
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

      {(mode === "solve" || (mode === "practice" && pIdx < PRACTICE_TASKS.length)) && phase !== "bank" && shape && (
        <>
          {mode === "practice" && (
            <div className="ae-ptask">Task {pIdx + 1} of {PRACTICE_TASKS.length} — {PRACTICE_TASKS[pIdx].title}</div>
          )}
          <div className="ae-prompt">
            {phase === "substitute" && "Put each measurement into the formula."}
            {phase === "compute" && "Now solve it."}
            {phase === "unit" && "What unit is the area measured in?"}
            {phase === "done" && (mode === "practice" ? `Task ${pIdx + 1} complete` : `${SHAPE_NAMES[shape.type]} solved`)}
          </div>
          <div className="ae-sub">
            {phase === "substitute" && (mode === "practice" ? PRACTICE_TASKS[pIdx].note : "Read the figure and type each measurement — base first.")}
            {phase === "compute" && "Work out the area, then enter it."}
            {phase === "unit" && "Length, area, or volume? Pick the unit."}
            {phase === "done" && (mode === "practice" ? (wrongSteps === 0 ? "First try. Copy anything you still need onto your evidence card." : "Solved — copy anything you still need onto your evidence card.") : "Same area, however you measured it.")}
          </div>

          <div className="ae-tools">
            {mode === "solve" && <button className="ae-tbtn" onClick={back}>Back</button>}
            <button className="ae-tbtn" onClick={resetProblem}>Reset</button>
            {mode === "solve" && <button className="ae-tbtn" onClick={randomSame}>Random</button>}
          </div>

          <div className="ae-stage">
            <ShapeSvg shape={shape} phase={phase} activeMark={activeMark} showCount={showCount} whySquared={whySquared} />

            {phase === "substitute" && (
              <>
                <div className="ae-formula">
                  {shape.formula.map((tok, i) => {
                    if (tok.t === "text") return <span key={i}>{tok.v}</span>;
                    const filled = placed[tok.slot.id] === tok.slot.value;
                    const isActive = activeSlot?.id === tok.slot.id;
                    if (filled) {
                      return (
                        <span key={i} className="ae-slot ok" style={{ background: tok.slot.color, borderColor: tok.slot.color, color: "#fff" }}>
                          {tok.slot.value}
                        </span>
                      );
                    }
                    if (isActive) {
                      return (
                        <input key={i} className="ae-slotin" style={{ borderColor: tok.slot.color }}
                          value={slotEntry} inputMode="decimal" autoFocus={finePointer}
                          placeholder={tok.slot.ghost} aria-label={`value for ${tok.slot.ghost}`}
                          onChange={(e) => { setSlotEntry(e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1")); setNote(null); }}
                          onKeyDown={(e) => e.key === "Enter" && submitSlotEntry()} />
                      );
                    }
                    return (
                      <span key={i} className="ae-slot dim" style={{ borderColor: tok.slot.color }}>
                        <span className="ghost">{tok.slot.ghost}</span>
                      </span>
                    );
                  })}
                </div>
                <div className="ae-bar">
                  <button className="ae-link" onClick={() => setShowCount((c) => !c)}>{showCount ? "Hide the squares" : "Count the squares"}</button>
                  {allFilled
                    ? <button className="ae-btn" onClick={() => { setNote(null); setPhase("compute"); }}>Compute</button>
                    : <button className="ae-btn" disabled={!slotEntry.trim()} onClick={submitSlotEntry}>Enter</button>}
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
                  {mode === "practice" ? (
                    <button className="ae-btn" onClick={practiceAdvance}>
                      {pIdx === PRACTICE_TASKS.length - 1 ? "Finish practice" : "Next task"}
                    </button>
                  ) : (
                    <>
                      <button className="ae-btn ghost" onClick={() => { setShape(null); setPhase("bank"); }}>New shape</button>
                      <button className="ae-btn" onClick={randomSame}>Same shape again</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="ae-note">{note && <span key={note} className="ae-note-in">{note}</span>}</div>
        </>
      )}

      {mode === "practice" && pIdx >= PRACTICE_TASKS.length && (
        <div className="ae-stage">
          <div className="ae-prompt">Practice complete</div>
          <div className="ae-sub">All {PRACTICE_TASKS.length} assigned tasks are done and saved on this device.</div>

          <div className="ae-plist" role="list">
            {PRACTICE_TASKS.map((t, i) => {
              const r = pResults[i];
              return (
                <div key={i} className="ae-prow" role="listitem">
                  <span className="ae-prow-name">{t.title}</span>
                  <span className={`ae-prow-res ${r && r.firstTry ? "good" : ""}`}>
                    {r ? (r.firstTry ? "first try" : `${r.wrongs} ${r.wrongs === 1 ? "retry" : "retries"}`) : "done"}
                  </span>
                </div>
              );
            })}
          </div>

          {pConfirmedAt ? (
            <div className="ae-pconfirm on" role="status">
              Submitted and confirmed — {pConfirmedAt}. Show this screen to your teacher before you close the Chromebook.
            </div>
          ) : (
            <>
              <div className="ae-pconfirm" role="status">Saved. One last step: confirm your work below.</div>
              <div className="ae-bar">
                <button className="ae-btn" onClick={() => setPConfirmedAt(new Date().toLocaleString())}>Confirm my practice is complete</button>
              </div>
            </>
          )}

          <div className="ae-bar">
            <button className="ae-link" onClick={practiceRestart}>Start the practice set over</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shape rendering ─────────────────────────────────────────────────────────
function ShapeSvg({ shape, phase, activeMark, showCount, whySquared }: { shape: Shape; phase: Phase; activeMark: MarkKind | null; showCount: boolean; whySquared: boolean }) {
  const U = Math.max(28, Math.min(52, Math.floor(Math.min(460 / shape.cols, 300 / shape.rows))));
  // asymmetric margins so every measurement label sits OUTSIDE the shape:
  // room on the left for the height, below for the base, above for a top base.
  const ML = 80, MR = 34, MT = 44, MB = 48;
  const sx = (gx: number) => ML + gx * U;
  const sy = (gy: number) => MT + gy * U;
  const W = ML + shape.cols * U + MR;
  const H = MT + shape.rows * U + MB;
  const solved = phase === "done";
  const region = solved ? `color-mix(in srgb, ${C_BASE} 42%, transparent)` : `color-mix(in srgb, ${C_BASE} 20%, transparent)`;

  // interior unit squares, in reading order (left-to-right, top-to-bottom)
  const orderedCells = useMemo(() => {
    if (!showCount && !whySquared) return [] as Pt[];
    const cells: Pt[] = [];
    for (let gy = 0; gy < shape.rows; gy++) for (let gx = 0; gx < shape.cols; gx++) {
      if (inPoly(gx + 0.5, gy + 0.5, shape.verts)) cells.push([gx, gy]);
    }
    return whySquared ? cells.slice(0, 1) : cells;
  }, [showCount, whySquared, shape]);

  // stagger the count reveal one square at a time (CSS-driven, no per-tick
  // re-render) — numbers appear left-to-right, top-to-bottom
  const per = orderedCells.length ? Math.max(45, Math.min(150, Math.round(1500 / orderedCells.length))) : 0;

  const pts = shape.verts.map((v) => `${sx(v[0])},${sy(v[1])}`).join(" ");
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const numSize = Math.max(11, Math.min(18, Math.round(U * 0.44)));

  // outside dimension label — bold colored text with a ground-colored halo so it
  // stays legible over the grid lines
  const dimLabel = (x: number, y: number, text: string, color: string, anchor: "middle" | "end" = "middle") => (
    <text x={x} y={y} textAnchor={anchor} dominantBaseline="central" fontSize={16} fontWeight={900}
      fill={color} stroke="var(--bdb-ground)" strokeWidth={3.6} style={{ paintOrder: "stroke" }}>{text}</text>
  );

  const dm = mid(shape.decoy.a, shape.decoy.b);
  const b2m = shape.base2 ? mid(shape.base2.a, shape.base2.b) : null;
  const foot = shape.height.foot;
  const raSign = shape.height.a[0] <= shape.base.b[0] ? 1 : -1; // right-angle mark direction along base
  const baseMidX = (shape.base.a[0] + shape.base.b[0]) / 2;
  const gridTop = sy(0), gridBot = sy(shape.rows);
  const pulse = (mark: MarkKind) => (activeMark === mark ? "ae-mark-pulse" : undefined);

  return (
    <svg className="ae-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${shape.type} on a grid`}>
      <defs>
        <pattern id={`ae-cell-${shape.type}`} width={U} height={U} patternUnits="userSpaceOnUse">
          <path d={`M ${U} 0 L 0 0 0 ${U}`} fill="none" stroke="var(--bdb-line)" strokeWidth={1} opacity={0.85} />
        </pattern>
      </defs>
      <rect x={ML} y={MT} width={shape.cols * U} height={shape.rows * U} fill={`url(#ae-cell-${shape.type})`} />

      {/* shape */}
      <polygon points={pts} fill={region} stroke="var(--bdb-ink)" strokeWidth={3} strokeLinejoin="miter" />

      {/* decoy edge (faint) */}
      <line x1={sx(shape.decoy.a[0])} y1={sy(shape.decoy.a[1])} x2={sx(shape.decoy.b[0])} y2={sy(shape.decoy.b[1])} stroke="var(--bdb-ink-faint)" strokeWidth={2} strokeDasharray="2 4" />

      {/* count-the-squares: reveal + number one square at a time (staggered) */}
      {!whySquared && showCount && orderedCells.map(([gx, gy], i) => (
        <g key={`c-${gx}-${gy}`} className="ae-count-cell" style={{ animationDelay: `${i * per}ms` }}>
          <rect x={sx(gx)} y={sy(gy)} width={U} height={U} fill={C_BASE} opacity={0.32} />
          <text x={sx(gx) + U / 2} y={sy(gy) + U / 2} textAnchor="middle" dominantBaseline="central" fontSize={numSize} fontWeight={900} fill="var(--bdb-ink)">{i + 1}</text>
        </g>
      ))}

      {/* why-squared: a single highlighted unit square */}
      {whySquared && orderedCells.map(([gx, gy]) => (
        <rect key={`w-${gx}-${gy}`} x={sx(gx)} y={sy(gy)} width={U} height={U} fill={C_HEIGHT} opacity={0.6} />
      ))}

      {/* base — bracket + label below (outside) */}
      <g className={pulse("base")}>
        <path d={`M ${sx(shape.base.a[0])} ${sy(shape.base.a[1]) + 10} L ${sx(shape.base.a[0])} ${sy(shape.base.a[1]) + 16} L ${sx(shape.base.b[0])} ${sy(shape.base.b[1]) + 16} L ${sx(shape.base.b[0])} ${sy(shape.base.b[1]) + 10}`}
          fill="none" stroke={C_BASE} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {dimLabel(sx(baseMidX), sy(shape.base.a[1]) + 32, `${shape.base.label} = ${shape.base.value}`, C_BASE)}
      </g>

      {/* height — interior perpendicular + right-angle mark, plus a left bracket + label (outside) */}
      <g className={pulse("height")}>
        <line x1={sx(shape.height.a[0])} y1={sy(shape.height.a[1])} x2={sx(shape.height.b[0])} y2={sy(shape.height.b[1])} stroke={C_HEIGHT} strokeWidth={2.5} strokeDasharray="7 5" />
        <path d={`M ${sx(foot[0]) + raSign * 9} ${sy(foot[1])} L ${sx(foot[0]) + raSign * 9} ${sy(foot[1]) - 9} L ${sx(foot[0])} ${sy(foot[1]) - 9}`} fill="none" stroke={C_HEIGHT} strokeWidth={2} />
        <path d={`M ${ML - 10} ${gridTop} L ${ML - 16} ${gridTop} L ${ML - 16} ${gridBot} L ${ML - 10} ${gridBot}`} fill="none" stroke={C_HEIGHT} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {dimLabel(ML - 24, (gridTop + gridBot) / 2, `${shape.height.label} = ${shape.height.value}`, C_HEIGHT, "end")}
      </g>

      {/* trapezoid top base — bracket + label above (outside) */}
      {shape.base2 && b2m && (
        <g className={pulse("b2")}>
          <path d={`M ${sx(shape.base2.a[0])} ${sy(shape.base2.a[1]) - 10} L ${sx(shape.base2.a[0])} ${sy(shape.base2.a[1]) - 16} L ${sx(shape.base2.b[0])} ${sy(shape.base2.b[1]) - 16} L ${sx(shape.base2.b[0])} ${sy(shape.base2.b[1]) - 10}`}
            fill="none" stroke={C_B2} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          {dimLabel(sx(b2m[0]), sy(shape.base2.a[1]) - 32, `${shape.base2.label} = ${shape.base2.value}`, C_B2)}
        </g>
      )}

      {/* decoy label (muted, near its edge) */}
      {dimLabel(sx(dm[0]) + DECOY_OFF[shape.type][0], sy(dm[1]) + DECOY_OFF[shape.type][1], `${shape.decoy.name} ${shape.decoy.value}`, "var(--bdb-ink-faint)")}
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

// ── Sandbox: derive the formulas by reshaping ───────────────────────────────
function AreaSandbox() {
  const [story, setStory] = useState<"para" | "tri" | "trap" | null>(null);
  if (story === "para") return <SandboxPara onBack={() => setStory(null)} />;
  if (story === "tri") return <SandboxTriangleLock onBack={() => setStory(null)} />;
  if (story === "trap") return <SandboxDouble kind="trapezoid" onBack={() => setStory(null)} />;
  return (
    <div className="ae-stage">
      <div className="ae-prompt">Build a shape to see where its formula comes from.</div>
      <div className="ae-sub">Reshape or double a shape and watch the area stay the same.</div>
      <div className="ae-bank">
        <button className="ae-shapecard" onClick={() => setStory("para")}>
          <ShapeIcon type="parallelogram" /><span>Parallelogram from a rectangle</span>
        </button>
        <button className="ae-shapecard" onClick={() => setStory("tri")}>
          <ShapeIcon type="triangle" /><span>Triangle is half</span>
        </button>
        <button className="ae-shapecard" onClick={() => setStory("trap")}>
          <ShapeIcon type="trapezoid" /><span>Trapezoid from two</span>
        </button>
      </div>
    </div>
  );
}

// Rectangle -> parallelogram: shear the top edge (base & height are fixed by
// construction, so the Area readout never moves), then cut the overhang
// triangle loose. After the cut the triangle stays a free, draggable piece —
// students can slide it anywhere and drop it in the gap to rebuild the
// rectangle. Base and height are labelled right on the figure.
function SandboxPara({ onBack }: { onBack: () => void }) {
  const b = 8, h = 5;
  const cols = 2 * b, rows = h;
  const U = Math.max(28, Math.min(52, Math.floor(Math.min(460 / cols, 300 / rows))));
  const M = Math.max(Math.round(1.4 * U), 66); // extra left room for the height label
  const W = 2 * M + cols * U, H = 2 * M + rows * U;
  const sx = (gx: number) => M + gx * U;
  const sy = (gy: number) => M + gy * U;
  const target = b * U; // slide that drops the triangle into the gap

  const [k, setK] = useState(0);
  const [step, setStep] = useState<"shear" | "cut">("shear");
  const [piece, setPiece] = useState({ x: 0, y: 0 }); // triangle offset in svg px
  const [dragging, setDragging] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const modeRef = useRef<null | "corner" | "piece">(null);
  const startRef = useRef({ cx: 0, cy: 0, ox: 0, oy: 0 });

  const scaleOf = () => { const r = svgRef.current?.getBoundingClientRect(); return r ? r.width / W : 1; };
  const setKfromClient = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const svgX = (clientX - r.left) / (r.width / W);
    setK(clamp(Math.round((svgX - M) / U), 0, b));
  };

  const onSvgDown = (e: React.PointerEvent) => {
    if (step !== "shear") return;
    modeRef.current = "corner"; svgRef.current?.setPointerCapture?.(e.pointerId); setKfromClient(e.clientX);
  };
  const onPieceDown = (e: React.PointerEvent) => {
    if (step !== "cut") return;
    e.stopPropagation();
    modeRef.current = "piece"; setDragging(true);
    startRef.current = { cx: e.clientX, cy: e.clientY, ox: piece.x, oy: piece.y };
    svgRef.current?.setPointerCapture?.(e.pointerId);
  };
  const onSvgMove = (e: React.PointerEvent) => {
    if (modeRef.current === "corner") { setKfromClient(e.clientX); return; }
    if (modeRef.current === "piece") {
      const s = scaleOf();
      const nx = clamp(startRef.current.ox + (e.clientX - startRef.current.cx) / s, -k * U, cols * U);
      const ny = clamp(startRef.current.oy + (e.clientY - startRef.current.cy) / s, -rows * U, rows * U);
      setPiece({ x: nx, y: ny });
    }
  };
  const onSvgUp = () => {
    if (modeRef.current === "piece") {
      setDragging(false);
      setPiece((p) => (Math.hypot(p.x - target, p.y) < 0.7 * U ? { x: target, y: 0 } : p)); // snap into the gap
    }
    modeRef.current = null;
  };

  // Cut frees the overhang triangle in place — the student drags it into the
  // gap themselves (it snaps + transitions home on release, see onSvgUp).
  const cut = () => { setStep("cut"); setPiece({ x: 0, y: 0 }); };
  const reset = () => { setK(0); setStep("shear"); setPiece({ x: 0, y: 0 }); setDragging(false); };

  const snapped = step === "cut" && Math.abs(piece.x - target) < 1 && Math.abs(piece.y) < 1;
  const slant = round1(Math.hypot(k, h));
  const para = `${sx(k)},${sy(0)} ${sx(b + k)},${sy(0)} ${sx(b)},${sy(h)} ${sx(0)},${sy(h)}`;
  const remain = `${sx(k)},${sy(0)} ${sx(b + k)},${sy(0)} ${sx(b)},${sy(h)} ${sx(k)},${sy(h)}`;
  const tri = `${sx(0)},${sy(h)} ${sx(k)},${sy(h)} ${sx(k)},${sy(0)}`;
  const fillB = `color-mix(in srgb, ${C_BASE} 20%, transparent)`;
  const fillTri = `color-mix(in srgb, ${C_HEIGHT} 45%, transparent)`;

  return (
    <div className="ae-stage">
      <div className="ae-prompt">
        {step === "cut" ? (snapped ? "Same area — a rectangle rearranged." : "The corner is a free piece now.") : "Lean the rectangle into a parallelogram."}
      </div>
      <div className="ae-sub">
        {step === "shear" ? (k > 0 ? "The slant grew — but the base and height did not." : "Drag the top corner across the grid.")
          : snapped ? "It fills the gap exactly — that is why A = base times height." : "Drag the amber triangle anywhere, or drop it in the gap on the right."}
      </div>

      <div className="ae-tools">
        <button className="ae-tbtn" onClick={onBack}>Back</button>
        <button className="ae-tbtn" onClick={reset}>Reset</button>
      </div>

      <svg ref={svgRef} className="ae-svg" viewBox={`0 0 ${W} ${H}`} onPointerDown={onSvgDown} onPointerMove={onSvgMove} onPointerUp={onSvgUp} onPointerCancel={onSvgUp}>
        <defs>
          <pattern id="ae-sb-cell" width={U} height={U} patternUnits="userSpaceOnUse">
            <path d={`M ${U} 0 L 0 0 0 ${U}`} fill="none" stroke="var(--bdb-line)" strokeWidth={1} opacity={0.75} />
          </pattern>
        </defs>
        <rect x={M} y={M} width={cols * U} height={rows * U} fill="url(#ae-sb-cell)" />

        {step === "shear" && (
          <>
            <polygon points={para} fill={fillB} stroke="var(--bdb-ink)" strokeWidth={3} strokeLinejoin="miter" />
            <circle cx={sx(k)} cy={sy(0)} r={14} fill="var(--bdb-ink)" style={{ cursor: "grab" }} />
            <circle cx={sx(k)} cy={sy(0)} r={5} fill="#fff" style={{ pointerEvents: "none" }} />
          </>
        )}
        {step === "cut" && (
          <>
            <polygon points={remain} fill={fillB} stroke="var(--bdb-ink)" strokeWidth={3} strokeLinejoin="miter" />
            <polygon points={tri} fill={fillTri} stroke="var(--bdb-ink)" strokeWidth={3} strokeLinejoin="miter"
              transform={`translate(${piece.x} ${piece.y})`} onPointerDown={onPieceDown}
              style={{ cursor: dragging ? "grabbing" : "grab", transition: dragging ? "none" : "transform .7s var(--ae-carry)", touchAction: "none" }} />
          </>
        )}

        {/* base bracket + label */}
        <path d={`M ${sx(0)} ${sy(h) + 12} L ${sx(0)} ${sy(h) + 18} L ${sx(b)} ${sy(h) + 18} L ${sx(b)} ${sy(h) + 12}`}
          fill="none" stroke={C_BASE} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        <text x={sx(b / 2)} y={sy(h) + 34} textAnchor="middle" dominantBaseline="hanging" fontSize={15} fontWeight={900} fill={C_BASE}>b = {b}</text>

        {/* height line (dashed) + right-angle mark + label */}
        <line x1={sx(0)} y1={sy(0)} x2={sx(0)} y2={sy(h)} stroke={C_HEIGHT} strokeWidth={2.5} strokeDasharray="7 5" />
        <path d={`M ${sx(0) + 9} ${sy(h)} L ${sx(0) + 9} ${sy(h) - 9} L ${sx(0)} ${sy(h) - 9}`} fill="none" stroke={C_HEIGHT} strokeWidth={2} />
        <text x={sx(0) - 12} y={sy(h / 2)} textAnchor="end" dominantBaseline="central" fontSize={15} fontWeight={900} fill={C_HEIGHT}>h = {h}</text>
      </svg>

      <div className="ae-stats">
        <div className="ae-stat"><span>base</span><b>{b}</b></div>
        <div className="ae-stat"><span>height</span><b>{h}</b></div>
        <div className="ae-stat hl"><span>Area = base x height</span><b>{b * h}</b></div>
        <div className="ae-stat muted"><span>slant</span><b>{step === "shear" ? slant : "-"}</b></div>
      </div>

      <div className="ae-bar">
        {step === "shear" && <button className="ae-btn" disabled={k === 0} onClick={cut}>Cut the corner</button>}
        {step === "cut" && <button className="ae-btn ghost" onClick={reset}>Back to a rectangle</button>}
      </div>
      {snapped && <p className="ae-why">Same base, same height, same area. A parallelogram is just a rectangle rearranged — that is why A = base times height.</p>}
    </div>
  );
}

// Triangle / trapezoid -> parallelogram by doubling: a congruent copy rotated
// 180 degrees about the midpoint of the right edge closes into a parallelogram.
// The copy is drawn in its FINAL position and the flip animation runs
// rotate(180deg) -> rotate(0deg) about that same midpoint, so at the start of
// the swing the copy sits exactly on the original (looks like one shape) and
// then peels off to complete the parallelogram. One triangle/trapezoid is half.
function SandboxDouble({ kind, onBack }: { kind: "triangle" | "trapezoid"; onBack: () => void }) {
  const spec = kind === "triangle"
    ? { verts: [[3, 0], [0, 5], [8, 5]] as Pt[], pivot: [5.5, 2.5] as Pt, cols: 11, rows: 5, area: 40,
        stats: [{ k: "base", v: "8" }, { k: "height", v: "5" }] }
    : { verts: [[2, 0], [6, 0], [8, 4], [0, 4]] as Pt[], pivot: [7, 2] as Pt, cols: 14, rows: 4, area: 48,
        stats: [{ k: "b₁", v: "8" }, { k: "b₂", v: "4" }, { k: "height", v: "4" }] };
  const copyVerts: Pt[] = spec.verts.map((v) => [2 * spec.pivot[0] - v[0], 2 * spec.pivot[1] - v[1]]);

  const U = Math.max(28, Math.min(52, Math.floor(Math.min(460 / spec.cols, 300 / spec.rows))));
  const M = Math.round(1.4 * U);
  const W = 2 * M + spec.cols * U, H = 2 * M + spec.rows * U;
  const sx = (gx: number) => M + gx * U;
  const sy = (gy: number) => M + gy * U;
  const toStr = (vs: Pt[]) => vs.map((v) => `${sx(v[0])},${sy(v[1])}`).join(" ");

  const [step, setStep] = useState<"start" | "joining" | "done">("start");
  const reset = () => setStep("start");

  const areaLabel = kind === "triangle" ? "Parallelogram = base x height" : "Parallelogram = (b₁ + b₂) x h";
  const halfLabel = kind === "triangle" ? "triangle = half" : "trapezoid = half";

  return (
    <div className="ae-stage">
      <div className="ae-prompt">
        {step === "done"
          ? (kind === "triangle" ? "Two triangles make a parallelogram." : "Two trapezoids make a parallelogram.")
          : (kind === "triangle" ? "A triangle is half of a parallelogram." : "Two trapezoids build a parallelogram.")}
      </div>
      <div className="ae-sub">
        {step === "start" ? "Copy the shape and spin the copy around."
          : step === "joining" ? "The copy rotates into place." : "So one shape is exactly half of it."}
      </div>

      <div className="ae-tools">
        <button className="ae-tbtn" onClick={onBack}>Back</button>
        <button className="ae-tbtn" onClick={reset}>Reset</button>
      </div>

      <svg className="ae-svg" viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <pattern id={`ae-db-cell-${kind}`} width={U} height={U} patternUnits="userSpaceOnUse">
            <path d={`M ${U} 0 L 0 0 0 ${U}`} fill="none" stroke="var(--bdb-line)" strokeWidth={1} opacity={0.75} />
          </pattern>
        </defs>
        <rect x={M} y={M} width={spec.cols * U} height={spec.rows * U} fill={`url(#ae-db-cell-${kind})`} />

        <polygon points={toStr(spec.verts)} fill={`color-mix(in srgb, ${C_BASE} 28%, transparent)`} stroke="var(--bdb-ink)" strokeWidth={3} strokeLinejoin="miter" />

        {step !== "start" && (
          <polygon
            className={step === "joining" ? "ae-flip" : undefined}
            style={{ transformOrigin: `${sx(spec.pivot[0])}px ${sy(spec.pivot[1])}px` }}
            points={toStr(copyVerts)}
            fill={`color-mix(in srgb, ${C_HEIGHT} 45%, transparent)`} stroke="var(--bdb-ink)" strokeWidth={3} strokeLinejoin="miter"
          />
        )}
      </svg>

      <div className="ae-stats">
        {spec.stats.map((s) => (
          <div key={s.k} className="ae-stat"><span>{s.k}</span><b>{s.v}</b></div>
        ))}
        <div className="ae-stat hl"><span>{areaLabel}</span><b>{step === "start" ? "?" : spec.area}</b></div>
        <div className="ae-stat muted"><span>{halfLabel}</span><b>{step === "done" ? spec.area / 2 : "-"}</b></div>
      </div>

      <div className="ae-bar">
        {step === "start" && <button className="ae-btn" onClick={() => { setStep("joining"); window.setTimeout(() => setStep("done"), 880); }}>Double it</button>}
        {step === "done" && <button className="ae-btn ghost" onClick={reset}>Back to one shape</button>}
      </div>

      {step === "done" && (
        <p className="ae-why">
          {kind === "triangle"
            ? "The parallelogram is base x height = 40. Your triangle is exactly half of it, so A = ½ x base x height."
            : "The parallelogram's base is b₁ + b₂ and its height is h, so its area is (b₁ + b₂) x h = 48. One trapezoid is half, so A = ½ x (b₁ + b₂) x h."}
        </p>
      )}
    </div>
  );
}

// Guided rotate-to-lock: two congruent triangles. One is fixed; the student
// drags the second and spins it with the rotate handle until it is turned 180
// degrees and sits in the gap, where it snaps to complete the parallelogram.
// Dragging it back out unlocks it to try again.
function SandboxTriangleLock({ onBack }: { onBack: () => void }) {
  const TRI: Pt[] = [[3, 0], [0, 5], [8, 5]];
  const GHOST: Pt[] = [[8, 5], [11, 0], [3, 0]]; // where the copy lands (TRI rotated 180 about the right-edge midpoint)
  const C: Pt = [11 / 3, 10 / 3]; // centroid
  const cols = 16, rows = 6, area = 40;
  const U = Math.max(28, Math.min(52, Math.floor(Math.min(460 / cols, 300 / rows))));
  const M = Math.round(1.4 * U);
  const W = 2 * M + cols * U, H = 2 * M + rows * U;
  const sx = (gx: number) => M + gx * U;
  const sy = (gy: number) => M + gy * U;
  const toStr = (vs: Pt[]) => vs.map((v) => `${sx(v[0])},${sy(v[1])}`).join(" ");

  const targetTx = (2 * (5.5 - C[0])) * U; // translation (px) that lands the copy in the gap when rotated 180
  const targetTy = (2 * (2.5 - C[1])) * U;
  const startTx = 8 * U, startTy = 0.6 * U;

  const [bT, setBT] = useState({ x: startTx, y: startTy });
  const [bRot, setBRot] = useState(0);
  const [locked, setLocked] = useState(false);
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const modeRef = useRef<null | "move" | "rotate">(null);
  const startRef = useRef({ px: 0, py: 0, tx: 0, ty: 0 });

  const reset = () => { setBT({ x: startTx, y: startTy }); setBRot(0); setLocked(false); };
  const scaleOf = () => { const r = svgRef.current?.getBoundingClientRect(); return r ? r.width / W : 1; };

  const onBodyDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    modeRef.current = "move"; setDragging(true); setLocked(false);
    startRef.current = { px: e.clientX, py: e.clientY, tx: bT.x, ty: bT.y };
    svgRef.current?.setPointerCapture?.(e.pointerId);
  };
  const onHandleDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    modeRef.current = "rotate"; setDragging(true); setLocked(false);
    svgRef.current?.setPointerCapture?.(e.pointerId);
  };
  const onSvgMove = (e: React.PointerEvent) => {
    if (modeRef.current === "move") {
      const s = scaleOf();
      setBT({ x: startRef.current.tx + (e.clientX - startRef.current.px) / s, y: startRef.current.ty + (e.clientY - startRef.current.py) / s });
    } else if (modeRef.current === "rotate") {
      const r = svgRef.current?.getBoundingClientRect(); if (!r) return;
      const s = r.width / W;
      const cx = r.left + (sx(C[0]) + bT.x) * s, cy = r.top + (sy(C[1]) + bT.y) * s;
      const deg = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
      setBRot(Math.round(deg / 15) * 15); // snap to 15-degree steps so it is controllable
    }
  };
  const onSvgUp = () => {
    if (modeRef.current) {
      const rotN = ((bRot % 360) + 360) % 360;
      const dist = Math.hypot(bT.x - targetTx, bT.y - targetTy);
      if (Math.abs(rotN - 180) <= 22 && dist < 1.4 * U) { setBRot(180); setBT({ x: targetTx, y: targetTy }); setLocked(true); } // generous: snaps to the exact spot
    }
    modeRef.current = null; setDragging(false);
  };

  return (
    <div className="ae-stage">
      <div className="ae-prompt">{locked ? "Two triangles make a parallelogram." : "Turn the second triangle to complete the shape."}</div>
      <div className="ae-sub">
        {locked ? "So one triangle is exactly half of it." : "Drag the amber triangle, and use the round handle to spin it, until it locks into the gap."}
      </div>

      <div className="ae-tools">
        <button className="ae-tbtn" onClick={onBack}>Back</button>
        <button className="ae-tbtn" onClick={reset}>Reset</button>
      </div>

      <svg ref={svgRef} className="ae-svg" viewBox={`0 0 ${W} ${H}`} onPointerMove={onSvgMove} onPointerUp={onSvgUp} onPointerCancel={onSvgUp}>
        <defs>
          <pattern id="ae-lk-cell" width={U} height={U} patternUnits="userSpaceOnUse">
            <path d={`M ${U} 0 L 0 0 0 ${U}`} fill="none" stroke="var(--bdb-line)" strokeWidth={1} opacity={0.75} />
          </pattern>
        </defs>
        <rect x={M} y={M} width={cols * U} height={rows * U} fill="url(#ae-lk-cell)" />

        {/* target hint (where the copy should land) */}
        {!locked && <polygon points={toStr(GHOST)} fill="none" stroke="var(--bdb-ink-faint)" strokeWidth={2} strokeDasharray="6 5" />}

        {/* fixed triangle */}
        <polygon points={toStr(TRI)} fill={`color-mix(in srgb, ${C_BASE} 30%, transparent)`} stroke="var(--bdb-ink)" strokeWidth={3} strokeLinejoin="miter" />

        {/* movable triangle */}
        <g transform={`translate(${bT.x} ${bT.y}) rotate(${bRot} ${sx(C[0])} ${sy(C[1])})`}
          style={{ transition: dragging ? "none" : "transform .25s var(--ae-carry)" }}>
          <polygon points={toStr(TRI)} onPointerDown={onBodyDown}
            fill={`color-mix(in srgb, ${C_HEIGHT} ${locked ? 55 : 45}%, transparent)`} stroke="var(--bdb-ink)" strokeWidth={3} strokeLinejoin="miter" style={{ cursor: dragging ? "grabbing" : "grab", touchAction: "none" }} />
          {!locked && (
            <g onPointerDown={onHandleDown} style={{ cursor: "grab", touchAction: "none" }}>
              <line x1={sx(C[0])} y1={sy(C[1])} x2={sx(C[0])} y2={sy(C[1] - 1.4)} stroke={C_HEIGHT} strokeWidth={2.5} />
              <circle cx={sx(C[0])} cy={sy(C[1] - 1.4)} r={11} fill="#fff" stroke={C_HEIGHT} strokeWidth={3} />
            </g>
          )}
        </g>
      </svg>

      <div className="ae-stats">
        <div className="ae-stat"><span>base</span><b>8</b></div>
        <div className="ae-stat"><span>height</span><b>5</b></div>
        <div className="ae-stat hl"><span>Parallelogram = base x height</span><b>{locked ? area : "?"}</b></div>
        <div className="ae-stat muted"><span>triangle = half</span><b>{locked ? area / 2 : "-"}</b></div>
      </div>

      {locked && (
        <div className="ae-bar"><button className="ae-btn ghost" onClick={reset}>Pull it back out</button></div>
      )}
      {locked && <p className="ae-why">The parallelogram is base x height = 40. Your triangle is exactly half of it, so A = ½ x base x height.</p>}
    </div>
  );
}

// ── Composite mode: decompose an irregular figure into rectangles ────────────
// Guided level (step 1 of the gradual release): the figure arrives already cut
// into colored rectangles on the unit grid. The student finds each rectangle's
// area and adds them — area is additive. "Count the squares" self-checks the
// total against the structured unit grid. (Drag-your-own-cut and blank-figure
// levels land next.)
interface CompRect { x: number; y: number; w: number; h: number }
interface CompFig { name: string; verts: Pt[]; rects: CompRect[]; cuts: [Pt, Pt][] }

const COMP_FIGS: CompFig[] = [
  {
    name: "L",
    verts: [[0, 0], [5, 0], [5, 2], [2, 2], [2, 4], [0, 4]],
    rects: [{ x: 0, y: 0, w: 5, h: 2 }, { x: 0, y: 2, w: 2, h: 2 }],
    cuts: [[[0, 2], [2, 2]]],
  },
  {
    name: "T",
    verts: [[0, 0], [6, 0], [6, 2], [4, 2], [4, 5], [2, 5], [2, 2], [0, 2]],
    rects: [{ x: 0, y: 0, w: 6, h: 2 }, { x: 2, y: 2, w: 2, h: 3 }],
    cuts: [[[2, 2], [4, 2]]],
  },
  {
    name: "staircase",
    verts: [[0, 0], [6, 0], [6, 2], [4, 2], [4, 4], [2, 4], [2, 6], [0, 6]],
    rects: [{ x: 0, y: 0, w: 2, h: 6 }, { x: 2, y: 0, w: 2, h: 4 }, { x: 4, y: 0, w: 2, h: 2 }],
    cuts: [[[2, 0], [2, 4]], [[4, 0], [4, 2]]],
  },
];
const COMP_COLORS = [C_BASE, C_HEIGHT, C_B2];
const COMP_COLOR_NAMES = ["teal", "amber", "coral"];

function AreaComposite() {
  const [idx, setIdx] = useState(0);
  const fig = COMP_FIGS[idx];
  const cols = Math.max(...fig.verts.map((v) => v[0]));
  const rows = Math.max(...fig.verts.map((v) => v[1]));
  const pieceAreas = fig.rects.map((r) => r.w * r.h);
  const totalArea = pieceAreas.reduce((a, b) => a + b, 0);

  const [entries, setEntries] = useState<string[]>(fig.rects.map(() => ""));
  const [totalIn, setTotalIn] = useState("");
  const [done, setDone] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showCount, setShowCount] = useState(false);
  const wrongRef = useRef(0);
  const solvedRef = useRef(false);

  useEffect(() => {
    setEntries(COMP_FIGS[idx].rects.map(() => ""));
    setTotalIn(""); setDone(false); setNote(null); setShowCount(false);
    wrongRef.current = 0; solvedRef.current = false;
  }, [idx]);

  const U = Math.max(30, Math.min(50, Math.floor(Math.min(420 / cols, 300 / rows))));
  const M = Math.round(1.2 * U);
  const W = 2 * M + cols * U, H = 2 * M + rows * U;
  const sx = (gx: number) => M + gx * U;
  const sy = (gy: number) => M + gy * U;
  const pts = fig.verts.map((v) => `${sx(v[0])},${sy(v[1])}`).join(" ");

  const cells = useMemo(() => {
    if (!showCount) return [] as Pt[];
    const out: Pt[] = [];
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
      if (inPoly(gx + 0.5, gy + 0.5, fig.verts)) out.push([gx, gy]);
    }
    return out;
  }, [showCount, fig, cols, rows]);

  function check() {
    const bad = fig.rects.findIndex((r, i) => Number(entries[i]) !== r.w * r.h);
    if (bad !== -1) {
      setNote(`Check the ${COMP_COLOR_NAMES[bad]} rectangle: ${fig.rects[bad].w} × ${fig.rects[bad].h}.`);
      wrongRef.current += 1;
      return;
    }
    if (Number(totalIn) !== totalArea) {
      setNote(`Add the pieces: ${pieceAreas.join(" + ")} = ?`);
      wrongRef.current += 1;
      return;
    }
    setNote(null); setDone(true);
    if (!solvedRef.current) {
      solvedRef.current = true;
      reportToolResult({ tool: "area-explorer", correct: wrongRef.current === 0, standardId: "6.G.A.1", misconception: null, problemId: `composite-${fig.name}` });
    }
  }

  return (
    <div className="ae-stage">
      <div className="ae-prompt">{done ? `Area = ${totalArea} square units` : "Break the figure into rectangles"}</div>
      <div className="ae-sub">{done ? "Same total area, however you slice it." : "Find each rectangle's area, then add them together."}</div>

      <div className="ae-tools">
        <button className="ae-tbtn" onClick={() => { setEntries(fig.rects.map(() => "")); setTotalIn(""); setDone(false); setNote(null); wrongRef.current = 0; solvedRef.current = false; }}>Reset</button>
        <button className="ae-tbtn" onClick={() => setIdx((i) => (i + 1) % COMP_FIGS.length)}>Next figure</button>
      </div>

      <svg className="ae-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`composite ${fig.name} figure on a grid`}>
        <defs>
          <pattern id="ae-comp-cell" width={U} height={U} patternUnits="userSpaceOnUse">
            <path d={`M ${U} 0 L 0 0 0 ${U}`} fill="none" stroke="var(--bdb-line)" strokeWidth={1} opacity={0.8} />
          </pattern>
        </defs>
        <rect x={M} y={M} width={cols * U} height={rows * U} fill="url(#ae-comp-cell)" />

        {/* decomposed pieces */}
        {fig.rects.map((r, i) => {
          const filled = done || Number(entries[i]) === r.w * r.h;
          return (
            <g key={i}>
              <rect x={sx(r.x)} y={sy(r.y)} width={r.w * U} height={r.h * U}
                fill={`color-mix(in srgb, ${COMP_COLORS[i]} ${filled ? 40 : 20}%, transparent)`} />
              <text x={sx(r.x + r.w / 2)} y={sy(r.y + r.h / 2)} textAnchor="middle" dominantBaseline="central"
                fontSize={Math.max(13, U * 0.4)} fontWeight={900} fill={COMP_COLORS[i]}>{r.w} × {r.h}</text>
            </g>
          );
        })}

        {/* count-the-squares self-check */}
        {showCount && cells.map(([gx, gy]) => (
          <rect key={`c-${gx}-${gy}`} x={sx(gx)} y={sy(gy)} width={U} height={U} fill={C_BASE} opacity={0.22} />
        ))}

        {/* decomposition cut lines + outer outline */}
        {fig.cuts.map((c, i) => (
          <line key={i} x1={sx(c[0][0])} y1={sy(c[0][1])} x2={sx(c[1][0])} y2={sy(c[1][1])}
            stroke="var(--bdb-ink)" strokeWidth={2} strokeDasharray="6 5" />
        ))}
        <polygon points={pts} fill="none" stroke="var(--bdb-ink)" strokeWidth={3} strokeLinejoin="miter" />
      </svg>

      {done ? (
        <>
          <div className="ae-formula"><span>{pieceAreas.join(" + ")} = {totalArea}</span></div>
          <div className="ae-bar"><button className="ae-btn" onClick={() => setIdx((i) => (i + 1) % COMP_FIGS.length)}>Next figure</button></div>
        </>
      ) : (
        <>
          <div className="ae-formula">
            {fig.rects.map((r, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                {i > 0 && <span>+</span>}
                <span style={{ display: "inline-grid", placeItems: "center", minWidth: 44, minHeight: 40, padding: "0 8px", border: `3px solid ${COMP_COLORS[i]}`, color: COMP_COLORS[i], fontSize: "1rem", background: "#fff" }}>{r.w}×{r.h}</span>
                <input className="ae-answer" style={{ width: 66 }} value={entries[i]} inputMode="numeric"
                  onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); setEntries((es) => es.map((x, j) => (j === i ? v : x))); setNote(null); }}
                  aria-label={`${COMP_COLOR_NAMES[i]} rectangle area`} />
              </span>
            ))}
            <span>=</span>
            <input className="ae-answer" style={{ width: 90 }} value={totalIn} inputMode="numeric"
              onChange={(e) => { setTotalIn(e.target.value.replace(/\D/g, "")); setNote(null); }}
              onKeyDown={(e) => e.key === "Enter" && check()} aria-label="total area" />
          </div>
          <div className="ae-bar">
            <button className="ae-link" onClick={() => setShowCount((c) => !c)}>{showCount ? "Hide the squares" : "Count the squares"}</button>
            <button className="ae-btn" onClick={check}>Check</button>
          </div>
        </>
      )}

      <div className="ae-note">{note && <span key={note} className="ae-note-in">{note}</span>}</div>
    </div>
  );
}
