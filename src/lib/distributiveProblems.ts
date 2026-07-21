// Problem-set format for the Distributive Area Method tool.
//
// One string — "24x7, 16x8, 32x4" — travels three ways and parses the same in
// all of them: the ?set= URL param on /distributive-area, the teacher's field
// in the /control tool setup, and the live_flow tool config broadcast to joined
// student devices. First number is the one students split, second is the
// outside factor.

export interface DistributiveProblem {
  top: number;  // the factor students cut into two parts
  side: number; // the outside factor, stays whole
}

export const DISTRIBUTIVE_TOP_MIN = 3;
export const DISTRIBUTIVE_TOP_MAX = 40;
export const DISTRIBUTIVE_SIDE_MIN = 2;
export const DISTRIBUTIVE_SIDE_MAX = 20;
export const DISTRIBUTIVE_MAX_PROBLEMS = 12;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Forgiving on purpose — the teacher may type "24x7, 16 x 8" or use * instead
// of x, and anything unreadable is skipped rather than failing the whole set.
export function parseDistributiveSet(raw: string | null | undefined): DistributiveProblem[] {
  if (!raw) return [];
  const out: DistributiveProblem[] = [];
  for (const chunk of raw.split(/[,;\n]+/)) {
    const m = chunk.trim().match(/^(\d+)\s*[x*×]\s*(\d+)$/i);
    if (!m) continue;
    const top = Math.round(Number(m[1]));
    const side = Math.round(Number(m[2]));
    if (!Number.isFinite(top) || !Number.isFinite(side) || top < DISTRIBUTIVE_TOP_MIN) continue;
    out.push({
      top: clamp(top, DISTRIBUTIVE_TOP_MIN, DISTRIBUTIVE_TOP_MAX),
      side: clamp(side, DISTRIBUTIVE_SIDE_MIN, DISTRIBUTIVE_SIDE_MAX),
    });
    if (out.length >= DISTRIBUTIVE_MAX_PROBLEMS) break;
  }
  return out;
}

export function serializeDistributiveSet(problems: DistributiveProblem[]): string {
  return problems.map((p) => `${p.top}x${p.side}`).join(",");
}

// Round-trips whatever the teacher typed into the canonical form, so the value
// stored on the session and the value in a shared link always match.
export function normalizeDistributiveSet(raw: string | null | undefined): string {
  return serializeDistributiveSet(parseDistributiveSet(raw));
}
