// Golden-file test for src/lib/mastery.ts against the Python prototype
// (build_dashboard.py). Run: npm run test:mastery
// 1) EWMA replay must match the Python output on all 25 mock students × 4 domains.
// 2) Stage gates must enforce the teacher's mastery semantics.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const m = require(path.join(root, ".tmp-mastery", "mastery.js"));
const golden = JSON.parse(readFileSync(path.join(root, "scripts", "fixtures", "mastery-golden.json"), "utf8"));

let failures = 0;
const fail = (msg) => { failures += 1; console.error("  ✗", msg); };

// --- 1. EWMA golden replay (warm-ups only, α must resolve to 0.30) -----------
let checked = 0;
for (const stu of golden.students) {
  const { percent } = m.replayDomains(stu.init, stu.events);
  for (const d of m.DOMAINS) {
    checked += 1;
    if (Math.abs(percent[d] - stu.expected[d]) > 1e-6) {
      fail(`${stu.name} / ${d}: got ${percent[d]}, expected ${stu.expected[d]}`);
    }
  }
}
console.log(`EWMA golden replay: ${golden.students.length} students, ${golden.totalEvents} events, ${checked} domain values checked`);

// --- 2. scaleToMastery port ---------------------------------------------------
const s2m = [
  [480, 5],          // 0% → floor 5
  [660, 98],         // 100% → ceiling 98
  [570, 50],         // midpoint
  ["n/a", 50],       // unparseable → 50 fallback
];
for (const [input, expected] of s2m) {
  const got = m.scaleToMastery(input);
  if (Math.abs(got - expected) > 1e-9) fail(`scaleToMastery(${input}) = ${got}, expected ${expected}`);
}

// --- 3. Stage gates (the teacher's mastery semantics) -------------------------
const W = (at, pct) => ({ at, domain: "Number and Operations", source: "warmup", scorePct: pct });
const T2 = (at, pct, sbac) => ({ at, domain: "Number and Operations", source: "tier2", scorePct: pct, sbacCorrect: sbac });
const cases = [
  ["no evidence → not_started", [], "not_started"],
  ["2 warm-ups → developing", [W("2026-08-10", 100), W("2026-08-11", 100)], "developing"],
  ["4 perfect warm-ups, no checkpoint → approaching (accuracy ceiling)",
    [W("2026-08-10", 100), W("2026-08-11", 100), W("2026-08-12", 100), W("2026-08-13", 100)], "approaching"],
  ["checkpoint ≥80 → mastered", [W("2026-08-10", 80), T2("2026-08-20", 85, false)], "mastered"],
  ["two ≥80s spanning 30d + SBAC item → complete",
    [T2("2026-08-20", 85, true), T2("2026-09-19", 90, false)], "complete"],
  ["two ≥80s only 10d apart → mastered (not sustained yet)",
    [T2("2026-08-20", 85, true), T2("2026-08-30", 90, false)], "mastered"],
  ["two ≥80s spanning 30d but no SBAC item correct → mastered (no transfer)",
    [T2("2026-08-20", 85, false), T2("2026-09-19", 90, false)], "mastered"],
  ["mastered then bombs latest checkpoint (<50) → approaching (regression)",
    [T2("2026-08-20", 85, true), T2("2026-09-19", 40, false)], "approaching"],
  ["checkpoint attempted at 70 → approaching", [T2("2026-08-20", 70, false)], "approaching"],
];
for (const [label, events, expected] of cases) {
  const got = m.deriveStage(events);
  if (got !== expected) fail(`stage: ${label} — got '${got}'`);
}
console.log(`Stage-gate cases: ${cases.length} checked`);

// --- 4. flags port -------------------------------------------------------------
if (m.flagFor(90, 10, 30) !== "not_submitting") fail("flagFor: sub-50% rate should flag not_submitting");
if (m.flagFor(40, 30, 30) !== "consistently_low") fail("flagFor: mean <45 should flag consistently_low");
if (m.flagFor(60, 30, 30) !== "on_track") fail("flagFor: healthy student should be on_track");

if (failures) { console.error(`\nFAIL — ${failures} mismatch(es)`); process.exit(1); }
console.log("\nPASS — TypeScript engine matches the Python prototype + stage gates hold.");
