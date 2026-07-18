"use client";

// Fraction Bars — M1.T1.L5 support (6.NS.1: fraction divided by a unit fraction).
// Two modes. "How many fit?" walks the lesson's Count-Draw-Verify loop: BUILD
// the dividend from unit pieces, TILE unit-fraction groups under it until they
// fill the same length, COUNT the tiles (the groups — not the tick marks), then
// VERIFY with quotient x divisor = dividend. "Explore" is the open sandbox:
// tap a fraction to add a piece, drag pieces around; everything snaps to the
// same whole so comparisons stay honest. Optional support only — no scoring.

import { useCallback, useEffect, useRef, useState } from "react";
import { LiveToolBanner, useLiveToolConfig } from "./useLiveToolConfig";

const C_TEAL = "#50a3a4";
const C_AMBER = "#fcaf38";
const C_CORAL = "#f95335";
const C_GREEN = "#2f9e6f";

// ── "How many fit?" problems (from the lesson's paper set) ──────────────────
interface DivProblem { n: number; d: number; d2: number } // n/d divided by 1/d2
const DIV_PROBLEMS: DivProblem[] = [
  { n: 3, d: 4, d2: 8 },   // 3/4 divided by 1/8 = 6
  { n: 2, d: 3, d2: 6 },   // 2/3 divided by 1/6 = 4
  { n: 5, d: 8, d2: 16 },  // 5/8 divided by 1/16 = 10
  { n: 3, d: 5, d2: 10 },  // 3/5 divided by 1/10 = 6
];
const quotientOf = (p: DivProblem) => (p.n * p.d2) / p.d;

// ── Explore-mode pieces ─────────────────────────────────────────────────────
interface ExPiece { id: string; label: string; value: number; color: string; x: number; y: number }
const EX_TEMPLATES = [
  { label: "1", value: 1, color: "#674a40" },
  { label: "1/2", value: 1 / 2, color: C_TEAL },
  { label: "1/3", value: 1 / 3, color: "#7c5cd6" },
  { label: "1/4", value: 1 / 4, color: C_AMBER },
  { label: "1/6", value: 1 / 6, color: C_CORAL },
  { label: "1/8", value: 1 / 8, color: C_GREEN },
  { label: "1/12", value: 1 / 12, color: "#a06b2a" },
];
const EX_COLS = 24; // snap grid: LCM of the denominators
const EX_ROW = 54;

export function FractionBarsBoard() {
  const liveTool = useLiveToolConfig("/fraction-bars");
  const [mode, setMode] = useState<"divide" | "explore">("divide");

  // ── divide state ───────────────────────────────────────────────────────────
  const [pIdx, setPIdx] = useState(0);
  const prob = DIV_PROBLEMS[pIdx];
  const q = quotientOf(prob);
  const [phase, setPhase] = useState<"build" | "tile" | "count" | "verify" | "done">("build");
  const [built, setBuilt] = useState(0);   // dividend pieces placed (each 1/d)
  const [tiles, setTiles] = useState(0);   // divisor tiles placed (each 1/d2)
  const [countIn, setCountIn] = useState("");
  const [verifyIn, setVerifyIn] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [showTileNums, setShowTileNums] = useState(false);

  const startProblem = useCallback((idx: number) => {
    setPIdx(idx);
    setPhase("build"); setBuilt(0); setTiles(0);
    setCountIn(""); setVerifyIn(""); setNote(null); setShowTileNums(false);
  }, []);

  // Auto-advance out of BUILD once the dividend is exactly right.
  useEffect(() => {
    if (phase !== "build" || built !== prob.n) return;
    const t = window.setTimeout(() => { setNote(null); setPhase("tile"); }, 650);
    return () => window.clearTimeout(t);
  }, [phase, built, prob]);

  // Auto-advance out of TILE once the groups exactly fill the dividend.
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
    if (v === q + 1) {
      setNote("You counted the tick MARKS. Count the tiles — each tile is one group.");
    } else {
      setNote(`Count the tiles one at a time — each tile is one group of 1/${prob.d2}.`);
    }
    setShowTileNums(true);
    setCountIn("");
  };

  const submitVerify = () => {
    const v = Number(verifyIn.trim());
    if (!verifyIn.trim() || !Number.isFinite(v)) return;
    if (v === q) { setNote(null); setPhase("done"); return; }
    setNote(`${q} groups of 1/${prob.d2} makes how many ${prob.d2}ths in all?`);
    setVerifyIn("");
  };

  // ── explore state ──────────────────────────────────────────────────────────
  const [pieces, setPieces] = useState<ExPiece[]>([]);
  const [selId, setSelId] = useState<string>("");
  const exRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; offX: number; offY: number } | null>(null);

  const addPiece = (tpl: (typeof EX_TEMPLATES)[number]) => {
    const id = `${tpl.label}-${crypto.randomUUID()}`;
    setPieces((ps) => [...ps, { id, label: tpl.label, value: tpl.value, color: tpl.color, x: 0, y: ps.length % 8 }]);
    setSelId(id);
  };
  const removeSelected = () => {
    setPieces((ps) => ps.filter((p) => p.id !== selId));
    setSelId("");
  };
  const duplicateSelected = () => {
    setPieces((ps) => {
      const src = ps.find((p) => p.id === selId);
      if (!src) return ps;
      const id = `${src.label}-${crypto.randomUUID()}`;
      setSelId(id);
      return [...ps, { ...src, id, y: Math.min(src.y + 1, 9) }];
    });
  };

  const exDown = (e: React.PointerEvent, p: ExPiece) => {
    const r = exRef.current?.getBoundingClientRect();
    if (!r) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setSelId(p.id);
    dragRef.current = { id: p.id, offX: e.clientX - r.left - (p.x / EX_COLS) * r.width, offY: e.clientY - r.top - p.y * EX_ROW };
  };
  const exMove = (e: React.PointerEvent) => {
    const r = exRef.current?.getBoundingClientRect();
    const d = dragRef.current;
    if (!r || !d) return;
    const gx = Math.round(((e.clientX - r.left - d.offX) / r.width) * EX_COLS);
    const gy = Math.round((e.clientY - r.top - d.offY) / EX_ROW);
    setPieces((ps) => ps.map((p) => (p.id === d.id ? { ...p, x: Math.max(0, Math.min(EX_COLS, gx)), y: Math.max(0, Math.min(9, gy)) } : p)));
  };
  const exUp = () => { dragRef.current = null; };

  // ── shared bar rendering (divide mode) ─────────────────────────────────────
  const wholeTicks = (den: number) => Array.from({ length: den - 1 }, (_, i) => ((i + 1) / den) * 100);

  return (
    <div className="fb-wrap">
      <style>{`
        .fb-wrap { font-family:var(--bdb-font); color:var(--bdb-ink); max-width:760px; margin:0 auto; padding:14px clamp(10px,3vw,20px) 34px; }
        .fb-modebar { display:flex; justify-content:center; margin:0 0 14px; }
        .fb-modeseg { display:inline-flex; border:2px solid var(--bdb-line); border-radius:999px; overflow:hidden; background:var(--bdb-card); }
        .fb-modeseg button { font:inherit; font-weight:800; font-size:0.9rem; min-height:44px; padding:0 22px; border:none; background:transparent; color:var(--bdb-ink-soft); cursor:pointer; }
        .fb-modeseg button.on { background:var(--bdb-ink); color:#fff; }
        .fb-prompt { text-align:center; font-size:clamp(1.1rem,3.2vw,1.5rem); font-weight:800; margin:2px 0 4px; min-height:30px; }
        .fb-sub { text-align:center; color:var(--bdb-ink-soft); font-size:0.92rem; margin:0 0 12px; min-height:18px; }
        .fb-tools { display:flex; gap:8px; justify-content:center; margin-bottom:12px; flex-wrap:wrap; }
        .fb-tbtn { font:inherit; font-weight:700; font-size:0.82rem; padding:6px 13px; border-radius:999px; border:1px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink-soft); cursor:pointer; }
        .fb-tbtn.on { background:var(--bdb-ink); color:#fff; border-color:var(--bdb-ink); }
        .fb-stage { width:min(620px,100%); margin:0 auto; display:grid; gap:14px; }
        .fb-rowlbl { font-size:0.72rem; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; color:var(--bdb-ink-faint); margin-bottom:4px; }
        .fb-track { position:relative; height:46px; border:2px dashed var(--bdb-line); background:var(--bdb-card); }
        .fb-track.solid { border-style:solid; border-color:var(--bdb-ink); }
        .fb-endlbl { position:absolute; top:100%; margin-top:3px; font-size:0.78rem; font-weight:800; color:var(--bdb-ink-faint); }
        .fb-piece { position:absolute; top:0; height:100%; display:grid; place-items:center; color:#fff; font-weight:900; font-size:0.95rem; border-right:2px solid rgba(255,255,255,0.75); box-sizing:border-box; }
        .fb-tick { position:absolute; top:0; height:100%; width:0; border-left:1px dashed color-mix(in srgb, var(--bdb-ink) 22%, transparent); }
        .fb-goal { position:absolute; top:-8px; bottom:-8px; width:3px; background:var(--bdb-coral); }
        .fb-bar { display:flex; gap:8px; justify-content:center; align-items:center; margin-top:14px; flex-wrap:wrap; }
        .fb-btn { font:inherit; font-weight:700; font-size:0.9rem; padding:9px 16px; border-radius:11px; border:1px solid var(--bdb-line); background:var(--bdb-ink); color:#fff; cursor:pointer; }
        .fb-btn.ghost { background:var(--bdb-card); color:var(--bdb-ink); }
        .fb-btn:disabled { opacity:0.42; cursor:not-allowed; }
        .fb-in { width:84px; font:inherit; font-size:1.2rem; font-weight:900; text-align:center; padding:7px; border:3px solid var(--bdb-ink); border-radius:0; background:#fff; color:var(--bdb-ink); }
        .fb-formula { display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:8px; font-weight:900; font-size:clamp(1.2rem,3.6vw,1.7rem); margin-top:12px; }
        .fb-note { text-align:center; min-height:26px; margin-top:12px; }
        .fb-note-in { display:inline-block; color:var(--bdb-coral); font-weight:800; font-size:clamp(1rem,3vw,1.3rem); line-height:1.35; padding:8px 16px; border-radius:12px; background:color-mix(in srgb, var(--bdb-coral) 12%, transparent); }
        .fb-done { text-align:center; font-size:clamp(1.2rem,3.6vw,1.8rem); font-weight:900; margin-top:12px; }
        .fb-probs { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-bottom:10px; }
        .fb-palette { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-bottom:10px; }
        .fb-pal { font:inherit; font-weight:900; font-size:1rem; min-height:44px; padding:0 16px; border:2px solid var(--bdb-ink); background:var(--bdb-card); color:var(--bdb-ink); cursor:pointer; }
        .fb-exstage { position:relative; height:560px; border:2px solid var(--bdb-line); background:
          linear-gradient(90deg, color-mix(in srgb, var(--bdb-line) 60%, transparent) 1px, transparent 1px) 0 0 / calc(100% / ${EX_COLS}) 100%,
          var(--bdb-card); touch-action:none; }
        .fb-expiece { position:absolute; height:44px; display:grid; place-items:center; color:#fff; font-weight:900; cursor:grab; box-shadow:inset 0 -3px 0 rgba(0,0,0,0.15); touch-action:none; }
        .fb-expiece:active { cursor:grabbing; }
        .fb-expiece.sel { outline:3px solid var(--bdb-ink); outline-offset:2px; }
        .fb-tilenum { position:absolute; inset:0; display:grid; place-items:center; color:var(--bdb-ink); font-weight:900; }
        @media (prefers-reduced-motion: reduce) { .fb-note-in { animation:none; } }
      `}</style>

      <LiveToolBanner tool={liveTool} />

      <div className="fb-modebar">
        <div className="fb-modeseg">
          <button className={mode === "divide" ? "on" : ""} onClick={() => setMode("divide")}>How many fit?</button>
          <button className={mode === "explore" ? "on" : ""} onClick={() => setMode("explore")}>Explore</button>
        </div>
      </div>

      {mode === "divide" && (
        <>
          <div className="fb-prompt">
            {phase === "build" && `Build the total: ${prob.n}/${prob.d}`}
            {phase === "tile" && `How many 1/${prob.d2} groups fit in ${prob.n}/${prob.d}?`}
            {phase === "count" && "Count the groups"}
            {phase === "verify" && "Verify it with multiplication"}
            {phase === "done" && `${prob.n}/${prob.d} divided by 1/${prob.d2} = ${q}`}
          </div>
          <div className="fb-sub">
            {phase === "build" && `Tap to add ${prob.d}ths until the bar shows ${prob.n}/${prob.d}.`}
            {phase === "tile" && `Tile 1/${prob.d2} pieces under it until they fill the SAME length.`}
            {phase === "count" && "Count the tiles — the groups — not the tick marks."}
            {phase === "verify" && "The quotient counts groups, so the groups must multiply back to the total."}
            {phase === "done" && "Counted, drawn, and verified."}
          </div>

          <div className="fb-probs">
            {DIV_PROBLEMS.map((pr, i) => (
              <button key={i} className={`fb-tbtn ${i === pIdx ? "on" : ""}`} onClick={() => startProblem(i)}>
                {pr.n}/{pr.d} by 1/{pr.d2}
              </button>
            ))}
            <button className="fb-tbtn" onClick={() => startProblem(pIdx)}>Reset</button>
          </div>

          <div className="fb-stage">
            {/* the whole, for reference */}
            <div>
              <div className="fb-rowlbl">The whole</div>
              <div className="fb-track solid">
                {wholeTicks(prob.d).map((pct) => <div key={pct} className="fb-tick" style={{ left: `${pct}%` }} />)}
                <span className="fb-endlbl" style={{ left: 0 }}>0</span>
                <span className="fb-endlbl" style={{ right: 0 }}>1</span>
              </div>
            </div>

            {/* the dividend the student builds */}
            <div>
              <div className="fb-rowlbl">The total: {prob.n}/{prob.d}</div>
              <div className="fb-track">
                {Array.from({ length: built }).map((_, i) => (
                  <div key={i} className="fb-piece" style={{ left: `${(i / prob.d) * 100}%`, width: `${100 / prob.d}%`, background: C_TEAL }}>
                    1/{prob.d}
                  </div>
                ))}
                {phase !== "build" && <div className="fb-goal" style={{ left: `${(prob.n / prob.d) * 100}%` }} />}
              </div>
            </div>

            {/* the unit-fraction groups */}
            {phase !== "build" && (
              <div>
                <div className="fb-rowlbl">Groups of 1/{prob.d2}</div>
                <div className="fb-track">
                  {Array.from({ length: tiles }).map((_, i) => (
                    <div key={i} className="fb-piece" style={{ left: `${(i / prob.d2) * 100}%`, width: `${100 / prob.d2}%`, background: i < q ? C_AMBER : C_CORAL, color: "var(--bdb-ink)" }}>
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
              <span>{prob.n}/{prob.d} divided by 1/{prob.d2} =</span>
              <input className="fb-in" value={countIn} inputMode="numeric" autoFocus aria-label="how many groups fit"
                onChange={(e) => { setCountIn(e.target.value.replace(/\D/g, "")); setNote(null); }}
                onKeyDown={(e) => e.key === "Enter" && submitCount()} />
              <button className="fb-btn" disabled={!countIn.trim()} onClick={submitCount}>Enter</button>
            </div>
          )}
          {phase === "verify" && (
            <div className="fb-formula">
              <span>{q} groups of 1/{prob.d2} =</span>
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

          <div className="fb-note">{note && <span key={note} className="fb-note-in">{note}</span>}</div>
        </>
      )}

      {mode === "explore" && (
        <>
          <div className="fb-prompt">Build with fraction pieces</div>
          <div className="fb-sub">Tap a fraction to add a piece, then drag it anywhere. Pieces snap to the same whole.</div>

          <div className="fb-palette">
            {EX_TEMPLATES.map((t) => (
              <button key={t.label} className="fb-pal" style={{ borderColor: t.color, color: t.color }} onClick={() => addPiece(t)}>{t.label}</button>
            ))}
          </div>
          <div className="fb-tools">
            <button className="fb-tbtn" disabled={!selId} onClick={duplicateSelected}>Duplicate</button>
            <button className="fb-tbtn" disabled={!selId} onClick={removeSelected}>Delete</button>
            <button className="fb-tbtn" onClick={() => { setPieces([]); setSelId(""); }}>Clear</button>
          </div>

          <div ref={exRef} className="fb-exstage" onPointerMove={exMove} onPointerUp={exUp} onPointerCancel={exUp}>
            {pieces.map((p) => (
              <div key={p.id} className={`fb-expiece ${selId === p.id ? "sel" : ""}`}
                onPointerDown={(e) => exDown(e, p)}
                style={{ left: `${(p.x / EX_COLS) * 100}%`, width: `calc(${p.value * 100}% )`, top: p.y * EX_ROW + 8, background: p.color }}>
                {p.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
