import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { publicLiveLessonSnapshot, studentSafeLiveFlow } = require(
  path.join(root, ".tmp-mastery", "liveFlowPrivacy.js"),
);

const selectedCriterion = "I can explain one ratio.";
const flow = {
  version: 2,
  updatedAt: "2026-07-16T12:00:00.000Z",
  transition: {
    token: "private-transition-token",
    startedAt: "2026-07-16T11:59:59.000Z",
  },
  state: {
    id: "gallery-walk",
    label: "Gallery Walk",
    description: "Study each strategy.",
    color: "#1f6f78",
  },
  phase: null,
  timer: {
    totalSeconds: 180,
    secondsLeft: 120,
    running: true,
    finished: false,
  },
  poll: null,
  resource: {
    label: "Current public resource",
    url: "/current-public-resource",
  },
  presentation: {
    title: "Gallery Walk",
    body: "Study each strategy.",
    mode: "directions",
    notionStepId: "current-step",
    remoteActions: "private-remote-action",
    routineConfig: {
      kind: "gallery-walk",
      stationCount: 4,
      rotationMinutes: 3,
      movementDirections: "Move clockwise when the timer sounds.",
      observationPrompt: "Notice one strategy and one piece of evidence.",
      recordPrompt: "Record one observation at each station.",
      sharePrompt: "Share one idea your group wants to carry forward.",
      materials: ["private-gallery-material"],
    },
  },
  tool: null,
  lesson: {
    id: "lesson-id",
    code: "M2.T1.L1",
    title: "Ratios",
    learningIntention: "We are learning to reason about ratios.",
    successCriteria: "Legacy option one\nLegacy option two",
    selectedSuccessCriterion: selectedCriterion,
  },
  sequence: {
    currentIndex: 0,
    totalSteps: 2,
    nextLabel: "Future check",
    nextDirections: "future-private-directions",
    advanceMode: "automatic",
    steps: [
      {
        stateId: "gallery-walk",
        label: "Gallery Walk",
        description: "Study each strategy.",
        color: "#1f6f78",
        semantic: "representational",
        durationSeconds: 180,
        question: "",
        pollKind: null,
        choices: [],
        correctAnswer: "",
        standard: "6.RP.A.1",
        resourceUrl: "",
        paperTask: "",
        notionStepId: "current-step",
        notionLessonId: "lesson-id",
        lessonCode: "M2.T1.L1",
      },
      {
        stateId: "learning-check",
        label: "Future check",
        description: "future-private-directions",
        color: "#79507f",
        semantic: "learning-check",
        durationSeconds: 180,
        question: "future-private-question",
        pollKind: "multiple-choice",
        choices: ["1", "2", "3"],
        correctAnswer: "future-correct-answer",
        standard: "6.RP.A.1",
        resourceUrl: "/future-private-resource",
        paperTask: "future-private-paper-task",
        notionStepId: "future-step",
        notionLessonId: "lesson-id",
        lessonCode: "M2.T1.L1",
        remoteActions: "future-private-remote-action",
      },
    ],
  },
  paper: {
    task: "Current public paper direction",
  },
};

const safeLesson = publicLiveLessonSnapshot(flow.lesson);
assert.equal(safeLesson.successCriteria, selectedCriterion);
assert.equal(safeLesson.selectedSuccessCriterion, selectedCriterion);

const safeFlow = studentSafeLiveFlow(flow);
assert.ok(safeFlow);
assert.equal(safeFlow.sequence, null, "Future lesson steps must never enter a student payload.");
assert.equal("transition" in safeFlow, false, "Teacher transition claims must remain private.");
assert.equal(safeFlow.lesson.successCriteria, selectedCriterion);
assert.equal(safeFlow.lesson.selectedSuccessCriterion, selectedCriterion);
assert.equal(safeFlow.presentation.routineConfig.observationPrompt, "Notice one strategy and one piece of evidence.");
assert.equal("materials" in safeFlow.presentation.routineConfig, false, "Gallery Walk materials must remain private.");
assert.equal("remoteActions" in safeFlow.presentation, false, "Remote controls must remain private.");
assert.equal(safeFlow.resource.url, "/current-public-resource", "The current public resource should remain available.");
assert.equal(safeFlow.paper.task, "Current public paper direction", "The current public paper direction should remain available.");

const safeJson = JSON.stringify(safeFlow);
for (const privateValue of [
  "Legacy option one",
  "Legacy option two",
  "private-transition-token",
  "private-gallery-material",
  "private-remote-action",
  "future-private-directions",
  "future-private-question",
  "future-correct-answer",
  "/future-private-resource",
  "future-private-paper-task",
  "future-private-remote-action",
]) {
  assert.equal(safeJson.includes(privateValue), false, `${privateValue} must not enter the student payload.`);
}

console.log("PASS - live student payload excludes future steps, raw criteria, and private routine data.");
