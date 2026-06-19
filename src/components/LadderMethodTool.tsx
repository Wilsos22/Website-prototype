"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";

type Step = {
  divisor: number;
  left: number;
  right: number;
};

type Phase = "choose" | "divide" | "gcf" | "lcm" | "done";

const DIVISOR_OPTIONS = [2, 3, 5, 6, 7, 10];
const PROBLEMS = [
  [24, 36],
  [28, 42],
  [36, 90],
  [40, 60],
  [45, 75],
  [48, 64],
  [54, 72],
  [56, 98],
  [63, 84],
  [70, 90],
  [72, 120],
  [84, 126],
] as [number, number][];

function product(values: number[]) {
  return values.reduce((total, value) => total * value, 1);
}

function chooseProblem(current?: [number, number]): [number, number] {
  const choices = PROBLEMS.filter(([a, b]) => !current || current[0] !== a || current[1] !== b);
  return choices[Math.floor(Math.random() * choices.length)] as [number, number];
}

function commonDivisors(left: number, right: number) {
  return DIVISOR_OPTIONS.filter((divisor) => left % divisor === 0 && right % divisor === 0);
}

function divisionRule(divisor: number) {
  if (divisor === 2) return "Divisible by 2 means the number is even.";
  if (divisor === 3) return "Divisible by 3 means the sum of the digits is divisible by 3.";
  if (divisor === 5) return "Divisible by 5 means the number ends in 0 or 5.";
  if (divisor === 6) return "Divisible by 6 means the number is divisible by both 2 and 3.";
  if (divisor === 7) return "For 7, check whether groups of 7 divide evenly with no remainder.";
  return "Divisible by 10 means the number ends in 0.";
}

function failedReason(left: number, right: number, divisor: number) {
  const leftWorks = left % divisor === 0;
  const rightWorks = right % divisor === 0;
  const parts = [
    `${left} ÷ ${divisor} ${leftWorks ? "is whole" : `has remainder ${left % divisor}`}`,
    `${right} ÷ ${divisor} ${rightWorks ? "is whole" : `has remainder ${right % divisor}`}`,
  ];
  return `${divisionRule(divisor)} ${parts.join(". ")}.`;
}

export default function LadderMethodTool() {
  const [problem, setProblem] = useState<[number, number]>(PROBLEMS[0]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [phase, setPhase] = useState<Phase>("choose");
  const [pickerOpen, setPickerOpen] = useState(true);
  const [pendingDivisor, setPendingDivisor] = useState<number | null>(null);
  const [leftQuotient, setLeftQuotient] = useState("");
  const [rightQuotient, setRightQuotient] = useState("");
  const [gcfInput, setGcfInput] = useState("");
  const [lcmInput, setLcmInput] = useState("");
  const [feedback, setFeedback] = useState("Choose a divisor that divides both numbers.");

  const currentPair = useMemo(() => {
    const last = steps[steps.length - 1];
    return last ? [last.left, last.right] : problem;
  }, [problem, steps]) as [number, number];
  const divisorsLeft = commonDivisors(currentPair[0], currentPair[1]);
  const ladderDivisors = steps.map((step) => step.divisor);
  const bottomPair = currentPair;
  const gcf = product(ladderDivisors);
  const lcm = gcf * bottomPair[0] * bottomPair[1];

  function reset(nextProblem = problem) {
    setProblem(nextProblem);
    setSteps([]);
    setPhase("choose");
    setPickerOpen(true);
    setPendingDivisor(null);
    setLeftQuotient("");
    setRightQuotient("");
    setGcfInput("");
    setLcmInput("");
    setFeedback("Choose a divisor that divides both numbers.");
  }

  function newProblem() {
    reset(chooseProblem(problem));
  }

  function chooseDivisor(divisor: number) {
    if (currentPair[0] % divisor !== 0 || currentPair[1] % divisor !== 0) {
      setFeedback(failedReason(currentPair[0], currentPair[1], divisor));
      return;
    }

    setPendingDivisor(divisor);
    setPickerOpen(false);
    setPhase("divide");
    setLeftQuotient("");
    setRightQuotient("");
    setFeedback(`${divisor} works. Divide both numbers by ${divisor}.`);
  }

  function submitQuotients(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingDivisor) return;
    const left = Number(leftQuotient);
    const right = Number(rightQuotient);
    const expectedLeft = currentPair[0] / pendingDivisor;
    const expectedRight = currentPair[1] / pendingDivisor;

    if (left !== expectedLeft || right !== expectedRight) {
      setFeedback(`${currentPair[0]} ÷ ${pendingDivisor} = ${expectedLeft} and ${currentPair[1]} ÷ ${pendingDivisor} = ${expectedRight}.`);
      return;
    }

    const nextSteps = [...steps, { divisor: pendingDivisor, left, right }];
    setSteps(nextSteps);
    setPendingDivisor(null);
    setLeftQuotient("");
    setRightQuotient("");

    if (commonDivisors(left, right).length === 0) {
      setPhase("gcf");
      setFeedback("No common divisor is left. Multiply the left ladder.");
      return;
    }

    setPhase("choose");
    setPickerOpen(true);
    setFeedback("Choose another divisor that divides both numbers.");
  }

  function submitGcf(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (Number(gcfInput) !== gcf) {
      setFeedback(`Multiply the left ladder: ${ladderDivisors.join(" x ")} = ${gcf}.`);
      return;
    }
    setPhase("lcm");
    setFeedback("GCF is set. Multiply the L shape for LCM.");
  }

  function submitLcm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (Number(lcmInput) !== lcm) {
      setFeedback(`${ladderDivisors.join(" x ")} x ${bottomPair[0]} x ${bottomPair[1]} = ${lcm}.`);
      return;
    }
    setPhase("done");
    setFeedback(`GCF ${gcf}. LCM ${lcm}.`);
  }

  return (
    <main className="lm-root">
      <style>{`
        .lm-root {
          min-height: 100vh;
          background: #fff;
          color: #20242d;
          font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        }
        .lm-top {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 14px;
          padding: 14px clamp(14px, 3vw, 28px);
          border-bottom: 1px solid #d8dee8;
          background: #fff;
          backdrop-filter: blur(12px);
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .lm-home,
        .lm-button,
        .lm-option {
          border: 2px solid #d6deea;
          border-radius: 4px;
          background: #fff;
          color: #20242d;
          cursor: pointer;
          font-weight: 900;
          text-decoration: none;
          transition: transform 140ms ease, border-color 140ms ease, background-color 140ms ease;
        }
        .lm-home {
          min-height: 44px;
          min-width: 86px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 8px 14px;
        }
        .lm-home:hover,
        .lm-button:hover,
        .lm-option:hover {
          border-color: #245caa;
          transform: translateY(-1px);
        }
        .lm-title-wrap { min-width: 0; text-align: center; }
        .lm-kicker {
          margin: 0 0 2px;
          color: #245caa;
          font-size: 0.72rem;
          font-weight: 950;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .lm-title {
          margin: 0;
          color: #1f2937;
          font-size: clamp(1.25rem, 3.2vw, 2rem);
          font-weight: 950;
          line-height: 1.05;
        }
        .lm-logo {
          width: clamp(56px, 10vw, 94px);
          height: auto;
          border-radius: 4px;
          display: block;

        }
        .lm-main {
          width: min(1160px, 100%);
          margin: 0 auto;
          padding: clamp(14px, 3vw, 28px);
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(290px, 350px);
          gap: 18px;
          align-items: start;
        }
        .lm-board,
        .lm-panel {
          border: 2px solid #dde4ee;
          border-radius: 4px;
          background: #fff;

        }
        .lm-board {
          min-height: 660px;
          padding: clamp(16px, 3vw, 28px);
          display: grid;
          gap: 18px;
          align-content: start;
        }
        .lm-problem {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 12px;
        }
        .lm-number {
          min-height: 110px;
          border: 3px solid #20242d;
          border-radius: 4px;
          background: #fff;
          display: grid;
          place-items: center;
          color: #111827;
          font-size: clamp(3rem, 10vw, 6rem);
          font-weight: 950;
          box-shadow: 0 12px 0 #20242d;
          font-variant-numeric: tabular-nums;
        }
        .lm-and {
          color: #245caa;
          font-size: clamp(2rem, 6vw, 4rem);
          font-weight: 950;
        }
        .lm-ladder-wrap {
          display: grid;
          justify-content: center;
          overflow-x: auto;
          padding: 14px 0;
        }
        .lm-ladder {
          min-width: min(100%, 460px);
          display: grid;
          grid-template-columns: 90px 1fr 1fr;
          gap: 0;
          font-size: clamp(1.35rem, 4vw, 2.3rem);
          font-weight: 950;
          color: #111827;
          font-variant-numeric: tabular-nums;
        }
        .lm-cell {
          min-height: 64px;
          display: grid;
          place-items: center;
          border-bottom: 3px solid #20242d;
          background: rgba(255,255,255,0.75);
        }
        .lm-divisor {
          border-right: 3px solid #20242d;
          color: #245caa;
        }
        .lm-empty {
          border-right: 3px solid transparent;
        }
        .lm-bottom {
          background: #eff6ff;
        }
        .lm-feedback {
          min-height: 58px;
          border: 2px solid #d6deea;
          border-radius: 4px;
          background: #f8fafc;
          color: #334155;
          display: grid;
          align-items: center;
          padding: 12px 14px;
          font-weight: 850;
          line-height: 1.35;
        }
        .lm-work {
          display: grid;
          gap: 12px;
          border: 2px solid #dde4ee;
          border-radius: 4px;
          background: #fff;
          padding: 16px;
        }
        .lm-work-title,
        .lm-panel-title {
          margin: 0;
          color: #64748b;
          font-size: 0.74rem;
          font-weight: 950;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .lm-division-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .lm-input-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          align-items: center;
        }
        .lm-input {
          min-width: 0;
          min-height: 54px;
          border: 2px solid #cbd5e1;
          border-radius: 4px;
          background: #f8fafc;
          color: #111827;
          padding: 0 12px;
          font-size: 1.35rem;
          font-weight: 950;
          text-align: center;
          font-variant-numeric: tabular-nums;
        }
        .lm-input:focus {
          border-color: #245caa;
          outline: 4px solid rgba(36, 92, 170, 0.16);
        }
        .lm-divide-label {
          color: #475569;
          font-size: 1.1rem;
          font-weight: 950;
          white-space: nowrap;
        }
        .lm-button {
          min-height: 52px;
          padding: 8px 12px;
        }
        .lm-button.primary {
          background: #245caa;
          border-color: #245caa;
          color: #fff;
        }
        .lm-panel {
          padding: 16px;
          display: grid;
          gap: 12px;
        }
        .lm-side-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .lm-factor-line {
          min-height: 48px;
          border: 2px solid #e2e8f0;
          border-radius: 4px;
          background: #f8fafc;
          display: grid;
          align-items: center;
          padding: 10px 12px;
          color: #334155;
          font-weight: 900;
          overflow-wrap: anywhere;
        }
        .lm-results {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .lm-result-card {
          min-height: 96px;
          border: 2px solid #d6deea;
          border-radius: 4px;
          background: #f8fafc;
          display: grid;
          place-items: center;
          gap: 4px;
          padding: 10px;
        }
        .lm-result-number {
          color: #111827;
          font-size: 2rem;
          line-height: 1;
          font-weight: 950;
        }
        .lm-result-label {
          color: #64748b;
          font-size: 0.74rem;
          font-weight: 950;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .lm-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 30;
          background: rgba(15, 23, 42, 0.36);
          display: grid;
          place-items: center;
          padding: 16px;
        }
        .lm-modal {
          width: min(100%, 480px);
          border: 3px solid #20242d;
          border-radius: 4px;
          background: #fff;
          box-shadow: 0 18px 0 #20242d, 0 30px 70px rgba(15, 23, 42, 0.3);
          padding: clamp(18px, 4vw, 28px);
          display: grid;
          gap: 16px;
        }
        .lm-modal-title {
          margin: 0;
          color: #111827;
          font-size: 1.55rem;
          line-height: 1.1;
          font-weight: 950;
          text-align: center;
        }
        .lm-options {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }
        .lm-option {
          min-height: 66px;
          font-size: 1.55rem;
          color: #111827;
        }
        .lm-modal-feedback {
          min-height: 56px;
          border: 2px solid #fed7aa;
          border-radius: 4px;
          background: #fff7ed;
          color: #9a3412;
          display: grid;
          align-items: center;
          padding: 10px 12px;
          font-weight: 850;
          line-height: 1.35;
        }

        @media (max-width: 900px) {
          .lm-main { grid-template-columns: 1fr; }
        }
        @media (max-width: 620px) {
          .lm-top { grid-template-columns: auto minmax(0, 1fr); }
          .lm-logo { display: none; }
          .lm-title-wrap { text-align: left; }
          .lm-main { padding: 12px; }
          .lm-problem,
          .lm-division-grid,
          .lm-results,
          .lm-side-actions { grid-template-columns: 1fr; }
          .lm-and { display: none; }
          .lm-ladder { grid-template-columns: 64px 1fr 1fr; }
          .lm-options { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
      `}</style>

      <header className="lm-top">
        <Link className="lm-home" href="/">
          Home
        </Link>
        <div className="lm-title-wrap">
          <p className="lm-kicker">GCF and LCM</p>
          <h1 className="lm-title">Ladder Method</h1>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="lm-logo" src="/big-dog-logo.png" alt="Big Dog Math" />
      </header>

      <div className="lm-main">
        <section className="lm-board">
          <div className="lm-problem">
            <div className="lm-number">{problem[0]}</div>
            <div className="lm-and">&</div>
            <div className="lm-number">{problem[1]}</div>
          </div>

          <div className="lm-ladder-wrap">
            <div className="lm-ladder" aria-label="Ladder model">
              <div className="lm-cell lm-empty" />
              <div className="lm-cell">{problem[0]}</div>
              <div className="lm-cell">{problem[1]}</div>
              {steps.map((step, index) => (
                <div style={{ display: "contents" }} key={`${step.divisor}-${index}`}>
                  <div className="lm-cell lm-divisor">{step.divisor}</div>
                  <div className={`lm-cell${index === steps.length - 1 ? " lm-bottom" : ""}`}>{step.left}</div>
                  <div className={`lm-cell${index === steps.length - 1 ? " lm-bottom" : ""}`}>{step.right}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lm-feedback">{feedback}</div>

          {phase === "divide" && pendingDivisor !== null && (
            <form className="lm-work" onSubmit={submitQuotients}>
              <p className="lm-work-title">Divide by {pendingDivisor}</p>
              <div className="lm-division-grid">
                <label className="lm-input-row">
                  <span className="lm-divide-label">{currentPair[0]} ÷ {pendingDivisor}</span>
                  <input className="lm-input" value={leftQuotient} inputMode="numeric" onChange={(event) => setLeftQuotient(event.target.value.replace(/\D/g, ""))} />
                </label>
                <label className="lm-input-row">
                  <span className="lm-divide-label">{currentPair[1]} ÷ {pendingDivisor}</span>
                  <input className="lm-input" value={rightQuotient} inputMode="numeric" onChange={(event) => setRightQuotient(event.target.value.replace(/\D/g, ""))} />
                </label>
              </div>
              <button className="lm-button primary" type="submit">Add Row</button>
            </form>
          )}

          {phase === "gcf" && (
            <form className="lm-work" onSubmit={submitGcf}>
              <p className="lm-work-title">Left ladder product</p>
              <label className="lm-input-row">
                <span className="lm-divide-label">{ladderDivisors.join(" x ")}</span>
                <input className="lm-input" value={gcfInput} inputMode="numeric" onChange={(event) => setGcfInput(event.target.value.replace(/\D/g, ""))} />
              </label>
              <button className="lm-button primary" type="submit">Check GCF</button>
            </form>
          )}

          {phase === "lcm" && (
            <form className="lm-work" onSubmit={submitLcm}>
              <p className="lm-work-title">L shape product</p>
              <label className="lm-input-row">
                <span className="lm-divide-label">{[...ladderDivisors, bottomPair[0], bottomPair[1]].join(" x ")}</span>
                <input className="lm-input" value={lcmInput} inputMode="numeric" onChange={(event) => setLcmInput(event.target.value.replace(/\D/g, ""))} />
              </label>
              <button className="lm-button primary" type="submit">Check LCM</button>
            </form>
          )}

          {phase === "done" && (
            <div className="lm-results">
              <div className="lm-result-card">
                <span className="lm-result-number">{gcf}</span>
                <span className="lm-result-label">GCF</span>
              </div>
              <div className="lm-result-card">
                <span className="lm-result-number">{lcm}</span>
                <span className="lm-result-label">LCM</span>
              </div>
            </div>
          )}
        </section>

        <aside className="lm-panel">
          <p className="lm-panel-title">Products</p>
          <div className="lm-factor-line">Left ladder: {ladderDivisors.length ? ladderDivisors.join(" x ") : "..."}</div>
          <div className="lm-factor-line">Bottom row: {bottomPair[0]} and {bottomPair[1]}</div>
          <div className="lm-factor-line">L shape: {[...ladderDivisors, bottomPair[0], bottomPair[1]].join(" x ")}</div>
          <div className="lm-side-actions">
            <button className="lm-button primary" onClick={() => setPickerOpen(true)} disabled={phase !== "choose"}>
              Divisor
            </button>
            <button className="lm-button" onClick={newProblem}>
              New
            </button>
          </div>
        </aside>
      </div>

      {pickerOpen && phase === "choose" && (
        <div className="lm-modal-backdrop" role="dialog" aria-modal="true" aria-label="Choose a common divisor">
          <div className="lm-modal">
            <h2 className="lm-modal-title">{currentPair[0]} and {currentPair[1]}</h2>
            <div className="lm-options">
              {DIVISOR_OPTIONS.map((divisor) => (
                <button className="lm-option" key={divisor} onClick={() => chooseDivisor(divisor)}>
                  {divisor}
                </button>
              ))}
            </div>
            <div className="lm-modal-feedback">
              {divisorsLeft.length ? feedback : "No common divisor is left."}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
