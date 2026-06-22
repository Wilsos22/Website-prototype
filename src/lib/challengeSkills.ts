// Reusable problem registry for live Challenges.
//
// Each "skill" mirrors one of the site's math tools and knows how to
// auto-generate a fresh problem at a difficulty level. The student game screen
// (/challenge) renders ANY skill from this list, so adding a new tool to the
// competition is just adding one entry here — no new UI required.

export type AnswerType = "number" | "choice";

export interface Problem {
  prompt: string; // main expression/question, may contain unicode math (× ÷ − ²)
  sub?: string; // optional helper line, e.g. "x = ?"
  answer: string; // canonical correct answer (string form)
  answerType: AnswerType;
  choices?: string[]; // present when answerType === "choice"
  allowNegative?: boolean; // number keypad shows a +/− toggle
}

export interface Skill {
  key: string;
  label: string;
  emoji: string;
  blurb: string; // one-liner shown when picking a challenge
  toolRoute?: string; // matching manipulative, for "show me how" links
  levels: string[]; // labels for difficulty 1..3
  generate: (level: number) => Problem;
}

// ---- tiny random helpers -------------------------------------------------
const ri = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}
// parenthesize negative operands, with a unicode minus: 5 → "5", -5 → "(−5)"
const par = (n: number) => (n < 0 ? `(−${Math.abs(n)})` : `${n}`);

function numProb(prompt: string, answer: number, opts?: { sub?: string; allowNegative?: boolean }): Problem {
  return { prompt, answer: String(answer), answerType: "number", sub: opts?.sub, allowNegative: opts?.allowNegative };
}
function choiceProb(prompt: string, correct: string, distractors: string[], sub?: string): Problem {
  const choices: string[] = [correct];
  for (const d of distractors) {
    if (choices.length >= 4) break;
    if (!choices.includes(d)) choices.push(d);
  }
  // pad in the unlikely case we ran short on unique distractors
  let guard = 0;
  while (choices.length < 4 && guard++ < 50) {
    const filler = `${ri(1, 99)}`;
    if (!choices.includes(filler)) choices.push(filler);
  }
  return { prompt, answer: correct, answerType: "choice", choices: shuffle(choices), sub };
}

// ---- order of operations (GEMS) -----------------------------------------
function gemsProblem(level: number): Problem {
  if (level <= 1) {
    const t = pick([
      () => { const a = ri(2, 9), b = ri(2, 6), c = ri(2, 6); return { p: `${a} + ${b} × ${c}`, ans: a + b * c }; },
      () => { const a = ri(2, 6), b = ri(2, 6), c = ri(1, 9); return { p: `${a} × ${b} + ${c}`, ans: a * b + c }; },
      () => { const a = ri(3, 9), b = ri(2, 6), c = ri(1, 5); return { p: `${a} × ${b} − ${c}`, ans: a * b - c }; },
    ])();
    return numProb(t.p, t.ans);
  }
  if (level === 2) {
    const t = pick([
      () => { const a = ri(2, 8), b = ri(2, 8), c = ri(2, 6); return { p: `(${a} + ${b}) × ${c}`, ans: (a + b) * c }; },
      () => { const a = ri(5, 9), b = ri(1, 4), c = ri(2, 6); return { p: `${c} × (${a} − ${b})`, ans: c * (a - b) }; },
      () => { const a = ri(2, 9), b = ri(2, 6), c = ri(2, 6), d = ri(1, 9); return { p: `${a} + ${b} × ${c} − ${d}`, ans: a + b * c - d }; },
    ])();
    return numProb(t.p, t.ans);
  }
  const t = pick([
    () => { const a = ri(3, 9), b = ri(1, 20); return { p: `${a}² + ${b}`, ans: a * a + b }; },
    () => { const a = ri(4, 9), b = ri(1, 15); return { p: `${a}² − ${b}`, ans: a * a - b }; },
    () => { const a = ri(2, 5), b = ri(2, 4), c = ri(1, 9); return { p: `${a}² × ${b} + ${c}`, ans: a * a * b + c }; },
    () => { const c = ri(2, 9), q = ri(2, 9), b = ri(1, 9); return { p: `${c * q} ÷ ${c} + ${b}`, ans: q + b }; },
  ])();
  return numProb(t.p, t.ans);
}

// ---- multiplication fluency ---------------------------------------------
function multiplicationProblem(level: number): Problem {
  if (level <= 1) { const a = ri(2, 9), b = ri(2, 9); return numProb(`${a} × ${b}`, a * b); }
  if (level === 2) { const a = ri(3, 12), b = ri(3, 12); return numProb(`${a} × ${b}`, a * b); }
  const a = ri(11, 25), b = ri(3, 9); return numProb(`${a} × ${b}`, a * b);
}

// ---- integers (number line) ---------------------------------------------
function integerProblem(level: number): Problem {
  if (level <= 1) {
    const t = pick([
      () => { const a = -ri(1, 12), b = ri(1, 15); return { p: `${par(a)} + ${b}`, ans: a + b }; },
      () => { const a = ri(1, 15), b = -ri(1, 12); return { p: `${a} + ${par(b)}`, ans: a + b }; },
    ])();
    return numProb(t.p, t.ans, { allowNegative: true });
  }
  if (level === 2) {
    const t = pick([
      () => { const a = -ri(1, 12), b = ri(1, 12); return { p: `${par(a)} − ${b}`, ans: a - b }; },
      () => { const a = ri(1, 12), b = -ri(1, 12); return { p: `${a} − ${par(b)}`, ans: a - b }; },
      () => { const a = -ri(1, 12), b = -ri(1, 12); return { p: `${par(a)} − ${par(b)}`, ans: a - b }; },
    ])();
    return numProb(t.p, t.ans, { allowNegative: true });
  }
  const t = pick([
    () => { const a = -ri(2, 9), b = ri(2, 9); return { p: `${par(a)} × ${b}`, ans: a * b }; },
    () => { const a = -ri(2, 9), b = -ri(2, 9); return { p: `${par(a)} × ${par(b)}`, ans: a * b }; },
    () => { const a = -ri(1, 9), b = ri(1, 9), c = ri(1, 9); return { p: `${par(a)} + ${b} − ${c}`, ans: a + b - c }; },
  ])();
  return numProb(t.p, t.ans, { allowNegative: true });
}

// ---- solve for x (equation builder) -------------------------------------
function equationProblem(level: number): Problem {
  if (level <= 1) {
    const x = ri(1, 12), b = ri(1, 12);
    return numProb(`${b} + x = ${x + b}`, x, { sub: "x = ?" });
  }
  if (level === 2) {
    const a = ri(2, 5), x = ri(1, 10), b = ri(1, 12);
    return numProb(`${a}x + ${b} = ${a * x + b}`, x, { sub: "x = ?" });
  }
  const t = pick([
    () => { const a = ri(2, 6), x = ri(2, 12), b = ri(1, 15); return { p: `${a}x − ${b} = ${a * x - b}`, x }; },
    () => { const a = ri(2, 5), x = -ri(1, 8), b = ri(1, 12); return { p: `${a}x + ${b} = ${a * x + b}`, x }; },
  ])();
  return numProb(t.p, t.x, { sub: "x = ?", allowNegative: true });
}

// ---- combining like terms (multiple choice) -----------------------------
function fmtLinear(coef: number, c: number): string {
  const parts: string[] = [];
  if (coef !== 0) {
    if (coef === 1) parts.push("x");
    else if (coef === -1) parts.push("−x");
    else parts.push(`${coef < 0 ? "−" : ""}${Math.abs(coef)}x`);
  }
  if (c !== 0) {
    if (parts.length === 0) parts.push(`${c < 0 ? "−" : ""}${Math.abs(c)}`);
    else parts.push(`${c < 0 ? "− " : "+ "}${Math.abs(c)}`);
  }
  return parts.length ? parts.join(" ") : "0";
}
function combineProblem(level: number): Problem {
  let a: number, b: number, c2: number, d: number, prompt: string;
  if (level <= 1) {
    a = ri(1, 6); b = ri(1, 9); c2 = ri(1, 6); d = ri(1, 9);
    prompt = `${a}x + ${b} + ${c2}x + ${d}`;
  } else if (level === 2) {
    a = ri(3, 8); b = ri(2, 9); c2 = ri(1, a - 1); d = ri(1, b);
    prompt = `${a}x + ${b} − ${c2}x − ${d}`;
    c2 = -c2; d = -d;
  } else {
    a = ri(2, 7); b = ri(1, 9); c2 = ri(2, 7) * (Math.random() < 0.5 ? -1 : 1); d = ri(1, 9) * (Math.random() < 0.5 ? -1 : 1);
    prompt = `${b} ${c2 < 0 ? "−" : "+"} ${Math.abs(c2)}x + ${a}x ${d < 0 ? "−" : "+"} ${Math.abs(d)}`;
  }
  const coef = a + c2;
  const cst = b + d;
  const correct = fmtLinear(coef, cst);
  const distractors = [
    fmtLinear(coef + cst, 0), // mashed every term into x
    fmtLinear(0, coef + cst), // mashed every term into a constant
    fmtLinear(coef, -cst), // flipped the constant's sign
    fmtLinear(a + Math.abs(c2), b + Math.abs(d)), // ignored subtraction
    fmtLinear(coef, cst + 1),
  ].filter((s) => s !== correct);
  return choiceProb(`Simplify:  ${prompt}`, correct, distractors);
}

// ---- fractions (multiple choice) ----------------------------------------
function fractionProblem(level: number): Problem {
  if (level <= 1) {
    const bases = [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [1, 6], [5, 6]];
    const [n, d] = pick(bases);
    const k = ri(2, 5);
    const correct = `${n * k}/${d * k}`;
    const val = n / d;
    const pool = [`${n * k + 1}/${d * k}`, `${n * k}/${d * k + 1}`, `${n * (k + 1)}/${d * k}`, `${n * k}/${d * (k + 1)}`]
      .filter((s) => {
        const [pn, pd] = s.split("/").map(Number);
        return Math.abs(pn / pd - val) > 1e-9;
      });
    return choiceProb(`Which is equal to  ${n}/${d}?`, correct, pool);
  }
  if (level === 2) {
    const fracs: { s: string; v: number }[] = [];
    let guard = 0;
    while (fracs.length < 4 && guard++ < 200) {
      const d = ri(2, 9), n = ri(1, d - 1);
      const v = n / d;
      if (!fracs.some((f) => Math.abs(f.v - v) < 1e-9)) fracs.push({ s: `${n}/${d}`, v });
    }
    const best = fracs.reduce((m, f) => (f.v > m.v ? f : m), fracs[0]);
    return { prompt: "Which fraction is the largest?", answer: best.s, answerType: "choice", choices: shuffle(fracs.map((f) => f.s)) };
  }
  const bases = [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [2, 5], [3, 5], [4, 5], [5, 6]];
  const [n, d] = pick(bases);
  const k = ri(2, 4);
  const correct = `${n}/${d}`;
  const val = n / d;
  const pool = [`${n * k}/${d * k}`, `${n}/${d * 2}`, `${n * 2}/${d}`, `${n + 1}/${d}`]
    .filter((s) => {
      const [pn, pd] = s.split("/").map(Number);
      return Math.abs(pn / pd - val) > 1e-9;
    });
  return choiceProb(`Simplify  ${n * k}/${d * k}`, correct, pool);
}

// ---- percents (percent bar) ---------------------------------------------
function percentProblem(level: number): Problem {
  const friendly = level <= 1 ? [10, 20, 25, 50, 75, 100] : [5, 15, 30, 40, 60, 80, 90];
  const p = pick(friendly);
  const step = 100 / gcd(p, 100);
  const W = step * ri(1, Math.max(2, Math.floor(160 / step)));
  const part = (p * W) / 100;
  if (level <= 2) {
    return numProb(`What is ${p}% of ${W}?`, part);
  }
  // level 3 — work backwards
  if (Math.random() < 0.5) {
    return numProb(`What percent of ${W} is ${part}?`, p, { sub: "answer in %" });
  }
  return numProb(`${p}% of what number is ${part}?`, W);
}

// ---- registry -----------------------------------------------------------
export const SKILLS: Skill[] = [
  {
    key: "order-of-operations",
    label: "Order of Operations",
    emoji: "🧮",
    blurb: "GEMS — evaluate the expression",
    toolRoute: "/order-of-operations",
    levels: ["No parentheses", "Parentheses", "Exponents & ÷"],
    generate: gemsProblem,
  },
  {
    key: "solve-for-x",
    label: "Solve for x",
    emoji: "⚖️",
    blurb: "One-step & two-step equations",
    toolRoute: "/equation-builder",
    levels: ["x + b = c", "ax + b = c", "Harder / negatives"],
    generate: equationProblem,
  },
  {
    key: "combine-like-terms",
    label: "Combine Like Terms",
    emoji: "🟰",
    blurb: "Simplify the expression",
    toolRoute: "/combine-like-terms",
    levels: ["All positive", "With subtraction", "Mixed order"],
    generate: combineProblem,
  },
  {
    key: "multiplication",
    label: "Multiplication Facts",
    emoji: "✖️",
    blurb: "Fast multiplication fluency",
    toolRoute: "/multiplication-fluency",
    levels: ["Up to 9×9", "Up to 12×12", "2-digit × 1-digit"],
    generate: multiplicationProblem,
  },
  {
    key: "percent",
    label: "Percents",
    emoji: "％",
    blurb: "Percent of a number",
    toolRoute: "/percent-bar",
    levels: ["Friendly %", "Trickier %", "Work backwards"],
    generate: percentProblem,
  },
  {
    key: "integers",
    label: "Integer Operations",
    emoji: "➕",
    blurb: "Add, subtract & multiply with negatives",
    toolRoute: "/number-line-plus",
    levels: ["Adding", "Subtracting", "Multiply / mixed"],
    generate: integerProblem,
  },
  {
    key: "fractions",
    label: "Fractions",
    emoji: "🍕",
    blurb: "Equivalent, compare & simplify",
    toolRoute: "/fraction-bars",
    levels: ["Equivalent", "Compare", "Simplify"],
    generate: fractionProblem,
  },
];

export function getSkill(key: string): Skill | undefined {
  return SKILLS.find((s) => s.key === key);
}

// Lenient answer check: trims, treats unicode/ascii minus the same, ignores
// trailing % and surrounding spaces. Numbers compare numerically.
export function checkAnswer(input: string, problem: Problem): boolean {
  const norm = (s: string) =>
    s.trim().replace(/−/g, "-").replace(/\s+/g, "").replace(/%$/, "").toLowerCase();
  const a = norm(input);
  const b = norm(problem.answer);
  if (!a) return false;
  if (problem.answerType === "number") {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  }
  return a === b;
}
