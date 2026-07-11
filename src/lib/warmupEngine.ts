// Big Dog Math — parametric warm-up engine (proof of concept).
//
// Instead of asking an LLM to author questions (which miscounts, mis-computes,
// and returns malformed JSON), this builds the day's warm-up from grade-6
// problem TEMPLATES that generate questions in code: the answer is computed,
// so it is always correct, and each wrong choice is engineered from a specific
// misconception drawn from the site's finite vocabulary — so Q4/Q5 still feed
// the Right-now clustering. The build cannot fail: there is always exactly one
// valid, correct, tagged 6-question set.
//
// Kept dependency-free on purpose so it can be compiled + golden-tested in
// isolation, exactly like mastery.ts / grouping.ts. Do not add imports here.

// Finite misconception vocabulary — must match the site's `misconceptions`
// table exactly (exact-match clustering, no NLP). Unmatched wrong choices → "other".
export const MISCONCEPTIONS = [
  "treats ratio as additive",
  "reverses part and whole in percent",
  "adds denominators when adding fractions",
  "misplaces decimal in division",
  "ignores order of operations",
  "confuses coefficient with exponent",
  "sign errors with negatives",
  "reverses inequality symbol",
  "confuses area vs perimeter",
  "forgets to halve base × height for triangle area",
  "confuses mean and median",
  "miscounts frequencies in a data display",
  "distributes to first term only",
] as const;
export type Misconception = (typeof MISCONCEPTIONS)[number] | "other";

export type Strand = "number" | "geometry";
export const STRANDS: Strand[] = ["number", "geometry"];

export interface WarmupMC {
  q: string;
  type: "multiple_choice";
  choices: string[];
  correct: string;
  ccss: string;
  misconceptions: Record<string, string>; // wrong-choice text -> tag (populated on Q4/Q5)
  feedback: string;
  correctFeedback: string;
  points: 1;
}
export interface WarmupSA {
  q: string;
  type: "short_answer";
  correct: "";
  points: 0;
}
export type WarmupQuestion = WarmupMC | WarmupSA;

export interface WarmupSet {
  dailyTopic: string;
  strand: Strand;
  reviewTopics: string[];
  questions: WarmupQuestion[]; // 5 multiple_choice + 1 short_answer
}

// ── seeded RNG (deterministic; same seed → same warm-up) ─────────────────────
type RNG = () => number;
function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randInt = (rng: RNG, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T>(rng: RNG, arr: T[]): T => arr[Math.floor(rng() * arr.length)];
function shuffle<T>(rng: RNG, arr: T[]): T[] {
  const b = arr.slice();
  for (let i = b.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

// tidy number formatting so 0.7999999 never reaches a choice
const fmt = (n: number): string => String(Math.round(n * 1000) / 1000);
function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}
const frac = (n: number, d: number): string => {
  const g = gcd(n, d);
  return `${n / g}/${d / g}`;
};

// ── templates ────────────────────────────────────────────────────────────────
interface Candidate {
  value: string;
  tag: Misconception;
}
interface Item {
  q: string;
  correct: string;
  distractors: Candidate[]; // signature misconception first; the assembler picks 3 distinct
  ccss: string;
  correctFeedback: string;
  feedback: string;
}
// Difficulty ladder across the 6 questions:
//   fluency  Q1,Q2  basic gimmes — 99% get them if they try (build confidence)
//   review   Q3     a 4th/5th grade skill they should still have
//   current  Q4,Q5  the day's topic at an ENTRY level — the formative data pull
type Tier = "fluency" | "review" | "current";
interface Template {
  id: string;
  strand: Strand;
  tier: Tier;
  label: string; // short skill name for reviewTopics
  topics?: string[]; // keyword hints so "current" templates match the day's focus
  gen: (rng: RNG) => Item;
}

const TEMPLATES: Template[] = [
  // ── fluency (Q1/Q2): easy on purpose ───────────────────────────────────────
  {
    id: "basic-add",
    strand: "number",
    tier: "fluency",
    label: "multi-digit addition",
    gen: (rng) => {
      const a = randInt(rng, 12, 48);
      const b = randInt(rng, 12, 48);
      const correct = fmt(a + b);
      return {
        q: `What is ${a} + ${b}?`,
        correct,
        distractors: [
          { value: fmt(a + b - 10), tag: "other" },
          { value: fmt(a + b + 10), tag: "other" },
          { value: fmt(a + b - 1), tag: "other" },
          { value: fmt(a + b + 1), tag: "other" },
        ],
        ccss: "4.NBT.B.4",
        correctFeedback: "Quick and clean.",
        feedback: `Add the ones, then the tens: ${a} + ${b} = ${a + b}.`,
      };
    },
  },
  {
    id: "basic-mult",
    strand: "number",
    tier: "fluency",
    label: "multiplication facts",
    gen: (rng) => {
      const a = randInt(rng, 3, 9);
      const b = randInt(rng, 4, 9);
      const correct = fmt(a * b);
      return {
        q: `What is ${a} × ${b}?`,
        correct,
        distractors: [
          { value: fmt(a * b + a), tag: "other" },
          { value: fmt(a * b - b), tag: "other" },
          { value: fmt(a + b), tag: "other" },
          { value: fmt(a * b + 1), tag: "other" },
        ],
        ccss: "3.OA.C.7",
        correctFeedback: "You know your facts.",
        feedback: `${a} groups of ${b}: ${a} × ${b} = ${a * b}.`,
      };
    },
  },
  // ── review (Q3): a 4th/5th grade skill they should still have ──────────────
  {
    id: "place-value",
    strand: "number",
    tier: "review",
    label: "place value",
    gen: (rng) => {
      const d0 = randInt(rng, 1, 9);
      const d1 = randInt(rng, 1, 9); // hundreds digit we ask about
      const d2 = randInt(rng, 1, 9);
      const d3 = randInt(rng, 0, 9);
      const num = d0 * 1000 + d1 * 100 + d2 * 10 + d3;
      const correct = fmt(d1 * 100);
      return {
        q: `In the number ${num}, what is the VALUE of the digit ${d1} in the hundreds place?`,
        correct,
        distractors: [
          { value: fmt(d1), tag: "other" },
          { value: fmt(d1 * 10), tag: "other" },
          { value: fmt(d1 * 1000), tag: "other" },
        ],
        ccss: "5.NBT.A.1",
        correctFeedback: "Yes — place value tells you how much a digit is worth.",
        feedback: `The digit ${d1} sits in the hundreds place, so its value is ${d1} × 100 = ${correct}.`,
      };
    },
  },
  {
    id: "decimal-divide",
    strand: "number",
    tier: "current",
    label: "dividing decimals",
    topics: ["decimal", "divide", "dividing", "division"],
    gen: (rng) => {
      const n = randInt(rng, 2, 9); // divisor
      const qd = randInt(rng, 2, 9); // quotient in tenths
      const q = qd / 10; // 0.2 .. 0.9
      const dividend = fmt(q * n);
      const correct = fmt(q);
      return {
        q: `What is ${dividend} ÷ ${n}?`,
        correct,
        distractors: [
          { value: fmt(q * 10), tag: "misplaces decimal in division" },
          { value: fmt(q / 10), tag: "misplaces decimal in division" },
          { value: fmt(n), tag: "other" },
          { value: fmt(q + 0.1), tag: "other" },
        ],
        ccss: "6.NS.B.3",
        correctFeedback: "Nice — you kept the decimal point lined up.",
        feedback: `Line up the decimal: ${dividend} ÷ ${n} splits ${dividend} into ${n} equal parts, so the answer is a bit less than 1, not a whole number. It is ${correct}.`,
      };
    },
  },
  {
    id: "add-unlike-fractions",
    strand: "number",
    tier: "review",
    label: "adding fractions",
    gen: (rng) => {
      const a = pick(rng, [2, 3, 4, 5, 6]);
      let b = pick(rng, [2, 3, 4, 5, 6]);
      while (b === a) b = pick(rng, [2, 3, 4, 5, 6]);
      const correct = frac(a + b, a * b); // 1/a + 1/b = (a+b)/(ab)
      const cands: Candidate[] = [
        { value: `2/${a + b}`, tag: "adds denominators when adding fractions" },
        { value: `${a + b}/${a * b}`, tag: "other" }, // did not simplify
        { value: `2/${a * b}`, tag: "other" },
        { value: `${a}/${b}`, tag: "other" },
      ];
      return {
        q: `What is 1/${a} + 1/${b}?`,
        correct,
        distractors: cands,
        ccss: "5.NF.A.1",
        correctFeedback: "Great — you found a common denominator first.",
        feedback: `You cannot add the tops and bottoms straight across. Rewrite with a common denominator of ${a * b}: ${b}/${a * b} + ${a}/${a * b} = ${correct}.`,
      };
    },
  },
  // ── current (Q4/Q5): the day's topic at an entry level, misconception-tagged ─
  {
    id: "integer-subtract",
    strand: "number",
    tier: "current",
    label: "subtracting integers",
    topics: ["integer", "negative", "negatives", "subtracting integers"],
    gen: (rng) => {
      const a = randInt(rng, 1, 9);
      const y = randInt(rng, 1, 9);
      const correct = fmt(-a - y); // (-a) - y = -(a+y)
      return {
        q: `What is (-${a}) - ${y}?`,
        correct,
        distractors: [
          { value: fmt(y - a), tag: "sign errors with negatives" },
          { value: fmt(a + y), tag: "sign errors with negatives" },
          { value: fmt(a - y), tag: "other" },
          { value: fmt(-a + y), tag: "other" },
        ],
        ccss: "6.NS.C.5",
        correctFeedback: "Yes — subtracting made it more negative.",
        feedback: `Start at -${a} and go DOWN ${y} more on the number line. Moving further below zero gives ${correct}.`,
      };
    },
  },
  {
    id: "rectangle-area",
    strand: "geometry",
    tier: "current",
    label: "area of a rectangle",
    topics: ["area", "rectangle", "perimeter", "geometry", "shape"],
    gen: (rng) => {
      const w = randInt(rng, 3, 12);
      let l = randInt(rng, 3, 12);
      while (l === w) l = randInt(rng, 3, 12);
      const correct = fmt(w * l);
      return {
        q: `A rectangle is ${l} units long and ${w} units wide. What is its AREA, in square units?`,
        correct,
        distractors: [
          { value: fmt(2 * (w + l)), tag: "confuses area vs perimeter" },
          { value: fmt(w + l), tag: "other" },
          { value: fmt(2 * w * l), tag: "other" },
        ],
        ccss: "6.G.A.1",
        correctFeedback: "Right — area covers the inside, length times width.",
        feedback: `Area is the space inside: length × width = ${l} × ${w} = ${correct} square units. Adding the sides would give the perimeter instead.`,
      };
    },
  },
  {
    id: "triangle-area",
    strand: "geometry",
    tier: "current",
    label: "area of a triangle",
    topics: ["area", "triangle", "geometry", "shape"],
    gen: (rng) => {
      let b = randInt(rng, 3, 12);
      let h = randInt(rng, 2, 10);
      while ((b * h) % 2 !== 0) {
        b = randInt(rng, 3, 12);
        h = randInt(rng, 2, 10);
      }
      const correct = fmt((b * h) / 2);
      return {
        q: `A triangle has a base of ${b} and a height of ${h}. What is its area?`,
        correct,
        distractors: [
          { value: fmt(b * h), tag: "forgets to halve base × height for triangle area" },
          { value: fmt(b + h), tag: "other" },
          { value: fmt(2 * b * h), tag: "other" },
        ],
        ccss: "6.G.A.1",
        correctFeedback: "Perfect — you remembered to take half.",
        feedback: `A triangle is half of a rectangle with the same base and height: ${b} × ${h} = ${b * h}, then halve it → ${correct}.`,
      };
    },
  },
];

// ── assembly ─────────────────────────────────────────────────────────────────
// Guarantee exactly 4 distinct choices: correct + 3 distractors. Distractors
// that collide with the correct answer or each other are dropped; if that
// leaves fewer than 3, we fill with clearly-labelled "other" numeric nudges.
function assembleChoices(rng: RNG, correct: string, candidates: Candidate[]) {
  const seen = new Set([correct]);
  const chosen: Candidate[] = [];
  for (const c of candidates) {
    if (chosen.length >= 3) break;
    if (!seen.has(c.value)) {
      seen.add(c.value);
      chosen.push(c);
    }
  }
  const asNum = Number(correct);
  let bump = 1;
  while (chosen.length < 3) {
    const v = Number.isFinite(asNum) ? fmt(asNum + bump) : `${correct}-${bump}`;
    bump += 1;
    if (seen.has(v)) continue;
    seen.add(v);
    chosen.push({ value: v, tag: "other" });
  }
  const tagByValue: Record<string, Misconception> = {};
  chosen.forEach((c) => {
    tagByValue[c.value] = c.tag;
  });
  const choices = shuffle(rng, [correct, ...chosen.map((c) => c.value)]);
  return { choices, tagByValue };
}

function toMC(item: Item, rng: RNG, withMisconceptions: boolean): WarmupMC {
  const { choices, tagByValue } = assembleChoices(rng, item.correct, item.distractors);
  const misconceptions: Record<string, string> = {};
  if (withMisconceptions) {
    choices.forEach((c) => {
      if (c !== item.correct && tagByValue[c]) misconceptions[c] = tagByValue[c];
    });
  }
  return {
    q: item.q,
    type: "multiple_choice",
    choices,
    correct: item.correct,
    ccss: item.ccss,
    misconceptions,
    feedback: item.feedback,
    correctFeedback: item.correctFeedback,
    points: 1,
  };
}

// Q6: thoughtful, non-googleable prompts that ask for reasoning, keyed to the
// day's strand so the question connects to the focus.
const THOUGHT_PROMPTS: Record<Strand, string[]> = {
  number: [
    "Explain, using an example, why 0.5 and 1/2 are the same amount.",
    "A classmate says the decimal point doesn't really matter when you divide. Are they right? Use an example to explain.",
    "Why can subtracting a number sometimes make the answer larger, and sometimes smaller? Give an example of each.",
  ],
  geometry: [
    "Two rectangles have the SAME perimeter but DIFFERENT areas. Explain how that's possible, with an example.",
    "A classmate says a shape with a bigger perimeter must have a bigger area. Are they right? Explain with an example.",
    "Describe, in your own words, a strategy for finding the area of a shape that isn't a plain rectangle.",
  ],
};

function strandFor(strandParam: string | undefined, topic: string | undefined, rng: RNG): Strand {
  const p = (strandParam || "").toLowerCase();
  if (p.startsWith("geo")) return "geometry";
  if (p.startsWith("num")) return "number";
  const t = (topic || "").toLowerCase();
  if (/area|perimeter|triangle|rectangle|geometry|coordinate|polygon|volume|shape/.test(t)) return "geometry";
  if (/fraction|decimal|integer|divis|divide|multipl|number|operation|negative|percent|ratio/.test(t)) return "number";
  return rng() < 0.5 ? "number" : "geometry";
}

// "current" (Q4/Q5) templates for the day: prefer ones whose topic keywords
// match the lesson topic; fall back to the focus strand, then any current one —
// so a blank or placeholder topic still yields a valid entry-level pair.
function currentTemplatesFor(topic: string | undefined, focus: Strand): Template[] {
  const t = (topic || "").toLowerCase();
  const current = TEMPLATES.filter((x) => x.tier === "current");
  const byTopic = current.filter((x) => (x.topics || []).some((k) => t.includes(k)));
  if (byTopic.length) return byTopic;
  const byStrand = current.filter((x) => x.strand === focus);
  if (byStrand.length) return byStrand;
  return current;
}

function pickFrom(rng: RNG, pool: Template[], used: Set<string>): Template {
  const fresh = pool.filter((t) => !used.has(t.id));
  const t = pick(rng, fresh.length ? fresh : pool); // reuse (with fresh numbers) only if the pool is exhausted
  used.add(t.id);
  return t;
}

export interface BuildOptions {
  topic?: string;
  strand?: string;
  prevTopic?: string; // reserved: retention Q4/Q5 from the previous taught day
  seed?: string;
  date?: string;
}

// Assemble the day's warm-up along the confidence-first difficulty ladder:
//   Q1,Q2 fluency gimmes · Q3 a 4th/5th grade review skill · Q4,Q5 the current
//   topic at an entry level (misconception-tagged data pull) · Q6 a thoughtful
//   short answer. Always returns a complete, valid, correct set.
export function buildWarmupSet(opts: BuildOptions = {}): WarmupSet {
  const seed = opts.seed || `${opts.topic || ""}|${opts.date || ""}`;
  const rng = mulberry32(hashSeed(seed || "bdm-warmup"));
  const focus = strandFor(opts.strand, opts.topic, rng);

  const fluency = TEMPLATES.filter((t) => t.tier === "fluency");
  const review = TEMPLATES.filter((t) => t.tier === "review");
  const current = currentTemplatesFor(opts.topic, focus);

  const used = new Set<string>();
  const t1 = pickFrom(rng, fluency, used);
  const t2 = pickFrom(rng, fluency, used);
  const t3 = pickFrom(rng, review, used);
  const t4 = pickFrom(rng, current, used);
  const t5 = pickFrom(rng, current, used);

  const questions: WarmupQuestion[] = [
    toMC(t1.gen(rng), rng, false), // Q1 fluency
    toMC(t2.gen(rng), rng, false), // Q2 fluency
    toMC(t3.gen(rng), rng, true), // Q3 review — tag if it carries a real misconception
    toMC(t4.gen(rng), rng, true), // Q4 current — data pull
    toMC(t5.gen(rng), rng, true), // Q5 current — data pull
    { q: pick(rng, THOUGHT_PROMPTS[focus] || THOUGHT_PROMPTS.number), type: "short_answer", correct: "", points: 0 },
  ];

  return {
    dailyTopic: opts.topic || `${focus} focus`,
    strand: focus,
    reviewTopics: [t3.label],
    questions,
  };
}

// exposed for the golden test
export const __TEMPLATE_IDS = TEMPLATES.map((t) => t.id);
