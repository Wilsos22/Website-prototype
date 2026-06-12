"use client";

// Number Line tool.
// • Integers mode: drag the dot along −10…10. Absolute-value toggle draws a dotted
//   skip-line back to 0 and counts the spaces. Problem mode (e.g. −3 + 6): start at
//   −3, drag the dot and watch hops + a running expression until you land on the answer.
// • Parts mode: 0…1 split into 16ths; the dot snaps to the nearest 16th and the
//   readout rotates between fraction, decimal, and percent.

import { useRef, useState, useCallback } from "react";

type Mode = "int" | "parts";
type Rep = "fraction" | "decimal" | "percent";
const W = 760, L = 44, R = 716, Y = 168, H = 230;

function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }

const PROBLEMS: [number, number][] = [[-3, 6], [5, -8], [-4, -3], [2, 7], [8, -10]];

export default function NumberLineTool() {
  const [mode, setMode] = useState<Mode>("int");
  const [rep, setRep] = useState<Rep>("fraction");
  const [absVal, setAbsVal] = useState(false);
  const [problem, setProblem] = useState<[number, number] | null>(null);
  const [value, setValue] = useState(0);
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const lastTick = useRef<number>(0);

  const min = mode === "int" ? -10 : 0;
  const max = mode === "int" ? 10 : 1;
  const step = mode === "int" ? 1 : 1 / 16;

  const tone = useCallback((f: number, dur = 0.06) => {
    try {
      audioRef.current = audioRef.current ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const ctx = audioRef.current; const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      o.start(); o.stop(ctx.currentTime + dur + 0.02);
    } catch { /* ignore */ }
  }, []);

  const valueToX = (v: number) => L + ((v - min) / (max - min)) * (R - L);

  function setFromClientX(clientX: number) {
    const svg = svgRef.current; if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * W;
    let frac = (sx - L) / (R - L); frac = Math.max(0, Math.min(1, frac));
    const raw = min + frac * (max - min);
    const snapped = Math.max(min, Math.min(max, Math.round(raw / step) * step));
    if (snapped !== value) {
      if (Math.round(snapped / step) !== lastTick.current) { tone(mode === "int" ? 440 + snapped * 18 : 500 + snapped * 200); lastTick.current = Math.round(snapped / step); }
      setValue(snapped);
    }
  }

  function onDown(e: React.PointerEvent) { setDragging(true); (e.target as Element).setPointerCapture?.(e.pointerId); setFromClientX(e.clientX); }
  function onMove(e: React.PointerEvent) { if (dragging) setFromClientX(e.clientX); }
  function onUp() { setDragging(false); }

  function startProblem(p: [number, number]) { setMode("int"); setProblem(p); setValue(p[0]); setAbsVal(false); }

  // labels
  function repLabel(v: number): string {
    if (rep === "percent") return `${Math.round(v * 100 * 10) / 10}%`;
    if (rep === "decimal") return String(Math.round(v * 1000) / 1000);
    const k = Math.round(v * 16), g = gcd(k, 16) || 1;
    return k === 0 ? "0" : k === 16 ? "1" : `${k / g}/${16 / g}`;
  }

  const target = problem ? problem[0] + problem[1] : null;
  const solvedProblem = problem && value === target;
  const hopsDone = problem ? Math.abs(value - problem[0]) : 0;
  const dir = problem ? Math.sign(problem[1]) : 0;

  // build tick marks
  const ticks: { v: number; major: boolean; label?: string }[] = [];
  if (mode === "int") {
    for (let v = -10; v <= 10; v++) ticks.push({ v, major: v % 5 === 0, label: String(v) });
  } else {
    for (let k = 0; k <= 16; k++) {
      const v = k / 16; const major = k % 4 === 0;
      ticks.push({ v, major, label: major ? repLabel(v) : undefined });
    }
  }

  // hop arcs for problem mode
  const hops: React.ReactNode[] = [];
  if (problem && dir !== 0) {
    for (let i = problem[0]; i !== value; i += dir) {
      const x1 = valueToX(i), x2 = valueToX(i + dir);
      const mx = (x1 + x2) / 2;
      hops.push(<path key={`h${i}`} d={`M ${x1} ${Y} Q ${mx} ${Y - 46} ${x2} ${Y}`} fill="none" stroke="#22c55e" strokeWidth={3} markerEnd="url(#arrow)" />);
      hops.push(<text key={`ht${i}`} x={mx} y={Y - 50} fill="#86efac" fontSize="13" fontWeight="800" textAnchor="middle">{dir > 0 ? "+1" : "−1"}</text>);
    }
  }
  // absolute-value skip line
  const absArcs: React.ReactNode[] = [];
  if (mode === "int" && absVal && !problem && value !== 0) {
    const d = value > 0 ? -1 : 1;
    for (let i = value; i !== 0; i += d) {
      const x1 = valueToX(i), x2 = valueToX(i + d); const mx = (x1 + x2) / 2;
      absArcs.push(<path key={`a${i}`} d={`M ${x1} ${Y} Q ${mx} ${Y - 38} ${x2} ${Y}`} fill="none" stroke="#f59e0b" strokeWidth={2.5} strokeDasharray="5 4" />);
    }
  }

  return (
    <div className="nl-root">
      <style>{`
        .nl-root { min-height:100vh; background:#0b0d14; color:#fff; font-family:Inter,ui-sans-serif,system-ui,sans-serif; display:grid; grid-template-rows:auto 1fr auto; }
        .nl-top { display:flex; align-items:center; justify-content:space-between; padding:14px 24px; border-bottom:1px solid #1f2332; flex-wrap:wrap; gap:8px; }
        .nl-mark { font-size:0.76rem; font-weight:900; letter-spacing:0.14em; text-transform:uppercase; color:#38bdf8; margin:0; }
        .nl-btn { font-size:0.8rem; font-weight:800; color:#8a93ad; background:transparent; border:1px solid #1f2332; border-radius:7px; padding:8px 13px; cursor:pointer; text-decoration:none; }
        .nl-btn:hover { border-color:#38bdf8; color:#fff; }
        .nl-main { padding:22px 18px; display:grid; gap:18px; justify-items:center; max-width:920px; margin:0 auto; width:100%; }
        .nl-controls { display:flex; gap:16px; flex-wrap:wrap; justify-content:center; align-items:center; }
        .nl-seg { display:inline-flex; border:1px solid #2a3045; border-radius:9px; overflow:hidden; }
        .nl-seg button { background:#121520; border:none; color:#8a93ad; font-weight:800; font-size:0.84rem; padding:8px 13px; cursor:pointer; }
        .nl-seg button.on { background:#38bdf8; color:#04222e; }
        .nl-toggle { font-size:0.82rem; font-weight:800; color:#fcd34d; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.4); border-radius:8px; padding:8px 13px; cursor:pointer; }
        .nl-toggle.on { background:#f59e0b; color:#3a2503; }
        .nl-readout { font-size:clamp(1.6rem,5vw,2.8rem); font-weight:900; text-align:center; }
        .nl-sub { font-size:1rem; font-weight:700; color:#9aa3bd; text-align:center; min-height:1.3em; }
        .nl-svg { width:100%; max-width:760px; touch-action:none; cursor:pointer; user-select:none; }
        .nl-presets { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
        .nl-preset { font-size:0.85rem; font-weight:800; color:#c8cedd; background:#121520; border:1px solid #1f2332; border-radius:999px; padding:7px 13px; cursor:pointer; }
        .nl-preset:hover { border-color:#38bdf8; }
        .nl-foot { padding:12px 24px; border-top:1px solid #1f2332; display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; }
      `}</style>

      <header className="nl-top">
        <p className="nl-mark">Number Line</p>
        <a className="nl-btn" href="/">Home</a>
      </header>

      <main className="nl-main">
        <div className="nl-controls">
          <div className="nl-seg">
            <button className={mode === "int" ? "on" : ""} onClick={() => { setMode("int"); setProblem(null); }}>Integers</button>
            <button className={mode === "parts" ? "on" : ""} onClick={() => { setMode("parts"); setProblem(null); setValue(0); }}>Parts of a whole</button>
          </div>
          {mode === "parts" && (
            <div className="nl-seg">
              {(["fraction", "decimal", "percent"] as Rep[]).map((r) => <button key={r} className={rep === r ? "on" : ""} onClick={() => setRep(r)}>{r[0].toUpperCase() + r.slice(1)}</button>)}
            </div>
          )}
          {mode === "int" && !problem && (
            <button className={`nl-toggle${absVal ? " on" : ""}`} onClick={() => setAbsVal((v) => !v)}>|x| absolute value</button>
          )}
          {problem && <button className="nl-btn" onClick={() => setProblem(null)}>Exit problem</button>}
        </div>

        <div className="nl-readout">
          {problem
            ? <>{problem[0]} {problem[1] >= 0 ? "+" : "−"} {Math.abs(problem[1])} = {solvedProblem ? <span style={{ color: "#22c55e" }}>{target} ✓</span> : <span style={{ color: "#9aa3bd" }}>?</span>}</>
            : mode === "int"
              ? <>{value}{absVal && value !== 0 ? <span style={{ color: "#f59e0b" }}>　|{value}| = {Math.abs(value)}</span> : ""}</>
              : repLabel(value)}
        </div>
        <div className="nl-sub">
          {problem
            ? (solvedProblem ? "You landed on the answer!" : `At ${value} · ${hopsDone} of ${Math.abs(problem[1])} hops — drag the dot ${dir > 0 ? "right" : "left"}.`)
            : mode === "int"
              ? (absVal ? "The dot's distance from 0 is its absolute value." : "Drag the dot. Try a problem below, or turn on absolute value.")
              : "Drag the dot — it snaps to the nearest sixteenth."}
        </div>

        <svg ref={svgRef} className="nl-svg" viewBox={`0 0 ${W} ${H}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#22c55e" /></marker>
          </defs>
          {/* main line */}
          <line x1={L} y1={Y} x2={R} y2={Y} stroke="#5a6280" strokeWidth={3} />
          <path d={`M ${L} ${Y} l 10 -6 l 0 12 Z`} fill="#5a6280" />
          <path d={`M ${R} ${Y} l -10 -6 l 0 12 Z`} fill="#5a6280" />
          {/* ticks */}
          {ticks.map((t, i) => {
            const x = valueToX(t.v);
            return (
              <g key={i}>
                <line x1={x} y1={Y - (t.major ? 12 : 7)} x2={x} y2={Y + (t.major ? 12 : 7)} stroke={t.major ? "#8a93ad" : "#3a4460"} strokeWidth={t.major ? 2.5 : 1.5} />
                {t.label !== undefined && <text x={x} y={Y + 34} fill="#9aa3bd" fontSize={mode === "int" ? "14" : "15"} fontWeight="700" textAnchor="middle">{t.label}</text>}
              </g>
            );
          })}
          {/* zero emphasis (int) */}
          {mode === "int" && <line x1={valueToX(0)} y1={Y - 16} x2={valueToX(0)} y2={Y + 16} stroke="#e8ecf5" strokeWidth={3} />}
          {absArcs}
          {hops}
          {/* dot */}
          <circle cx={valueToX(value)} cy={Y} r={dragging ? 16 : 13} fill="#38bdf8" stroke="#fff" strokeWidth={3} style={{ transition: dragging ? "none" : "cx 120ms ease" }} />
          {problem && <circle cx={valueToX(problem[0])} cy={Y} r={7} fill="#a78bfa" />}
        </svg>

        <div className="nl-presets">
          <span style={{ color: "#5a6280", fontWeight: 800, fontSize: "0.8rem", alignSelf: "center" }}>Problems:</span>
          {PROBLEMS.map((p, i) => <button className="nl-preset" key={i} onClick={() => startProblem(p)}>{p[0]} {p[1] >= 0 ? "+" : "−"} {Math.abs(p[1])}</button>)}
        </div>
      </main>

      <footer className="nl-foot">
        <span className="nl-btn" style={{ borderColor: "transparent", cursor: "default" }}>Drag the blue dot. Green arcs = the hops you make.</span>
        <a className="nl-btn" href="/control">Control panel</a>
      </footer>
    </div>
  );
}
