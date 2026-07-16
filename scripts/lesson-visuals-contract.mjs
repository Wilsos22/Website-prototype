import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { resolveLessonVisual } = require(path.join(root, ".tmp-mastery", "lessonVisuals.js"));

const lessonCode = "M2.T1.L1-D1";
const launchText = "The Crusaders lead the Blue Jays 30 to 20 at halftime. Predict the final score. Decide whether the relationship stayed the same.";
const concreteText = "Build a mixture with 3 blue counters and 2 yellow counters. Point to blue-to-yellow and blue-to-whole.";
const representationalText = "Draw and label 3 blue parts, 2 yellow parts, and 5 total parts.";
const abstractText = "Write blue-to-yellow and blue-to-whole in words, colon notation, and labeled fractional form.";

const scoreboard = resolveLessonVisual({ lessonCode, stateId: "launch", text: launchText });
if (scoreboard?.kind !== "scoreboard") throw new Error("The launch must resolve to a scoreboard.");
if (scoreboard.teams[0].label !== "Crusaders" || scoreboard.teams[0].score !== 30) {
  throw new Error("The scoreboard must use the live leading team and score.");
}
if (scoreboard.teams[1].label !== "Blue Jays" || scoreboard.teams[1].score !== 20) {
  throw new Error("The scoreboard must use the live trailing team and score.");
}
if (!scoreboard.prompt.startsWith("Predict the final score")) {
  throw new Error("The scoreboard must separate the current math prompt from the score statement.");
}

const customScoreboard = resolveLessonVisual({
  lessonCode,
  stateId: "scenario",
  text: "Did the relationship stay the same?",
  fallbackTexts: [launchText],
});
if (customScoreboard?.kind !== "scoreboard" || customScoreboard.prompt !== "Did the relationship stay the same?") {
  throw new Error("A custom Main Display must keep the inferred live scoreboard without replacing its prompt.");
}

const concrete = resolveLessonVisual({ lessonCode, stateId: "concrete", text: concreteText });
if (concrete?.kind !== "quantity-model" || concrete.mode !== "counters" || concrete.total !== 5) {
  throw new Error("Concrete must resolve to a five-counter quantity model.");
}
if (concrete.quantities[0].label !== "blue" || concrete.quantities[0].count !== 3) {
  throw new Error("Concrete must preserve the live first quantity.");
}
if (concrete.quantities[1].label !== "yellow" || concrete.quantities[1].count !== 2) {
  throw new Error("Concrete must preserve the live second quantity.");
}

const representational = resolveLessonVisual({ lessonCode, stateId: "representational", text: representationalText });
if (representational?.kind !== "quantity-model" || representational.mode !== "tiles" || representational.total !== 5) {
  throw new Error("Representational must resolve to the labeled five-part tile model.");
}

const abstract = resolveLessonVisual({
  lessonCode,
  stateId: "abstract",
  text: abstractText,
  contextSteps: [
    { stateId: "concrete", text: concreteText },
    { stateId: "representational", text: representationalText },
  ],
  currentStepIndex: 2,
});
if (abstract?.kind !== "ratio-forms") throw new Error("Abstract must resolve to ratio forms.");
const partToPart = abstract.comparisons.find((comparison) => comparison.right === "yellow");
const partToWhole = abstract.comparisons.find((comparison) => comparison.right === "whole");
if (partToPart?.numerator !== 3 || partToPart.denominator !== 2) {
  throw new Error("Blue-to-yellow must resolve to 3:2.");
}
if (partToWhole?.numerator !== 3 || partToWhole.denominator !== 5) {
  throw new Error("Blue-to-whole must resolve to 3:5.");
}

const abstractWithFutureExample = resolveLessonVisual({
  lessonCode,
  stateId: "abstract",
  text: abstractText,
  contextSteps: [
    { stateId: "concrete", text: concreteText },
    { stateId: "abstract", text: abstractText },
    { stateId: "representational", text: "Draw 8 blue parts and 5 yellow parts." },
  ],
  currentStepIndex: 1,
});
if (abstractWithFutureExample?.kind !== "ratio-forms" || abstractWithFutureExample.comparisons[0]?.numerator !== 3) {
  throw new Error("Abstract visuals must never use quantities from a future lesson state.");
}

const duplicateLabels = resolveLessonVisual({
  lessonCode,
  stateId: "concrete",
  text: "Build 3 blue counters and 2 blue counters.",
});
if (duplicateLabels !== null) {
  throw new Error("A quantity model with duplicate labels must fall back to text.");
}

const unsafeScore = resolveLessonVisual({
  lessonCode,
  stateId: "launch",
  text: "The Crusaders lead the Blue Jays 9007199254740993 to 20 at halftime.",
});
if (unsafeScore !== null) {
  throw new Error("Unsafe or implausible scoreboard values must fall back to text.");
}

if (resolveLessonVisual({ lessonCode: "M1.T1.L1", stateId: "launch", text: launchText }) !== null) {
  throw new Error("Unrelated lessons must not receive inferred M2.T1.L1 visuals.");
}

console.log("PASS - lesson visuals follow the live M2.T1.L1 quantities and screen states.");
