"use client";

// Group Bars — fraction / decimal / percent.
// Pick a piece size (1/2 … 1/12). Tap "Add piece" to stack copies along the whole
// bar; a repeated-addition expression builds live above (20% + 20% + 20% …) with a
// running total, until the pieces fill exactly one whole. Toggle the label between
// fraction, decimal, and percent — the same pieces, three ways.

import { useRef, useState, useCallback } from "react";

type Rep = "fraction" | "decimal" | "percent";
const DENOMS = [2, 3, 4, 5, 6, 8, 10, 12];

function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }
function trim(n: number): string { return String(Math.round(n * 1000) / 1000); }

function label(num: number, den: number, rep: Rep): string {
  if (rep === "percent") return `${Math.round((100 * num) / den * 10) / 10}%`;
  if (rep === "decimal") return trim(num / den);
  const g = gcd(num, den) || 1;
  const a = num / g, b = den / g;
  return b === 1 ? String(a) : `${a}/${b}`;
}

export default function GroupBars() {
  const [den, setDen] = useState(5);
  const [count, setCount] = useState(0);
  const [rep, setRep] = useState<Rep>("percent");
  const audioRef = useRef<AudioContext | null>(null);

  const filled = count >= den;

  const tone = useCallback((freqs: number[], gap = 0.09, dur = 0.14) => {
    try {
      audioRef.current = audioRef.current ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const ctx = audioRef.current;
      freqs.forEach((f, i) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
        const t = ctx.currentTime + i * gap;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.start(t); o.stop(t + dur + 0.02);
      });
    } catch { /* ignore */ }
  }, []);

  function pickDen(d: number) { setDen(d); setCount(0); }
  function add() {
    if (count >= den) return;
    const n = count + 1; setCount(n);
    if (n >= den) tone([523, 659, 784, 1047], 0.1, 0.18); else tone([440 + count * 30]);
  }
  function remove() { if (count > 0) setCount(count - 1); }

  const piece = label(1, den, rep);
  const total = label(count, den, rep);
  const expr = count === 0 ? "—" : Array.from({ length: count }, () => piece).join(" + ") + " = " + total;

  return (
    <div className="gb-root">
      <style>{`
        .gb-root { min-height:100vh; background:var(--bdb-ground); color:var(--bdb-ink); font-family:var(--bdb-font); display:grid; grid-template-rows:auto 1fr auto; }
        .gb-top { display:flex; align-items:center; justify-content:space-between; padding:14px 24px; border-bottom:1px solid var(--bdb-line); flex-wrap:wrap; gap:8px; }
        .gb-mark { font-size:0.76rem; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; color:var(--bdb-teal); margin:0; }
        .gb-btn { font-size:0.8rem; font-weight:700; color:var(--bdb-ink-soft); background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:999px; padding:8px 13px; cursor:pointer; text-decoration:none; }
        .gb-btn:hover { border-color:var(--bdb-teal); color:var(--bdb-ink); }

        .gb-main { padding:24px; display:grid; gap:22px; align-content:start; justify-items:center; max-width:920px; margin:0 auto; width:100%; }
        .gb-controls { display:flex; gap:18px; flex-wrap:wrap; justify-content:center; align-items:center; }
        .gb-group { display:grid; gap:6px; justify-items:center; }
        .gb-glabel { font-size:0.68rem; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:var(--bdb-ink-faint); }
        .gb-seg { display:inline-flex; border:1px solid var(--bdb-line); border-radius:9px; overflow:hidden; flex-wrap:wrap; }
        .gb-seg button { background:var(--bdb-card); border:none; color:var(--bdb-ink-soft); font-weight:700; font-size:0.86rem; padding:8px 12px; cursor:pointer; }
        .gb-seg button.on { background:var(--bdb-teal); color:#fff; }

        .gb-prompt { font-size:clamp(1.1rem,2.8vw,1.5rem); font-weight:700; text-align:center; color:var(--bdb-ink); }
        .gb-expr { font-size:clamp(1rem,2.6vw,1.5rem); font-weight:800; color:var(--bdb-teal); text-align:center; word-break:break-word; min-height:1.4em; }

        .gb-bar { width:100%; height:84px; border:2px solid var(--bdb-ink); border-radius:14px; display:flex; overflow:hidden; background:var(--bdb-card); }
        .gb-slot { flex:1 1 0; border-right:2px solid var(--bdb-line); display:grid; place-items:center; font-weight:800; font-size:0.95rem; transition:background 200ms ease, color 200ms ease; color:var(--bdb-ink-faint); }
        .gb-slot:last-child { border-right:none; }
        .gb-slot.fill { color:var(--bdb-ink); animation:gbPop 0.3s ease; }
        @keyframes gbPop { from{transform:scale(0.9); opacity:0.4;} to{transform:none; opacity:1;} }
        .gb-meter { font-size:0.95rem; font-weight:700; color:var(--bdb-ink-soft); text-align:center; }

        .gb-actions { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; }
        .gb-a { font-size:1.1rem; font-weight:800; border-radius:12px; padding:13px 26px; cursor:pointer; border:1px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink); }
        .gb-a:hover { border-color:var(--bdb-teal); }
        .gb-a.add { background:var(--bdb-teal); border-color:var(--bdb-teal); color:#fff; }
        .gb-a:disabled { opacity:0.35; cursor:not-allowed; }
        .gb-solved { font-size:clamp(1.1rem,2.8vw,1.5rem); font-weight:800; color:var(--bdb-green); text-align:center; min-height:1.4em; }
        .gb-foot { padding:12px 24px; border-top:1px solid var(--bdb-line); display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; }
      `}</style>

      <header className="gb-top">
        <p className="gb-mark">Group Bars — Fraction · Decimal · Percent</p>
        <a className="gb-btn" href="/">Home</a>
      </header>

      <main className="gb-main">
        <div className="gb-controls">
          <div className="gb-group">
            <span className="gb-glabel">Show as</span>
            <div className="gb-seg">
              {(["fraction", "decimal", "percent"] as Rep[]).map((r) => (
                <button key={r} className={rep === r ? "on" : ""} onClick={() => setRep(r)}>{r[0].toUpperCase() + r.slice(1)}</button>
              ))}
            </div>
          </div>
          <div className="gb-group">
            <span className="gb-glabel">Piece size</span>
            <div className="gb-seg">
              {DENOMS.map((d) => (
                <button key={d} className={den === d ? "on" : ""} onClick={() => pickDen(d)}>{label(1, d, rep)}</button>
              ))}
            </div>
          </div>
        </div>

        <p className="gb-prompt">How many <strong>{piece}</strong> pieces fit in one whole{rep === "percent" ? " (100%)" : ""}?</p>

        <div className="gb-expr">{expr}</div>

        <div className="gb-bar">
          {Array.from({ length: den }).map((_, i) => (
            <div key={i} className={`gb-slot${i < count ? " fill" : ""}`}
              style={i < count ? { background: i % 2 === 0 ? "var(--bdb-teal)" : "var(--bdb-amber)" } : undefined}>
              {i < count ? piece : ""}
            </div>
          ))}
        </div>
        <div className="gb-meter">{count} of {den} pieces · {total}{rep === "percent" ? "" : ""} filled</div>

        <div className="gb-actions">
          <button className="gb-a add" onClick={add} disabled={filled}>＋ Add a {piece}</button>
          <button className="gb-a" onClick={remove} disabled={count === 0}>− Remove</button>
          <button className="gb-a" onClick={() => setCount(0)} disabled={count === 0}>Reset</button>
        </div>

        <div className="gb-solved">
          {filled ? `✓ ${den} groups! ${den} × ${piece} = one whole${rep === "percent" ? " (100%)" : rep === "decimal" ? " (1)" : ""}.` : ""}
        </div>
      </main>

      <footer className="gb-foot">
        <span className="gb-btn" style={{ borderColor: "transparent", cursor: "default" }}>Tip: thirds &amp; sixths show rounded %/decimals, but fill to an exact whole.</span>
        <a className="gb-btn" href="/control">Control panel</a>
      </footer>
    </div>
  );
}
