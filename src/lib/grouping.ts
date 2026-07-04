// Live grouping engine — ports the prototype's clustering + archetype logic
// (Big Dog Math - Mock Data/_clusters.json + AI_Next_Moves_POC.md).
// Pure functions, no dependencies; verified by scripts/grouping-golden.mjs
// against the prototype's ground-truth archetypes for all 25 mock students.
//
// Design (locked): misconception tags are a finite vocabulary → exact-match
// clustering; a student joins a cluster after 2+ occurrences of the same tag;
// each (misconception × archetype) pair gets a TEMPLATED next move.

export interface WorkEvent {
  at: string; // ISO date
  score: number; // 0–5 warm-up score
  misconception: string | null;
}

export interface StudentWork {
  studentId?: string;
  name: string;
  events: WorkEvent[];
}

export type Archetype = "high" | "strong_misc" | "growth" | "leaper" | "plateau" | "low" | "nonsub";

export const ARCHETYPE_LABEL: Record<Archetype, string> = {
  high: "High steady",
  strong_misc: "Strong, recurring slip",
  growth: "Steady growth",
  leaper: "Leaper",
  plateau: "Plateau",
  low: "Chronically low",
  nonsub: "Non-submitter",
};

// Thresholds (tuned against the prototype fixture — change with care, the
// golden test will catch drift).
export const GROUPING_CONFIG = {
  nonSubmitterRate: 0.45, // < 45% of possible warm-ups submitted → logistics group
  strongAvg: 3.9,         // ≥ → high/strong_misc band
  lowAvg: 2.2,            // < → chronically low
  recurringCount: 2,      // same tag this many times → it's a pattern, not a slip
  leaperTrend: 1.5,       // leaper = dramatic climb (last-third − first-third)…
  leaperStartMax: 2.6,    // …from a genuinely low start
  plateauTrendMax: 0.5,   // recurring tag + not meaningfully climbing = stuck (flat OR sliding)
};

export interface StudentStats {
  name: string;
  studentId?: string;
  avg: number;
  n: number;
  submissionRate: number;
  trend: number; // last-third avg − first-third avg
  recurring: string[]; // misconception tags seen ≥ recurringCount times
  archetype: Archetype;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function computeStats(stu: StudentWork, possibleDays: number, cfg = GROUPING_CONFIG): StudentStats {
  const events = [...stu.events].sort((a, b) => (a.at < b.at ? -1 : 1));
  const scores = events.map((e) => e.score);
  const avg = mean(scores);
  const n = events.length;
  const submissionRate = n / Math.max(1, possibleDays);

  const third = Math.max(1, Math.floor(n / 3));
  const firstThird = n >= 6 ? mean(scores.slice(0, third)) : avg;
  const trend = n >= 6 ? mean(scores.slice(-third)) - firstThird : 0;

  const counts = new Map<string, number>();
  for (const e of events) if (e.misconception) counts.set(e.misconception, (counts.get(e.misconception) || 0) + 1);
  const recurring = [...counts.entries()].filter(([, c]) => c >= cfg.recurringCount).map(([t]) => t);

  let archetype: Archetype;
  if (submissionRate < cfg.nonSubmitterRate) archetype = "nonsub";
  else if (avg >= cfg.strongAvg) archetype = recurring.length ? "strong_misc" : "high";
  else if (avg < cfg.lowAvg) archetype = "low";
  else if (trend >= cfg.leaperTrend && firstThird < cfg.leaperStartMax) archetype = "leaper";
  else if (recurring.length && trend < cfg.plateauTrendMax) archetype = "plateau";
  else archetype = "growth";

  return { name: stu.name, studentId: stu.studentId, avg, n, submissionRate, trend, recurring, archetype };
}

// Templated next moves per archetype, phrased for a specific misconception —
// seeded from AI_Next_Moves_POC.md. {tag} is the misconception label.
export const NEXT_MOVE: Record<Archetype, string> = {
  strong_misc: "Targeted, not remedial: one 10-minute challenge that breaks \"{tag}\" (non-routine numbers), then have them explain WHY the shortcut fails to a partner — peer explanation locks it in.",
  leaper: "Catch it now: one quick manipulative-based reteach on \"{tag}\", then release — they're climbing; don't hold them back.",
  plateau: "This is likely why they're stuck: reteach \"{tag}\" with a visual model, then one week of 2-problem daily checks to break the plateau.",
  low: "Reteach from concrete: build \"{tag}\" physically with a manipulative before symbols. 1:1 or tiny group — and check the prerequisite skill first.",
  growth: "One targeted practice set on \"{tag}\" at their level; confirm with tomorrow's warm-up.",
  high: "Extension: challenge problems or peer-teaching — have them coach a classmate through \"{tag}\".",
  nonsub: "Logistics, not math: draft the parent contact and surface their completed work — ability isn't the issue, follow-through is.",
};

export interface Cluster {
  misconception: string;
  students: { name: string; studentId?: string; archetype: Archetype; avg: number; occurrences: number }[];
  moves: { archetype: Archetype; students: string[]; move: string }[];
}

export interface GroupingResult {
  clusters: Cluster[];
  nonSubmitters: { name: string; studentId?: string; submitted: number; possible: number; avgWhenSubmitting: number }[];
  stats: StudentStats[];
}

export function buildGroups(students: StudentWork[], possibleDays: number, cfg = GROUPING_CONFIG): GroupingResult {
  const stats = students.map((s) => computeStats(s, possibleDays, cfg));
  const statByName = new Map(stats.map((s) => [s.name, s]));

  // cluster: misconception tag → students with ≥ recurringCount occurrences
  const byTag = new Map<string, { name: string; studentId?: string; occurrences: number }[]>();
  for (const stu of students) {
    const counts = new Map<string, number>();
    for (const e of stu.events) if (e.misconception) counts.set(e.misconception, (counts.get(e.misconception) || 0) + 1);
    for (const [tag, c] of counts) {
      if (c < cfg.recurringCount) continue;
      (byTag.get(tag) || byTag.set(tag, []).get(tag)!).push({ name: stu.name, studentId: stu.studentId, occurrences: c });
    }
  }

  const clusters: Cluster[] = [...byTag.entries()]
    .filter(([, members]) => members.length >= 2) // a cluster is a GROUP — singletons stay individual
    .map(([tag, members]) => {
      const enriched = members
        .map((m) => ({ ...m, archetype: statByName.get(m.name)?.archetype || ("growth" as Archetype), avg: statByName.get(m.name)?.avg || 0 }))
        .sort((a, b) => a.avg - b.avg);
      const byArch = new Map<Archetype, string[]>();
      for (const m of enriched) (byArch.get(m.archetype) || byArch.set(m.archetype, []).get(m.archetype)!).push(m.name);
      const moves = [...byArch.entries()].map(([arch, names]) => ({
        archetype: arch,
        students: names,
        move: NEXT_MOVE[arch].replaceAll("{tag}", tag),
      }));
      return { misconception: tag, students: enriched, moves };
    })
    .sort((a, b) => b.students.length - a.students.length);

  const nonSubmitters = stats
    .filter((s) => s.archetype === "nonsub")
    .map((s) => ({
      name: s.name,
      studentId: s.studentId,
      submitted: s.n,
      possible: possibleDays,
      avgWhenSubmitting: Math.round(s.avg * 10) / 10,
    }));

  return { clusters, nonSubmitters, stats };
}
