"use client";

// Balance Beam — solve "? + p = q" by keeping a scale level. The unknown is a
// "?" box with a hidden weight; unit blocks each weigh 1. Take a block off one
// side and the beam tilts; students learn they must do the SAME to both sides to
// keep it balanced, and they solve by getting the ? box alone.

import { useCallback, useEffect, useRef, useState } from "react";
import { reportToolResult } from "@/lib/toolEvidence";

const STAGE_W = 640;
const STAGE_H = 430;
const PIVOT_X = 320;
const PIVOT_Y = 250;
const H = 172;          // beam half-length (px)
const K = 2.6;          // degrees of tilt per unit of weight difference
const MAX_TILT = 13;    // clamp so it never flips over
const WRAP_H = 210;     // side wrapper height; blocks stack upward inside it

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Problem { unknown: number; leftUnits: number; rightUnits: number }
function makeProblem(): Problem {
  const unknown = 1 + Math.floor(Math.random() * 5); // 1..5
  const p = 1 + Math.floor(Math.random() * 4);       // 1..4
  return { unknown, leftUnits: p, rightUnits: unknown + p };
}

export default function BalanceBeam() {
  const [prob, setProb] = useState<Problem>({ unknown: 2, leftUnits: 3, rightUnits: 5 });
  const [leftUnits, setLeftUnits] = useState(3);
  const [rightUnits, setRightUnits] = useState(5);
  const solvedRef = useRef(false);

  const startProblem = useCallback((p: Problem) => {
    setProb(p); setLeftUnits(p.leftUnits); setRightUnits(p.rightUnits); solvedRef.current = false;
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

  const change = (side: "L" | "R", delta: number) => {
    if (side === "L") setLeftUnits((u) => Math.max(0, u + delta));
    else setRightUnits((u) => Math.max(0, u + delta));
  };

  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const lx = PIVOT_X - H * cos, ly = PIVOT_Y - H * sin;
  const rx = PIVOT_X + H * cos, ry = PIVOT_Y + H * sin;

  const eqStr = `${leftUnits > 0 ? `?  +  ${leftUnits}` : "?"}   =   ${rightUnits}`;

  const side = (s: "L" | "R", x: number, y: number, units: number, withBox: boolean) => (
    <div className="bb-side" style={{ left: x - 110, top: y - WRAP_H }}>
      <div className="bb-blocks">
        {withBox && <div className="bb-box" title="The unknown — get it by itself">?</div>}
        {Array.from({ length: units }).map((_, i) => (
          <button key={i} className="bb-unit" title="Take one off" onClick={() => change(s, -1)}>1</button>
        ))}
      </div>
      <div className="bb-tray" />
    </div>
  );

  return (
    <div className="bb-wrap">
      <style>{`
        .bb-wrap { font-family:var(--bdb-font); color:var(--bdb-ink); max-width:720px; margin:0 auto; padding:12px clamp(10px,3vw,20px) 28px; }
        .bb-head { text-align:center; margin-bottom:2px; }
        .bb-eq { font-size:clamp(1.8rem,5vw,2.6rem); font-weight:800; letter-spacing:0.02em; }
        .bb-status { font-weight:700; font-size:0.95rem; margin-top:2px; min-height:22px; }
        .bb-status.bal { color:var(--bdb-green); }
        .bb-status.off { color:var(--bdb-coral); }
        .bb-status.ok  { color:var(--bdb-green); }

        .bb-stage { position:relative; margin:0 auto; overflow:visible; }
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
        .bb-unit { background:var(--bdb-teal); color:#fff; border:none; cursor:pointer; box-shadow:inset 0 -3px 0 rgba(0,0,0,0.15); transition:transform 120ms; font-family:inherit; }
        .bb-unit:hover { transform:translateY(-2px); }
        .bb-unit:active { transform:scale(0.94); }
        .bb-box { background:#fff; color:var(--bdb-ink); border:3px dashed var(--bdb-coral); font-size:1.4rem; }
        .bb-tray { width:150px; height:12px; border-radius:7px; background:var(--bdb-brown); box-shadow:0 2px 4px rgba(0,0,0,0.18); }

        .bb-controls { display:flex; align-items:center; justify-content:center; gap:clamp(10px,3vw,28px); flex-wrap:wrap; margin-top:14px; }
        .bb-ctl { display:flex; flex-direction:column; align-items:center; gap:6px; }
        .bb-ctl-label { font-size:0.72rem; font-weight:800; letter-spacing:0.1em; text-transform:uppercase; color:var(--bdb-ink-faint); }
        .bb-btn { font:inherit; font-weight:700; font-size:0.88rem; padding:9px 15px; border-radius:11px; border:1px solid var(--bdb-line); background:var(--bdb-ink); color:#fff; cursor:pointer; }
        .bb-btn.ghost { background:var(--bdb-card); color:var(--bdb-ink); }
        .bb-btn:disabled { opacity:0.4; cursor:default; }
        .bb-new { font:inherit; font-weight:700; font-size:0.9rem; padding:11px 20px; border-radius:999px; border:1px solid var(--bdb-line); background:var(--bdb-amber); color:var(--bdb-ink); cursor:pointer; }
        .bb-hint { text-align:center; color:var(--bdb-ink-soft); font-size:0.9rem; line-height:1.5; margin:16px auto 0; max-width:520px; }
      `}</style>

      <div className="bb-head">
        <div className="bb-eq">{eqStr}</div>
        <div className={`bb-status ${solved ? "ok" : balanced ? "bal" : "off"}`}>
          {solved ? `Solved — the ? weighs ${rightUnits}` : balanced ? "Balanced" : "Off balance — do the same thing to both sides"}
        </div>
      </div>

      <div className="bb-stage" style={{ width: STAGE_W, height: STAGE_H, maxWidth: "100%" }}>
        <div className="bb-base" />
        <div className="bb-fulcrum" />
        <div className="bb-equals">=</div>
        <div className="bb-beam" style={{ transform: `rotate(${angle}deg)` }} />
        <div className="bb-cap" />
        {side("L", lx, ly, leftUnits, true)}
        {side("R", rx, ry, rightUnits, false)}
      </div>

      <div className="bb-controls">
        <div className="bb-ctl">
          <span className="bb-ctl-label">Left side</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="bb-btn" onClick={() => change("L", -1)} disabled={leftUnits === 0}>Take 1 off</button>
            <button className="bb-btn ghost" onClick={() => change("L", +1)}>Add 1</button>
          </div>
        </div>
        <button className="bb-new" onClick={() => startProblem(makeProblem())}>New problem</button>
        <div className="bb-ctl">
          <span className="bb-ctl-label">Right side</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="bb-btn" onClick={() => change("R", -1)} disabled={rightUnits === 0}>Take 1 off</button>
            <button className="bb-btn ghost" onClick={() => change("R", +1)}>Add 1</button>
          </div>
        </div>
      </div>

      <p className="bb-hint">The <b>?</b> box has a mystery weight; every plain block weighs 1. Keep the beam level — whatever you do to one side, do to the other. Get the <b>?</b> all by itself and the blocks left on the other side tell you what it weighs.</p>
    </div>
  );
}
