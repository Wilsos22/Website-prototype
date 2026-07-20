// City Routes - the private differentiated-release engine (M1.T1+ lessons).
//
// After the two-question readiness check, students split into three temporary
// support routes. Each route is announced only as a CITY NAME so no public
// screen ever shows a score, tier, misconception label, or ability-group
// language. Both the city names and the city-to-route mapping rotate between
// lessons, so a city never becomes a permanent group label.
//
// This module is pure - no imports, no I/O, no Date/random - so it can be
// compiled and tested in isolation like mastery.ts and grouping.ts. All
// persistence lives in supabase/city-routes.sql (server-only tables) and the
// /api/live/city-routes (teacher) and /api/session/city-route (student)
// route handlers.

export type CityRouteId = "teacher" | "partner" | "independent";

export const CITY_ROUTE_IDS: CityRouteId[] = ["teacher", "partner", "independent"];

// The editable ten-name bank. Swap any entry here - the rotation only cares
// that entries are distinct. Ten is the contract size; more is fine.
//
// Park names rather than city names on purpose: city names carry regional and
// socioeconomic associations that can accidentally map onto the students being
// sorted, which is exactly what this feature exists to avoid. Names that imply
// ranking or achievement (Olympic, Pinnacles) or carry religious or negative
// readings (Zion, Badlands, Death Valley) are deliberately excluded.
export const CITY_BANK: string[] = [
  "Yosemite",
  "Acadia",
  "Redwood",
  "Glacier",
  "Sequoia",
  "Denali",
  "Saguaro",
  "Arches",
  "Everglades",
  "Shenandoah",
];

export interface CityRouteMeta {
  // Teacher-facing label. Never sent to a student surface.
  label: string;
  // Student-facing card fields: physical destination, required materials,
  // first action. EDIT THESE to match the real classroom. The release order
  // (teacher-guided first, partner 15 seconds later, independent seated) is
  // encoded in the first actions per the lesson flow.
  destination: string;
  materials: string;
  firstAction: string;
}

export const ROUTE_DEFAULTS: Record<CityRouteId, CityRouteMeta> = {
  teacher: {
    label: "Teacher-guided",
    destination: "The small-group table",
    materials: "Bring a pencil. Today's materials are already at the table.",
    firstAction: "Go now. Your group moves first.",
  },
  partner: {
    label: "Scaffolded partner",
    destination: "The partner station",
    materials: "Bring your pencil and today's paper set.",
    firstAction: "Count 15 seconds after the first group moves, then go.",
  },
  independent: {
    label: "Independent",
    destination: "Stay at your seat",
    materials: "Pencil and today's paper set.",
    firstAction: "Start the first required problem now.",
  },
};

// One city in a prepared run: the city name, its (private) route meaning, and
// the student-safe card copy resolved at preparation time so a run is a
// stable snapshot even if the defaults change later.
export interface CityStop extends CityRouteMeta {
  city: string;
  route: CityRouteId;
}

function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministically choose three cities and rotate their route meanings.
// Same (lessonCode, salt) always yields the same trio, so reconnects and
// re-renders agree; "Shuffle cities" bumps the salt for a new deal; a new
// lesson code rotates both the names and the meanings on its own.
export function rotateCities(lessonCode: string, salt: number, bank: string[] = CITY_BANK): CityStop[] {
  const rand = mulberry32(hashSeed(`${lessonCode || "lesson"}|${salt}`));
  const pool = [...new Set(bank.filter((c) => c && c.trim()))];
  const picked: string[] = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    picked.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }
  const routes: CityRouteId[] = [...CITY_ROUTE_IDS];
  for (let i = routes.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [routes[i], routes[j]] = [routes[j], routes[i]];
  }
  return picked.map((city, i) => ({ city, route: routes[i], ...ROUTE_DEFAULTS[routes[i]] }));
}

export interface ReadinessEvidence {
  studentKey: string;
  name: string;
  // One entry per readiness question, in lesson order.
  // true = correct, false = incorrect, null = no answer recorded.
  correct: (boolean | null)[];
  // Private Fist-to-Five rating 0-5, or null if not submitted.
  fist: number | null;
}

export interface CityRouteRecommendation {
  studentKey: string;
  name: string;
  route: CityRouteId | null;
  // No readiness answers at all - the teacher assigns by hand.
  needsAssignment: boolean;
  // Correct on everything but reported Fist-to-Five 0-2. Per the lesson
  // design this NEVER auto-lowers the route; it flags a quick teacher check.
  lowConfidence: boolean;
  correctCount: number;
  answeredCount: number;
  questionCount: number;
}

// The locked route rule from the lesson pages: all correct = independent,
// none correct = teacher-guided, anything between = scaffolded partner.
// An unanswered question counts against correctness (it is not evidence of
// readiness), but a student with NO answers is "needs assignment" rather
// than silently routed to the teacher table.
export function recommendRoute(evidence: ReadinessEvidence): CityRouteRecommendation {
  const questionCount = evidence.correct.length;
  const answeredCount = evidence.correct.filter((c) => c !== null).length;
  const correctCount = evidence.correct.filter((c) => c === true).length;

  if (!questionCount || !answeredCount) {
    return {
      studentKey: evidence.studentKey,
      name: evidence.name,
      route: null,
      needsAssignment: true,
      lowConfidence: false,
      correctCount: 0,
      answeredCount,
      questionCount,
    };
  }

  const route: CityRouteId =
    correctCount === questionCount ? "independent" : correctCount === 0 ? "teacher" : "partner";

  return {
    studentKey: evidence.studentKey,
    name: evidence.name,
    route,
    needsAssignment: false,
    lowConfidence: route === "independent" && evidence.fist !== null && evidence.fist <= 2,
    correctCount,
    answeredCount,
    questionCount,
  };
}

export function stopForRoute(stops: CityStop[], route: CityRouteId): CityStop | null {
  return stops.find((s) => s.route === route) || null;
}
