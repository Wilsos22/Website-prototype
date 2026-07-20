import { createRequire } from "node:module";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const contract = require(path.join(root, ".tmp-mastery", "liveFlowContract.js"));
const classroomPilot = require(path.join(root, ".tmp-mastery", "classroomPilot.js"));
const discussion = require(path.join(root, ".tmp-mastery", "discussionProtocol.js"));
const studioSource = fs.readFileSync(path.join(root, "src/app/teacher/studio/page.tsx"), "utf8");

for (const legacyStudioLabel of ["Think - 1 minute", "Previous phase", "Restart phase", "Next phase"]) {
  if (studioSource.includes(legacyStudioLabel)) {
    throw new Error(`The Lesson Screen Studio still previews the legacy discussion label: ${legacyStudioLabel}`);
  }
}
if (!studioSource.includes("DISCUSSION_ROUNDS.map") || !studioSource.includes('const previewTimer = isDiscussion ? "02:00"')) {
  throw new Error("The Lesson Screen Studio must preview the shared three-round, two-minute discussion contract.");
}

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

const navigationCases = [
  { label: "running automatic timer", mode: "automatic", running: true, finished: false, pollStage: null, expected: true },
  { label: "paused automatic timer", mode: "automatic", running: false, finished: false, pollStage: null, expected: false },
  { label: "finished automatic timer", mode: "automatic", running: false, finished: true, pollStage: null, expected: true },
  { label: "automatic results hold", mode: "automatic", running: false, finished: false, pollStage: "results", expected: true },
  { label: "stopped manual timer", mode: "manual", running: false, finished: false, pollStage: null, expected: false },
  { label: "running manual timer", mode: "manual", running: true, finished: false, pollStage: null, expected: true },
  { label: "finished manual timer", mode: "manual", running: false, finished: true, pollStage: null, expected: false },
];
for (const testCase of navigationCases) {
  const actual = contract.shouldRunNavigationDestination(
    testCase.mode,
    testCase.running,
    testCase.finished,
    testCase.pollStage,
  );
  if (actual !== testCase.expected) {
    throw new Error(`${testCase.label}: expected destination running=${testCase.expected}, received ${actual}`);
  }
}

const runningDiscussionFlow = {
  state: { id: "discussion", label: "Discussion" },
  timer: { running: false, finished: false },
  phase: discussion.createDiscussionRoundSnapshot("table", true),
};
if (!contract.shouldRunFlowNavigationDestination("automatic", runningDiscussionFlow, null)) {
  throw new Error("Navigation from a running discussion round must preserve automatic pacing.");
}
const pausedDiscussionFlow = {
  ...runningDiscussionFlow,
  phase: discussion.createDiscussionRoundSnapshot("table", false),
};
if (contract.shouldRunFlowNavigationDestination("automatic", pausedDiscussionFlow, null)) {
  throw new Error("Navigation from a paused discussion round must keep the destination paused.");
}

if (discussion.DISCUSSION_ROUNDS.length !== 3) {
  throw new Error("Discussion and Error Analysis must use exactly three rounds.");
}
if (discussion.DISCUSSION_ROUNDS.some((round) => round.defaultSeconds !== 120)) {
  throw new Error("Every discussion round must be exactly 120 seconds.");
}
if (discussion.DISCUSSION_TOTAL_SECONDS !== 360) {
  throw new Error("The three discussion rounds must total six minutes.");
}
const discussionLabels = discussion.DISCUSSION_ROUNDS.map((round) => round.label).join(" ");
for (const requiredMove of ["Think", "Write", "Discuss", "Revise", "Share"]) {
  if (!discussionLabels.includes(requiredMove)) {
    throw new Error(`The canonical discussion rounds are missing ${requiredMove}.`);
  }
}
if (discussion.DISCUSSION_ROUNDS.filter((round) => round.spinner).map((round) => round.id).join() !== "share") {
  throw new Error("Only the two-minute Share round should expose the spinner.");
}
if (discussion.discussionRoundForAction("discussion-write").id !== "think"
  || discussion.discussionRoundForAction("discussion-revise").id !== "table") {
  throw new Error("Legacy Write and Revise commands must normalize to their containing rounds.");
}
const legacyWrite = discussion.normalizeDiscussionPhaseSnapshot({
  id: "marker",
  label: "Write",
  subtitle: "Record one idea.",
  timed: true,
  totalSeconds: 60,
  secondsLeft: 37,
  running: false,
  finished: false,
  media: null,
});
if (legacyWrite.id !== "think" || legacyWrite.roundNumber !== 1 || legacyWrite.roundCount !== 3
  || legacyWrite.secondsLeft !== 37 || !legacyWrite.label.includes("Round 1 of 3")) {
  throw new Error("Legacy discussion snapshots must normalize without restarting a paused timer.");
}
const legacyShare = discussion.normalizeDiscussionPhaseSnapshot({
  id: "share",
  label: "Share",
  subtitle: "Share out.",
  timed: false,
  totalSeconds: null,
  secondsLeft: null,
  running: false,
  finished: false,
  media: null,
});
if (!legacyShare.timed || legacyShare.totalSeconds !== 120 || legacyShare.secondsLeft !== 120
  || discussion.nextDiscussionRound(legacyShare.id) !== null) {
  throw new Error("Legacy Share snapshots must become the final timed spinner round.");
}
if (discussion.nextDiscussionRound("think")?.id !== "table"
  || discussion.nextDiscussionRound("table")?.id !== "share") {
  throw new Error("Automatic discussion pacing must advance Round 1 to Round 2 to Round 3.");
}
if (discussion.discussionRoundCompletesState("think")
  || discussion.discussionRoundCompletesState("table")
  || !discussion.discussionRoundCompletesState("share")) {
  throw new Error("Only a completed Share round may advance the lesson to the next state.");
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
