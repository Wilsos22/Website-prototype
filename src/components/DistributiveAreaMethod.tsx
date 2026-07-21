"use client";

// Distributive Area Method — split ONE factor of a x b, then write that same
// move in symbols directly UNDER the picture. The side factor stays a single
// "outside" group; the top factor gets cut into two parts. The rectangle is the
// picture; the equation chain below it is the work:
//
//        a ( __ + __ )
//      = a ( __ ) + a ( __ )
//      = __ + __
//      = __
//
// The student plugs the parts into the skeleton, then solves it one step at a
// time — and each solved product drops into its own region on the model, so the
// two representations move together. No detour screen, no answer typed twice.
//
// Lesson mode runs a teacher-set series of problems, which can arrive three
// ways (all the same "24x7,16x8" string, see lib/distributiveProblems):
//   1. the Distributive Area Method state in /control, published to the live
//      session — joined devices pick it up and start the series;
//   2. a ?set= link, for a Notion step or a handout;
//   3. the built-in builder on this page, for setting one up on the spot.
// Tap-to-split (pointer/touch, no hover), squared corners, a unit grid — on
// purpose.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { reportToolResult } from "@/lib/toolEvidence";
import { useLiveToolConfig } from "./useLiveToolConfig";
import {
  parseDistributiveSet,
  serializeDistributiveSet,
  DISTRIBUTIVE_MAX_PROBLEMS,
  DISTRIBUTIVE_TOP_MIN,
  DISTRIBUTIVE_TOP_MAX,
  DISTRIBUTIVE_SIDE_MIN,
  DISTRIBUTIVE_SIDE_MAX,
  type DistributiveProblem,
} from "@/lib/distributiveProblems";

type Phase = "enter" | "setup" | "split" | "work" | "done" | "wrap";
const TEAL = "#50a3a4";
const AMBER = "#fcaf38";
const LESSON_KEY = "bdm-distributive-lesson-v1";

type Problem = DistributiveProblem;
interface Result { top: number; side: number; total: number; misses: number }
interface Region { id: number; tw: number; th: number; color: string; x: number; w: number }
interface Arcs { w: number; h: number; b: string; c: string; endB: { x: number; y: number }; endC: { x: number; y: number } }

// Slot layout of the equation chain. Index -> which step fills it.
//   0,1  parts inside the first parentheses
//   2,3  the same parts, distributed
//   4    first product      5  second product      6  total
const SLOT_STEP = [0, 0, 1, 1, 2, 3, 4];
const STEP_SLOTS: number[][] = [[0, 1], [2, 3], [4], [5], [6]];
const LAST_STEP = 4;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
// Free entry allows a 2, which splits into 1 + 1; a teacher-set series starts at
// DISTRIBUTIVE_TOP_MIN so no problem in a lesson is degenerate.
const TOP_MIN = 2, TOP_MAX = DISTRIBUTIVE_TOP_MAX, SIDE_MIN = DISTRIBUTIVE_SIDE_MIN, SIDE_MAX = DISTRIBUTIVE_SIDE_MAX;

// The model is the anchor, so it gets the room: as wide as its container allows
// (measured, not assumed — window.innerWidth lies inside embedded previews and
// under browser zoom). Height is budgeted against the viewport so the equation
// chain under it still lands above the fold on a laptop or an iPad.
function cellSize(top: number, side: number, w: number, h: number) {
  const wBudget = clamp(w - 70, 230, 900); // 70 = the stage's side-label gutter plus slack
  const hBudget = clamp(h - 460, 150, 360);
  return clamp(Math.floor(Math.min(wBudget / top, hBudget / side)), 9, 46);
}

// Where in a set to pick up — a reload mid-series (a dropped Chromebook, a
// student rejoining) should not send them back to problem one.
function resumeIndex(ps: Problem[]): number {
  try {
    const saved = JSON.parse(window.localStorage.getItem(LESSON_KEY) || "null");
    if (saved && saved.sig === serializeDistributiveSet(ps)) {
      return clamp(Math.round(Number(saved.idx) || 0), 0, ps.length - 1);
    }
  } catch { /* storage unavailable — the set still runs, it just starts at one */ }
  return 0;
}

// Prefill for the lesson builder — sensible 2-digit x 1-digit problems the
// teacher can type over. Each one has an obvious ten to pull out.
const FILLER: Problem[] = [
  { top: 14, side: 6 }, { top: 18, side: 5 }, { top: 24, side: 7 }, { top: 32, side: 4 },
  { top: 16, side: 8 }, { top: 27, side: 3 }, { top: 35, side: 6 }, { top: 23, side: 9 },
  { top: 19, side: 7 }, { top: 28, side: 5 }, { top: 36, side: 4 }, { top: 15, side: 8 },
];
const DEFAULT_SET: Problem[] = FILLER.slice(0, 4);

export default function DistributiveAreaMethod() {
  const [phase, setPhase] = useState<Phase>("enter");
  const [top, setTop] = useState(18);   // horizontal — the factor that gets split into (b + c)
  const [side, setSide] = useState(6);  // vertical — one single group, the outside factor "a"
  const [inTop, setInTop] = useState("18");
  const [inSide, setInSide] = useState("6");

  const [topSplit, setTopSplit] = useState<number | null>(null); // committed cut
  const [pending, setPending] = useState<number | null>(null);   // tapped, not yet locked
  const [hoverCut, setHoverCut] = useState<number | null>(null); // fine-pointer live preview

  const [step, setStep] = useState(0);
  const [vals, setVals] = useState<string[]>(() => Array(7).fill(""));
  const [wrongSlots, setWrongSlots] = useState<number[]>([]);
  const [misses, setMisses] = useState(0);
  const [stepMisses, setStepMisses] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [arcs, setArcs] = useState<Arcs | null>(null);
  const [finePointer, setFinePointer] = useState(false); // mouse/pen: safe to autofocus; touch: let the student tap so the soft keyboard does not cover the work
  const [view, setView] = useState({ w: 980, h: 800 });

  // lesson series
  const [lesson, setLesson] = useState<Problem[] | null>(null);
  const [lIdx, setLIdx] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [draft, setDraft] = useState<Problem[]>(DEFAULT_SET);
  const [copied, setCopied] = useState(false);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rectRef = useRef<HTMLDivElement | null>(null);
  const workRef = useRef<HTMLDivElement | null>(null);
  const r1OutRef = useRef<HTMLSpanElement | null>(null);
  const r2aRef = useRef<HTMLSpanElement | null>(null);
  const r2bRef = useRef<HTMLSpanElement | null>(null);
  const slotRefs = useRef<(HTMLInputElement | null)[]>([]);
  const draggingRef = useRef(false);
  const reportedRef = useRef(false);
  const missTagRef = useRef<string | null>(null);

  const cell = useMemo(() => cellSize(top, side, view.w, view.h), [top, side, view]);

  const a = side;
  const b = topSplit ?? 0;
  const c = topSplit != null ? top - topSplit : 0;
  const expected = useMemo(() => [b, c, b, c, a * b, a * c, a * b + a * c], [a, b, c]);
  const total = top * side;

  const regions: Region[] = useMemo(() => {
    if (topSplit == null) return [];
    return [
      { id: 0, tw: b, th: side, color: TEAL, x: 0, w: b * cell },
      { id: 1, tw: c, th: side, color: AMBER, x: b * cell, w: c * cell },
    ];
  }, [topSplit, b, c, side, cell]);

  const beginProblem = useCallback((t: number, s: number) => {
    setTop(t); setSide(s); setInTop(String(t)); setInSide(String(s));
    setTopSplit(null); setPending(null); setHoverCut(null);
    setStep(0); setVals(Array(7).fill("")); setWrongSlots([]);
    setMisses(0); setStepMisses(0); setNote(null); setArcs(null);
    reportedRef.current = false;
    missTagRef.current = null;
    setPhase("split");
  }, []);

  const startSingle = useCallback(() => {
    setLesson(null); setResults([]);
    beginProblem(
      clamp(Math.round(Number(inTop) || 0), TOP_MIN, TOP_MAX),
      clamp(Math.round(Number(inSide) || 0), SIDE_MIN, SIDE_MAX),
    );
  }, [inTop, inSide, beginProblem]);

  const startLesson = useCallback((ps: Problem[], at = 0) => {
    if (!ps.length) return;
    const i = clamp(at, 0, ps.length - 1);
    setLesson(ps); setLIdx(i); setResults([]);
    beginProblem(ps[i].top, ps[i].side);
  }, [beginProblem]);

  const randomProblem = useCallback(
    () => beginProblem(11 + Math.floor(Math.random() * 20), 3 + Math.floor(Math.random() * 6)),
    [beginProblem],
  );

  useEffect(() => { setFinePointer(window.matchMedia?.("(pointer: fine)").matches ?? false); }, []);

  useEffect(() => {
    const el = wrapRef.current;
    const measure = () => setView({
      w: el?.clientWidth || document.documentElement.clientWidth,
      h: document.documentElement.clientHeight,
    });
    measure();
    const ro = el && typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (el && ro) ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro?.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  // Pick up a series the teacher published from the control panel. Keyed on the
  // config id, not the whole object, so the 1s poll behind useLiveToolConfig
  // does not restart the problem under a student mid-answer. Re-publishing the
  // same numbers resumes where each device left off; changing the numbers
  // starts the new set. An empty set is respected as "let them pick their own"
  // rather than forcing a lesson.
  const liveTool = useLiveToolConfig("/distributive-area");
  const liveToolId = liveTool?.id;
  useEffect(() => {
    if (!liveTool || liveTool.route !== "/distributive-area") return;
    const ps = parseDistributiveSet(liveTool.config.set);
    if (!ps.length) return;
    setDraft(ps);
    startLesson(ps, resumeIndex(ps));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveToolId]);

  // A teacher-built series also arrives in the URL (?set=18x6,24x7) so it can be
  // pasted into Notion or handed out as a link. Progress resumes on reload.
  useEffect(() => {
    const ps = parseDistributiveSet(new URLSearchParams(window.location.search).get("set"));
    if (!ps.length) return;
    setDraft(ps);
    startLesson(ps, resumeIndex(ps));
  }, [startLesson]);

  useEffect(() => {
    if (!lesson) return;
    try { window.localStorage.setItem(LESSON_KEY, JSON.stringify({ sig: serializeDistributiveSet(lesson), idx: lIdx })); }
    catch { /* progress just will not survive a reload */ }
  }, [lesson, lIdx]);

  // Focus the first open slot of the step (mouse/pen only).
  useEffect(() => {
    if (phase !== "work" || !finePointer) return;
    const first = STEP_SLOTS[step]?.[0];
    if (first != null) slotRefs.current[first]?.focus();
  }, [phase, step, finePointer]);

  // Measure the distribute arcs so they land exactly on the outside factors.
  useLayoutEffect(() => {
    if (phase !== "work" || step !== 1) { setArcs(null); return; }
    const measure = () => {
      const work = workRef.current, o = r1OutRef.current, e0 = r2aRef.current, e1 = r2bRef.current;
      if (!work || !o || !e0 || !e1) return;
      const pb = work.getBoundingClientRect();
      const ob = o.getBoundingClientRect();
      const eb0 = e0.getBoundingClientRect();
      const eb1 = e1.getBoundingClientRect();
      const ox = ob.left + ob.width / 2 - pb.left, oy = ob.bottom - pb.top;
      const x0 = eb0.left + eb0.width / 2 - pb.left, y0 = eb0.top - pb.top - 2;
      const x1 = eb1.left + eb1.width / 2 - pb.left, y1 = eb1.top - pb.top - 2;
      // On a narrow phone the row wraps and the two terms land at different
      // heights — skip the arcs rather than draw a curve that loops back.
      if (Math.abs(y0 - y1) > 24) { setArcs(null); return; }
      setArcs({
        w: pb.width, h: pb.height,
        b: `M ${ox} ${oy} Q ${x0} ${oy} ${x0} ${y0}`,
        c: `M ${ox} ${oy} Q ${x1} ${oy} ${x1} ${y1}`,
        endB: { x: x0, y: y0 }, endC: { x: x1, y: y1 },
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [phase, step]);

  // Split interaction. On a mouse/pen the cut previews under the cursor and a
  // click locks it. On touch (no hover) you drag to place a pending cut, then
  // tap Lock. Cuts snap to the nearest gridline.
  const columnAt = (clientX: number): number | null => {
    const r = rectRef.current?.getBoundingClientRect();
    if (!r) return null;
    return clamp(Math.round((clientX - r.left) / cell), 1, top - 1);
  };
  const commitSplit = (col: number) => { setTopSplit(col); setPending(null); setHoverCut(null); setPhase("work"); };
  const onRectDown = (e: React.PointerEvent) => {
    if (phase !== "split") return;
    if (finePointer) {
      const col = columnAt(e.clientX);
      if (col != null) commitSplit(col); // hover already showed it — the click locks it
      return;
    }
    draggingRef.current = true;
    rectRef.current?.setPointerCapture?.(e.pointerId);
    setPending(columnAt(e.clientX));
  };
  const onRectMove = (e: React.PointerEvent) => {
    if (phase !== "split") return;
    if (draggingRef.current) { setPending(columnAt(e.clientX)); return; }
    if (finePointer) setHoverCut(columnAt(e.clientX));
  };
  const onRectUp = () => { draggingRef.current = false; };
  const onRectLeave = () => { setHoverCut(null); };

  const setVal = (i: number, raw: string) => {
    setVals((prev) => { const next = [...prev]; next[i] = raw.replace(/\D/g, ""); return next; });
    setWrongSlots((prev) => prev.filter((s) => s !== i));
    setNote(null);
  };

  const finishProblem = useCallback((missCount: number) => {
    if (!reportedRef.current) {
      reportedRef.current = true;
      reportToolResult({
        tool: "distributive-area",
        correct: missCount === 0,
        standardId: "6.EE.A.3",
        misconception: missCount === 0 ? null : missTagRef.current,
        problemId: `${top}x${side}`,
      });
    }
    // Indexed by position in the set, so re-running a problem replaces its row
    // instead of adding a second one.
    setResults((prev) => {
      const next = [...prev];
      next[lesson ? lIdx : prev.length] = { top, side, total, misses: missCount };
      return next;
    });
    setPhase("done");
  }, [top, side, total, lesson, lIdx]);

  // One step at a time, with feedback aimed at what the wrong number actually
  // means rather than a bare "try again".
  const checkStep = useCallback(() => {
    const slots = STEP_SLOTS[step];
    if (!slots) return;
    if (slots.some((i) => vals[i].trim() === "")) {
      setNote(slots.length > 1 ? "Fill in both blanks." : "Type your answer.");
      return;
    }
    const bad = slots.filter((i) => Number(vals[i]) !== expected[i]);
    if (bad.length === 0) {
      setWrongSlots([]); setNote(null); setStepMisses(0);
      if (step === LAST_STEP) { finishProblem(misses); return; }
      setStep(step + 1);
      return;
    }

    const nextMiss = misses + 1;
    setMisses(nextMiss);
    setStepMisses(stepMisses + 1);
    setWrongSlots(bad);

    const v = slots.map((i) => Number(vals[i]));
    if (step === 0 || step === 1) {
      if (v.length === 2 && v[0] === c && v[1] === b) {
        setNote("Right numbers, wrong order. Match the rectangle: the left part first.");
      } else if (v.includes(a)) {
        setNote(`The ${a} is already outside the parentheses. Inside goes a part of the ${top}.`);
      } else if (v.includes(top)) {
        setNote(`The ${top} is the whole side. You cut it into ${b} and ${c}.`);
      } else if (v.includes(a * b) || v.includes(a * c)) {
        setNote("Not yet — this line still just names the parts. The multiplying comes next.");
      } else {
        setNote(`Read the two numbers above the rectangle: ${b} and ${c}.`);
      }
    } else if (step === 2 || step === 3) {
      const part = step === 2 ? b : c;
      const other = step === 2 ? c : b;
      const got = v[0];
      if (got === a + part) {
        setNote(`That is ${a} plus ${part}. This piece is ${a} rows of ${part}.`);
      } else if (got === total) {
        setNote("That is the whole rectangle. This step is only one piece of it.");
      } else if (got === a * other) {
        setNote(`That is the other piece. This one is ${a} x ${part}.`);
        missTagRef.current = "distributes to first term only";
      } else if (stepMisses >= 1 && a >= 10) {
        setNote(`Not yet. Break the ${a} up too: ${a} x ${part} is (${Math.floor(a / 10) * 10} x ${part}) + (${a % 10} x ${part}).`);
      } else {
        setNote(`Not yet — count the highlighted piece: ${a} rows of ${part}.`);
      }
    } else {
      const got = v[0];
      if (got === a * b || got === a * c) {
        setNote("That is one of the products. Add both of them together.");
      } else if (got === a * b + c || got === a * c + b) {
        setNote("Add the two products, not a product and a part.");
        missTagRef.current = "distributes to first term only";
      } else {
        setNote(`Add ${a * b} and ${a * c} again.`);
      }
    }
  }, [step, vals, expected, misses, stepMisses, a, b, c, top, total, finishProblem]);

  const onSlotKey = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key !== "Enter") return;
    const slots = STEP_SLOTS[step] || [];
    const nextEmpty = slots.find((s) => s !== i && vals[s].trim() === "");
    if (nextEmpty != null) { slotRefs.current[nextEmpty]?.focus(); return; }
    checkStep();
  };

  const back = useCallback(() => {
    setNote(null); setWrongSlots([]); setStepMisses(0);
    if (phase === "done") { setStep(LAST_STEP); setPhase("work"); return; }
    if (phase === "work") {
      if (step > 0) {
        const prev = step - 1;
        setVals((v) => { const next = [...v]; STEP_SLOTS[prev].forEach((i) => { next[i] = ""; }); return next; });
        setStep(prev);
        return;
      }
      setVals(Array(7).fill(""));
      setTopSplit(null); setPending(null); setPhase("split");
      return;
    }
    if (phase === "split" && !lesson) setPhase("enter");
  }, [phase, step, lesson]);

  const restartProblem = useCallback(() => beginProblem(top, side), [beginProblem, top, side]);

  const nextInLesson = useCallback(() => {
    if (!lesson) return;
    const n = lIdx + 1;
    if (n >= lesson.length) { setPhase("wrap"); return; }
    setLIdx(n);
    beginProblem(lesson[n].top, lesson[n].side);
  }, [lesson, lIdx, beginProblem]);

  const copyLink = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}?set=${encodeURIComponent(serializeDistributiveSet(draft))}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { window.prompt("Copy this link for your students:", url); }
  }, [draft]);

  // Delta, not an absolute count — two taps in the same React batch would both
  // read the same stale length and only move the list by one.
  const stepDraftCount = (delta: number) => {
    setDraft((prev) => {
      const want = clamp(prev.length + delta, 1, Math.min(FILLER.length, DISTRIBUTIVE_MAX_PROBLEMS));
      if (want <= prev.length) return prev.slice(0, want);
      const out = [...prev];
      while (out.length < want) out.push(FILLER[out.length]);
      return out;
    });
  };
  const setDraftValue = (i: number, key: keyof Problem, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    setDraft((prev) => prev.map((p, j) => (j === i ? { ...p, [key]: digits === "" ? 0 : Number(digits) } : p)));
  };
  const draftReady = draft.every((p) => p.top >= DISTRIBUTIVE_TOP_MIN && p.top <= TOP_MAX && p.side >= SIDE_MIN && p.side <= SIDE_MAX);

  const splitParts: [number, number] | null =
    pending != null ? [pending, top - pending] : topSplit != null ? [topSplit, top - topSplit] : null;

  // Two smart strategies earn tailored praise: pulling out a ten (place value)
  // and an even split you can double (24 into 12 + 12). Everything else gets a
  // nudge toward one of them — an arbitrary cut like 15 into 7 + 8 is not easier.
  const hasTen = b % 10 === 0 || c % 10 === 0;
  const isDouble = b === c;
  const doneReflect = hasTen
    ? `That is the distributive property. Pulling a ten out of the ${top} makes each product quick to do in your head.`
    : isDouble
    ? `That is the distributive property — and splitting the ${top} in half is a smart move. Both pieces are ${side} x ${b}, so you can work one out and double it.`
    : `That is the distributive property — it works with any split. But ${b} and ${c} were not the easiest to multiply. Try pulling out a ten, or splitting into two equal parts you can double.`;

  const shownStep = phase === "done" ? LAST_STEP + 1 : step;
  const activeRegion = phase === "work" && (step === 2 || step === 3) ? step - 2 : -1;

  const slot = (i: number, tone: "teal" | "amber" | "ink") => {
    const state = SLOT_STEP[i] < shownStep ? "locked" : SLOT_STEP[i] === shownStep ? "active" : "waiting";
    return (
      <input
        key={i}
        ref={(el) => { slotRefs.current[i] = el; }}
        className={`da-slot ${tone} ${state} ${wrongSlots.includes(i) ? "wrong" : ""}`}
        value={vals[i]}
        inputMode="numeric"
        readOnly={state !== "active"}
        tabIndex={state === "active" ? 0 : -1}
        aria-label={SLOT_STEP[i] <= 1 ? "part" : "product"}
        onChange={(e) => setVal(i, e.target.value)}
        onKeyDown={(e) => onSlotKey(e, i)}
      />
    );
  };

  const prompts: [string, string][] = [
    ["Write the two parts inside the parentheses", `The ${a} stays outside — it multiplies whatever is in there.`],
    [`The ${a} multiplies each part`, "Give each part its own set of parentheses."],
    ["Solve the first piece", `That is the highlighted piece: ${a} rows of ${b}.`],
    ["Now the second piece", `${a} rows of ${c}.`],
    ["Add the two pieces", "Two products, one whole rectangle."],
  ];

  return (
    <div className="da-wrap" ref={wrapRef}>
      <style>{`
        .da-wrap { --da-carry:cubic-bezier(.34,.8,.3,1); --da-settle:cubic-bezier(.2,.8,.3,1); font-family:var(--bdb-font); color:var(--bdb-ink); max-width:1040px; margin:0 auto; padding:8px clamp(10px,3vw,20px) 26px; }
        .da-live { max-width:640px; margin:0 auto 10px; padding:8px 14px; border:1px solid var(--bdb-line); border-left:4px solid var(--bdb-amber); border-radius:8px; background:var(--bdb-card); text-align:center; }
        .da-live .lbl { display:block; color:var(--bdb-ink-faint); font-size:0.7rem; font-weight:800; letter-spacing:0.09em; text-transform:uppercase; }
        .da-live div { color:var(--bdb-ink); font-weight:700; line-height:1.4; }
        .da-prompt { text-align:center; font-size:clamp(1.1rem,3.2vw,1.5rem); font-weight:800; margin:0 0 2px; min-height:30px; }
        .da-sub { text-align:center; color:var(--bdb-ink-soft); font-size:0.9rem; margin:0 0 8px; min-height:18px; }
        .da-enter { display:flex; gap:10px; align-items:center; justify-content:center; margin:24px 0 6px; flex-wrap:wrap; }
        .da-in { width:84px; font:inherit; font-size:1.6rem; font-weight:800; text-align:center; padding:8px; border:2px solid var(--bdb-line); border-radius:12px; background:var(--bdb-card); color:var(--bdb-ink); }
        .da-x { font-size:1.6rem; font-weight:800; color:var(--bdb-ink-soft); }
        .da-tip { text-align:center; color:var(--bdb-ink-faint); font-size:0.82rem; margin:8px 0 0; }
        .da-teacher { margin:30px auto 0; padding-top:16px; border-top:1px dashed var(--bdb-line); max-width:520px; text-align:center; }
        .da-teacher .lbl { color:var(--bdb-ink-faint); font-size:0.78rem; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; }

        .da-stage { position:relative; margin:0 auto; width:max-content; max-width:100%; padding:42px 0 0 44px; }
        .da-rect { position:relative; border:3px solid var(--bdb-ink); border-radius:0; touch-action:none; }
        .da-rect.cutting { cursor:crosshair; }
        .da-toplbl { position:absolute; top:4px; height:36px; font-weight:900; }
        .da-abs { position:absolute; top:2px; white-space:nowrap; }
        .da-sidelbl { position:absolute; left:6px; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:1.8rem; color:var(--bdb-ink); }
        .da-single { font-size:1.9rem; color:var(--bdb-ink); }
        .da-lp { color:var(--bdb-ink-soft); font-size:1.6rem; }
        .da-pa { font-size:2rem; font-weight:900; line-height:1; }
        .da-line { position:absolute; background:var(--bdb-coral); z-index:5; pointer-events:none; }
        .da-line-ghost { opacity:0.4; }
        .da-region { position:absolute; top:0; bottom:0; border-radius:0; display:grid; place-items:center; text-align:center; transition:background 220ms ease, outline-color 180ms ease; outline:3px solid transparent; outline-offset:-3px; }
        .da-region.on { outline-color:var(--bdb-ink); }
        .da-region.solved .da-prod { animation:daDrop 340ms var(--da-settle); }
        @keyframes daDrop { from { transform:translateY(-12px) scale(1.25); opacity:0; } to { transform:none; opacity:1; } }
        .da-dims { font-weight:800; font-size:1rem; color:var(--bdb-ink); opacity:0.72; }
        .da-prod { font-weight:900; font-size:clamp(1.3rem,3vw,1.9rem); color:var(--bdb-ink); }

        .da-tools { display:flex; gap:8px; justify-content:center; margin-bottom:6px; flex-wrap:wrap; }
        .da-tbtn { font:inherit; font-weight:700; font-size:0.82rem; padding:6px 13px; border-radius:999px; border:1px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink-soft); cursor:pointer; }
        .da-tbtn:active, .da-tbtn:focus-visible { color:var(--bdb-ink); }
        .da-tbtn:disabled { opacity:0.4; cursor:not-allowed; }
        .da-bar { display:flex; gap:8px; justify-content:center; align-items:center; margin-top:10px; flex-wrap:wrap; }
        .da-btn { font:inherit; font-weight:700; font-size:0.9rem; padding:9px 16px; border-radius:11px; border:1px solid var(--bdb-line); background:var(--bdb-ink); color:#fff; cursor:pointer; }
        .da-btn.ghost { background:var(--bdb-card); color:var(--bdb-ink); }
        .da-btn:disabled { opacity:0.42; cursor:not-allowed; }
        .da-note { text-align:center; color:var(--bdb-coral); font-weight:700; font-size:0.95rem; min-height:20px; margin-top:6px; }
        .da-hint { color:var(--bdb-ink-faint); font-size:0.85rem; }

        .da-work { position:relative; width:min(660px,96vw); margin:10px auto 0; padding-top:10px; border-top:1px dashed var(--bdb-line); }
        /* one shared left edge so every equals sign stacks in a column, the way
           you would write the chain out by hand */
        .da-chain { width:max-content; max-width:100%; margin:0 auto; }
        .da-eqrow { position:relative; z-index:1; display:flex; flex-wrap:wrap; align-items:center; gap:5px; font-weight:900; font-size:clamp(1.2rem,4.2vw,1.75rem); line-height:1.35; margin:4px 0; }
        .da-lead { width:26px; text-align:right; color:var(--bdb-ink-soft); flex:none; }
        .da-out { display:inline-block; color:var(--bdb-ink); }
        .da-out.pulse { animation:daPulse .5s var(--da-settle); }
        @keyframes daPulse { 40% { transform:scale(1.16); } }
        .da-paren, .da-op { color:var(--bdb-ink-soft); font-weight:800; }
        .da-slot { width:72px; font:inherit; font-weight:900; font-size:0.86em; text-align:center; padding:4px 2px; border:2px solid var(--bdb-line); border-radius:0; background:var(--bdb-card); color:var(--bdb-ink); }
        .da-slot.waiting { opacity:0.32; }
        .da-slot.active { border-color:var(--bdb-ink); box-shadow:0 2px 0 var(--bdb-ink); }
        .da-slot.active:focus-visible { outline:3px solid color-mix(in srgb, var(--bdb-ink) 32%, transparent); outline-offset:2px; }
        .da-slot.locked.teal { color:#fff; background:${TEAL}; border-color:${TEAL}; }
        .da-slot.locked.amber { color:var(--bdb-ink); background:${AMBER}; border-color:${AMBER}; }
        .da-slot.locked.ink { color:#fff; background:var(--bdb-ink); border-color:var(--bdb-ink); }
        .da-slot.wrong { border-color:var(--bdb-coral); color:var(--bdb-coral); animation:daShake .3s; }
        @keyframes daShake { 25% { transform:translateX(-4px); } 75% { transform:translateX(4px); } }
        .da-fade { animation:daFade .32s ease both; }
        @keyframes daFade { from { opacity:0; } to { opacity:1; } }
        .da-reveal { animation:daRise .38s var(--da-settle) both; }
        @keyframes daRise { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }

        .da-arcsvg { position:absolute; left:0; top:0; z-index:0; pointer-events:none; overflow:visible; }
        .da-arc { fill:none; stroke:var(--bdb-coral); stroke-width:4; stroke-linecap:round; stroke-dasharray:1; stroke-dashoffset:1; }
        .da-arc.c1 { animation:daDraw .7s var(--da-carry) .12s forwards; }
        .da-arc.c2 { animation:daDraw .72s var(--da-carry) .3s forwards; }
        @keyframes daDraw { to { stroke-dashoffset:0; } }
        .da-arcdot { fill:var(--bdb-coral); opacity:0; }
        .da-arcdot.d1 { animation:daFade .2s ease .82s forwards; }
        .da-arcdot.d2 { animation:daFade .2s ease 1.02s forwards; }
        .da-carry { position:absolute; left:0; top:0; z-index:2; font-weight:900; font-size:1.1rem; color:var(--bdb-coral); pointer-events:none; offset-rotate:0deg; opacity:0; animation:daCarry .78s var(--da-carry) forwards; }
        @keyframes daCarry { 0% { offset-distance:0%; opacity:0; } 14% { opacity:1; } 80% { offset-distance:100%; opacity:1; } 100% { offset-distance:100%; opacity:0; } }

        .da-done { text-align:center; margin-top:14px; }
        .da-done .eq { font-size:clamp(1.2rem,3.6vw,1.7rem); font-weight:900; margin:4px 0; }
        .da-reflect { color:var(--bdb-ink-soft); font-size:0.95rem; max-width:470px; margin:8px auto 0; line-height:1.5; }
        .da-abstract { margin:14px auto 0; color:var(--bdb-ink-soft); font-weight:800; font-size:1.05rem; }
        .da-abstract .t { color:${TEAL}; } .da-abstract .m { color:${AMBER}; }

        .da-lbar { display:flex; align-items:center; justify-content:center; gap:10px; margin:0 0 10px; }
        .da-lbar .cnt { font-weight:800; font-size:0.82rem; color:var(--bdb-ink-soft); }
        .da-dots { display:flex; gap:5px; }
        .da-dot { width:9px; height:9px; border-radius:999px; background:var(--bdb-line); }
        .da-dot.done { background:${TEAL}; }
        .da-dot.now { background:var(--bdb-ink); }

        .da-setup { max-width:520px; margin:0 auto; }
        .da-row { display:flex; align-items:center; gap:8px; justify-content:center; margin:8px 0; }
        .da-row .n { width:22px; text-align:right; color:var(--bdb-ink-faint); font-weight:800; font-size:0.9rem; }
        .da-sin { width:66px; font:inherit; font-size:1.1rem; font-weight:800; text-align:center; padding:6px; border:2px solid var(--bdb-line); border-radius:9px; background:var(--bdb-card); color:var(--bdb-ink); }
        .da-sin.bad { border-color:var(--bdb-coral); }
        .da-row .lx { color:var(--bdb-ink-soft); font-weight:800; }
        .da-row .tag { color:var(--bdb-ink-faint); font-size:0.78rem; width:96px; }
        .da-step { display:flex; align-items:center; gap:10px; justify-content:center; margin:14px 0 6px; }
        .da-step button { font:inherit; font-weight:900; font-size:1.1rem; width:34px; height:34px; border-radius:9px; border:1px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink); cursor:pointer; }
        .da-heads { text-align:center; color:var(--bdb-ink-faint); font-size:0.76rem; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; margin-bottom:2px; }
        .da-wraplist { max-width:420px; margin:12px auto 0; }
        .da-wrow { display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border:1px solid var(--bdb-line); border-radius:10px; background:var(--bdb-card); margin-bottom:6px; font-weight:800; }
        .da-wrow .mark { font-size:0.8rem; font-weight:700; color:var(--bdb-ink-soft); }

        @media (prefers-reduced-motion: reduce) {
          .da-fade, .da-reveal, .da-out.pulse, .da-region.solved .da-prod, .da-slot.wrong { animation:none !important; }
          .da-fade, .da-reveal { opacity:1 !important; transform:none !important; }
          .da-region { transition:none !important; }
          .da-arc { stroke-dashoffset:0 !important; animation:none !important; }
          .da-arcdot { opacity:1 !important; animation:none !important; }
          .da-carry { animation:none !important; opacity:0 !important; }
        }
      `}</style>

      {/* The teacher's directions from the control panel. Rendered here rather
          than with the shared LiveToolBanner, whose pale-on-pale palette is
          built for the dark tool pages and washes out on cream. */}
      {liveTool?.prompt.trim() && (
        <div className="da-live">
          <span className="lbl">Today&apos;s task</span>
          <div>{liveTool.prompt.trim()}</div>
        </div>
      )}

      {phase === "enter" && (
        <>
          <div className="da-prompt">Break apart a multiplication problem</div>
          <div className="da-sub">Type two numbers. You will split the top number into friendly parts — like tens — to make it easier.</div>
          <div className="da-enter">
            <input className="da-in" value={inTop} onChange={(e) => setInTop(e.target.value.replace(/\D/g, ""))} inputMode="numeric" aria-label="top number, you will split this one" />
            <span className="da-x">x</span>
            <input className="da-in" value={inSide} onChange={(e) => setInSide(e.target.value.replace(/\D/g, ""))} inputMode="numeric" aria-label="side number, stays whole" />
          </div>
          <div className="da-tip">Tip: a number in the teens or twenties times a single digit is a great place to start.</div>
          <div className="da-bar"><button className="da-btn" onClick={startSingle}>Build the rectangle</button></div>

          <div className="da-teacher">
            <div className="lbl">Teacher</div>
            <div className="da-bar">
              <button className="da-btn ghost" onClick={() => { setCopied(false); setPhase("setup"); }}>Build a lesson set</button>
            </div>
          </div>
        </>
      )}

      {phase === "setup" && (
        <div className="da-setup">
          <div className="da-prompt">Lesson set</div>
          <div className="da-sub">Choose how many problems and the numbers for each. Students split the first number.</div>

          <div className="da-step">
            <span className="da-hint">Problems</span>
            <button onClick={() => stepDraftCount(-1)} aria-label="one fewer problem">-</button>
            <strong style={{ fontSize: "1.2rem", width: 24, textAlign: "center" }}>{draft.length}</strong>
            <button onClick={() => stepDraftCount(1)} aria-label="one more problem">+</button>
          </div>

          <div className="da-heads">Split this one &nbsp; x &nbsp; times this one</div>
          {draft.map((p, i) => (
            <div className="da-row" key={i}>
              <span className="n">{i + 1}</span>
              <input className={`da-sin ${p.top >= 3 && p.top <= TOP_MAX ? "" : "bad"}`} inputMode="numeric" value={p.top || ""} onChange={(e) => setDraftValue(i, "top", e.target.value)} aria-label={`problem ${i + 1} number to split`} />
              <span className="lx">x</span>
              <input className={`da-sin ${p.side >= SIDE_MIN && p.side <= SIDE_MAX ? "" : "bad"}`} inputMode="numeric" value={p.side || ""} onChange={(e) => setDraftValue(i, "side", e.target.value)} aria-label={`problem ${i + 1} side number`} />
              <span className="tag">{p.top >= 3 && p.side >= SIDE_MIN ? `= ${p.top * p.side}` : ""}</span>
            </div>
          ))}
          <div className="da-tip">Split number 3 to {TOP_MAX}. Side number {SIDE_MIN} to {SIDE_MAX}.</div>

          <div className="da-bar">
            <button className="da-btn" disabled={!draftReady} onClick={() => startLesson(draft)}>Start the lesson</button>
            <button className="da-btn ghost" disabled={!draftReady} onClick={copyLink}>{copied ? "Link copied" : "Copy student link"}</button>
            <button className="da-tbtn" onClick={() => setPhase("enter")}>Back</button>
          </div>
          <div className="da-tip">The student link carries the whole set, so you can paste it into the lesson page or hand it out.</div>
        </div>
      )}

      {(phase === "split" || phase === "work" || phase === "done") && (
        <>
          {lesson && (
            <div className="da-lbar">
              <span className="cnt">Problem {lIdx + 1} of {lesson.length}</span>
              <span className="da-dots">
                {lesson.map((_, i) => <span key={i} className={`da-dot ${i < lIdx ? "done" : i === lIdx ? "now" : ""}`} />)}
              </span>
            </div>
          )}

          <div className="da-prompt">
            {phase === "split" && `Split the ${top} into two parts`}
            {phase === "work" && prompts[step][0]}
            {phase === "done" && `${top} x ${side} = ${total}`}
          </div>
          <div className="da-sub">
            {phase === "split" && (finePointer
              ? "Move your cursor over the rectangle to preview the cut, then click to lock it. Parts that end in a ten are easiest."
              : "Drag to place your cut, then lock it. Parts that end in a ten are easiest.")}
            {phase === "work" && prompts[step][1]}
            {phase === "done" && "Same total area, no matter how you cut it up."}
          </div>

          <div className="da-tools">
            <button className="da-tbtn" onClick={back} disabled={phase === "split" && !!lesson}>Back</button>
            <button className="da-tbtn" onClick={restartProblem}>Start this one over</button>
            {!lesson && <button className="da-tbtn" onClick={randomProblem}>Random</button>}
            {!lesson && <button className="da-tbtn" onClick={() => setPhase("enter")}>New numbers</button>}
          </div>

          <div className="da-stage">
            {/* top factor label — each addend sits directly over its own
                section, still parenthesized with the + between them */}
            <div className="da-toplbl" style={{ left: 44, width: top * cell }}>
              {splitParts ? (
                <>
                  <span className="da-lp da-abs" style={{ left: -8, transform: "translateX(-100%)" }}>(</span>
                  <span className="da-pa da-abs" style={{ left: (splitParts[0] / 2) * cell, transform: "translateX(-50%)", color: TEAL }}>{splitParts[0]}</span>
                  <span className="da-lp da-abs" style={{ left: splitParts[0] * cell, transform: "translateX(-50%)" }}>+</span>
                  <span className="da-pa da-abs" style={{ left: (splitParts[0] + splitParts[1] / 2) * cell, transform: "translateX(-50%)", color: AMBER }}>{splitParts[1]}</span>
                  <span className="da-lp da-abs" style={{ left: top * cell + 8 }}>)</span>
                </>
              ) : (
                <span className="da-single da-abs" style={{ left: (top * cell) / 2, transform: "translateX(-50%)" }}>{top}</span>
              )}
            </div>

            {/* side factor — always a single outside group */}
            <div className="da-sidelbl" style={{ top: 42, height: side * cell }}>
              <span className="da-single">{side}</span>
            </div>

            <div
              ref={rectRef}
              className={`da-rect ${phase === "split" ? "cutting" : ""}`}
              style={{
                width: top * cell, height: side * cell,
                backgroundImage: "linear-gradient(to right, rgba(32,30,26,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(32,30,26,0.08) 1px, transparent 1px)",
                backgroundSize: `${cell}px ${cell}px`,
              }}
              onPointerDown={onRectDown}
              onPointerMove={onRectMove}
              onPointerUp={onRectUp}
              onPointerCancel={onRectUp}
              onPointerLeave={onRectLeave}
            >
              {regions.map((r, i) => {
                const solved = shownStep > SLOT_STEP[4 + i];
                return (
                  <div
                    key={r.id}
                    className={`da-region ${activeRegion === i ? "on" : ""} ${solved ? "solved" : ""}`}
                    style={{ left: r.x, width: r.w, background: `color-mix(in srgb, ${r.color} 26%, transparent)` }}
                  >
                    {solved
                      ? <span className="da-prod">{r.tw * r.th}</span>
                      : <span className="da-dims">{r.th} x {r.tw}</span>}
                  </div>
                );
              })}

              {/* live cut (touch: placed; mouse/pen: hover preview) */}
              {phase === "split" && pending != null && (
                <div className="da-line" style={{ left: pending * cell - 1.5, top: 0, width: 3, height: side * cell }} />
              )}
              {phase === "split" && pending == null && finePointer && hoverCut != null && (
                <div className="da-line da-line-ghost" style={{ left: hoverCut * cell - 1.5, top: 0, width: 3, height: side * cell }} />
              )}
            </div>
          </div>

          {phase === "split" && (
            <div className="da-bar">
              {pending != null
                ? <button className="da-btn" onClick={() => commitSplit(pending)}>Lock this split</button>
                : <span className="da-hint">{finePointer ? "Click the rectangle where you want to cut." : "Tap a spot to place your cut."} Not sure where? Pulling out a ten is always a safe bet.</span>}
            </div>
          )}

          {(phase === "work" || phase === "done") && (
            <div className="da-work" ref={workRef}>
              <div className="da-chain">
              <div className="da-eqrow">
                <span className="da-lead" />
                <span className={`da-out ${step === 1 ? "pulse" : ""}`} ref={r1OutRef}>{a}</span>
                <span className="da-paren">(</span>
                {slot(0, "teal")}
                <span className="da-op">+</span>
                {slot(1, "amber")}
                <span className="da-paren">)</span>
              </div>

              {/* the outside factor reaches over and drops onto each term —
                  the line draws, a copy of the number rides along it */}
              {phase === "work" && step === 1 && arcs && (
                <>
                  <svg className="da-arcsvg" width={arcs.w} height={arcs.h}>
                    <path className="da-arc c1" d={arcs.b} pathLength={1} />
                    <path className="da-arc c2" d={arcs.c} pathLength={1} />
                    <path className="da-arcdot d1" d={`M ${arcs.endB.x - 5} ${arcs.endB.y - 9} L ${arcs.endB.x + 5} ${arcs.endB.y - 9} L ${arcs.endB.x} ${arcs.endB.y} z`} />
                    <path className="da-arcdot d2" d={`M ${arcs.endC.x - 5} ${arcs.endC.y - 9} L ${arcs.endC.x + 5} ${arcs.endC.y - 9} L ${arcs.endC.x} ${arcs.endC.y} z`} />
                  </svg>
                  <span className="da-carry" style={{ offsetPath: `path('${arcs.b}')`, animationDelay: "0.12s" } as React.CSSProperties}>{a}</span>
                  <span className="da-carry" style={{ offsetPath: `path('${arcs.c}')`, animationDelay: "0.3s" } as React.CSSProperties}>{a}</span>
                </>
              )}

              {shownStep >= 1 && (
                <div className="da-eqrow da-fade">
                  <span className="da-lead">=</span>
                  <span className="da-out" ref={r2aRef}>{a}</span><span className="da-paren">(</span>{slot(2, "teal")}<span className="da-paren">)</span>
                  <span className="da-op">+</span>
                  <span className="da-out" ref={r2bRef}>{a}</span><span className="da-paren">(</span>{slot(3, "amber")}<span className="da-paren">)</span>
                </div>
              )}

              {shownStep >= 2 && (
                <div className="da-eqrow da-reveal">
                  <span className="da-lead">=</span>
                  {slot(4, "teal")}
                  <span className="da-op">+</span>
                  {slot(5, "amber")}
                </div>
              )}

              {shownStep >= 4 && (
                <div className="da-eqrow da-reveal">
                  <span className="da-lead">=</span>
                  {slot(6, "ink")}
                </div>
              )}
              </div>

              {phase === "work" && (
                <div className="da-bar">
                  <button className="da-btn" onClick={checkStep}>{step === LAST_STEP ? "Finish" : "Check"}</button>
                </div>
              )}
            </div>
          )}

          {phase === "done" && (
            <div className="da-done">
              <p className="da-reflect">{doneReflect}</p>
              <div className="da-abstract">a<span className="da-paren">(</span><span className="t">b</span> + <span className="m">c</span><span className="da-paren">)</span> = a<span className="da-paren">(</span><span className="t">b</span><span className="da-paren">)</span> + a<span className="da-paren">(</span><span className="m">c</span><span className="da-paren">)</span></div>
              <div className="da-bar">
                {lesson
                  ? <button className="da-btn" onClick={nextInLesson}>{lIdx + 1 >= lesson.length ? "See how you did" : "Next problem"}</button>
                  : <button className="da-btn" onClick={() => setPhase("enter")}>New problem</button>}
              </div>
            </div>
          )}

          <div className="da-note">{note}</div>
        </>
      )}

      {phase === "wrap" && (
        <>
          <div className="da-prompt">Lesson set complete</div>
          <div className="da-sub">
            {results.filter((r) => r.misses === 0).length} of {results.length} solved with no wrong steps.
          </div>
          <div className="da-wraplist">
            {results.map((r, i) => (
              <div className="da-wrow" key={i}>
                <span>{r.top} x {r.side} = {r.total}</span>
                <span className="mark">{r.misses === 0 ? "first try" : `${r.misses} wrong step${r.misses === 1 ? "" : "s"}`}</span>
              </div>
            ))}
          </div>
          <div className="da-bar">
            <button className="da-btn" onClick={() => lesson && startLesson(lesson, 0)}>Run the set again</button>
            <button className="da-btn ghost" onClick={() => { setLesson(null); setResults([]); setPhase("enter"); }}>Pick my own numbers</button>
          </div>
        </>
      )}
    </div>
  );
}
