"use client";

// Area Explorer — M1.T2 (6.G.A.1). Solve mode: pick a shape from the bank, get
// a labeled figure on a unit grid, tap the measurements into the formula
// (a slant/diagonal decoy chip makes "use the slant, not the height" a real
// wrong choice), compute the area, then name the unit WITH its exponent. One
// SVG draws the grid + shape + dimension marks in a single coordinate space so
// nothing drifts. Squared corners + unit grid on purpose. Sandbox + Composite
// modes land next.

import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reportToolResult } from "@/lib/toolEvidence";
import { LiveToolBanner, useLiveToolConfig } from "./useLiveToolConfig";

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
  decoy?: DecoyMark; // slant trap on para/triangle/trapezoid; rectangles get none
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
    const slots: Slot[] = type === "square"
      ? [slot("s1", b, C_BASE, "s", "base"), slot("s2", b, C_HEIGHT, "s", "height")]
      : [slot("b", b, C_BASE, "b", "base"), slot("h", h, C_HEIGHT, "h", "height")];
    const formula: Token[] = [{ t: "text", v: "A =" }, { t: "slot", slot: slots[0] }, { t: "text", v: "×" }, { t: "slot", slot: slots[1] }];
    const chips = shuffle(Array.from(new Set([b, h])));
    // No diagonal decoy here — rectangles don't need it, and it only confuses.
    return {
      type, unit, cols: b, rows: h,
      verts: [[0, 0], [b, 0], [b, h], [0, h]],
      base: { a: [0, h], b: [b, h], value: b, label: type === "square" ? "s" : "b" },
      height: { a: [0, 0], b: [0, h], foot: [0, h], value: h, label: type === "square" ? "s" : "h" },
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
const COUNT_INTRO_KEY = "bdm-area-count-intro-v1"; // first visit: count the squares before anything else
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
  const liveTool = useLiveToolConfig("/area-explorer");
  const [mode, setMode] = useState<"solve" | "practice" | "sandbox" | "composite" | "volume">("solve");
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
  // First visit ever: the count animation runs before the student can answer.
  const [introCount, setIntroCount] = useState(false);
  const [introReady, setIntroReady] = useState(false);
  // A wrong side length re-counts that side's boxes on the figure.
  const [sideCount, setSideCount] = useState<MarkKind | null>(null);
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
    setSideCount(null);
    solvedRef.current = false;
    setPhase("substitute");
  }, []);

  // The very first shape a student ever opens starts with the counting
  // animation — they count the squares before they can do anything else.
  useEffect(() => {
    if (!shape) return;
    let seen = true;
    try { seen = window.localStorage.getItem(COUNT_INTRO_KEY) === "yes"; } catch { seen = true; }
    if (!seen) { setIntroCount(true); setIntroReady(false); setShowCount(true); }
  }, [shape]);

  useEffect(() => {
    if (!introCount) return;
    const t = window.setTimeout(() => setIntroReady(true), 2600); // let the numbered fill finish
    return () => window.clearTimeout(t);
  }, [introCount]);

  const finishIntroCount = useCallback(() => {
    try { window.localStorage.setItem(COUNT_INTRO_KEY, "yes"); } catch { /* fine */ }
    setIntroCount(false); setShowCount(false);
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
    if (shape.decoy && value === shape.decoy.value) {
      setNote(shape.decoy.name === "diagonal"
        ? "That's the diagonal, not a side you multiply. Use the base and the height."
        : "That's the slant side, not the height. The height has the right-angle mark — use the dashed length.");
      flagWrong("slant-for-height");
      setSlotEntry("");
      return;
    }
    if (value !== activeSlot.value) {
      setNote(activeSlot.mark === "height"
        ? "Not quite — count the highlighted squares along the height."
        : shape.type === "square"
        ? "A square's sides are equal — both blanks are the same number."
        : "Not quite — count the highlighted squares along that side.");
      flagWrong("swapped-dims");
      setSideCount(activeSlot.mark); // re-count that side's boxes on the figure
      setSlotEntry("");
      return;
    }
    setNote(null);
    setSideCount(null);
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
        .ae-tbtn-on { background:var(--bdb-ink); color:#fff; border-color:var(--bdb-ink); }
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
        .ae-vterm { animation:aeCountIn .3s var(--ae-carry) backwards; }
        .ae-compare { display:flex; flex-wrap:wrap; gap:14px; justify-content:center; align-items:stretch; margin-top:6px; }
        .ae-compcard { display:grid; justify-items:center; gap:8px; padding:14px 16px; border:2px solid var(--bdb-line); background:var(--bdb-card); }
        .ae-compname { font-size:0.78rem; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; color:var(--bdb-ink-soft); }
        .ae-compsum { font-weight:900; font-size:1.15rem; }
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

      <LiveToolBanner tool={liveTool} />

      <div className="ae-modebar">
        <div className="ae-modeseg">
          <button className={mode === "solve" ? "on" : ""} onClick={() => setMode("solve")}>Solve</button>
          <button className={mode === "practice" ? "on" : ""} onClick={() => setMode("practice")}>Practice</button>
          <button className={mode === "composite" ? "on" : ""} onClick={() => setMode("composite")}>Composite</button>
          <button className={mode === "volume" ? "on" : ""} onClick={() => setMode("volume")}>Volume</button>
          <button className={mode === "sandbox" ? "on" : ""} onClick={() => setMode("sandbox")}>Sandbox</button>
        </div>
      </div>

      {mode === "sandbox" && <AreaSandbox />}
      {mode === "composite" && <AreaComposite />}
      {mode === "volume" && <VolumeBuilder />}

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
            <ShapeSvg shape={shape} phase={phase} activeMark={activeMark} showCount={showCount} whySquared={whySquared} sideCount={sideCount} />

            {phase === "substitute" && introCount && (
              <div className="ae-bar" style={{ flexDirection: "column", gap: 10 }}>
                <p className="ae-why">First: count along as the squares fill the shape. Area is the number of unit squares that cover it.</p>
                <button className="ae-btn" disabled={!introReady} onClick={finishIntroCount}>I counted them</button>
              </div>
            )}

            {phase === "substitute" && !introCount && (
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
function ShapeSvg({ shape, phase, activeMark, showCount, whySquared, sideCount }: { shape: Shape; phase: Phase; activeMark: MarkKind | null; showCount: boolean; whySquared: boolean; sideCount?: MarkKind | null }) {
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

  const dm = shape.decoy ? mid(shape.decoy.a, shape.decoy.b) : null;
  const b2m = shape.base2 ? mid(shape.base2.a, shape.base2.b) : null;
  const foot = shape.height.foot;
  const raSign = shape.height.a[0] <= shape.base.b[0] ? 1 : -1; // right-angle mark direction along base
  const baseMidX = (shape.base.a[0] + shape.base.b[0]) / 2;
  const gridTop = sy(0), gridBot = sy(shape.rows);
  const pulse = (mark: MarkKind) => (activeMark === mark ? "ae-mark-pulse" : undefined);

  return (
    <svg className="ae-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${shape.type} on a grid`}>
      <defs>
        {/* x/y anchor the tiling to the shape's corner so grid squares line up
            exactly with the unit boundaries (otherwise the pattern tiles from
            the svg origin and the grid lands mid-square) */}
        <pattern id={`ae-cell-${shape.type}`} x={ML} y={MT} width={U} height={U} patternUnits="userSpaceOnUse">
          <path d={`M ${U} 0 L 0 0 0 ${U}`} fill="none" stroke="var(--bdb-line)" strokeWidth={1} opacity={0.85} />
        </pattern>
      </defs>
      <rect x={ML} y={MT} width={shape.cols * U} height={shape.rows * U} fill={`url(#ae-cell-${shape.type})`} />

      {/* shape */}
      <polygon points={pts} fill={region} stroke="var(--bdb-ink)" strokeWidth={3} strokeLinejoin="miter" />

      {/* decoy edge (faint) */}
      {shape.decoy && (
        <line x1={sx(shape.decoy.a[0])} y1={sy(shape.decoy.a[1])} x2={sx(shape.decoy.b[0])} y2={sy(shape.decoy.b[1])} stroke="var(--bdb-ink-faint)" strokeWidth={2} strokeDasharray="2 4" />
      )}

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

      {/* wrong side length: re-count that side's boxes, one at a time */}
      {(() => {
        if (!sideCount) return null;
        let cells: Pt[] = [];
        let color = C_BASE;
        if (sideCount === "base") {
          const x0 = Math.min(shape.base.a[0], shape.base.b[0]);
          cells = Array.from({ length: shape.base.value }, (_, i) => [x0 + i, shape.rows - 1] as Pt);
          color = C_BASE;
        } else if (sideCount === "b2" && shape.base2) {
          const x0 = Math.min(shape.base2.a[0], shape.base2.b[0]);
          cells = Array.from({ length: shape.base2.value }, (_, i) => [x0 + i, 0] as Pt);
          color = C_B2;
        } else if (sideCount === "height") {
          const gx = Math.min(shape.height.foot[0], shape.cols - 1);
          cells = Array.from({ length: shape.height.value }, (_, i) => [gx, i] as Pt);
          color = C_HEIGHT;
        }
        return cells.map(([gx, gy], i) => (
          <g key={`sc-${gx}-${gy}`} className="ae-count-cell" style={{ animationDelay: `${i * 150}ms` }}>
            <rect x={sx(gx)} y={sy(gy)} width={U} height={U} fill={color} opacity={0.3} stroke={color} strokeWidth={2} />
            <text x={sx(gx) + U / 2} y={sy(gy) + U / 2} textAnchor="middle" dominantBaseline="central" fontSize={numSize} fontWeight={900} fill="var(--bdb-ink)">{i + 1}</text>
          </g>
        ));
      })()}

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
      {shape.decoy && dm && dimLabel(sx(dm[0]) + DECOY_OFF[shape.type][0], sy(dm[1]) + DECOY_OFF[shape.type][1], `${shape.decoy.name} ${shape.decoy.value}`, "var(--bdb-ink-faint)")}
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
          <pattern id="ae-sb-cell" x={M} y={M} width={U} height={U} patternUnits="userSpaceOnUse">
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
          <pattern id={`ae-db-cell-${kind}`} x={M} y={M} width={U} height={U} patternUnits="userSpaceOnUse">
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
          <pattern id="ae-lk-cell" x={M} y={M} width={U} height={U} patternUnits="userSpaceOnUse">
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

// ── Composite mode: divide it yourself, deduce every side ───────────────────
// Gradual release per level, same process each time: (1) the figure arrives
// whole, with only a few sides labeled — the student DRAWS the cut(s); a cut
// that doesn't split it into simple shapes gets "try again" plus a hint.
// (2) A valid division colors the pieces, then every unlabeled side is deduced
// one step at a time: count it on the grid, match the opposite side (the given
// side flashes), or watch two offset parallel walls slide onto the straight
// wall they add up to. (3) With every side marked, find each piece's area and
// the total. Three levels: two rectangles, three-piece figure with multiple
// valid divisions, then a figure with a triangle in it.
interface CompEdge { id: string; a: Pt; b: Pt; value: number; given: boolean; off: [number, number]; interior?: boolean }
interface CompCut { a: Pt; b: Pt }
interface CompPiece { kind: "rect" | "tri"; x: number; y: number; w: number; h: number }
type CompStep =
  | { type: "count"; edge: string; prompt: string; strip: Pt[] }
  | { type: "opposite"; from: string; edge: string; prompt: string }
  | { type: "partial"; whole: string; parts: string[]; edge: string; prompt: string };
interface CompLevel {
  label: string;
  name: string;
  verts: Pt[];
  edges: CompEdge[];
  cutSets: CompCut[][];
  piecesBySet: CompPiece[][];
  steps: CompStep[];
  hint: string;
  // Whole-minus-cutout: after the additive solve, the student closes the
  // bounding rectangle across the notch and subtracts the cutout, then sees
  // both methods side by side.
  subtractive?: {
    frame: CompCut;              // the segment that closes the whole
    whole: { w: number; h: number };
    cutRect: { x: number; y: number; w: number; h: number };
    hint: string;
  };
}

const COMP_LEVELS: CompLevel[] = [
  {
    label: "Level 1",
    name: "L-shape",
    verts: [[0, 0], [3, 0], [3, 2], [7, 2], [7, 5], [0, 5]],
    edges: [
      { id: "A", a: [0, 0], b: [3, 0], value: 3, given: true, off: [0, -18] },
      { id: "B", a: [3, 0], b: [3, 2], value: 2, given: false, off: [24, 0] },
      { id: "C", a: [3, 2], b: [7, 2], value: 4, given: false, off: [0, -18] },
      { id: "D", a: [7, 2], b: [7, 5], value: 3, given: false, off: [26, 0] },
      { id: "E", a: [0, 5], b: [7, 5], value: 7, given: true, off: [0, 24] },
      { id: "F", a: [0, 0], b: [0, 5], value: 5, given: true, off: [-26, 0] },
    ],
    cutSets: [
      [{ a: [3, 2], b: [3, 5] }],
      [{ a: [0, 2], b: [3, 2] }],
    ],
    piecesBySet: [
      [{ kind: "rect", x: 0, y: 0, w: 3, h: 5 }, { kind: "rect", x: 3, y: 2, w: 4, h: 3 }],
      [{ kind: "rect", x: 0, y: 0, w: 3, h: 2 }, { kind: "rect", x: 0, y: 2, w: 7, h: 3 }],
    ],
    steps: [
      { type: "count", edge: "B", prompt: "This wall has no label. Count the highlighted squares along it, then type its length.", strip: [[2, 0], [2, 1]] },
      { type: "partial", whole: "F", parts: ["B", "D"], edge: "D", prompt: "The two right-side walls together line up with the left wall. Watch them slide over — then type the missing length." },
      { type: "partial", whole: "E", parts: ["A", "C"], edge: "C", prompt: "The two top edges together match the bottom. Watch them slide down — then type the missing length." },
    ],
    hint: "Cut straight across from the inside corner — one straight line from edge to edge.",
  },
  {
    label: "Level 2",
    name: "T-shape",
    verts: [[2, 0], [5, 0], [5, 3], [7, 3], [7, 6], [0, 6], [0, 3], [2, 3]],
    edges: [
      { id: "A", a: [2, 0], b: [5, 0], value: 3, given: true, off: [0, -18] },
      { id: "B", a: [5, 0], b: [5, 3], value: 3, given: false, off: [26, 0] },
      { id: "C", a: [5, 3], b: [7, 3], value: 2, given: false, off: [0, -18] },
      { id: "D", a: [7, 3], b: [7, 6], value: 3, given: true, off: [26, 0] },
      { id: "E", a: [0, 6], b: [7, 6], value: 7, given: true, off: [0, 24] },
      { id: "F", a: [0, 3], b: [0, 6], value: 3, given: false, off: [-26, 0] },
      { id: "G", a: [0, 3], b: [2, 3], value: 2, given: false, off: [0, -18] },
      { id: "H", a: [2, 0], b: [2, 3], value: 3, given: false, off: [-26, 0] },
    ],
    cutSets: [
      [{ a: [2, 3], b: [5, 3] }],
      [{ a: [2, 3], b: [2, 6] }, { a: [5, 3], b: [5, 6] }],
    ],
    piecesBySet: [
      [{ kind: "rect", x: 2, y: 0, w: 3, h: 3 }, { kind: "rect", x: 0, y: 3, w: 7, h: 3 }],
      [{ kind: "rect", x: 0, y: 3, w: 2, h: 3 }, { kind: "rect", x: 2, y: 0, w: 3, h: 6 }, { kind: "rect", x: 5, y: 3, w: 2, h: 3 }],
    ],
    steps: [
      { type: "opposite", from: "D", edge: "F", prompt: "The right wall of the bar is 3. The bar's left wall must be the same — type its length." },
      { type: "count", edge: "H", prompt: "Count the highlighted squares along the stem's wall, then type its height.", strip: [[2, 0], [2, 1], [2, 2]] },
      { type: "opposite", from: "H", edge: "B", prompt: "The stem's left wall is 3 — its right wall must match. Type it." },
      { type: "count", edge: "G", prompt: "Count the highlighted squares along this shelf, then type its length.", strip: [[0, 3], [1, 3]] },
      { type: "partial", whole: "E", parts: ["G", "A", "C"], edge: "C", prompt: "The three top edges of the bar line up with the bottom. Watch them slide down — then type the missing length." },
    ],
    hint: "Split the bar from the stem with one straight cut, or cut straight down on both sides of the stem.",
  },
  {
    label: "Level 3",
    name: "house",
    verts: [[0, 2], [3, 0], [6, 2], [6, 5], [0, 5]],
    edges: [
      { id: "D", a: [6, 2], b: [6, 5], value: 3, given: true, off: [26, 0] },
      { id: "E", a: [0, 5], b: [6, 5], value: 6, given: true, off: [0, 24] },
      { id: "F", a: [0, 2], b: [0, 5], value: 3, given: false, off: [-26, 0] },
      { id: "ROOF", a: [0, 2], b: [6, 2], value: 6, given: false, off: [0, 22], interior: true },
      { id: "RH", a: [3, 0], b: [3, 2], value: 2, given: false, off: [24, 0], interior: true },
    ],
    cutSets: [
      [{ a: [0, 2], b: [6, 2] }],
    ],
    piecesBySet: [
      [{ kind: "tri", x: 0, y: 0, w: 6, h: 2 }, { kind: "rect", x: 0, y: 2, w: 6, h: 3 }],
    ],
    steps: [
      { type: "opposite", from: "D", edge: "F", prompt: "The right wall is 3 — the left wall must match. Type its length." },
      { type: "opposite", from: "E", edge: "ROOF", prompt: "The bottom is 6, and the roof's base sits directly above it — same width. Type its length." },
      { type: "count", edge: "RH", prompt: "The dashed line is the roof's height — straight up from its base to the peak. Count the highlighted squares and type it.", strip: [[2, 0], [2, 1]] },
    ],
    hint: "Slice the roof off — one straight cut across where the roof meets the walls.",
  },
  {
    label: "Level 4",
    name: "notch",
    verts: [[0, 0], [2, 0], [2, 2], [5, 2], [5, 0], [8, 0], [8, 5], [0, 5]],
    edges: [
      { id: "A", a: [0, 0], b: [2, 0], value: 2, given: true, off: [0, -18] },
      { id: "NL", a: [2, 0], b: [2, 2], value: 2, given: true, off: [-24, 0] },
      { id: "NB", a: [2, 2], b: [5, 2], value: 3, given: false, off: [0, 22] },
      { id: "NR", a: [5, 0], b: [5, 2], value: 2, given: false, off: [26, 0] },
      { id: "B", a: [5, 0], b: [8, 0], value: 3, given: false, off: [0, -18] },
      { id: "D", a: [8, 0], b: [8, 5], value: 5, given: false, off: [26, 0] },
      { id: "E", a: [0, 5], b: [8, 5], value: 8, given: true, off: [0, 24] },
      { id: "F", a: [0, 0], b: [0, 5], value: 5, given: true, off: [-26, 0] },
    ],
    cutSets: [
      [{ a: [2, 2], b: [2, 5] }, { a: [5, 2], b: [5, 5] }],
    ],
    piecesBySet: [
      [{ kind: "rect", x: 0, y: 0, w: 2, h: 5 }, { kind: "rect", x: 2, y: 2, w: 3, h: 3 }, { kind: "rect", x: 5, y: 0, w: 3, h: 5 }],
    ],
    steps: [
      { type: "opposite", from: "F", edge: "D", prompt: "The left wall is 5 — the right wall must match. Type its length." },
      { type: "opposite", from: "NL", edge: "NR", prompt: "The notch's left wall is 2 — its right wall must match. Type it." },
      { type: "count", edge: "B", prompt: "Count the highlighted squares along this top edge, then type its length.", strip: [[5, 0], [6, 0], [7, 0]] },
      { type: "partial", whole: "E", parts: ["A", "NB", "B"], edge: "NB", prompt: "The two top edges and the notch floor together match the bottom. Watch them slide down — then type the missing length." },
    ],
    hint: "Cut straight down each side of the notch — two cuts, three pieces.",
    subtractive: {
      frame: { a: [2, 0], b: [5, 0] },
      whole: { w: 8, h: 5 },
      cutRect: { x: 2, y: 0, w: 3, h: 2 },
      hint: "Close the whole rectangle — line up the line straight across the opening of the notch, then click.",
    },
  },
];

const COMP_COLORS = [C_BASE, C_HEIGHT, C_B2];

function AreaComposite() {
  const [level, setLevel] = useState(0);
  const fig = COMP_LEVELS[level];
  const cols = Math.max(...fig.verts.map((v) => v[0]));
  const rows = Math.max(...fig.verts.map((v) => v[1]));

  const [phase, setPhase] = useState<"cut" | "deduce" | "areas" | "frame" | "subareas" | "compare" | "done">("cut");
  const [acceptedCuts, setAcceptedCuts] = useState<CompCut[]>([]);
  const [matchedSet, setMatchedSet] = useState<number | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [solvedEdges, setSolvedEdges] = useState<Record<string, boolean>>({});
  const [stepEntry, setStepEntry] = useState("");
  const [pieceEntries, setPieceEntries] = useState<string[]>([]);
  const [totalEntry, setTotalEntry] = useState("");
  const [subWhole, setSubWhole] = useState("");
  const [subCut, setSubCut] = useState("");
  const [subTotal, setSubTotal] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [animOn, setAnimOn] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const [hoverCut, setHoverCut] = useState<{ horizontal: boolean; line: number } | null>(null);
  const wrongRef = useRef(0);
  const solvedRef = useRef(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const U = Math.max(34, Math.min(56, Math.floor(Math.min(440 / cols, 300 / rows))));
  const M = Math.round(1.3 * U);
  const W = 2 * M + cols * U + 44; // extra right margin for outside labels
  const H = 2 * M + rows * U;
  const sx = (gx: number) => M + gx * U;
  const sy = (gy: number) => M + gy * U;
  const pts = fig.verts.map((v) => `${sx(v[0])},${sy(v[1])}`).join(" ");

  const reset = useCallback((lv: number) => {
    setLevel(lv);
    setPhase("cut"); setAcceptedCuts([]); setMatchedSet(null); setStepIdx(0);
    setSolvedEdges({}); setStepEntry(""); setPieceEntries([]); setTotalEntry("");
    setSubWhole(""); setSubCut(""); setSubTotal("");
    setNote(null); setAnimOn(false); setAnimKey(0); setHoverCut(null);
    wrongRef.current = 0; solvedRef.current = false;
  }, []);

  const edgeById = useCallback((id: string) => fig.edges.find((e) => e.id === id)!, [fig]);
  const step = phase === "deduce" ? fig.steps[stepIdx] : null;
  const pieces = matchedSet != null ? fig.piecesBySet[matchedSet] : [];

  // Kick the partial-walls slide a beat after the step (or a replay) starts.
  useEffect(() => {
    if (!step || step.type !== "partial") { setAnimOn(false); return; }
    setAnimOn(false);
    const t = window.setTimeout(() => setAnimOn(true), 500);
    return () => window.clearTimeout(t);
  }, [step, animKey]);

  // ── Cut placement: the line follows the cursor; a click solidifies it ──────
  const hoverFromEvent = (e: React.PointerEvent): { horizontal: boolean; line: number } | null => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return null;
    const gx = ((e.clientX - r.left) * (W / r.width) - M) / U;
    const gy = ((e.clientY - r.top) * (H / r.height) - M) / U;
    if (gx < -0.6 || gx > cols + 0.6 || gy < -0.6 || gy > rows + 0.6) return null;
    const dxToV = Math.abs(gx - Math.round(gx));
    const dyToH = Math.abs(gy - Math.round(gy));
    const horizontal = dyToH <= dxToV;
    if (phase === "cut") {
      // interior gridlines only
      const line = horizontal ? clamp(Math.round(gy), 1, rows - 1) : clamp(Math.round(gx), 1, cols - 1);
      return { horizontal, line };
    }
    // frame phase: boundary lines allowed (the closing line sits on the bounding box)
    const line = horizontal ? clamp(Math.round(gy), 0, rows) : clamp(Math.round(gx), 0, cols);
    return { horizontal, line };
  };
  const onCutMove = (e: React.PointerEvent) => {
    if (phase !== "cut" && phase !== "frame") return;
    setHoverCut(hoverFromEvent(e));
  };
  const onCutLeave = () => setHoverCut(null);

  const sameCut = (c1: CompCut, c2: CompCut) =>
    c1.a[0] === c2.a[0] && c1.a[1] === c2.a[1] && c1.b[0] === c2.b[0] && c1.b[1] === c2.b[1];

  const onCutClick = (e: React.PointerEvent) => {
    if (phase !== "cut" && phase !== "frame") return;
    const hov = hoverFromEvent(e) ?? hoverCut;
    if (!hov) return;
    const { horizontal, line } = hov;
    const s0 = 0;
    const s1 = horizontal ? cols : rows;

    if (phase === "frame") {
      const fr = fig.subtractive!.frame;
      const frHorizontal = fr.a[1] === fr.b[1];
      const frLine = frHorizontal ? fr.a[1] : fr.a[0];
      if (horizontal !== frHorizontal || line !== frLine) {
        wrongRef.current += 1;
        setNote(`Not quite. ${fig.subtractive!.hint}`);
        return;
      }
      setNote(null); setHoverCut(null);
      setPhase("subareas");
      return;
    }

    // candidate cuts = cuts in sets consistent with what's already accepted
    const eligibleSets = fig.cutSets.filter((set) => acceptedCuts.every((ac) => set.some((c) => sameCut(c, ac))));
    let matched: CompCut | null = null;
    for (const set of eligibleSets) {
      for (const c of set) {
        if (acceptedCuts.some((ac) => sameCut(ac, c))) continue;
        const cHorizontal = c.a[1] === c.b[1];
        if (cHorizontal !== horizontal) continue;
        const cLine = cHorizontal ? c.a[1] : c.a[0];
        if (cLine !== line) continue;
        const c0 = cHorizontal ? Math.min(c.a[0], c.b[0]) : Math.min(c.a[1], c.b[1]);
        const c1v = cHorizontal ? Math.max(c.a[0], c.b[0]) : Math.max(c.a[1], c.b[1]);
        if (s0 <= c0 + 1 && s1 >= c1v - 1) { matched = c; break; }
      }
      if (matched) break;
    }
    if (!matched) {
      wrongRef.current += 1;
      setNote(`That cut doesn't split it into simple shapes. Try again — ${fig.hint}`);
      return;
    }
    const nextCuts = [...acceptedCuts, matched];
    setAcceptedCuts(nextCuts);
    setNote(null);
    const doneSet = fig.cutSets.findIndex((set) =>
      set.length === nextCuts.length && set.every((c) => nextCuts.some((ac) => sameCut(ac, c))));
    if (doneSet !== -1) {
      setMatchedSet(doneSet);
      setHoverCut(null);
      setPhase("deduce");
      setStepIdx(0);
    } else {
      setNote("Good cut — the figure needs one more.");
    }
  };

  // Undo the last cut (for demoing add-a-line-then-undo); backs out of deduce too.
  const undoCut = () => {
    if (!acceptedCuts.length) return;
    setAcceptedCuts((cs) => cs.slice(0, -1));
    setMatchedSet(null);
    setSolvedEdges({});
    setStepIdx(0); setStepEntry("");
    setNote(null);
    setPhase("cut");
  };

  // ── Deduce: one side per step ──────────────────────────────────────────────
  function submitStep() {
    if (!step) return;
    const target = edgeById(step.edge);
    const v = Number(stepEntry.trim());
    if (!stepEntry.trim() || !Number.isFinite(v)) return;
    if (v !== target.value) {
      wrongRef.current += 1;
      setNote(step.type === "count"
        ? "Count the highlighted squares one at a time — each square is 1 unit."
        : step.type === "opposite"
        ? "Look at the flashing side — this side must be the same length."
        : "Watch the walls slide again — the pieces together cover the whole wall.");
      if (step.type === "partial") setAnimKey((k) => k + 1);
      setStepEntry("");
      return;
    }
    setNote(null);
    setSolvedEdges((m) => ({ ...m, [target.id]: true }));
    setStepEntry("");
    if (stepIdx + 1 < fig.steps.length) setStepIdx(stepIdx + 1);
    else { setPhase("areas"); setPieceEntries(pieces.map(() => "")); }
  }

  // ── Areas ─────────────────────────────────────────────────────────────────
  const pieceArea = (p: CompPiece) => (p.kind === "tri" ? (p.w * p.h) / 2 : p.w * p.h);
  const totalArea = pieces.reduce((acc, p) => acc + pieceArea(p), 0);
  function checkAreas() {
    const bad = pieces.findIndex((p, i) => Number(pieceEntries[i]) !== pieceArea(p));
    if (bad !== -1) {
      wrongRef.current += 1;
      const p = pieces[bad];
      setNote(p.kind === "tri"
        ? `Check the triangle piece: half of ${p.w} times ${p.h}.`
        : `Check the highlighted piece: ${p.w} times ${p.h}.`);
      return;
    }
    if (Number(totalEntry) !== totalArea) {
      wrongRef.current += 1;
      setNote(`Add the pieces: ${pieces.map((p) => pieceArea(p)).join(" + ")} = ?`);
      return;
    }
    setNote(null);
    if (fig.subtractive) { setPhase("frame"); return; }
    finishFigure();
  }

  function finishFigure() {
    setPhase("done");
    if (!solvedRef.current) {
      solvedRef.current = true;
      reportToolResult({ tool: "area-explorer", correct: wrongRef.current === 0, standardId: "6.G.A.1", misconception: null, problemId: `composite-l${level + 1}-${fig.name}` });
    }
  }

  function checkSubAreas() {
    if (!fig.subtractive) return;
    const wholeA = fig.subtractive.whole.w * fig.subtractive.whole.h;
    const cutA = fig.subtractive.cutRect.w * fig.subtractive.cutRect.h;
    if (Number(subWhole) !== wholeA) {
      wrongRef.current += 1;
      setNote(`The whole rectangle is ${fig.subtractive.whole.w} times ${fig.subtractive.whole.h}.`);
      return;
    }
    if (Number(subCut) !== cutA) {
      wrongRef.current += 1;
      setNote(`The cutout is ${fig.subtractive.cutRect.w} times ${fig.subtractive.cutRect.h}.`);
      return;
    }
    if (Number(subTotal) !== wholeA - cutA) {
      wrongRef.current += 1;
      setNote(`Subtract: ${wholeA} minus ${cutA} = ?`);
      return;
    }
    setNote(null);
    setPhase("compare");
  }

  // ── Rendering helpers ─────────────────────────────────────────────────────
  const edgeLine = (e: CompEdge) => ({ x1: sx(e.a[0]), y1: sy(e.a[1]), x2: sx(e.b[0]), y2: sy(e.b[1]) });
  const edgeMid = (e: CompEdge): [number, number] => [(sx(e.a[0]) + sx(e.b[0])) / 2 + e.off[0], (sy(e.a[1]) + sy(e.b[1])) / 2 + e.off[1]];
  const edgeKnown = (e: CompEdge) => e.given || solvedEdges[e.id];
  // Where a partial-step part slides to: stacked along the whole, in listed order.
  const partShift = (whole: CompEdge, partIds: string[], id: string): [number, number] => {
    const part = edgeById(id);
    const horizontal = whole.a[1] === whole.b[1];
    let cum = 0;
    for (const pid of partIds) { if (pid === id) break; cum += edgeById(pid).value; }
    if (horizontal) {
      const x0 = Math.min(whole.a[0], whole.b[0]) + cum;
      return [sx(x0) - sx(Math.min(part.a[0], part.b[0])), sy(whole.a[1]) - sy(part.a[1])];
    }
    const y0 = Math.min(whole.a[1], whole.b[1]) + cum;
    return [sx(whole.a[0]) - sx(part.a[0]), sy(y0) - sy(Math.min(part.a[1], part.b[1]))];
  };

  const stepTargetId = step ? step.edge : null;
  const flashFromId = step && step.type === "opposite" ? step.from : step && step.type === "partial" ? step.whole : null;

  return (
    <div className="ae-stage">
      <div className="ae-prompt">
        {phase === "cut" && "Divide the figure into simple shapes"}
        {phase === "deduce" && "Find every side length"}
        {phase === "areas" && "Find each piece's area"}
        {phase === "frame" && "Method 2: whole minus cutout"}
        {phase === "subareas" && "Whole minus cutout"}
        {phase === "compare" && "Two methods, one area"}
        {phase === "done" && `Total area = ${totalArea} square units`}
      </div>
      <div className="ae-sub">
        {phase === "cut" && (acceptedCuts.length ? "Keep going — line up your next cut and click to lock it." : "Move your cursor to place the cut line, then click to lock it in.")}
        {phase === "deduce" && step?.prompt}
        {phase === "areas" && "Use the sides you marked. Add the pieces for the total."}
        {phase === "frame" && "Same figure, different idea: close the WHOLE rectangle — line up the top edge and click to close it."}
        {phase === "subareas" && "Find the whole rectangle's area, the cutout's area, and subtract."}
        {phase === "compare" && "Adding the pieces and subtracting the cutout give the SAME area."}
        {phase === "done" && "Divided, deduced, and solved — same area either way you cut it."}
      </div>

      <div className="ae-tools">
        {COMP_LEVELS.map((l, i) => (
          <button key={i} className={`ae-tbtn ${i === level ? "ae-tbtn-on" : ""}`} onClick={() => reset(i)}>{l.label}</button>
        ))}
        <button className="ae-tbtn" onClick={() => reset(level)}>Reset</button>
        {(phase === "cut" || phase === "deduce") && acceptedCuts.length > 0 && (
          <button className="ae-tbtn" onClick={undoCut}>Undo</button>
        )}
      </div>

      <svg ref={svgRef} className="ae-svg" viewBox={`0 0 ${W} ${H}`} style={{ touchAction: "none", cursor: phase === "cut" || phase === "frame" ? "crosshair" : "default" }}
        onPointerDown={onCutMove} onPointerMove={onCutMove} onPointerUp={onCutClick} onPointerLeave={onCutLeave}>
        <defs>
          <pattern id="ae-comp-cell" x={M} y={M} width={U} height={U} patternUnits="userSpaceOnUse">
            <path d={`M ${U} 0 L 0 0 0 ${U}`} fill="none" stroke="var(--bdb-line)" strokeWidth={1} opacity={0.8} />
          </pattern>
          <clipPath id="ae-comp-clip"><polygon points={pts} /></clipPath>
        </defs>
        <rect x={M} y={M} width={cols * U} height={rows * U} fill="url(#ae-comp-cell)" />

        {/* pieces (after a valid division) */}
        {pieces.map((p, i) =>
          p.kind === "rect" ? (
            <rect key={i} x={sx(p.x)} y={sy(p.y)} width={p.w * U} height={p.h * U}
              fill={`color-mix(in srgb, ${COMP_COLORS[i % COMP_COLORS.length]} ${phase === "done" ? 42 : 26}%, transparent)`} />
          ) : (
            <polygon key={i} points={`${sx(p.x)},${sy(p.y + p.h)} ${sx(p.x + p.w / 2)},${sy(p.y)} ${sx(p.x + p.w)},${sy(p.y + p.h)}`}
              fill={`color-mix(in srgb, ${COMP_COLORS[i % COMP_COLORS.length]} ${phase === "done" ? 42 : 26}%, transparent)`} />
          ))}

        {/* count-step strip */}
        {step?.type === "count" && step.strip.map(([gx, gy], i) => (
          <g key={`cs-${gx}-${gy}`} className="ae-count-cell" style={{ animationDelay: `${i * 200}ms` }}>
            <rect x={sx(gx)} y={sy(gy)} width={U} height={U} fill={C_HEIGHT} opacity={0.32} stroke={C_HEIGHT} strokeWidth={2} />
            <text x={sx(gx) + U / 2} y={sy(gy) + U / 2} textAnchor="middle" dominantBaseline="central" fontSize={Math.round(U * 0.4)} fontWeight={900} fill="var(--bdb-ink)">{i + 1}</text>
          </g>
        ))}

        {/* accepted cuts */}
        {acceptedCuts.map((c, i) => (
          <line key={i} x1={sx(c.a[0])} y1={sy(c.a[1])} x2={sx(c.b[0])} y2={sy(c.b[1])} stroke="var(--bdb-ink)" strokeWidth={2.5} strokeDasharray="7 5" />
        ))}

        {/* live cut preview: follows the cursor, clipped to the figure (cut) or
            the bounding box (frame); a click locks it in */}
        {hoverCut && (phase === "cut" || phase === "frame") && (() => {
          const { horizontal, line } = hoverCut;
          const l = horizontal
            ? { x1: sx(0), y1: sy(line), x2: sx(cols), y2: sy(line) }
            : { x1: sx(line), y1: sy(0), x2: sx(line), y2: sy(rows) };
          return (
            <line {...l} stroke="var(--bdb-coral)" strokeWidth={3.5} strokeDasharray="4 5"
              clipPath={phase === "cut" ? "url(#ae-comp-clip)" : undefined} pointerEvents="none" />
          );
        })()}

        {/* outline */}
        <polygon points={pts} fill={phase === "cut" ? `color-mix(in srgb, ${C_BASE} 16%, transparent)` : "none"} stroke="var(--bdb-ink)" strokeWidth={3} strokeLinejoin="miter" />

        {/* whole-minus-cutout: the closed whole and the hatched cutout */}
        {fig.subtractive && (phase === "subareas" || phase === "compare") && (() => {
          const sub = fig.subtractive;
          const cr = sub.cutRect;
          return (
            <g>
              <rect x={sx(0)} y={sy(0)} width={sub.whole.w * U} height={sub.whole.h * U}
                fill="none" stroke={C_BASE} strokeWidth={4} strokeDasharray="10 6" />
              <rect x={sx(cr.x)} y={sy(cr.y)} width={cr.w * U} height={cr.h * U}
                fill={`color-mix(in srgb, ${C_B2} 34%, transparent)`} stroke={C_B2} strokeWidth={2.5} strokeDasharray="5 4" />
              <line x1={sx(cr.x)} y1={sy(cr.y)} x2={sx(cr.x + cr.w)} y2={sy(cr.y + cr.h)} stroke={C_B2} strokeWidth={2} />
              <line x1={sx(cr.x + cr.w)} y1={sy(cr.y)} x2={sx(cr.x)} y2={sy(cr.y + cr.h)} stroke={C_B2} strokeWidth={2} />
            </g>
          );
        })()}

        {/* interior helper edges (roof base is the cut itself; roof height is dashed) */}
        {fig.edges.filter((e) => e.interior && (edgeKnown(e) || e.id === stepTargetId)).map((e) => {
          const l = edgeLine(e);
          return <line key={e.id} {...l} stroke="var(--bdb-ink-soft)" strokeWidth={2} strokeDasharray="5 5" />;
        })}

        {/* step flashes: the known side pulses in green; the asked side pulses coral */}
        {flashFromId && (() => {
          const e = edgeById(flashFromId);
          const l = edgeLine(e);
          return <line className="ae-mark-pulse" {...l} stroke="var(--bdb-green)" strokeWidth={6} strokeLinecap="round" />;
        })()}
        {stepTargetId && (() => {
          const e = edgeById(stepTargetId);
          const l = edgeLine(e);
          return <line className="ae-mark-pulse" {...l} stroke="var(--bdb-coral)" strokeWidth={5} strokeDasharray="9 6" strokeLinecap="round" />;
        })()}

        {/* partial-walls animation: the parts slide onto the whole wall */}
        {step?.type === "partial" && (() => {
          const whole = edgeById(step.whole);
          return step.parts.map((pid) => {
            const e = edgeById(pid);
            const l = edgeLine(e);
            const [dx, dy] = partShift(whole, step.parts, pid);
            const known = edgeKnown(e);
            return (
              <g key={`${pid}-${animKey}`} style={{ transition: "transform 1.1s cubic-bezier(.35,.8,.3,1) 0.15s", transform: animOn ? `translate(${dx}px, ${dy}px)` : "none" }}>
                <line {...l} stroke={known ? "var(--bdb-green)" : "var(--bdb-coral)"} strokeWidth={7} strokeLinecap="round" opacity={0.85} />
              </g>
            );
          });
        })()}

        {/* edge labels: given from the start, deduced ones as they're solved */}
        {fig.edges.filter((e) => edgeKnown(e)).map((e) => {
          const [x, y] = edgeMid(e);
          return (
            <text key={e.id} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={16} fontWeight={900}
              fill={e.given ? "var(--bdb-ink)" : "var(--bdb-green)"} stroke="var(--bdb-ground)" strokeWidth={3.6} style={{ paintOrder: "stroke" }}>
              {e.value}
            </text>
          );
        })}
      </svg>

      {phase === "deduce" && step && step.type === "partial" && (
        <div className="ae-formula" style={{ margin: "10px 0 0" }}>
          {step.parts.map((pid, i) => (
            <span key={pid} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {i > 0 && <span>+</span>}
              {pid === step.edge ? (
                <input className="ae-slotin" value={stepEntry} inputMode="decimal" placeholder="?" aria-label="missing part length"
                  autoFocus onChange={(e) => { setStepEntry(e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1")); setNote(null); }}
                  onKeyDown={(e) => e.key === "Enter" && submitStep()} />
              ) : (
                <span className="ae-slot ok" style={{ background: "var(--bdb-green)", borderColor: "var(--bdb-green)" }}>{edgeById(pid).value}</span>
              )}
            </span>
          ))}
          <span>=</span>
          <span className="ae-slot ok" style={{ background: "var(--bdb-ink)", borderColor: "var(--bdb-ink)" }}>{edgeById(step.whole).value}</span>
        </div>
      )}
      {phase === "deduce" && step && (
        <div className="ae-bar">
          {step.type === "partial" && <button className="ae-link" onClick={() => setAnimKey((k) => k + 1)}>Watch again</button>}
          {step.type !== "partial" && (
            <input className="ae-slotin" value={stepEntry} inputMode="decimal" placeholder="?" aria-label="side length"
              onChange={(e) => { setStepEntry(e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1")); setNote(null); }}
              onKeyDown={(e) => e.key === "Enter" && submitStep()} />
          )}
          <button className="ae-btn" disabled={!stepEntry.trim()} onClick={submitStep}>Enter</button>
        </div>
      )}

      {phase === "areas" && (
        <>
          <div className="ae-formula">
            {pieces.map((p, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                {i > 0 && <span>+</span>}
                <span style={{ display: "inline-grid", placeItems: "center", minWidth: 48, minHeight: 40, padding: "0 8px", border: `3px solid ${COMP_COLORS[i % COMP_COLORS.length]}`, color: COMP_COLORS[i % COMP_COLORS.length], fontSize: "0.95rem", background: "#fff" }}>
                  {p.kind === "tri" ? `½×${p.w}×${p.h}` : `${p.w}×${p.h}`}
                </span>
                <input className="ae-answer" style={{ width: 64 }} value={pieceEntries[i] ?? ""} inputMode="numeric"
                  onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); setPieceEntries((es) => es.map((x, j) => (j === i ? v : x))); setNote(null); }}
                  aria-label={`piece ${i + 1} area`} />
              </span>
            ))}
            <span>=</span>
            <input className="ae-answer" style={{ width: 84 }} value={totalEntry} inputMode="numeric"
              onChange={(e) => { setTotalEntry(e.target.value.replace(/\D/g, "")); setNote(null); }}
              onKeyDown={(e) => e.key === "Enter" && checkAreas()} aria-label="total area" />
          </div>
          <div className="ae-bar"><button className="ae-btn" onClick={checkAreas}>Check</button></div>
        </>
      )}

      {phase === "subareas" && fig.subtractive && (
        <>
          <div className="ae-formula">
            <span style={{ display: "inline-grid", placeItems: "center", minWidth: 48, minHeight: 40, padding: "0 8px", border: `3px solid ${C_BASE}`, color: C_BASE, fontSize: "0.95rem", background: "#fff" }}>
              {fig.subtractive.whole.w}×{fig.subtractive.whole.h}
            </span>
            <input className="ae-answer" style={{ width: 64 }} value={subWhole} inputMode="numeric"
              onChange={(e) => { setSubWhole(e.target.value.replace(/\D/g, "")); setNote(null); }} aria-label="whole rectangle area" />
            <span>−</span>
            <span style={{ display: "inline-grid", placeItems: "center", minWidth: 48, minHeight: 40, padding: "0 8px", border: `3px solid ${C_B2}`, color: C_B2, fontSize: "0.95rem", background: "#fff" }}>
              {fig.subtractive.cutRect.w}×{fig.subtractive.cutRect.h}
            </span>
            <input className="ae-answer" style={{ width: 64 }} value={subCut} inputMode="numeric"
              onChange={(e) => { setSubCut(e.target.value.replace(/\D/g, "")); setNote(null); }} aria-label="cutout area" />
            <span>=</span>
            <input className="ae-answer" style={{ width: 84 }} value={subTotal} inputMode="numeric"
              onChange={(e) => { setSubTotal(e.target.value.replace(/\D/g, "")); setNote(null); }}
              onKeyDown={(e) => e.key === "Enter" && checkSubAreas()} aria-label="whole minus cutout total" />
          </div>
          <div className="ae-bar"><button className="ae-btn" onClick={checkSubAreas}>Check</button></div>
        </>
      )}

      {phase === "compare" && fig.subtractive && (() => {
        const sub = fig.subtractive;
        const cr = sub.cutRect;
        const mu = 22; // mini-figure unit
        const mw = sub.whole.w * mu + 12, mh = sub.whole.h * mu + 12;
        const mx = (g: number) => 6 + g * mu;
        const my = (g: number) => 6 + g * mu;
        const miniPts = fig.verts.map((v) => `${mx(v[0])},${my(v[1])}`).join(" ");
        return (
          <div className="ae-compare">
            <div className="ae-compcard">
              <div className="ae-compname">Add the pieces</div>
              <svg width={mw} height={mh} viewBox={`0 0 ${mw} ${mh}`} aria-label="additive decomposition">
                {pieces.map((pc, i) => (
                  <rect key={i} x={mx(pc.x)} y={my(pc.y)} width={pc.w * mu} height={pc.h * mu}
                    fill={`color-mix(in srgb, ${COMP_COLORS[i % COMP_COLORS.length]} 38%, transparent)`} stroke="var(--bdb-ink)" strokeWidth={1.5} />
                ))}
                <polygon points={miniPts} fill="none" stroke="var(--bdb-ink)" strokeWidth={2.5} />
              </svg>
              <div className="ae-compsum">{pieces.map((pc) => pieceArea(pc)).join(" + ")} = {totalArea}</div>
            </div>
            <div className="ae-compcard">
              <div className="ae-compname">Whole minus cutout</div>
              <svg width={mw} height={mh} viewBox={`0 0 ${mw} ${mh}`} aria-label="subtractive decomposition">
                <rect x={mx(0)} y={my(0)} width={sub.whole.w * mu} height={sub.whole.h * mu}
                  fill={`color-mix(in srgb, ${C_BASE} 30%, transparent)`} stroke={C_BASE} strokeWidth={2.5} strokeDasharray="7 4" />
                <rect x={mx(cr.x)} y={my(cr.y)} width={cr.w * mu} height={cr.h * mu}
                  fill={`color-mix(in srgb, ${C_B2} 40%, transparent)`} stroke={C_B2} strokeWidth={2} />
                <line x1={mx(cr.x)} y1={my(cr.y)} x2={mx(cr.x + cr.w)} y2={my(cr.y + cr.h)} stroke={C_B2} strokeWidth={1.5} />
                <line x1={mx(cr.x + cr.w)} y1={my(cr.y)} x2={mx(cr.x)} y2={my(cr.y + cr.h)} stroke={C_B2} strokeWidth={1.5} />
                <polygon points={miniPts} fill="none" stroke="var(--bdb-ink)" strokeWidth={2.5} />
              </svg>
              <div className="ae-compsum">{sub.whole.w * sub.whole.h} − {cr.w * cr.h} = {sub.whole.w * sub.whole.h - cr.w * cr.h}</div>
            </div>
            <div className="ae-bar" style={{ width: "100%" }}>
              <button className="ae-btn" onClick={finishFigure}>Same area both ways — finish</button>
            </div>
          </div>
        );
      })()}

      {phase === "done" && (
        <div className="ae-bar">
          {level + 1 < COMP_LEVELS.length
            ? <button className="ae-btn" onClick={() => reset(level + 1)}>Next level</button>
            : <button className="ae-btn ghost" onClick={() => reset(0)}>All levels complete — start over</button>}
        </div>
      )}

      <div className="ae-note">{note && <span key={note} className="ae-note-in">{note}</span>}</div>
    </div>
  );
}

// ── Volume mode — M1.T2.L3 "Length, Width, and Depth" (6.G.A.2, Session 1) ──
// Build walk on the lesson's anchor prism (5 x 3 x 4): find the floor's area
// flat, tilt the floor down into perspective, stack layers (each layer adds the
// whole base area again), collapse the sum into layers x B, commit to cubic
// units. Then the lesson's problem set: 8x3x5, base-area 24 with height 7 (no
// length or width on purpose), and the 6x4x3 exit-ticket prism.

const VOL_KEY = "bdm-volume-practice-v1";
const VOL_ANCHOR = { l: 5, d: 3, h: 4 };
const VOL_B = VOL_ANCHOR.l * VOL_ANCHOR.d;
const VOL_V = VOL_B * VOL_ANCHOR.h;

interface VolTask { title: string; l?: number; d?: number; B?: number; h: number; unit: string; problemId: string; note: string }
const VOL_TASKS: VolTask[] = [
  { title: "Prism 1", l: 8, d: 3, h: 5, unit: "in", problemId: "volume-1-8x3x5",
    note: "Copy this prism onto your evidence card: label the length, the width, and the height." },
  { title: "Base and height", B: 24, h: 7, unit: "cm", problemId: "volume-2-b24x7",
    note: "No length or width this time. One layer is already measured — that IS the base area." },
  { title: "Final check", l: 6, d: 4, h: 3, unit: "m", problemId: "volume-3-6x4x3",
    note: "Every measurement, the right formula, the right unit." },
];
const volTaskV = (t: VolTask) => (t.B ?? t.l! * t.d!) * t.h;

interface VolSave { idx: number; results: (PracticeResult | null)[]; confirmedAt: string | null }
function loadVol(): VolSave {
  const empty: VolSave = { idx: 0, results: VOL_TASKS.map(() => null), confirmedAt: null };
  try {
    const raw = window.localStorage.getItem(VOL_KEY);
    if (!raw) return empty;
    const p = JSON.parse(raw) as VolSave;
    if (typeof p.idx !== "number" || !Array.isArray(p.results)) return empty;
    return {
      idx: clamp(p.idx, 0, VOL_TASKS.length),
      results: VOL_TASKS.map((_, i) => p.results[i] ?? null),
      confirmedAt: typeof p.confirmedAt === "string" ? p.confirmedAt : null,
    };
  } catch { return empty; }
}

// Shallow-camera axonometric axes: x runs right, z runs back-left, y up.
const VAX = { x: [38, 11] as Pt, z: [-30, 13] as Pt, y: [0, -34] as Pt };
const volPt = (o: Pt, s: number, x: number, z: number, y: number): Pt => [
  o[0] + (x * VAX.x[0] + z * VAX.z[0] + y * VAX.y[0]) * s,
  o[1] + (x * VAX.x[1] + z * VAX.z[1] + y * VAX.y[1]) * s,
];
const volPoly = (ps: Pt[]) => ps.map((p) => p.join(",")).join(" ");

const VOL_TOP = `color-mix(in srgb, ${C_BASE} 42%, #fff)`;
const VOL_LEFT = `color-mix(in srgb, ${C_BASE} 88%, #10312f)`;
const VOL_RIGHT = `color-mix(in srgb, ${C_BASE} 62%, #10312f)`;

// One extruded slab (layer) of an l x d prism from height y0 to y1, with an
// optional per-unit cube grid on the three visible faces.
function VolSlab({ o, s, l, d, y0, y1, grid, fillTop = VOL_TOP, fillLeft = VOL_LEFT, fillRight = VOL_RIGHT, opacity, className, style }: {
  o: Pt; s: number; l: number; d: number; y0: number; y1: number; grid: boolean;
  fillTop?: string; fillLeft?: string; fillRight?: string; opacity?: number; className?: string; style?: CSSProperties;
}) {
  const P = (x: number, z: number, y: number) => volPt(o, s, x, z, y);
  const stroke = "rgba(255,255,255,0.75)";
  const lines: ReactPathLine[] = [];
  if (grid) {
    for (let i = 1; i < l; i++) {
      lines.push([P(i, 0, y1), P(i, d, y1)]);           // top face, across depth
      lines.push([P(i, d, y1), P(i, d, y0)]);           // front-left face, vertical
    }
    for (let j = 1; j < d; j++) {
      lines.push([P(0, j, y1), P(l, j, y1)]);           // top face, along length
      lines.push([P(l, j, y1), P(l, j, y0)]);           // front-right face, vertical
    }
    for (let k = Math.ceil(y0) + 1; k < y1; k++) {
      lines.push([P(0, d, k), P(l, d, k)]);             // front-left face, layer line
      lines.push([P(l, 0, k), P(l, d, k)]);             // front-right face, layer line
    }
  }
  return (
    <g className={className} style={style} opacity={opacity}>
      <polygon points={volPoly([P(0, d, y1), P(l, d, y1), P(l, d, y0), P(0, d, y0)])} fill={fillLeft} />
      <polygon points={volPoly([P(l, 0, y1), P(l, d, y1), P(l, d, y0), P(l, 0, y0)])} fill={fillRight} />
      <polygon points={volPoly([P(0, 0, y1), P(l, 0, y1), P(l, d, y1), P(0, d, y1)])} fill={fillTop} />
      {lines.map(([a, b], i) => (
        <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={stroke} strokeWidth={1.4} />
      ))}
      <polygon points={volPoly([P(0, 0, y1), P(l, 0, y1), P(l, d, y1), P(0, d, y1)])} fill="none" stroke="var(--bdb-ink)" strokeWidth={2} />
      <polygon points={volPoly([P(0, d, y1), P(l, d, y1), P(l, d, y0), P(0, d, y0)])} fill="none" stroke="var(--bdb-ink)" strokeWidth={2} />
      <polygon points={volPoly([P(l, 0, y1), P(l, d, y1), P(l, d, y0), P(l, 0, y0)])} fill="none" stroke="var(--bdb-ink)" strokeWidth={2} />
    </g>
  );
}
type ReactPathLine = [Pt, Pt];

function VolumeBuilder() {
  type VPhase = "base" | "tilt" | "stack" | "units" | "bridge" | "solve" | "tdone" | "complete";
  const [vPhase, setVPhase] = useState<VPhase>("base");
  const [note, setNote] = useState<string | null>(null);
  const [entry, setEntry] = useState("");

  // build-walk state
  const [walkSlot, setWalkSlot] = useState(0);           // 0 = length, 1 = width, 2 = base area
  const [showBaseCount, setShowBaseCount] = useState(false);
  const [tilted, setTilted] = useState(false);
  const [layers, setLayers] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // solve state
  const [tIdx, setTIdx] = useState(0);
  const [tResults, setTResults] = useState<(PracticeResult | null)[]>(() => VOL_TASKS.map(() => null));
  const [tConfirmedAt, setTConfirmedAt] = useState<string | null>(null);
  const [tHydrated, setTHydrated] = useState(false);
  const [tSlot, setTSlot] = useState(0);
  const [tWrongs, setTWrongs] = useState(0);

  useEffect(() => {
    const s = loadVol();
    setTIdx(s.idx); setTResults(s.results); setTConfirmedAt(s.confirmedAt);
    if (s.idx > 0 || s.results.some(Boolean) || s.confirmedAt) {
      setVPhase(s.idx >= VOL_TASKS.length ? "complete" : "solve");
    }
    setTHydrated(true);
  }, []);
  useEffect(() => {
    if (!tHydrated) return;
    try { window.localStorage.setItem(VOL_KEY, JSON.stringify({ idx: tIdx, results: tResults, confirmedAt: tConfirmedAt })); } catch { /* private mode */ }
  }, [tHydrated, tIdx, tResults, tConfirmedAt]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // When the box is full, pause on the finished plus-chain, then collapse it.
  useEffect(() => {
    if (vPhase !== "stack" || layers !== VOL_ANCHOR.h) return;
    timerRef.current = setTimeout(() => setVPhase("units"), 1200);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [vPhase, layers]);

  // ── build-walk geometry ────────────────────────────────────────────────────
  const U = 44;                                          // flat px per unit
  const FLAT: Pt = [170, 64];                            // flat rect top-left
  const O: Pt = [230, 228];                              // iso origin (x=0, z=0 corner)
  const a = VAX.x[0] / U, b = VAX.x[1] / U, c = VAX.z[0] / U, d = VAX.z[1] / U;
  const e = O[0] - a * FLAT[0] - c * FLAT[1];
  const f = O[1] - b * FLAT[0] - d * FLAT[1];
  const tiltMatrix = `matrix(${a},${b},${c},${d},${e},${f})`;

  const WALK_SLOTS = [
    { val: VOL_ANCHOR.l, ghost: "length", wrong: "Count the squares along the BOTTOM edge — that is the length." },
    { val: VOL_ANCHOR.d, ghost: "width", wrong: "Count the squares along the SIDE edge — that is the width." },
    { val: VOL_B, ghost: "area", wrong: "Count every square — the whole floor." },
  ];

  function submitWalkSlot() {
    const v = Number(entry.trim());
    if (!entry.trim() || !Number.isFinite(v)) return;
    const slot = WALK_SLOTS[walkSlot];
    if (v !== slot.val) {
      setNote(slot.wrong);
      if (walkSlot === 2) setShowBaseCount(true);
      setEntry("");
      return;
    }
    setNote(null); setEntry(""); setShowBaseCount(false);
    if (walkSlot === 2) { setVPhase("tilt"); return; }
    setWalkSlot(walkSlot + 1);
  }

  function layDown() {
    setTilted(true);
    timerRef.current = setTimeout(() => setVPhase("stack"), 1050);
  }

  function pickWalkUnit(kind: "plain" | "sq" | "cu") {
    if (kind === "cu") { setNote(null); setVPhase("bridge"); return; }
    setNote(kind === "sq"
      ? "Square units cover a FLAT face. We filled space — that takes cubic units."
      : "Plain units measure a length. We filled space — that takes cubic units.");
  }

  function resetWalk() {
    setVPhase("base"); setWalkSlot(0); setEntry(""); setNote(null);
    setShowBaseCount(false); setTilted(false); setLayers(0);
  }

  // ── solve helpers ──────────────────────────────────────────────────────────
  const task = VOL_TASKS[Math.min(tIdx, VOL_TASKS.length - 1)];
  const taskV = volTaskV(task);
  const taskSlots: { val: number; ghost: string }[] = task.B
    ? [{ val: task.B, ghost: "B" }, { val: task.h, ghost: "h" }, { val: taskV, ghost: "volume" }]
    : [{ val: task.l!, ghost: "l" }, { val: task.d!, ghost: "w" }, { val: task.h, ghost: "h" }, { val: taskV, ghost: "volume" }];

  function wrongVolumeNote(v: number): string {
    if (task.B) {
      if (v === task.B + task.h) return `Multiply, not add: one layer is ${task.B}, and there are ${task.h} layers.`;
      return `B is already one whole layer. ${task.B} in each of ${task.h} layers: ${task.B} times ${task.h}.`;
    }
    const { l, d: w, h } = { l: task.l!, d: task.d!, h: task.h };
    if (v === l * w) return `${l} times ${w} = ${l * w} is ONE layer — the base. The prism is ${h} layers tall.`;
    if (v === l * h || v === w * h) return "That multiplies only two edges — one flat face. Use all three.";
    if (v === l + w + h) return "Adding the edges gives a length. Volume multiplies them.";
    return `Base area first (${l} times ${w}), then multiply by the ${h} layers.`;
  }

  function submitTaskSlot() {
    const v = Number(entry.trim());
    if (!entry.trim() || !Number.isFinite(v)) return;
    const slot = taskSlots[tSlot];
    if (v !== slot.val) {
      setTWrongs(tWrongs + 1);
      if (tSlot === taskSlots.length - 1) setNote(wrongVolumeNote(v));
      else if (task.B) setNote(tSlot === 0 ? "B is labeled on the shaded layer — it is already an area." : "The height is labeled on the vertical edge.");
      else setNote(["The length is labeled along the front edge.", "The width is labeled along the side edge.", "The height is labeled on the vertical edge."][tSlot]);
      setEntry("");
      return;
    }
    setNote(null); setEntry("");
    setTSlot(tSlot + 1);
  }

  function pickTaskUnit(kind: "plain" | "sq" | "cu") {
    if (kind !== "cu") {
      setTWrongs(tWrongs + 1);
      setNote(kind === "sq"
        ? `Square ${task.unit} cover a flat face. The prism is FILLED with cubes — cubic ${task.unit}.`
        : `Plain ${task.unit} measure one edge. The prism is FILLED with cubes — cubic ${task.unit}.`);
      return;
    }
    setNote(null);
    const results = tResults.map((r, i) => (i === tIdx ? { firstTry: tWrongs === 0, wrongs: tWrongs } : r));
    setTResults(results);
    reportToolResult({ tool: "area-explorer", correct: tWrongs === 0, standardId: "6.G.A.2", misconception: null, problemId: task.problemId });
    setVPhase("tdone");
  }

  function nextTask() {
    const n = tIdx + 1;
    setTIdx(n); setTSlot(0); setTWrongs(0); setEntry(""); setNote(null);
    setVPhase(n >= VOL_TASKS.length ? "complete" : "solve");
  }

  function restartProblems() {
    setTIdx(0); setTResults(VOL_TASKS.map(() => null)); setTConfirmedAt(null);
    setTSlot(0); setTWrongs(0); setEntry(""); setNote(null);
    setVPhase("solve");
  }

  // ── task prism drawing ─────────────────────────────────────────────────────
  function TaskPrism({ t }: { t: VolTask }) {
    const L = t.B ? 4 : t.l!;
    const D = t.B ? 3 : t.d!;
    const H = t.h;
    const s = Math.min(1.1, 470 / (L * VAX.x[0] + D * -VAX.z[0]), 250 / (L * VAX.x[1] + D * VAX.z[1] + H * -VAX.y[1]));
    const spanX = (L * VAX.x[0] + D * -VAX.z[0]) * s;
    const o: Pt = [(560 - spanX) / 2 + D * -VAX.z[0] * s, 30 + H * -VAX.y[1] * s];
    const P = (x: number, z: number, y: number) => volPt(o, s, x, z, y);
    const xMid = P(L / 2, D, 0), zMid = P(L, D / 2, 0), hMid = P(L, 0, H / 2);
    const bMid = P(L / 2, D, 0.5);
    const height = Math.ceil(o[1] + (L * VAX.x[1] + D * VAX.z[1]) * s + 46);
    return (
      <svg className="ae-svg" viewBox={`0 0 560 ${height}`} role="img"
        aria-label={t.B ? `prism with base area ${t.B} square ${t.unit} and height ${t.h} ${t.unit}` : `prism ${t.l} by ${t.d} by ${t.h} ${t.unit}`}>
        <VolSlab o={o} s={s} l={L} d={D} y0={0} y1={H} grid={!t.B} />
        {t.B && (
          <>
            <VolSlab o={o} s={s} l={L} d={D} y0={0} y1={1} grid={false}
              fillTop={`color-mix(in srgb, ${C_HEIGHT} 55%, #fff)`}
              fillLeft={`color-mix(in srgb, ${C_HEIGHT} 88%, #4d3208)`}
              fillRight={`color-mix(in srgb, ${C_HEIGHT} 68%, #4d3208)`} />
            <text x={bMid[0]} y={bMid[1] + 5} textAnchor="middle" fontWeight={900} fontSize={16} fill="#3d2a06">B = {t.B} {t.unit}²</text>
          </>
        )}
        {!t.B && (
          <>
            <text x={xMid[0]} y={xMid[1] + 26} textAnchor="middle" fontWeight={800} fontSize={15} fill="var(--bdb-ink)">{t.l} {t.unit}</text>
            <text x={zMid[0] + 30} y={zMid[1] + 18} textAnchor="middle" fontWeight={800} fontSize={15} fill="var(--bdb-ink)">{t.d} {t.unit}</text>
          </>
        )}
        <text x={hMid[0] + 34} y={hMid[1] + 5} textAnchor="middle" fontWeight={800} fontSize={15} fill="var(--bdb-ink)">{t.h} {t.unit}</text>
      </svg>
    );
  }

  const chainTotal = VOL_B * layers;
  const P0 = (x: number, z: number, y: number) => volPt(O, 1, x, z, y);

  return (
    <div>
      {/* ── build walk ── */}
      {(vPhase === "base" || vPhase === "tilt" || vPhase === "stack" || vPhase === "units" || vPhase === "bridge") && (
        <>
          <div className="ae-prompt">
            {vPhase === "base" && "First: how big is the floor?"}
            {vPhase === "tilt" && `The floor is done — B = ${VOL_B} square units.`}
            {vPhase === "stack" && (layers < VOL_ANCHOR.h ? "Stack the layers." : "The box is full.")}
            {vPhase === "units" && `${VOL_V} what?`}
            {vPhase === "bridge" && "Volume is layers of area."}
          </div>
          <div className="ae-sub">
            {vPhase === "base" && "This rectangle is about to become the bottom of a box."}
            {vPhase === "tilt" && "Lay it down so we can build on top of it."}
            {vPhase === "stack" && "Fill the dashed box. Every layer adds the whole floor again."}
            {vPhase === "units" && "Pick the unit that matches what we just counted."}
            {vPhase === "bridge" && "B is the area of ONE layer. The height counts the layers."}
          </div>

          <svg className="ae-svg" viewBox="0 0 560 344" role="img" aria-label="build a rectangular prism from its base">
            {/* dashed goal box */}
            {(vPhase === "stack" || vPhase === "units" || vPhase === "bridge") && (
              <g stroke="color-mix(in srgb, var(--bdb-ink) 38%, transparent)" strokeWidth={2}
                strokeDasharray={vPhase === "stack" && layers < VOL_ANCHOR.h ? "7 6" : "none"} fill="none">
                <polygon points={volPoly([P0(0, 0, VOL_ANCHOR.h), P0(VOL_ANCHOR.l, 0, VOL_ANCHOR.h), P0(VOL_ANCHOR.l, VOL_ANCHOR.d, VOL_ANCHOR.h), P0(0, VOL_ANCHOR.d, VOL_ANCHOR.h)])} />
                <line x1={P0(VOL_ANCHOR.l, 0, 0)[0]} y1={P0(VOL_ANCHOR.l, 0, 0)[1]} x2={P0(VOL_ANCHOR.l, 0, VOL_ANCHOR.h)[0]} y2={P0(VOL_ANCHOR.l, 0, VOL_ANCHOR.h)[1]} />
                <line x1={P0(0, VOL_ANCHOR.d, 0)[0]} y1={P0(0, VOL_ANCHOR.d, 0)[1]} x2={P0(0, VOL_ANCHOR.d, VOL_ANCHOR.h)[0]} y2={P0(0, VOL_ANCHOR.d, VOL_ANCHOR.h)[1]} />
                <line x1={P0(VOL_ANCHOR.l, VOL_ANCHOR.d, 0)[0]} y1={P0(VOL_ANCHOR.l, VOL_ANCHOR.d, 0)[1]} x2={P0(VOL_ANCHOR.l, VOL_ANCHOR.d, VOL_ANCHOR.h)[0]} y2={P0(VOL_ANCHOR.l, VOL_ANCHOR.d, VOL_ANCHOR.h)[1]} />
              </g>
            )}

            {/* the floor: flat rectangle that tilts down into the iso base */}
            <g style={{ transform: tilted ? tiltMatrix : "none", transition: "transform 1s var(--ae-carry)" }}>
              <rect x={FLAT[0]} y={FLAT[1]} width={VOL_ANCHOR.l * U} height={VOL_ANCHOR.d * U}
                fill="var(--bdb-card)" stroke="var(--bdb-ink)" strokeWidth={2.5} />
              {Array.from({ length: VOL_ANCHOR.l - 1 }, (_, i) => (
                <line key={`gx${i}`} x1={FLAT[0] + (i + 1) * U} y1={FLAT[1]} x2={FLAT[0] + (i + 1) * U} y2={FLAT[1] + VOL_ANCHOR.d * U}
                  stroke="var(--bdb-line)" strokeWidth={1.5} />
              ))}
              {Array.from({ length: VOL_ANCHOR.d - 1 }, (_, j) => (
                <line key={`gy${j}`} x1={FLAT[0]} y1={FLAT[1] + (j + 1) * U} x2={FLAT[0] + VOL_ANCHOR.l * U} y2={FLAT[1] + (j + 1) * U}
                  stroke="var(--bdb-line)" strokeWidth={1.5} />
              ))}
            </g>

            {/* flat-phase edge labels and counting (outside the tilting group so text never skews) */}
            {!tilted && (
              <g>
                <text x={FLAT[0] + (VOL_ANCHOR.l * U) / 2} y={FLAT[1] + VOL_ANCHOR.d * U + 28} textAnchor="middle" fontWeight={800} fontSize={16} fill="var(--bdb-ink)">
                  {VOL_ANCHOR.l} units
                </text>
                <text x={FLAT[0] - 16} y={FLAT[1] + (VOL_ANCHOR.d * U) / 2 + 5} textAnchor="end" fontWeight={800} fontSize={16} fill="var(--bdb-ink)">
                  {VOL_ANCHOR.d} units
                </text>
                {showBaseCount && Array.from({ length: VOL_B }, (_, n) => {
                  const cx = FLAT[0] + (n % VOL_ANCHOR.l) * U + U / 2;
                  const cy = FLAT[1] + Math.floor(n / VOL_ANCHOR.l) * U + U / 2;
                  return (
                    <text key={n} x={cx} y={cy + 6} textAnchor="middle" fontWeight={900} fontSize={17} fill="var(--bdb-teal)"
                      className="ae-count-cell" style={{ animationDelay: `${n * 0.05}s` }}>{n + 1}</text>
                  );
                })}
              </g>
            )}

            {/* stacked layers */}
            {(vPhase === "stack" || vPhase === "units" || vPhase === "bridge") &&
              Array.from({ length: layers }, (_, i) => (
                <VolSlab key={i} o={O} s={1} l={VOL_ANCHOR.l} d={VOL_ANCHOR.d} y0={i} y1={i + 1} grid className="ae-count-cell" />
              ))}

            {/* cube numbers on the first layer while it is alone */}
            {vPhase === "stack" && layers === 1 &&
              Array.from({ length: VOL_B }, (_, n) => {
                const p = P0((n % VOL_ANCHOR.l) + 0.5, Math.floor(n / VOL_ANCHOR.l) + 0.5, 1);
                return (
                  <text key={n} x={p[0]} y={p[1] + 5} textAnchor="middle" fontWeight={900} fontSize={13} fill="var(--bdb-ink)"
                    className="ae-count-cell" style={{ animationDelay: `${0.25 + n * 0.045}s` }}>{n + 1}</text>
                );
              })}

            {/* iso-phase labels */}
            {(vPhase === "stack" || vPhase === "units" || vPhase === "bridge") && (
              <g fontWeight={800} fontSize={15} fill="var(--bdb-ink)">
                <text x={P0(VOL_ANCHOR.l / 2, VOL_ANCHOR.d, 0)[0]} y={P0(VOL_ANCHOR.l / 2, VOL_ANCHOR.d, 0)[1] + 30} textAnchor="middle">
                  B = {VOL_B} square units
                </text>
                <text x={P0(VOL_ANCHOR.l, 0, VOL_ANCHOR.h / 2)[0] + 40} y={P0(VOL_ANCHOR.l, 0, VOL_ANCHOR.h / 2)[1] + 5} textAnchor="middle">
                  h = {VOL_ANCHOR.h}
                </text>
              </g>
            )}
          </svg>

          {vPhase === "base" && (
            <div className="ae-formula">
              <span>The floor:</span>
              {WALK_SLOTS.map((s2, i) => (
                <span key={s2.ghost} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {i === 1 && <span>{"×"}</span>}
                  {i === 2 && <span>=</span>}
                  {i < walkSlot && <span className="ae-slot ok" style={{ background: C_BASE, borderColor: C_BASE }}>{s2.val}</span>}
                  {i === walkSlot && (
                    <input className="ae-slotin" value={entry} inputMode="numeric" placeholder={s2.ghost} autoFocus
                      aria-label={s2.ghost}
                      onChange={(ev) => { setEntry(ev.target.value.replace(/\D/g, "")); }}
                      onKeyDown={(ev) => ev.key === "Enter" && submitWalkSlot()} />
                  )}
                  {i > walkSlot && <span className="ae-slot dim"><span className="ghost">{s2.ghost}</span></span>}
                </span>
              ))}
              <span>square units</span>
              <button className="ae-btn" disabled={!entry.trim()} onClick={submitWalkSlot}>Enter</button>
            </div>
          )}

          {vPhase === "tilt" && (
            <div className="ae-bar">
              <button className="ae-btn" onClick={layDown} disabled={tilted}>Lay it down</button>
            </div>
          )}

          {vPhase === "stack" && (
            <>
              <div className="ae-formula" aria-live="polite">
                {layers === 0 && <span style={{ color: "var(--bdb-ink-faint)" }}>Add the first layer</span>}
                {Array.from({ length: layers }, (_, i) => (
                  <span key={i} className="ae-vterm">{i > 0 ? `+ ${VOL_B}` : `${VOL_B}`}</span>
                ))}
                {layers > 0 && <span>= {chainTotal}</span>}
              </div>
              <div className="ae-bar">
                <button className="ae-btn" onClick={() => setLayers(layers + 1)} disabled={layers >= VOL_ANCHOR.h}>Add a layer</button>
                <button className="ae-btn ghost" onClick={() => setLayers(Math.max(0, layers - 1))} disabled={layers === 0 || layers >= VOL_ANCHOR.h}>Take one off</button>
              </div>
            </>
          )}

          {vPhase === "units" && (
            <>
              <div className="ae-formula">
                <span key="collapsed" className="ae-vterm">{VOL_ANCHOR.h} layers {"×"} {VOL_B} = {VOL_V}</span>
              </div>
              <div className="ae-unitchips">
                <button className="ae-uchip" onClick={() => pickWalkUnit("plain")}>{VOL_V} units</button>
                <button className="ae-uchip" onClick={() => pickWalkUnit("sq")}>{VOL_V} units{"²"}</button>
                <button className="ae-uchip" onClick={() => pickWalkUnit("cu")}>{VOL_V} units{"³"}</button>
              </div>
            </>
          )}

          {vPhase === "bridge" && (
            <div className="ae-done">
              <div className="eq">V = B {"×"} h = {VOL_B} {"×"} {VOL_ANCHOR.h} = {VOL_V} units{"³"}</div>
              <div className="eq" style={{ fontSize: "clamp(1.1rem,3.4vw,1.7rem)", color: "var(--bdb-ink-soft)" }}>
                V = l {"×"} w {"×"} h = {VOL_ANCHOR.l} {"×"} {VOL_ANCHOR.d} {"×"} {VOL_ANCHOR.h} = {VOL_V} units{"³"}
              </div>
              <p className="ae-why">
                Both formulas count every cube exactly once. l {"×"} w is the floor — that is B.
                Multiplying by h stacks the floor h times.
              </p>
              <div className="ae-bar">
                <button className="ae-btn" onClick={() => setVPhase("solve")}>Start the problems</button>
                <button className="ae-btn ghost" onClick={resetWalk}>Rebuild it</button>
              </div>
            </div>
          )}

          {vPhase !== "bridge" && (
            <div className="ae-bar">
              <button className="ae-link" onClick={() => setVPhase("solve")}>Skip to the problems</button>
            </div>
          )}
        </>
      )}

      {/* ── solve tasks ── */}
      {(vPhase === "solve" || vPhase === "tdone") && tIdx < VOL_TASKS.length && (
        <>
          <div className="ae-ptask">Task {tIdx + 1} of {VOL_TASKS.length} {"—"} {task.title}</div>
          <div className="ae-prompt">
            {vPhase === "tdone" ? `Task ${tIdx + 1} complete` : task.B ? "Use V = B × h." : "Use V = l × w × h."}
          </div>
          <div className="ae-sub">{vPhase === "tdone" ? "Nice. Lock it in on your card." : task.note}</div>

          <TaskPrism t={task} />

          {vPhase === "solve" && (
            <>
              <div className="ae-formula">
                <span>V =</span>
                {taskSlots.map((s2, i) => (
                  <span key={s2.ghost} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    {i > 0 && i < taskSlots.length - 1 && <span>{"×"}</span>}
                    {i === taskSlots.length - 1 && <span>=</span>}
                    {i < tSlot && <span className="ae-slot ok" style={{ background: C_BASE, borderColor: C_BASE }}>{s2.val}</span>}
                    {i === tSlot && (
                      <input className="ae-slotin" value={entry} inputMode="numeric" placeholder={s2.ghost} autoFocus
                        aria-label={s2.ghost}
                        onChange={(ev) => { setEntry(ev.target.value.replace(/\D/g, "")); }}
                        onKeyDown={(ev) => ev.key === "Enter" && submitTaskSlot()} />
                    )}
                    {i > tSlot && <span className="ae-slot dim"><span className="ghost">{s2.ghost}</span></span>}
                  </span>
                ))}
                {tSlot < taskSlots.length && (
                  <button className="ae-btn" disabled={!entry.trim()} onClick={submitTaskSlot}>Enter</button>
                )}
              </div>
              {tSlot >= taskSlots.length && (
                <>
                  <div className="ae-sub" style={{ marginTop: 8 }}>{taskV} what?</div>
                  <div className="ae-unitchips">
                    <button className="ae-uchip" onClick={() => pickTaskUnit("plain")}>{taskV} {task.unit}</button>
                    <button className="ae-uchip" onClick={() => pickTaskUnit("sq")}>{taskV} {task.unit}{"²"}</button>
                    <button className="ae-uchip" onClick={() => pickTaskUnit("cu")}>{taskV} {task.unit}{"³"}</button>
                  </div>
                </>
              )}
            </>
          )}

          {vPhase === "tdone" && (
            <div className="ae-done">
              <div className="eq">
                {task.B
                  ? `V = ${task.B} × ${task.h} = ${taskV} ${task.unit}³`
                  : `V = ${task.l} × ${task.d} × ${task.h} = ${taskV} ${task.unit}³`}
              </div>
              <div className="ae-bar">
                <button className="ae-btn" onClick={nextTask}>
                  {tIdx + 1 < VOL_TASKS.length ? "Next problem" : "Finish"}
                </button>
              </div>
            </div>
          )}

          {vPhase === "solve" && (
            <div className="ae-bar">
              <button className="ae-link" onClick={resetWalk}>Rebuild the box first</button>
            </div>
          )}
        </>
      )}

      {/* ── completion ── */}
      {vPhase === "complete" && (
        <>
          <div className="ae-prompt">Volume practice complete</div>
          <div className="ae-sub">M1.T2.L3 {"—"} Length, Width, and Depth</div>
          <div className="ae-plist">
            {VOL_TASKS.map((t, i) => (
              <div key={t.problemId} className="ae-prow">
                <span className="ae-prow-name">{t.title}</span>
                <span className={`ae-prow-res ${tResults[i]?.firstTry ? "good" : ""}`}>
                  {tResults[i] ? (tResults[i]!.firstTry ? "First try" : `Retried ${tResults[i]!.wrongs}x`) : "—"}
                </span>
              </div>
            ))}
          </div>
          {tConfirmedAt ? (
            <div className="ae-pconfirm on">
              Practice confirmed {new Date(tConfirmedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.
              Show this screen to Mr. Wilson.
            </div>
          ) : (
            <div className="ae-bar">
              <button className="ae-btn" onClick={() => setTConfirmedAt(new Date().toISOString())}>Confirm my practice is complete</button>
            </div>
          )}
          <div className="ae-bar">
            <button className="ae-link" onClick={restartProblems}>Start the problems over</button>
            <button className="ae-link" onClick={resetWalk}>Rebuild the box</button>
          </div>
        </>
      )}

      <div className="ae-note">{note && <span key={note} className="ae-note-in">{note}</span>}</div>
    </div>
  );
}
