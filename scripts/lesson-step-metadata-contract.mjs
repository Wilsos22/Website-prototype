import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const metadata = require(path.join(root, ".tmp-mastery", "lessonStepMetadata.js"));

const token = "test-token_1234567890";
const original = [
  "Ask students what they notice.",
  "",
  "[BDM_UNKNOWN:keep-this]",
  "",
  "[BDM_PUBLIC_SURFACES:split]",
  "",
  `[BDM_CREATE_TOKEN:${token}]`,
].join("\n");

const parsed = metadata.parseLessonStepAiContext(original);
assert.equal(parsed.userText, "Ask students what they notice.\n\n[BDM_UNKNOWN:keep-this]");
assert.equal(parsed.publicSurfaceMode, "split");
assert.equal(parsed.createToken, token);

const linked = metadata.setPublicSurfaceMode(original, "linked");
assert.match(linked, /\[BDM_UNKNOWN:keep-this\]/, "Unknown text must survive metadata edits.");
assert.doesNotMatch(linked, /\[BDM_PUBLIC_SURFACES:split\]/);
assert.match(linked, /\[BDM_PUBLIC_SURFACES:linked\]\n\n\[BDM_CREATE_TOKEN:/);
assert.match(linked, new RegExp(`\\[BDM_CREATE_TOKEN:${token}\\]$`), "Create token must remain last.");

const duplicateModes = [
  "Teacher note",
  "[BDM_PUBLIC_SURFACES:split]",
  "[BDM_PUBLIC_SURFACES:linked]",
].join("\n");
assert.equal(metadata.parseLessonStepAiContext(duplicateModes).publicSurfaceMode, "linked");
assert.equal(
  metadata.setPublicSurfaceMode(duplicateModes, "split"),
  "Teacher note\n\n[BDM_PUBLIC_SURFACES:split]",
  "Serializing must collapse duplicate recognized markers.",
);

const invalidMarker = "Teacher note\n\n[BDM_PUBLIC_SURFACES:together]";
const invalidMarkerUpdated = metadata.setPublicSurfaceMode(invalidMarker, "linked");
assert.match(invalidMarkerUpdated, /\[BDM_PUBLIC_SURFACES:together\]/, "Unknown marker values must remain user text.");

const revisedText = metadata.replaceLessonStepAiContextText(
  linked,
  "Use the visual, then explain your reasoning.",
);
assert.equal(metadata.parseLessonStepAiContext(revisedText).publicSurfaceMode, "linked");
assert.equal(metadata.parseLessonStepAiContext(revisedText).createToken, token);
assert.match(revisedText, new RegExp(`\\[BDM_CREATE_TOKEN:${token}\\]$`));

const crlf = metadata.setPublicSurfaceMode(
  `Teacher note\r\n\r\n[BDM_CREATE_TOKEN:${token}]`,
  "linked",
);
assert.match(crlf, /\[BDM_PUBLIC_SURFACES:linked\]\r\n\r\n\[BDM_CREATE_TOKEN:/);

assert.equal(metadata.defaultPublicSurfaceModeForState("learning-target-readers"), "linked");
assert.equal(metadata.defaultPublicSurfaceModeForState("ipad-kid"), "linked");
assert.equal(metadata.defaultPublicSurfaceModeForState("discussion"), "split");
assert.equal(metadata.resolvePublicSurfaceMode("", "ipad-kid"), "linked");
assert.equal(metadata.resolvePublicSurfaceMode("[BDM_PUBLIC_SURFACES:split]", "ipad-kid"), "split");

assert.throws(
  () => metadata.serializeLessonStepAiContext({
    userText: "Teacher note",
    publicSurfaceMode: "linked",
    createToken: "bad token",
  }),
  /Create token/,
);

console.log("PASS - lesson step public-surface metadata preserves teacher text and internal token order.");
