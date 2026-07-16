import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const lessonId = "11111111-1111-4111-8111-111111111111";
const stepId = "22222222-2222-4222-8222-222222222222";
const lessonSourceId = "e367e541-c0c7-4613-8066-d2e61b6fee64";
const stepSourceId = "8e467c1b-8937-4902-811e-ca0a2e15af4d";

const rich = (value) => ({ type: "rich_text", rich_text: value ? [{ plain_text: value }] : [] });
const title = (value) => ({ type: "title", title: value ? [{ plain_text: value }] : [] });
const select = (value) => ({ type: "select", select: value ? { name: value } : null });

const lessonPage = {
  id: lessonId,
  last_edited_time: "2026-07-15T17:00:00.000Z",
  parent: { type: "data_source_id", data_source_id: lessonSourceId },
  properties: {
    "Publish Workflow": select("Published"),
    "Lesson Steps": { type: "relation", relation: [{ id: stepId }] },
  },
};

let stepPage = {
  id: stepId,
  last_edited_time: "2026-07-15T17:01:00.000Z",
  parent: { type: "data_source_id", data_source_id: stepSourceId },
  properties: {
    "Step": title("3. Launch"),
    "Lesson": { type: "relation", relation: [{ id: lessonId }] },
    "Order": { type: "number", number: 3 },
    "Start Minute": { type: "number", number: 9 },
    "Duration": { type: "number", number: 4 },
    "State ID": rich("launch"),
    "Student Directions": rich("Study the score."),
    "Teacher Notes": rich("Keep the answer private."),
    "Paper Task": rich(""),
    "Tool": rich(""),
    "Question": rich("What do you notice?"),
    "Poll Kind": select("short-answer"),
    "Choices": rich("First\nSecond"),
    "Correct Answer": rich("A private answer"),
    "Standard": rich("6.RP.A.1"),
    "AI Context": rich("Do not solve the task."),
    "Advance": select("Automatic"),
    "Required": { type: "checkbox", checkbox: true },
    "Link": { type: "url", url: null },
    "Main Display": rich("The score is 24 to 36."),
    "Pace Directions": rich("Notice the quantities."),
    "Student Action": rich("Write one observation."),
    "Remote Actions": rich("Monitor private responses."),
    "Discussion Stems": rich("I noticed..."),
    "Vocabulary": rich("ratio"),
    "Response Mode": select("Short Answer"),
    "Work Space Available": { type: "checkbox", checkbox: true },
  },
};

let patchBody = null;
let patchCalls = 0;
let forcedPageStatus = 0;

global.fetch = async (input, init = {}) => {
  const url = String(input);
  const method = init.method || "GET";
  if (method === "GET" && forcedPageStatus) {
    return new Response(JSON.stringify({ message: "private upstream detail" }), { status: forcedPageStatus });
  }
  if (method === "GET" && url.endsWith(`/pages/${lessonId}`)) {
    return new Response(JSON.stringify(lessonPage), { status: 200 });
  }
  if (method === "GET" && url.endsWith(`/pages/${stepId}`)) {
    return new Response(JSON.stringify(stepPage), { status: 200 });
  }
  if (method === "PATCH" && url.endsWith(`/pages/${stepId}`)) {
    patchCalls += 1;
    patchBody = JSON.parse(String(init.body || "{}"));
    const nextEditedTime = new Date(Date.parse(stepPage.last_edited_time) + 60_000).toISOString();
    stepPage = {
      ...stepPage,
      last_edited_time: nextEditedTime,
      properties: { ...stepPage.properties, ...patchBody.properties },
    };
    return new Response(JSON.stringify(stepPage), { status: 200 });
  }
  return new Response(JSON.stringify({ object: "error" }), { status: 404 });
};

process.env.NOTION_TOKEN = "test-token";
const lessonSteps = require(path.join(root, ".tmp-mastery", "notionLessonStepWrites.js"));

const loaded = await lessonSteps.getPublishedLessonStep(lessonId, stepId);
assert.equal(loaded.lessonId, lessonId);
assert.equal(loaded.lastEditedTime, "2026-07-15T17:01:00.000Z");
assert.deepEqual(loaded.choices, ["First", "Second"]);
assert.equal(loaded.remoteActions, "Monitor private responses.");

const updated = await lessonSteps.updatePublishedLessonStep({
  lessonId,
  stepId,
  expectedLastEditedTime: loaded.lastEditedTime,
  changes: {
    mainDisplay: "Updated projector content",
    choices: ["A", "B"],
    pollKind: "multiple-choice",
    duration: 5,
    required: false,
    linkUrl: "https://example.com/resource",
  },
});

assert.equal(patchCalls, 1);
assert.deepEqual(patchBody.properties["Main Display"], {
  rich_text: [{ type: "text", text: { content: "Updated projector content" } }],
});
assert.deepEqual(patchBody.properties["Choices"], {
  rich_text: [{ type: "text", text: { content: "A\nB" } }],
});
assert.deepEqual(patchBody.properties["Poll Kind"], { select: { name: "multiple-choice" } });
assert.deepEqual(patchBody.properties["Duration"], { number: 5 });
assert.deepEqual(patchBody.properties["Required"], { checkbox: false });
assert.deepEqual(patchBody.properties["Link"], { url: "https://example.com/resource" });
assert.equal(updated.lastEditedTime, "2026-07-15T17:02:00.000Z");
assert.equal(updated.mainDisplay, "Updated projector content");

await assert.rejects(
  lessonSteps.updatePublishedLessonStep({
    lessonId,
    stepId,
    expectedLastEditedTime: loaded.lastEditedTime,
    changes: { mainDisplay: "A stale save" },
  }),
  (error) => error?.status === 409 && error?.code === "EDIT_CONFLICT" && error?.currentStep?.lastEditedTime === updated.lastEditedTime,
);
assert.equal(patchCalls, 1, "A stale revision must not reach Notion PATCH.");

await assert.rejects(
  lessonSteps.updatePublishedLessonStep({
    lessonId,
    stepId,
    expectedLastEditedTime: updated.lastEditedTime,
    changes: { mainDisplay: "x".repeat(2_001) },
  }),
  (error) => error?.status === 400 && error?.code === "FIELD_TOO_LONG",
);
assert.equal(patchCalls, 1, "An invalid value must not reach Notion PATCH.");

for (const changes of [
  { pollKind: "essay" },
  { duration: 0 },
  { order: 1.5 },
  { linkUrl: "javascript:alert(1)" },
]) {
  await assert.rejects(
    lessonSteps.updatePublishedLessonStep({
      lessonId,
      stepId,
      expectedLastEditedTime: updated.lastEditedTime,
      changes,
    }),
    (error) => error?.status === 400 && error?.code === "INVALID_FIELD_VALUE",
  );
}
assert.equal(patchCalls, 1, "Invalid select, number, and URL values must not reach Notion PATCH.");

const concurrentRevision = stepPage.last_edited_time;
const concurrent = await Promise.allSettled([
  lessonSteps.updatePublishedLessonStep({
    lessonId,
    stepId,
    expectedLastEditedTime: concurrentRevision,
    changes: { mainDisplay: "First simultaneous draft" },
  }),
  lessonSteps.updatePublishedLessonStep({
    lessonId,
    stepId,
    expectedLastEditedTime: concurrentRevision,
    changes: { mainDisplay: "Second simultaneous draft" },
  }),
]);
assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
assert.equal(
  concurrent.filter((result) => result.status === "rejected" && result.reason?.code === "EDIT_CONFLICT").length,
  1,
  "Same-instance simultaneous saves must serialize and preserve the stale draft.",
);
assert.equal(patchCalls, 2, "Only one simultaneous save may reach Notion PATCH.");

stepPage = { ...stepPage, parent: { type: "data_source_id", data_source_id: lessonSourceId } };
await assert.rejects(
  lessonSteps.getPublishedLessonStep(lessonId, stepId),
  (error) => error?.status === 404 && error?.code === "STEP_NOT_FOUND",
);

stepPage = {
  ...stepPage,
  parent: { type: "data_source_id", data_source_id: stepSourceId },
  properties: {
    ...stepPage.properties,
    "Lesson": {
      type: "relation",
      relation: [
        { id: lessonId },
        { id: "33333333-3333-4333-8333-333333333333" },
      ],
    },
  },
};
await assert.rejects(
  lessonSteps.getPublishedLessonStep(lessonId, stepId),
  (error) => error?.status === 404 && error?.code === "STEP_NOT_FOUND",
  "A step shared by multiple lessons must not be editable through either lesson.",
);

stepPage = {
  ...stepPage,
  archived: false,
  in_trash: false,
  properties: {
    ...stepPage.properties,
    "Lesson": { type: "relation", relation: [{ id: lessonId }] },
  },
};

lessonPage.properties["Publish Workflow"] = select("Draft");
await assert.rejects(
  lessonSteps.getPublishedLessonStep(lessonId, stepId),
  (error) => error?.status === 404 && error?.code === "STEP_NOT_FOUND",
  "Unpublished lessons must not expose editable steps.",
);
lessonPage.properties["Publish Workflow"] = select("Published");

lessonPage.archived = true;
await assert.rejects(
  lessonSteps.getPublishedLessonStep(lessonId, stepId),
  (error) => error?.status === 404 && error?.code === "STEP_NOT_FOUND",
  "Archived lessons must not expose editable steps.",
);
lessonPage.archived = false;

stepPage.in_trash = true;
await assert.rejects(
  lessonSteps.getPublishedLessonStep(lessonId, stepId),
  (error) => error?.status === 404 && error?.code === "STEP_NOT_FOUND",
  "Trashed steps must not be editable.",
);
stepPage.in_trash = false;

lessonPage.properties["Lesson Steps"] = { type: "relation", relation: [] };
await assert.rejects(
  lessonSteps.getPublishedLessonStep(lessonId, stepId),
  (error) => error?.status === 404 && error?.code === "STEP_NOT_FOUND",
  "The lesson must retain the step relation.",
);
lessonPage.properties["Lesson Steps"] = { type: "relation", relation: [{ id: stepId }] };

stepPage.properties["Lesson"] = { type: "relation", relation: [] };
await assert.rejects(
  lessonSteps.getPublishedLessonStep(lessonId, stepId),
  (error) => error?.status === 404 && error?.code === "STEP_NOT_FOUND",
  "The step must retain its reverse lesson relation.",
);
stepPage.properties["Lesson"] = { type: "relation", relation: [{ id: lessonId }] };

forcedPageStatus = 500;
await assert.rejects(
  lessonSteps.getPublishedLessonStep(lessonId, stepId),
  (error) => error?.status === 502
    && error?.code === "NOTION_UPSTREAM_ERROR"
    && !error?.message.includes("private upstream detail"),
  "Upstream response bodies must not be exposed.",
);
forcedPageStatus = 0;

console.log("PASS - guarded Notion Lesson Step reads and writes enforce ownership, validation, and revisions.");
