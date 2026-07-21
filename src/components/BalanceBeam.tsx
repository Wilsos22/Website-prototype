"use client";

// Balance Beam — solve "? + p = q" by keeping a scale level. The "?" box holds a
// hidden mystery weight (the unknown); every plain block weighs 1. The beam
// starts balanced. Students DRAG blocks: pull one off a side to remove it, or
// drag one from the supply onto a side. The lesson is "do the same to BOTH
// sides" — isolate the ? by clearing the extra blocks off its side and taking
// the same number off the other, and the blocks left over reveal its weight.

import { useCallback, useEffect, useRef, useState } from "react";
import { reportToolResult } from "@/lib/toolEvidence";
import { LiveToolBanner, useLiveToolConfig } from "./useLiveToolConfig";

const STAGE_W = 640;
const STAGE_H = 430;
const PIVOT_X = 320;
const PIVOT_Y = 250;
const H = 172;          // beam half-length (px)
const K = 2.6;          // degrees of tilt per unit of weight difference
const MAX_TILT = 13;    // clamp so it never flips over
const WRAP_H = 210;     // side wrapper height; blocks stack upward inside it

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Side = "L" | "R";
type DragFrom = Side | "supply";

interface Problem { unknown: number; leftUnits: number; rightUnits: number }
function makeProblem(): Problem {
  const unknown = 1 + Math.floor(Math.random() * 5); // 1..5
  const p = 1 + Math.floor(Math.random() * 4);       // 1..4
  return { unknown, leftUnits: p, rightUnits: unknown + p };
}

export default function BalanceBeam() {
  const liveTool = useLiveToolConfig("/balance-beam");
  const [prob, setProb] = useState<Problem>({ unknown: 2, leftUnits: 3, rightUnits: 5 });
  const [leftUnits, setLeftUnits] = useState(3);
  const [rightUnits, setRightUnits] = useState(5);
  const [dragging, setDragging] = useState<DragFrom | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const solvedRef = useRef(false);
  const panLRef = useRef<HTMLDivElement | null>(null);
  const panRRef = useRef<HTMLDivElement | null>(null);

  const startProblem = useCallback((p: Problem) => {
    setProb(p); setLeftUnits(p.leftUnits); setRightUnits(p.rightUnits); solvedRef.current = false; setDragging(null);
  }, []);

  // Randomize after mount (keep the deterministic default for first paint so SSR matches).
  const inited = useRef(false);
  useEffect(() => { if (!inited.current) { inited.current = true; startProblem(makeProblem()); } }, [startProblem]);

  const leftWeight = prob.unknown + leftUnits;
  const rightWeight = rightUnits;
  const diff = leftWeight - rightWeight;
  const balanced = diff === 0;
  const solved = leftUnits === 0 && balanced;
  const angle = clamp(-K * diff, -MAX_TILT, MAX_TILT);

  useEffect(() => {
    if (solved && !solvedRef.current) {
      solvedRef.current = true;
      reportToolResult({ tool: "balance-beam", correct: true, problemId: `x+${prob.leftUnits}=${prob.rightUnits}` });
    }
  }, [solved, prob]);

  // ── Drag: pick a block up, drop it on a pan (add) or off a pan (remove) ──────
  const startDrag = (from: DragFrom) => (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(from);
    setPos({ x: e.clientX, y: e.clientY });
  };
  useEffect(() => {
    if (!dragging) return;
    const from = dragging;
    const move = (e: PointerEvent) => setPos({ x: e.clientX, y: e.clientY });
    const up = (e: PointerEvent) => {
      const hit = (ref: React.RefObject<HTMLDivElement | null>): boolean => {
        const r = ref.current?.getBoundingClientRect();
        return !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      };
      const target: Side | "off" = hit(panLRef) ? "L" : hit(panRRef) ? "R" : "off";
      if (from === "supply") {
        if (target === "L") setLeftUnits((u) => u + 1);
        else if (target === "R") setRightUnits((u) => u + 1);
      } else if (from === "L") {
        if (target === "R") { setLeftUnits((u) => Math.max(0, u - 1)); setRightUnits((u) => u + 1); }
        else if (target === "off") setLeftUnits((u) => Math.max(0, u - 1));
      } else if (from === "R") {
        if (target === "L") { setRightUnits((u) => Math.max(0, u - 1)); setLeftUnits((u) => u + 1); }
        else if (target === "off") setRightUnits((u) => Math.max(0, u - 1));
      }
      setDragging(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [dragging]);

  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const lx = PIVOT_X - H * cos, ly = PIVOT_Y - H * sin;
  const rx = PIVOT_X + H * cos, ry = PIVOT_Y + H * sin;

  const eqStr = `${leftUnits > 0 ? `?  +  ${leftUnits}` : "?"}   =   ${rightUnits}`;

  const pan = (s: Side, x: number, y: number, units: number, withBox: boolean) => (
    <div className="bb-side" ref={s === "L" ? panLRef : panRRef} style={{ left: x - 110, top: y - WRAP_H }}>
      <div className="bb-blocks">
        {withBox && <div className={`bb-box ${solved ? "solved" : ""}`} title="The unknown — get it by itself">{solved ? prob.unknown : "?"}</div>}
        {Array.from({ length: units }).map((_, i) => (
          <div key={i} className="bb-unit" onPointerDown={startDrag(s)} title="Drag me off, or onto the other side">1</div>
        ))}
      </div>
      <div className="bb-tray" />
    </div>
  );

  return (
    <div className="bb-wrap">
      <style>{`
        .bb-wrap { font-family:var(--bdb-font); color:var(--bdb-ink); max-width:720px; margin:0 auto; padding:12px clamp(10px,3vw,20px) 28px; -webkit-user-select:none; user-select:none; }
        .bb-head { text-align:center; margin-bottom:2px; }
        .bb-goal { font-weight:800; font-size:clamp(1.05rem,3.4vw,1.4rem); }
        .bb-goal .q { color:var(--bdb-coral); }
        .bb-goalsub { color:var(--bdb-ink-soft); font-size:0.9rem; margin-top:2px; }
        .bb-eq { font-size:clamp(1.6rem,4.6vw,2.3rem); font-weight:800; letter-spacing:0.02em; margin-top:8px; }
        .bb-status { font-weight:800; font-size:1rem; margin-top:2px; min-height:24px; }
        .bb-status.bal { color:var(--bdb-green); }
        .bb-status.off { color:var(--bdb-coral); }
        .bb-status.ok  { color:var(--bdb-green); font-size:1.15rem; }

        .bb-stage { position:relative; margin:0 auto; overflow:visible; touch-action:none; }
        .bb-base { position:absolute; left:${PIVOT_X - 90}px; top:${STAGE_H - 26}px; width:180px; height:16px; border-radius:8px; background:var(--bdb-brown); }
        .bb-fulcrum { position:absolute; left:${PIVOT_X - 52}px; top:${PIVOT_Y}px; width:0; height:0;
          border-left:52px solid transparent; border-right:52px solid transparent; border-bottom:${STAGE_H - 26 - PIVOT_Y}px solid var(--bdb-amber); }
        .bb-beam { position:absolute; left:${PIVOT_X - H}px; top:${PIVOT_Y - 7}px; width:${2 * H}px; height:14px; border-radius:8px;
          background:var(--bdb-ink); transform-origin:center center; transition:transform 0.55s cubic-bezier(.2,.9,.25,1); }
        .bb-cap { position:absolute; left:${PIVOT_X - 13}px; top:${PIVOT_Y - 13}px; width:26px; height:26px; border-radius:50%;
          background:var(--bdb-brown); border:3px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.2); }
        .bb-equals { position:absolute; left:${PIVOT_X - 20}px; top:${PIVOT_Y - 74}px; width:40px; text-align:center; font-size:2.4rem; font-weight:900; color:var(--bdb-ink-faint); }

        .bb-side { position:absolute; width:220px; height:${WRAP_H}px; display:flex; flex-direction:column; justify-content:flex-end; align-items:center;
          transition:top 0.55s cubic-bezier(.2,.9,.25,1), left 0.55s cubic-bezier(.2,.9,.25,1); }
        .bb-blocks { display:flex; flex-wrap:wrap-reverse; justify-content:center; align-content:flex-end; gap:6px; max-width:196px; margin-bottom:4px; }
        .bb-unit, .bb-box { width:40px; height:40px; border-radius:9px; display:grid; place-items:center; font-weight:800; font-size:1.1rem; flex:none; }
        .bb-unit { background:var(--bdb-teal); color:#fff; border:none; cursor:grab; box-shadow:inset 0 -3px 0 rgba(0,0,0,0.15); touch-action:none; }
        .bb-unit:active { cursor:grabbing; transform:scale(0.94); }
        .bb-box { background:#fff; color:var(--bdb-ink); border:3px dashed var(--bdb-coral); font-size:1.4rem; }
        .bb-box.solved { border-style:solid; border-color:var(--bdb-green); color:var(--bdb-green); }
        .bb-tray { width:150px; height:12px; border-radius:7px; background:var(--bdb-brown); box-shadow:0 2px 4px rgba(0,0,0,0.18); }

        .bb-supply { display:flex; flex-direction:column; align-items:center; gap:6px; margin-top:8px; }
        .bb-supply-block { width:44px; height:44px; border-radius:9px; display:grid; place-items:center; font-weight:800; font-size:1.15rem;
          background:var(--bdb-teal); color:#fff; cursor:grab; box-shadow:inset 0 -3px 0 rgba(0,0,0,0.15); touch-action:none; }
        .bb-supply-block:active { cursor:grabbing; }
        .bb-supply-label { font-size:0.78rem; font-weight:800; letter-spacing:0.04em; text-transform:uppercase; color:var(--bdb-ink-faint); }

        .bb-ghost { position:fixed; z-index:50; width:40px; height:40px; border-radius:9px; display:grid; place-items:center; font-weight:800; font-size:1.1rem;
          background:var(--bdb-teal); color:#fff; pointer-events:none; transform:translate(-50%,-50%) scale(1.08); box-shadow:0 6px 14px rgba(0,0,0,0.28); }

        .bb-controls { display:flex; align-items:center; justify-content:center; gap:clamp(10px,3vw,28px); flex-wrap:wrap; margin-top:14px; }
        .bb-new { font:inherit; font-weight:700; font-size:0.9rem; padding:11px 20px; border-radius:999px; border:1px solid var(--bdb-line); background:var(--bdb-amber); color:var(--bdb-ink); cursor:pointer; }
        .bb-hint { text-align:center; color:var(--bdb-ink-soft); font-size:0.9rem; line-height:1.5; margin:14px auto 0; max-width:520px; }
      `}</style>

      <LiveToolBanner tool={liveTool} />

      <div className="bb-head">
        <div className="bb-goal">Goal: get the <span className="q">?</span> box all by itself.</div>
        <div className="bb-goalsub">Take the same number of blocks off both sides to keep it fair.</div>
        <div className="bb-eq">{eqStr}</div>
        <div className={`bb-status ${solved ? "ok" : balanced ? "bal" : "off"}`}>
          {solved ? `Solved — the ? weighs ${prob.unknown}` : balanced ? "Balanced" : "Off balance — even it up on both sides"}
        </div>
      </div>

      <div className="bb-stage" style={{ width: STAGE_W, height: STAGE_H, maxWidth: "100%" }}>
        <div className="bb-base" />
        <div className="bb-fulcrum" />
        <div className="bb-equals">=</div>
        <div className="bb-beam" style={{ transform: `rotate(${angle}deg)` }} />
        <div className="bb-cap" />
        {pan("L", lx, ly, leftUnits, true)}
        {pan("R", rx, ry, rightUnits, false)}
      </div>

      <div className="bb-controls">
        <div className="bb-supply">
          <div className="bb-supply-block" onPointerDown={startDrag("supply")} title="Drag a 1 onto a side">1</div>
          <span className="bb-supply-label">Drag a 1 on</span>
        </div>
        <button className="bb-new" onClick={() => startProblem(makeProblem())}>New problem</button>
      </div>

      <p className="bb-hint">The <b>?</b> box has a mystery weight; every plain block weighs 1. <b>Drag</b> a block off a side to remove it, or drag one from the bottom onto a side. Keep the beam level — whatever you do to one side, do to the other. Get the <b>?</b> alone and the blocks left on the other side tell you what it weighs.</p>

      {dragging && <div className="bb-ghost" style={{ left: pos.x, top: pos.y }}>1</div>}
    </div>
  );
}
