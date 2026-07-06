"use client";

// GEMS Order of Operations — guided solver, level-by-level down a vertical rail.
//
// The GEMS acronym runs down the LEFT of the page (G, E, M, S). The problem
// starts in the G row. Beginner mode gates each level with a yes/no question
// ("Are there any grouping symbols?"): No → that letter greys out and the
// problem drops to the next row; Yes → the student selects the operation and
// does the math. Advanced mode skips the questions — the student just selects
// the next thing to evaluate and it computes automatically.

import { useEffect, useRef, useState, useCallback } from "react";
import { LiveToolBanner, useLiveToolConfig } from "./useLiveToolConfig";

type Tokens = string[];
type Cat = "G" | "E" | "M" | "S";
type Status = "upcoming" | "gate" | "working" | "done" | "skipped";
type Mode = "beginner" | "advanced";
interface Row { tokens: Tokens; status: Status }

const OPS = ["+", "−", "×", "÷", "^"];
const isOp = (t: string) => OPS.includes(t);
const isNum = (t: string) => t !== "(" && t !== ")" && !Number.isNaN(Number(t));
const prec = (t: string) => (t === "^" ? 3 : t === "×" || t === "÷" ? 2 : 1);

const LEVELS: { cat: Cat; sub: string; color: string; gate: string; pick: string }[] = [
  { cat: "G", sub: "Grouping", color: "#f95335", gate: "Are there any grouping symbols?", pick: "Click an operation inside the ( ) to do first." },
  { cat: "E", sub: "Exponents", color: "#fcaf38", gate: "Are there any exponents?", pick: "Click the exponent to evaluate." },
  { cat: "M", sub: "Multiply / Divide", color: "#50a3a4", gate: "Any multiplication or division?", pick: "Click the × or ÷ to do (left to right)." },
  { cat: "S", sub: "Subtract / Add", color: "#7c5cd6", gate: "Any subtraction or addition?", pick: "Click the + or − to do (left to right)." },
];
const CAT_INDEX: Record<Cat, number> = { G: 0, E: 1, M: 2, S: 3 };

const PRESETS: { label: string; tokens: Tokens }[] = [
  { label: "3 + 4 × 2", tokens: ["3", "+", "4", "×", "2"] },
  { label: "10 − 2 × 3 + 1", tokens: ["10", "−", "2", "×", "3", "+", "1"] },
  { label: "(5 − 1) × 3", tokens: ["(", "5", "−", "1", ")", "×", "3"] },
  { label: "2 ^ 3 + 4", tokens: ["2", "^", "3", "+", "4"] },
  { label: "4 × (2 + 3) − 6", tokens: ["4", "×", "(", "2", "+", "3", ")", "−", "6"] },
  { label: "2 × 3 ^ 2 − 4", tokens: ["2", "×", "3", "^", "2", "−", "4"] },
  { label: "(8 − 3) × 2 ^ 2", tokens: ["(", "8", "−", "3", ")", "×", "2", "^", "2"] },
];

function parseLiveExpression(expression: string): Tokens | null {
  const normalized = expression
    .replace(/[–—]/g, "-").replace(/[xX*]/g, "×").replace(/\//g, "÷").replace(/-/g, "−");
  const tokens = normalized.match(/\d+(?:\.\d+)?|[()+−×÷^]/g) || [];
  return tokens.length >= 3 ? tokens : null;
}
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

export default function OrderOfOperations() {
  const liveTool = useLiveToolConfig("/order-of-operations");
  const [mode, setMode] = useState<Mode>("beginner");
  const [rows, setRows] = useState<Row[]>(() => initRows(PRESETS[0].tokens, "beginner"));
  const [level, setLevel] = useState(0);
  const [pending, setPending] = useState<{ k: number; a: string; op: string; b: string } | null>(null);
  const [input, setInput] = useState("");
  const [solvedValue, setSolvedValue] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [startTokens, setStartTokens] = useState<Tokens>(PRESETS[0].tokens);
  const audioRef = useRef<AudioContext | null>(null);

  function initRows(t: Tokens, m: Mode): Row[] {
    const r: Row[] = LEVELS.map(() => ({ tokens: [] as Tokens, status: "upcoming" as Status }));
    if (m === "beginner") {
      r[0] = { tokens: t, status: "gate" };
    } else {
      // advanced starts on the first operation's level; earlier levels are skipped
      const startIdx = categoryStart(t);
      for (let i = 0; i < startIdx; i++) r[i] = { tokens: [], status: "skipped" };
      r[startIdx] = { tokens: t, status: "working" };
    }
    return r;
  }

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

  const load = useCallback((t: Tokens, m: Mode) => {
    setStartTokens(t);
    setRows(initRows(t, m));
    setLevel(0);
    setPending(null); setInput(""); setSolvedValue(null); setHint(null);
    setFeedback(m === "beginner" ? LEVELS[0].gate : LEVELS[categoryStart(t)].pick);
    if (m === "advanced") setLevel(categoryStart(t));
  }, []);

  function categoryStart(t: Tokens): number {
    const c = categoryOf(t);
    return c ? CAT_INDEX[c] : 0;
  }

  useEffect(() => {
    if (!liveTool || liveTool.route !== "/order-of-operations") return;
    const t = parseLiveExpression(liveTool.config.expression);
    if (t) load(t, mode);
  }, [liveTool?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function switchMode(m: Mode) { setMode(m); load(startTokens, m); }

  // --- beginner: answer the yes/no gate ---
  function answerGate(yes: boolean) {
    const cur = rows[level].tokens;
    const correctYes = categoryOf(cur) === LEVELS[level].cat;
    if (yes === correctYes) {
      tone([523, 784]); setHint(null);
      if (correctYes) {
        setRows((rs) => rs.map((r, i) => i === level ? { ...r, status: "working" } : r));
        setFeedback(LEVELS[level].pick);
      } else {
        // none of this category — grey it out and drop to next level
        dropToNext(level, cur, "skipped", "beginner");
      }
    } else {
      tone([180, 140]);
      if (correctYes) {
        setHint(`Look again — there ${LEVELS[level].cat === "G" ? "is a grouping symbol" : LEVELS[level].cat === "E" ? "is an exponent" : LEVELS[level].cat === "M" ? "is a × or ÷" : "is a + or −"} to handle here.`);
      } else {
        setHint(`Not yet — there are no ${LEVELS[level].sub.toLowerCase()} in this line. The answer is No.`);
      }
    }
  }

  // move from `fromLevel` to the next rail row with `endStatus` on the row we leave
  function dropToNext(fromLevel: number, tokens: Tokens, endStatus: Status, m: Mode) {
    const next = fromLevel + 1;
    if (next >= LEVELS.length) { finish(tokens); return; }
    setRows((rs) => rs.map((r, i) => {
      if (i === fromLevel) return { ...r, status: endStatus };
      if (i === next) return { tokens, status: m === "beginner" ? "gate" : "working" };
      return r;
    }));
    setLevel(next);
    setFeedback(m === "beginner" ? LEVELS[next].gate : LEVELS[next].pick);
  }

  function finish(tokens: Tokens) {
    setRows((rs) => rs.map((r, i) => i === level ? { ...r, tokens, status: "done" } : r));
    setSolvedValue(tokens[0]);
    setFeedback("");
    tone([523, 659, 784, 1047], 0.1, 0.2);
  }

  // --- clicking an operation in the active row ---
  function clickOp(k: number) {
    if (solvedValue) return;
    const cur = rows[level].tokens;
    if (rows[level].status !== "working") return;
    if (k !== nextOpIndex(cur)) {
      tone([180, 140]);
      setHint("Not first — inside this level, do the highest-priority operation, working left to right.");
      return;
    }
    if (mode === "advanced") {
      applyResult(k, compute(cur[k - 1], cur[k], cur[k + 1]));
    } else {
      setPending({ k, a: cur[k - 1], op: cur[k], b: cur[k + 1] });
      setInput(""); setHint(null); setFeedback("");
    }
  }

  function submitAnswer() {
    if (!pending) return;
    const cur = rows[level].tokens;
    const correct = compute(pending.a, pending.op, pending.b);
    if (Number(input) === correct) {
      tone([523, 784]);
      const k = pending.k;
      setPending(null);
      applyResult(k, correct);
    } else {
      tone([180, 140]);
      setFeedback(`Recompute: what is ${pending.a} ${pending.op} ${pending.b}?`);
    }
  }

  // replace the evaluated op with its value, update the row, advance if the level is done
  function applyResult(k: number, value: number) {
    const cur = rows[level].tokens;
    const nt = stripParens([...cur.slice(0, k - 1), String(value), ...cur.slice(k + 2)]);
    if (nt.length === 1) {
      setRows((rs) => rs.map((r, i) => i === level ? { ...r, tokens: nt } : r));
      finish(nt);
      return;
    }
    const stillSameLevel = categoryOf(nt) === LEVELS[level].cat;
    if (stillSameLevel) {
      // more of this category remains — update in place, keep working
      setRows((rs) => rs.map((r, i) => i === level ? { ...r, tokens: nt } : r));
      setFeedback(mode === "beginner" ? `Good — keep going, there's still ${LEVELS[level].sub.toLowerCase()} on this line.` : LEVELS[level].pick);
      setHint(null);
    } else if (mode === "beginner") {
      dropToNext(level, nt, "done", "beginner");
    } else {
      // advanced: jump straight to the next category's row, greying the skipped ones
      const cat = categoryOf(nt);
      const target = cat ? CAT_INDEX[cat] : LEVELS.length;
      if (target >= LEVELS.length) { finish(nt); return; }
      setRows((rs) => rs.map((r, i) => {
        if (i === level) return { ...r, tokens: nt, status: "done" };
        if (i > level && i < target) return { tokens: nt, status: "skipped" };
        if (i === target) return { tokens: nt, status: "working" };
        return r;
      }));
      setLevel(target);
      setFeedback(LEVELS[target].pick);
      setHint(null);
    }
  }

  // render an expression with superscript exponents and clickable operators
  function renderExpr(tks: Tokens, interactive: boolean) {
    const out: React.ReactNode[] = [];
    for (let i = 0; i < tks.length; i++) {
      const t = tks[i];
      if (isNum(t) && tks[i + 1] === "^" && isNum(tks[i + 2])) {
        const opIdx = i + 1;
        out.push(
          <button key={i} className={`oo-pow${interactive ? " live" : ""}`} disabled={!interactive} onClick={() => clickOp(opIdx)}>
            {t}<sup>{tks[i + 2]}</sup>
          </button>
        );
        i += 2; continue;
      }
      if (isOp(t)) out.push(
        <button key={i} className={`oo-op${interactive ? " live" : ""}`} disabled={!interactive} onClick={() => clickOp(i)}>{t}</button>
      );
      else out.push(<span key={i} className={`oo-tok${t === "(" || t === ")" ? " oo-paren" : ""}`}>{t}</span>);
    }
    return out;
  }

  const gateOpen = mode === "beginner" && rows[level]?.status === "gate" && !solvedValue;

  return (
    <div className="oo-root">
      <style>{`
        .oo-root { min-height:100vh; background:var(--bdb-ground); color:var(--bdb-ink); font-family:var(--bdb-font); display:flex; flex-direction:column; }
        .oo-top { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:14px clamp(16px,3vw,30px); border-bottom:1px solid var(--bdb-line); }
        .oo-mark { font-size:0.74rem; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:var(--bdb-ink-faint); margin:0; }
        .oo-modes { display:inline-flex; background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r-pill); padding:3px; }
        .oo-modes button { border:none; background:transparent; border-radius:var(--bdb-r-pill); padding:8px 18px; font:inherit; font-weight:600; font-size:0.9rem; color:var(--bdb-ink-soft); cursor:pointer; }
        .oo-modes button.on { background:var(--bdb-ink); color:#fff; }
        .oo-actions { display:flex; gap:8px; flex-wrap:wrap; }
        .oo-btn { font-size:0.84rem; font-weight:600; color:var(--bdb-ink-soft); background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r-pill); padding:8px 14px; cursor:pointer; text-decoration:none; }
        .oo-btn:hover { border-color:var(--bdb-ink-faint); color:var(--bdb-ink); }

        .oo-main { flex:1; display:flex; flex-direction:column; gap:18px; padding:clamp(16px,3vw,32px); max-width:1100px; margin:0 auto; width:100%; box-sizing:border-box; }

        .oo-grid { flex:1; display:grid; grid-template-columns:auto 1fr; gap:clamp(14px,2.5vw,30px) clamp(14px,3vw,34px); align-content:center; }
        .oo-tile { width:clamp(64px,9vw,108px); height:clamp(64px,9vw,108px); border-radius:20px; display:grid; place-items:center; position:relative;
          background:var(--bdb-card); border:2px solid var(--bdb-line); transition:all 200ms ease; }
        .oo-tile .L { font-size:clamp(1.9rem,4.5vw,3rem); font-weight:800; color:var(--bdb-ink-faint); line-height:1; }
        .oo-tile .S { position:absolute; bottom:7px; font-size:0.56rem; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:var(--bdb-ink-faint); text-align:center; width:92%; }
        .oo-tile.active { background:var(--c); border-color:var(--c); box-shadow:0 12px 30px -10px var(--c); transform:scale(1.04); }
        .oo-tile.active .L, .oo-tile.active .S { color:#fff; }
        .oo-tile.done { background:var(--c); border-color:var(--c); }
        .oo-tile.done .L, .oo-tile.done .S { color:#fff; }
        .oo-tile.done .L::after { content:" ✓"; font-size:0.5em; }
        .oo-tile.skipped { background:var(--bdb-ground-2); border-color:var(--bdb-line); opacity:0.55; }
        .oo-tile.skipped .L { text-decoration:line-through; }

        .oo-cell { display:flex; align-items:center; min-height:clamp(64px,9vw,108px); }
        .oo-expr { display:flex; align-items:center; gap:clamp(6px,1vw,12px); flex-wrap:wrap; }
        .oo-row.is-active .oo-expr { animation:ooDrop 0.4s ease; }
        @keyframes ooDrop { from{opacity:0; transform:translateY(-14px);} to{opacity:1; transform:none;} }
        .oo-tok { font-weight:800; color:var(--bdb-ink); }
        .oo-paren { color:#9a3412; }
        .oo-op, .oo-pow { font-weight:800; color:var(--bdb-ink-soft); background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:12px; padding:2px 12px; cursor:default; }
        .oo-pow sup { font-size:0.55em; }
        .oo-op.live, .oo-pow.live { color:var(--bdb-ink); cursor:pointer; border-color:color-mix(in srgb,var(--c,#674a40) 50%,var(--bdb-line)); }
        .oo-op.live:hover, .oo-pow.live:hover { background:color-mix(in srgb,var(--c,#674a40) 16%,white); border-color:var(--c,#674a40); transform:translateY(-1px); }

        .oo-row.is-active .oo-tok, .oo-row.is-active .oo-op, .oo-row.is-active .oo-pow { font-size:clamp(2rem,6.5vw,3.6rem); }
        .oo-row.is-active .oo-op, .oo-row.is-active .oo-pow { padding:6px 16px; border-radius:14px; }
        .oo-row.is-other .oo-tok, .oo-row.is-other .oo-op, .oo-row.is-other .oo-pow { font-size:clamp(1.1rem,3vw,1.7rem); }
        .oo-row.is-other .oo-expr { opacity:0.55; }
        .oo-placeholder { height:2px; width:60px; background:var(--bdb-line); border-radius:2px; opacity:0.6; }

        .oo-prompt { display:flex; flex-direction:column; align-items:center; gap:14px; text-align:center; padding:6px 0 10px; }
        .oo-gate-q { font-size:clamp(1.2rem,3vw,1.7rem); font-weight:700; color:var(--bdb-ink); }
        .oo-yesno { display:flex; gap:14px; }
        .oo-yn { font-size:1.15rem; font-weight:700; border:none; border-radius:14px; padding:14px 40px; cursor:pointer; color:#fff; }
        .oo-yn.yes { background:var(--bdb-green); }
        .oo-yn.no { background:var(--bdb-ink-soft); }
        .oo-yn:hover { filter:brightness(1.06); transform:translateY(-1px); }
        .oo-fb { font-size:1rem; font-weight:600; color:var(--bdb-ink-soft); min-height:1.3em; }
        .oo-hint { background:color-mix(in srgb,var(--bdb-amber) 16%,white); border:1px solid color-mix(in srgb,var(--bdb-amber) 40%,white); color:#8a5a0b; border-radius:12px; padding:11px 16px; font-weight:600; font-size:0.95rem; max-width:600px; }
        .oo-solved { font-size:clamp(2.4rem,8vw,4.4rem); font-weight:800; color:var(--bdb-green); text-align:center; }

        .oo-presets { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
        .oo-preset { font-size:0.85rem; font-weight:600; color:var(--bdb-ink-soft); background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:999px; padding:7px 13px; cursor:pointer; }
        .oo-preset:hover { border-color:var(--bdb-ink-faint); }

        .oo-modal { position:fixed; inset:0; background:rgba(32,30,26,0.6); display:grid; place-items:center; z-index:40; padding:20px; }
        .oo-card { background:var(--bdb-card); border-radius:20px; padding:26px 28px; max-width:420px; width:100%; display:grid; gap:16px; box-shadow:var(--bdb-shadow-lg); text-align:center; }
        .oo-card .q { font-size:1rem; font-weight:600; color:var(--bdb-ink-soft); margin:0; }
        .oo-bigq { font-size:2rem; font-weight:800; color:var(--bdb-ink); }
        .oo-bigq sup { font-size:0.55em; }
        .oo-input { font-size:1.6rem; font-weight:800; text-align:center; background:var(--bdb-ground); border:2px solid var(--bdb-line); border-radius:12px; color:var(--bdb-ink); padding:12px; width:160px; margin:0 auto; }
        .oo-submit { font-size:1.05rem; font-weight:700; color:#fff; background:var(--bdb-teal); border:none; border-radius:12px; padding:13px 28px; cursor:pointer; }
        .oo-err { color:var(--bdb-coral); font-weight:700; font-size:0.9rem; }
      `}</style>

      <header className="oo-top">
        <p className="oo-mark">GEMS — Order of Operations</p>
        <div className="oo-modes">
          <button className={mode === "beginner" ? "on" : ""} onClick={() => switchMode("beginner")}>Regular</button>
          <button className={mode === "advanced" ? "on" : ""} onClick={() => switchMode("advanced")}>Level Up!</button>
        </div>
        <div className="oo-actions">
          <button className="oo-btn" onClick={() => load(PRESETS[Math.floor(Math.random() * PRESETS.length)].tokens, mode)}>Random</button>
          <button className="oo-btn" onClick={() => load(startTokens, mode)}>Restart</button>
          <a className="oo-btn" href="/teacher">Tools</a>
        </div>
      </header>

      <main className="oo-main">
        <LiveToolBanner tool={liveTool} />

        <div className="oo-grid">
          {LEVELS.map((lv, i) => {
            const row = rows[i];
            const st = row.status;
            const isActive = i === level && (st === "gate" || st === "working") && !solvedValue;
            const tileClass = st === "done" ? "done" : st === "skipped" ? "skipped" : (i === level && !solvedValue) ? "active" : "";
            const interactive = i === level && st === "working" && !pending && !solvedValue;
            return (
              <div className={`oo-row ${isActive ? "is-active" : "is-other"}`} key={lv.cat} style={{ display: "contents" }}>
                <div className={`oo-tile ${tileClass}`} style={{ ["--c" as string]: lv.color }}>
                  <span className="L">{lv.cat}</span>
                  <span className="S">{lv.sub}</span>
                </div>
                <div className="oo-cell" style={{ ["--c" as string]: lv.color }}>
                  {(st === "upcoming" || row.tokens.length === 0) ? <span className="oo-placeholder" /> : <div className="oo-expr">{renderExpr(row.tokens, interactive)}</div>}
                </div>
              </div>
            );
          })}
        </div>

        {solvedValue ? (
          <div className="oo-solved">= {solvedValue}</div>
        ) : gateOpen ? (
          <div className="oo-prompt">
            <div className="oo-gate-q">{LEVELS[level].gate}</div>
            <div className="oo-yesno">
              <button className="oo-yn yes" onClick={() => answerGate(true)}>Yes</button>
              <button className="oo-yn no" onClick={() => answerGate(false)}>No</button>
            </div>
            {hint && <div className="oo-hint">{hint}</div>}
          </div>
        ) : (
          <div className="oo-prompt">
            <div className="oo-fb">{feedback}</div>
            {hint && <div className="oo-hint">{hint}</div>}
          </div>
        )}

        <div className="oo-presets">
          {PRESETS.map((p, i) => <button className="oo-preset" key={i} onClick={() => load(p.tokens, mode)}>{p.label}</button>)}
        </div>
      </main>

      {pending && (
        <div className="oo-modal">
          <div className="oo-card">
            <p className="q">Do the math for this step</p>
            <div className="oo-bigq">
              {pending.op === "^" ? <>{pending.a}<sup>{pending.b}</sup> = ?</> : <>{pending.a} {pending.op} {pending.b} = ?</>}
            </div>
            <input className="oo-input" type="number" value={input} autoFocus
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitAnswer(); }} />
            {feedback.startsWith("Recompute") && <p className="oo-err">{feedback}</p>}
            <button className="oo-submit" onClick={submitAnswer}>Check →</button>
          </div>
        </div>
      )}
    </div>
  );
}
