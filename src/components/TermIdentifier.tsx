"use client";

// Term Identifier — students sort each part of an expression (e.g. 3x + 7) into
// the right bucket: coefficient, variable, operation, constant.
// Works by DRAG (mouse or touch) or by TAP-the-part then TAP-the-bucket.

import { useCallback, useEffect, useRef, useState } from "react";

type Bucket = "coefficient" | "variable" | "operation" | "constant";

interface Problem {
  coef: number;
  variable: string;
  op: "+" | "−";
  constant: number;
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

function makeProblem(prev?: Problem): Problem {
  for (let tries = 0; tries < 20; tries++) {
    const p: Problem = {
      coef: 2 + Math.floor(Math.random() * 8), // 2..9
      variable: VARS[Math.floor(Math.random() * VARS.length)],
      op: Math.random() < 0.5 ? "+" : "−",
      constant: 1 + Math.floor(Math.random() * 12), // 1..12
    };
    if (!prev || p.coef !== prev.coef || p.variable !== prev.variable || p.constant !== prev.constant) return p;
  }
  return { coef: 3, variable: "x", op: "+", constant: 7 };
}

function tokensFor(p: Problem): Token[] {
  return [
    { id: "coef", text: String(p.coef), bucket: "coefficient" },
    { id: "var", text: p.variable, bucket: "variable" },
    { id: "op", text: p.op, bucket: "operation" },
    { id: "const", text: String(p.constant), bucket: "constant" },
  ];
}

const PRAISE = ["Yes!", "Nailed it.", "That's it.", "Correct.", "Good eye."];

export default function TermIdentifier() {
  const [problem, setProblem] = useState<Problem>(() => makeProblem());
  const [placed, setPlaced] = useState<Record<string, Bucket>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("Drag each part to its bucket — or tap a part, then tap its bucket.");
  const [shakeBucket, setShakeBucket] = useState<Bucket | null>(null);

  // drag state
  const [dragId, setDragId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; text: string } | null>(null);
  const startRef = useRef<{ x: number; y: number; moved: boolean }>({ x: 0, y: 0, moved: false });
  const audioRef = useRef<AudioContext | null>(null);

  const tokens = tokensFor(problem);
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

  const place = useCallback(
    (tokenId: string, bucket: Bucket) => {
      const token = tokensFor(problem).find((t) => t.id === tokenId);
      if (!token || placed[tokenId]) return;
      const def = BUCKETS.find((b) => b.id === bucket);
      if (token.bucket === bucket) {
        setPlaced((prev) => ({ ...prev, [tokenId]: bucket }));
        setSelected(null);
        tone([523, 784]);
        const next = { ...placed, [tokenId]: bucket };
        const done = tokensFor(problem).every((t) => next[t.id]);
        setFeedback(done ? "🎉 Every part identified — nice work!" : `${PRAISE[Math.floor(Math.random() * PRAISE.length)]} “${token.text}” is the ${bucket}.`);
        if (done) tone([523, 659, 784, 1047], 0.18);
      } else {
        tone([180, 140]);
        setShakeBucket(bucket);
        setTimeout(() => setShakeBucket(null), 380);
        setFeedback(`Not the ${bucket} — that's ${def ? def.hint : "something else"}. Where does “${token.text}” belong?`);
      }
    },
    [problem, placed, tone],
  );

  // global pointer handlers for dragging
  useEffect(() => {
    if (!dragId) return;
    function move(e: PointerEvent) {
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) startRef.current.moved = true;
      const tok = tokensFor(problem).find((t) => t.id === dragId);
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
    setProblem((p) => makeProblem(p));
    setPlaced({});
    setSelected(null);
    setFeedback("Drag each part to its bucket — or tap a part, then tap its bucket.");
  }

  function reset() {
    setPlaced({});
    setSelected(null);
    setFeedback("Cleared. Try again!");
  }

  const placedToken = (bucket: Bucket) => tokens.find((t) => placed[t.id] === bucket);

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
        .ti-slot { margin-top:4px; min-width:52px; min-height:56px; border-radius:12px; display:grid; place-items:center;
          font-size:1.9rem; font-weight:800; }
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
        <div className={`ti-expr`}>
          {/* coef + variable sit together (3x), then op, then constant */}
          <span className="ti-expr ti-tight">
            {["coef", "var"].map((id) => {
              const t = tokens.find((x) => x.id === id)!;
              return (
                <span
                  key={id}
                  className={`ti-chip${placed[id] ? " done" : ""}${selected === id ? " sel" : ""}${dragId === id ? " dragging" : ""}`}
                  onPointerDown={(e) => onChipDown(e, id)}
                >
                  {t.text}
                </span>
              );
            })}
          </span>
          {["op", "const"].map((id) => {
            const t = tokens.find((x) => x.id === id)!;
            return (
              <span
                key={id}
                className={`ti-chip${placed[id] ? " done" : ""}${selected === id ? " sel" : ""}${dragId === id ? " dragging" : ""}`}
                onPointerDown={(e) => onChipDown(e, id)}
              >
                {t.text}
              </span>
            );
          })}
        </div>

        <div className={`ti-fb`}>{feedback}</div>

        <div className="ti-buckets">
          {BUCKETS.map((b) => {
            const tok = placedToken(b.id);
            return (
              <div
                key={b.id}
                data-bucket={b.id}
                className={`ti-bucket${tok ? " filled" : ""}${shakeBucket === b.id ? " shake" : ""}`}
                style={{ "--bdb-c": b.color, borderColor: tok ? b.color : undefined } as React.CSSProperties}
                onClick={() => onBucketClick(b.id)}
              >
                <span className="ti-b-label">{b.label}</span>
                <span className="ti-b-hint">{b.hint}</span>
                {tok ? (
                  <span className="ti-slot full" style={{ background: b.color }}>{tok.text}</span>
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
        <button className="ti-btn" onClick={newProblem}>New expression</button>
      </footer>

      {ghost && (
        <div className="ti-ghost" style={{ left: ghost.x, top: ghost.y }}>{ghost.text}</div>
      )}
    </main>
  );
}
