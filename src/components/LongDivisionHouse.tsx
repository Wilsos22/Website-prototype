"use client";

// Long Division by place value (partial quotients) — M1.T3.L4 "Dividend in the
// House" (6.NS.3), whole numbers only. Instead of the digit-shuffling standard
// algorithm, this keeps place value honest: "how many 6s fit in 738? about 100"
// -> subtract 600 -> "how many in 138? 20" -> subtract 120 -> "how many in 18?
// 3". The partial quotients (100, 20, 3) stack by place value and collapse into
// the quotient 123 — so students see WHY the 1 sits over the hundreds. Bridges
// the partial-quotient / area-model methods they already know to the standard
// quotient. Optional-support: no scoring.

import { useMemo, useState } from "react";

const C_TEAL = "#50a3a4";
const C_CORAL = "#f95335";
const C_GREEN = "#2f9e6f";

const PROBLEMS = [
  { dividend: 738, divisor: 6 },
  { dividend: 84, divisor: 4 },
  { dividend: 875, divisor: 5 },
  { dividend: 618, divisor: 6 }, // quotient has a zero (103)
  { dividend: 952, divisor: 7 },
];

interface Round { partial: number; product: number; before: number; after: number; place: string }
function placeWord(n: number): string {
  if (n >= 1000) return "thousands";
  if (n >= 100) return "hundreds";
  if (n >= 10) return "tens";
  return "ones";
}
function buildRounds(dividend: number, divisor: number): { rounds: Round[]; quotient: number } {
  const rounds: Round[] = [];
  let r = dividend;
  while (r >= divisor) {
    const q = Math.floor(r / divisor);
    const place = Math.pow(10, String(q).length - 1);
    const partial = Math.floor(q / place) * place;
    const product = divisor * partial;
    rounds.push({ partial, product, before: r, after: r - product, place: placeWord(partial) });
    r -= product;
  }
  return { rounds, quotient: Math.floor(dividend / divisor) };
}

export default function LongDivision() {
  const [pIdx, setPIdx] = useState(0);
  const [beat, setBeat] = useState(-1); // -1 start; 2r=estimate, 2r+1=subtract; 2*rounds=collapse

  const problem = PROBLEMS[pIdx];
  const { rounds, quotient } = useMemo(() => buildRounds(problem.dividend, problem.divisor), [problem.dividend, problem.divisor]);
  const lastBeat = rounds.length * 2;
  const collapsed = beat >= lastBeat;
  const partials = rounds.map((r) => r.partial);

  function next() { setBeat((b) => Math.min(b + 1, lastBeat)); }
  function load(i: number) { setPIdx(i); setBeat(-1); }

  const estimateShown = (r: number) => beat >= 2 * r;
  const subtractShown = (r: number) => beat >= 2 * r + 1;
  // the round whose estimate is the newest reveal (for the caption + highlight)
  const activeRound = beat < 0 ? -1 : Math.min(Math.floor(beat / 2), rounds.length - 1);
  const activeSub = beat >= 0 && beat % 2 === 1;

  // caption
  let caption = `Start: how many ${problem.divisor}s fit into the whole number?`;
  if (beat >= 0 && !collapsed) {
    const R = rounds[activeRound];
    caption = activeSub
      ? `Subtract ${R.product}: ${R.before} − ${R.product} = ${R.after}.${R.after === 0 ? " Nothing left." : ""}`
      : `How many ${problem.divisor}s fit in ${R.before}? Think ${R.place}: ${R.partial} (${problem.divisor} × ${R.partial} = ${R.product}).`;
  } else if (collapsed) {
    caption = `Add the groups by place value: ${partials.join(" + ")} = ${quotient}.`;
  }

  return (
    <div className="pq-wrap">
      <style>{`
        .pq-wrap { font-family:var(--bdb-font); color:var(--bdb-ink); max-width:760px; margin:0 auto; padding:16px clamp(10px,3vw,20px) 34px; }
        .pq-prompt { text-align:center; font-size:clamp(1.3rem,4vw,1.8rem); font-weight:900; margin:2px 0 4px; }
        .pq-cap { text-align:center; color:var(--bdb-ink); font-weight:700; font-size:clamp(1rem,3vw,1.2rem); line-height:1.5; margin:0 auto 16px; max-width:560px; min-height:52px; }
        .pq-main { display:flex; gap:clamp(18px,6vw,64px); justify-content:center; align-items:flex-start; }
        .pq-col { display:flex; flex-direction:column; align-items:flex-end; font-variant-numeric:tabular-nums; }
        .pq-collbl { font-size:0.72rem; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; color:var(--bdb-ink-faint); margin-bottom:6px; align-self:center; }
        .pq-big { font-size:clamp(1.8rem,6vw,2.6rem); font-weight:900; line-height:1.15; padding:1px 6px; }
        .pq-big.now { color:var(--bdb-ink); background:color-mix(in srgb, ${C_TEAL} 18%, transparent); border-radius:8px; }
        .pq-big.zero { color:${C_GREEN}; }
        .pq-op { display:flex; align-items:baseline; gap:8px; }
        .pq-op .minus { font-size:clamp(1.5rem,5vw,2.2rem); font-weight:900; color:${C_CORAL}; }
        .pq-op .note { font-size:0.8rem; font-weight:700; color:var(--bdb-ink-faint); align-self:center; }
        .pq-rule { height:3px; background:var(--bdb-ink); width:100%; margin:3px 0; }
        .pq-appear { animation:pqIn .32s cubic-bezier(.34,.8,.3,1) backwards; }
        @keyframes pqIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:none; } }
        .pq-chip { font-size:clamp(1.6rem,5vw,2.3rem); font-weight:900; color:${C_TEAL}; padding:1px 6px; }
        .pq-sumrule { height:3px; background:${C_TEAL}; width:100%; margin:4px 0; }
        .pq-quotient { font-size:clamp(2rem,7vw,3rem); font-weight:900; color:${C_GREEN}; }
        .pq-collapse { animation:pqPop .4s cubic-bezier(.34,.8,.3,1) backwards; }
        @keyframes pqPop { from { opacity:0; transform:scale(.7); } to { opacity:1; transform:none; } }
        .pq-done { text-align:center; font-weight:900; font-size:clamp(1.3rem,4vw,1.7rem); color:${C_GREEN}; margin-top:14px; min-height:28px; }
        .pq-bar { display:flex; gap:10px; justify-content:center; align-items:center; margin-top:18px; flex-wrap:wrap; }
        .pq-btn { font:inherit; font-weight:800; font-size:0.98rem; min-height:48px; padding:0 24px; border-radius:13px; border:2px solid var(--bdb-ink); background:var(--bdb-ink); color:#fff; cursor:pointer; }
        .pq-btn.ghost { background:var(--bdb-card); color:var(--bdb-ink); }
        .pq-probs { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-top:12px; }
        .pq-pill { font:inherit; font-weight:800; font-size:0.88rem; min-height:42px; padding:0 14px; border-radius:999px; border:1px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink-soft); cursor:pointer; }
        .pq-pill.on { background:var(--bdb-ink); color:#fff; border-color:var(--bdb-ink); }
        @media (prefers-reduced-motion: reduce) { .pq-appear,.pq-collapse { animation:none; } }
      `}</style>

      <div className="pq-prompt">{problem.dividend} ÷ {problem.divisor}</div>
      <div className="pq-cap">{caption}</div>

      <div className="pq-main">
        {/* the running subtraction (what's left) */}
        <div className="pq-col">
          <div className="pq-collbl">what's left</div>
          <div className={`pq-big ${beat >= 0 && activeRound === 0 && !collapsed ? "now" : ""}`}>{problem.dividend}</div>
          {rounds.map((r, i) => (
            <div key={i} style={{ display: "contents" }}>
              {subtractShown(i) && (
                <>
                  <div className="pq-op pq-appear">
                    <span className="minus">−</span>
                    <span className="pq-big" style={{ color: C_CORAL, fontSize: "clamp(1.5rem,5vw,2.2rem)" }}>{r.product}</span>
                    <span className="note">{problem.divisor} × {r.partial}</span>
                  </div>
                  <div className="pq-rule pq-appear" />
                  <div className={`pq-big pq-appear ${r.after === 0 ? "zero" : ""} ${!collapsed && activeRound === i + 1 ? "now" : ""}`}>{r.after}</div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* the partial-quotient stack, collapsing into the quotient */}
        <div className="pq-col">
          <div className="pq-collbl">groups of {problem.divisor}</div>
          {rounds.map((r, i) => (
            estimateShown(i) ? <div key={i} className="pq-chip pq-appear">{r.partial}</div> : null
          ))}
          {collapsed && (
            <>
              <div className="pq-sumrule pq-collapse" />
              <div className="pq-quotient pq-collapse">{quotient}</div>
            </>
          )}
        </div>
      </div>

      <div className="pq-done">{collapsed ? `${problem.dividend} ÷ ${problem.divisor} = ${quotient}` : ""}</div>

      <div className="pq-bar">
        {!collapsed ? (
          <button className="pq-btn" onClick={next}>{beat < 0 ? "Start" : beat + 1 === lastBeat ? "Collapse to the answer" : "Next step"}</button>
        ) : (
          <button className="pq-btn" onClick={() => setBeat(-1)}>Replay</button>
        )}
        {pIdx + 1 < PROBLEMS.length && (
          <button className="pq-btn ghost" onClick={() => load(pIdx + 1)}>Next problem</button>
        )}
      </div>

      <div className="pq-probs">
        {PROBLEMS.map((p, i) => (
          <button key={i} className={`pq-pill ${i === pIdx ? "on" : ""}`} onClick={() => load(i)}>{p.dividend} ÷ {p.divisor}</button>
        ))}
      </div>
    </div>
  );
}
