import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const contract = require(path.join(root, ".tmp-mastery", "liveFlowContract.js"));
const classroomPilot = require(path.join(root, ".tmp-mastery", "classroomPilot.js"));

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

const responseResolutionCases = [
  { mode: "", legacy: "short-answer", state: "question", expected: "short-answer" },
  { mode: "", legacy: "multiple-choice", state: "question", expected: "multiple-choice" },
  { mode: "None", legacy: "short-answer", state: "question", expected: null },
  { mode: "Paper", legacy: "short-answer", state: "question", expected: null },
  { mode: "Short Answer", legacy: "multiple-choice", state: "question", expected: "short-answer" },
  { mode: "", legacy: "", state: "question", expected: "short-answer" },
  { mode: "", legacy: "", state: "learning-check", expected: "fist-to-five" },
  { mode: "", legacy: "", state: "discussion", expected: null },
];
for (const testCase of responseResolutionCases) {
  const actual = contract.resolveLiveStepPollKind(testCase.mode, testCase.legacy, testCase.state);
  if (actual !== testCase.expected) {
    throw new Error(`${testCase.state}/${testCase.mode || "blank"}: expected ${testCase.expected}, received ${actual}`);
  }
}

const discussionProtocolCases = [
  { state: "error-analysis", label: "", expected: true },
  { state: "question", label: "Error Analysis", expected: true },
  { state: "question", label: "Try this problem", expected: false },
];
for (const testCase of discussionProtocolCases) {
  const actual = classroomPilot.usesDiscussionProtocol(testCase.state, testCase.label);
  if (actual !== testCase.expected) {
    throw new Error(`${testCase.state}/${testCase.label || "blank"}: expected discussion=${testCase.expected}, received ${actual}`);
  }
}

if (contract.liveAssignedToolRoute("Big Dog Math Ladder Method") !== "/ladder-method") {
  throw new Error("Assigned Ladder Method must resolve to the executable site tool.");
}
if (contract.liveAssignedToolRoute("Unmapped physical manipulative") !== null) {
  throw new Error("Unmapped physical tools must not invent a site route.");
}

const independentSupports = contract.liveIndependentSupportItems("independent", {
  selectedSuccessCriterion: "I can explain my strategy.",
  requiredDigitalWork: "Submit the one-question check.",
  optionalSupport: "   ",
  bigDogChallenge: "Compare two correct strategies.",
});
const independentSupportLabels = independentSupports.map((item) => item.label).join("|");
if (independentSupportLabels !== "Today's goal|Required digital work|Big Dog Challenge") {
  throw new Error(`Independent Chromebook supports were incomplete or did not hide blanks: ${independentSupportLabels}`);
}
if (contract.liveIndependentSupportItems("review", {
  requiredDigitalWork: "This must stay hidden outside independent work.",
}).length !== 0) {
  throw new Error("Independent Chromebook supports must stay hidden outside the Independent state.");
}
const legacyIndependentLesson = {
  selectedSuccessCriterion: "I can explain my strategy.",
  helpPath: "Use the worked example, then ask a neighbor.",
};
if (JSON.stringify(contract.liveIndependentSupportItems("you-do", legacyIndependentLesson))
  !== JSON.stringify(contract.liveIndependentSupportItems("independent", legacyIndependentLesson))) {
  throw new Error("Legacy You do states must retain the Independent Chromebook support cards.");
}

const invalidCriterionSupports = contract.liveIndependentSupportItems("independent", {
  selectedSuccessCriterion: "I can model a ratio.\nI can explain a ratio.",
  learningIntention: "We are learning about ratios.",
});
if (invalidCriterionSupports[0]?.body !== "Choose one I can statement in Notion.") {
  throw new Error("Independent supports must not expose multiple criteria or silently substitute the learning intention.");
}

const stems = contract.splitLiveFlowLines("- I noticed the factors, so...\n* I disagree because...");
if (stems.length !== 2 || stems[0] !== "I noticed the factors, so...") {
  throw new Error("Sentence stems must stay line-based and preserve commas.");
}

const vocabulary = contract.splitLiveFlowVocabulary("prime factorization, GCF\nLCM; shared factor");
if (vocabulary.join("|") !== "prime factorization|GCF|LCM|shared factor") {
  throw new Error("Vocabulary must split on lines, commas, and semicolons.");
}

if (contract.resolveRemoteNextBehavior("learning-check", "learning-check", "responding") !== "reveal-results") {
  throw new Error("Next must reveal a responding Learning Check before it advances.");
}
if (contract.resolveRemoteNextBehavior("learning-check", "learning-check", "results") !== "advance") {
  throw new Error("Next must advance after Learning Check results are already visible.");
}
if (!contract.canRevealM2T1L1FinalScore("M2.T1.L1-D1", "launch", "scenario")) {
  throw new Error("The M2.T1.L1 launch must expose the final-score reveal.");
}
if (contract.canRevealM2T1L1FinalScore("M1.T1.L1", "launch", "scenario")) {
  throw new Error("Other lesson launches must not expose the M2 final score.");
}

const joinedSharer = contract.pickRemoteSharerName(["Joined One", "Joined Two"], ["Roster One"], 0.75);
if (joinedSharer !== "Joined Two") {
  throw new Error("The Remote sharer picker must prefer joined students.");
}
const rosterSharer = contract.pickRemoteSharerName([], ["Roster One", "Roster Two"], 0);
if (rosterSharer !== "Roster One") {
  throw new Error("The Remote sharer picker must fall back to the period roster.");
}
if (contract.pickRemoteSharerName([], [], 0) !== null) {
  throw new Error("The Remote sharer picker must not invent a student name.");
}

console.log("PASS - live flow response modes and discussion support parsing match the Notion contract.");
