import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const contract = require(path.join(root, ".tmp-mastery", "liveFlowContract.js"));

const expectedPollKinds = new Map([
  ["Short Answer", "short-answer"],
  ["Multiple Choice", "multiple-choice"],
  ["Fist to Five", "fist-to-five"],
]);

for (const mode of contract.LIVE_RESPONSE_MODES) {
  const expected = expectedPollKinds.get(mode) || null;
  const actual = contract.liveResponseModePollKind(mode);
  if (actual !== expected) {
    throw new Error(`${mode}: expected ${expected}, received ${actual}`);
  }
}

if (contract.liveAssignedToolRoute("Big Dog Math Ladder Method") !== "/ladder-method") {
  throw new Error("Assigned Ladder Method must resolve to the executable site tool.");
}
if (contract.liveAssignedToolRoute("Unmapped physical manipulative") !== null) {
  throw new Error("Unmapped physical tools must not invent a site route.");
}

const stems = contract.splitLiveFlowLines("- I noticed the factors, so...\n* I disagree because...");
if (stems.length !== 2 || stems[0] !== "I noticed the factors, so...") {
  throw new Error("Sentence stems must stay line-based and preserve commas.");
}

const vocabulary = contract.splitLiveFlowVocabulary("prime factorization, GCF\nLCM; shared factor");
if (vocabulary.join("|") !== "prime factorization|GCF|LCM|shared factor") {
  throw new Error("Vocabulary must split on lines, commas, and semicolons.");
}

console.log("PASS - live flow response modes and discussion support parsing match the Notion contract.");
