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
  const [showItems, setShowItems] = useState(false); // optional concrete "groups of items" view
  const audioRef = useRef<AudioContext | null>(null);

  const { p, q, k, knownSide } = prob;
  const r = p * k, s = q * k;
  const missingVal = knownSide === "num" ? s : r; // num known: denominator missing (=s); den known: numerator missing (=r)

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

        .pb-main { padding:28px 24px; display:grid; gap:26px; align-content:start; justify-items:center; max-width:960px; margin:0 auto; width:100%; }

        .pb-step-banner { display:grid; grid-template-columns:auto minmax(0,1fr); gap:12px; align-items:center; width:min(100%,720px); border:3px solid var(--bdb-coral); border-radius:14px; background:color-mix(in srgb,var(--bdb-coral) 8%,#fff); padding:12px 16px; box-shadow:0 0 0 5px color-mix(in srgb,var(--bdb-coral) 12%,transparent); }
        .pb-step-num { display:grid; width:44px; height:44px; place-items:center; border-radius:10px; background:var(--bdb-coral); color:#fff; font-weight:950; font-size:1.25rem; }
        .pb-step-copy { color:var(--bdb-ink); font-size:clamp(1.05rem,2.5vw,1.35rem); font-weight:950; line-height:1.25; }
        .pb-prop { display:grid; grid-template-columns:auto auto auto; grid-template-rows:auto auto auto; align-items:center; gap:10px 28px; }
        .pb-cell { font-size:clamp(2.6rem,9vw,5.2rem); font-weight:900; text-align:center; min-width:94px; }
        .pb-num { color:var(--bdb-coral); } .pb-den { color:var(--bdb-teal); }
        .pb-bar-l, .pb-bar-r { border-top:4px solid var(--bdb-ink-soft); align-self:center; height:0; }
        .pb-eq { font-size:clamp(1.8rem,5vw,2.8rem); font-weight:800; color:var(--bdb-ink-soft); text-align:center; }
        .pb-blank { display:inline-grid; place-items:center; min-width:94px; height:76px; border:4px dashed var(--bdb-coral); border-radius:12px; color:var(--bdb-coral); box-shadow:0 0 0 5px color-mix(in srgb,var(--bdb-coral) 12%,transparent); }
        .pb-blank input { width:88px; background:var(--bdb-card); border:none; color:var(--bdb-ink); font-size:2.4rem; font-weight:900; text-align:center; }

        .pb-scale { font-size:1.35rem; font-weight:900; color:var(--bdb-teal); background:color-mix(in srgb, var(--bdb-teal) 12%, var(--bdb-card)); border:2px solid color-mix(in srgb, var(--bdb-teal) 38%, transparent); border-radius:9px; padding:8px 12px; white-space:nowrap; display:flex; align-items:center; gap:2px; justify-content:center; position:relative; }
        .pb-scale.done { color:var(--bdb-green); background:color-mix(in srgb, var(--bdb-green) 14%, var(--bdb-card)); border-color:color-mix(in srgb, var(--bdb-green) 40%, transparent); }
        .pb-scale.live { border-color:var(--bdb-coral); color:var(--bdb-coral); box-shadow:0 0 0 5px color-mix(in srgb,var(--bdb-coral) 14%,transparent); animation:pbPulse 1s ease-in-out infinite; }
        .pb-scale.live::after { content:""; position:absolute; right:-22px; top:50%; transform:translateY(-50%); width:0; height:0; border-top:7px solid transparent; border-bottom:7px solid transparent; border-left:11px solid var(--bdb-coral); }
        @keyframes pbPulse { 50% { transform:scale(1.04); } }
        .pb-kin { width:54px; background:var(--bdb-card); border:none; color:var(--bdb-ink); font-size:1.2rem; font-weight:800; text-align:center; }

        .pb-q { font-size:clamp(1.05rem,2.6vw,1.4rem); font-weight:700; text-align:center; color:var(--bdb-ink); min-height:1.4em; }
        .pb-go { font-size:1.05rem; font-weight:800; color:#fff; background:var(--bdb-coral); border:none; border-radius:12px; padding:12px 26px; cursor:pointer; }
        .pb-hint { background:color-mix(in srgb, var(--bdb-coral) 12%, var(--bdb-card)); border:1px solid color-mix(in srgb, var(--bdb-coral) 40%, transparent); color:var(--bdb-brown); border-radius:10px; padding:11px 16px; font-weight:600; font-size:0.92rem; max-width:520px; text-align:center; }
        .pb-hintbtn { font-size:0.82rem; font-weight:700; color:var(--bdb-coral); background:transparent; border:1px solid var(--bdb-line); border-radius:999px; padding:8px 14px; cursor:pointer; }
        .pb-solved { font-size:clamp(1.1rem,2.8vw,1.5rem); font-weight:800; color:var(--bdb-green); text-align:center; }
        .pb-groups-wrap { display:grid; justify-items:center; gap:10px; width:min(100%,720px); }
        .pb-groups { display:flex; flex-wrap:wrap; gap:12px; justify-content:center; }
        .pb-group { display:grid; gap:6px; padding:10px 12px; border:2px solid var(--bdb-line); border-radius:12px; background:var(--bdb-card); }
        .pb-group-lbl { font-size:0.72rem; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; color:var(--bdb-ink-faint); text-align:center; }
        .pb-items { display:flex; flex-wrap:wrap; gap:4px; max-width:132px; justify-content:center; }
        .pb-dot { width:17px; height:17px; border-radius:4px; }
        .pb-dot.num { background:var(--bdb-coral); } .pb-dot.den { background:var(--bdb-teal); }
        .pb-groups-cap { color:var(--bdb-ink-soft); font-size:0.95rem; font-weight:600; text-align:center; max-width:540px; line-height:1.45; }
        .pb-groups-cap b { color:var(--bdb-ink); }
        .pb-toggle { font-size:0.85rem; font-weight:700; color:var(--bdb-ink-soft); background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:999px; padding:8px 15px; cursor:pointer; }
        .pb-toggle.on { border-color:var(--bdb-teal); color:var(--bdb-ink); background:color-mix(in srgb,var(--bdb-teal) 12%,var(--bdb-card)); }
        .pb-presets { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
        .pb-preset { font-size:0.85rem; font-weight:700; color:var(--bdb-ink-soft); background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:999px; padding:7px 13px; cursor:pointer; }
        .pb-preset:hover { border-color:var(--bdb-coral); color:var(--bdb-ink); }
        .pb-foot { padding:12px 24px; border-top:1px solid var(--bdb-line); display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; }
      `}</style>

      <header className="pb-top">
        <p className="pb-mark">Proportion Builder</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="pb-btn" onClick={() => load(makeProblem())}>New problem</button>
          <a className="pb-btn" href="/">Home</a>
        </div>
      </header>

      <main className="pb-main">
        <div className="pb-step-banner" aria-live="polite">
          <span className="pb-step-num">{phase === "scale" ? "1" : "2"}</span>
          <span className="pb-step-copy">
            {phase === "scale"
              ? knownSide === "num"
                ? `First find the scale factor: ${p} times what equals ${r}?`
                : `First find the scale factor: ${q} times what equals ${s}?`
              : knownSide === "num"
              ? `Second use the same factor below: ${q} × ${k} = ?`
              : `Second use the same factor above: ${p} × ${k} = ?`}
          </span>
        </div>
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
          <div className="pb-solved">{p}/{q} = {r}/{s} — both parts × {k}{wrong === 0 ? " · no mistakes!" : "!"}</div>
        ) : (
          <>
            <p className="pb-q">
              {phase === "scale"
                ? (knownSide === "num" ? `What do you multiply ${p} by to get ${r}?` : `What do you multiply ${q} by to get ${s}?`)
                : `Now multiply the other part by ${k} to fill the blank.`}
            </p>
            <button className="pb-go" onClick={phase === "scale" ? checkScale : checkVal}>Check</button>
            {hint ? <div className="pb-hint">{hint}</div> : <button className="pb-hintbtn" onClick={() => setHint(phase === "scale" ? "Find the side where you know BOTH numbers, and ask: times what?" : `Use the same scale factor on the other part.`)}>Need a hint?</button>}
            {feedback && !hint && <p className="pb-q" style={{ minHeight: 0, color: "var(--bdb-ink-soft)", fontSize: "0.95rem" }}>{feedback}</p>}
          </>
        )}

        <button className={`pb-toggle ${showItems ? "on" : ""}`} onClick={() => setShowItems((v) => !v)}>
          {showItems ? "Hide the groups" : "Show it with groups of items"}
        </button>

        {showItems && (
          <div className="pb-groups-wrap">
            <div className="pb-groups">
              {Array.from({ length: k }).map((_, g) => (
                <div className="pb-group" key={g}>
                  <span className="pb-group-lbl">Group {g + 1}</span>
                  <div className="pb-items num">{Array.from({ length: p }).map((_, i) => <span key={i} className="pb-dot num" />)}</div>
                  <div className="pb-items den">{Array.from({ length: q }).map((_, i) => <span key={i} className="pb-dot den" />)}</div>
                </div>
              ))}
            </div>
            <p className="pb-groups-cap">
              <b>{k} equal groups</b>, each one <b>{p}</b> coral to <b>{q}</b> teal. Altogether that is <b>{r}</b> to <b>{s}</b> — the same ratio, {k} times over.
            </p>
          </div>
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
