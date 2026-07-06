"use client";

// Term Identifier — students sort each part of an expression (e.g. 3x + 7) into
// the right bucket: coefficient, variable, operation, constant.
// Works by DRAG (mouse or touch) or by TAP-the-part then TAP-the-bucket.

import { useCallback, useEffect, useRef, useState } from "react";

type Bucket = "coefficient" | "variable" | "operation" | "constant";
type Level = 1 | 2 | 3;

interface Problem {
  expression: string;
  tokens: Token[];
}

interface Token {
  id: string;
  text: string;
  bucket: Bucket;
}

const BUCKETS: { id: Bucket; label: string; hint: string; color: string }[] = [
  { id: "coefficient", label: "Coefficient", hint: "the number multiplied by the variable", color: "var(--bdb-teal)" },
  { id: "variable", label: "Variable", hint: "the letter that stands for an unknown", color: "var(--bdb-coral)" },
  { id: "operation", label: "Operation", hint: "the + or − sign", color: "var(--bdb-amber)" },
  { id: "constant", label: "Constant", hint: "a number on its own", color: "var(--bdb-brown)" },
];

const VARS = ["x", "y", "n", "a", "m", "b"];

function randomVariable(level: Level) {
  const pool = level === 1 ? ["x"] : VARS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function makeProblem(level: Level, prev?: Problem): Problem {
  for (let tries = 0; tries < 20; tries++) {
    const termCount = level + 1;
    const tokens: Token[] = [];
    const expressionParts: string[] = [];
    let hasConstant = false;
    let hasVariable = false;

    for (let term = 0; term < termCount; term += 1) {
      if (term > 0) {
        const op = Math.random() < 0.55 ? "+" : "−";
        tokens.push({ id: `op-${term}`, text: op, bucket: "operation" });
        expressionParts.push(op);
      }

      const mustBeConstant = term === termCount - 1 && !hasConstant;
      const mustBeVariable = term === termCount - 1 && !hasVariable;
      const isVariableTerm = mustBeVariable || (!mustBeConstant && (term === 0 || Math.random() < 0.62));

      if (isVariableTerm) {
        const coef = 1 + Math.floor(Math.random() * 8);
        const variable = randomVariable(level);
        tokens.push({ id: `coef-${term}`, text: String(coef), bucket: "coefficient" });
        tokens.push({ id: `var-${term}`, text: variable, bucket: "variable" });
        expressionParts.push(`${coef}${variable}`);
        hasVariable = true;
      } else {
        const constant = 1 + Math.floor(Math.random() * (level === 3 ? 18 : 12));
        tokens.push({ id: `const-${term}`, text: String(constant), bucket: "constant" });
        expressionParts.push(String(constant));
        hasConstant = true;
      }
    }

    const problem = { expression: expressionParts.join(" "), tokens };
    if (!prev || problem.expression !== prev.expression) return problem;
  }
  return {
    expression: "3x + 7",
    tokens: [
      { id: "coef-0", text: "3", bucket: "coefficient" },
      { id: "var-0", text: "x", bucket: "variable" },
      { id: "op-1", text: "+", bucket: "operation" },
      { id: "const-1", text: "7", bucket: "constant" },
    ],
  };
}

const PRAISE = ["Yes!", "Nailed it.", "That's it.", "Correct.", "Good eye."];

export default function TermIdentifier() {
  const [level, setLevel] = useState<Level>(1);
  const [problem, setProblem] = useState<Problem>(() => makeProblem(1));
  const [placed, setPlaced] = useState<Record<string, Bucket>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("Level 1: drag each part to its bucket.");
  const [shakeBucket, setShakeBucket] = useState<Bucket | null>(null);

  // drag state
  const [dragId, setDragId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; text: string } | null>(null);
  const startRef = useRef<{ x: number; y: number; moved: boolean }>({ x: 0, y: 0, moved: false });
  const audioRef = useRef<AudioContext | null>(null);
  const advanceTimerRef = useRef<number | null>(null);

  const tokens = problem.tokens;
  const solved = tokens.every((t) => placed[t.id]);

  const tone = useCallback((freqs: number[], dur = 0.14) => {
    try {
      audioRef.current = audioRef.current ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const ctx = audioRef.current;
      freqs.forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        o.connect(g);
        g.connect(ctx.destination);
        const t = ctx.currentTime + i * 0.08;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.start(t);
        o.stop(t + dur + 0.02);
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current !== null) window.clearTimeout(advanceTimerRef.current);
    };
  }, []);

  function loadLevel(nextLevel: Level) {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    setLevel(nextLevel);
    setProblem((current) => makeProblem(nextLevel, current));
    setPlaced({});
    setSelected(null);
    setFeedback(`Level ${nextLevel}: ${nextLevel === 1 ? "sort the basic parts" : nextLevel === 2 ? "more terms, same buckets" : "reach all buckets with a longer expression"}.`);
  }

  const place = useCallback(
    (tokenId: string, bucket: Bucket) => {
      const token = problem.tokens.find((t) => t.id === tokenId);
      if (!token || placed[tokenId]) return;
      const def = BUCKETS.find((b) => b.id === bucket);
      if (token.bucket === bucket) {
        setPlaced((prev) => ({ ...prev, [tokenId]: bucket }));
        setSelected(null);
        tone([523, 784]);
        const next = { ...placed, [tokenId]: bucket };
        const done = problem.tokens.every((t) => next[t.id]);
        if (done) {
          const nextLevel = Math.min(3, level + 1) as Level;
          tone([523, 659, 784, 1047], 0.18);
          setFeedback(level === 3 ? "Level 3 complete. Loading another Level 3 expression." : `Level ${level} complete. Loading Level ${nextLevel}.`);
          advanceTimerRef.current = window.setTimeout(() => loadLevel(nextLevel), 1100);
        } else {
          setFeedback(`${PRAISE[Math.floor(Math.random() * PRAISE.length)]} "${token.text}" is ${bucket}.`);
        }
      } else {
        tone([180, 140]);
        setShakeBucket(bucket);
        setTimeout(() => setShakeBucket(null), 380);
        setFeedback(`Not ${bucket}. ${def ? def.hint : "Try a different bucket."}`);
      }
    },
    [level, placed, problem.tokens, tone],
  );

  // global pointer handlers for dragging
  useEffect(() => {
    if (!dragId) return;
    function move(e: PointerEvent) {
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) startRef.current.moved = true;
      const tok = problem.tokens.find((t) => t.id === dragId);
      setGhost({ x: e.clientX, y: e.clientY, text: tok ? tok.text : "" });
    }
    function up(e: PointerEvent) {
      const id = dragId;
      setDragId(null);
      setGhost(null);
      if (!id) return;
      if (startRef.current.moved) {
        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const zone = el?.closest("[data-bucket]") as HTMLElement | null;
        if (zone) place(id, zone.dataset.bucket as Bucket);
      } else {
        // treat as a tap → select / deselect
        setSelected((cur) => (cur === id ? null : id));
      }
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragId, problem, place]);

  function onChipDown(e: React.PointerEvent, tokenId: string) {
    if (placed[tokenId]) return;
    startRef.current = { x: e.clientX, y: e.clientY, moved: false };
    setDragId(tokenId);
  }

  function onBucketClick(bucket: Bucket) {
    if (selected) place(selected, bucket);
  }

  function newProblem() {
    setProblem((p) => makeProblem(level, p));
    setPlaced({});
    setSelected(null);
    setFeedback(`Level ${level}: drag each part to its bucket.`);
  }

  function reset() {
    setPlaced({});
    setSelected(null);
    setFeedback("Cleared. Try again!");
  }

  const placedTokens = (bucket: Bucket) => tokens.filter((t) => placed[t.id] === bucket);

  return (
    <main className="ti-root">
      <style>{`
        .ti-root { min-height:100%; background:var(--bdb-ground); color:var(--bdb-ink); font-family:var(--bdb-font);
          display:grid; grid-template-rows:1fr auto; }
        .ti-mark { margin:0; text-align:center; font-size:0.76rem; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; color:var(--bdb-ink-faint); }
        .ti-btn { font-size:0.82rem; font-weight:700; color:var(--bdb-ink-soft); background:var(--bdb-card);
          border:1px solid var(--bdb-line); border-radius:999px; padding:8px 14px; cursor:pointer; text-decoration:none; }
        .ti-btn:hover { border-color:var(--bdb-teal); color:var(--bdb-ink); }
        .ti-main { display:grid; gap:22px; align-content:start; justify-items:center; max-width:880px; width:100%;
          margin:0 auto; padding:clamp(16px,4vw,32px) 18px; }

        .ti-levels { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }
        .ti-level { border:2px solid var(--bdb-line); border-radius:999px; background:#fff; color:var(--bdb-ink-soft); padding:7px 14px; font-size:0.82rem; font-weight:900; }
        .ti-level.on { border-color:var(--bdb-teal); background:var(--bdb-teal); color:#fff; }
        .ti-level.done { border-color:var(--bdb-green); color:var(--bdb-green); }
        .ti-expression-label { margin:0; color:var(--bdb-ink-soft); font-size:0.82rem; font-weight:850; text-align:center; }
        .ti-expr { display:flex; align-items:center; gap:6px; flex-wrap:wrap; justify-content:center; }
        .ti-chip { position:relative; min-width:54px; min-height:64px; padding:8px 16px; border-radius:14px;
          border:2px solid var(--bdb-ink); background:var(--bdb-card); color:var(--bdb-ink);
          font-size:clamp(1.8rem,5vw,2.6rem); font-weight:800; display:grid; place-items:center; cursor:grab;
          box-shadow:0 4px 0 var(--bdb-ink); touch-action:none; user-select:none; transition:transform 120ms ease, opacity 160ms ease; }
        .ti-chip:active { cursor:grabbing; }
        .ti-chip.sel { outline:4px solid color-mix(in srgb, var(--bdb-teal) 55%, transparent); outline-offset:2px; transform:translateY(-2px); }
        .ti-chip.done { opacity:0.28; pointer-events:none; box-shadow:0 4px 0 var(--bdb-line); border-color:var(--bdb-line); }
        .ti-chip.dragging { opacity:0.3; }
        .ti-tight { gap:0; }

        .ti-fb { min-height:48px; max-width:560px; text-align:center; border:1px solid var(--bdb-line);
          border-radius:var(--bdb-r); background:var(--bdb-card); color:var(--bdb-ink-soft); font-weight:600;
          padding:12px 16px; line-height:1.35; }

        .ti-buckets { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:12px; width:100%; }
        @media (max-width:640px){ .ti-buckets { grid-template-columns:repeat(2,minmax(0,1fr)); } }
        .ti-bucket { border:2px dashed var(--bdb-line); border-radius:var(--bdb-r-lg); background:var(--bdb-card);
          padding:14px 10px 16px; display:grid; gap:8px; justify-items:center; text-align:center; cursor:pointer;
          transition:border-color 140ms ease, background 140ms ease, transform 120ms ease; min-height:150px; align-content:start; }
        .ti-bucket:hover { border-color:var(--bdb-c); }
        .ti-bucket.filled { border-style:solid; }
        .ti-bucket.shake { animation:tiShake 0.36s ease; border-color:var(--bdb-coral); }
        @keyframes tiShake { 0%,100%{transform:translateX(0);} 25%{transform:translateX(-6px);} 75%{transform:translateX(6px);} }
        .ti-b-label { font-size:0.92rem; font-weight:800; color:var(--bdb-ink); }
        .ti-b-hint { font-size:0.74rem; font-weight:600; color:var(--bdb-ink-faint); line-height:1.3; }
        .ti-slot-list { display:flex; flex-wrap:wrap; justify-content:center; gap:6px; min-height:56px; align-items:center; }
        .ti-slot { min-width:52px; min-height:56px; border-radius:12px; display:grid; place-items:center;
          font-size:1.75rem; font-weight:800; }
        .ti-slot.empty { border:2px dashed var(--bdb-line); color:var(--bdb-ink-faint); font-size:1rem; font-weight:600; padding:0 8px; }
        .ti-slot.full { color:#fff; animation:tiDrop 0.36s cubic-bezier(.2,.8,.2,1.2); }
        @keyframes tiDrop { from{ transform:scale(.4); opacity:0; } to{ transform:scale(1); opacity:1; } }

        .ti-ghost { position:fixed; z-index:50; transform:translate(-50%,-50%); pointer-events:none;
          min-width:54px; min-height:64px; padding:8px 16px; border-radius:14px; border:2px solid var(--bdb-ink);
          background:var(--bdb-amber); color:var(--bdb-ink); font-size:2.2rem; font-weight:800; display:grid; place-items:center;
          box-shadow:0 10px 24px rgba(32,30,26,0.3); }

        .ti-foot { padding:12px 24px; border-top:1px solid var(--bdb-line); display:flex; gap:10px; justify-content:center; flex-wrap:wrap; }
      `}</style>

      <div className="ti-main">
        <p className="ti-mark">Identify the Terms</p>
        <div className="ti-levels" aria-label="Term identifier levels">
          {[1, 2, 3].map((item) => (
            <span className={`ti-level${level === item ? " on" : ""}${level > item ? " done" : ""}`} key={item}>
              Level {item}
            </span>
          ))}
        </div>
        <p className="ti-expression-label">{problem.expression}</p>
        <div className="ti-expr">
          {tokens.map((t) => {
            return (
              <span
                key={t.id}
                className={`ti-chip${placed[t.id] ? " done" : ""}${selected === t.id ? " sel" : ""}${dragId === t.id ? " dragging" : ""}`}
                onPointerDown={(e) => onChipDown(e, t.id)}
              >
                {t.text}
              </span>
            );
          })}
        </div>

        <div className={`ti-fb`}>{feedback}</div>

        <div className="ti-buckets">
          {BUCKETS.map((b) => {
            const bucketTokens = placedTokens(b.id);
            return (
              <div
                key={b.id}
                data-bucket={b.id}
                className={`ti-bucket${bucketTokens.length ? " filled" : ""}${shakeBucket === b.id ? " shake" : ""}`}
                style={{ "--bdb-c": b.color, borderColor: bucketTokens.length ? b.color : undefined } as React.CSSProperties}
                onClick={() => onBucketClick(b.id)}
              >
                <span className="ti-b-label">{b.label}</span>
                <span className="ti-b-hint">{b.hint}</span>
                {bucketTokens.length ? (
                  <span className="ti-slot-list">
                    {bucketTokens.map((tok) => (
                      <span className="ti-slot full" key={tok.id} style={{ background: b.color }}>{tok.text}</span>
                    ))}
                  </span>
                ) : (
                  <span className="ti-slot empty">drop here</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <footer className="ti-foot">
        <button className="ti-btn" onClick={reset}>Reset</button>
        <button className="ti-btn" onClick={() => loadLevel(1)}>Level 1</button>
        <button className="ti-btn" onClick={() => loadLevel(2)}>Level 2</button>
        <button className="ti-btn" onClick={() => loadLevel(3)}>Level 3</button>
        <button className="ti-btn" onClick={newProblem}>New expression</button>
      </footer>

      {ghost && (
        <div className="ti-ghost" style={{ left: ghost.x, top: ghost.y }}>{ghost.text}</div>
      )}
    </main>
  );
}
