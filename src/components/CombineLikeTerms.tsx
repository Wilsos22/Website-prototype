"use client";

// Combining Like Terms — structured: arrange, then combine.
//
// 1) ARRANGE: the given expression is shown; below it a row of outlined boxes.
//    The student rearranges the terms (tap two to swap) so the variable terms
//    come first and the constants go last, with like terms grouped together.
//    You CANNOT combine until the terms are grouped.
// 2) COMBINE: tap two like terms. Adding lifts them and drops the sum on the
//    next line; subtracting shows the take-away; a +n / −n zero pair is covered
//    by a red box and cancels.

import { useEffect, useRef, useState, useCallback } from "react";
import { reportToolResult } from "@/lib/toolEvidence";
import type { FormEvent } from "react";

interface Term { coef: number; variable: string } // variable "" = constant
interface Line { terms: Term[]; note: string }
type Phase = "arrange" | "play" | "adding" | "animating" | "solved";
interface PendingAdd { i: number; j: number; answer: number; zero: boolean; sub: boolean; left: Term; right: Term }

const PRESETS: { label: string; terms: Term[] }[] = [
  { label: "3x + 5 + 2x − 1", terms: [{ coef: 3, variable: "x" }, { coef: 5, variable: "" }, { coef: 2, variable: "x" }, { coef: -1, variable: "" }] },
  { label: "5x + 2 − 3x − 2", terms: [{ coef: 5, variable: "x" }, { coef: 2, variable: "" }, { coef: -3, variable: "x" }, { coef: -2, variable: "" }] },
  { label: "6 + 2x + x − 4", terms: [{ coef: 6, variable: "" }, { coef: 2, variable: "x" }, { coef: 1, variable: "x" }, { coef: -4, variable: "" }] },
  { label: "x² + 2x + 3x² − x", terms: [{ coef: 1, variable: "x²" }, { coef: 2, variable: "x" }, { coef: 3, variable: "x²" }, { coef: -1, variable: "x" }] },
  { label: "7y − 3 + 2y + 3", terms: [{ coef: 7, variable: "y" }, { coef: -3, variable: "" }, { coef: 2, variable: "y" }, { coef: 3, variable: "" }] },
  { label: "8 − 2x + 5 + 6x", terms: [{ coef: 8, variable: "" }, { coef: -2, variable: "x" }, { coef: 5, variable: "" }, { coef: 6, variable: "x" }] },
];

const VAR_COLOR: Record<string, string> = { x: "#50a3a4", "x²": "#4d8df6", y: "#7c5cd6" };
function colorFor(t: Term): string {
  if (t.variable === "") return "#fcaf38";
  return VAR_COLOR[t.variable] ?? "#674a40";
}
function tintFor(t: Term): string { return `color-mix(in srgb, ${colorFor(t)} 22%, white)`; }
function inkFor(t: Term): string { return `color-mix(in srgb, ${colorFor(t)} 78%, black)`; }

function termLabel(t: Term, first: boolean): string {
  const sign = t.coef < 0 ? "−" : first ? "" : "+";
  const mag = Math.abs(t.coef);
  const coefStr = mag === 1 && t.variable ? "" : String(mag);
  return `${sign}${coefStr}${t.variable}`.trim() || "0";
}
// valid when every variable group is contiguous and all constants are at the end
function validArrangement(terms: Term[]): boolean {
  let seenConstant = false;
  const usedVars = new Set<string>();
  let prevVar: string | null = null;
  for (const t of terms) {
    if (t.variable === "") { seenConstant = true; continue; }
    if (seenConstant) return false;
    if (t.variable !== prevVar) {
      if (usedVars.has(t.variable)) return false;
      usedVars.add(t.variable);
      prevVar = t.variable;
    }
  }
  return true;
}
function fullySimplified(terms: Term[]): boolean {
  const seen = new Set<string>();
  for (const t of terms) { if (seen.has(t.variable)) return false; seen.add(t.variable); }
  return true;
}
function exprStr(terms: Term[]): string {
  return terms.length === 0 ? "0" : terms.map((t, i) => termLabel(t, i === 0)).join(" ");
}

export default function CombineLikeTerms() {
  const [start, setStart] = useState<Term[]>(PRESETS[0].terms);
  const [arranged, setArranged] = useState<Term[]>(PRESETS[0].terms);
  const [lines, setLines] = useState<Line[]>([]);
  const [phase, setPhase] = useState<Phase>("arrange");
  const [selected, setSelected] = useState<number | null>(null);
  const [anim, setAnim] = useState<{ i: number; j: number; zero: boolean; sub: boolean } | null>(null);
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);
  const [addDraft, setAddDraft] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; text: string } | null>(null);
  const [feedback, setFeedback] = useState("Rearrange: put the variable terms first, then the constants. Tap two to swap.");
  const [hint, setHint] = useState<string | null>(null);
  const [wrong, setWrong] = useState(0);
  const audioRef = useRef<AudioContext | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; moved: boolean }>({ x: 0, y: 0, moved: false });

  const terms = lines.length ? lines[lines.length - 1].terms : arranged;
  const arrangeOk = validArrangement(arranged);

  const tone = useCallback((freqs: number[], gap = 0.09, dur = 0.15) => {
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

  function load(t: Term[]) {
    setStart(t); setArranged(t); setLines([]); setPhase("arrange"); setSelected(null); setAnim(null);
    setPendingAdd(null); setAddDraft(""); setDragIndex(null); setGhost(null);
    setFeedback("Rearrange: put the variable terms first, then the constants. Tap two to swap.");
    setHint(null); setWrong(0);
  }

  // Evidence: one report per fully simplified expression (live sessions only).
  useEffect(() => {
    if (phase !== "solved") return;
    reportToolResult({ tool: "combine-like-terms", correct: wrong === 0, standardId: "6.EE.A.3", problemId: JSON.stringify(start).slice(0, 80) });
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- arrange: tap two boxes to swap ---
  function clickArrange(idx: number) {
    if (phase !== "arrange") return;
    if (selected === null) { setSelected(idx); tone([520]); return; }
    if (selected === idx) { setSelected(null); return; }
    setArranged((arr) => {
      const next = arr.slice();
      [next[selected], next[idx]] = [next[idx], next[selected]];
      return next;
    });
    setSelected(null); tone([560, 660]); setHint(null);
  }

  function startCombining() {
    if (!arrangeOk) return;
    setLines([{ terms: arranged, note: "" }]);
    setPhase("play"); setSelected(null);
    setFeedback("Drag two like terms down, then add their coefficients.");
  }

  function runCombine(sel: number, idx: number, zero: boolean, sub: boolean) {
    setPhase("animating"); setAnim({ i: sel, j: idx, zero, sub }); setSelected(null);
    tone(zero ? [700, 500, 320] : sub ? [523, 440] : [523, 784]);
    window.setTimeout(() => {
      const t1 = terms[sel], t2 = terms[idx];
      const lo = Math.min(sel, idx), hi = Math.max(sel, idx);
      const combined: Term = { coef: t1.coef + t2.coef, variable: t1.variable };
      const next: Term[] = [];
      terms.forEach((t, i2) => {
        if (i2 === hi) return;
        if (i2 === lo) { if (!zero) next.push(combined); return; }
        next.push(t);
      });
      const note = zero
        ? `${termLabel(t1, true)} and ${termLabel(t2, true)} make a zero pair -> cancel`
        : `${termLabel(t1, true)} ${t2.coef < 0 ? "−" : "+"} ${termLabel({ ...t2, coef: Math.abs(t2.coef) }, true)} = ${termLabel(combined, true)}`;
      setLines((ls) => [...ls, { terms: next, note }]);
      setAnim(null);
      if (next.length === 0 || fullySimplified(next)) { setPhase("solved"); setFeedback(""); tone([523, 659, 784, 1047], 0.1, 0.2); }
      else { setPhase("play"); setFeedback("Pull down the next like terms and add them."); }
    }, 950);
  }

  function beginAdd(sel: number, idx: number) {
    const t1 = terms[sel], t2 = terms[idx];
    const sum = t1.coef + t2.coef;
    setPendingAdd({
      i: sel,
      j: idx,
      answer: sum,
      zero: sum === 0,
      sub: sum !== 0 && ((t1.coef < 0) !== (t2.coef < 0)),
      left: t1,
      right: t2,
    });
    setAddDraft("");
    setSelected(null);
    setHint(null);
    setFeedback("Add the coefficients.");
    setPhase("adding");
  }

  function submitAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingAdd) return;
    if (Number(addDraft) !== pendingAdd.answer) {
      tone([180, 140]);
      setWrong((w) => w + 1);
      setFeedback("Add the signed coefficients again.");
      setHint(`${pendingAdd.left.coef} + ${pendingAdd.right.coef} = ?`);
      return;
    }
    const next = pendingAdd;
    setPendingAdd(null);
    setAddDraft("");
    setHint(null);
    runCombine(next.i, next.j, next.zero, next.sub);
  }

  // --- combine: drag or tap two like terms ---
  function clickTerm(idx: number) {
    if (phase !== "play") return;
    if (selected === null) { setSelected(idx); tone([520]); return; }
    if (selected === idx) { setSelected(null); return; }
    const t1 = terms[selected], t2 = terms[idx];
    if (t1.variable !== t2.variable) {
      tone([180, 140]); setWrong((w) => w + 1); setSelected(null);
      setFeedback("Those aren't like terms — like terms have the same variable.");
      setHint("Tap one term, then another with the SAME variable (or two plain numbers).");
      return;
    }
    beginAdd(selected, idx);
  }

  function startTermDrag(e: React.PointerEvent, idx: number) {
    if (phase !== "play") return;
    dragStartRef.current = { x: e.clientX, y: e.clientY, moved: false };
    setDragIndex(idx);
    setGhost({ x: e.clientX, y: e.clientY, text: termLabel(terms[idx], idx === 0) });
  }

  useEffect(() => {
    if (dragIndex === null) return;
    const activeDragIndex = dragIndex;
    function move(e: PointerEvent) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) dragStartRef.current.moved = true;
      setGhost({ x: e.clientX, y: e.clientY, text: termLabel(terms[activeDragIndex], activeDragIndex === 0) });
    }
    function up(e: PointerEvent) {
      const idx = activeDragIndex;
      setDragIndex(null);
      setGhost(null);
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const dropped = Boolean(el?.closest("[data-combine-drop]"));
      if (dropped || !dragStartRef.current.moved) clickTerm(idx);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragIndex, terms]); // eslint-disable-line react-hooks/exhaustive-deps

  function chip(t: Term, i: number, opts: { active: boolean; boxed: boolean; isAnim?: boolean }) {
    const animCls = opts.isAnim && anim ? (anim.zero ? "poof" : "lift") : "";
    const selCls = selected === i && opts.active ? "sel" : "";
    const dragCls = dragIndex === i ? "dragging" : "";
    const activeHandlers = opts.active
      ? phase === "play"
        ? { onPointerDown: (event: React.PointerEvent) => startTermDrag(event, i) }
        : { onClick: () => clickArrange(i) }
      : {};
    return (
      <div key={i} className={`cl-box${opts.boxed ? " outlined" : ""}`}>
        <span
          className={`cl-chip ${animCls} ${selCls} ${dragCls} ${opts.active ? "" : "static"}`}
          style={{ background: tintFor(t), color: inkFor(t), borderColor: colorFor(t) }}
          {...activeHandlers}
        >{termLabel(t, i === 0)}</span>
      </div>
    );
  }

  return (
    <div className="cl-root">
      <style>{`
        .cl-root { min-height:100vh; background:var(--bdb-ground); color:var(--bdb-ink); font-family:var(--bdb-font); display:flex; flex-direction:column; }
        .cl-top { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:14px clamp(16px,3vw,30px); border-bottom:1px solid var(--bdb-line); }
        .cl-mark { font-size:0.74rem; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:var(--bdb-ink-faint); margin:0; }
        .cl-btn { font-size:0.84rem; font-weight:600; color:var(--bdb-ink-soft); background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r-pill); padding:8px 14px; cursor:pointer; text-decoration:none; }
        .cl-btn:hover { border-color:var(--bdb-ink-faint); color:var(--bdb-ink); }
        .cl-main { flex:1; display:flex; flex-direction:column; gap:clamp(14px,2.5vw,26px); padding:clamp(16px,3vw,34px); max-width:1000px; margin:0 auto; width:100%; box-sizing:border-box; align-items:center; }

        .cl-label { font-size:0.72rem; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:var(--bdb-ink-faint); text-align:center; }
        .cl-given { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; opacity:0.85; }
        .cl-given .cl-chip { font-size:clamp(1.2rem,3vw,1.7rem); cursor:default; }

        .cl-row { display:flex; gap:clamp(8px,1.4vw,14px); justify-content:center; flex-wrap:wrap; }
        .cl-box { display:grid; place-items:center; }
        .cl-box.outlined { border:2px dashed color-mix(in srgb,var(--bdb-ink-faint) 55%,white); border-radius:16px; padding:6px; min-width:clamp(58px,9vw,92px); min-height:clamp(58px,9vw,92px); }
        .cl-chip { font-weight:800; border:2px solid transparent; border-radius:12px; padding:clamp(8px,1.4vw,14px) clamp(12px,2vw,20px); font-size:clamp(1.4rem,4vw,2.2rem); cursor:pointer; transition:transform 130ms ease, box-shadow 130ms ease, opacity 130ms ease; line-height:1; touch-action:none; user-select:none; }
        .cl-chip.static { cursor:default; }
        .cl-chip.sel { box-shadow:0 0 0 3px var(--bdb-ink); transform:translateY(-3px); }
        .cl-chip.dragging { opacity:0.28; }
        .cl-chip.lift { animation:clLift 0.9s ease forwards; }
        .cl-chip.poof { animation:clPoof 0.9s ease forwards; }
        @keyframes clLift { 0%{} 40%{transform:translateY(-22px) scale(1.12);} 75%{transform:translateY(-22px) scale(1.12);} 100%{transform:translateY(6px) scale(0.96); opacity:0.25;} }
        @keyframes clPoof { 0%{} 45%{box-shadow:0 0 0 4px var(--bdb-coral); } 100%{opacity:0.12; transform:scale(0.5) rotate(-8deg); box-shadow:0 0 0 4px var(--bdb-coral);} }

        .cl-lines { display:grid; gap:12px; justify-items:center; width:100%; }
        .cl-line { display:grid; justify-items:center; gap:6px; animation:clDrop 0.45s ease; }
        @keyframes clDrop { from{opacity:0; transform:translateY(-14px);} to{opacity:1; transform:none;} }
        .cl-note { font-size:0.86rem; font-weight:600; color:var(--bdb-ink-soft); text-align:center; }
        .cl-line.done .cl-chip { font-size:clamp(1.1rem,3vw,1.6rem); opacity:0.6; }

        .cl-cta { font-size:1.05rem; font-weight:700; color:#fff; background:var(--bdb-teal); border:none; border-radius:14px; padding:13px 30px; cursor:pointer; }
        .cl-cta:disabled { background:var(--bdb-line); color:var(--bdb-ink-faint); cursor:not-allowed; }
        .cl-q { font-size:clamp(1.05rem,2.6vw,1.35rem); font-weight:700; color:var(--bdb-ink); text-align:center; min-height:1.3em; }
        .cl-fb { font-size:1rem; font-weight:600; color:var(--bdb-ink-soft); text-align:center; }
        .cl-dropzone { width:min(100%,620px); min-height:76px; border:3px dashed var(--bdb-teal); border-radius:16px; background:color-mix(in srgb,var(--bdb-teal) 10%,white); color:var(--bdb-teal); display:grid; place-items:center; padding:12px 18px; font-size:1.05rem; font-weight:900; text-align:center; }
        .cl-dropzone.ready { border-color:var(--bdb-coral); background:color-mix(in srgb,var(--bdb-coral) 9%,white); color:var(--bdb-coral); animation:clGlow 1s ease-in-out infinite; }
        @keyframes clGlow { 50% { box-shadow:0 0 0 5px color-mix(in srgb,var(--bdb-coral) 16%,transparent); } }
        .cl-addform { display:grid; gap:10px; justify-items:center; border:2px solid var(--bdb-line); border-radius:16px; background:#fff; padding:16px; width:min(100%,560px); }
        .cl-addexpr { font-size:clamp(1.5rem,4vw,2.4rem); font-weight:900; color:var(--bdb-ink); text-align:center; }
        .cl-addrow { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; }
        .cl-addinput { width:130px; min-height:58px; border:2px solid var(--bdb-line); border-radius:12px; background:var(--bdb-ground); color:var(--bdb-ink); font-size:1.6rem; font-weight:900; text-align:center; }
        .cl-addinput:focus { outline:4px solid color-mix(in srgb,var(--bdb-teal) 18%,transparent); border-color:var(--bdb-teal); }
        .cl-hint { background:color-mix(in srgb,var(--bdb-amber) 16%,white); border:1px solid color-mix(in srgb,var(--bdb-amber) 40%,white); color:#8a5a0b; border-radius:12px; padding:11px 16px; font-weight:600; font-size:0.95rem; max-width:580px; text-align:center; }
        .cl-solved-eq { font-size:clamp(2rem,7vw,3.6rem); font-weight:800; color:var(--bdb-green); text-align:center; }

        .cl-presets { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
        .cl-preset { font-size:0.85rem; font-weight:600; color:var(--bdb-ink-soft); background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:999px; padding:7px 13px; cursor:pointer; }
        .cl-preset:hover { border-color:var(--bdb-ink-faint); }
        .cl-ghost { position:fixed; z-index:50; pointer-events:none; transform:translate(-50%,-50%); border:2px solid var(--bdb-ink); border-radius:12px; background:#fff; padding:12px 20px; color:var(--bdb-ink); font-size:2rem; font-weight:900; box-shadow:0 14px 28px rgba(32,30,26,0.24); }
      `}</style>

      <header className="cl-top">
        <p className="cl-mark">Combining Like Terms</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="cl-btn" onClick={() => load(PRESETS[Math.floor(Math.random() * PRESETS.length)].terms)}>Random</button>
          <button className="cl-btn" onClick={() => load(start)}>Restart</button>
          <a className="cl-btn" href="/teacher">Tools</a>
        </div>
      </header>

      <main className="cl-main">
        <div style={{ display: "grid", gap: 6, justifyItems: "center" }}>
          <div className="cl-label">Given</div>
          <div className="cl-given">
            {start.map((t, i) => (
              <span key={i} className="cl-chip static" style={{ background: tintFor(t), color: inkFor(t), borderColor: colorFor(t) }}>{termLabel(t, i === 0)}</span>
            ))}
          </div>
        </div>

        {phase === "arrange" ? (
          <>
            <div className="cl-label">Arrange — variable terms first, constants last</div>
            <div className="cl-row">
              {arranged.map((t, i) => chip(t, i, { active: true, boxed: true }))}
            </div>
            <button className="cl-cta" disabled={!arrangeOk} onClick={startCombining}>
              {arrangeOk ? "Grouped! Start combining →" : "Group the like terms to continue"}
            </button>
            {hint && <div className="cl-hint">{hint}</div>}
            {!arrangeOk && <div className="cl-fb">{feedback}</div>}
          </>
        ) : (
          <>
            <div className="cl-lines">
              {lines.map((ln, li) => {
                const activeLine = li === lines.length - 1 && phase !== "solved";
                const clickable = li === lines.length - 1 && phase === "play";
                return (
                  <div className={`cl-line ${activeLine ? "" : "done"}`} key={li}>
                    {ln.note && <div className="cl-note">{ln.note}</div>}
                    <div className="cl-row">
                      {ln.terms.length === 0
                        ? <span className="cl-chip static" style={{ background: "var(--bdb-ground-2)", color: "var(--bdb-ink-soft)", borderColor: "var(--bdb-line)" }}>0</span>
                        : ln.terms.map((t, i) => {
                          const isAnim = activeLine && anim != null && (i === anim.i || i === anim.j);
                          return chip(t, i, { active: clickable, boxed: false, isAnim });
                        })}
                    </div>
                  </div>
                );
              })}
            </div>

            {phase === "solved" ? (
              <>
                <div className="cl-solved-eq">{exprStr(terms)}</div>
                <p className="cl-q">Fully simplified{wrong === 0 ? " — no mistakes!" : "!"}</p>
                <button className="cl-preset" onClick={() => load(start)}>↻ Try again</button>
              </>
            ) : phase === "adding" && pendingAdd ? (
              <form className="cl-addform" onSubmit={submitAdd}>
                <p className="cl-q" style={{ margin: 0 }}>Add the terms</p>
                <div className="cl-addexpr">
                  {termLabel(pendingAdd.left, true)} + {termLabel(pendingAdd.right, true)} = ?
                </div>
                <div className="cl-addrow">
                  <input
                    className="cl-addinput"
                    inputMode="numeric"
                    value={addDraft}
                    autoFocus
                    onChange={(event) => setAddDraft(event.target.value.replace(/[^\d-]/g, ""))}
                  />
                  <button className="cl-cta" type="submit">Add</button>
                </div>
                {hint && <div className="cl-hint">{hint}</div>}
              </form>
            ) : phase === "animating" ? (
              <p className="cl-q">{anim?.zero ? "Zero pair — they cancel to 0…" : anim?.sub ? "Subtracting like terms…" : "Adding like terms…"}</p>
            ) : (
              <>
                <div className={`cl-dropzone${selected !== null ? " ready" : ""}`} data-combine-drop>
                  {selected === null ? "Pull one term down" : "Pull a like term down"}
                </div>
                <p className="cl-q">{feedback}</p>
                {hint && <div className="cl-hint">{hint}</div>}
              </>
            )}
          </>
        )}

        <div className="cl-presets">
          {PRESETS.map((p, i) => <button className="cl-preset" key={i} onClick={() => load(p.terms)}>{p.label}</button>)}
        </div>
      </main>
      {ghost && <div className="cl-ghost" style={{ left: ghost.x, top: ghost.y }}>{ghost.text}</div>}
    </div>
  );
}
