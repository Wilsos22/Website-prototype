import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const lessonId = "11111111-1111-4111-8111-111111111111";
const stepId = "22222222-2222-4222-8222-222222222222";
const createdStepId = "33333333-3333-4333-8333-333333333333";
const downstreamStepId = "44444444-4444-4444-8444-444444444444";
const createMutationToken = "create-readers-20260715-a1";
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
let createBody = null;
let createCalls = 0;
let createdStepPage = null;
let forcedPageStatus = 0;
let deferCreatedRelation = false;
let downstreamPatchCalls = 0;
let createdPatchCalls = 0;
let downstreamStepPage = {
  id: downstreamStepId,
  last_edited_time: "2026-07-15T17:03:00.000Z",
  parent: { type: "data_source_id", data_source_id: stepSourceId },
  properties: {
    "Step": title("4. Concrete"),
    "Lesson": { type: "relation", relation: [{ id: lessonId }] },
    "Order": { type: "number", number: 4 },
    "Start Minute": { type: "number", number: 14 },
    "Duration": { type: "number", number: 5 },
    "State ID": rich("concrete"),
    "AI Context": rich(""),
  },
};

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
  if (method === "GET" && url.endsWith(`/pages/${createdStepId}`) && createdStepPage) {
    return new Response(JSON.stringify(createdStepPage), { status: 200 });
  }
  if (method === "GET" && url.endsWith(`/pages/${downstreamStepId}`)) {
    return new Response(JSON.stringify(downstreamStepPage), { status: 200 });
  }
  if (method === "POST" && url.endsWith(`/data_sources/${stepSourceId}/query`)) {
    const queryBody = JSON.parse(String(init.body || "{}"));
    const contains = queryBody.filter?.rich_text?.contains || "";
    const aiContext = createdStepPage?.properties?.["AI Context"]?.rich_text?.map((item) => (
      item.plain_text ?? item.text?.content ?? ""
    )).join("") || "";
    const results = createdStepPage && aiContext.includes(contains) ? [createdStepPage] : [];
    return new Response(JSON.stringify({ results, has_more: false, next_cursor: null }), { status: 200 });
  }
  if (method === "POST" && url.endsWith("/pages")) {
    createCalls += 1;
    createBody = JSON.parse(String(init.body || "{}"));
    createdStepPage = {
      id: createdStepId,
      last_edited_time: "2026-07-15T17:08:00.000Z",
      parent: { type: "data_source_id", data_source_id: stepSourceId },
      properties: createBody.properties,
    };
    if (!deferCreatedRelation) {
      lessonPage.properties["Lesson Steps"] = {
        type: "relation",
        relation: [...lessonPage.properties["Lesson Steps"].relation, { id: createdStepId }],
      };
    }
    return new Response(JSON.stringify(createdStepPage), { status: 200 });
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
  if (method === "PATCH" && url.endsWith(`/pages/${createdStepId}`) && createdStepPage) {
    createdPatchCalls += 1;
    const body = JSON.parse(String(init.body || "{}"));
    createdStepPage = {
      ...createdStepPage,
      last_edited_time: new Date(Date.parse(createdStepPage.last_edited_time) + 60_000).toISOString(),
      properties: { ...createdStepPage.properties, ...body.properties },
    };
    return new Response(JSON.stringify(createdStepPage), { status: 200 });
  }
  if (method === "PATCH" && url.endsWith(`/pages/${downstreamStepId}`)) {
    downstreamPatchCalls += 1;
    const body = JSON.parse(String(init.body || "{}"));
    downstreamStepPage = {
      ...downstreamStepPage,
      last_edited_time: new Date(Date.parse(downstreamStepPage.last_edited_time) + 60_000).toISOString(),
      properties: { ...downstreamStepPage.properties, ...body.properties },
    };
    return new Response(JSON.stringify(downstreamStepPage), { status: 200 });
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

lessonPage.properties["Lesson Steps"] = {
  type: "relation",
  relation: [{ id: stepId }, { id: downstreamStepId }],
};
await assert.rejects(
  lessonSteps.createPublishedLessonStep({
    lessonId,
    insertAfterStepId: stepId,
    stateId: "learning-target-readers",
  }),
  (error) => error?.status === 400 && error?.code === "INVALID_MUTATION_TOKEN",
);
assert.equal(createCalls, 0, "An add action without an idempotency token must not reach Notion.");
deferCreatedRelation = true;
await assert.rejects(
  lessonSteps.createPublishedLessonStep({
    lessonId,
    insertAfterStepId: stepId,
    stateId: "learning-target-readers",
    mutationToken: createMutationToken,
  }),
  (error) => error?.status === 404 && error?.code === "STEP_NOT_FOUND",
  "A delayed reverse relation may prevent the first response even after Notion created the page.",
);
assert.equal(createCalls, 1);
assert.equal(createBody.parent.data_source_id, stepSourceId);
assert.deepEqual(createBody.properties["Lesson"], { relation: [{ id: lessonId }] });
assert.deepEqual(createBody.properties["State ID"], {
  rich_text: [{ type: "text", text: { content: "learning-target-readers" } }],
});
assert.deepEqual(createBody.properties["Duration"], { number: 1 });
assert.equal(createBody.properties["Order"].number > stepPage.properties["Order"].number, true);
assert.match(
  createBody.properties["AI Context"].rich_text[0].text.content,
  new RegExp(`\\[BDM_CREATE_TOKEN:${createMutationToken}\\]$`),
);

deferCreatedRelation = false;
lessonPage.properties["Lesson Steps"] = {
  type: "relation",
  relation: [{ id: stepId }, { id: createdStepId }, { id: downstreamStepId }],
};
const created = await lessonSteps.createPublishedLessonStep({
  lessonId,
  insertAfterStepId: stepId,
  stateId: "learning-target-readers",
  mutationToken: createMutationToken,
});
assert.equal(createCalls, 1, "Retrying the same add action must reconcile the created page instead of duplicating it.");
assert.equal(created.id, createdStepId);
assert.equal(created.stateId, "learning-target-readers");
assert.equal(created.remoteActions, "Use the main panel to spin or re-spin the two readers.");
assert.equal(created.aiContext, "", "The internal mutation token must not leak into editable AI Context.");
assert.equal(downstreamPatchCalls, 1, "Inserting a one-minute state must shift the following state once.");
assert.equal(downstreamStepPage.properties["Start Minute"].number, 15);

const retriedCreated = await lessonSteps.createPublishedLessonStep({
  lessonId,
  insertAfterStepId: stepId,
  stateId: "learning-target-readers",
  mutationToken: createMutationToken,
});
assert.equal(retriedCreated.id, createdStepId);
assert.equal(createCalls, 1, "A later retry with the same mutation token must remain idempotent.");
assert.equal(downstreamPatchCalls, 1, "Idempotent reconciliation must not shift the timeline twice.");

const resizedCreated = await lessonSteps.updatePublishedLessonStep({
  lessonId,
  stepId: createdStepId,
  expectedLastEditedTime: retriedCreated.lastEditedTime,
  changes: { duration: 2, aiContext: "Teacher-only context" },
});
assert.equal(createdPatchCalls, 1);
assert.equal(resizedCreated.duration, 2);
assert.equal(resizedCreated.aiContext, "Teacher-only context");
assert.match(
  createdStepPage.properties["AI Context"].rich_text[0].text.content,
  new RegExp(`^Teacher-only context\\n\\n\\[BDM_CREATE_TOKEN:${createMutationToken}\\]$`),
  "Editing AI Context must preserve the hidden mutation token for future reconciliation.",
);
assert.equal(downstreamPatchCalls, 2, "Changing a state's duration must reflow the following Start Minute.");
assert.equal(downstreamStepPage.properties["Start Minute"].number, 16);

await assert.rejects(
  lessonSteps.createPublishedLessonStep({
    lessonId,
    insertAfterStepId: stepId,
    stateId: "ipad-kid",
    mutationToken: createMutationToken,
  }),
  (error) => error?.status === 409 && error?.code === "MUTATION_TOKEN_REUSED",
);
assert.equal(createCalls, 1, "A mutation token cannot be reused for a different state.");

await assert.rejects(
  lessonSteps.createPublishedLessonStep({
    lessonId,
    insertAfterStepId: stepId,
    stateId: "not-a-real-state",
    mutationToken: "invalid-state-20260715-a1",
  }),
  (error) => error?.status === 400 && error?.code === "INVALID_STATE_ID",
);
assert.equal(createCalls, 1, "An unknown state must not create a Notion page.");

console.log("PASS - guarded Notion Lesson Step reads, writes, and inserts enforce ownership, validation, and revisions.");
