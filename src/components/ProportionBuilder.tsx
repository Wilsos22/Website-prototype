"use client";

// Proportion Builder — ratios.
//   p/q = r/s  with one value on the right side blank.
// Step 1: find the SCALE FACTOR on the side you fully know (p×? = r, or q×? = s).
// Step 2: apply that same factor to the other part to fill the blank.
// Scale-factor boxes sit above (numerators) and below (denominators) the equals,
// reinforcing "multiply top and bottom by the same number."

import { useRef, useState, useCallback } from "react";

type Phase = "scale" | "fill" | "solved";
interface Problem { p: number; q: number; k: number; knownSide: "num" | "den"; }

function makeProblem(): Problem {
  const p = 2 + Math.floor(Math.random() * 8);
  let q = 2 + Math.floor(Math.random() * 8);
  if (q === p) q = p === 9 ? 3 : p + 1;
  const k = 2 + Math.floor(Math.random() * 4); // 2..5
  return { p, q, k, knownSide: Math.random() < 0.5 ? "num" : "den" };
}

const PRESETS: Problem[] = [
  { p: 2, q: 3, k: 4, knownSide: "num" },
  { p: 3, q: 5, k: 3, knownSide: "den" },
  { p: 4, q: 7, k: 2, knownSide: "num" },
  { p: 5, q: 2, k: 5, knownSide: "den" },
];

export default function ProportionBuilder() {
  const [prob, setProb] = useState<Problem>(PRESETS[0]);
  const [phase, setPhase] = useState<Phase>("scale");
  const [kKnown, setKKnown] = useState(false);
  const [kInput, setKInput] = useState("");
  const [valInput, setValInput] = useState("");
  const [feedback, setFeedback] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [wrong, setWrong] = useState(0);
  const audioRef = useRef<AudioContext | null>(null);

  const { p, q, k, knownSide } = prob;
  const r = p * k, s = q * k;
  const missingVal = knownSide === "num" ? s : r; // num known → denominator missing (=s); den known → numerator missing (=r)

  const tone = useCallback((freqs: number[], gap = 0.1, dur = 0.16) => {
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

  function load(pr: Problem) {
    setProb(pr); setPhase("scale"); setKKnown(false); setKInput(""); setValInput("");
    setFeedback(""); setHint(null); setWrong(0);
  }

  function checkScale() {
    if (Number(kInput) === k) {
      tone([523, 784]); setKKnown(true); setPhase("fill"); setHint(null);
      setFeedback(`Yes — ×${k}. Apply the SAME factor to the other part.`);
    } else {
      tone([180, 140]); setWrong((w) => w + 1);
      const knownPair = knownSide === "num" ? `${p} × ? = ${r}` : `${q} × ? = ${s}`;
      setFeedback("Not the right factor.");
      setHint(`Use the part you fully know: ${knownPair}. What times gives that?`);
    }
  }
  function checkVal() {
    if (Number(valInput) === missingVal) {
      tone([523, 659, 784, 1047], 0.1, 0.18); setPhase("solved"); setFeedback(""); setHint(null);
    } else {
      tone([180, 140]); setWrong((w) => w + 1);
      const other = knownSide === "num" ? `${q} × ${k}` : `${p} × ${k}`;
      setFeedback("Not quite — multiply by the scale factor.");
      setHint(`${other} = ?`);
    }
  }

  // right-side cells
  const rNum = knownSide === "num" ? String(r) : (phase === "solved" ? String(r) : "?");
  const rDen = knownSide === "den" ? String(s) : (phase === "solved" ? String(s) : "?");
  const numIsBlank = knownSide === "den" && phase !== "solved";
  const denIsBlank = knownSide === "num" && phase !== "solved";

  function ScaleBox({ row }: { row: "num" | "den" }) {
    const isKnownArrow = row === knownSide;
    if (kKnown) return <div className="pb-scale done">×{k}</div>;
    if (isKnownArrow && phase === "scale") {
      return (
        <div className="pb-scale live">
          ×<input className="pb-kin" type="number" value={kInput} autoFocus
            onChange={(e) => setKInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") checkScale(); }} />
        </div>
      );
    }
    return <div className="pb-scale">×?</div>;
  }

  return (
    <div className="pb-root">
      <style>{`
        .pb-root { min-height:100vh; background:var(--bdb-ground); color:var(--bdb-ink); font-family:var(--bdb-font); display:grid; grid-template-rows:auto 1fr auto; }
        .pb-top { display:flex; align-items:center; justify-content:space-between; padding:14px 24px; border-bottom:1px solid var(--bdb-line); flex-wrap:wrap; gap:8px; }
        .pb-mark { font-size:0.76rem; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; color:var(--bdb-coral); margin:0; }
        .pb-btn { font-size:0.8rem; font-weight:700; color:var(--bdb-ink-soft); background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:999px; padding:8px 13px; cursor:pointer; text-decoration:none; }
        .pb-btn:hover { border-color:var(--bdb-coral); color:var(--bdb-ink); }

        .pb-main { padding:28px 24px; display:grid; gap:26px; align-content:start; justify-items:center; max-width:820px; margin:0 auto; width:100%; }

        .pb-prop { display:grid; grid-template-columns:auto auto auto; grid-template-rows:auto auto auto; align-items:center; gap:6px 20px; }
        .pb-cell { font-size:clamp(2rem,7vw,3.6rem); font-weight:800; text-align:center; min-width:74px; }
        .pb-num { color:var(--bdb-coral); } .pb-den { color:var(--bdb-teal); }
        .pb-bar-l, .pb-bar-r { border-top:4px solid var(--bdb-ink-soft); align-self:center; height:0; }
        .pb-eq { font-size:clamp(1.8rem,5vw,2.8rem); font-weight:800; color:var(--bdb-ink-soft); text-align:center; }
        .pb-blank { display:inline-grid; place-items:center; min-width:74px; height:64px; border:3px dashed var(--bdb-coral); border-radius:12px; color:var(--bdb-coral); }
        .pb-blank input { width:80px; background:var(--bdb-card); border:none; color:var(--bdb-ink); font-size:2rem; font-weight:800; text-align:center; }

        .pb-scale { font-size:1.2rem; font-weight:800; color:var(--bdb-teal); background:color-mix(in srgb, var(--bdb-teal) 12%, var(--bdb-card)); border:1px solid color-mix(in srgb, var(--bdb-teal) 38%, transparent); border-radius:9px; padding:5px 10px; white-space:nowrap; display:flex; align-items:center; gap:2px; justify-content:center; }
        .pb-scale.done { color:var(--bdb-green); background:color-mix(in srgb, var(--bdb-green) 14%, var(--bdb-card)); border-color:color-mix(in srgb, var(--bdb-green) 40%, transparent); }
        .pb-scale.live { border-color:var(--bdb-coral); color:var(--bdb-coral); }
        .pb-kin { width:54px; background:var(--bdb-card); border:none; color:var(--bdb-ink); font-size:1.2rem; font-weight:800; text-align:center; }

        .pb-q { font-size:clamp(1.05rem,2.6vw,1.4rem); font-weight:700; text-align:center; color:var(--bdb-ink); min-height:1.4em; }
        .pb-go { font-size:1.05rem; font-weight:800; color:#fff; background:var(--bdb-coral); border:none; border-radius:12px; padding:12px 26px; cursor:pointer; }
        .pb-hint { background:color-mix(in srgb, var(--bdb-coral) 12%, var(--bdb-card)); border:1px solid color-mix(in srgb, var(--bdb-coral) 40%, transparent); color:var(--bdb-brown); border-radius:10px; padding:11px 16px; font-weight:600; font-size:0.92rem; max-width:520px; text-align:center; }
        .pb-hintbtn { font-size:0.82rem; font-weight:700; color:var(--bdb-coral); background:transparent; border:1px solid var(--bdb-line); border-radius:999px; padding:8px 14px; cursor:pointer; }
        .pb-solved { font-size:clamp(1.1rem,2.8vw,1.5rem); font-weight:800; color:var(--bdb-green); text-align:center; }
        .pb-presets { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
        .pb-preset { font-size:0.85rem; font-weight:700; color:var(--bdb-ink-soft); background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:999px; padding:7px 13px; cursor:pointer; }
        .pb-preset:hover { border-color:var(--bdb-coral); color:var(--bdb-ink); }
        .pb-foot { padding:12px 24px; border-top:1px solid var(--bdb-line); display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; }
      `}</style>

      <header className="pb-top">
        <p className="pb-mark">Proportion Builder</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="pb-btn" onClick={() => load(makeProblem())}>🎲 New problem</button>
          <a className="pb-btn" href="/">Home</a>
        </div>
      </header>

      <main className="pb-main">
        <div className="pb-prop">
          {/* numerator row */}
          <div className="pb-cell pb-num">{p}</div>
          <ScaleBox row="num" />
          <div className="pb-cell pb-num">
            {numIsBlank
              ? <span className="pb-blank"><input type="number" value={valInput} autoFocus onChange={(e) => setValInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") checkVal(); }} /></span>
              : rNum}
          </div>
          {/* fraction bars + equals */}
          <div className="pb-bar-l" />
          <div className="pb-eq">=</div>
          <div className="pb-bar-r" />
          {/* denominator row */}
          <div className="pb-cell pb-den">{q}</div>
          <ScaleBox row="den" />
          <div className="pb-cell pb-den">
            {denIsBlank
              ? <span className="pb-blank"><input type="number" value={valInput} autoFocus onChange={(e) => setValInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") checkVal(); }} /></span>
              : rDen}
          </div>
        </div>

        {phase === "solved" ? (
          <div className="pb-solved">✓ {p}/{q} = {r}/{s} — both parts × {k}{wrong === 0 ? " · no mistakes!" : "!"}</div>
        ) : (
          <>
            <p className="pb-q">
              {phase === "scale"
                ? (knownSide === "num" ? `What do you multiply ${p} by to get ${r}?` : `What do you multiply ${q} by to get ${s}?`)
                : `Now multiply the other part by ${k} to fill the blank.`}
            </p>
            <button className="pb-go" onClick={phase === "scale" ? checkScale : checkVal}>Check →</button>
            {hint ? <div className="pb-hint">💡 {hint}</div> : <button className="pb-hintbtn" onClick={() => setHint(phase === "scale" ? "Find the side where you know BOTH numbers, and ask: times what?" : `Use the same scale factor on the other part.`)}>Need a hint?</button>}
            {feedback && !hint && <p className="pb-q" style={{ minHeight: 0, color: "var(--bdb-ink-soft)", fontSize: "0.95rem" }}>{feedback}</p>}
          </>
        )}

        <div className="pb-presets">
          {PRESETS.map((pr, i) => <button className="pb-preset" key={i} onClick={() => load(pr)}>{pr.p}/{pr.q} = {pr.knownSide === "num" ? `${pr.p * pr.k}/?` : `?/${pr.q * pr.k}`}</button>)}
        </div>
      </main>

      <footer className="pb-foot">
        <span className="pb-btn" style={{ borderColor: "transparent", cursor: "default" }}>Same scale factor on top and bottom keeps the ratio equal.</span>
        <a className="pb-btn" href="/control">Control panel</a>
      </footer>
    </div>
  );
}
