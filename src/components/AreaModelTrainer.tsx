"use client";

// Area Model Trainer lets students decompose two factors, fill the four
// partial-products, and see how the rectangle pieces add back to the product.
import { type CSSProperties, useState } from "react";
import { reportToolResult } from "@/lib/toolEvidence";

type Problem = {
  top: number;
  side: number;
};

type FieldKey =
  | "topA"
  | "topB"
  | "sideA"
  | "sideB"
  | "box00"
  | "box01"
  | "box10"
  | "box11"
  | "total";

type Fields = Record<FieldKey, string>;

type Feedback = {
  kind: "idle" | "check" | "success";
  text: string;
  keys?: FieldKey[];
};

const EMPTY_FIELDS: Fields = {
  topA: "",
  topB: "",
  sideA: "",
  sideB: "",
  box00: "",
  box01: "",
  box10: "",
  box11: "",
  total: "",
};

const PROBLEMS: Problem[] = [
  { top: 256, side: 14 },
  { top: 38, side: 16 },
  { top: 124, side: 23 },
  { top: 47, side: 35 },
  { top: 86, side: 27 },
  { top: 132, side: 18 },
  { top: 215, side: 32 },
  { top: 63, side: 42 },
  { top: 178, side: 24 },
  { top: 304, side: 17 },
];

const INITIAL_FEEDBACK: Feedback = {
  kind: "idle",
  text: "Start with the top split. Then move down one step at a time.",
};

const BOX_COLORS = ["#f95335", "#245caa", "#2f9e6f", "#fcaf38"] as const;

function readNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isWhole(n: number | null): n is number {
  return n !== null && Number.isInteger(n) && n >= 0;
}

function friendlySplit(n: number): [number, number] {
  if (n < 10) return [n, 0];
  const first = Math.floor(n / 10) * 10;
  return [first, n - first];
}

function chooseProblem(current: Problem): Problem {
  const choices = PROBLEMS.filter((p) => p.top !== current.top || p.side !== current.side);
  return choices[Math.floor(Math.random() * choices.length)] ?? PROBLEMS[0];
}

function productText(a: number | null, b: number | null): string {
  if (a === null || b === null) return "? x ?";
  return `${a} x ${b}`;
}

export default function AreaModelTrainer() {
  const [problem, setProblem] = useState<Problem>(PROBLEMS[0]);
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS);
  const [feedback, setFeedback] = useState<Feedback>(INITIAL_FEEDBACK);

  const topA = readNumber(fields.topA);
  const topB = readNumber(fields.topB);
  const sideA = readNumber(fields.sideA);
  const sideB = readNumber(fields.sideB);
  const topPartsReady = isWhole(topA) && isWhole(topB);
  const sidePartsReady = isWhole(sideA) && isWhole(sideB);
  const splitReady = topPartsReady && sidePartsReady;
  const splitCorrect = splitReady && topA + topB === problem.top && sideA + sideB === problem.side;
  const topSplitCorrect = topPartsReady && topA + topB === problem.top;
  const sideSplitCorrect = sidePartsReady && sideA + sideB === problem.side;

  const visualTop: [number, number] = topPartsReady ? [Math.max(1, topA), Math.max(1, topB)] : [1, 1];
  const visualSide: [number, number] = sidePartsReady ? [Math.max(1, sideA), Math.max(1, sideB)] : [1, 1];

  const boxes = [
    { key: "box00" as const, top: topA, side: sideA },
    { key: "box01" as const, top: topB, side: sideA },
    { key: "box10" as const, top: topA, side: sideB },
    { key: "box11" as const, top: topB, side: sideB },
  ];
  const correctBoxes = boxes.map((box) => ({
    ...box,
    value: splitReady ? (box.top ?? 0) * (box.side ?? 0) : null,
  }));
  const correctTotal = problem.top * problem.side;
  const issueKeys = new Set(feedback.keys ?? []);
  const boxesCorrect = splitCorrect && correctBoxes.every((box) => {
    const current = readNumber(fields[box.key]);
    return isWhole(current) && current === box.value;
  });
  const totalCorrect = boxesCorrect && readNumber(fields.total) === correctTotal;
  const activeStep = !topSplitCorrect
    ? "top"
    : !sideSplitCorrect
    ? "side"
    : !boxesCorrect
    ? "boxes"
    : !totalCorrect
    ? "total"
    : "done";
  const stepItems = [
    { id: "top", label: `Split ${problem.top}`, detail: "top place values" },
    { id: "side", label: `Split ${problem.side}`, detail: "side place values" },
    { id: "boxes", label: "Multiply", detail: "4 boxes" },
    { id: "total", label: "Add", detail: "4 parts" },
  ] as const;

  function setField(key: FieldKey, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setFeedback(INITIAL_FEEDBACK);
  }

  function loadProblem(next: Problem) {
    setProblem(next);
    setFields(EMPTY_FIELDS);
    setFeedback(INITIAL_FEEDBACK);
  }

  function fillFriendlySplit() {
    const [newTopA, newTopB] = friendlySplit(problem.top);
    const [newSideA, newSideB] = friendlySplit(problem.side);
    setFields({
      ...EMPTY_FIELDS,
      topA: String(newTopA),
      topB: String(newTopB),
      sideA: String(newSideA),
      sideB: String(newSideB),
    });
    setFeedback({
      kind: "idle",
      text: "Place-value split added. Multiply each rectangle, then add the four products.",
    });
  }

  function checkWork() {
    if (!topPartsReady) {
      setFeedback({
        kind: "check",
        text: `Split ${problem.top} into two whole-number parts first.`,
        keys: ["topA", "topB"],
      });
      return;
    }
    if (topA + topB !== problem.top) {
      setFeedback({
        kind: "check",
        text: `${topA} + ${topB} needs to equal ${problem.top}. Adjust the top split.`,
        keys: ["topA", "topB"],
      });
      return;
    }
    if (!sidePartsReady) {
      setFeedback({
        kind: "check",
        text: `Split ${problem.side} into two whole-number parts on the side.`,
        keys: ["sideA", "sideB"],
      });
      return;
    }
    if (sideA + sideB !== problem.side) {
      setFeedback({
        kind: "check",
        text: `${sideA} + ${sideB} needs to equal ${problem.side}. Adjust the side split.`,
        keys: ["sideA", "sideB"],
      });
      return;
    }

    for (const box of correctBoxes) {
      const studentValue = readNumber(fields[box.key]);
      if (!isWhole(studentValue)) {
        setFeedback({
          kind: "check",
          text: `Fill in ${productText(box.top, box.side)} before checking the total.`,
          keys: [box.key],
        });
        return;
      }
      if (studentValue !== box.value) {
        setFeedback({
          kind: "check",
          text: `Check ${productText(box.top, box.side)} again. That rectangle should match its two outside labels.`,
          keys: [box.key],
        });
        return;
      }
    }

    const total = readNumber(fields.total);
    if (!isWhole(total)) {
      setFeedback({
        kind: "check",
        text: "The four rectangles are correct. Add them together for the final product.",
        keys: ["total"],
      });
      return;
    }
    if (total !== correctTotal) {
      setFeedback({
        kind: "check",
        text: `Add the four partial products again. The total should equal ${problem.top} x ${problem.side}.`,
        keys: ["total"],
      });
      return;
    }

    setFeedback({
      kind: "success",
      text: `Nice work. ${problem.top} x ${problem.side} = ${correctTotal}, and every rectangle matches the decomposition.`,
    });
    reportToolResult({ tool: "area-model", correct: true, problemId: `${problem.top}x${problem.side}` });
  }

  const modelStyle = {
    gridTemplateColumns: `54px minmax(96px, ${visualTop[0]}fr) minmax(96px, ${visualTop[1]}fr)`,
    gridTemplateRows: `38px minmax(94px, ${visualSide[0]}fr) minmax(94px, ${visualSide[1]}fr)`,
  };

  return (
    <div className="am-root">
      <style>{`
        .am-root { min-height:100vh; background:var(--bdb-ground); color:var(--bdb-ink); font-family:var(--bdb-font); display:grid; grid-template-rows:auto 1fr; }
        .am-top { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:14px 22px; border-bottom:2px solid var(--bdb-line); background:rgba(250,246,238,0.94); }
        .am-title { margin:0; font-size:1.1rem; font-weight:900; letter-spacing:0.02em; }
        .am-actions { display:flex; gap:10px; flex-wrap:wrap; }
        .am-btn, .am-home { min-height:44px; border:2px solid var(--bdb-line); border-radius:8px; background:#fff; color:var(--bdb-ink); padding:9px 14px; font-size:0.9rem; font-weight:900; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; }
        .am-btn:hover, .am-home:hover { border-color:var(--bdb-coral); }
        .am-btn.primary { border-color:var(--bdb-coral); background:var(--bdb-coral); color:#fff; }

        .am-main { display:grid; grid-template-columns:minmax(290px, 360px) minmax(0, 1fr); gap:18px; padding:18px; align-items:start; }
        .am-panel { border:2px solid var(--bdb-line); border-radius:10px; background:#fff; padding:18px; box-shadow:0 12px 26px rgba(32,36,45,0.08); }
        .am-problem { display:grid; gap:8px; justify-items:start; margin-bottom:14px; }
        .am-label { margin:0; color:var(--bdb-ink-soft); font-size:0.78rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
        .am-problem-value { margin:0; color:var(--bdb-ink); font-size:clamp(2.8rem,7vw,4.6rem); line-height:1; font-weight:950; }
        .am-copy { margin:0; color:var(--bdb-ink-soft); font-size:0.98rem; font-weight:800; line-height:1.25; }
        .am-step-list { display:grid; gap:8px; margin:0 0 16px; }
        .am-step { display:grid; grid-template-columns:auto minmax(0,1fr); gap:9px; align-items:center; border:2px solid var(--bdb-line); border-radius:3px; background:var(--bdb-ground); padding:9px; }
        .am-step-num { display:grid; width:34px; height:34px; place-items:center; border-radius:2px; background:#fff; border:2px solid var(--bdb-line); font-weight:950; color:var(--bdb-ink-soft); }
        .am-step-text { display:grid; gap:1px; min-width:0; }
        .am-step-label { color:var(--bdb-ink); font-size:0.96rem; font-weight:950; }
        .am-step-detail { color:var(--bdb-ink-soft); font-size:0.78rem; font-weight:850; text-transform:uppercase; letter-spacing:0.07em; }
        .am-step.active { border-color:var(--bdb-coral); background:color-mix(in srgb, var(--bdb-coral) 8%, #fff); box-shadow:0 0 0 4px color-mix(in srgb, var(--bdb-coral) 14%, transparent); }
        .am-step.active .am-step-num { background:var(--bdb-coral); border-color:var(--bdb-coral); color:#fff; animation:amPulse 900ms ease-in-out infinite; }
        .am-step.done { opacity:0.58; }
        @keyframes amPulse { 50% { transform:scale(1.08); } }
        .am-input-grid { display:grid; gap:14px; }
        .am-split-group { display:grid; gap:8px; }
        .am-split-row { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:8px; }
        .am-plus { color:var(--bdb-ink-soft); font-size:1.35rem; font-weight:900; }
        .am-input { width:100%; min-width:0; border:2px solid var(--bdb-line); border-radius:3px; padding:12px 10px; color:var(--bdb-ink); font-size:1.2rem; font-weight:950; text-align:center; }
        .am-input:focus, .am-box-input:focus { border-color:var(--bdb-coral); outline:3px solid rgba(249,115,22,0.18); }
        .am-input.issue, .am-box.issue .am-box-input { border-color:var(--bdb-coral); outline:3px solid rgba(220,38,38,0.14); }
        .am-input.spotlight, .am-box.spotlight, .am-total-input.spotlight { border-color:var(--bdb-coral); box-shadow:0 0 0 4px color-mix(in srgb, var(--bdb-coral) 16%, transparent); }
        .am-feedback { border:2px solid var(--bdb-line); border-radius:10px; background:var(--bdb-ground); padding:12px 14px; color:var(--bdb-ink-soft); font-size:0.96rem; font-weight:800; line-height:1.4; }
        .am-feedback.check { border-color:var(--bdb-amber); background:color-mix(in srgb, var(--bdb-amber) 14%, #fff); color:var(--bdb-brown); }
        .am-feedback.success { border-color:var(--bdb-green); background:color-mix(in srgb, var(--bdb-green) 12%, #fff); color:var(--bdb-green); }

        .am-stage { display:grid; gap:14px; min-width:0; }
        .am-model { display:grid; gap:6px; min-height:clamp(420px, 58vh, 620px); width:min(100%, 760px); border:3px solid var(--bdb-ink); border-radius:3px; background:var(--bdb-ink); padding:6px; }
        .am-corner, .am-axis, .am-side-axis { display:grid; place-items:center; border:2px solid var(--bdb-ink); border-radius:2px; background:#fff; color:var(--bdb-ink-soft); font-weight:900; text-align:center; }
        .am-corner { color:var(--bdb-ink-faint); font-size:0.72rem; }
        .am-axis { font-size:clamp(0.95rem,1.8vw,1.25rem); color:var(--bdb-ink); }
        .am-side-axis { font-size:clamp(0.9rem,1.8vw,1.15rem); color:var(--bdb-ink); writing-mode:vertical-rl; transform:rotate(180deg); }
        .am-box { --box-color:#fcaf38; position:relative; overflow:hidden; display:grid; align-content:center; justify-items:center; gap:8px; min-width:0; min-height:0; border:3px solid color-mix(in srgb, var(--box-color) 78%, black); border-radius:2px; background:color-mix(in srgb, var(--box-color) 20%, #fff); padding:10px; transition:border-color 160ms ease, box-shadow 160ms ease; }
        .am-box.correct { border-color:var(--bdb-green); }
        .am-box.issue { border-color:var(--bdb-coral); background:color-mix(in srgb, var(--bdb-coral) 10%, #fff); }
        .am-box > *:not(.am-fill) { position:relative; z-index:1; }
        .am-fill { position:absolute; inset:0; z-index:0; border-radius:0; background:color-mix(in srgb, var(--box-color) 62%, transparent); transform-origin:left center; transform:scaleX(0); pointer-events:none; }
        .am-box.correct .am-fill { animation:amSwipe 520ms cubic-bezier(.2,.7,.2,1) forwards; }
        @keyframes amSwipe { from { transform:scaleX(0); } to { transform:scaleX(1); } }
        .am-mul-label { color:var(--bdb-ink-soft); font-size:0.82rem; font-weight:800; text-align:center; }
        .am-answer { font-size:clamp(1.5rem,3.2vw,2.1rem); font-weight:900; color:var(--bdb-ink); line-height:1; animation:amPop 360ms ease 130ms both; }
        @keyframes amPop { from { opacity:0; transform:scale(.55); } to { opacity:1; transform:scale(1); } }
        .am-box-input { width:min(136px, 100%); border:2px solid var(--bdb-line); border-radius:3px; background:#fff; padding:10px; color:var(--bdb-ink); font-size:1.28rem; font-weight:950; text-align:center; }
        .am-process { display:grid; gap:12px; border:2px solid var(--bdb-line); border-radius:4px; background:#fff; padding:14px; width:min(100%, 760px); }
        .am-process-title { margin:0; color:var(--bdb-ink-soft); font-size:0.78rem; font-weight:950; letter-spacing:0.1em; text-transform:uppercase; }
        .am-process.ready { border-color:var(--bdb-coral); box-shadow:0 0 0 4px color-mix(in srgb, var(--bdb-coral) 12%, transparent); }
        .am-sum-strip { display:grid; grid-template-columns:repeat(4, minmax(64px,1fr)) auto minmax(130px, 180px); gap:8px; align-items:center; }
        .am-sum-piece { --box-color:#fcaf38; min-height:54px; border:2px solid color-mix(in srgb, var(--box-color) 72%, black); border-radius:3px; background:color-mix(in srgb, var(--box-color) 20%, #fff); display:grid; place-items:center; color:var(--bdb-ink); font-size:1.25rem; font-weight:950; font-variant-numeric:tabular-nums; animation:amSumPop 360ms ease both; }
        .am-sum-piece:nth-child(2) { animation-delay:80ms; }
        .am-sum-piece:nth-child(3) { animation-delay:160ms; }
        .am-sum-piece:nth-child(4) { animation-delay:240ms; }
        @keyframes amSumPop { from { opacity:0; transform:translateY(-10px) scale(.92); } to { opacity:1; transform:none; } }
        .am-sum-plus, .am-sum-eq { color:var(--bdb-ink-soft); font-size:1.5rem; font-weight:950; text-align:center; }
        .am-total-input { max-width:180px; }

        @media (max-width: 920px) {
          .am-main { grid-template-columns:1fr; }
          .am-panel { order:1; }
          .am-stage { order:2; }
        }
        @media (max-width: 620px) {
          .am-top { align-items:stretch; }
          .am-actions, .am-btn, .am-home { width:100%; }
          .am-main { padding:12px; }
          .am-model { grid-template-columns:46px 1fr 1fr !important; grid-template-rows:34px minmax(110px,1fr) minmax(110px,1fr) !important; min-height:330px; }
          .am-side-axis { font-size:0.95rem; }
          .am-sum-strip { grid-template-columns:repeat(2, minmax(0,1fr)); }
          .am-sum-eq, .am-total-input { grid-column:1 / -1; }
          .am-total-input { max-width:none; }
        }
      `}</style>

      <header className="am-top">
        <a className="am-home" href="/teacher">Teacher Tools</a>
        <h1 className="am-title">Area Model Multiplication</h1>
        <div className="am-actions">
          <button className="am-btn" onClick={() => loadProblem(chooseProblem(problem))}>New Problem</button>
          <button className="am-btn" onClick={() => setFields(EMPTY_FIELDS)}>Clear Work</button>
          <button className="am-btn primary" onClick={checkWork}>Check Work</button>
        </div>
      </header>

      <main className="am-main">
        <section className="am-panel">
          <div className="am-problem">
            <p className="am-label">Multiply</p>
            <p className="am-problem-value">{problem.top} x {problem.side}</p>
            <p className="am-copy">Line up by place value. Work one value at a time.</p>
          </div>

          <div className="am-step-list" aria-label="Area model steps">
            {stepItems.map((item, index) => (
              <div
                className={`am-step${activeStep === item.id ? " active" : ""}${
                  stepItems.findIndex((step) => step.id === activeStep) > index || activeStep === "done" ? " done" : ""
                }`}
                key={item.id}
              >
                <span className="am-step-num">{index + 1}</span>
                <span className="am-step-text">
                  <span className="am-step-label">{item.label}</span>
                  <span className="am-step-detail">{item.detail}</span>
                </span>
              </div>
            ))}
          </div>

          <div className="am-input-grid">
            <label className="am-split-group">
              <span className="am-label">Top factor: {problem.top}</span>
              <span className="am-split-row">
                <input aria-label={`First part of ${problem.top}`} data-testid="top-a" className={`am-input${issueKeys.has("topA") ? " issue" : ""}${activeStep === "top" ? " spotlight" : ""}`} inputMode="numeric" value={fields.topA} placeholder="250" onChange={(e) => setField("topA", e.target.value)} />
                <span className="am-plus">+</span>
                <input aria-label={`Second part of ${problem.top}`} data-testid="top-b" className={`am-input${issueKeys.has("topB") ? " issue" : ""}${activeStep === "top" ? " spotlight" : ""}`} inputMode="numeric" value={fields.topB} placeholder="6" onChange={(e) => setField("topB", e.target.value)} />
              </span>
            </label>

            <label className="am-split-group">
              <span className="am-label">Side factor: {problem.side}</span>
              <span className="am-split-row">
                <input aria-label={`First part of ${problem.side}`} data-testid="side-a" className={`am-input${issueKeys.has("sideA") ? " issue" : ""}${activeStep === "side" ? " spotlight" : ""}`} inputMode="numeric" value={fields.sideA} placeholder="10" onChange={(e) => setField("sideA", e.target.value)} />
                <span className="am-plus">+</span>
                <input aria-label={`Second part of ${problem.side}`} data-testid="side-b" className={`am-input${issueKeys.has("sideB") ? " issue" : ""}${activeStep === "side" ? " spotlight" : ""}`} inputMode="numeric" value={fields.sideB} placeholder="4" onChange={(e) => setField("sideB", e.target.value)} />
              </span>
            </label>

            <button className="am-btn" type="button" onClick={fillFriendlySplit}>Use Place-Value Split</button>

            <div className={`am-feedback ${feedback.kind}`}>{feedback.text}</div>
          </div>
        </section>

        <section className="am-stage" aria-label="Area model workspace">
          <div className="am-model" style={modelStyle}>
            <div className="am-corner">{problem.top} x {problem.side}</div>
            <div className="am-axis">{topA ?? "?"}</div>
            <div className="am-axis">{topB ?? "?"}</div>
            <div className="am-side-axis">{sideA ?? "?"}</div>
            {correctBoxes.slice(0, 2).map((box, index) => {
              const current = readNumber(fields[box.key]);
              const isCorrect = splitCorrect && isWhole(current) && current === box.value;
              return (
                <div
                  className={`am-box${issueKeys.has(box.key) ? " issue" : ""}${isCorrect ? " correct" : ""}${activeStep === "boxes" ? " spotlight" : ""}`}
                  key={box.key}
                  style={{ "--box-color": BOX_COLORS[index] } as CSSProperties}
                >
                  <span className="am-fill" aria-hidden="true" />
                  <span className="am-mul-label">{productText(box.top, box.side)}</span>
                  {isCorrect ? (
                    <span className="am-answer">{box.value}</span>
                  ) : (
                    <input aria-label={`Partial product ${box.key}`} data-testid={box.key} className="am-box-input" inputMode="numeric" value={fields[box.key]} placeholder="?" onChange={(e) => setField(box.key, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") checkWork(); }} />
                  )}
                </div>
              );
            })}
            <div className="am-side-axis">{sideB ?? "?"}</div>
            {correctBoxes.slice(2).map((box, index) => {
              const current = readNumber(fields[box.key]);
              const isCorrect = splitCorrect && isWhole(current) && current === box.value;
              return (
                <div
                  className={`am-box${issueKeys.has(box.key) ? " issue" : ""}${isCorrect ? " correct" : ""}${activeStep === "boxes" ? " spotlight" : ""}`}
                  key={box.key}
                  style={{ "--box-color": BOX_COLORS[index + 2] } as CSSProperties}
                >
                  <span className="am-fill" aria-hidden="true" />
                  <span className="am-mul-label">{productText(box.top, box.side)}</span>
                  {isCorrect ? (
                    <span className="am-answer">{box.value}</span>
                  ) : (
                    <input aria-label={`Partial product ${box.key}`} data-testid={box.key} className="am-box-input" inputMode="numeric" value={fields[box.key]} placeholder="?" onChange={(e) => setField(box.key, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") checkWork(); }} />
                  )}
                </div>
              );
            })}
          </div>

          <div className={`am-process${activeStep === "total" ? " ready" : ""}`}>
            <p className="am-process-title">Add the four rectangles</p>
            <div className="am-sum-strip">
              {correctBoxes.map((box, index) => (
                <span className="am-sum-piece" key={box.key} style={{ "--box-color": BOX_COLORS[index] } as CSSProperties}>
                  {fields[box.key] || "?"}
                </span>
              ))}
              <span className="am-sum-eq">=</span>
              <input aria-label="Final product" data-testid="total" className={`am-input am-total-input${issueKeys.has("total") ? " issue" : ""}${activeStep === "total" ? " spotlight" : ""}`} inputMode="numeric" value={fields.total} placeholder="Total" onChange={(e) => setField("total", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") checkWork(); }} />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
