"use client";

import { Fragment, useState } from "react";
import type { FormEvent } from "react";

type Step = { divisor: number; left: number; right: number };
type Phase = "divide" | "gcf" | "lcm" | "done";

const PROBLEMS: [number, number][] = [
  [24, 36], [28, 42], [36, 90], [40, 60], [45, 75], [48, 64],
  [54, 72], [56, 98], [63, 84], [70, 90], [72, 120], [84, 126],
];

function gcdOf(a: number, b: number) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}
function product(values: number[]) {
  return values.reduce((t, v) => t * v, 1);
}
function pickProblem(current?: [number, number]): [number, number] {
  const pool = PROBLEMS.filter(([a, b]) => !current || a !== current[0] || b !== current[1]);
  return pool[Math.floor(Math.random() * pool.length)];
}

const START_MSG = "Type a number that divides BOTH numbers, then press Divide.";
const DIVISIBILITY_RULES = [
  ["2", "last digit is even"],
  ["3", "digits add to a multiple of 3"],
  ["4", "last two digits divide by 4"],
  ["5", "ends in 0 or 5"],
  ["6", "divides by 2 and 3"],
  ["7", "double the last digit, subtract it from the rest"],
] as const;

export default function LadderMethodTool() {
  const [problem, setProblem] = useState<[number, number]>(() => PROBLEMS[0]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [phase, setPhase] = useState<Phase>("divide");
  const [divisorDraft, setDivisorDraft] = useState("");
  const [feedback, setFeedback] = useState(START_MSG);

  // GCF guided multiply
  const [gcfRunning, setGcfRunning] = useState(0);
  const [gcfIdx, setGcfIdx] = useState(1);
  const [gcfDraft, setGcfDraft] = useState("");
  // LCM guided multiply
  const [lcmRunning, setLcmRunning] = useState(0);
  const [lcmIdx, setLcmIdx] = useState(1);
  const [lcmDraft, setLcmDraft] = useState("");

  const divisors = steps.map((s) => s.divisor);
  const bottom: [number, number] = steps.length
    ? [steps[steps.length - 1].left, steps[steps.length - 1].right]
    : problem;
  const gcf = product(divisors);
  const lcmFactors = [gcf, bottom[0], bottom[1]];
  const rows: [number, number][] = [problem, ...steps.map((s) => [s.left, s.right] as [number, number])];

  const gcfComplete = phase !== "divide" && gcfIdx >= divisors.length;

  function resetAll(next: [number, number]) {
    setProblem(next);
    setSteps([]);
    setPhase("divide");
    setDivisorDraft("");
    setGcfRunning(0);
    setGcfIdx(1);
    setGcfDraft("");
    setLcmRunning(0);
    setLcmIdx(1);
    setLcmDraft("");
    setFeedback(START_MSG);
  }

  function submitDivisor(event: FormEvent) {
    event.preventDefault();
    const d = Number(divisorDraft);
    if (!d || d < 2) {
      setFeedback("Enter a whole number 2 or greater.");
      return;
    }
    const [l, r] = bottom;
    if (l % d !== 0 || r % d !== 0) {
      const lr = l % d;
      const rr = r % d;
      setFeedback(
        `${d} doesn't divide both — ${l} ÷ ${d} ${lr ? `leaves ${lr}` : "is whole"}, ${r} ÷ ${d} ${rr ? `leaves ${rr}` : "is whole"}.`,
      );
      return;
    }

    const nl = l / d;
    const nr = r / d;
    const next = [...steps, { divisor: d, left: nl, right: nr }];
    setSteps(next);
    setDivisorDraft("");

    if (gcdOf(nl, nr) === 1) {
      const ds = next.map((s) => s.divisor);
      setGcfRunning(ds[0]);
      setGcfIdx(1);
      setPhase("gcf");
      setFeedback(
        ds.length === 1
          ? `Prime! Just one divisor, so the GCF is ${ds[0]}.`
          : "Both prime! Multiply the divisors down the left to get the GCF.",
      );
    } else {
      setFeedback(`Nice — ${l} ÷ ${d} = ${nl} and ${r} ÷ ${d} = ${nr}. They still share a factor — keep going.`);
    }
  }

  function submitGcf(event: FormEvent) {
    event.preventDefault();
    const factor = divisors[gcfIdx];
    const expected = gcfRunning * factor;
    if (Number(gcfDraft) !== expected) {
      setFeedback(`${gcfRunning} × ${factor} = ${expected}.`);
      return;
    }
    const ni = gcfIdx + 1;
    setGcfRunning(expected);
    setGcfIdx(ni);
    setGcfDraft("");
    setFeedback(ni >= divisors.length ? `GCF = ${expected}. Now build the LCM.` : "Keep multiplying the next divisor.");
  }

  function startLcm() {
    setPhase("lcm");
    setLcmRunning(gcf);
    setLcmIdx(1);
    setLcmDraft("");
    setFeedback("The LCM starts with the GCF. Multiply it by each bottom number.");
  }

  function submitLcm(event: FormEvent) {
    event.preventDefault();
    const factor = lcmFactors[lcmIdx];
    const expected = lcmRunning * factor;
    if (Number(lcmDraft) !== expected) {
      setFeedback(`${lcmRunning} × ${factor} = ${expected}.`);
      return;
    }
    const ni = lcmIdx + 1;
    setLcmRunning(expected);
    setLcmIdx(ni);
    setLcmDraft("");
    if (ni >= lcmFactors.length) {
      setPhase("done");
      setFeedback(`GCF ${gcf} • LCM ${expected}. Nice work!`);
    } else {
      setFeedback("One more — multiply by the other bottom number.");
    }
  }

  const flick = phase !== "divide";

  return (
    <main className="lad-wrap">
      <style>{`
        .lad-wrap {
          font-family: var(--bdb-font);
          color: var(--bdb-ink);
          background: var(--bdb-ground);
          min-height: 100%;
          padding: clamp(14px, 3vw, 30px);
          width: min(820px, 100%);
          margin: 0 auto;
          display: grid;
          gap: 16px;
        }
        .lad-kicker {
          margin: 0; text-align: center;
          font-size: 0.74rem; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--bdb-ink-faint);
        }
        .lad-feedback {
          min-height: 50px;
          border: 1px solid var(--bdb-line);
          border-radius: var(--bdb-r);
          background: var(--bdb-card);
          color: var(--bdb-ink-soft);
          display: grid; align-items: center;
          padding: 12px 16px;
          font-weight: 600; line-height: 1.35;
          text-align: center;
        }
        .lad-rules {
          border: 2px solid color-mix(in srgb, var(--bdb-teal) 42%, var(--bdb-line));
          border-radius: var(--bdb-r);
          background: color-mix(in srgb, var(--bdb-teal) 9%, var(--bdb-card));
          padding: 12px;
          display: grid;
          gap: 8px;
        }
        .lad-rules-title {
          margin: 0;
          color: var(--bdb-teal);
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          text-align: center;
        }
        .lad-rule-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .lad-rule {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 8px;
          align-items: center;
          border: 1px solid color-mix(in srgb, var(--bdb-teal) 28%, var(--bdb-line));
          border-radius: 10px;
          background: #fff;
          padding: 8px;
        }
        .lad-rule-num {
          display: grid;
          width: 34px;
          height: 34px;
          place-items: center;
          border-radius: 8px;
          background: var(--bdb-teal);
          color: #fff;
          font-size: 1.15rem;
          font-weight: 900;
        }
        .lad-rule-text {
          color: var(--bdb-ink-soft);
          font-size: 0.82rem;
          font-weight: 750;
          line-height: 1.25;
        }
        .lad-stack { display: grid; gap: 4px; justify-items: stretch; }
        .lad-row, .lad-band, .lad-entry {
          display: grid;
          grid-template-columns: 110px 1fr 1fr;
          gap: 10px;
          align-items: center;
        }
        .lad-row { animation: ladPop 240ms ease; }
        @keyframes ladPop { from { opacity: 0; transform: translateY(-8px) scale(.96); } to { opacity: 1; transform: none; } }
        .lad-num {
          min-height: 78px;
          border: 2px solid var(--bdb-ink);
          border-radius: var(--bdb-r);
          background: var(--bdb-card);
          display: grid; place-items: center;
          font-weight: 800; font-variant-numeric: tabular-nums;
          font-size: clamp(2rem, 7vw, 3.4rem);
          box-shadow: 0 4px 0 var(--bdb-ink);
        }
        .lad-row.big .lad-num {
          min-height: 104px;
          font-size: clamp(2.6rem, 10vw, 5rem);
        }
        .lad-row.bottomrow .lad-num { border-color: var(--bdb-teal); box-shadow: 0 4px 0 var(--bdb-teal); }
        .lad-side { display: grid; place-items: center; }
        .lad-divisor {
          min-height: 56px; align-self: center;
          border: 2px solid var(--bdb-amber);
          border-radius: var(--bdb-r);
          background: color-mix(in srgb, var(--bdb-amber) 18%, var(--bdb-card));
          color: var(--bdb-brown);
          font-weight: 800; font-size: clamp(1.3rem, 4vw, 2rem);
          display: inline-flex; align-items: center; gap: 4px;
          padding: 6px 14px;
          font-variant-numeric: tabular-nums;
        }
        .lad-dx { color: var(--bdb-ink-faint); font-weight: 800; }
        .flick { animation: ladFlick 1.05s ease-in-out infinite; }
        @keyframes ladFlick {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 3px color-mix(in srgb, var(--bdb-amber) 45%, transparent); }
          50% { opacity: 0.55; box-shadow: 0 0 0 3px transparent; }
        }
        .lad-arrow {
          display: grid; place-items: center;
          color: var(--bdb-ink-faint);
          font-size: 1.5rem; font-weight: 800;
          animation: ladPop 240ms ease;
        }
        .lad-input-wrap {
          display: inline-flex; align-items: center; gap: 6px;
          border: 2px dashed var(--bdb-amber);
          border-radius: var(--bdb-r);
          background: var(--bdb-card);
          padding: 6px 10px;
        }
        .lad-input {
          width: 64px; min-height: 46px;
          border: none; outline: none; background: transparent;
          font-family: inherit; font-weight: 800; text-align: center;
          font-size: clamp(1.4rem, 5vw, 2.1rem);
          color: var(--bdb-ink); font-variant-numeric: tabular-nums;
        }
        .lad-go {
          grid-column: 2 / span 2;
          min-height: 56px;
          border: none; border-radius: var(--bdb-r);
          background: var(--bdb-coral); color: #fff;
          font-family: inherit; font-weight: 800; font-size: 1.05rem;
          cursor: pointer; letter-spacing: 0.01em;
          transition: filter 120ms;
        }
        .lad-go:hover { filter: brightness(1.05); }
        .lad-card {
          border: 1px solid var(--bdb-line);
          border-radius: var(--bdb-r-lg);
          background: var(--bdb-card);
          padding: clamp(14px, 3vw, 22px);
          display: grid; gap: 12px;
        }
        .lad-h { margin: 0; font-size: 1.05rem; font-weight: 800; color: var(--bdb-ink); }
        .lad-h .tag {
          font-size: 0.7rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase;
          padding: 3px 9px; border-radius: 999px; margin-left: 8px; vertical-align: middle;
        }
        .tag.gcf { background: color-mix(in srgb, var(--bdb-amber) 22%, transparent); color: var(--bdb-brown); }
        .tag.lcm { background: color-mix(in srgb, var(--bdb-teal) 20%, transparent); color: var(--bdb-teal); }
        .lad-chain { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-weight: 800; font-size: 1.2rem; }
        .lad-chip {
          min-width: 44px; padding: 6px 12px; border-radius: 10px;
          background: color-mix(in srgb, var(--bdb-amber) 16%, var(--bdb-ground));
          border: 1px solid var(--bdb-line); text-align: center;
          font-variant-numeric: tabular-nums;
        }
        .lad-chip.bottomf { background: color-mix(in srgb, var(--bdb-teal) 16%, var(--bdb-ground)); }
        .lad-times { color: var(--bdb-ink-faint); }
        .lad-mult { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; font-weight: 800; font-size: 1.2rem; }
        .lad-mult input {
          width: 96px; min-height: 50px;
          border: 2px solid var(--bdb-line); border-radius: 10px;
          background: var(--bdb-ground); text-align: center;
          font-family: inherit; font-weight: 800; font-size: 1.3rem;
          color: var(--bdb-ink); font-variant-numeric: tabular-nums;
        }
        .lad-mult input:focus { outline: none; border-color: var(--bdb-teal); }
        .lad-check {
          min-height: 50px; padding: 0 18px;
          border: none; border-radius: 10px;
          background: var(--bdb-ink); color: #fff;
          font-family: inherit; font-weight: 800; cursor: pointer;
        }
        .lad-answer { font-weight: 800; font-size: 1.35rem; color: var(--bdb-green); }
        .lad-results { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .lad-result {
          border-radius: var(--bdb-r-lg); padding: 18px; display: grid; place-items: center; gap: 4px;
        }
        .lad-result.gcf { background: color-mix(in srgb, var(--bdb-amber) 22%, var(--bdb-card)); }
        .lad-result.lcm { background: color-mix(in srgb, var(--bdb-teal) 18%, var(--bdb-card)); }
        .lad-result b { font-size: 2.4rem; font-weight: 800; font-variant-numeric: tabular-nums; color: var(--bdb-ink); }
        .lad-result span { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: var(--bdb-ink-soft); }
        .lad-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
        .lad-btn {
          min-height: 48px; padding: 0 20px;
          border: 1px solid var(--bdb-line); border-radius: 999px;
          background: var(--bdb-card); color: var(--bdb-ink);
          font-family: inherit; font-weight: 700; cursor: pointer;
        }
        .lad-btn.primary { background: var(--bdb-teal); border-color: var(--bdb-teal); color: #fff; }
        .lad-btn:hover { filter: brightness(1.03); }
        @media (max-width: 560px) {
          .lad-row, .lad-band, .lad-entry { grid-template-columns: 76px 1fr 1fr; gap: 8px; }
          .lad-results { grid-template-columns: 1fr; }
          .lad-rule-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <p className="lad-kicker">GCF &amp; LCM · Ladder Method</p>

      <div className="lad-stack">
        {rows.map((pair, i) => {
          const isBottom = phase !== "divide" && i === rows.length - 1;
          return (
            <Fragment key={i}>
              <div className={`lad-row${i === 0 ? " big" : ""}${isBottom ? " bottomrow" : ""}`}>
                <div className="lad-side" />
                <div className="lad-num">{pair[0]}</div>
                <div className="lad-num">{pair[1]}</div>
              </div>
              {i < steps.length && (
                <div className="lad-band">
                  <div className={`lad-side`}>
                    <span className={`lad-divisor${flick ? " flick" : ""}`}>
                      <span className="lad-dx">÷</span>
                      {steps[i].divisor}
                    </span>
                  </div>
                  <div className="lad-arrow">↓</div>
                  <div className="lad-arrow">↓</div>
                </div>
              )}
            </Fragment>
          );
        })}

        {phase === "divide" && (
          <form className="lad-entry" onSubmit={submitDivisor}>
            <div className="lad-side">
              <span className="lad-input-wrap">
                <span className="lad-dx">÷</span>
                <input
                  className="lad-input"
                  inputMode="numeric"
                  value={divisorDraft}
                  onChange={(e) => setDivisorDraft(e.target.value.replace(/\D/g, ""))}
                  aria-label="Divisor that divides both numbers"
                  autoFocus
                />
              </span>
            </div>
            <button className="lad-go" type="submit">Divide ↓</button>
          </form>
        )}
      </div>

      <div className="lad-feedback">{feedback}</div>
      <section className="lad-rules" aria-label="Divisibility rules reminder">
        <p className="lad-rules-title">Divisibility Rules</p>
        <div className="lad-rule-grid">
          {DIVISIBILITY_RULES.map(([number, rule]) => (
            <div className="lad-rule" key={number}>
              <span className="lad-rule-num">{number}</span>
              <span className="lad-rule-text">{rule}</span>
            </div>
          ))}
        </div>
      </section>

      {(phase === "gcf" || phase === "lcm" || phase === "done") && (
        <div className="lad-card">
          <p className="lad-h">Greatest Common Factor<span className="tag gcf">GCF</span></p>
          <div className="lad-chain">
            {divisors.map((d, i) => (
              <Fragment key={i}>
                {i > 0 && <span className="lad-times">×</span>}
                <span className="lad-chip">{d}</span>
              </Fragment>
            ))}
          </div>
          {!gcfComplete ? (
            <form className="lad-mult" onSubmit={submitGcf}>
              <span>{gcfRunning} × {divisors[gcfIdx]} =</span>
              <input
                inputMode="numeric"
                value={gcfDraft}
                onChange={(e) => setGcfDraft(e.target.value.replace(/\D/g, ""))}
                aria-label="Product so far"
                autoFocus
              />
              <button className="lad-check" type="submit">Check</button>
            </form>
          ) : (
            <div className="lad-answer">GCF = {gcf}</div>
          )}
          {phase === "gcf" && gcfComplete && (
            <div className="lad-actions">
              <button className="lad-btn primary" onClick={startLcm}>Build the LCM →</button>
            </div>
          )}
        </div>
      )}

      {(phase === "lcm" || phase === "done") && (
        <div className="lad-card">
          <p className="lad-h">Least Common Multiple<span className="tag lcm">LCM</span></p>
          <div className="lad-chain">
            <span className="lad-chip">{gcf}</span>
            <span className="lad-times">×</span>
            <span className="lad-chip bottomf">{bottom[0]}</span>
            <span className="lad-times">×</span>
            <span className="lad-chip bottomf">{bottom[1]}</span>
          </div>
          {phase === "lcm" ? (
            <form className="lad-mult" onSubmit={submitLcm}>
              <span>{lcmRunning} × {lcmFactors[lcmIdx]} =</span>
              <input
                inputMode="numeric"
                value={lcmDraft}
                onChange={(e) => setLcmDraft(e.target.value.replace(/\D/g, ""))}
                aria-label="LCM product so far"
                autoFocus
              />
              <button className="lad-check" type="submit">Check</button>
            </form>
          ) : (
            <div className="lad-answer">LCM = {lcmRunning}</div>
          )}
        </div>
      )}

      {phase === "done" && (
        <div className="lad-results">
          <div className="lad-result gcf">
            <b>{gcf}</b>
            <span>GCF</span>
          </div>
          <div className="lad-result lcm">
            <b>{lcmRunning}</b>
            <span>LCM</span>
          </div>
        </div>
      )}

      <div className="lad-actions">
        <button className="lad-btn" onClick={() => resetAll(problem)}>Start over</button>
        <button className="lad-btn" onClick={() => resetAll(pickProblem(problem))}>New numbers</button>
      </div>
    </main>
  );
}
