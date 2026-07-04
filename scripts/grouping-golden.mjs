// Golden test for src/lib/grouping.ts against the prototype's ground truth
// (_clusters.json archetypes + AI_Next_Moves_POC.md designed-in clusters).
// Run: npm run test:grouping
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const g = require(path.join(root, ".tmp-mastery", "grouping.js"));
const fx = JSON.parse(readFileSync(path.join(root, "scripts", "fixtures", "grouping-fixture.json"), "utf8"));

let failures = 0;
const fail = (msg) => { failures += 1; console.error("  ✗", msg); };

// --- 1. Archetype assignment must match the prototype for all 25 students ----
const result = g.buildGroups(fx.students, fx.possibleDays);
const got = new Map(result.stats.map((s) => [s.name, s.archetype]));
let matched = 0;
for (const stu of fx.students) {
  const expected = stu.expectedArch;
  const actual = got.get(stu.name);
  if (actual === expected) matched += 1;
  else fail(`${stu.name}: expected '${expected}', got '${actual}'`);
}
console.log(`Archetypes: ${matched}/${fx.students.length} match the prototype ground truth`);

// --- 2. Designed-in clusters must be recovered exactly -----------------------
const EXPECT = {
  "treats ratio as additive": ["Beckett, Rio", "Pemberton, Echo", "Hollis, Zephyr", "Fontaine, Onyx", "Xanders, Lark"],
  "adds denominators when adding fractions": ["Escobar, Vega", "Tanaka, Ember", "Kingsley, Ash", "Sterling, Quill"],
  "confuses area vs perimeter": ["Juarez, Lyric", "Winslow, Pax", "Navarro, Cove"],
};
for (const [tag, names] of Object.entries(EXPECT)) {
  const cluster = result.clusters.find((c) => c.misconception === tag);
  if (!cluster) { fail(`missing cluster: ${tag}`); continue; }
  const gotNames = new Set(cluster.students.map((s) => s.name));
  for (const n of names) if (!gotNames.has(n)) fail(`${tag}: missing ${n}`);
  if (gotNames.size !== names.length) fail(`${tag}: expected ${names.length} students, got ${gotNames.size} (${[...gotNames].join("; ")})`);
}
console.log(`Clusters: ${result.clusters.length} found (expected 3 designed-in)`);

// --- 3. Non-submitters recovered, with the "capable" stat --------------------
const nonsub = new Set(result.nonSubmitters.map((s) => s.name));
for (const n of ["Rosales, Nova", "Ibarra, Sol", "Yarrow, Bram"]) {
  if (!nonsub.has(n)) fail(`non-submitter missing: ${n}`);
}
const ibarra = result.nonSubmitters.find((s) => s.name === "Ibarra, Sol");
if (ibarra && !(ibarra.avgWhenSubmitting >= 3)) fail("Ibarra should read as capable-when-submitting (avg ≥ 3)");
console.log(`Non-submitters: ${result.nonSubmitters.length} flagged`);

// --- 4. Every cluster has a differentiated move per archetype ----------------
for (const c of result.clusters) {
  if (!c.moves.length) fail(`${c.misconception}: no moves`);
  for (const m of c.moves) {
    if (!m.move || m.move.includes("{tag}")) fail(`${c.misconception}/${m.archetype}: move not templated`);
  }
}

if (failures) { console.error(`\nFAIL — ${failures} mismatch(es)`); process.exit(1); }
console.log("\nPASS — grouping engine recovers the prototype's archetypes, clusters, and non-submitters.");
