"use client";

// Distributive Area Method — split ONE factor of a x b to discover
// a(b + c) = a(b) + a(c). The side factor stays a single "outside" group; the
// top factor gets cut into two parts (parenthesized). Students find each partial
// product, combine them, then watch the outside factor distribute across both
// addends on a payoff screen that ends on the abstract identity. Tap-to-split
// (pointer/touch, no hover), squared corners, a unit grid — on purpose.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { reportToolResult } from "@/lib/toolEvidence";

type Phase = "enter" | "split" | "products" | "combine" | "distribute" | "done";
const REGION_COLORS = ["#50a3a4", "#fcaf38", "#f95335", "#7c5cd6"];
const TEAL = REGION_COLORS[0];
const AMBER = REGION_COLORS[1];

interface Region { id: number; tw: number; th: number; color: string; x: number; y: number; w: number; h: number }
interface Arcs { w: number; h: number; b: string; c: string; endB: { x: number; y: number }; endC: { x: number; y: number } }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function cellSize(top: number, side: number) {
  return Math.max(13, Math.min(26, Math.floor(Math.min(460 / top, 320 / side))));
}

export default function DistributiveAreaMethod() {
  const [phase, setPhase] = useState<Phase>("enter");
  const [top, setTop] = useState(18);   // horizontal — the factor that gets split into (b + c)
  const [side, setSide] = useState(14); // vertical — one single group, the outside factor "a"
  const [inTop, setInTop] = useState("18");
  const [inSide, setInSide] = useState("14");

  const [topSplit, setTopSplit] = useState<number | null>(null); // committed cut
  const [pending, setPending] = useState<number | null>(null);   // tapped, not yet locked

  const [regions, setRegions] = useState<Region[]>([]);
  const [active, setActive] = useState(0);
  const [entry, setEntry] = useState("");
  const [totalEntry, setTotalEntry] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [intro, setIntro] = useState(false);

  // distribute (payoff) phase
  const [dRow, setDRow] = useState(0);      // rows revealed: 0..3
  const [prod0, setProd0] = useState("");   // typed a(b) product
  const [prod1, setProd1] = useState("");   // typed a(c) product
  const [arcs, setArcs] = useState<Arcs | null>(null);
  const [finePointer, setFinePointer] = useState(false); // mouse/pen: safe to autofocus; touch: let the student tap so the soft keyboard does not cover the work

  const rectRef = useRef<HTMLDivElement | null>(null);
  const payRef = useRef<HTMLDivElement | null>(null);
  const r1OutRef = useRef<HTMLSpanElement | null>(null);
  const r2bRef = useRef<HTMLSpanElement | null>(null);
  const r2cRef = useRef<HTMLSpanElement | null>(null);
  const draggingRef = useRef(false);
  const solvedRef = useRef(false);
  const cell = useMemo(() => cellSize(top, side), [top, side]);

  const beginWith = useCallback((t: number, s: number) => {
    setTop(t); setSide(s); setInTop(String(t)); setInSide(String(s));
    setTopSplit(null); setPending(null);
    setRegions([]); setActive(0); setEntry(""); setTotalEntry(""); setNote(null);
    setDRow(0); setProd0(""); setProd1(""); setArcs(null);
    solvedRef.current = false;
    setPhase("split");
  }, []);
  const start = useCallback(() => {
    // Top is the factor being split — allow two digits (24 x 8) so 2-digit x
    // 1-digit distributive problems fit. Side is the outside factor, kept smaller.
    beginWith(clamp(Math.round(Number(inTop) || 0), 2, 30), clamp(Math.round(Number(inSide) || 0), 2, 20));
  }, [inTop, inSide, beginWith]);
  const resetProblem = useCallback(() => beginWith(top, side), [beginWith, top, side]);
  const randomProblem = useCallback(
    () => beginWith(11 + Math.floor(Math.random() * 9), 3 + Math.floor(Math.random() * 9)),
    [beginWith],
  );
  const back = useCallback(() => {
    setNote(null);
    if (phase === "done") {
      if (topSplit == null) { setActive(0); setEntry(""); setPhase("products"); return; }
      setDRow(3); setPhase("distribute"); return;
    }
    if (phase === "distribute") {
      if (dRow > 0) { const n = dRow - 1; if (n === 0) { setProd0(""); setProd1(""); setArcs(null); } setDRow(n); return; }
      setTotalEntry(""); setPhase("combine"); return;
    }
    if (phase === "combine") { setActive(Math.max(0, regions.length - 1)); setEntry(""); setPhase("products"); return; }
    if (phase === "products") {
      if (active > 0) { setActive(active - 1); setEntry(""); return; }
      setRegions([]); setTopSplit(null); setPending(null); setEntry(""); setPhase("split"); return;
    }
    setPhase("enter");
  }, [phase, dRow, active, regions.length, topSplit]);

  useEffect(() => { setFinePointer(window.matchMedia?.("(pointer: fine)").matches ?? false); }, []);

  // Each region's two factors travel toward each other before the answer box
  // appears — one region at a time.
  useEffect(() => {
    if (phase !== "products") { setIntro(false); return; }
    setIntro(true);
    const t = window.setTimeout(() => setIntro(false), 1000);
    return () => window.clearTimeout(t);
  }, [phase, active]);

  // Measure the payoff arcs so they land exactly on the numbers at any size.
  useLayoutEffect(() => {
    if (phase !== "distribute" || dRow !== 1) { setArcs(null); return; }
    const measure = () => {
      const pay = payRef.current, o = r1OutRef.current, e0 = r2bRef.current, e1 = r2cRef.current;
      if (!pay || !o || !e0 || !e1) return;
      const pb = pay.getBoundingClientRect();
      const ob = o.getBoundingClientRect();
      const eb0 = e0.getBoundingClientRect();
      const eb1 = e1.getBoundingClientRect();
      const ox = ob.left + ob.width / 2 - pb.left, oy = ob.bottom - pb.top;
      const x0 = eb0.left + eb0.width / 2 - pb.left, y0 = eb0.top - pb.top - 2;
      const x1 = eb1.left + eb1.width / 2 - pb.left, y1 = eb1.top - pb.top - 2;
      // On a narrow phone Row 2 wraps and the two addends land at different
      // heights — skip the arcs (the numbers still fade in) rather than draw a
      // curve that loops back across the frame.
      if (Math.abs(y0 - y1) > 24) { setArcs(null); return; }
      // "Reach over and drop down": the control sits above each addend at the
      // origin's height, so the curve leaves the outside factor horizontally
      // then falls vertically onto the product — a clear distribute gesture.
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
  }, [phase, dRow]);

  const buildRegions = useCallback((tSplit: number | null) => {
    const c = cellSize(top, side);
    const addends = tSplit ? [tSplit, top - tSplit] : [top];
    const out: Region[] = [];
    let x = 0;
    addends.forEach((tw, id) => {
      out.push({ id, tw, th: side, color: REGION_COLORS[id], x: x * c, y: 0, w: tw * c, h: side * c });
      x += tw;
    });
    setRegions(out);
    setActive(0); setEntry(""); setNote(null);
    setPhase("products");
  }, [top, side]);

  // Split interaction — tap anywhere to snap a cut to the nearest gridline;
  // pointer events so it works with mouse, finger, and pen (no hover).
  const placeCut = (clientX: number) => {
    const r = rectRef.current?.getBoundingClientRect();
    if (!r) return;
    setPending(clamp(Math.round((clientX - r.left) / cell), 1, top - 1));
  };
  const onRectDown = (e: React.PointerEvent) => {
    if (phase !== "split") return;
    draggingRef.current = true;
    rectRef.current?.setPointerCapture?.(e.pointerId);
    placeCut(e.clientX);
  };
  const onRectMove = (e: React.PointerEvent) => {
    if (phase !== "split" || !draggingRef.current) return;
    placeCut(e.clientX);
  };
  const onRectUp = () => { draggingRef.current = false; };

  const lockSplit = () => { if (pending != null) { setTopSplit(pending); buildRegions(pending); } };
  const keepWhole = () => { setTopSplit(null); setPending(null); buildRegions(null); };

  const submitProduct = () => {
    if (intro) return; // the answer box has not appeared yet — ignore tap-aheads
    const r = regions[active];
    if (!r) return;
    if (Number(entry) === r.tw * r.th) {
      setEntry(""); setNote(null);
      if (active + 1 < regions.length) { setActive(active + 1); return; }
      if (topSplit == null) {
        if (!solvedRef.current) { solvedRef.current = true; reportToolResult({ tool: "distributive-area", correct: true, problemId: `${top}x${side}` }); }
        setPhase("done");
      } else setPhase("combine");
    } else {
      setNote(`Not yet — that part is ${r.th} groups of ${r.tw}.`);
    }
  };
  const submitTotal = () => {
    const sum = regions.reduce((a, r) => a + r.tw * r.th, 0);
    if (Number(totalEntry) === sum) {
      setNote(null);
      if (!solvedRef.current) { solvedRef.current = true; reportToolResult({ tool: "distributive-area", correct: true, problemId: `${top}x${side}` }); }
      setDRow(0); setPhase("distribute");
    } else setNote("Add the two products again.");
  };
  const distribute = () => setDRow(1);

  const total = top * side;
  const parts = regions.map((r) => r.tw * r.th);
  const a = side;
  const b = topSplit ?? 0;
  const c = topSplit != null ? top - topSplit : 0;
  const prod0ok = topSplit != null && prod0 !== "" && Number(prod0) === a * b;
  const prod1ok = topSplit != null && prod1 !== "" && Number(prod1) === a * c;
  const splitParts: [number, number] | null =
    pending != null ? [pending, top - pending] : topSplit != null ? [topSplit, top - topSplit] : null;
  // Two smart strategies earn tailored praise: pulling out a ten (place value)
  // and an even split you can double (24 into 12 + 12). Everything else gets a
  // nudge toward one of them — an arbitrary cut like 15 into 7 + 8 is not easier.
  const hasTen = topSplit != null && (b % 10 === 0 || c % 10 === 0);
  const isDouble = topSplit != null && b === c;

  const doneReflect =
    topSplit == null
      ? `That works, but the whole point is to break it up. Try again and split the ${top} into a ten and some ones — you will see why it is easier.`
      : hasTen
      ? `That is the distributive property. Pulling a ten out of the ${top} makes each product quick to do in your head.`
      : isDouble
      ? `That is the distributive property — and splitting the ${top} in half is a smart move. Both pieces are ${side} x ${b}, so you can work one out and double it.`
      : `That is the distributive property — it works with any split. But ${b} and ${c} were not the easiest to multiply. Try pulling out a ten, or splitting into two equal parts you can double.`;

  return (
    <div className="da-wrap">
      <style>{`
        .da-wrap { --da-carry:cubic-bezier(.34,.8,.3,1); --da-settle:cubic-bezier(.2,.8,.3,1); font-family:var(--bdb-font); color:var(--bdb-ink); max-width:760px; margin:0 auto; padding:14px clamp(10px,3vw,20px) 34px; }
        .da-prompt { text-align:center; font-size:clamp(1.1rem,3.2vw,1.5rem); font-weight:800; margin:2px 0 4px; min-height:32px; }
        .da-sub { text-align:center; color:var(--bdb-ink-soft); font-size:0.9rem; margin:0 0 14px; min-height:20px; }
        .da-enter { display:flex; gap:10px; align-items:center; justify-content:center; margin:24px 0 6px; flex-wrap:wrap; }
        .da-in { width:84px; font:inherit; font-size:1.6rem; font-weight:800; text-align:center; padding:8px; border:2px solid var(--bdb-line); border-radius:12px; background:var(--bdb-card); color:var(--bdb-ink); }
        .da-x { font-size:1.6rem; font-weight:800; color:var(--bdb-ink-soft); }
        .da-tip { text-align:center; color:var(--bdb-ink-faint); font-size:0.82rem; margin:8px 0 0; }
        .da-stage { position:relative; margin:0 auto; width:max-content; padding:46px 0 0 46px; }
        .da-rect { position:relative; border:3px solid var(--bdb-ink); border-radius:0; touch-action:none; cursor:pointer; }
        .da-toplbl { position:absolute; top:8px; display:flex; align-items:center; justify-content:center; gap:5px; font-weight:900; }
        .da-sidelbl { position:absolute; left:8px; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:1.4rem; color:var(--bdb-ink); }
        .da-single { font-size:1.4rem; color:var(--bdb-ink); }
        .da-lp { color:var(--bdb-ink-soft); font-size:1.3rem; }
        .da-pa { font-size:1.3rem; font-weight:900; }
        .da-line { position:absolute; background:var(--bdb-coral); z-index:5; pointer-events:none; }
        .da-region { position:absolute; border-radius:0; display:grid; place-items:center; text-align:center; transition:background 220ms ease; }
        .da-region.on { outline:3px solid var(--bdb-ink); outline-offset:-3px; }
        .da-region.solved .da-prod { animation:daDrop 320ms var(--da-settle); }
        @keyframes daDrop { from { transform:translateY(-10px) scale(1.2); opacity:0; } to { transform:none; opacity:1; } }
        .da-dims { font-weight:800; font-size:0.9rem; color:var(--bdb-ink); opacity:0.75; }
        .da-conv { display:flex; align-items:center; gap:8px; font-weight:900; font-size:1.4rem; color:var(--bdb-ink); }
        .da-cn.side { animation:daFromLeft .85s var(--da-carry) both; color:var(--bdb-ink); }
        .da-cn.add { animation:daFromTop .85s var(--da-carry) both; }
        .da-cn.x { animation:daFade .85s ease .35s both; color:var(--bdb-ink-soft); }
        @keyframes daFromTop { from { transform:translateY(-34px); opacity:0; } to { transform:none; opacity:1; } }
        @keyframes daFromLeft { from { transform:translateX(-34px); opacity:0; } to { transform:none; opacity:1; } }
        @keyframes daFade { from { opacity:0; } to { opacity:1; } }
        .da-tools { display:flex; gap:8px; justify-content:center; margin-bottom:12px; }
        .da-tbtn { font:inherit; font-weight:700; font-size:0.82rem; padding:6px 13px; border-radius:999px; border:1px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink-soft); cursor:pointer; }
        .da-tbtn:active, .da-tbtn:focus-visible { color:var(--bdb-ink); }
        .da-prod { font-weight:900; font-size:1.3rem; color:var(--bdb-ink); }
        .da-pin { width:74px; font:inherit; font-size:1.1rem; font-weight:800; text-align:center; padding:5px; border:2px solid var(--bdb-ink); border-radius:8px; background:#fff; }
        .da-bar { display:flex; gap:8px; justify-content:center; align-items:center; margin-top:16px; flex-wrap:wrap; }
        .da-btn { font:inherit; font-weight:700; font-size:0.9rem; padding:9px 16px; border-radius:11px; border:1px solid var(--bdb-line); background:var(--bdb-ink); color:#fff; cursor:pointer; }
        .da-btn.ghost { background:var(--bdb-card); color:var(--bdb-ink); }
        .da-btn:disabled { opacity:0.42; cursor:not-allowed; }
        .da-note { text-align:center; color:var(--bdb-coral); font-weight:700; font-size:0.9rem; min-height:20px; margin-top:8px; }
        .da-hint { color:var(--bdb-ink-faint); font-size:0.85rem; }
        .da-combine { text-align:center; font-size:clamp(1.2rem,3.5vw,1.7rem); font-weight:800; margin:18px 0; }
        .da-done { text-align:center; }
        .da-done .eq { font-size:clamp(1.3rem,4vw,2rem); font-weight:900; margin:6px 0; }
        .da-reflect { color:var(--bdb-ink-soft); font-size:0.95rem; max-width:460px; margin:10px auto 0; line-height:1.5; }

        .da-pay { position:relative; width:min(560px,94vw); margin:4px auto 0; text-align:center; }
        .da-payhead { font-weight:800; color:var(--bdb-ink-soft); font-size:1rem; margin-bottom:12px; }
        .da-drow { position:relative; z-index:1; display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:6px; font-weight:900; font-size:clamp(1.25rem,4.4vw,1.9rem); line-height:1.55; margin:8px 0; }
        .da-frame { font-size:clamp(1.4rem,5vw,2.1rem); margin-bottom:30px; }
        .da-vout { display:inline-block; color:var(--bdb-ink); }
        .da-vout.pulse { animation:daPulse .16s var(--da-settle); }
        @keyframes daPulse { 50% { transform:scale(1.14); } }
        .da-vb { color:${TEAL}; } .da-vc { color:${AMBER}; }
        .da-paren, .da-op, .da-eq { color:var(--bdb-ink-soft); font-weight:800; }
        .da-term { display:inline-flex; align-items:center; gap:5px; }
        .da-slot { width:66px; font:inherit; font-weight:900; font-size:0.85em; text-align:center; padding:3px; border:2px solid var(--bdb-line); border-radius:0; background:#fff; color:var(--bdb-ink); }
        .da-slot.wrong { border-color:var(--bdb-coral); animation:daShake .3s; }
        .da-slot.ok { color:#fff; border-color:${TEAL}; background:${TEAL}; }
        .da-slot.ok.am { background:${AMBER}; border-color:${AMBER}; color:var(--bdb-ink); }
        @keyframes daShake { 25% { transform:translateX(-3px); } 75% { transform:translateX(3px); } }
        .da-total { color:var(--bdb-ink); font-weight:900; border-bottom:3px solid var(--bdb-ink); padding-bottom:1px; }
        .da-fade { animation:daFade .3s ease both; }
        .da-reveal { animation:daRise .38s var(--da-settle) both; }
        @keyframes daRise { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }
        .da-abstract { margin-top:16px; padding-top:14px; border-top:1px dashed var(--bdb-line); }
        .da-av { display:inline-block; font-weight:900; animation:daRise .3s var(--da-settle) both; }
        .da-av.ink { color:var(--bdb-ink); } .da-av.teal { color:${TEAL}; } .da-av.amber { color:${AMBER}; }
        .da-paycap { color:var(--bdb-ink-soft); font-size:0.85rem; max-width:420px; margin:8px auto 0; }
        .da-arcsvg { position:absolute; left:0; top:0; z-index:0; pointer-events:none; overflow:visible; }
        .da-arc { fill:none; stroke:var(--bdb-coral); stroke-width:4; stroke-linecap:round; stroke-dasharray:1; stroke-dashoffset:1; }
        .da-arc.c1 { animation:daDraw .7s var(--da-carry) .12s forwards; }
        .da-arc.c2 { animation:daDraw .72s var(--da-carry) .3s forwards; }
        @keyframes daDraw { to { stroke-dashoffset:0; } }
        .da-arcdot { fill:var(--bdb-coral); opacity:0; }
        .da-arcdot.d1 { animation:daFade .2s ease .82s forwards; }
        .da-arcdot.d2 { animation:daFade .2s ease 1.02s forwards; }

        @media (prefers-reduced-motion: reduce) {
          .da-cn.side, .da-cn.add, .da-cn.x, .da-fade, .da-reveal, .da-av, .da-vout.pulse, .da-region.solved .da-prod, .da-slot.wrong { animation:none !important; }
          .da-fade, .da-reveal, .da-av { opacity:1 !important; transform:none !important; }
          .da-region { transition:none !important; }
          .da-arc { stroke-dashoffset:0 !important; animation:none !important; }
          .da-arcdot { opacity:1 !important; animation:none !important; }
        }
      `}</style>

      {phase === "enter" && (
        <>
          <div className="da-prompt">Break apart a multiplication problem</div>
          <div className="da-sub">Type two numbers. You will split the top number into friendly parts — like tens — to make it easier.</div>
          <div className="da-enter">
            <input className="da-in" value={inTop} onChange={(e) => setInTop(e.target.value.replace(/\D/g, ""))} inputMode="numeric" aria-label="top number, you will split this one" />
            <span className="da-x">x</span>
            <input className="da-in" value={inSide} onChange={(e) => setInSide(e.target.value.replace(/\D/g, ""))} inputMode="numeric" aria-label="side number, stays whole" />
          </div>
          <div className="da-tip">Tip: numbers in the teens are a great place to start.</div>
          <div className="da-bar"><button className="da-btn" onClick={start}>Build the rectangle</button></div>
        </>
      )}

      {phase !== "enter" && (
        <>
          <div className="da-prompt">
            {phase === "split" && `Split the ${top} into two parts`}
            {phase === "products" && regions[active] && `${side} x ${regions[active].tw} = ?`}
            {phase === "combine" && "Combine the pieces"}
            {phase === "distribute" && "Here is the shortcut you just discovered"}
            {phase === "done" && `${top} x ${side} = ${total}`}
          </div>
          <div className="da-sub">
            {phase === "split" && "Tap where you want to cut. Parts that end in a ten are the easiest to multiply — but try any cut and see."}
            {phase === "products" && (topSplit == null ? "You kept it whole — multiply the whole rectangle." : "Multiply the side by this part.")}
            {phase === "combine" && "Add the two products to get the whole area."}
            {phase === "distribute" && `The ${side} multiplies each part. Watch it spread out.`}
            {phase === "done" && "Same total area, no matter how you cut it up."}
          </div>

          <div className="da-tools">
            <button className="da-tbtn" onClick={back}>Back</button>
            <button className="da-tbtn" onClick={resetProblem}>Reset</button>
            <button className="da-tbtn" onClick={randomProblem}>Random</button>
          </div>

          {phase !== "distribute" && (
            <div className="da-stage">
              {/* top factor label — parenthesized once a split exists */}
              <div className="da-toplbl" style={{ left: 46, width: top * cell }}>
                {splitParts ? (
                  <>
                    <span className="da-lp">(</span>
                    <span className="da-pa" style={{ color: TEAL }}>{splitParts[0]}</span>
                    <span className="da-lp">+</span>
                    <span className="da-pa" style={{ color: AMBER }}>{splitParts[1]}</span>
                    <span className="da-lp">)</span>
                  </>
                ) : (
                  <span className="da-single">{top}</span>
                )}
              </div>

              {/* side factor — always a single outside group */}
              <div className="da-sidelbl" style={{ top: 46, height: side * cell }}>
                <span className="da-single">{side}</span>
              </div>

              <div
                ref={rectRef}
                className="da-rect"
                style={{
                  width: top * cell, height: side * cell,
                  backgroundImage: "linear-gradient(to right, rgba(32,30,26,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(32,30,26,0.08) 1px, transparent 1px)",
                  backgroundSize: `${cell}px ${cell}px`,
                }}
                onPointerDown={onRectDown}
                onPointerMove={onRectMove}
                onPointerUp={onRectUp}
                onPointerCancel={onRectUp}
              >
                {regions.map((r, i) => {
                  const solved = (phase === "products" && i < active) || phase === "combine" || phase === "done";
                  const isActive = phase === "products" && i === active;
                  return (
                    <div
                      key={r.id}
                      className={`da-region ${isActive ? "on" : ""} ${solved ? "solved" : ""}`}
                      style={{ left: r.x, top: r.y, width: r.w, height: r.h, background: `color-mix(in srgb, ${r.color} 26%, transparent)` }}
                    >
                      {solved ? (
                        <span className="da-prod">{r.tw * r.th}</span>
                      ) : isActive ? (
                        intro ? (
                          <div className="da-conv">
                            <span className="da-cn side">{r.th}</span>
                            <span className="da-cn x">x</span>
                            <span className="da-cn add" style={{ color: r.color }}>{r.tw}</span>
                          </div>
                        ) : (
                          <div>
                            <div className="da-dims">{r.th} x {r.tw}</div>
                            <input className="da-pin" autoFocus={finePointer} value={entry} inputMode="numeric"
                              onChange={(e) => setEntry(e.target.value.replace(/\D/g, ""))}
                              onKeyDown={(e) => e.key === "Enter" && submitProduct()} />
                          </div>
                        )
                      ) : (
                        <span className="da-dims">{r.th} x {r.tw}</span>
                      )}
                    </div>
                  );
                })}

                {/* live cut */}
                {phase === "split" && pending != null && (
                  <div className="da-line" style={{ left: pending * cell - 1.5, top: 0, width: 3, height: side * cell }} />
                )}
              </div>
            </div>
          )}

          {phase === "split" && (
            <div className="da-bar">
              <button className="da-btn ghost" onClick={keepWhole}>Keep it whole</button>
              {pending != null
                ? <button className="da-btn" onClick={lockSplit}>Lock this split</button>
                : <span className="da-hint">Tap a spot to place your cut. Not sure where? Pulling out a ten is always a safe bet.</span>}
            </div>
          )}

          {phase === "products" && <div className="da-bar"><button className="da-btn" disabled={intro} onClick={submitProduct}>Enter</button></div>}

          {phase === "combine" && (
            <>
              <div className="da-combine">{parts.join(" + ")} =</div>
              <div className="da-bar">
                <input className="da-in" style={{ width: 120 }} value={totalEntry} inputMode="numeric"
                  onChange={(e) => setTotalEntry(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && submitTotal()} aria-label="total" />
                <button className="da-btn" onClick={submitTotal}>Check</button>
              </div>
            </>
          )}

          {phase === "distribute" && (
            <div className="da-pay" ref={payRef}>
              <div className="da-payhead">Here is what you just did.</div>

              {/* Row 1 — the frame you already filled by cutting the rectangle */}
              <div className="da-drow da-frame">
                <span className={`da-vout ${dRow === 1 ? "pulse" : ""}`} ref={r1OutRef}>{a}</span>
                <span className="da-paren">(</span>
                <span className="da-vb">{b}</span>
                <span className="da-op">+</span>
                <span className="da-vc">{c}</span>
                <span className="da-paren">)</span>
              </div>

              {/* arcs: the outside factor carried onto each addend */}
              {dRow === 1 && arcs && (
                <svg className="da-arcsvg" width={arcs.w} height={arcs.h}>
                  <path className="da-arc c1" d={arcs.b} pathLength={1} />
                  <path className="da-arc c2" d={arcs.c} pathLength={1} />
                  <circle className="da-arcdot d1" cx={arcs.endB.x} cy={arcs.endB.y} r={4} />
                  <circle className="da-arcdot d2" cx={arcs.endC.x} cy={arcs.endC.y} r={4} />
                </svg>
              )}

              {/* Row 2 — distributed form; the only inputs on this screen */}
              {dRow >= 1 && (
                <div className="da-drow da-fade">
                  <span className="da-term">
                    <span className="da-vout">{a}</span><span className="da-paren">(</span>
                    <span className="da-vb" ref={r2bRef}>{b}</span><span className="da-paren">)</span>
                    <span className="da-eq">=</span>
                    <input className={`da-slot ${prod0ok ? "ok" : prod0 !== "" ? "wrong" : ""}`} value={prod0} inputMode="numeric" readOnly={prod0ok}
                      autoFocus={finePointer} onChange={(e) => { setProd0(e.target.value.replace(/\D/g, "")); setNote(null); }} aria-label={`${a} times ${b}`} />
                  </span>
                  <span className="da-op">+</span>
                  <span className="da-term">
                    <span className="da-vout">{a}</span><span className="da-paren">(</span>
                    <span className="da-vc" ref={r2cRef}>{c}</span><span className="da-paren">)</span>
                    <span className="da-eq">=</span>
                    <input className={`da-slot ${prod1ok ? "ok am" : prod1 !== "" ? "wrong" : ""}`} value={prod1} inputMode="numeric" readOnly={prod1ok}
                      onChange={(e) => { setProd1(e.target.value.replace(/\D/g, "")); setNote(null); }} aria-label={`${a} times ${c}`} />
                  </span>
                </div>
              )}

              {/* Row 3 — the same total, reached two ways */}
              {dRow >= 2 && (
                <div className="da-drow da-reveal">
                  <span className="da-vb">{a * b}</span>
                  <span className="da-op">+</span>
                  <span className="da-vc">{a * c}</span>
                  <span className="da-eq">=</span>
                  <span className="da-total">{a * b + a * c}</span>
                </div>
              )}

              {/* Row 4 — the same move in letters */}
              {dRow >= 3 && (
                <>
                  <div className="da-drow da-abstract">
                    <span className="da-av ink" style={{ animationDelay: "0ms" }}>a</span>
                    <span className="da-paren">(</span>
                    <span className="da-av teal" style={{ animationDelay: "80ms" }}>b</span>
                    <span className="da-op">+</span>
                    <span className="da-av amber" style={{ animationDelay: "160ms" }}>c</span>
                    <span className="da-paren">)</span>
                    <span className="da-eq">=</span>
                    <span className="da-av ink" style={{ animationDelay: "260ms" }}>a</span><span className="da-paren">(</span><span className="da-av teal" style={{ animationDelay: "320ms" }}>b</span><span className="da-paren">)</span>
                    <span className="da-op">+</span>
                    <span className="da-av ink" style={{ animationDelay: "380ms" }}>a</span><span className="da-paren">(</span><span className="da-av amber" style={{ animationDelay: "440ms" }}>c</span><span className="da-paren">)</span>
                  </div>
                  <div className="da-paycap">Same move, any numbers. That is the distributive property.</div>
                </>
              )}

              <div className="da-bar">
                {dRow === 0 && <button className="da-btn" onClick={distribute}>Distribute</button>}
                {dRow === 1 && (
                  <>
                    <button className="da-btn" disabled={!(prod0ok && prod1ok)} onClick={() => { setNote(null); setDRow(2); }}>Next</button>
                    {!(prod0ok && prod1ok) && <span className="da-hint">Fill in both products to move on.</span>}
                  </>
                )}
                {dRow === 2 && <button className="da-btn" onClick={() => setDRow(3)}>See the pattern</button>}
                {dRow === 3 && <button className="da-btn" onClick={() => setPhase("done")}>Finish</button>}
              </div>
            </div>
          )}

          {phase === "done" && (
            <div className="da-done">
              <div className="eq">{topSplit != null ? `${parts.join(" + ")} = ${total}` : `${top} x ${side} = ${total}`}</div>
              <p className="da-reflect">{doneReflect}</p>
              <div className="da-bar"><button className="da-btn" onClick={() => setPhase("enter")}>New problem</button></div>
            </div>
          )}

          <div className="da-note">{note}</div>
        </>
      )}
    </div>
  );
}
