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
 * wrong for writing "$48.00" instead of "48" or "h>=48" without the space.
 * Deliberately conservative: it never reorders terms, so "3x + 2" and "2 + 3x"
 * stay different and the teacher can override on the board.
 */
export function normalizeAnswer(raw: string): string {
  let s = String(raw ?? "").trim().toLowerCase();
  s = s.replace(/[$,]/g, "");
  s = s.replace(/−/g, "-");      // real minus glyph -> hyphen
  s = s.replace(/[‘’]/g, "'");
  s = s.replace(/\s+/g, " ");
  s = s.replace(/\s*([+\-*/=<>:])\s*/g, "$1");  // "4x + 3" -> "4x+3"
  s = s.replace(/^the\s+/, "");
  s = s.replace(/[.!?]+$/, "");
  // Trailing zeros on a decimal: "48.00" -> "48", "22.50" -> "22.5"
  if (/^-?\d+\.\d+$/.test(s)) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
}

export function gradeAnswer(submitted: string, correct: string): boolean {
  const a = normalizeAnswer(submitted);
  const b = normalizeAnswer(correct);
  if (!a) return false;
  if (a === b) return true;
  // Same number written differently ("0.5" vs ".5", "60" vs "60.0").
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return false;
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
