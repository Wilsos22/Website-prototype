"use client";

// Divisibility Rules - M1.T1.L2-D1 "Factors and Multiples Foundations" (6.NS.4).
//
// Three fixed columns so a sixth grader always knows where to look:
//   LEFT   the rule bank, large, one row per divisor 1 through 10
//   CENTER the number being tested, which travels DOWN the rail one rule at a time
//   RIGHT  the factor family, which builds itself as each rule lands
//
// The run stops when d * d passes N - the lesson's stopping rule - so the arch
// closes on its own and the student can see why no later pair is needed. Once
// the rules are finished the student completes the family by clicking every
// factor in order, then the pairs are drawn as a nested arch.

import { ReactNode, useMemo, useState } from "react";

const C_GREEN = "#2f9e6f";
const C_CORAL = "#f95335";
const C_TEAL = "#50a3a4";
const C_AMBER = "#fcaf38";

const ROW = 62; // rail row height in px; the travelling number steps by this

const RULES: Record<number, string> = {
  1: "Every whole number is divisible by 1.",
  2: "Last digit is even (0, 2, 4, 6, 8).",
  3: "The digit sum is divisible by 3.",
  4: "The last two digits make a number divisible by 4.",
  5: "Last digit is 0 or 5.",
  6: "Passes both the rule for 2 and the rule for 3.",
  7: "No digit shortcut. Divide to check.",
  8: "The last three digits make a number divisible by 8.",
  9: "The digit sum is divisible by 9.",
  10: "Last digit is 0.",
};

const RAIL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface Level { label: string; nums: number[]; closes: boolean }
const LEVELS: Level[] = [
  // Every number here is <= 100, so testing 1-10 always reaches the stopping
  // point and the factor list the tool builds is genuinely complete.
  { label: "Two-digit", nums: [24, 36, 40, 48, 60, 72], closes: true },
  // Above 100 the rail runs out before the partners meet. The tool says so
  // rather than pretending the list is finished.
  { label: "Three-digit", nums: [102, 126, 150, 234, 405, 720], closes: false },
];

const digitsOf = (n: number) => String(n).split("").map(Number);
const digitSum = (n: number) => digitsOf(n).reduce((a, b) => a + b, 0);

interface Ev { correct: boolean; idx: Set<number>; mode: "digits" | "sum"; card: ReactNode; reason: string }

// The real answer, which digits to light up, the evidence shown BEFORE the
// student decides, and the rule-based reason used in wrong-answer feedback.
function evidence(N: number, d: number, prior: Record<number, boolean>): Ev {
  const digits = digitsOf(N);
  const last = digits.length - 1;
  const lastDigit = N % 10;
  const sum = digitSum(N);
  const correct = N % d === 0;
  const idxLast = (k: number) => new Set(digits.map((_, i) => i).filter((i) => i > last - k));
  const all = new Set(digits.map((_, i) => i));
  const none = new Set<number>();

  switch (d) {
    case 1:
      // No digit evidence to point at - highlighting every digit would imply one.
      return { correct: true, idx: none, mode: "digits",
        card: <>Every whole number has 1 as a factor.</>,
        reason: "every whole number is divisible by 1" };
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
        reason: `${t} ${correct ? `= 4 x ${t / 4}` : `divided by 4 leaves ${t % 4}`}` };
    }
    case 8: {
      const t = N % 1000;
      return { correct, idx: idxLast(3), mode: "digits",
        card: <>Last three digits: <b>{String(t).padStart(3, "0")}</b></>,
        reason: `${t} ${correct ? `= 8 x ${t / 8}` : `divided by 8 leaves ${t % 8}`}` };
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
        card: <>You found: divisible by 2 was <b>{by2 ? "yes" : "no"}</b>, by 3 was <b>{by3 ? "yes" : "no"}</b>. Both?</>,
        reason: `6 needs BOTH - even (${by2 ? "yes" : "no"}) and digit sum divisible by 3 (${by3 ? "yes" : "no"})` };
    }
    case 7:
      return { correct, idx: none, mode: "digits",
        card: <>No digit trick. Work out <b>{N} ÷ 7</b>.</>,
        reason: `${N} ÷ 7 ${correct ? `= ${N / 7} exactly` : `leaves ${N % 7}`}` };
    default:
      return { correct, idx: none, mode: "digits", card: null, reason: "" };
  }
}

export default function DivisibilityRules() {
  const [lvl, setLvl] = useState(0);
  const [numIdx, setNumIdx] = useState(0);
  const [results, setResults] = useState<{ d: number; isFactor: boolean }[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const level = LEVELS[lvl];
  const N = level.nums[numIdx];

  // Test 1, 2, 3 ... but only while the smaller factor has not passed its
  // partner. This is the lesson's stopping rule, enforced by the tool.
  const sequence = useMemo(() => RAIL.filter((d) => d * d <= N), [N]);

  const step = results.length;
  const currentD: number | undefined = sequence[step];
  const running = currentD != null;

  const priorMap = useMemo(() => {
    const m: Record<number, boolean> = {};
    results.forEach((r) => { m[r.d] = r.isFactor; });
    return m;
  }, [results]);
  const ev = currentD != null ? evidence(N, currentD, priorMap) : null;

  // Each confirmed divisor contributes one pair to the family.
  const pairs = useMemo(
    () => results.filter((r) => r.isFactor).map((r) => [r.d, N / r.d] as const),
    [results, N],
  );

  // The complete ordered factor list, from the pairs found.
  const allFactors = useMemo(() => {
    const s = new Set<number>();
    pairs.forEach(([a, b]) => { s.add(a); s.add(b); });
    return [...s].sort((a, b) => a - b);
  }, [pairs]);

  // Shuffled pool for the completion step. Reshuffles only when the set changes.
  const pool = useMemo(() => {
    const a = [...allFactors];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }, [allFactors]);

  // The completion step only makes sense when the arch actually closed. Asking
  // for "every factor, smallest to largest" off a partial list would teach the
  // wrong thing, so above 100 the tool stops at the pairs it can prove.
  const assembling = !running && level.closes && picked.length < allFactors.length;
  const finished = !running && allFactors.length > 0
    && (!level.closes || picked.length === allFactors.length);

  function answer(said: boolean) {
    if (!ev || currentD == null) return;
    if (said !== ev.correct) {
      const head = ev.correct
        ? `Yes - ${N} = ${currentD} x ${N / currentD}`
        : `No - ${N} ÷ ${currentD} = ${Math.floor(N / currentD)} r ${N % currentD}`;
      setNote(`${head}, because ${ev.reason}.`);
      return;
    }
    setNote(null);
    setResults([...results, { d: currentD, isFactor: ev.correct }]);
  }

  function pick(f: number) {
    const want = allFactors[picked.length];
    if (f !== want) {
      setNote(`Not yet - the next smallest factor you have not used is still to come.`);
      return;
    }
    setNote(null);
    setPicked([...picked, f]);
  }

  function loadNumber(i: number) {
    setNumIdx(i); setResults([]); setPicked([]); setNote(null);
  }
  function switchLevel(i: number) {
    setLvl(i); setNumIdx(0); setResults([]); setPicked([]); setNote(null);
  }

  const digits = digitsOf(N);
  const stoppedAt = sequence[sequence.length - 1];

  return (
    <div className="dv-wrap">
      <style>{`
        .dv-wrap { font-family:var(--bdb-font); color:var(--bdb-ink); max-width:1240px; margin:0 auto; padding:12px clamp(10px,2.5vw,20px) 34px; }
        .dv-top { display:flex; gap:10px; justify-content:center; align-items:center; flex-wrap:wrap; margin-bottom:14px; }
        .dv-seg { display:inline-flex; border:2px solid var(--bdb-line); border-radius:22px; overflow:hidden; background:var(--bdb-card); }
        .dv-seg button { font:inherit; font-weight:800; font-size:0.86rem; min-height:44px; padding:0 18px; border:none; background:transparent; color:var(--bdb-ink-soft); cursor:pointer; }
        .dv-seg button.on { background:var(--bdb-ink); color:#fff; }
        .dv-npill { font:inherit; font-weight:800; font-size:0.92rem; min-height:40px; padding:0 15px; border-radius:999px; border:1px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink-soft); cursor:pointer; }
        .dv-npill.on { background:var(--bdb-ink); color:#fff; border-color:var(--bdb-ink); }

        .dv-cols { display:grid; grid-template-columns:minmax(280px,1.05fr) minmax(240px,0.95fr) minmax(240px,1fr); gap:clamp(12px,2vw,26px); align-items:start; }
        .dv-head { font-size:0.72rem; font-weight:800; letter-spacing:0.07em; text-transform:uppercase; color:var(--bdb-ink-faint); margin-bottom:10px; }

        /* LEFT - the rule rail */
        .dv-rail { position:relative; }
        .dv-row { display:flex; align-items:center; gap:12px; height:${ROW}px; padding:0 12px; border-bottom:1px solid var(--bdb-line); opacity:0.42; transition:opacity .25s, background .25s; }
        .dv-row.seen { opacity:1; }
        .dv-row.now { opacity:1; background:var(--bdb-ground-2); box-shadow:inset 4px 0 0 ${C_TEAL}; }
        .dv-row.past { opacity:0.22; }
        .dv-d { font-weight:900; font-size:1.7rem; min-width:56px; letter-spacing:-0.01em; }
        .dv-row.yes .dv-d { color:${C_GREEN}; }
        .dv-row.no .dv-d { color:${C_CORAL}; }
        .dv-rt { font-size:0.95rem; font-weight:600; line-height:1.3; color:var(--bdb-ink-soft); }
        .dv-row.now .dv-rt { color:var(--bdb-ink); font-weight:700; }
        .dv-mark { margin-left:auto; font-weight:900; font-size:0.78rem; letter-spacing:0.06em; text-transform:uppercase; }
        .dv-row.yes .dv-mark { color:${C_GREEN}; }
        .dv-row.no .dv-mark { color:${C_CORAL}; }
        .dv-stop { display:flex; align-items:center; gap:10px; padding:10px 12px; margin-top:2px; border:2px dashed color-mix(in srgb, ${C_AMBER} 60%, var(--bdb-line)); background:color-mix(in srgb, ${C_AMBER} 10%, transparent); font-size:0.86rem; font-weight:700; line-height:1.35; color:var(--bdb-ink); }

        /* CENTER - the travelling number */
        .dv-track { position:relative; min-height:${ROW * RAIL.length}px; }
        .dv-car { transition:transform .42s cubic-bezier(.34,.75,.3,1); }
        .dv-num { display:flex; gap:5px; justify-content:center; }
        .dv-dig { font-weight:900; font-size:clamp(2.1rem,6vw,3.2rem); line-height:1.05; padding:2px 5px; border-radius:10px; transition:background .25s, box-shadow .25s; }
        .dv-dig.on { background:color-mix(in srgb, ${C_TEAL} 26%, transparent); box-shadow:inset 0 -5px 0 ${C_TEAL}; }
        .dv-dig.sum { background:color-mix(in srgb, ${C_AMBER} 32%, transparent); box-shadow:inset 0 -5px 0 ${C_AMBER}; }
        .dv-ask { border:2px solid var(--bdb-ink); background:var(--bdb-card); padding:12px; text-align:center; margin-top:10px; }
        .dv-q { font-weight:900; font-size:clamp(1rem,2.6vw,1.25rem); margin-bottom:8px; }
        .dv-ev { font-size:clamp(0.95rem,2.2vw,1.1rem); margin-bottom:12px; line-height:1.4; }
        .dv-yn { display:flex; gap:10px; justify-content:center; }
        .dv-yn button { font:inherit; font-weight:900; font-size:1.05rem; min-width:104px; min-height:52px; border-radius:14px; border:2px solid var(--bdb-ink); cursor:pointer; }
        .dv-yn .yes { background:${C_GREEN}; color:#fff; border-color:${C_GREEN}; }
        .dv-yn .no { background:var(--bdb-card); color:var(--bdb-ink); }

        /* RIGHT - the factor family */
        .dv-fam { border:2px solid var(--bdb-line); background:var(--bdb-card); padding:12px; min-height:180px; }
        .dv-pair { display:flex; align-items:center; gap:8px; padding:7px 2px; animation:dvIn .34s cubic-bezier(.34,.8,.3,1) backwards; }
        .dv-pf { display:grid; place-items:center; min-width:46px; min-height:42px; padding:0 9px; background:${C_GREEN}; color:#fff; font-weight:900; font-size:1.15rem; border-radius:10px; }
        .dv-x { font-weight:800; color:var(--bdb-ink-faint); }
        .dv-empty { color:var(--bdb-ink-faint); font-size:0.9rem; line-height:1.5; }
        @keyframes dvIn { from { opacity:0; transform:translateX(16px); } to { opacity:1; transform:none; } }

        .dv-pool { display:flex; flex-wrap:wrap; gap:8px; margin-top:6px; }
        .dv-chip { font:inherit; font-weight:900; font-size:1.1rem; min-width:52px; min-height:48px; padding:0 12px; border-radius:12px; border:2px solid var(--bdb-ink); background:var(--bdb-card); color:var(--bdb-ink); cursor:pointer; }
        .dv-chip.used { opacity:0.25; pointer-events:none; }
        .dv-built { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; min-height:48px; }
        .dv-slot { display:grid; place-items:center; min-width:52px; min-height:48px; border-radius:12px; background:var(--bdb-ink); color:#fff; font-weight:900; font-size:1.1rem; }
        .dv-slot.blank { background:transparent; border:2px dashed var(--bdb-line); }

        /* the arch */
        .dv-arch { display:flex; flex-direction:column; gap:5px; align-items:center; margin-top:4px; }
        .dv-arow { display:flex; align-items:center; gap:8px; width:100%; }
        .dv-line { flex:1; height:2px; background:color-mix(in srgb, ${C_TEAL} 70%, transparent); }
        .dv-af { font-weight:900; font-size:1.05rem; color:var(--bdb-ink); min-width:40px; text-align:center; }

        .dv-note { text-align:center; min-height:26px; margin-top:16px; }
        .dv-note-in { display:inline-block; color:var(--bdb-coral); font-weight:800; font-size:clamp(0.98rem,2.4vw,1.2rem); line-height:1.35; padding:8px 16px; border-radius:12px; background:color-mix(in srgb, var(--bdb-coral) 12%, transparent); }
        .dv-bar { display:flex; gap:8px; justify-content:center; align-items:center; margin-top:16px; flex-wrap:wrap; }
        .dv-btn { font:inherit; font-weight:700; font-size:0.95rem; padding:10px 18px; border-radius:12px; border:1px solid var(--bdb-line); background:var(--bdb-ink); color:#fff; cursor:pointer; }
        .dv-link { font:inherit; font-weight:700; font-size:0.82rem; color:var(--bdb-ink-soft); background:none; border:none; text-decoration:underline; cursor:pointer; }
        .dv-done { font-weight:800; font-size:clamp(1rem,2.5vw,1.2rem); line-height:1.5; text-align:center; margin-top:10px; }
        .dv-done a { color:var(--bdb-teal); font-weight:800; text-decoration:none; border-bottom:2px solid color-mix(in srgb, var(--bdb-teal) 45%, transparent); }

        @media (max-width: 900px) {
          .dv-cols { grid-template-columns:1fr; }
          .dv-track { min-height:0; }
          .dv-car { transform:none !important; }
          .dv-row { height:auto; padding:10px 12px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dv-car { transition:none; }
          .dv-pair { animation:none; }
          .dv-dig { transition:none; }
        }
      `}</style>

      <div className="dv-top">
        <div className="dv-seg">
          {LEVELS.map((l, i) => (
            <button key={l.label} className={lvl === i ? "on" : ""} onClick={() => switchLevel(i)}>{l.label}</button>
          ))}
        </div>
        {level.nums.map((n, i) => (
          <button key={n} className={`dv-npill ${i === numIdx ? "on" : ""}`} onClick={() => loadNumber(i)}>{n}</button>
        ))}
      </div>

      <div className="dv-cols">
        {/* LEFT: the rule rail */}
        <div className="dv-rail">
          <div className="dv-head">The rules</div>
          {RAIL.map((d) => {
            const r = results.find((x) => x.d === d);
            const inRun = sequence.includes(d);
            const isNow = running && d === currentD;
            const cls = [
              r ? "seen" : "",
              isNow ? "now" : "",
              !inRun ? "past" : "",
              r ? (r.isFactor ? "yes" : "no") : "",
            ].filter(Boolean).join(" ");
            return (
              <div key={d} className={`dv-row ${cls}`}>
                <span className="dv-d">÷{d}</span>
                <span className="dv-rt">{RULES[d]}</span>
                {r && <span className="dv-mark">{r.isFactor ? "Factor" : "No"}</span>}
              </div>
            );
          })}
          {!running && (
            <div className="dv-stop">
              {level.closes
                ? `Stop at ${stoppedAt}. The next divisor would pass its partner, so every later pair repeats one you already have.`
                : `You have run every rule through 10, but the partners have not met yet. To finish this list you would keep testing past 10.`}
            </div>
          )}
        </div>

        {/* CENTER: the number travelling down the rail */}
        <div>
          <div className="dv-head">The number</div>
          <div className="dv-track">
            <div className="dv-car" style={{ transform: `translateY(${running ? step * ROW : 0}px)` }}>
              <div className="dv-num">
                {digits.map((dg, i) => (
                  <span key={i} className={`dv-dig ${running && ev?.idx.has(i) ? (ev.mode === "sum" ? "sum" : "on") : ""}`}>{dg}</span>
                ))}
              </div>

              {running && ev && (
                <div className="dv-ask">
                  <div className="dv-q">Is {N} divisible by {currentD}?</div>
                  <div className="dv-ev">{ev.card}</div>
                  <div className="dv-yn">
                    <button className="yes" onClick={() => answer(true)}>Yes</button>
                    <button className="no" onClick={() => answer(false)}>No</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: the factor family */}
        <div>
          <div className="dv-head">The factor family</div>
          <div className="dv-fam">
            {pairs.length === 0 && (
              <p className="dv-empty">Every rule that lands adds a pair here. Start with 1.</p>
            )}

            {running && pairs.map(([a, b]) => (
              <div className="dv-pair" key={a}>
                <span className="dv-pf">{a}</span>
                <span className="dv-x">x</span>
                <span className="dv-pf">{b}</span>
              </div>
            ))}

            {assembling && (
              <>
                <p className="dv-empty" style={{ marginBottom: 10 }}>
                  Now finish it. Click every factor from smallest to largest.
                </p>
                <div className="dv-built">
                  {allFactors.map((_, i) => (
                    <span key={i} className={`dv-slot ${picked[i] == null ? "blank" : ""}`}>
                      {picked[i] ?? ""}
                    </span>
                  ))}
                </div>
                <div className="dv-pool">
                  {pool.map((f) => (
                    <button key={f} className={`dv-chip ${picked.includes(f) ? "used" : ""}`} onClick={() => pick(f)}>{f}</button>
                  ))}
                </div>
              </>
            )}

            {finished && (
              <div className="dv-arch">
                {pairs.map(([a, b], i) => (
                  <div className="dv-arow" key={a} style={{ width: `${Math.max(46, 100 - i * 9)}%` }}>
                    <span className="dv-af">{a}</span>
                    <span className="dv-line" />
                    <span className="dv-af">{b}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {finished && (
            <div className="dv-done">
              {level.closes
                ? `${N} has ${allFactors.length} factors. The arch is closed, so the list is complete.`
                : `You have found ${allFactors.length} factors of ${N}. Keep testing past 10 before calling this list complete.`}
              <br />
              <a href="/ladder-method">Break it into primes with the Ladder Method</a>
            </div>
          )}
        </div>
      </div>

      <div className="dv-note">{note && <span key={note} className="dv-note-in">{note}</span>}</div>

      <div className="dv-bar">
        <button className="dv-btn" onClick={() => loadNumber((numIdx + 1) % level.nums.length)}>Next number</button>
        <button className="dv-link" onClick={() => loadNumber(numIdx)}>Start this one again</button>
      </div>
    </div>
  );
}
