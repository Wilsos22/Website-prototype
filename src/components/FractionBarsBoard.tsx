"use client";

// Fraction Bars — M1.T1.L5 support (6.NS.1: dividing fractions).
// Four modes, all optional support (no scoring):
//   "How many fit?"    — the Count-Draw-Verify loop: BUILD the dividend, TILE
//                        unit-fraction groups under it, COUNT the tiles (not
//                        the tick marks), VERIFY with quotient x divisor.
//   "Mixed numbers"    — convert a mixed number to an improper fraction by
//                        splitting the wholes into unit pieces and counting.
//   "Keep Change Flip" — the reciprocal algorithm, walked one badge at a time
//                        with the division sign morphing and the second
//                        fraction physically flipping. (For L5-D3 — the
//                        algorithm is EARNED after the models, not before.)
//   "Explore"          — fraction wall: one whole on top, rows of tapped-in
//                        pieces laid end to end beneath it for comparison.

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { LiveToolBanner, useLiveToolConfig } from "./useLiveToolConfig";

const C_TEAL = "#50a3a4";
const C_AMBER = "#fcaf38";
const C_CORAL = "#f95335";
const C_GREEN = "#2f9e6f";

// ── "How many fit?" problems (from the lesson's paper set) ──────────────────
interface DivProblem { n: number; d: number; d2: number } // n/d divided by 1/d2
const DIV_PROBLEMS: DivProblem[] = [
  { n: 3, d: 4, d2: 8 },
  { n: 2, d: 3, d2: 6 },
  { n: 5, d: 8, d2: 16 },
  { n: 3, d: 5, d2: 10 },
];
const quotientOf = (p: DivProblem) => (p.n * p.d2) / p.d;

// ── Mixed-number problems ───────────────────────────────────────────────────
interface MixedProblem { w: number; n: number; d: number } // w n/d
const MIXED_PROBLEMS: MixedProblem[] = [
  { w: 2, n: 1, d: 3 },  // 2 1/3 = 7/3
  { w: 1, n: 3, d: 4 },  // 1 3/4 = 7/4
  { w: 3, n: 1, d: 2 },  // 3 1/2 = 7/2
  { w: 2, n: 5, d: 8 },  // 2 5/8 = 21/8
];

// ── Keep-Change-Flip problems ───────────────────────────────────────────────
interface KcfProblem { a: [number, number]; b: [number, number] } // a divided by b
const KCF_PROBLEMS: KcfProblem[] = [
  { a: [3, 4], b: [1, 8] },   // = 6
  { a: [2, 3], b: [1, 6] },   // = 4
  { a: [5, 6], b: [1, 12] },  // = 10
  { a: [3, 4], b: [2, 3] },   // = 9/8 (stays a fraction)
];
const kcfProduct = (p: KcfProblem): [number, number] => [p.a[0] * p.b[1], p.a[1] * p.b[0]];

// Plural word for a unit-fraction denominator: 3 -> "thirds", 8 -> "eighths".
const NTHS: Record<number, string> = {
  2: "halves", 3: "thirds", 4: "fourths", 5: "fifths", 6: "sixths",
  8: "eighths", 10: "tenths", 12: "twelfths", 16: "sixteenths",
};
const nths = (d: number) => NTHS[d] ?? `${d}ths`;

// ── Explore-mode pieces (fraction wall) ─────────────────────────────────────
const EX_PIECES = [
  { den: 1, label: "1", color: "#674a40" },
  { den: 2, label: "1/2", color: C_TEAL },
  { den: 3, label: "1/3", color: "#7c5cd6" },
  { den: 4, label: "1/4", color: C_AMBER },
  { den: 5, label: "1/5", color: "#3f7fbf" },
  { den: 6, label: "1/6", color: C_CORAL },
  { den: 8, label: "1/8", color: C_GREEN },
  { den: 10, label: "1/10", color: "#c25588" },
  { den: 12, label: "1/12", color: "#a06b2a" },
];
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
// Exact sum of a row of unit fractions, reduced: [numerator, denominator].
const rowSum = (row: number[]): [number, number] => {
  let n = 0, d = 1;
  for (const den of row) {
    n = n * den + d;
    d = d * den;
    const g = gcd(n, d);
    n /= g; d /= g;
  }
  return [n, d];
};
const sumLabel = ([n, d]: [number, number]) => (d === 1 ? `${n}` : `${n}/${d}`);

// Stacked fraction, written the way it looks in a problem. `flipped` swaps the
// numerator and denominator with a sliding animation (Keep-Change-Flip).
function Frac({ n, d, color, flipped }: { n: ReactNode; d: ReactNode; color?: string; flipped?: boolean }) {
  return (
    <span className="fb-frac" style={color ? { color } : undefined}>
      <span className="fb-fn" style={{ transform: flipped ? "translateY(33px)" : "none" }}>{n}</span>
      <span className="fb-fbar" />
      <span className="fb-fd" style={{ transform: flipped ? "translateY(-33px)" : "none" }}>{d}</span>
    </span>
  );
}

export function FractionBarsBoard() {
  const liveTool = useLiveToolConfig("/fraction-bars");
  const [mode, setModeRaw] = useState<"divide" | "mixed" | "kcf" | "explore">("divide");
  const [note, setNote] = useState<string | null>(null);
  const setMode = (m: typeof mode) => { setModeRaw(m); setNote(null); };

  // ── divide state ───────────────────────────────────────────────────────────
  const [pIdx, setPIdx] = useState(0);
  const prob = DIV_PROBLEMS[pIdx];
  const q = quotientOf(prob);
  const [phase, setPhase] = useState<"build" | "tile" | "count" | "verify" | "done">("build");
  const [built, setBuilt] = useState(0);
  const [tiles, setTiles] = useState(0);
  const [countIn, setCountIn] = useState("");
  const [verifyIn, setVerifyIn] = useState("");
  const [showTileNums, setShowTileNums] = useState(false);

  const startProblem = useCallback((idx: number) => {
    setPIdx(idx);
    setPhase("build"); setBuilt(0); setTiles(0);
    setCountIn(""); setVerifyIn(""); setNote(null); setShowTileNums(false);
  }, []);

  useEffect(() => {
    if (phase !== "build" || built !== prob.n) return;
    const t = window.setTimeout(() => { setNote(null); setPhase("tile"); }, 650);
    return () => window.clearTimeout(t);
  }, [phase, built, prob]);

  useEffect(() => {
    if (phase !== "tile" || tiles !== q) return;
    const t = window.setTimeout(() => { setNote(null); setPhase("count"); }, 650);
    return () => window.clearTimeout(t);
  }, [phase, tiles, q]);

  const addBuilt = () => {
    if (phase !== "build") return;
    const next = built + 1;
    setBuilt(next);
    if (next > prob.n) setNote(`That is more than ${prob.n}/${prob.d} now — take some off.`);
    else if (next === prob.n) setNote(`That is ${prob.n}/${prob.d}.`);
    else setNote(null);
  };
  const removeBuilt = () => { if (phase === "build" && built > 0) { setBuilt(built - 1); setNote(null); } };
  const addTile = () => {
    if (phase !== "tile") return;
    const next = tiles + 1;
    setTiles(next);
    if (next > q) setNote(`That group went PAST ${prob.n}/${prob.d} — take it off.`);
    else if (next === q) setNote("The groups fill it exactly.");
    else setNote(null);
  };
  const removeTile = () => { if (phase === "tile" && tiles > 0) { setTiles(tiles - 1); setNote(null); } };

  const submitCount = () => {
    const v = Number(countIn.trim());
    if (!countIn.trim() || !Number.isFinite(v)) return;
    if (v === q) { setNote(null); setShowTileNums(false); setPhase("verify"); return; }
    if (v === q + 1) setNote("You counted the tick MARKS. Count the tiles — each tile is one group.");
    else setNote(`Count the tiles one at a time — each tile is one group of 1/${prob.d2}.`);
    setShowTileNums(true);
    setCountIn("");
  };
  const submitVerify = () => {
    const v = Number(verifyIn.trim());
    if (!verifyIn.trim() || !Number.isFinite(v)) return;
    if (v === q) { setNote(null); setPhase("done"); return; }
    setNote(`${q} groups of 1/${prob.d2} makes how many ${nths(prob.d2)} in all?`);
    setVerifyIn("");
  };

  // ── mixed-number state ─────────────────────────────────────────────────────
  const [mIdx, setMIdx] = useState(0);
  const mp = MIXED_PROBLEMS[mIdx];
  const [mPhase, setMPhase] = useState<"intro" | "wholes" | "total" | "done">("intro");
  const [mIn, setMIn] = useState("");
  const [mNums, setMNums] = useState(false); // number the pieces after a miss

  const startMixed = useCallback((idx: number) => {
    setMIdx(idx); setMPhase("intro"); setMIn(""); setNote(null); setMNums(false);
  }, []);

  const submitMixed = () => {
    const v = Number(mIn.trim());
    if (!mIn.trim() || !Number.isFinite(v)) return;
    if (mPhase === "wholes") {
      if (v === mp.w * mp.d) { setNote(null); setMNums(false); setMIn(""); setMPhase("total"); return; }
      setNote(`Each whole splits into ${mp.d} pieces — count every piece in the wholes.`);
      setMNums(true); setMIn("");
      return;
    }
    if (mPhase === "total") {
      if (v === mp.w * mp.d + mp.n) { setNote(null); setMNums(false); setMIn(""); setMPhase("done"); return; }
      setNote(`Add the extra ${mp.n} piece${mp.n === 1 ? "" : "s"} to the ${mp.w * mp.d} from the wholes.`);
      setMNums(true); setMIn("");
    }
  };

  // ── keep-change-flip state ─────────────────────────────────────────────────
  const [kIdx, setKIdx] = useState(0);
  const kp = KCF_PROBLEMS[kIdx];
  const [prodN, prodD] = kcfProduct(kp);
  const kInteger = prodN % prodD === 0;
  const [kStep, setKStep] = useState(0); // 0 start, 1 keep, 2 change, 3 flip
  const [kStage, setKStage] = useState<"walk" | "product" | "final" | "done">("walk");
  const [kN, setKN] = useState("");
  const [kD, setKD] = useState("");
  const [kQ, setKQ] = useState("");

  const startKcf = useCallback((idx: number) => {
    setKIdx(idx); setKStep(0); setKStage("walk");
    setKN(""); setKD(""); setKQ(""); setNote(null);
  }, []);

  const kcfAdvance = () => {
    if (kStep < 3) {
      const next = kStep + 1;
      setKStep(next);
      if (next === 3) window.setTimeout(() => setKStage("product"), 900);
      return;
    }
  };
  const submitKcfProduct = () => {
    const n = Number(kN.trim()), d = Number(kD.trim());
    if (!kN.trim() || !kD.trim()) return;
    if (n === prodN && d === prodD) {
      setNote(null);
      setKStage(kInteger ? "final" : "done");
      return;
    }
    setNote("Multiply straight across: top times top, bottom times bottom. Keep the FIRST fraction exactly as it is.");
    setKN(""); setKD("");
  };
  const submitKcfFinal = () => {
    const v = Number(kQ.trim());
    if (!kQ.trim() || !Number.isFinite(v)) return;
    if (v === prodN / prodD) { setNote(null); setKStage("done"); return; }
    setNote(`${prodN} divided by ${prodD} — how many wholes is that?`);
    setKQ("");
  };

  // ── explore state (fraction wall) ──────────────────────────────────────────
  const [exRows, setExRows] = useState<number[][]>([[], []]);
  const [exSel, setExSel] = useState(0);

  const exAdd = (den: number) => {
    const row = exRows[exSel] ?? [];
    const [n, d] = rowSum(row);
    if (n * den + d > d * den) {
      setNote("That row already makes one whole. Add a row to keep comparing.");
      return;
    }
    setNote(null);
    setExRows((rs) => rs.map((r, i) => (i === exSel ? [...r, den] : r)));
  };
  const exRemovePiece = (ri: number, pi: number) => {
    setExSel(ri);
    setNote(null);
    setExRows((rs) => rs.map((r, i) => (i === ri ? r.filter((_, j) => j !== pi) : r)));
  };
  const exAddRow = () => {
    setExSel(exRows.length);
    setNote(null);
    setExRows((rs) => [...rs, []]);
  };
  const exRemoveRow = () => {
    if (exRows.length <= 1) return;
    setExRows((rs) => rs.filter((_, i) => i !== exSel));
    setExSel((s) => Math.min(s, exRows.length - 2));
    setNote(null);
  };
  const exClearRow = () => {
    setExRows((rs) => rs.map((r, i) => (i === exSel ? [] : r)));
    setNote(null);
  };

  const wholeTicks = (den: number) => Array.from({ length: den - 1 }, (_, i) => ((i + 1) / den) * 100);

  return (
    <div className="fb-wrap">
      <style>{`
        .fb-wrap { font-family:var(--bdb-font); color:var(--bdb-ink); max-width:760px; margin:0 auto; padding:14px clamp(10px,3vw,20px) 34px; }
        .fb-modebar { display:flex; justify-content:center; margin:0 0 14px; }
        .fb-modeseg { display:inline-flex; flex-wrap:wrap; justify-content:center; border:2px solid var(--bdb-line); border-radius:22px; overflow:hidden; background:var(--bdb-card); }
        .fb-modeseg button { font:inherit; font-weight:800; font-size:0.86rem; min-height:44px; padding:0 16px; border:none; background:transparent; color:var(--bdb-ink-soft); cursor:pointer; }
        .fb-modeseg button.on { background:var(--bdb-ink); color:#fff; }
        .fb-prompt { text-align:center; font-size:clamp(1.1rem,3.2vw,1.5rem); font-weight:800; margin:2px 0 4px; min-height:30px; }
        .fb-sub { text-align:center; color:var(--bdb-ink-soft); font-size:0.92rem; margin:0 0 12px; min-height:18px; }
        .fb-tbtn { font:inherit; font-weight:700; font-size:0.82rem; padding:6px 13px; border-radius:999px; border:1px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink-soft); cursor:pointer; }
        .fb-tbtn.on { background:var(--bdb-ink); color:#fff; border-color:var(--bdb-ink); }
        .fb-tbtn:disabled { opacity:0.42; cursor:not-allowed; }
        .fb-stage { width:min(620px,100%); margin:0 auto; display:grid; gap:14px; }
        .fb-rowlbl { font-size:0.72rem; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; color:var(--bdb-ink-faint); margin-bottom:4px; }
        .fb-track { position:relative; height:46px; border:2px dashed var(--bdb-line); background:var(--bdb-card); }
        .fb-track.solid { border-style:solid; border-color:var(--bdb-ink); }
        .fb-endlbl { position:absolute; top:100%; margin-top:3px; font-size:0.78rem; font-weight:800; color:var(--bdb-ink-faint); }
        .fb-piece { position:absolute; top:0; height:100%; display:grid; place-items:center; color:#fff; font-weight:900; font-size:0.95rem; border-right:2px solid rgba(255,255,255,0.75); box-sizing:border-box; }
        .fb-piece.pop { animation:fbPop .3s cubic-bezier(.34,.8,.3,1) backwards; }
        @keyframes fbPop { from { opacity:0; transform:scale(.6); } to { opacity:1; transform:scale(1); } }
        .fb-tick { position:absolute; top:0; height:100%; width:0; border-left:1px dashed color-mix(in srgb, var(--bdb-ink) 22%, transparent); }
        .fb-goal { position:absolute; top:-8px; bottom:-8px; width:3px; background:var(--bdb-coral); }
        .fb-bar { display:flex; gap:8px; justify-content:center; align-items:center; margin-top:14px; flex-wrap:wrap; }
        .fb-probs { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-bottom:10px; }
        .fb-btn { font:inherit; font-weight:700; font-size:0.9rem; padding:9px 16px; border-radius:11px; border:1px solid var(--bdb-line); background:var(--bdb-ink); color:#fff; cursor:pointer; }
        .fb-btn.ghost { background:var(--bdb-card); color:var(--bdb-ink); }
        .fb-btn:disabled { opacity:0.42; cursor:not-allowed; }
        .fb-in { width:84px; font:inherit; font-size:1.2rem; font-weight:900; text-align:center; padding:7px; border:3px solid var(--bdb-ink); border-radius:0; background:#fff; color:var(--bdb-ink); }
        .fb-formula { display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:12px; font-weight:900; font-size:clamp(1.3rem,4vw,1.8rem); margin-top:14px; }
        .fb-frac { display:inline-grid; justify-items:center; line-height:1; }
        .fb-fn, .fb-fd { display:block; height:30px; display:grid; place-items:center; min-width:26px; padding:0 4px; transition:transform .7s cubic-bezier(.34,.8,.3,1); }
        .fb-fbar { width:100%; height:3px; background:currentColor; border-radius:2px; }
        .fb-op { position:relative; width:38px; height:38px; display:inline-grid; place-items:center; }
        .fb-op span { position:absolute; inset:0; display:grid; place-items:center; transition:opacity .5s ease, transform .6s cubic-bezier(.34,.8,.3,1); }
        .fb-kcol { display:inline-grid; justify-items:center; gap:6px; }
        .fb-badge { font-size:0.66rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; padding:3px 10px; border-radius:999px; color:#fff; opacity:0; transform:translateY(6px); transition:opacity .4s ease, transform .4s ease; }
        .fb-badge.on { opacity:1; transform:none; }
        .fb-keepring { border-radius:10px; padding:6px 8px; transition:box-shadow .4s ease; }
        .fb-keepring.on { box-shadow:0 0 0 3px ${C_GREEN}; }
        .fb-note { text-align:center; min-height:26px; margin-top:12px; }
        .fb-note-in { display:inline-block; color:var(--bdb-coral); font-weight:800; font-size:clamp(1rem,3vw,1.3rem); line-height:1.35; padding:8px 16px; border-radius:12px; background:color-mix(in srgb, var(--bdb-coral) 12%, transparent); }
        .fb-done { text-align:center; font-size:clamp(1.2rem,3.6vw,1.8rem); font-weight:900; margin-top:12px; }
        .fb-palette { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-bottom:10px; }
        .fb-pal { font:inherit; font-weight:900; font-size:1rem; min-height:44px; padding:0 16px; border:2px solid var(--bdb-ink); background:var(--bdb-card); color:var(--bdb-ink); cursor:pointer; }
        .fb-track.exsel { border-style:solid; border-color:var(--bdb-ink); box-shadow:0 0 0 3px color-mix(in srgb, var(--bdb-amber) 55%, transparent); }
        button.fb-piece { border-top:none; border-bottom:none; border-left:none; font:inherit; font-weight:900; font-size:0.95rem; padding:0; cursor:pointer; }
        .fb-rowsum { font-weight:900; color:var(--bdb-ink); text-transform:none; letter-spacing:0; font-size:0.9rem; margin-left:6px; }
        .fb-tilenum { position:absolute; inset:0; display:grid; place-items:center; color:var(--bdb-ink); font-weight:900; }
        @media (prefers-reduced-motion: reduce) { .fb-piece.pop { animation:none; } .fb-fn, .fb-fd, .fb-op span, .fb-badge { transition:none; } }
      `}</style>

      <LiveToolBanner tool={liveTool} />

      <div className="fb-modebar">
        <div className="fb-modeseg">
          <button className={mode === "divide" ? "on" : ""} onClick={() => { setMode("divide"); setNote(null); }}>How many fit?</button>
          <button className={mode === "mixed" ? "on" : ""} onClick={() => { setMode("mixed"); setNote(null); }}>Mixed numbers</button>
          <button className={mode === "kcf" ? "on" : ""} onClick={() => { setMode("kcf"); setNote(null); }}>Keep Change Flip</button>
          <button className={mode === "explore" ? "on" : ""} onClick={() => { setMode("explore"); setNote(null); }}>Explore</button>
        </div>
      </div>

      {mode === "divide" && (
        <>
          <div className="fb-prompt">
            {phase === "build" && `Build the total: ${prob.n}/${prob.d}`}
            {phase === "tile" && `How many 1/${prob.d2} groups fit in ${prob.n}/${prob.d}?`}
            {phase === "count" && "Count the groups"}
            {phase === "verify" && "Verify it with multiplication"}
            {phase === "done" && `${prob.n}/${prob.d} ÷ 1/${prob.d2} = ${q}`}
          </div>
          <div className="fb-sub">
            {phase === "build" && `Tap to add ${nths(prob.d)} until the bar shows ${prob.n}/${prob.d}.`}
            {phase === "tile" && `Tile 1/${prob.d2} pieces under it until they fill the SAME length.`}
            {phase === "count" && "Count the tiles — the groups — not the tick marks."}
            {phase === "verify" && "The quotient counts groups, so the groups must multiply back to the total."}
            {phase === "done" && "Counted, drawn, and verified."}
          </div>

          <div className="fb-probs">
            {DIV_PROBLEMS.map((pr, i) => (
              <button key={i} className={`fb-tbtn ${i === pIdx ? "on" : ""}`} onClick={() => startProblem(i)}>
                {pr.n}/{pr.d} ÷ 1/{pr.d2}
              </button>
            ))}
            <button className="fb-tbtn" onClick={() => startProblem(pIdx)}>Reset</button>
          </div>

          <div className="fb-stage">
            <div>
              <div className="fb-rowlbl">The whole</div>
              <div className="fb-track solid">
                {wholeTicks(prob.d).map((pct) => <div key={pct} className="fb-tick" style={{ left: `${pct}%` }} />)}
                <span className="fb-endlbl" style={{ left: 0 }}>0</span>
                <span className="fb-endlbl" style={{ right: 0 }}>1</span>
              </div>
            </div>
            <div>
              <div className="fb-rowlbl">The total: {prob.n}/{prob.d}</div>
              <div className="fb-track">
                {Array.from({ length: built }).map((_, i) => (
                  <div key={i} className="fb-piece pop" style={{ left: `${(i / prob.d) * 100}%`, width: `${100 / prob.d}%`, background: C_TEAL }}>
                    1/{prob.d}
                  </div>
                ))}
                {phase !== "build" && <div className="fb-goal" style={{ left: `${(prob.n / prob.d) * 100}%` }} />}
              </div>
            </div>
            {phase !== "build" && (
              <div>
                <div className="fb-rowlbl">Groups of 1/{prob.d2}</div>
                <div className="fb-track">
                  {Array.from({ length: tiles }).map((_, i) => (
                    <div key={i} className="fb-piece pop" style={{ left: `${(i / prob.d2) * 100}%`, width: `${100 / prob.d2}%`, background: i < q ? C_AMBER : C_CORAL, color: "var(--bdb-ink)" }}>
                      {showTileNums && i < q ? <span className="fb-tilenum">{i + 1}</span> : `1/${prob.d2}`}
                    </div>
                  ))}
                  <div className="fb-goal" style={{ left: `${(prob.n / prob.d) * 100}%` }} />
                </div>
              </div>
            )}
          </div>

          {phase === "build" && (
            <div className="fb-bar">
              <button className="fb-btn" onClick={addBuilt}>Add 1/{prob.d}</button>
              <button className="fb-btn ghost" disabled={built === 0} onClick={removeBuilt}>Take one off</button>
            </div>
          )}
          {phase === "tile" && (
            <div className="fb-bar">
              <button className="fb-btn" onClick={addTile}>Add a 1/{prob.d2} group</button>
              <button className="fb-btn ghost" disabled={tiles === 0} onClick={removeTile}>Take one off</button>
            </div>
          )}
          {phase === "count" && (
            <div className="fb-formula">
              <Frac n={prob.n} d={prob.d} color={C_TEAL} />
              <span>÷</span>
              <Frac n={1} d={prob.d2} color="var(--bdb-ink)" />
              <span>=</span>
              <input className="fb-in" value={countIn} inputMode="numeric" autoFocus aria-label="how many groups fit"
                onChange={(e) => { setCountIn(e.target.value.replace(/\D/g, "")); setNote(null); }}
                onKeyDown={(e) => e.key === "Enter" && submitCount()} />
              <button className="fb-btn" disabled={!countIn.trim()} onClick={submitCount}>Enter</button>
            </div>
          )}
          {phase === "verify" && (
            <div className="fb-formula">
              <span>{q} ×</span>
              <Frac n={1} d={prob.d2} />
              <span>=</span>
              <input className="fb-in" value={verifyIn} inputMode="numeric" autoFocus aria-label="numerator of the product"
                onChange={(e) => { setVerifyIn(e.target.value.replace(/\D/g, "")); setNote(null); }}
                onKeyDown={(e) => e.key === "Enter" && submitVerify()} />
              <span>/{prob.d2}</span>
              <button className="fb-btn" disabled={!verifyIn.trim()} onClick={submitVerify}>Enter</button>
            </div>
          )}
          {phase === "done" && (
            <>
              <div className="fb-done">{q} × 1/{prob.d2} = {q}/{prob.d2} = {prob.n}/{prob.d}</div>
              <div className="fb-bar">
                <button className="fb-btn" onClick={() => startProblem((pIdx + 1) % DIV_PROBLEMS.length)}>Next problem</button>
              </div>
            </>
          )}
        </>
      )}

      {mode === "mixed" && (
        <>
          <div className="fb-prompt">
            {mPhase === "done"
              ? `${mp.w} ${mp.n}/${mp.d} = ${mp.w * mp.d + mp.n}/${mp.d}`
              : `Turn ${mp.w} ${mp.n}/${mp.d} into ${nths(mp.d)}`}
          </div>
          <div className="fb-sub">
            {mPhase === "intro" && `${mp.w} whole${mp.w === 1 ? "" : "s"} and ${mp.n}/${mp.d} more. Split the wholes to count everything in ${nths(mp.d)}.`}
            {mPhase === "wholes" && `Every whole just split into ${nths(mp.d)}. How many ${nths(mp.d)} are in the wholes?`}
            {mPhase === "total" && `Now add the extra pieces for the total.`}
            {mPhase === "done" && `Same amount — now written as one fraction.`}
          </div>

          <div className="fb-probs">
            {MIXED_PROBLEMS.map((m, i) => (
              <button key={i} className={`fb-tbtn ${i === mIdx ? "on" : ""}`} onClick={() => startMixed(i)}>
                {m.w} {m.n}/{m.d}
              </button>
            ))}
            <button className="fb-tbtn" onClick={() => startMixed(mIdx)}>Reset</button>
          </div>

          <div className="fb-stage">
            {Array.from({ length: mp.w }).map((_, wi) => (
              <div key={wi}>
                <div className="fb-rowlbl">Whole {wi + 1}</div>
                <div className="fb-track solid">
                  {mPhase === "intro" ? (
                    <div className="fb-piece" style={{ left: 0, width: "100%", background: C_TEAL }}>1</div>
                  ) : (
                    Array.from({ length: mp.d }).map((_, i) => (
                      <div key={i} className="fb-piece pop" style={{ left: `${(i / mp.d) * 100}%`, width: `${100 / mp.d}%`, background: C_TEAL, animationDelay: `${(wi * mp.d + i) * 60}ms` }}>
                        {mNums ? <span className="fb-tilenum" style={{ color: "#fff" }}>{wi * mp.d + i + 1}</span> : `1/${mp.d}`}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
            <div>
              <div className="fb-rowlbl">And {mp.n}/{mp.d} more</div>
              <div className="fb-track">
                {Array.from({ length: mp.n }).map((_, i) => (
                  <div key={i} className="fb-piece" style={{ left: `${(i / mp.d) * 100}%`, width: `${100 / mp.d}%`, background: C_AMBER, color: "var(--bdb-ink)" }}>
                    {mNums && mPhase === "total" ? <span className="fb-tilenum">{mp.w * mp.d + i + 1}</span> : `1/${mp.d}`}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {mPhase === "intro" && (
            <div className="fb-bar">
              <button className="fb-btn" onClick={() => setMPhase("wholes")}>Split the wholes into {nths(mp.d)}</button>
            </div>
          )}
          {mPhase === "wholes" && (
            <div className="fb-formula">
              <span>{mp.w} whole{mp.w === 1 ? "" : "s"} =</span>
              <input className="fb-in" value={mIn} inputMode="numeric" autoFocus aria-label={`${nths(mp.d)} in the wholes`}
                onChange={(e) => { setMIn(e.target.value.replace(/\D/g, "")); setNote(null); }}
                onKeyDown={(e) => e.key === "Enter" && submitMixed()} />
              <span>/{mp.d}</span>
              <button className="fb-btn" disabled={!mIn.trim()} onClick={submitMixed}>Enter</button>
            </div>
          )}
          {mPhase === "total" && (
            <div className="fb-formula">
              <span>{mp.w * mp.d}/{mp.d} + {mp.n}/{mp.d} =</span>
              <input className="fb-in" value={mIn} inputMode="numeric" autoFocus aria-label={`total ${nths(mp.d)}`}
                onChange={(e) => { setMIn(e.target.value.replace(/\D/g, "")); setNote(null); }}
                onKeyDown={(e) => e.key === "Enter" && submitMixed()} />
              <span>/{mp.d}</span>
              <button className="fb-btn" disabled={!mIn.trim()} onClick={submitMixed}>Enter</button>
            </div>
          )}
          {mPhase === "done" && (
            <>
              <div className="fb-done">{mp.w} {mp.n}/{mp.d} = {mp.w * mp.d}/{mp.d} + {mp.n}/{mp.d} = {mp.w * mp.d + mp.n}/{mp.d}</div>
              <div className="fb-bar">
                <button className="fb-btn" onClick={() => startMixed((mIdx + 1) % MIXED_PROBLEMS.length)}>Next problem</button>
              </div>
            </>
          )}
        </>
      )}

      {mode === "kcf" && (
        <>
          <div className="fb-prompt">
            {kStage === "done"
              ? `${kp.a[0]}/${kp.a[1]} ÷ ${kp.b[0]}/${kp.b[1]} = ${kInteger ? prodN / prodD : `${prodN}/${prodD}`}`
              : "Keep. Change. Flip."}
          </div>
          <div className="fb-sub">
            {kStage === "walk" && kStep === 0 && "Dividing by a fraction has a shortcut you have already earned. Walk it one move at a time."}
            {kStage === "walk" && kStep === 1 && "KEEP the first fraction exactly as it is."}
            {kStage === "walk" && kStep === 2 && "CHANGE the division into multiplication."}
            {kStage === "walk" && kStep === 3 && "FLIP the second fraction — its top and bottom trade places."}
            {kStage === "product" && "Now multiply straight across: top times top, bottom times bottom."}
            {kStage === "final" && "Simplify: how many wholes is that?"}
            {kStage === "done" && "Dividing by a fraction is multiplying by its reciprocal."}
          </div>

          <div className="fb-probs">
            {KCF_PROBLEMS.map((k, i) => (
              <button key={i} className={`fb-tbtn ${i === kIdx ? "on" : ""}`} onClick={() => startKcf(i)}>
                {k.a[0]}/{k.a[1]} ÷ {k.b[0]}/{k.b[1]}
              </button>
            ))}
            <button className="fb-tbtn" onClick={() => startKcf(kIdx)}>Reset</button>
          </div>

          <div className="fb-formula" style={{ fontSize: "clamp(1.6rem,5vw,2.2rem)", marginTop: 22 }}>
            <span className="fb-kcol">
              <span className={`fb-badge ${kStep >= 1 ? "on" : ""}`} style={{ background: C_GREEN }}>Keep</span>
              <span className={`fb-keepring ${kStep >= 1 ? "on" : ""}`}>
                <Frac n={kp.a[0]} d={kp.a[1]} color={C_TEAL} />
              </span>
            </span>
            <span className="fb-kcol">
              <span className={`fb-badge ${kStep >= 2 ? "on" : ""}`} style={{ background: C_AMBER, color: "var(--bdb-ink)" }}>Change</span>
              <span className="fb-op" aria-label={kStep >= 2 ? "times" : "divided by"}>
                <span style={{ opacity: kStep >= 2 ? 0 : 1, transform: kStep >= 2 ? "rotate(180deg) scale(0.4)" : "none" }}>÷</span>
                <span style={{ opacity: kStep >= 2 ? 1 : 0, transform: kStep >= 2 ? "none" : "rotate(-180deg) scale(0.4)" }}>×</span>
              </span>
            </span>
            <span className="fb-kcol">
              <span className={`fb-badge ${kStep >= 3 ? "on" : ""}`} style={{ background: C_CORAL }}>Flip</span>
              <Frac n={kp.b[0]} d={kp.b[1]} color={C_CORAL} flipped={kStep >= 3} />
            </span>
            {kStage !== "walk" && (
              <>
                <span>=</span>
                {kStage === "product" ? (
                  <span className="fb-kcol" style={{ gap: 2 }}>
                    <input className="fb-in" style={{ width: 66 }} value={kN} inputMode="numeric" autoFocus aria-label="product numerator"
                      onChange={(e) => { setKN(e.target.value.replace(/\D/g, "")); setNote(null); }} />
                    <input className="fb-in" style={{ width: 66 }} value={kD} inputMode="numeric" aria-label="product denominator"
                      onChange={(e) => { setKD(e.target.value.replace(/\D/g, "")); setNote(null); }}
                      onKeyDown={(e) => e.key === "Enter" && submitKcfProduct()} />
                  </span>
                ) : (
                  <Frac n={prodN} d={prodD} />
                )}
                {kStage === "final" && (
                  <>
                    <span>=</span>
                    <input className="fb-in" value={kQ} inputMode="numeric" autoFocus aria-label="simplified answer"
                      onChange={(e) => { setKQ(e.target.value.replace(/\D/g, "")); setNote(null); }}
                      onKeyDown={(e) => e.key === "Enter" && submitKcfFinal()} />
                  </>
                )}
                {kStage === "done" && kInteger && <><span>=</span><span>{prodN / prodD}</span></>}
              </>
            )}
          </div>

          <div className="fb-bar">
            {kStage === "walk" && kStep < 3 && (
              <button className="fb-btn" onClick={kcfAdvance}>
                {kStep === 0 ? "KEEP the first fraction" : kStep === 1 ? "CHANGE ÷ to ×" : "FLIP the second fraction"}
              </button>
            )}
            {kStage === "product" && <button className="fb-btn" disabled={!kN.trim() || !kD.trim()} onClick={submitKcfProduct}>Enter</button>}
            {kStage === "final" && <button className="fb-btn" disabled={!kQ.trim()} onClick={submitKcfFinal}>Enter</button>}
            {kStage === "done" && (
              <button className="fb-btn" onClick={() => startKcf((kIdx + 1) % KCF_PROBLEMS.length)}>Next problem</button>
            )}
          </div>
        </>
      )}

      {mode === "explore" && (
        <>
          <div className="fb-prompt">Compare fractions to one whole</div>
          <div className="fb-sub">Tap a row to pick it, then tap fractions to lay pieces under the whole. Tap a piece to take it off.</div>

          <div className="fb-palette">
            {EX_PIECES.map((t) => (
              <button key={t.den} className="fb-pal" style={{ borderColor: t.color, color: t.color }} onClick={() => exAdd(t.den)}>{t.label}</button>
            ))}
          </div>
          <div className="fb-probs">
            <button className="fb-tbtn" disabled={exRows.length >= 6} onClick={exAddRow}>Add a row</button>
            <button className="fb-tbtn" disabled={exRows.length <= 1} onClick={exRemoveRow}>Remove row</button>
            <button className="fb-tbtn" disabled={!(exRows[exSel] ?? []).length} onClick={exClearRow}>Clear row</button>
          </div>

          <div className="fb-stage">
            <div>
              <div className="fb-rowlbl">One whole</div>
              <div className="fb-track solid">
                <div className="fb-piece" style={{ left: 0, width: "100%", background: "#674a40" }}>1</div>
              </div>
            </div>
            {exRows.map((row, ri) => {
              let acc = 0;
              return (
                <div key={ri}>
                  <div className="fb-rowlbl">
                    Row {ri + 1}
                    {row.length > 0 && <span className="fb-rowsum">= {sumLabel(rowSum(row))}</span>}
                  </div>
                  <div className={`fb-track ${exSel === ri ? "exsel" : ""}`} onClick={() => setExSel(ri)}>
                    {row.map((den, pi) => {
                      const left = acc;
                      acc += 1 / den;
                      const t = EX_PIECES.find((p) => p.den === den);
                      return (
                        <button key={`${pi}-${den}`} className="fb-piece pop" aria-label={`remove 1/${den}`}
                          style={{ left: `${left * 100}%`, width: `${100 / den}%`, background: t?.color }}
                          onClick={(e) => { e.stopPropagation(); exRemovePiece(ri, pi); }}>
                          {t?.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="fb-note">{note && <span key={note} className="fb-note-in">{note}</span>}</div>
    </div>
  );
}
