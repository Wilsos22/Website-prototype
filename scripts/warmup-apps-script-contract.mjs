import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appsScriptFiles = fs.readdirSync(root)
  .filter((name) => name.endsWith(".gs"))
  .sort();

assert.ok(appsScriptFiles.length > 0, "Expected warm-up Apps Script source files.");

for (const fileName of appsScriptFiles) {
  const source = fs.readFileSync(path.join(root, fileName), "utf8");
  assert.doesNotThrow(
    () => new vm.Script(source, { filename: fileName }),
    `${fileName} must parse by itself.`,
  );
}

const combinedSource = appsScriptFiles
  .map((fileName) => fs.readFileSync(path.join(root, fileName), "utf8"))
  .join("\n");
assert.doesNotThrow(
  () => new vm.Script(combinedSource, { filename: "warmup-apps-script-combined.gs" }),
  "The warm-up Apps Script files must parse together without global declaration collisions.",
);

const evidenceSource = fs.readFileSync(path.join(root, "warmup-evidence.gs"), "utf8");
assert.ok(
  evidenceSource.includes("warmupToken: warmupToken"),
  "The Form submit bridge must post the session-scoped warm-up token.",
);
assert.ok(
  evidenceSource.includes("response.getRespondentEmail")
    && evidenceSource.includes("form.getPublishedUrl")
    && evidenceSource.includes("formUrl: formUrl"),
  "Identity verification must use the Form API respondent email and bind the receipt to the submitted Form.",
);
assert.ok(
  !evidenceSource.slice(
    evidenceSource.indexOf("function postWarmupIdentity_("),
    evidenceSource.indexOf("function getWarmupIdentityValue_("),
  ).includes("data && data.email"),
  "Identity verification must not trust a student-editable email response.",
);
assert.ok(
  evidenceSource.includes("data.warmupToken || data.authUserId"),
  "The Form submit bridge must accept the new token field while the export schema rolls over.",
);

const generatorSource = fs.readFileSync(path.join(root, "warmup-generator.gs"), "utf8");
const upgradeStart = generatorSource.indexOf("function upgradePublishedWarmupForBigDog");
const upgradeSource = generatorSource.slice(upgradeStart, generatorSource.indexOf("\n}\n", upgradeStart) + 3);
assert.ok(
  upgradeSource.includes("form.setCollectEmail(true)"),
  "Upgrading a published warm-up must enable respondent email collection.",
);

let requestedSheetName = "";
const requestContext = vm.createContext({
  RESPONSE_SS_ID: "fictional-response-spreadsheet",
  SpreadsheetApp: {
    openById() {
      return {
        getSheetByName(name) {
          requestedSheetName = name;
          return null;
        },
      };
    },
  },
});
const requestSource = fs.readFileSync(path.join(root, "notion-warmup-requests.gs"), "utf8");
new vm.Script(requestSource, { filename: "notion-warmup-requests.gs" }).runInContext(requestContext);

const result = vm.runInContext(
  "findWarmupExportRecordByDate_('2026-08-14', 'M1.T1')",
  requestContext,
);
assert.equal(result, null, "A missing export sheet should return no warm-up record.");
assert.equal(
  requestedSheetName,
  "Warm Up Links Export",
  "The request processor must own its export-sheet name instead of depending on another Apps Script file.",
);

console.log("PASS - warm-up Apps Script files are collision-free and the Notion request processor is self-contained.");
