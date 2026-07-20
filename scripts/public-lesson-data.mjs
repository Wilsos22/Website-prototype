import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const {
  toPublicLessonData,
  toPublicLessonSummary,
} = require(path.join(root, ".tmp-mastery", "publicLessonData.js"));

const lesson = {
  id: "lesson-public-test",
  lessonCode: "TEST.PUBLIC",
  title: "Public lesson",
  subtitle: "Safe subtitle",
  essentialIdeas: "Safe idea",
  assignmentLink: "https://example.com/assignment",
  date: "2026-07-15",
  dateEnd: "2026-07-15",
  dueDate: "2026-07-15",
  topic: "Ratios",
  module: "Module 1",
  moduleTopic: "Topic 1",
  standard: "6.RP.A.1",
  agenda: "Warm-up\nLesson",
  supplies: "Paper",
  tools: "Ratio table",
  suppliesConfigured: true,
  toolsConfigured: true,
  warmUpLink: "https://example.com/warm-up",
  exitTicketLink: "https://example.com/exit-ticket",
  learningIntention: "We are learning to reason about ratios.",
  successCriteria: "Legacy option one\nLegacy option two",
  selectedSuccessCriterion: "I can explain a ratio.",
  classroomMode: "Academic lesson",
  discussionStems: "I noticed...",
  discussionVocabulary: "ratio",
  requiredPaperWork: "Complete the paper set.",
  requiredDigitalWork: "Submit one response.",
  optionalSupport: "Use a ratio table.",
  bigDogChallenge: "Prove it another way.",
  dueAndTurnIn: "Turn in before class ends.",
  helpPath: "Write what you know first.",
  discussionPrompt: "What stays equivalent?",
  practiceProblems: "Use the assigned paper set.",
  misconceptionPlans: "Teacher-only reteach plan",
  liveQuestions: "What do you notice?",
  midLessonCheckPrompt: "Show your confidence.",
  exitTicketPrompt: "Explain one ratio.",
  exitTicketAnswer: "Teacher-only answer",
  futurePrivateField: "A future internal field must not leak.",
  steps: [
    {
      id: "step-public-test",
      title: "Launch",
      order: 1,
      startMinute: 0,
      duration: 4,
      stateId: "launch",
      studentDirections: "Write one observation.",
      teacherNotes: "Teacher-only note",
      paperTask: "Record your thinking.",
      tool: "Ratio table",
      question: "What do you notice?",
      pollKind: "short-answer",
      choices: [],
      correctAnswer: "Teacher-only answer",
      standard: "6.RP.A.1",
      aiContext: "Teacher-only context",
      advance: "Automatic",
      required: true,
      linkUrl: "",
      mainDisplay: "The score is 24 to 36.",
      paceDirections: "Notice the number structure.",
      studentAction: "Write one observation.",
      remoteActions: "Teacher-only remote action",
      discussionStems: "I noticed...",
      vocabulary: "ratio",
      responseMode: "Short Answer",
      workSpaceAvailable: true,
      futurePrivateField: "A future internal step field must not leak.",
    },
  ],
};

const publicLesson = toPublicLessonData(lesson);
const payload = JSON.stringify(publicLesson);

for (const privateValue of [
  "Teacher-only reteach plan",
  "Teacher-only answer",
  "Teacher-only note",
  "Teacher-only context",
  "Teacher-only remote action",
  "A future internal field must not leak.",
  "A future internal step field must not leak.",
  lesson.liveQuestions,
  lesson.midLessonCheckPrompt,
  lesson.exitTicketPrompt,
]) {
  if (payload.includes(privateValue)) {
    throw new Error(`Public lesson payload leaked private data: ${privateValue}`);
  }
}

for (const privateField of [
  "misconceptionPlans",
  "exitTicketAnswer",
  "teacherNotes",
  "correctAnswer",
  "aiContext",
  "remoteActions",
  "futurePrivateField",
]) {
  if (payload.includes(`\"${privateField}\"`)) {
    throw new Error(`Public lesson payload included private field: ${privateField}`);
  }
}

if (publicLesson.title !== lesson.title || publicLesson.warmUpLink !== lesson.warmUpLink) {
  throw new Error("Public lesson fields were not preserved.");
}

if (publicLesson.successCriteria !== lesson.selectedSuccessCriterion
  || publicLesson.selectedSuccessCriterion !== lesson.selectedSuccessCriterion) {
  throw new Error("Public lessons must expose only the one selected success criterion.");
}

if (JSON.stringify(publicLesson).includes("Legacy option")) {
  throw new Error("Public lessons must not expose the multi-option legacy Success Criteria field.");
}

const unconfiguredPublicLesson = toPublicLessonData({
  ...lesson,
  selectedSuccessCriterion: "I can model a ratio.\nI can explain a ratio.",
});
if (unconfiguredPublicLesson.selectedSuccessCriterion !== "Choose one I can statement in Notion."
  || unconfiguredPublicLesson.successCriteria !== unconfiguredPublicLesson.selectedSuccessCriterion) {
  throw new Error("Invalid selected criteria must become concise setup guidance on public lesson snapshots.");
}

if (!Array.isArray(publicLesson.steps) || publicLesson.steps.length !== 0) {
  throw new Error("Public current-day lessons must not release Lesson Steps.");
}

const archiveLesson = toPublicLessonSummary(lesson);
const archivePayload = JSON.stringify(archiveLesson);
for (const unreleasedValue of [
  lesson.warmUpLink,
  lesson.exitTicketLink,
  lesson.discussionPrompt,
  lesson.practiceProblems,
  lesson.steps[0].mainDisplay,
]) {
  if (archivePayload.includes(unreleasedValue)) {
    throw new Error(`Public archive metadata released lesson content: ${unreleasedValue}`);
  }
}

if (archiveLesson.title !== lesson.title || archiveLesson.assignmentLink !== lesson.assignmentLink) {
  throw new Error("Public archive metadata was not preserved.");
}

console.log("PASS - public lesson payloads preserve released fields and remove private lesson content.");
