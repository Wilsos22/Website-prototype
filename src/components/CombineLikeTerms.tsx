"use client";

// Combining Like Terms — guided.
// Tap two terms to combine them. Like terms (same variable) merge; a +n and −n
// (or +nx and −nx) form a ZERO PAIR — red box, poof, gone. Unlike terms are
// rejected with a hint. Each step DROPS to the next simplified line with a note
// on the left. Finishes when nothing else can be combined.

import { useRef, useState, useCallback } from "react";

interface Term { coef: number; variable: string; } // variable "" = constant
interface Line { terms: Term[]; note: string; }

const PRESETS: { label: string; terms: Term[] }[] = [
  { label: "3x + 5 + 2x − 1", terms: [{ coef: 3, variable: "x" }, { coef: 5, variable: "" }, { coef: 2, variable: "x" }, { coef: -1, variable: "" }] },
  { label: "4x − 4x + 7", terms: [{ coef: 4, variable: "x" }, { coef: -4, variable: "x" }, { coef: 7, variable: "" }] },
  { label: "5x + 2 − 3x − 2", terms: [{ coef: 5, variable: "x" }, { coef: 2, variable: "" }, { coef: -3, variable: "x" }, { coef: -2, variable: "" }] },
  { label: "6 + 2x + x − 4", terms: [{ coef: 6, variable: "" }, { coef: 2, variable: "x" }, { coef: 1, variable: "x" }, { coef: -4, variable: "" }] },
  { label: "x² + 2x + 3x² − x", terms: [{ coef: 1, variable: "x²" }, { coef: 2, variable: "x" }, { coef: 3, variable: "x²" }, { coef: -1, variable: "x" }] },
  { label: "7y − 3 + 2y + 3", terms: [{ coef: 7, variable: "y" }, { coef: -3, variable: "" }, { coef: 2, variable: "y" }, { coef: 3, variable: "" }] },
];

function colorFor(t: Term): string {
  if (t.variable === "") return t.coef < 0 ? "#ef4444" : "#f59e0b";
  if (t.variable === "x") return "#22c55e";
  if (t.variable === "x²") return "#4e6ef2";
  if (t.variable === "y") return "#a78bfa";
  return "#14b8a6";
}
function textColorFor(t: Term): string {
  if (t.variable === "") return t.coef < 0 ? "#3a0606" : "#3a2503";
  if (t.variable === "x") return "#04230f";
  if (t.variable === "x²") return "#06122e";
  if (t.variable === "y") return "#1e1240";
  return "#062a26";
}
function termLabel(t: Term, first: boolean): string {
  const sign = t.coef < 0 ? "−" : first ? "" : "+";
  const mag = Math.abs(t.coef);
  const coefStr = mag === 1 && t.variable ? "" : String(mag);
  return `${sign}${coefStr}${t.variable}`.trim() || "0";
}
function simplified(terms: Term[]): boolean {
  const seen = new Set<string>();
  for (const t of terms) { if (seen.has(t.variable)) return false; seen.add(t.variable); }
  return true;
}

export default function CombineLikeTerms() {
  const [lines, setLines] = useState<Line[]>([{ terms: PRESETS[0].terms, note: "" }]);
  const [selected, setSelected] = useState<number | null>(null);
  const [phase, setPhase] = useState<"play" | "animating" | "solved">("play");
  const [anim, setAnim] = useState<{ i: number; j: number; zero: boolean } | null>(null);
  const [feedback, setFeedback] = useState("Tap two like terms to combine them.");
  const [hint, setHint] = useState<string | null>(null);
  const [wrong, setWrong] = useState(0);
  const audioRef = useRef<AudioContext | null>(null);

  const terms = lines[lines.length - 1].terms;

  const tone = useCallback((freqs: number[], gap = 0.09, dur = 0.15) => {
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

  function load(t: Term[]) {
    setLines([{ terms: t, note: "" }]); setSelected(null); setPhase("play"); setAnim(null);
    setFeedback("Tap two like terms to combine them."); setHint(null); setWrong(0);
  }

  function clickTerm(idx: number) {
    if (phase !== "play") return;
    if (selected === null) { setSelected(idx); tone([520]); return; }
    if (selected === idx) { setSelected(null); return; }
    const t1 = terms[selected], t2 = terms[idx];
    if (t1.variable !== t2.variable) {
      tone([180, 140]); setWrong((w) => w + 1); setSelected(null);
      setFeedback("Those aren't like terms — like terms have the SAME variable.");
      setHint(t1.variable === "" || t2.variable === ""
        ? "A plain number can only combine with another plain number."
        : `${t1.variable || "a constant"} and ${t2.variable || "a constant"} are different — find a matching pair.`);
      return;
    }
    const zero = t1.coef + t2.coef === 0;
    const sel = selected;
    setPhase("animating"); setAnim({ i: sel, j: idx, zero }); setSelected(null);
    tone(zero ? [700, 500, 320] : [523, 784]);
    window.setTimeout(() => {
      const lo = Math.min(sel, idx), hi = Math.max(sel, idx);
      const combined: Term = { coef: t1.coef + t2.coef, variable: t1.variable };
      const next: Term[] = [];
      terms.forEach((t, i2) => {
        if (i2 === hi) return;
        if (i2 === lo) { if (!zero) next.push(combined); return; }
        next.push(t);
      });
      const note = zero
        ? `${termLabel(t1, true)} and ${termLabel(t2, true)} make a zero pair → cancel`
        : `combine ${t1.variable || "constants"}: ${termLabel(t1, true)} + ${termLabel(t2, true)} = ${termLabel(combined, true)}`;
      setLines((ls) => [...ls, { terms: next, note }]);
      setAnim(null);
      if (next.length === 0 || simplified(next)) { setPhase("solved"); setFeedback(""); tone([523, 659, 784, 1047], 0.1, 0.2); }
      else { setPhase("play"); setFeedback("Nice — keep combining like terms."); }
    }, 1000);
  }

  const resultStr = terms.length === 0 ? "0" : terms.map((t, i) => termLabel(t, i === 0)).join(" ");

  return (
    <div className="cl-root">
      <style>{`
        .cl-root { min-height:100vh; background:#0b0d14; color:#fff; font-family:Inter,ui-sans-serif,system-ui,sans-serif; display:grid; grid-template-rows:auto 1fr auto; }
        .cl-top { display:flex; align-items:center; justify-content:space-between; padding:14px 24px; border-bottom:1px solid #1f2332; flex-wrap:wrap; gap:8px; }
        .cl-mark { font-size:0.76rem; font-weight:900; letter-spacing:0.14em; text-transform:uppercase; color:#22c55e; margin:0; }
        .cl-btn { font-size:0.8rem; font-weight:800; color:#8a93ad; background:transparent; border:1px solid #1f2332; border-radius:7px; padding:8px 13px; cursor:pointer; text-decoration:none; }
        .cl-btn:hover { border-color:#22c55e; color:#fff; }

        .cl-main { padding:24px; display:grid; gap:18px; align-content:start; justify-items:center; max-width:900px; margin:0 auto; width:100%; }
        .cl-lines { display:grid; gap:12px; width:100%; }
        .cl-line { display:grid; justify-items:center; gap:5px; animation:clDrop 0.45s ease; }
        @keyframes clDrop { from{opacity:0; transform:translateY(-12px);} to{opacity:1; transform:none;} }
        .cl-note { text-align:center; font-size:0.84rem; font-weight:700; color:#86efac; line-height:1.4; }
        .cl-expr { display:flex; align-items:center; gap:9px; justify-content:center; flex-wrap:wrap; }
        .cl-chip { font-weight:900; border-radius:12px; padding:11px 16px; font-size:clamp(1.3rem,3.6vw,2rem); cursor:pointer; border:3px solid transparent; transition:transform 120ms ease; }
        .cl-chip.sel { outline:3px solid #fff; outline-offset:2px; transform:translateY(-2px); }
        .cl-chip.poof { animation:clPoof 1s ease forwards; }
        .cl-chip.merge { animation:clMerge 1s ease; }
        @keyframes clPoof { 0%{} 55%{box-shadow:0 0 0 3px #ef4444, 0 0 22px -2px #ef4444;} 100%{opacity:0.1; transform:scale(0.5) rotate(-8deg);} }
        @keyframes clMerge { 50%{transform:scale(1.12);} }
        .cl-static { cursor:default; }

        .cl-q { font-size:clamp(1.05rem,2.6vw,1.4rem); font-weight:800; text-align:center; color:#e8ecf5; min-height:1.4em; }
        .cl-hint { background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.4); color:#86efac; border-radius:10px; padding:11px 16px; font-weight:700; font-size:0.92rem; max-width:560px; text-align:center; }
        .cl-hintbtn { font-size:0.82rem; font-weight:800; color:#86efac; background:transparent; border:1px solid rgba(34,197,94,0.4); border-radius:8px; padding:8px 14px; cursor:pointer; }
        .cl-solved { display:grid; justify-items:center; gap:10px; }
        .cl-solved-eq { font-size:clamp(2rem,6.5vw,3.6rem); font-weight:900; color:#22c55e; }
        .cl-presets { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
        .cl-preset { font-size:0.85rem; font-weight:800; color:#c8cedd; background:#121520; border:1px solid #1f2332; border-radius:999px; padding:7px 13px; cursor:pointer; }
        .cl-preset:hover { border-color:#22c55e; }
        .cl-foot { padding:12px 24px; border-top:1px solid #1f2332; display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; }
        .cl-legend { font-size:0.8rem; color:#5a6280; font-weight:700; }
      `}</style>

      <header className="cl-top">
        <p className="cl-mark">Combining Like Terms</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="cl-btn" onClick={() => load(PRESETS[Math.floor(Math.random() * PRESETS.length)].terms)}>🎲 Random</button>
          <button className="cl-btn" onClick={() => load(lines[0].terms)}>↻ Restart</button>
          <a className="cl-btn" href="/">Home</a>
        </div>
      </header>

      <main className="cl-main">
        <div className="cl-lines">
          {lines.map((ln, li) => {
            const active = li === lines.length - 1 && phase !== "solved";
            return (
              <div className="cl-line" key={li}>
                <div className="cl-note">{ln.note}</div>
                <div className="cl-expr">
                  {ln.terms.map((t, i) => {
                    const isAnim = li === lines.length - 1 && anim && (i === anim.i || i === anim.j);
                    const cls = isAnim ? (anim!.zero ? "poof" : "merge") : selected === i && active ? "sel" : "";
                    return (
                      <span key={i}
                        className={`cl-chip ${cls} ${active ? "" : "cl-static"}`}
                        style={{ background: colorFor(t), color: textColorFor(t) }}
                        onClick={() => active && clickTerm(i)}
                      >{termLabel(t, i === 0)}</span>
                    );
                  })}
                  {ln.terms.length === 0 && <span className="cl-chip cl-static" style={{ background: "#334155", color: "#cbd5e1" }}>0</span>}
                </div>
              </div>
            );
          })}
        </div>

        {phase === "solved" ? (
          <div className="cl-solved">
            <div className="cl-solved-eq">{resultStr}</div>
            <p className="cl-q" style={{ minHeight: 0 }}>Fully simplified{wrong === 0 ? " — no mistakes!" : "!"} Nothing else combines.</p>
            <button className="cl-preset" onClick={() => load(lines[0].terms)}>↻ Try again</button>
          </div>
        ) : phase === "animating" ? (
          <p className="cl-q">{anim?.zero ? "Zero pair — they cancel to 0…" : "Combining like terms…"}</p>
        ) : (
          <>
            <p className="cl-q">{feedback}</p>
            {hint ? <div className="cl-hint">💡 {hint}</div> : <button className="cl-hintbtn" onClick={() => setHint("Like terms have the SAME variable (or are both plain numbers). Tap one, then a matching one.")}>Need a hint?</button>}
          </>
        )}

        <div className="cl-presets">
          {PRESETS.map((p, i) => <button className="cl-preset" key={i} onClick={() => load(p.terms)}>{p.label}</button>)}
        </div>
      </main>

      <footer className="cl-foot">
        <span className="cl-legend">Same color = same kind of term. Tap two like terms; +n and −n cancel as a zero pair.</span>
        <a className="cl-btn" href="/control">Control panel</a>
      </footer>
    </div>
  );
}
