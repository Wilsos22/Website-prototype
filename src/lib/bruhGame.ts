// Pure game logic for BRUH, the live team review game.
//
// Everything here is deterministic and dependency-free so it can run on the
// server (grading, the reward draw, the spotlight pick) as well as in the
// browser (sizing the question, choosing vocab). Nothing in this file touches
// Supabase or the DOM.
//
// The rule that matters: the SERVER decides. A student's browser never grades
// its own answer, never draws its own card, and never picks who explains. The
// animations on the board are theatre played over a result that already exists.

export interface BruhReward {
  key: string;
  title: string;
  desc: string;
  kind: "gain" | "loss" | "wild";
  /** Signed hundreds. "zero" wipes the team's score to 0. */
  pts: number | "zero";
  scope: "self" | "others" | "gift";
  sound: string | null;
}

// Every card is a signed hundreds value so the slot can land on it. The wild
// cards land on an innocent-looking number and the rule is the twist.
export const BRUH_REWARDS: BruhReward[] = [
  { key: "p100", title: "+100", desc: "Straight onto your score.", kind: "gain", pts: 100, scope: "self", sound: "gain" },
  { key: "p200", title: "+200", desc: "Straight onto your score.", kind: "gain", pts: 200, scope: "self", sound: "gain" },
  { key: "p300", title: "+300", desc: "Straight onto your score.", kind: "gain", pts: 300, scope: "self", sound: "gain" },
  { key: "p400", title: "+400", desc: "Straight onto your score.", kind: "gain", pts: 400, scope: "self", sound: "gain" },
  { key: "p500", title: "+500", desc: "Straight onto your score.", kind: "gain", pts: 500, scope: "self", sound: "gain" },
  { key: "m100", title: "-100", desc: "Straight off your score.", kind: "loss", pts: -100, scope: "self", sound: "loss" },
  { key: "m200", title: "-200", desc: "Straight off your score.", kind: "loss", pts: -200, scope: "self", sound: "loss" },
  { key: "m300", title: "-300", desc: "Straight off your score.", kind: "loss", pts: -300, scope: "self", sound: "loss" },
  { key: "m400", title: "-400", desc: "Straight off your score.", kind: "loss", pts: -400, scope: "self", sound: "loss" },
  { key: "m500", title: "-500", desc: "Straight off your score.", kind: "loss", pts: -500, scope: "self", sound: "loss" },
  { key: "bruh", title: "BRUH.", desc: "Triple zero. Every point you had is gone.", kind: "loss", pts: "zero", scope: "self", sound: "bruh" },
  { key: "saver", title: "Life Saver", desc: "Not yours. Hand all of it to any other team you pick.", kind: "wild", pts: 200, scope: "gift", sound: "gain" },
  { key: "others", title: "Everybody Else", desc: "Every other team collects it. You get nothing.", kind: "wild", pts: 300, scope: "others", sound: "bruh" },
];

export function rewardByKey(key: string): BruhReward | null {
  return BRUH_REWARDS.find((r) => r.key === key) ?? null;
}

export function drawReward(): BruhReward {
  return BRUH_REWARDS[Math.floor(Math.random() * BRUH_REWARDS.length)];
}

/** Where each slot reel comes to rest. sign 0 = "+", 1 = the minus glyph. */
export function reelTargets(reward: BruhReward): { sign: number; hun: number; ten: number; one: number } {
  const n = Math.abs(reward.pts === "zero" ? 0 : reward.pts);
  return {
    sign: reward.pts === "zero" || reward.pts < 0 ? 1 : 0,
    hun: Math.floor(n / 100) % 10,
    ten: Math.floor(n / 10) % 10,
    one: n % 10,
  };
}

// ---------------------------------------------------------------------------
// Grading

/**
 * Squash a typed answer down to what it actually means, so a kid is not marked
 * wrong for spacing or capitals. Deliberately conservative: it never reorders
 * terms, so "3x + 2" and "2 + 3x" stay different and the teacher overrules on
 * the board if that was unfair.
 *
 * Note this does NOT strip "$" or units - those carry meaning and are handled
 * by splitValue/gradeAnswer.
 */
export function normalizeAnswer(raw: string): string {
  let s = String(raw ?? "").trim().toLowerCase();
  s = s.replace(/[−–—]/g, "-");   // minus / en / em dash -> hyphen
  s = s.replace(/[‘’]/g, "'");
  s = s.replace(/,/g, "");
  s = s.replace(/\s+/g, " ");
  s = s.replace(/\s*([+\-*/=<>:])\s*/g, "$1");   // "4x + 3" -> "4x+3"
  s = s.replace(/^the\s+/, "");
  s = s.replace(/[.!?]+$/, "");
  if (/^-?\d+\.\d+$/.test(s)) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
}

/**
 * The units a 6th grader might actually type, and every spelling worth
 * accepting. First entry of each row is the canonical form; matching is by
 * exact alias after lowercasing, so "8 FT", "8ft" and "8 Feet" all land on
 * "foot".
 *
 * Order matters only in that longer aliases are matched before shorter ones
 * (see canonUnit), so "sq ft" never gets read as "ft".
 */
const UNIT_ALIASES: Record<string, string[]> = {
  dollar: ["$", "dollar", "dollars", "usd", "buck", "bucks"],
  cent: ["cent", "cents", "¢"],
  percent: ["%", "percent", "pct", "percents"],
  degree: ["°", "deg", "degree", "degrees", "°f", "degrees f", "degree f", "degrees fahrenheit"],

  // length
  inch: ["in", "inch", "inches", '"'],
  foot: ["ft", "foot", "feet", "'"],
  yard: ["yd", "yds", "yard", "yards"],
  mile: ["mi", "mile", "miles"],
  millimeter: ["mm", "millimeter", "millimeters", "millimetre", "millimetres"],
  centimeter: ["cm", "centimeter", "centimeters", "centimetre", "centimetres"],
  meter: ["m", "meter", "meters", "metre", "metres"],
  kilometer: ["km", "kilometer", "kilometers", "kilometre", "kilometres"],

  // area
  "square inch": ["sq in", "sqin", "square inch", "square inches", "in2", "in^2", "in²"],
  "square foot": ["sq ft", "sqft", "square foot", "square feet", "ft2", "ft^2", "ft²"],
  "square yard": ["sq yd", "square yard", "square yards", "yd2", "yd^2", "yd²"],
  "square centimeter": ["sq cm", "square centimeter", "square centimeters", "cm2", "cm^2", "cm²"],
  "square meter": ["sq m", "square meter", "square meters", "m2", "m^2", "m²"],
  "square unit": ["square unit", "square units", "sq units", "sq unit", "units2", "units^2"],

  // weight
  ounce: ["oz", "ounce", "ounces"],
  pound: ["lb", "lbs", "pound", "pounds"],
  gram: ["g", "gram", "grams"],
  kilogram: ["kg", "kilogram", "kilograms"],

  // volume
  cup: ["cup", "cups"],
  pint: ["pt", "pint", "pints"],
  quart: ["qt", "quart", "quarts"],
  gallon: ["gal", "gallon", "gallons"],
  milliliter: ["ml", "milliliter", "milliliters", "millilitre", "millilitres"],
  liter: ["l", "liter", "liters", "litre", "litres"],

  // time
  second: ["s", "sec", "secs", "second", "seconds"],
  minute: ["min", "mins", "minute", "minutes"],
  hour: ["h", "hr", "hrs", "hour", "hours"],
  day: ["day", "days"],
  week: ["wk", "wks", "week", "weeks"],
  month: ["mo", "month", "months"],
  year: ["yr", "yrs", "year", "years"],

  // rates
  mph: ["mph", "mi/h", "miles per hour", "miles/hour", "miles an hour"],
  "per hour": ["/h", "per hour", "an hour", "each hour"],
  kph: ["kph", "km/h", "kilometers per hour"],

  // counting nouns that show up as answers
  point: ["point", "points", "pt", "pts"],
  page: ["page", "pages"],
  student: ["student", "students"],
  ticket: ["ticket", "tickets"],
  part: ["part", "parts"],
  question: ["question", "questions"],
  visit: ["visit", "visits"],
  boy: ["boy", "boys"],
  girl: ["girl", "girls"],
};

// alias -> canonical, longest alias first so "sq ft" wins over "ft".
const ALIAS_TO_CANON: [string, string][] = Object.entries(UNIT_ALIASES)
  .flatMap(([canon, aliases]) => aliases.map((a) => [a, canon] as [string, string]))
  .sort((x, y) => y[0].length - x[0].length);

/** Canonical unit for a scrap of trailing text, or "" if it is not a unit. */
export function canonUnit(raw: string): string {
  const s = String(raw ?? "").trim().toLowerCase().replace(/\.$/, "").replace(/\s+/g, " ");
  if (!s) return "";
  const hit = ALIAS_TO_CANON.find(([alias]) => alias === s);
  return hit ? hit[1] : "";
}

export interface SplitValue {
  /** The numeric part, or null when this is not a plain "number + unit". */
  num: number | null;
  /** Canonical unit, or "" when the value carries no unit. */
  unit: string;
}

/**
 * Read "8 feet", "$45.00", "1/2 cup" or "22.5" as a number plus a unit.
 *
 * Returns num:null for anything that is not cleanly a number and a RECOGNISED
 * unit - which is what keeps "3:4", "h >= 48" and "5r + 3s + 15" out of the
 * numeric path. Without that guard "3:4" would read as the number 3 and a bare
 * "3" would be graded correct.
 */
export function splitValue(raw: string): SplitValue {
  let s = String(raw ?? "").trim().toLowerCase();
  s = s.replace(/[−–—]/g, "-");
  s = s.replace(/,/g, "");
  s = s.replace(/[.!?]+$/, "");
  if (!s) return { num: null, unit: "" };

  // Leading currency: "$45", "$ 45.00"
  const money = s.match(/^-?\$\s*(-?\d+(?:\.\d+)?)\s*(.*)$/);
  if (money) {
    const rest = money[2].trim();
    // "$45 per hour" keeps its rate; "$45 banana" is not a value.
    const unit = rest ? canonUnit(rest) : "dollar";
    if (rest && !unit) return { num: null, unit: "" };
    const neg = s.startsWith("-");
    return { num: (neg ? -1 : 1) * Number(money[1]), unit: rest ? unit : "dollar" };
  }

  // Fraction: "1/2", "3/4 cup"
  const frac = s.match(/^(-?\d+)\s*\/\s*(\d+)\s*(.*)$/);
  if (frac) {
    const denom = Number(frac[2]);
    if (!denom) return { num: null, unit: "" };
    const rest = frac[3].trim();
    const unit = rest ? canonUnit(rest) : "";
    if (rest && !unit) return { num: null, unit: "" };
    return { num: Number(frac[1]) / denom, unit };
  }

  // Plain number with optional trailing unit: "8", "8 feet", "8ft"
  const plain = s.match(/^(-?\d+(?:\.\d+)?|-?\.\d+)\s*(.*)$/);
  if (!plain) return { num: null, unit: "" };
  const rest = plain[2].trim();
  if (!rest) return { num: Number(plain[1]), unit: "" };
  const unit = canonUnit(rest);
  if (!unit) return { num: null, unit: "" };   // trailing text is not a unit
  return { num: Number(plain[1]), unit };
}

/**
 * Grade a submission against the key.
 *
 * The rule that matters: **if the key names a unit, the student must name a
 * matching one.** An answer of "8 feet" is not satisfied by a bare "8" - the
 * unit is part of the answer. Any spelling of that unit is fine ("8 ft",
 * "8ft", "8 FEET"), and money must carry its sign ("$45", "45 dollars", but
 * not "45").
 *
 * If the key carries no unit, a bare number is what is wanted and a student who
 * adds a unit anyway is not punished for it.
 */
export function gradeAnswer(submitted: string, correct: string): boolean {
  const sub = String(submitted ?? "").trim();
  const key = String(correct ?? "").trim();
  if (!sub) return false;

  const k = splitValue(key);
  const s = splitValue(sub);

  if (k.num !== null && s.num !== null) {
    if (k.num !== s.num) return false;
    if (k.unit) return s.unit === k.unit;   // the key names a unit -> require it
    return true;                            // key is a bare number
  }
  // The key wants a unit but the submission is not even a number+unit.
  if (k.num !== null && s.num === null) return false;

  // Expressions, inequalities, ratios, words.
  return normalizeAnswer(sub) === normalizeAnswer(key);
}

// ---------------------------------------------------------------------------
// Vocabulary the explaining team has to use, matched to the question's topic.

const GENERIC_VOCAB = ["strategy", "operation", "because", "value", "check"];

export const VOCAB_BANKS: { match: RegExp; words: string[] }[] = [
  { match: /expression|term|combine|simplif|coefficient|evaluate|distribut/i,
    words: ["term", "like terms", "coefficient", "constant", "variable", "simplify"] },
  { match: /equation|solve/i,
    words: ["inverse operation", "isolate", "variable", "both sides", "solution", "check"] },
  { match: /ratio|proportion|equivalent/i,
    words: ["ratio", "equivalent", "scale factor", "multiply", "relationship"] },
  { match: /unit rate|rate|per\b|speed|mph/i,
    words: ["unit rate", "per", "divide", "compare", "quantity"] },
  { match: /percent|discount|tax/i,
    words: ["percent", "part", "whole", "out of 100", "proportion"] },
  { match: /inequal|at least|at most/i,
    words: ["inequality", "at least", "at most", "solution set", "boundary"] },
  { match: /area|perimeter|triangle|rectangle|parallelogram|square (feet|units)|side/i,
    words: ["area", "base", "height", "square units", "formula"] },
  { match: /order of operations|gems|grouping|exponent/i,
    words: ["grouping", "exponent", "left to right", "operation", "evaluate"] },
];

export function pickVocab(topic: string, question: string, count = 3): string[] {
  const hay = `${topic} ${question}`;
  const bank = VOCAB_BANKS.find((b) => b.match.test(hay));
  const words = [...(bank ? bank.words : GENERIC_VOCAB)];
  // Fisher-Yates: an unbiased shuffle, unlike sort(() => Math.random() - 0.5).
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }
  return words.slice(0, count);
}

// ---------------------------------------------------------------------------
// Question typography. The question is the whole point of the board, so a bare
// expression goes as large as the stage allows and even the longest word problem
// stays bigger than anything else on screen.

export interface BigQuestion {
  /** Small eyebrow above the headline, e.g. "Solve for x". */
  lead: string;
  /** The headline itself. */
  head: string;
  /** Supporting sentences, newline separated. */
  rest: string;
  /** True when the headline is pure math and should be set in mono. */
  expr: boolean;
  /** A CSS font-size expression. */
  size: string;
}

/**
 * Pure math, not prose. A run of 3+ letters means it is a sentence - that check
 * is what stops "Solve for x: x + 14 = 32" being sized like "2x = 16".
 */
export function isExprStr(s: string): boolean {
  return s.length <= 34
    && !/[A-Za-z]{3,}/.test(s)
    && /^[\d\w\s+\-*/=().^<>:,]+$/.test(s)
    && /[=+\-*/<>]/.test(s);
}

export function bigQ(question: string): BigQuestion {
  const parts = question.split(/(?<=[.?])\s+/);
  let head = parts[0] ?? "";
  const rest = parts.slice(1).join("\n");
  let lead = "";

  // "Solve for x: 2x + 7 = 21" - the instruction becomes the small line and the
  // equation becomes the headline, which is the shape most of the banks use.
  const m = head.match(/^([^:]{1,44}):\s*(.+)$/);
  if (m && isExprStr(m[2])) {
    lead = m[1];
    head = m[2];
  }

  const expr = isExprStr(head);
  const L = head.length || 1;
  // An expression is sized off its own length (mono advance is ~0.62em, the
  // column is ~76vw) so it fills the width on ONE line instead of wrapping
  // mid-equation.
  const fit = (76 / (L * 0.62)).toFixed(2);
  const size = expr
    ? `max(44px, min(215px, 13.5vw, ${fit}vw))`
    : L < 45 ? "clamp(56px, 8.4vw, 132px)"
    : L < 90 ? "clamp(43px, 6.2vw, 98px)"
    : "clamp(34px, 4.6vw, 76px)";

  return { lead, head, rest, expr, size };
}

// ---------------------------------------------------------------------------
// Scoring

export interface BruhScorable {
  id: string;
  score: number;
}

/**
 * What each team's score becomes once a card lands. Pure, so the outcome of a
 * draw can be reasoned about (and tested) without a database.
 *
 * Only the teams that actually change are returned.
 */
export function applyReward<T extends BruhScorable>(
  reward: BruhReward,
  teams: T[],
  pickedTeamId: string,
  giftTeamId: string,
): { id: string; score: number }[] {
  const out: { id: string; score: number }[] = [];
  const me = teams.find((t) => t.id === pickedTeamId);
  if (!me) return out;
  const pts = reward.pts === "zero" ? 0 : reward.pts;

  if (reward.scope === "self") {
    out.push({ id: me.id, score: reward.pts === "zero" ? 0 : me.score + pts });
    return out;
  }
  if (reward.scope === "others") {
    for (const t of teams) if (t.id !== me.id) out.push({ id: t.id, score: t.score + pts });
    return out;
  }
  // gift: the teacher names the recipient out loud; default to last place.
  // Never the drawer - that would quietly turn a wild card into a plain gain.
  const others = teams.filter((t) => t.id !== me.id);
  const chosen = others.find((t) => t.id === giftTeamId);
  const target = chosen ?? [...others].sort((a, b) => a.score - b.score)[0];
  if (target) out.push({ id: target.id, score: target.score + pts });
  return out;
}

// ---------------------------------------------------------------------------
// Teams

export const BRUH_TEAM_COLORS = [
  "#fcaf38", "#50a3a4", "#f95335", "#2f9e6f",
  "#7b6cf6", "#e0699a", "#4a90d9", "#c8801a",
];

export function teamColor(index: number): string {
  return BRUH_TEAM_COLORS[index % BRUH_TEAM_COLORS.length];
}

// ---------------------------------------------------------------------------
// Parsing a pasted bank: "number | topic | question | answer" per line.

export interface ParsedBank {
  questions: { n: number; topic: string; q: string; a: string }[];
  skipped: number;
}

export function parseBank(raw: string): ParsedBank {
  const questions: ParsedBank["questions"] = [];
  let skipped = 0;
  for (const line of String(raw ?? "").split("\n")) {
    if (!line.trim()) continue;
    const p = line.split("|").map((x) => x.trim());
    if (p.length < 4) { skipped += 1; continue; }
    const n = parseInt(p[0], 10);
    if (!Number.isFinite(n)) { skipped += 1; continue; }
    if (!p[2] || !p[3]) { skipped += 1; continue; }
    questions.push({ n, topic: p[1], q: p[2], a: p[3] });
  }
  questions.sort((a, b) => a.n - b.n);
  return { questions, skipped };
}

export function bankToText(questions: { n: number; topic: string; q: string; a: string }[]): string {
  return questions.map((q) => `${q.n} | ${q.topic} | ${q.q} | ${q.a}`).join("\n");
}
