// Number-sequence format for the Ladder Method tool's Factor Trees mode.
//
// One string - "24, 36, 60" - travels the same three ways as the Distributive
// Area series (see lib/distributiveProblems): the ?set= URL param on
// /ladder-method, the teacher's field in the /control tool setup, and the
// live_flow tool config broadcast to joined devices. Students never see the
// list; they get one number at a time.

export const FACTOR_TREE_MIN = 4;
export const FACTOR_TREE_MAX = 200;
export const FACTOR_TREE_MAX_COUNT = 12;

// Forgiving on purpose - commas, semicolons, spaces, or newlines all separate;
// anything unreadable is skipped rather than failing the whole sequence.
// Primes are allowed (the tree is just the root, confirmed prime) but 0-3 and
// giants are clamped out.
export function parseFactorTreeSet(raw: string | null | undefined): number[] {
  if (!raw) return [];
  const out: number[] = [];
  for (const chunk of raw.split(/[\s,;]+/)) {
    if (!/^\d+$/.test(chunk)) continue;
    const n = Number(chunk);
    if (!Number.isFinite(n) || n < FACTOR_TREE_MIN || n > FACTOR_TREE_MAX) continue;
    out.push(n);
    if (out.length >= FACTOR_TREE_MAX_COUNT) break;
  }
  return out;
}

export function serializeFactorTreeSet(numbers: number[]): string {
  return numbers.join(",");
}

export function normalizeFactorTreeSet(raw: string | null | undefined): string {
  return serializeFactorTreeSet(parseFactorTreeSet(raw));
}
