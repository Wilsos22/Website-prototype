"use client";

// Coordinate Grid — plot a given point by clicking the grid, or identify a shown
// point by typing its coordinates. Toggle all four quadrants vs Quadrant 1.

import { useCallback, useEffect, useRef, useState } from "react";
import { LiveToolBanner, useLiveToolConfig } from "./useLiveToolConfig";

type Mode = "plot" | "identify";
type Quad = "all" | "q1";
interface Pt { x: number; y: number; }

const S = 440;
const P = 36;

export default function CoordinateGrid() {
  const liveTool = useLiveToolConfig("/coordinate-grid");
  const [mode, setMode] = useState<Mode>("plot");
  const [quad, setQuad] = useState<Quad>("all");
  const [target, setTarget] = useState<Pt>({ x: 3, y: -2 });
  const [plotted, setPlotted] = useState<Pt | null>(null);
  const [inX, setInX] = useState("");
  const [inY, setInY] = useState("");
  const [feedback, setFeedback] = useState("Click the grid to plot the point.");
  const [solved, setSolved] = useState(false);
  const [hint, setHint] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  const min = quad === "q1" ? 0 : -10;
  const max = 10;
  const span = max - min;

  const x2px = (v: number) => P + ((v - min) / span) * (S - 2 * P);
  const y2py = (v: number) => P + ((max - v) / span) * (S - 2 * P);

  const tone = useCallback((freqs: number[], dur = 0.15) => {
    try {
      audioRef.current = audioRef.current ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const ctx = audioRef.current;
      freqs.forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        o.connect(g);
        g.connect(ctx.destination);
        const t = ctx.currentTime + i * 0.08;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.start(t);
        o.stop(t + dur + 0.02);
      });
    } catch {
      /* ignore */
    }
  }, []);

  const newPoint = useCallback(() => {
    const rnd = () => (quad === "q1" ? Math.floor(Math.random() * 10) + 1 : Math.floor(Math.random() * 21) - 10);
    let x = rnd();
    const y = rnd();
    if (quad !== "q1" && x === 0 && y === 0) x = 1;
    setTarget({ x, y });
    setPlotted(null);
    setInX("");
    setInY("");
    setSolved(false);
    setHint(false);
    setFeedback(mode === "plot" ? `Plot the point (${x}, ${y}).` : "Type the coordinates of the orange point.");
  }, [quad, mode]);

  useEffect(() => {
    newPoint();
  }, [quad, mode, newPoint]);

  function clamp(v: number) {
    return Math.max(min, Math.min(max, v));
  }
  function valX(px: number) {
    return clamp(Math.round(((px - P) / (S - 2 * P)) * span + min));
  }
  function valY(py: number) {
    return clamp(Math.round(max - ((py - P) / (S - 2 * P)) * span));
  }

  function onGridClick(e: React.MouseEvent<SVGSVGElement>) {
    if (mode !== "plot" || solved) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * S;
    const py = ((e.clientY - rect.top) / rect.height) * S;
    const gx = valX(px);
    const gy = valY(py);
    setPlotted({ x: gx, y: gy });
    setFeedback(`Placed (${gx}, ${gy}). Press Check when it looks right.`);
  }

  function check() {
    if (mode === "plot") {
      if (!plotted) {
        setFeedback("Tap the grid to place your point first.");
        return;
      }
      if (plotted.x === target.x && plotted.y === target.y) {
        setSolved(true);
        setFeedback(`Yes! (${target.x}, ${target.y}) is exactly right.`);
        tone([523, 784, 1047]);
      } else {
        tone([180, 140]);
        setFeedback(`Not yet — you placed (${plotted.x}, ${plotted.y}) but need (${target.x}, ${target.y}). Move right/left for x, up/down for y.`);
      }
    } else {
      if (inX.trim() === "" || inY.trim() === "") {
        setFeedback("Fill in both x and y.");
        return;
      }
      const x = Number(inX);
      const y = Number(inY);
      if (x === target.x && y === target.y) {
        setSolved(true);
        setFeedback(`Correct! The point is (${target.x}, ${target.y}).`);
        tone([523, 784, 1047]);
      } else {
        tone([180, 140]);
        setFeedback("Not quite — check the signs. Right is +x, up is +y. The first number is across, the second is up/down.");
      }
    }
  }

  // grid lines and labels
  const ints: number[] = [];
  for (let i = min; i <= max; i++) ints.push(i);
  const labelInts = ints.filter((i) => i !== 0 && i % 2 === 0);

  const shown = mode === "identify" ? target : plotted;

  return (
    <main className="cg-root">
      <style>{`
        .cg-root { min-height:100vh; background:var(--bdb-ground); color:var(--bdb-ink); font-family:var(--bdb-font);
          display:grid; grid-template-rows:auto 1fr auto; }
        .cg-main { width:min(900px,100%); margin:0 auto; padding:clamp(14px,3vw,26px) 16px; display:grid;
          grid-template-columns:minmax(0,1fr) minmax(240px,300px); gap:20px; align-items:start; }
        @media (max-width:780px){ .cg-main { grid-template-columns:1fr; } }
        .cg-kicker { margin:0 0 6px; text-align:center; font-size:0.74rem; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; color:var(--bdb-ink-faint); }
        .cg-svgwrap { background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r-lg); padding:10px; }
        .cg-svg { width:100%; height:auto; display:block; touch-action:manipulation; cursor:crosshair; }

        .cg-panel { display:grid; gap:14px; }
        .cg-seg { display:inline-flex; border:1px solid var(--bdb-line); border-radius:10px; overflow:hidden; }
        .cg-seg button { flex:1; background:var(--bdb-card); border:none; color:var(--bdb-ink-soft); font-family:inherit;
          font-weight:700; font-size:0.86rem; padding:9px 12px; cursor:pointer; }
        .cg-seg button.on { background:var(--bdb-teal); color:#fff; }
        .cg-prompt { font-size:1.35rem; font-weight:800; color:var(--bdb-ink); text-align:center; }
        .cg-prompt .pt { color:var(--bdb-coral); }
        .cg-inputs { display:flex; gap:10px; justify-content:center; align-items:center; }
        .cg-inputs label { display:flex; align-items:center; gap:6px; font-weight:800; font-size:1.1rem; color:var(--bdb-ink-soft); }
        .cg-inputs input { width:74px; min-height:48px; border:2px solid var(--bdb-line); border-radius:10px; background:var(--bdb-card);
          text-align:center; font-family:inherit; font-weight:800; font-size:1.3rem; color:var(--bdb-ink); }
        .cg-inputs input:focus { outline:none; border-color:var(--bdb-teal); }
        .cg-fb { min-height:48px; border:1px solid var(--bdb-line); border-radius:var(--bdb-r); background:var(--bdb-ground);
          padding:12px 14px; font-weight:600; line-height:1.35; color:var(--bdb-ink-soft); text-align:center; }
        .cg-fb.good { border-color:var(--bdb-green); background:color-mix(in srgb, var(--bdb-green) 12%, #fff); color:var(--bdb-green); }
        .cg-row { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; }
        .cg-btn { min-height:48px; padding:0 18px; border-radius:999px; border:1px solid var(--bdb-line);
          background:var(--bdb-card); color:var(--bdb-ink); font-family:inherit; font-weight:700; cursor:pointer; }
        .cg-btn.primary { background:var(--bdb-coral); border-color:var(--bdb-coral); color:#fff; }
        .cg-btn:hover { filter:brightness(1.03); }
        .cg-hint { font-size:0.86rem; font-weight:600; color:var(--bdb-brown); text-align:center;
          background:color-mix(in srgb, var(--bdb-amber) 14%, #fff); border:1px solid color-mix(in srgb, var(--bdb-amber) 40%, transparent);
          border-radius:10px; padding:10px 12px; }
        @keyframes cgPop { from{ transform:scale(0); } to{ transform:scale(1); } }
      `}</style>

      <p className="cg-kicker" style={{ paddingTop: 14 }}>Coordinate Grid</p>

      <div className="cg-main">
        {/* .cg-main is a two-column grid, so the banner spans both columns. */}
        <LiveToolBanner tool={liveTool} style={{ gridColumn: "1 / -1" }} />

        <div className="cg-svgwrap">
          <svg ref={svgRef} className="cg-svg" viewBox={`0 0 ${S} ${S}`} onClick={onGridClick}>
            {/* grid lines */}
            {ints.map((i) => (
              <g key={`g${i}`}>
                <line x1={x2px(i)} y1={P} x2={x2px(i)} y2={S - P} stroke="var(--bdb-line)" strokeWidth={i === 0 ? 0 : 1} />
                <line x1={P} y1={y2py(i)} x2={S - P} y2={y2py(i)} stroke="var(--bdb-line)" strokeWidth={i === 0 ? 0 : 1} />
              </g>
            ))}
            {/* axes */}
            <line x1={x2px(0)} y1={P - 6} x2={x2px(0)} y2={S - P + 6} stroke="var(--bdb-ink)" strokeWidth={2.5} />
            <line x1={P - 6} y1={y2py(0)} x2={S - P + 6} y2={y2py(0)} stroke="var(--bdb-ink)" strokeWidth={2.5} />
            {/* arrowheads */}
            <path d={`M ${S - P + 6} ${y2py(0)} l -8 -5 l 0 10 Z`} fill="var(--bdb-ink)" />
            <path d={`M ${x2px(0)} ${P - 6} l -5 8 l 10 0 Z`} fill="var(--bdb-ink)" />
            {/* axis labels */}
            {labelInts.map((i) => (
              <text key={`lx${i}`} x={x2px(i)} y={y2py(0) + 16} fill="var(--bdb-ink-faint)" fontSize="11" fontWeight="700" textAnchor="middle">{i}</text>
            ))}
            {labelInts.map((i) => (
              <text key={`ly${i}`} x={x2px(0) - 9} y={y2py(i) + 4} fill="var(--bdb-ink-faint)" fontSize="11" fontWeight="700" textAnchor="end">{i}</text>
            ))}
            <text x={x2px(0) - 8} y={y2py(0) + 16} fill="var(--bdb-ink-faint)" fontSize="11" fontWeight="700" textAnchor="end">0</text>

            {/* the point */}
            {shown && (
              <g style={{ transformOrigin: `${x2px(shown.x)}px ${y2py(shown.y)}px`, animation: "cgPop 0.3s cubic-bezier(.2,.8,.2,1.4)" }}>
                <circle cx={x2px(shown.x)} cy={y2py(shown.y)} r={9}
                  fill={mode === "identify" ? "var(--bdb-coral)" : "var(--bdb-teal)"} stroke="#fff" strokeWidth={3} />
                {(solved || mode === "plot") && (
                  <text x={x2px(shown.x) + 12} y={y2py(shown.y) - 10} fill="var(--bdb-ink)" fontSize="13" fontWeight="800">
                    ({shown.x}, {shown.y})
                  </text>
                )}
              </g>
            )}
          </svg>
        </div>

        <div className="cg-panel">
          <div className="cg-seg">
            <button className={mode === "plot" ? "on" : ""} onClick={() => setMode("plot")}>Plot a point</button>
            <button className={mode === "identify" ? "on" : ""} onClick={() => setMode("identify")}>Identify a point</button>
          </div>
          <div className="cg-seg">
            <button className={quad === "all" ? "on" : ""} onClick={() => setQuad("all")}>All 4 quadrants</button>
            <button className={quad === "q1" ? "on" : ""} onClick={() => setQuad("q1")}>Quadrant 1</button>
          </div>

          {mode === "plot" ? (
            <p className="cg-prompt">Plot <span className="pt">({target.x}, {target.y})</span></p>
          ) : (
            <div className="cg-inputs">
              <label>x =<input inputMode="numeric" value={inX} onChange={(e) => setInX(e.target.value.replace(/[^\d-]/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") check(); }} /></label>
              <label>y =<input inputMode="numeric" value={inY} onChange={(e) => setInY(e.target.value.replace(/[^\d-]/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") check(); }} /></label>
            </div>
          )}

          <div className={`cg-fb${solved ? " good" : ""}`}>{feedback}</div>

          {hint && (
            <div className="cg-hint">
              {mode === "plot"
                ? "Start at 0. The first number tells you how far across (right is +, left is −). The second tells you how far up (+) or down (−)."
                : "Read across first for x (right +, left −), then up/down for y (up +, down −)."}
            </div>
          )}

          <div className="cg-row">
            {!solved && <button className="cg-btn primary" onClick={check}>Check</button>}
            {!solved && <button className="cg-btn" onClick={() => setHint((h) => !h)}>{hint ? "Hide hint" : "Hint"}</button>}
            <button className="cg-btn" onClick={newPoint}>{solved ? "Next point →" : "New point"}</button>
          </div>
        </div>
      </div>

      <div style={{ height: 8 }} />
    </main>
  );
}
