import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const routines = require(path.join(root, ".tmp-mastery", "lessonRoutineConfig.js"));

const createToken = "[BDM_CREATE_TOKEN:routine-contract-20260716-a1]";
const publicSurfaceMarker = "[BDM_PUBLIC_SURFACES:linked]";

assert.deepEqual(routines.defaultLessonRoutineConfig("gallery-walk"), {
  kind: "gallery-walk",
  stationCount: 4,
  rotationMinutes: 3,
  movementDirections: "Move clockwise when the timer sounds.",
  observationPrompt: "Notice one strategy and one piece of evidence.",
  recordPrompt: "Record one observation at each station.",
  sharePrompt: "Share one idea your group wants to carry forward.",
  materials: ["Station work", "Recording sheet", "Pencil"],
});

const defaultSmallGroup = routines.defaultLessonRoutineConfig("small-group");
assert.deepEqual(defaultSmallGroup, {
  kind: "small-group",
  rotationMinutes: 8,
  publicTask: "Complete the assigned group task. Show your thinking on paper.",
  teacherPlan: {
    pull: "Choose the students who need the same next move.",
    focus: "Name the specific misconception or strategy to strengthen.",
    activity: "Model one example, then have students try the next.",
    check: "Ask each student to explain the next step before returning.",
    materials: ["Targeted task", "Manipulative as needed"],
  },
});
assert.deepEqual(routines.publicLessonRoutineConfig(defaultSmallGroup), {
  kind: "small-group",
  rotationMinutes: 8,
  publicTask: "Complete the assigned group task. Show your thinking on paper.",
});
assert.equal(routines.defaultLessonRoutineConfig("discussion"), null);
assert.equal(routines.defaultLessonRoutineConfig(undefined), null);

const galleryWalk = {
  kind: "gallery-walk",
  stationCount: 5,
  rotationMinutes: 3,
  movementDirections: "Move clockwise when the timer sounds.",
  observationPrompt: "Notice one strategy that is clear and one that needs evidence.",
  recordPrompt: "Record one observation at every station.",
  sharePrompt: "Share the strongest revision your table found.",
  materials: ["Station cards", "Recording sheet", "Pencils", "Pencils"],
};

const normalizedGallery = routines.validateLessonRoutineConfig(galleryWalk);
assert.deepEqual(normalizedGallery.materials, ["Station cards", "Recording sheet", "Pencils"]);

const galleryContext = routines.withLessonRoutineConfig(
  `Private facilitation note.\n\n${publicSurfaceMarker}\n\n${createToken}`,
  galleryWalk,
);
assert.equal(galleryContext.endsWith(createToken), true, "The create token must remain the final AI Context marker.");
assert.equal(
  galleryContext.indexOf("[BDM_ROUTINE_CONFIG:") < galleryContext.lastIndexOf(createToken),
  true,
  "The routine marker must be stored before the trailing create token.",
);
assert.equal(galleryContext.includes(publicSurfaceMarker), true, "Other internal lesson metadata must be preserved.");
assert.deepEqual(routines.lessonRoutineConfigFromAiContext(galleryContext), normalizedGallery);
const galleryPublic = routines.publicLessonRoutineConfig(normalizedGallery);
assert.deepEqual(galleryPublic, {
  kind: "gallery-walk",
  stationCount: 5,
  rotationMinutes: 3,
  movementDirections: "Move clockwise when the timer sounds.",
  observationPrompt: "Notice one strategy that is clear and one that needs evidence.",
  recordPrompt: "Record one observation at every station.",
  sharePrompt: "Share the strongest revision your table found.",
});
assert.equal("materials" in galleryPublic, false, "Gallery Walk materials must remain on teacher surfaces.");

const updatedGalleryContext = routines.withLessonRoutineConfig(galleryContext, {
  ...galleryWalk,
  stationCount: 6,
  rotationMinutes: 2.5,
});
assert.equal((updatedGalleryContext.match(/\[BDM_ROUTINE_CONFIG:/g) || []).length, 1, "Updating must replace the marker, not append another one.");
assert.equal(routines.lessonRoutineConfigFromAiContext(updatedGalleryContext).stationCount, 6);
assert.equal(updatedGalleryContext.endsWith(createToken), true);

const removedContext = routines.withLessonRoutineConfig(updatedGalleryContext, null);
assert.equal(removedContext.includes("BDM_ROUTINE_CONFIG:"), false);
assert.equal(removedContext.includes(publicSurfaceMarker), true);
assert.equal(removedContext.endsWith(createToken), true);
assert.equal(routines.lessonRoutineConfigFromAiContext(removedContext), null);

const smallGroup = routines.validateLessonRoutineConfig({
  kind: "small-group",
  rotationMinutes: 8,
  publicTask: "Complete the ratio sort, then justify one match on your paper.",
  teacherPlan: {
    pull: "Pull the teacher-selected reteach group after the first example.",
    focus: "Connect equivalent ratios to multiplicative reasoning.",
    activity: "Build two equivalent ratios with counters and label the scale factor.",
    check: "Ask each student to explain where the scale factor appears.",
    materials: ["Counters", "Ratio mats"],
  },
});

const smallGroupContext = routines.withLessonRoutineConfig(`Teacher note.\n\n${createToken}`, smallGroup);
assert.deepEqual(routines.lessonRoutineConfigFromAiContext(smallGroupContext), smallGroup);
const smallGroupPublic = routines.publicLessonRoutineConfig(smallGroup);
assert.deepEqual(smallGroupPublic, {
  kind: "small-group",
  rotationMinutes: 8,
  publicTask: "Complete the ratio sort, then justify one match on your paper.",
});
assert.equal("teacherPlan" in smallGroupPublic, false, "Private Small Group planning must not enter the public projection.");
const publicJson = JSON.stringify(smallGroupPublic);
for (const privateValue of Object.values(smallGroup.teacherPlan).flat()) {
  assert.equal(publicJson.includes(String(privateValue)), false, "Private pull, focus, activity, check, and materials must remain private.");
}

for (const invalid of [
  { ...galleryWalk, stationCount: 2.5 },
  { ...galleryWalk, rotationMinutes: 0 },
  { ...galleryWalk, studentNames: ["Fictional Student"] },
  {
    ...smallGroup,
    teacherPlan: { ...smallGroup.teacherPlan, studentNames: ["Fictional Student"] },
  },
]) {
  assert.throws(
    () => routines.validateLessonRoutineConfig(invalid),
    (error) => error?.code === "INVALID_ROUTINE_CONFIG",
  );
}

assert.throws(
  () => routines.withLessonRoutineConfig("x".repeat(1_990), galleryWalk),
  (error) => error?.code === "ROUTINE_CONFIG_TOO_LONG",
  "Routine metadata must never silently exceed the Notion rich-text limit.",
);

assert.throws(
  () => routines.lessonRoutineConfigFromAiContext("[BDM_ROUTINE_CONFIG:not-valid-base64-length-a]"),
  (error) => error?.code === "INVALID_ROUTINE_MARKER",
);

const incompleteStoredPayload = "eyJ2IjoxLCJrIjoiZ2FsbGVyeSJ9";
assert.throws(
  () => routines.lessonRoutineConfigFromAiContext(`[BDM_ROUTINE_CONFIG:${incompleteStoredPayload}]`),
  (error) => error?.code === "INVALID_ROUTINE_MARKER",
  "A decoded but incomplete marker must be treated as corrupt metadata, not as an editable draft.",
);

const duplicateMarker = `${galleryContext}\n${galleryContext.match(/\[BDM_ROUTINE_CONFIG:[A-Za-z0-9_-]+\]/)[0]}`;
assert.throws(
  () => routines.lessonRoutineConfigFromAiContext(duplicateMarker),
  (error) => error?.code === "INVALID_ROUTINE_MARKER",
  "Multiple routine markers must be rejected instead of choosing one silently.",
);

console.log("PASS - lesson routine configuration preserves Notion metadata and keeps Small Group teacher planning private.");
