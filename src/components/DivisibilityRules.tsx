"use client";

// Divisibility Rules — M1.T1.L2-D1 "Factors and Multiples Foundations"
// (6.NS.4). The digital twin of the lesson's concrete divisor-hoop sort +
// 1-10 rule bank + evidence strip: a number is tested against each divisor in
// turn. The rule APPLIES to the number with visible digit evidence (last
// digit, last two/three digits, digit sum), the student decides yes/no, and
// the divisor settles into a green "divides evenly" zone or a red "not a
// factor" zone. Rule 6 reads back the 2 and 3 results (the lesson's
// error-analysis centerpiece: 6 is not "ends in 6"). A finished number bridges
// to prime factorization via the Ladder Method.

import { ReactNode, useMemo, useState } from "react";

const C_GREEN = "#2f9e6f";
const C_CORAL = "#f95335";
const C_TEAL = "#50a3a4";
const C_AMBER = "#fcaf38";

const RULES: Record<number, string> = {
  2: "Last digit is even (0, 2, 4, 6, 8).",
  3: "The digit sum is divisible by 3.",
  4: "The last two digits make a number divisible by 4.",
  5: "Last digit is 0 or 5.",
  6: "Passes both the rule for 2 and the rule for 3.",
  8: "The last three digits make a number divisible by 8.",
  9: "The digit sum is divisible by 9.",
  10: "Last digit is 0.",
};

interface Level { label: string; order: number[]; nums: number[] }
const LEVELS: Level[] = [
  { label: "Two-digit", order: [2, 3, 4, 5, 6, 10], nums: [28, 45, 72, 42, 60, 90] },
  { label: "Three-digit (adds 8 & 9)", order: [2, 3, 4, 5, 6, 8, 9, 10], nums: [126, 405, 216, 342, 234, 720] },
];

const digitsOf = (n: number) => String(n).split("").map(Number);
const digitSum = (n: number) => digitsOf(n).reduce((a, b) => a + b, 0);
const isPrimeDivisor = (d: number) => d === 2 || d === 3 || d === 5 || d === 7;

interface Ev { correct: boolean; idx: Set<number>; mode: "digits" | "sum"; card: ReactNode; reason: string }

// Everything a divisor test needs: the real answer, which digits to highlight,
// the evidence shown on the card (before the student decides), and the
// rule-based reason used in wrong-answer feedback.
function evidence(N: number, d: number, prior: Record<number, boolean>): Ev {
  const digits = digitsOf(N);
  const last = digits.length - 1;
  const lastDigit = N % 10;
  const sum = digitSum(N);
  const correct = N % d === 0;
  const idxLast = (k: number) => new Set(digits.map((_, i) => i).filter((i) => i > last - k));
  const all = new Set(digits.map((_, i) => i));

  switch (d) {
    case 2:
      return { correct, idx: idxLast(1), mode: "digits",
        card: <>Last digit: <b>{lastDigit}</b></>,
        reason: `the last digit ${lastDigit} is ${lastDigit % 2 === 0 ? "even" : "odd"}` };
    case 5:
      return { correct, idx: idxLast(1), mode: "digits",
        card: <>Last digit: <b>{lastDigit}</b></>,
        reason: `the last digit is ${lastDigit}, ${correct ? "a 0 or 5" : "not 0 or 5"}` };
    case 10:
      return { correct, idx: idxLast(1), mode: "digits",
        card: <>Last digit: <b>{lastDigit}</b></>,
        reason: `the last digit is ${lastDigit}, ${correct ? "a 0" : "not 0"}` };
    case 4: {
      const t = N % 100;
      return { correct, idx: idxLast(2), mode: "digits",
        card: <>Last two digits: <b>{String(t).padStart(2, "0")}</b></>,
        reason: `${t} ${correct ? `= 4 × ${t / 4}` : `÷ 4 leaves ${t % 4}`}` };
    }
    case 8: {
      const t = N % 1000;
      return { correct, idx: idxLast(3), mode: "digits",
        card: <>Last three digits: <b>{String(t).padStart(3, "0")}</b></>,
        reason: `${t} ${correct ? `= 8 × ${t / 8}` : `÷ 8 leaves ${t % 8}`}` };
    }
    case 3:
      return { correct, idx: all, mode: "sum",
        card: <>Digit sum: <b>{digits.join(" + ")} = {sum}</b></>,
        reason: `the digit sum ${sum} ${correct ? "is" : "is not"} divisible by 3` };
    case 9:
      return { correct, idx: all, mode: "sum",
        card: <>Digit sum: <b>{digits.join(" + ")} = {sum}</b></>,
        reason: `the digit sum ${sum} ${correct ? "is" : "is not"} divisible by 9` };
    case 6: {
      const by2 = prior[2] ?? N % 2 === 0;
      const by3 = prior[3] ?? sum % 3 === 0;
      return { correct, idx: idxLast(1), mode: "digits",
        card: <>You found: divisible by 2 was <b>{by2 ? "yes" : "no"}</b>, divisible by 3 was <b>{by3 ? "yes" : "no"}</b>. Both?</>,
        reason: `6 needs BOTH — even (${by2 ? "yes" : "no"}) and digit sum divisible by 3 (${by3 ? "yes" : "no"})` };
    }
    default:
      return { correct, idx: new Set(), mode: "digits", card: null, reason: "" };
  }
}

export default function DivisibilityRules() {
  const [lvl, setLvl] = useState(0);
  const [numIdx, setNumIdx] = useState(0);
  const [results, setResults] = useState<{ d: number; correct: boolean }[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const level = LEVELS[lvl];
  const N = level.nums[numIdx];
  const dIdx = results.length;
  const currentD = level.order[dIdx];
  const priorMap = useMemo(() => {
    const m: Record<number, boolean> = {};
    results.forEach((r) => { m[r.d] = r.correct; });
    return m;
  }, [results]);
  const ev = currentD != null ? evidence(N, currentD, priorMap) : null;

  const greens = results.filter((r) => r.correct).map((r) => r.d);
  const reds = results.filter((r) => !r.correct).map((r) => r.d);
  const primeGreens = greens.filter(isPrimeDivisor);

  function answer(said: boolean) {
    if (!ev) return;
    if (said !== ev.correct) {
      const head = ev.correct
        ? `Yes — ${N} = ${currentD} × ${N / currentD}`
        : `No — ${N} ÷ ${currentD} = ${Math.floor(N / currentD)} r ${N % currentD}`;
      setNote(`${head}, because ${ev.reason}.`);
      return;
    }
    setNote(null);
    const next = [...results, { d: currentD, correct: ev.correct }];
    setResults(next);
    if (next.length >= level.order.length) setDone(true);
  }

  function loadNumber(i: number) {
    setNumIdx(i); setResults([]); setNote(null); setDone(false);
  }
  function switchLevel(i: number) {
    setLvl(i); setNumIdx(0); setResults([]); setNote(null); setDone(false);
  }
  function nextNumber() { loadNumber((numIdx + 1) % level.nums.length); }

  const digits = digitsOf(N);

  return (
    <div className="dv-wrap">
      <style>{`
        .dv-wrap { font-family:var(--bdb-font); color:var(--bdb-ink); max-width:820px; margin:0 auto; padding:14px clamp(10px,3vw,20px) 34px; }
        .dv-modebar { display:flex; justify-content:center; margin:0 0 12px; }
        .dv-modeseg { display:inline-flex; border:2px solid var(--bdb-line); border-radius:22px; overflow:hidden; background:var(--bdb-card); }
        .dv-modeseg button { font:inherit; font-weight:800; font-size:0.86rem; min-height:44px; padding:0 18px; border:none; background:transparent; color:var(--bdb-ink-soft); cursor:pointer; }
        .dv-modeseg button.on { background:var(--bdb-ink); color:#fff; }
        .dv-nums { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-bottom:14px; }
        .dv-npill { font:inherit; font-weight:800; font-size:0.92rem; min-height:40px; padding:0 15px; border-radius:999px; border:1px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink-soft); cursor:pointer; }
        .dv-npill.on { background:var(--bdb-ink); color:#fff; border-color:var(--bdb-ink); }
        .dv-num { display:flex; gap:6px; justify-content:center; margin:6px 0 4px; }
        .dv-dig { font-weight:900; font-size:clamp(2.4rem,10vw,4rem); line-height:1.05; padding:2px 6px; border-radius:10px; transition:background .25s, color .25s; }
        .dv-dig.on { background:color-mix(in srgb, ${C_TEAL} 26%, transparent); color:var(--bdb-ink); box-shadow:inset 0 -5px 0 ${C_TEAL}; }
        .dv-dig.sum { background:color-mix(in srgb, ${C_AMBER} 32%, transparent); box-shadow:inset 0 -5px 0 ${C_AMBER}; }
        .dv-zones { display:grid; grid-template-columns:1fr 1fr; gap:12px; max-width:620px; margin:12px auto 0; }
        .dv-zone { border:2px solid var(--bdb-line); border-radius:0; min-height:74px; padding:8px 10px 12px; background:var(--bdb-card); }
        .dv-zone.green { border-color:color-mix(in srgb, ${C_GREEN} 55%, var(--bdb-line)); background:color-mix(in srgb, ${C_GREEN} 8%, var(--bdb-card)); }
        .dv-zone.red { border-color:color-mix(in srgb, ${C_CORAL} 50%, var(--bdb-line)); background:color-mix(in srgb, ${C_CORAL} 7%, var(--bdb-card)); }
        .dv-zlabel { font-size:0.7rem; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; color:var(--bdb-ink-faint); margin-bottom:8px; }
        .dv-chips { display:flex; gap:8px; flex-wrap:wrap; }
        .dv-chip { display:grid; place-items:center; min-width:48px; min-height:48px; padding:0 10px; border-radius:12px; font-weight:900; font-size:1.3rem; color:#fff; animation:dvSettle .34s cubic-bezier(.34,.8,.3,1) backwards; }
        .dv-chip.green { background:${C_GREEN}; }
        .dv-chip.red { background:${C_CORAL}; }
        @keyframes dvSettle { from { opacity:0; transform:translateY(-14px) scale(.8); } 60% { transform:translateY(0) scale(1.08); } to { opacity:1; transform:none; } }
        .dv-card { max-width:520px; margin:16px auto 0; border:2px solid var(--bdb-ink); border-radius:0; background:var(--bdb-card); padding:16px; text-align:center; }
        .dv-q { font-weight:900; font-size:clamp(1.2rem,3.6vw,1.6rem); margin-bottom:6px; }
        .dv-ruleline { color:var(--bdb-ink-soft); font-weight:600; font-size:0.94rem; margin-bottom:10px; }
        .dv-evidence { font-size:clamp(1.05rem,3vw,1.35rem); margin-bottom:14px; }
        .dv-evidence b { color:var(--bdb-ink); }
        .dv-yn { display:flex; gap:12px; justify-content:center; }
        .dv-yn button { font:inherit; font-weight:900; font-size:1.15rem; min-width:120px; min-height:56px; border-radius:14px; border:2px solid var(--bdb-ink); cursor:pointer; }
        .dv-yn .yes { background:${C_GREEN}; color:#fff; border-color:${C_GREEN}; }
        .dv-yn .no { background:var(--bdb-card); color:var(--bdb-ink); }
        .dv-bank { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; max-width:700px; margin:18px auto 0; }
        .dv-rule { display:flex; gap:8px; align-items:baseline; padding:7px 12px; border:1px solid var(--bdb-line); border-radius:10px; background:var(--bdb-card); font-size:0.82rem; color:var(--bdb-ink-soft); }
        .dv-rule b { font-size:0.95rem; color:var(--bdb-ink); }
        .dv-rule.on { border-color:var(--bdb-ink); background:var(--bdb-ground-2); color:var(--bdb-ink); }
        .dv-rule.g { border-color:color-mix(in srgb, ${C_GREEN} 55%, var(--bdb-line)); }
        .dv-rule.r { border-color:color-mix(in srgb, ${C_CORAL} 50%, var(--bdb-line)); }
        .dv-summary { max-width:560px; margin:16px auto 0; text-align:center; }
        .dv-summary .big { font-weight:900; font-size:clamp(1.2rem,3.6vw,1.6rem); margin-bottom:6px; }
        .dv-summary .bridge { color:var(--bdb-ink); font-weight:600; font-size:clamp(1rem,2.8vw,1.18rem); line-height:1.55; margin:6px auto 14px; max-width:460px; }
        .dv-summary a { color:var(--bdb-teal); font-weight:800; text-decoration:none; border-bottom:2px solid color-mix(in srgb, var(--bdb-teal) 45%, transparent); }
        .dv-bar { display:flex; gap:8px; justify-content:center; align-items:center; margin-top:14px; flex-wrap:wrap; }
        .dv-btn { font:inherit; font-weight:700; font-size:0.95rem; padding:10px 18px; border-radius:12px; border:1px solid var(--bdb-line); background:var(--bdb-ink); color:#fff; cursor:pointer; }
        .dv-link { font:inherit; font-weight:700; font-size:0.82rem; color:var(--bdb-ink-soft); background:none; border:none; text-decoration:underline; cursor:pointer; }
        .dv-note { text-align:center; min-height:26px; margin-top:14px; }
        .dv-note-in { display:inline-block; color:var(--bdb-coral); font-weight:800; font-size:clamp(1rem,3vw,1.3rem); line-height:1.35; padding:8px 16px; border-radius:12px; background:color-mix(in srgb, var(--bdb-coral) 12%, transparent); }
        @media (prefers-reduced-motion: reduce) { .dv-chip { animation:none; } .dv-dig { transition:none; } }
      `}</style>

      <div className="dv-modebar">
        <div className="dv-modeseg">
          {LEVELS.map((l, i) => (
            <button key={l.label} className={lvl === i ? "on" : ""} onClick={() => switchLevel(i)}>{l.label}</button>
          ))}
        </div>
      </div>

      <div className="dv-nums">
        {level.nums.map((n, i) => (
          <button key={n} className={`dv-npill ${i === numIdx ? "on" : ""}`} onClick={() => loadNumber(i)}>{n}</button>
        ))}
      </div>

      <div className="dv-num">
        {digits.map((dg, i) => (
          <span key={i} className={`dv-dig ${!done && ev?.idx.has(i) ? (ev.mode === "sum" ? "sum" : "on") : ""}`}>{dg}</span>
        ))}
      </div>

      <div className="dv-zones">
        <div className="dv-zone green">
          <div className="dv-zlabel">Divides evenly</div>
          <div className="dv-chips">
            {greens.map((d) => <span key={d} className="dv-chip green">{d}</span>)}
          </div>
        </div>
        <div className="dv-zone red">
          <div className="dv-zlabel">Not a factor</div>
          <div className="dv-chips">
            {reds.map((d) => <span key={d} className="dv-chip red">{d}</span>)}
          </div>
        </div>
      </div>

      {!done && ev && (
        <div className="dv-card">
          <div className="dv-q">Is {N} divisible by {currentD}?</div>
          <div className="dv-ruleline">{RULES[currentD]}</div>
          <div className="dv-evidence">{ev.card}</div>
          <div className="dv-yn">
            <button className="yes" onClick={() => answer(true)}>Yes</button>
            <button className="no" onClick={() => answer(false)}>No</button>
          </div>
        </div>
      )}

      {done && (
        <div className="dv-summary">
          <div className="big">{N} divides evenly by {greens.join(", ")}.</div>
          {primeGreens.length > 0 && (
            <p className="bridge">
              Those are the factors you can pull out first. Start a factor tree with the prime ones
              {" — "}<b>{primeGreens.join(", ")}</b>{" — "}and split until every leaf is prime.{" "}
              <a href="/ladder-method">Open the Ladder Method →</a>
            </p>
          )}
          <div className="dv-bar">
            <button className="dv-btn" onClick={nextNumber}>Next number</button>
            <button className="dv-link" onClick={() => loadNumber(numIdx)}>Test this one again</button>
          </div>
        </div>
      )}

      <div className="dv-bank">
        {level.order.map((d, i) => {
          const settled = results.find((r) => r.d === d);
          const cls = settled ? (settled.correct ? "g" : "r") : (!done && d === currentD ? "on" : "");
          return (
            <div key={d} className={`dv-rule ${cls}`}>
              <b>÷{d}</b><span>{RULES[d]}</span>
            </div>
          );
        })}
      </div>

      <div className="dv-note">{note && <span key={note} className="dv-note-in">{note}</span>}</div>
    </div>
  );
}
