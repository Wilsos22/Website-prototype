import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const routines = require(path.join(root, ".tmp-mastery", "lessonRoutineConfig.js"));

const rich = (value) => ({ type: "rich_text", rich_text: [{ plain_text: value }] });
const title = (value) => ({ type: "title", title: [{ plain_text: value }] });
const select = (value) => ({ type: "select", select: { name: value } });
const checkbox = (value) => ({ type: "checkbox", checkbox: value });
const number = (value) => ({ type: "number", number: value });

const privateSmallGroupRoutine = {
  kind: "small-group",
  rotationMinutes: 7,
  publicTask: "Complete the assigned comparison and show your reasoning on paper.",
  teacherPlan: {
    pull: "Pull the teacher-selected group after the opening example.",
    focus: "Connect ratio language to multiplicative comparison.",
    activity: "Build one comparison, then revise a second example.",
    check: "Ask each learner to explain the next move before returning.",
    materials: ["Ratio cards", "Counters"],
  },
};
const rawSmallGroupAiContext = routines.withLessonRoutineConfig(
  "Do not solve it.\n\n[BDM_PUBLIC_SURFACES:linked]",
  privateSmallGroupRoutine,
);

const stepPage = {
  id: "step-1",
  properties: {
    "Step": title("1. Small Group"),
    "Order": number(1),
    "Start Minute": number(0),
    "Duration": number(4),
    "State ID": rich("small-group"),
    "Student Directions": rich("Legacy student direction"),
    "Teacher Notes": rich("Teacher note"),
    "Paper Task": rich(""),
    "Tool": rich(""),
    "Question": rich("What do you notice?"),
    "Poll Kind": select("short-answer"),
    "Choices": rich(""),
    "Correct Answer": rich(""),
    "Standard": rich("6.NS.4"),
    "AI Context": rich(rawSmallGroupAiContext),
    "Advance": select("Automatic"),
    "Required": checkbox(true),
    "Main Display": rich("The score is 24 to 36."),
    "Pace Directions": rich("Notice the number structure."),
    "Student Action": rich("Write one observation."),
    "Remote Actions": rich("Watch private responses."),
    "Discussion Stems": rich("I noticed..."),
    "Vocabulary": rich("factor\nmultiple"),
    "Response Mode": select("Short Answer"),
    "Work Space Available": checkbox(true),
  },
};

const lessonPage = {
  id: "lesson-1",
  properties: {
    "Lesson": title("Contract Pilot"),
    "Lesson Code": rich("TEST.CONTRACT"),
    "Publish Workflow": select("Published"),
    "Lesson Steps": { type: "relation", relation: [{ id: stepPage.id }] },
    "Learning Intention": rich("We are learning to reason with factors."),
    "Success Criteria": rich("Legacy criterion"),
    "Selected Success Criterion": rich("I can explain a shared factor."),
    "Classroom Mode": select("Academic lesson"),
    "Discussion Stems": rich("I noticed...\nMy evidence is..."),
    "Discussion Vocabulary": rich("factor\nmultiple"),
    "Required Paper Work": rich("Complete the full paper set."),
    "Required Digital Work": rich("Submit the exit response."),
    "Optional Support": rich("Use the assigned factor cards."),
    "Big Dog Challenge": rich("Prove the result another way."),
    "Due and Turn In": rich("Turn in the paper before class ends."),
    "Help Path": rich("Factor, mark shared structure, then verify."),
  },
};

global.fetch = async (input) => {
  const url = String(input);
  if (url.includes(`/pages/${stepPage.id}`)) {
    return new Response(JSON.stringify(stepPage), { status: 200 });
  }
  if (url.includes("/data_sources/e367e541-c0c7-4613-8066-d2e61b6fee64/query")) {
    return new Response(JSON.stringify({ results: [lessonPage] }), { status: 200 });
  }
  if (url.includes("/data_sources/")) {
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  }
  return new Response(JSON.stringify({ error: "Unexpected test URL" }), { status: 404 });
};

process.env.NOTION_TOKEN = "test-token";
const notion = require(path.join(root, ".tmp-mastery", "notionLessons.js"));
assert.equal(notion.isExplicitlySkippedLesson("Yes"), true, "Skip=Yes must remove a lesson from app scheduling.");
assert.equal(notion.isExplicitlySkippedLesson("No"), false, "Skip=No must keep a lesson available.");
assert.equal(notion.isExplicitlySkippedLesson(""), false, "A blank legacy Skip value must remain available.");
const lesson = await notion.getLessonByCode("TEST.CONTRACT");

if (!lesson) throw new Error("The test lesson did not map.");
if (lesson.selectedSuccessCriterion !== "I can explain a shared factor.") throw new Error("Selected success criterion did not map.");
if (lesson.classroomMode !== "Academic lesson") throw new Error("Classroom mode did not map.");

for (const field of [
  "discussionStems",
  "discussionVocabulary",
  "requiredPaperWork",
  "requiredDigitalWork",
  "optionalSupport",
  "bigDogChallenge",
  "dueAndTurnIn",
  "helpPath",
]) {
  if (!lesson[field]) throw new Error(`Lesson field ${field} did not map.`);
}

const step = lesson.steps[0];
if (!step) throw new Error("The related lesson step did not map.");
for (const field of ["mainDisplay", "paceDirections", "studentAction", "remoteActions", "discussionStems", "vocabulary", "responseMode"]) {
  if (!step[field]) throw new Error(`Step field ${field} did not map.`);
}
if (!step.workSpaceAvailable) throw new Error("Work Space Available did not map.");

assert.equal(step.aiContext, "Do not solve it.", "Internal routine metadata must not enter public AI Context.");
assert.equal(step.publicSurfaceMode, "linked");
assert.deepEqual(step.routineConfig, {
  kind: "small-group",
  rotationMinutes: 7,
  publicTask: "Complete the assigned comparison and show your reasoning on paper.",
});
assert.equal(
  Object.hasOwn(step.routineConfig, "teacherPlan"),
  false,
  "Public LessonStepData must never expose the private Small Group teacher plan.",
);

const publicStepJson = JSON.stringify(step);
assert.equal(publicStepJson.includes("BDM_ROUTINE_CONFIG"), false, "Encoded internal metadata must not reach public fixtures.");
for (const privateValue of Object.values(privateSmallGroupRoutine.teacherPlan).flat()) {
  assert.equal(
    publicStepJson.includes(String(privateValue)),
    false,
    "Private pull, focus, activity, check, and materials must not leak into public LessonStepData.",
  );
}

console.log("PASS - Notion lesson and step fields map into the four-surface contract.");
