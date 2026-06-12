"use client";

// GEMS Order of Operations — guided solver.
// Student clicks the operation to do FIRST. A pop-up asks for its result.
// Correct → that step collapses and the new expression DROPS to the next line.
// The current expression is large & centered; finished steps sit above it.
// GEMS letters run vertically in the left gutter, aligned to the row whose
// operation they describe, lighting red as each is completed.

import { useRef, useState, useCallback } from "react";

type Tokens = string[];
type Cat = "G" | "E" | "M" | "S";
interface Line { tokens: Tokens; note: string; cat: Cat | null; }
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
function categoryOf(t: Tokens): Cat | null {
  const k = nextOpIndex(t);
  if (k < 0) return null;
  if (innerParen(t)) return "G";
  if (t[k] === "^") return "E";
  if (t[k] === "×" || t[k] === "÷") return "M";
  return "S";
}

const CAT_SUB: Record<Cat, string> = { G: "Grouping", E: "Exponents", M: "Multiply / Divide", S: "Subtract / Add" };

export default function OrderOfOperations() {
  const [lines, setLines] = useState<Line[]>([{ tokens: PRESETS[0].tokens, note: "", cat: null }]);
  const [phase, setPhase] = useState<"pick" | "answer" | "solved">("pick");
  const [pending, setPending] = useState<{ k: number; a: string; op: string; b: string } | null>(null);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState("Click the operation you should do FIRST.");
  const [hint, setHint] = useState<string | null>(null);
  const [wrong, setWrong] = useState(0);
  const audioRef = useRef<AudioContext | null>(null);

  const tokens = lines[lines.length - 1].tokens;
  const curCat = categoryOf(tokens);

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
    setLines([{ tokens: t, note: "", cat: null }]); setPhase("pick"); setPending(null);
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
      const cat = categoryOf(tokens);
      const nt = stripParens([...tokens.slice(0, pending.k - 1), String(correct), ...tokens.slice(pending.k + 2)]);
      const cleanNote = `${pending.a} ${pending.op} ${pending.b} = ${correct}`;
      setLines((ls) => [...ls, { tokens: nt, note: cleanNote, cat }]);
      setPending(null);
      if (nt.length === 1) { setPhase("solved"); setFeedback(""); tone([523, 659, 784, 1047], 0.1, 0.2); }
      else { setPhase("pick"); setFeedback("Nice! Now click the next operation to do first."); }
    } else {
      tone([180, 140]); setWrong((w) => w + 1);
      setFeedback(`Recompute: what is ${pending.a} ${pending.op} ${pending.b}?`);
    }
  }

  // render a token list with superscript exponents and clickable operators
  function renderExpr(tks: Tokens, active: boolean) {
    const out: React.ReactNode[] = [];
    for (let i = 0; i < tks.length; i++) {
      const t = tks[i];
      if (isNum(t) && tks[i + 1] === "^" && isNum(tks[i + 2])) {
        const opIdx = i + 1;
        out.push(
          <button key={i} className={`oo-pow${active && phase === "pick" ? " live" : ""}`} disabled={!active || phase !== "pick"} onClick={() => clickOp(opIdx)}>
            {t}<sup>{tks[i + 2]}</sup>
          </button>
        );
        i += 2; continue;
      }
      if (isOp(t)) out.push(
        <button key={i} className={`oo-op${active && phase === "pick" ? " live" : ""}`} disabled={!active || phase !== "pick"} onClick={() => clickOp(i)}>{t}</button>
      );
      else out.push(<span key={i} className={`oo-tok${t === "(" || t === ")" ? " oo-paren" : ""}`}>{t}</span>);
    }
    return out;
  }

  return (
    <div className="oo-root">
      <style>{`
        .oo-root { min-height:100vh; background:linear-gradient(180deg,#283050 0%,#222a45 100%); color:#fff; font-family:Inter,ui-sans-serif,system-ui,sans-serif; display:grid; grid-template-rows:auto 1fr auto; }
        .oo-top { display:flex; align-items:center; justify-content:space-between; padding:14px 24px; border-bottom:1px solid #3a4570; flex-wrap:wrap; gap:8px; }
        .oo-mark { font-size:0.76rem; font-weight:900; letter-spacing:0.14em; text-transform:uppercase; color:#c4b5fd; margin:0; }
        .oo-btn { font-size:0.8rem; font-weight:800; color:#c7cdec; background:transparent; border:1px solid #3a4570; border-radius:7px; padding:8px 13px; cursor:pointer; text-decoration:none; }
        .oo-btn:hover { border-color:#a78bfa; color:#fff; }

        .oo-main { padding:26px 24px; display:grid; gap:22px; align-content:start; justify-items:center; max-width:920px; margin:0 auto; width:100%; }

        .oo-lines { display:grid; gap:14px; justify-items:center; width:100%; }
        .oo-line { display:flex; align-items:center; gap:16px; animation:ooDrop 0.45s ease; }
        @keyframes ooDrop { from{opacity:0; transform:translateY(-12px);} to{opacity:1; transform:none;} }
        .oo-gemv { width:46px; height:46px; flex:none; border-radius:12px; display:grid; place-items:center; font-size:1.5rem; font-weight:900; background:transparent; border:2px solid transparent; color:#5a6490; }
        .oo-gemv.done { background:#ef4444; border-color:#ef4444; color:#fff; }
        .oo-gemv.cur { border-color:#a78bfa; color:#c4b5fd; box-shadow:0 0 16px -4px #a78bfa; }
        .oo-gemv-wrap { display:grid; justify-items:center; gap:2px; }
        .oo-gemv-sub { font-size:0.54rem; font-weight:800; letter-spacing:0.03em; text-transform:uppercase; color:#5a6490; max-width:60px; text-align:center; }

        .oo-expr { display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:center; }
        .oo-done .oo-expr { opacity:0.5; }
        .oo-tok { font-weight:900; color:#eef1ff; }
        .oo-active .oo-tok { color:#fff; }
        .oo-paren { color:#c4b5fd; }
        .oo-op, .oo-pow { font-weight:900; color:#aeb6e0; background:rgba(255,255,255,0.04); border:1px solid #3a4570; border-radius:10px; padding:3px 12px; cursor:default; }
        .oo-pow sup { font-size:0.55em; }
        .oo-op.live, .oo-pow.live { color:#fff; cursor:pointer; }
        .oo-op.live:hover, .oo-pow.live:hover { border-color:#a78bfa; background:rgba(167,139,250,0.18); transform:translateY(-1px); }
        /* sizes: completed rows smaller, active row big */
        .oo-done .oo-tok, .oo-done .oo-op, .oo-done .oo-pow { font-size:clamp(1.1rem,3vw,1.6rem); }
        .oo-active .oo-tok, .oo-active .oo-op, .oo-active .oo-pow { font-size:clamp(2rem,6vw,3.4rem); }
        .oo-active .oo-op, .oo-active .oo-pow { padding:6px 16px; border-radius:13px; }

        .oo-q { font-size:clamp(1.05rem,2.6vw,1.4rem); font-weight:800; text-align:center; color:#eef1ff; min-height:1.4em; }
        .oo-feedback { font-size:0.92rem; font-weight:700; color:#aeb6e0; text-align:center; }
        .oo-hint { background:rgba(167,139,250,0.15); border:1px solid rgba(167,139,250,0.5); color:#ddd6fe; border-radius:10px; padding:11px 16px; font-weight:700; font-size:0.92rem; max-width:560px; text-align:center; }
        .oo-solved { font-size:clamp(2.2rem,7vw,4rem); font-weight:900; color:#4ade80; text-align:center; }

        .oo-modal { position:fixed; inset:0; background:rgba(15,18,38,0.82); display:grid; place-items:center; z-index:40; padding:20px; }
        .oo-card { background:#2b3358; border:1px solid #3a4570; border-radius:18px; padding:26px 28px; max-width:440px; width:100%; display:grid; gap:16px; box-shadow:0 30px 80px -20px #000; text-align:center; }
        .oo-prompt { font-size:2rem; font-weight:900; }
        .oo-prompt sup { font-size:0.55em; }
        .oo-input { font-size:1.6rem; font-weight:900; text-align:center; background:#1a2038; border:2px solid #3a4570; border-radius:12px; color:#fff; padding:12px; width:160px; margin:0 auto; }
        .oo-submit { font-size:1.05rem; font-weight:900; color:#fff; background:#a78bfa; border:none; border-radius:12px; padding:13px 28px; cursor:pointer; }
        .oo-presets { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
        .oo-preset { font-size:0.85rem; font-weight:800; color:#dfe3f7; background:rgba(255,255,255,0.05); border:1px solid #3a4570; border-radius:999px; padding:7px 13px; cursor:pointer; }
        .oo-preset:hover { border-color:#a78bfa; }
        .oo-foot { padding:12px 24px; border-top:1px solid #3a4570; display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; }
      `}</style>

      <header className="oo-top">
        <p className="oo-mark">GEMS — Order of Operations</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="oo-btn" onClick={() => load(PRESETS[Math.floor(Math.random() * PRESETS.length)].tokens)}>🎲 Random</button>
          <button className="oo-btn" onClick={() => load(lines[0].tokens)}>↻ Restart</button>
          <a className="oo-btn" href="/">Home</a>
        </div>
      </header>

      <main className="oo-main">
        <div className="oo-lines">
          {lines.map((ln, li) => {
            const active = li === lines.length - 1;
            // letter = category of the operation performed ON this row (producing the next row),
            // or the current pending op for the active row.
            const letter: Cat | null = li < lines.length - 1 ? lines[li + 1].cat : (phase !== "solved" ? curCat : null);
            const isDone = li < lines.length - 1;
            return (
              <div className={`oo-line ${active && phase !== "solved" ? "oo-active" : "oo-done"}`} key={li}>
                {letter ? (
                  <div className="oo-gemv-wrap">
                    <div className={`oo-gemv ${isDone ? "done" : "cur"}`}>{letter}</div>
                    <div className="oo-gemv-sub">{CAT_SUB[letter]}</div>
                  </div>
                ) : <div className="oo-gemv" style={{ visibility: "hidden" }} />}
                <div className="oo-expr">{renderExpr(ln.tokens, active)}</div>
              </div>
            );
          })}
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
        <span className="oo-feedback" style={{ minHeight: 0 }}>{phase !== "solved" ? "Pick the first operation → type its answer → it drops to the next line." : "Solved! Every GEMS step is complete."}</span>
        <a className="oo-btn" href="/control">Control panel</a>
      </footer>

      {phase === "answer" && pending && (
        <div className="oo-modal">
          <div className="oo-card">
            <p className="oo-q" style={{ minHeight: 0 }}>What is this step?</p>
            <div className="oo-prompt">
              {pending.op === "^"
                ? <>{pending.a}<sup>{pending.b}</sup> = ?</>
                : <>{pending.a} {pending.op} {pending.b} = ?</>}
            </div>
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
