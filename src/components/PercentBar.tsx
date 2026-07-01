"use client";

// Percent Bar — parts & wholes.
// A bar with 0–100% on top and 0–whole on the bottom. First pick which piece is
// missing (part / whole / percent), then solve with BENCHMARK scaling: find 10%,
// then hop. The expression builds as you go; the bar fills to the answer.

import { useEffect, useRef, useState, useCallback } from "react";
import { LiveToolBanner, useLiveToolConfig } from "./useLiveToolConfig";

type Unknown = "part" | "whole" | "percent";
interface Problem { W: number; P: number; part: number; unknown: Unknown; }

function makeProblem(): Problem {
  const W = (2 + Math.floor(Math.random() * 9)) * 10; // 20..100
  const P = (1 + Math.floor(Math.random() * 9)) * 10; // 10..90
  const part = (P / 100) * W;
  const u: Unknown = (["part", "whole", "percent"] as Unknown[])[Math.floor(Math.random() * 3)];
  return { W, P, part, unknown: u };
}
const PRESETS: Problem[] = [
  { W: 80, P: 30, part: 24, unknown: "part" },
  { W: 60, P: 20, part: 12, unknown: "whole" },
  { W: 50, P: 40, part: 20, unknown: "percent" },
  { W: 100, P: 70, part: 70, unknown: "part" },
];

export default function PercentBar() {
  const liveTool = useLiveToolConfig("/percent-bar");
  const [prob, setProb] = useState<Problem>(PRESETS[0]);
  const [stepIdx, setStepIdx] = useState(0); // 0=q1, 1=q2, 2=solved
  const [a1, setA1] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [wrong, setWrong] = useState(0);
  const audioRef = useRef<AudioContext | null>(null);

  const { W, P, part, unknown } = prob;
  const ten = W / 10;       // 10% of the whole
  const tensP = P / 10;     // how many 10%s the percent is

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

  function load(p: Problem) { setProb(p); setStepIdx(0); setA1(null); setInput(""); setFeedback(""); setHint(null); setWrong(0); }

  useEffect(() => {
    if (!liveTool || liveTool.route !== "/percent-bar") return;
    load({
      W: liveTool.config.whole,
      P: liveTool.config.percent,
      part: liveTool.config.part,
      unknown: liveTool.config.unknown,
    });
  }, [liveTool?.id]);

  // questions & answers per unknown
  function q1(): { text: string; ans: number } {
    if (unknown === "whole") return { text: `If ${P}% = ${part}, then 10% = ${part} ÷ ${tensP} = ?`, ans: part / tensP };
    return { text: `Start with the benchmark: 10% of ${W} = ?`, ans: ten };
  }
  function q2(): { text: string; ans: number } {
    if (unknown === "whole") return { text: `100% is ten of those: 10% × 10 = ?`, ans: W };
    if (unknown === "percent") return { text: `How many 10%s make ${part}?   ${part} ÷ ${ten} = ?`, ans: tensP };
    return { text: `${P}% is ${tensP} tens, so ${P}% = ${ten} × ${tensP} = ?`, ans: part };
  }

  const cur = stepIdx === 0 ? q1() : q2();

  function check() {
    if (Number(input) === cur.ans) {
      tone([523, 784]); setHint(null); setInput("");
      if (stepIdx === 0) { setA1(cur.ans); setStepIdx(1); setFeedback(""); }
      else { setStepIdx(2); setFeedback(""); tone([523, 659, 784, 1047], 0.1, 0.18); }
    } else {
      tone([180, 140]); setWrong((w) => w + 1);
      setFeedback("Not quite — check the numbers and try again.");
      setHint(stepIdx === 0
        ? (unknown === "whole" ? `Split the ${P}% into ${tensP} equal tens.` : `10% means split ${W} into 10 equal parts.`)
        : (unknown === "percent" ? `Count how many ${ten}s fit into ${part}, then ×10 for the percent.` : unknown === "whole" ? `Ten copies of 10% make the whole.` : `Add ${ten} ${tensP} times (or × ${tensP}).`));
    }
  }

  // bar fill: how many 10% segments to highlight
  const solved = stepIdx === 2;
  const fillSegs = solved || unknown !== "percent" ? tensP : (stepIdx >= 1 ? 1 : 0);
  const showValueScale = solved || a1 !== null;
  const finalPercent = unknown === "percent" ? P : P;

  return (
    <div className="pc-root">
      <style>{`
        .pc-root { min-height:100vh; background:var(--bdb-ground); color:var(--bdb-ink); font-family:var(--bdb-font); display:grid; grid-template-rows:auto 1fr auto; }
        .pc-top { display:flex; align-items:center; justify-content:space-between; padding:14px 24px; border-bottom:1px solid var(--bdb-line); flex-wrap:wrap; gap:8px; }
        .pc-mark { font-size:0.76rem; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; color:var(--bdb-coral); margin:0; }
        .pc-btn { font-size:0.8rem; font-weight:700; color:var(--bdb-ink-soft); background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:999px; padding:8px 13px; cursor:pointer; text-decoration:none; }
        .pc-btn:hover { border-color:var(--bdb-coral); color:var(--bdb-ink); }
        .pc-main { padding:24px 18px; display:grid; gap:22px; justify-items:center; max-width:860px; margin:0 auto; width:100%; }

        .pc-prompt { font-size:clamp(1.2rem,3vw,1.7rem); font-weight:800; text-align:center; }
        .pc-prompt .u { color:var(--bdb-coral); }

        .pc-bar-wrap { width:100%; max-width:720px; display:grid; gap:4px; }
        .pc-scale { display:flex; justify-content:space-between; font-size:0.72rem; font-weight:700; color:var(--bdb-ink-faint); }
        .pc-pcts, .pc-vals { display:grid; grid-template-columns:repeat(10,1fr); }
        .pc-pcts span, .pc-vals span { font-size:0.66rem; font-weight:700; color:var(--bdb-ink-faint); text-align:right; padding-right:2px; }
        .pc-bar { display:grid; grid-template-columns:repeat(10,1fr); height:70px; border:2px solid var(--bdb-ink); border-radius:12px; overflow:hidden; background:var(--bdb-card); }
        .pc-seg { border-right:1px solid var(--bdb-line); transition:background 200ms ease; }
        .pc-seg.fill { background:var(--bdb-teal); }
        .pc-seg.bench { background:var(--bdb-amber); }
        .pc-vals span { color:var(--bdb-ink-soft); }
        .pc-pcts span { color:var(--bdb-ink-faint); }

        .pc-expr { font-size:clamp(1rem,2.6vw,1.4rem); font-weight:800; color:var(--bdb-brown); text-align:center; min-height:1.3em; }
        .pc-q { font-size:clamp(1.05rem,2.6vw,1.4rem); font-weight:700; text-align:center; color:var(--bdb-ink); }
        .pc-row { display:flex; gap:10px; justify-content:center; align-items:center; flex-wrap:wrap; }
        .pc-input { font-size:1.5rem; font-weight:800; text-align:center; background:var(--bdb-card); border:2px solid var(--bdb-line); border-radius:12px; color:var(--bdb-ink); padding:10px; width:130px; }
        .pc-input:focus { outline:none; border-color:var(--bdb-teal); }
        .pc-go { font-size:1.05rem; font-weight:800; color:#fff; background:var(--bdb-coral); border:none; border-radius:12px; padding:12px 24px; cursor:pointer; }
        .pc-hint { background:color-mix(in srgb, var(--bdb-amber) 16%, var(--bdb-card)); border:1px solid color-mix(in srgb, var(--bdb-amber) 45%, transparent); color:var(--bdb-brown); border-radius:10px; padding:11px 16px; font-weight:600; font-size:0.92rem; max-width:520px; text-align:center; }
        .pc-hintbtn { font-size:0.82rem; font-weight:700; color:var(--bdb-coral); background:transparent; border:1px solid var(--bdb-line); border-radius:999px; padding:8px 14px; cursor:pointer; }
        .pc-solved { font-size:clamp(1.3rem,3.4vw,2rem); font-weight:800; color:var(--bdb-green); text-align:center; }
        .pc-unknowns { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
        .pc-preset { font-size:0.85rem; font-weight:700; color:var(--bdb-ink-soft); background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:999px; padding:7px 13px; cursor:pointer; }
        .pc-preset:hover { border-color:var(--bdb-coral); color:var(--bdb-ink); }
        .pc-foot { padding:12px 24px; border-top:1px solid var(--bdb-line); display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; }
      `}</style>

      <header className="pc-top">
        <p className="pc-mark">Percent Bar</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="pc-btn" onClick={() => load(makeProblem())}>🎲 New problem</button>
          <a className="pc-btn" href="/">Home</a>
        </div>
      </header>

      <main className="pc-main">
        <LiveToolBanner tool={liveTool} />
        <div className="pc-prompt">
          {unknown === "part" && <>What is <span className="u">{P}%</span> of <span>{W}</span>?</>}
          {unknown === "whole" && <><span>{part}</span> is <span className="u">{P}%</span> of what?</>}
          {unknown === "percent" && <><span>{part}</span> is what <span className="u">percent</span> of <span>{W}</span>?</>}
        </div>

        <div className="pc-bar-wrap">
          <div className="pc-pcts">{Array.from({ length: 10 }).map((_, i) => <span key={i}>{(i + 1) * 10}%</span>)}</div>
          <div className="pc-bar">
            {Array.from({ length: 10 }).map((_, i) => {
              const isFill = i < fillSegs;
              const isBench = !isFill && i === 0 && a1 !== null && unknown !== "whole";
              return <div key={i} className={`pc-seg${isFill ? " fill" : isBench ? " bench" : ""}`} />;
            })}
          </div>
          {showValueScale && unknown !== "whole" && (
            <div className="pc-vals">{Array.from({ length: 10 }).map((_, i) => <span key={i}>{Math.round(ten * (i + 1) * 10) / 10}</span>)}</div>
          )}
        </div>

        {/* running expression */}
        <div className="pc-expr">
          {a1 !== null && (unknown === "part"
            ? `10% = ${ten}${solved ? `  →  ${ten} × ${tensP} = ${part}` : ""}`
            : unknown === "percent"
              ? `10% = ${ten}${solved ? `  →  ${part} is ${tensP} tens = ${P}%` : ""}`
              : `10% = ${a1}${solved ? `  →  10% × 10 = ${W}` : ""}`)}
        </div>

        {solved ? (
          <>
            <div className="pc-solved">
              {unknown === "part" && `${P}% of ${W} = ${part} 🎉`}
              {unknown === "whole" && `${part} is ${P}% of ${W} 🎉`}
              {unknown === "percent" && `${part} is ${finalPercent}% of ${W} 🎉`}
            </div>
            <p className="pc-q" style={{ color: "var(--bdb-ink-soft)", fontSize: "0.95rem" }}>Solved with benchmark 10%{wrong === 0 ? " · no mistakes!" : "!"}</p>
            <button className="pc-go" onClick={() => load(makeProblem())}>Next problem →</button>
          </>
        ) : (
          <>
            <p className="pc-q">{cur.text}</p>
            <div className="pc-row">
              <input className="pc-input" type="number" value={input} autoFocus onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") check(); }} />
              <button className="pc-go" onClick={check}>Check →</button>
            </div>
            {hint ? <div className="pc-hint">💡 {hint}</div> : <button className="pc-hintbtn" onClick={() => setHint(stepIdx === 0 ? "Benchmarks make percents easy — 10% is just the whole split into 10 equal parts." : "Use your 10% benchmark and scale up.")}>Need a hint?</button>}
            {feedback && !hint && <p className="pc-q" style={{ color: "var(--bdb-ink-soft)", fontSize: "0.92rem" }}>{feedback}</p>}
          </>
        )}

        <div className="pc-unknowns">
          {PRESETS.map((p, i) => <button className="pc-preset" key={i} onClick={() => load(p)}>{p.unknown === "part" ? `${p.P}% of ${p.W}` : p.unknown === "whole" ? `${p.part} is ${p.P}% of ?` : `${p.part} of ${p.W} = ?%`}</button>)}
        </div>
      </main>

      <footer className="pc-foot">
        <span className="pc-btn" style={{ borderColor: "transparent", cursor: "default" }}>Find 10% first, then hop. Yellow = your 10% benchmark, pink = the answer.</span>
        <a className="pc-btn" href="/control">Control panel</a>
      </footer>
    </div>
  );
}
