"use client";

// GEMS Order of Operations — guided solver.
// Student clicks the operation to do FIRST. A pop-up asks for its result.
// Correct → that step collapses and the new expression DROPS to the next line
// (with the step shown on the left). A GEMS header lights each letter red as
// that category is cleared: Grouping → Exponents → Multiply/Divide → Subtract/Add.

import { useRef, useState, useCallback } from "react";

type Tokens = string[];
interface Line { tokens: Tokens; note: string; }
const OPS = ["+", "−", "×", "÷", "^"];
const isOp = (t: string) => OPS.includes(t);
const isNum = (t: string) => t !== "(" && t !== ")" && !Number.isNaN(Number(t));
const prec = (t: string) => (t === "^" ? 3 : t === "×" || t === "÷" ? 2 : 1);

const PRESETS: { label: string; tokens: Tokens }[] = [
  { label: "3 + 4 × 2", tokens: ["3", "+", "4", "×", "2"] },
  { label: "6 + 12 ÷ 3", tokens: ["6", "+", "12", "÷", "3"] },
  { label: "10 − 2 × 3 + 1", tokens: ["10", "−", "2", "×", "3", "+", "1"] },
  { label: "(5 − 1) × 3", tokens: ["(", "5", "−", "1", ")", "×", "3"] },
  { label: "2 ^ 3 + 4", tokens: ["2", "^", "3", "+", "4"] },
  { label: "4 × (2 + 3) − 6", tokens: ["4", "×", "(", "2", "+", "3", ")", "−", "6"] },
  { label: "2 × 3 ^ 2 − 4", tokens: ["2", "×", "3", "^", "2", "−", "4"] },
  { label: "(8 − 3) × 2 ^ 2", tokens: ["(", "8", "−", "3", ")", "×", "2", "^", "2"] },
];

function compute(a: string, op: string, b: string): number {
  const x = Number(a), y = Number(b);
  switch (op) { case "+": return x + y; case "−": return x - y; case "×": return x * y; case "÷": return x / y; case "^": return Math.pow(x, y); }
  return NaN;
}
function innerParen(t: Tokens): [number, number] | null {
  let open = -1;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "(") open = i;
    else if (t[i] === ")" && open !== -1) return [open, i];
  }
  return null;
}
function nextOpIndex(t: Tokens): number {
  const g = innerParen(t);
  const lo = g ? g[0] + 1 : 0;
  const hi = g ? g[1] - 1 : t.length - 1;
  let best = -1, bp = 0;
  for (let i = lo; i <= hi; i++) if (isOp(t[i]) && prec(t[i]) > bp) { bp = prec(t[i]); best = i; }
  return best;
}
function stripParens(t: Tokens): Tokens {
  for (let i = 0; i + 2 < t.length; i++)
    if (t[i] === "(" && isNum(t[i + 1]) && t[i + 2] === ")")
      return stripParens([...t.slice(0, i), t[i + 1], ...t.slice(i + 3)]);
  return t;
}
function categoryOf(t: Tokens): "G" | "E" | "M" | "S" | null {
  const k = nextOpIndex(t);
  if (k < 0) return null;
  if (innerParen(t)) return "G";
  if (t[k] === "^") return "E";
  if (t[k] === "×" || t[k] === "÷") return "M";
  return "S";
}

export default function OrderOfOperations() {
  const [lines, setLines] = useState<Line[]>([{ tokens: PRESETS[0].tokens, note: "" }]);
  const [phase, setPhase] = useState<"pick" | "answer" | "solved">("pick");
  const [pending, setPending] = useState<{ k: number; a: string; op: string; b: string } | null>(null);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState("Click the operation you should do FIRST.");
  const [hint, setHint] = useState<string | null>(null);
  const [wrong, setWrong] = useState(0);
  const audioRef = useRef<AudioContext | null>(null);

  const tokens = lines[lines.length - 1].tokens;
  const orig = lines[0].tokens;
  const curCat = categoryOf(tokens);
  const existed = {
    G: orig.includes("("),
    E: orig.includes("^"),
    M: orig.some((t) => t === "×" || t === "÷"),
    S: orig.some((t) => t === "+" || t === "−"),
  };
  const cleared = {
    G: !tokens.includes("("),
    E: !tokens.includes("(") && !tokens.includes("^"),
    M: !tokens.includes("(") && !tokens.includes("^") && !tokens.some((t) => t === "×" || t === "÷"),
    S: tokens.length === 1,
  };
  // a letter lights red only if that category was present AND is now finished
  const done = {
    G: existed.G && cleared.G,
    E: existed.E && cleared.E,
    M: existed.M && cleared.M,
    S: existed.S && cleared.S,
  };

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

  function load(t: Tokens) {
    setLines([{ tokens: t, note: "" }]); setPhase("pick"); setPending(null);
    setFeedback("Click the operation you should do FIRST."); setHint(null); setWrong(0);
  }

  function clickOp(k: number) {
    if (phase !== "pick") return;
    if (k === nextOpIndex(tokens)) {
      tone([523, 784]); setHint(null);
      setPending({ k, a: tokens[k - 1], op: tokens[k], b: tokens[k + 1] });
      setInput(""); setPhase("answer");
    } else {
      tone([180, 140]); setWrong((w) => w + 1);
      setFeedback("Not first — remember GEMS: Grouping, then Exponents, then ×/÷, then +/−, left to right.");
      setHint(curCat === "G" ? "There's still a grouping ( ) — do inside the parentheses first."
        : curCat === "E" ? "There's an exponent — do that before × ÷ + −."
        : curCat === "M" ? "Do × and ÷ (left to right) before + and −."
        : "Do + and − left to right.");
    }
  }

  function submitAnswer() {
    if (!pending) return;
    const correct = compute(pending.a, pending.op, pending.b);
    if (Number(input) === correct) {
      tone([523, 784]); setHint(null);
      const nt = stripParens([...tokens.slice(0, pending.k - 1), String(correct), ...tokens.slice(pending.k + 2)]);
      const note = `${pending.a} ${pending.op} ${pending.b} = ${correct}`;
      setLines((ls) => [...ls, { tokens: nt, note }]);
      setPending(null);
      if (nt.length === 1) { setPhase("solved"); setFeedback(""); tone([523, 659, 784, 1047], 0.1, 0.2); }
      else { setPhase("pick"); setFeedback("Nice! Now click the next operation to do first."); }
    } else {
      tone([180, 140]); setWrong((w) => w + 1);
      setFeedback(`Recompute: what is ${pending.a} ${pending.op} ${pending.b}?`);
    }
  }

  return (
    <div className="oo-root">
      <style>{`
        .oo-root { min-height:100vh; background:#0b0d14; color:#fff; font-family:Inter,ui-sans-serif,system-ui,sans-serif; display:grid; grid-template-rows:auto auto 1fr auto; }
        .oo-top { display:flex; align-items:center; justify-content:space-between; padding:14px 24px; border-bottom:1px solid #1f2332; flex-wrap:wrap; gap:8px; }
        .oo-mark { font-size:0.76rem; font-weight:900; letter-spacing:0.14em; text-transform:uppercase; color:#a78bfa; margin:0; }
        .oo-btn { font-size:0.8rem; font-weight:800; color:#8a93ad; background:transparent; border:1px solid #1f2332; border-radius:7px; padding:8px 13px; cursor:pointer; text-decoration:none; }
        .oo-btn:hover { border-color:#a78bfa; color:#fff; }

        .oo-gems { display:flex; gap:10px; justify-content:center; padding:14px; border-bottom:1px solid #1f2332; }
        .oo-gem { display:grid; justify-items:center; gap:3px; }
        .oo-gem-letter { width:52px; height:52px; border-radius:13px; display:grid; place-items:center; font-size:1.7rem; font-weight:900; background:#121520; border:2px solid #1f2332; color:#3a4460; transition:all 240ms ease; }
        .oo-gem.done .oo-gem-letter { background:#ef4444; border-color:#ef4444; color:#fff; }
        .oo-gem.cur .oo-gem-letter { border-color:#a78bfa; color:#c4b5fd; box-shadow:0 0 18px -4px #a78bfa; }
        .oo-gem-sub { font-size:0.62rem; font-weight:800; letter-spacing:0.04em; text-transform:uppercase; color:#5a6280; }

        .oo-main { padding:24px; display:grid; gap:16px; align-content:start; justify-items:center; max-width:900px; margin:0 auto; width:100%; }
        .oo-lines { display:grid; gap:12px; width:100%; }
        .oo-line { display:grid; grid-template-columns:1fr auto; gap:18px; align-items:center; animation:ooDrop 0.45s ease; }
        @keyframes ooDrop { from{opacity:0; transform:translateY(-12px);} to{opacity:1; transform:none;} }
        .oo-note { text-align:right; font-size:0.86rem; font-weight:800; color:#67e8f9; }
        .oo-expr { display:flex; align-items:center; gap:7px; justify-self:end; flex-wrap:wrap; }
        .oo-tok { font-size:clamp(1.6rem,4.4vw,2.4rem); font-weight:900; color:#e8ecf5; min-width:30px; text-align:center; }
        .oo-paren { color:#a78bfa; }
        .oo-op { font-size:clamp(1.4rem,4vw,2.1rem); font-weight:900; color:#9aa3bd; background:#161a28; border:1px solid #2a3045; border-radius:10px; padding:4px 14px; cursor:default; }
        .oo-op.live { color:#fff; border-color:#3a4460; cursor:pointer; }
        .oo-op.live:hover { border-color:#a78bfa; background:#1d2235; transform:translateY(-1px); }

        .oo-q { font-size:clamp(1.1rem,2.6vw,1.4rem); font-weight:800; text-align:center; color:#e8ecf5; min-height:1.4em; }
        .oo-feedback { font-size:0.92rem; font-weight:700; color:#9aa3bd; text-align:center; }
        .oo-hint { background:rgba(167,139,250,0.12); border:1px solid rgba(167,139,250,0.4); color:#c4b5fd; border-radius:10px; padding:11px 16px; font-weight:700; font-size:0.92rem; max-width:560px; text-align:center; }
        .oo-solved { font-size:clamp(2.2rem,7vw,4rem); font-weight:900; color:#22c55e; text-align:center; }

        .oo-modal { position:fixed; inset:0; background:rgba(5,7,12,0.82); display:grid; place-items:center; z-index:40; padding:20px; }
        .oo-card { background:#121520; border:1px solid #2a3045; border-radius:18px; padding:26px 28px; max-width:440px; width:100%; display:grid; gap:16px; box-shadow:0 30px 80px -20px #000; text-align:center; }
        .oo-prompt { font-size:1.6rem; font-weight:900; }
        .oo-input { font-size:1.6rem; font-weight:900; text-align:center; background:#0b0d14; border:2px solid #2a3045; border-radius:12px; color:#fff; padding:12px; width:160px; margin:0 auto; }
        .oo-submit { font-size:1.05rem; font-weight:900; color:#fff; background:#a78bfa; border:none; border-radius:12px; padding:13px 28px; cursor:pointer; }
        .oo-presets { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
        .oo-preset { font-size:0.85rem; font-weight:800; color:#c8cedd; background:#121520; border:1px solid #1f2332; border-radius:999px; padding:7px 13px; cursor:pointer; }
        .oo-preset:hover { border-color:#a78bfa; }
        .oo-foot { padding:12px 24px; border-top:1px solid #1f2332; display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; }
      `}</style>

      <header className="oo-top">
        <p className="oo-mark">GEMS — Order of Operations</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="oo-btn" onClick={() => load(PRESETS[Math.floor(Math.random() * PRESETS.length)].tokens)}>🎲 Random</button>
          <button className="oo-btn" onClick={() => load(lines[0].tokens)}>↻ Restart</button>
          <a className="oo-btn" href="/">Home</a>
        </div>
      </header>

      <div className="oo-gems">
        {([["G", "Grouping"], ["E", "Exponents"], ["M", "Multiply / Divide"], ["S", "Subtract / Add"]] as [keyof typeof done, string][]).map(([L, sub]) => (
          <div key={L} className={`oo-gem${done[L] ? " done" : ""}${curCat === L ? " cur" : ""}`}>
            <div className="oo-gem-letter">{L}</div>
            <div className="oo-gem-sub">{sub}</div>
          </div>
        ))}
      </div>

      <main className="oo-main">
        <div className="oo-lines">
          {lines.map((ln, li) => (
            <div className="oo-line" key={li}>
              <div className="oo-note">{ln.note}</div>
              <div className="oo-expr">
                {ln.tokens.map((t, i) => isOp(t)
                  ? <button key={i} className={`oo-op${li === lines.length - 1 && phase === "pick" ? " live" : ""}`} disabled={li !== lines.length - 1 || phase !== "pick"} onClick={() => clickOp(i)}>{t}</button>
                  : <span key={i} className={`oo-tok${t === "(" || t === ")" ? " oo-paren" : ""}`}>{t}</span>)}
              </div>
            </div>
          ))}
        </div>

        {phase === "solved" ? (
          <div className="oo-solved">= {tokens[0]} 🎉</div>
        ) : (
          <>
            <p className="oo-q">{feedback}</p>
            {hint && <div className="oo-hint">💡 {hint}</div>}
          </>
        )}

        <div className="oo-presets">
          {PRESETS.map((p, i) => <button className="oo-preset" key={i} onClick={() => load(p.tokens)}>{p.label}</button>)}
        </div>
      </main>

      <footer className="oo-foot">
        <span className="oo-feedback" style={{ minHeight: 0 }}>{phase !== "solved" ? "Pick the first operation → type its answer → watch it drop to the next line." : "Solved! Every GEMS step is complete."}</span>
        <a className="oo-btn" href="/control">Control panel</a>
      </footer>

      {phase === "answer" && pending && (
        <div className="oo-modal">
          <div className="oo-card">
            <p className="oo-q" style={{ minHeight: 0 }}>What is this step?</p>
            <div className="oo-prompt">{pending.a} {pending.op} {pending.b} = ?</div>
            <input className="oo-input" type="number" value={input} autoFocus
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitAnswer(); }} />
            {feedback.startsWith("Recompute") && <p className="oo-feedback" style={{ color: "#fca5a5" }}>{feedback}</p>}
            <button className="oo-submit" onClick={submitAnswer}>Check →</button>
          </div>
        </div>
      )}
    </div>
  );
}
