import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const title = (value) => ({ type: "title", title: [{ plain_text: value }] });
const rich = (value) => ({ type: "rich_text", rich_text: [{ plain_text: value }] });
const url = (value) => ({ type: "url", url: value });
const select = (value) => ({ type: "select", select: { name: value } });
const multiSelect = (...values) => ({ type: "multi_select", multi_select: values.map((name) => ({ name })) });
const date = (start, end = null) => ({ type: "date", date: { start, end } });
const relation = (...ids) => ({ type: "relation", relation: ids.map((id) => ({ id })) });

const sharedRelationId = "11111111-1111-4111-8111-111111111111";
const trashedRelationId = "22222222-2222-4222-8222-222222222222";

const lessonA = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  properties: {
    "Lesson": title("Ratios in Context"),
    "Lesson Code": rich("M2.T1.L1"),
    "Subtitle": rich("Comparing two quantities"),
    "Essential Ideas": rich("A ratio describes a relationship."),
    "Assignment Link": url("https://example.com/direct-assignment"),
    "Exit Ticket": relation(sharedRelationId),
    "Date": date("2026-09-03", "2026-09-04"),
    "Due Date": date("2026-09-05"),
    "Topic #": rich("T1"),
    "Module #": select("M2"),
    "Module Topic": rich("Ratio reasoning"),
    "Standards": multiSelect("6.RP.A.1", "6.RP.A.3"),
    "Publish Workflow": select("Published"),
  },
};

const archivedLesson = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  archived: true,
  properties: {
    "Lesson": title("Archived lesson"),
    "Publish Workflow": select("Published"),
    "Date": date("2026-09-03"),
  },
};

const lessonB = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  properties: {
    "Lesson": title("Ratio Tables"),
    "Lesson Code": rich("M2.T1.L2"),
    "Assignment": relation(sharedRelationId),
    "Exit Ticket URL": rich("Open https://example.com/direct-exit."),
    "Date": date("2026-09-02"),
    "Topic": select("T1"),
    "Module": rich("M2"),
    "Standard": rich("6.RP.A.3"),
    "Publish Workflow": select("Published"),
  },
};

const lessonC = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  properties: {
    "Lesson": title("Ratio Review"),
    "Lesson Code": rich("M2.T1.P1"),
    "Assignment Link": relation(trashedRelationId),
    "Exit Ticket Link": relation(sharedRelationId),
    "Date": date("2026-09-01"),
    "Publish Workflow": select("Published"),
  },
};

const trashedLesson = {
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  in_trash: true,
  properties: {
    "Lesson": title("Trashed lesson"),
    "Publish Workflow": select("Published"),
    "Date": date("2026-09-01"),
  },
};

const relatedPages = new Map([
  [sharedRelationId, {
    id: sharedRelationId,
    properties: { "Form Link": rich("https://docs.google.com/forms/d/shared/viewform") },
  }],
  [trashedRelationId, {
    id: trashedRelationId,
    in_trash: true,
    properties: { "Form Link": url("https://example.com/must-not-surface") },
  }],
]);

let mode = "success";
let queryRequests = [];
let relatedRequests = [];
let activeRelatedRequests = 0;
let maxConcurrentRelatedRequests = 0;

function resetRequests() {
  queryRequests = [];
  relatedRequests = [];
  activeRelatedRequests = 0;
  maxConcurrentRelatedRequests = 0;
}

global.fetch = async (input, init = {}) => {
  const requestUrl = String(input);

  if (requestUrl.includes("/data_sources/")) {
    const body = JSON.parse(String(init.body || "{}"));
    queryRequests.push({ requestUrl, init, body });

    if (mode === "query-error") {
      return new Response("NOTION_SECRET_RAW_BODY", { status: 500 });
    }
    if (mode === "invalid-pagination") {
      return new Response(JSON.stringify({ results: [lessonA], has_more: true, next_cursor: "" }), { status: 200 });
    }

    if (!body.start_cursor) {
      return new Response(JSON.stringify({
        results: [lessonA, archivedLesson],
        has_more: true,
        next_cursor: "cursor-2",
      }), { status: 200 });
    }
    if (body.start_cursor === "cursor-2") {
      return new Response(JSON.stringify({
        results: [lessonB, lessonC, trashedLesson],
        has_more: false,
        next_cursor: null,
      }), { status: 200 });
    }
    return new Response("Unexpected cursor", { status: 400 });
  }

  const pageMatch = requestUrl.match(/\/pages\/([^/?]+)/);
  if (pageMatch) {
    const pageId = decodeURIComponent(pageMatch[1]);
    relatedRequests.push({ requestUrl, init, pageId });
    activeRelatedRequests += 1;
    maxConcurrentRelatedRequests = Math.max(maxConcurrentRelatedRequests, activeRelatedRequests);
    await new Promise((resolve) => setTimeout(resolve, 2));
    activeRelatedRequests -= 1;

    const page = relatedPages.get(pageId);
    return page
      ? new Response(JSON.stringify(page), { status: 200 })
      : new Response("RELATED_RAW_BODY", { status: 404 });
  }

  return new Response("Unexpected URL", { status: 404 });
};

process.env.NOTION_TOKEN = "test-token";
const archive = require(path.join(root, ".tmp-mastery", "notionLessonArchive.js"));

resetRequests();
const defaultLessons = await archive.getPublishedLessonArchive();

assert.equal(defaultLessons.length, 3, "Archived and trashed lesson pages must be excluded.");
assert.equal(queryRequests.length, 2, "Every query page must be read.");
assert.equal(relatedRequests.length, 0, "The default archive read must never fetch a related page.");
assert.ok(queryRequests.every(({ requestUrl }) => requestUrl.includes("e367e541-c0c7-4613-8066-d2e61b6fee64")));
assert.ok(queryRequests.every(({ requestUrl }) => !requestUrl.includes("3282eba1-de37-8069-a043-000b7c36799d")));
assert.equal(new Headers(queryRequests[0].init.headers).get("Notion-Version"), "2025-09-03");
assert.deepEqual(queryRequests[0].body.filter, {
  property: "Publish Workflow",
  select: { equals: "Published" },
});
assert.deepEqual(queryRequests[0].body.sorts, [{ property: "Date", direction: "descending" }]);
assert.equal(queryRequests[0].body.page_size, 100);
assert.equal(queryRequests[0].body.start_cursor, undefined);
assert.equal(queryRequests[1].body.start_cursor, "cursor-2");

assert.deepEqual(defaultLessons[0], {
  id: lessonA.id,
  lessonCode: "M2.T1.L1",
  title: "Ratios in Context",
  subtitle: "Comparing two quantities",
  essentialIdeas: "A ratio describes a relationship.",
  assignmentLink: "https://example.com/direct-assignment",
  date: "2026-09-03",
  dateEnd: "2026-09-04",
  dueDate: "2026-09-05",
  topic: "T1",
  module: "M2",
  moduleTopic: "Ratio reasoning",
  standard: "6.RP.A.1",
  exitTicketLink: "",
});
assert.equal(defaultLessons[1].assignmentLink, "");
assert.equal(defaultLessons[1].exitTicketLink, "https://example.com/direct-exit");

resetRequests();
const assignmentLessons = await archive.getPublishedLessonArchive({ resolveAssignmentLink: true });
assert.equal(assignmentLessons[1].assignmentLink, "https://docs.google.com/forms/d/shared/viewform");
assert.equal(assignmentLessons[0].exitTicketLink, "", "Exit Ticket relations must remain untouched when not enabled.");
assert.equal(assignmentLessons[2].assignmentLink, "", "A trashed relation target must not surface its link.");
assert.equal(relatedRequests.length, 2);
assert.equal(maxConcurrentRelatedRequests, 1, "Relation reads must not burst concurrently.");

resetRequests();
const allLinkLessons = await archive.getPublishedLessonArchive({
  resolveAssignmentLink: true,
  resolveExitTicketLink: true,
});
assert.equal(allLinkLessons[0].exitTicketLink, "https://docs.google.com/forms/d/shared/viewform");
assert.equal(allLinkLessons[1].assignmentLink, "https://docs.google.com/forms/d/shared/viewform");
assert.equal(allLinkLessons[2].exitTicketLink, "https://docs.google.com/forms/d/shared/viewform");
assert.equal(relatedRequests.filter(({ pageId }) => pageId === sharedRelationId).length, 1, "Related page reads must be deduplicated.");
assert.equal(relatedRequests.filter(({ pageId }) => pageId === trashedRelationId).length, 1);
assert.equal(maxConcurrentRelatedRequests, 1);

mode = "query-error";
resetRequests();
await assert.rejects(
  archive.getPublishedLessonArchive(),
  (error) => error instanceof Error
    && error.message.includes("status 500")
    && !error.message.includes("NOTION_SECRET_RAW_BODY"),
  "Query failures must not include raw Notion response bodies.",
);

mode = "invalid-pagination";
resetRequests();
await assert.rejects(
  archive.getPublishedLessonArchive(),
  /pagination cursor was invalid/,
);

console.log("PASS - compact Notion lesson archive pagination, mapping, relation controls, and error redaction.");
