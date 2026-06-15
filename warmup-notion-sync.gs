// =====================================================================
// BIG DOG MATH - RESPONSE/LINK EXPORT HELPERS
// These helpers write clean export rows to Sheets without external HTTP calls.
// External Notion automation can read these tabs if direct Notion HTTP is off.
// =====================================================================

const WARMUP_LINKS_EXPORT_SHEET = "Warm Up Links Export";
const WARMUP_SUBMISSIONS_EXPORT_SHEET = "Warm Up Submissions Export";

function installResponseExportTrigger() {
  const ss = SpreadsheetApp.openById(RESPONSE_SS_ID);
  deleteTriggersForHandler_("syncSubmissionToExportSheet", ss.getId());

  ScriptApp.newTrigger("syncSubmissionToExportSheet")
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

  Logger.log("Response export trigger installed on the response spreadsheet.");
}

// Kept for menu/backward compatibility with the previous file name.
function installNotionSyncTrigger() {
  installResponseExportTrigger();
}

function installWarmupFormSubmitTriggerSafely_(form) {
  try {
    installWarmupFormSubmitTrigger_(form);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function installWarmupFormSubmitTrigger_(form) {
  const formId = form.getId();
  deleteTriggersForHandler_("syncFormResponseToExportSheet", formId);

  ScriptApp.newTrigger("syncFormResponseToExportSheet")
    .forForm(form)
    .onFormSubmit()
    .create();

  Logger.log(`Response export trigger installed for ${form.getTitle()}`);
}

function deleteTriggersForHandler_(handlerName, sourceId) {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() !== handlerName) return;
    if (sourceId && trigger.getTriggerSourceId && trigger.getTriggerSourceId() !== sourceId) return;
    ScriptApp.deleteTrigger(trigger);
  });
}

function listTriggers() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    Logger.log(`${trigger.getHandlerFunction()} - source: ${trigger.getTriggerSourceId && trigger.getTriggerSourceId()}`);
  });
}

function recordWarmUpLinkSafely_(data) {
  try {
    const action = recordWarmUpLinkExport_(data);
    return { ok: true, action };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function recordWarmUpLinkExport_(data) {
  const ss = SpreadsheetApp.openById(RESPONSE_SS_ID);
  const sheet = getOrCreateExportSheet_(ss, WARMUP_LINKS_EXPORT_SHEET, [
    "Synced At",
    "Key",
    "Name",
    "Class",
    "School Year",
    "Week",
    "Day",
    "Date",
    "Topic",
    "Subject",
    "Form Link",
    "Edit Link",
    "Response Sheet",
    "Response Tab",
    "Folder",
    "Source"
  ]);

  const key = String(data.formId || "").trim();
  const row = [
    new Date(),
    key,
    data.title || "",
    "Math 6",
    "2026-27",
    data.weekLabel || buildWeekLabel_(data.weekNumber || ""),
    data.isoDate || "",
    data.isoDate || "",
    data.topic || "",
    data.subject || "Math 6",
    data.publishedUrl || "",
    data.editUrl || "",
    data.responseSheetUrl || "",
    data.responseTabName || "",
    data.weekFolderUrl || "",
    data.source || GRADE5_PDF_SOURCE || "grade-5.pdf"
  ];

  const existingRow = findRowByValue_(sheet, 2, key);
  if (existingRow > 1) {
    sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
    return "updated export row";
  }

  sheet.appendRow(row);
  return "created export row";
}

function syncFormResponseToExportSheet(e) {
  try {
    const form = e.source;
    const response = e.response;
    if (!form || !response) throw new Error("Missing form response event.");

    const formTitle = form.getTitle();
    const formId = form.getId();
    const itemValues = getFormResponseValues_(response);
    const email = String(response.getRespondentEmail() || itemValues["Email Address"] || itemValues["Email"] || "")
      .trim()
      .toLowerCase();
    const period = normalizePeriodName_(itemValues["Period"]);
    const score = getFormResponseScore_(response);
    const submittedAt = response.getTimestamp ? response.getTimestamp() : new Date();
    const parsed = parseWarmupTitle_(formTitle);

    writeSubmissionExportRow_({
      submittedAt,
      submissionKey: `${formId}:${response.getId ? response.getId() : submittedAt.getTime()}`,
      formId,
      formTitle,
      email,
      period,
      score,
      week: parsed.week || "",
      date: parsed.date || "",
      topic: parsed.topic || "",
      source: GRADE5_PDF_SOURCE
    });
  } catch (err) {
    Logger.log(`Response export error: ${err.message}`);
  }
}

// Spreadsheet backup trigger path. The form-specific trigger above is preferred.
function syncSubmissionToExportSheet(e) {
  try {
    const values = e && e.namedValues ? e.namedValues : {};
    const sheetName = e && e.range && e.range.getSheet ? e.range.getSheet().getName() : "";
    const timestamp = (values["Timestamp"] && values["Timestamp"][0]) || new Date();
    const email = String((values["Email Address"] && values["Email Address"][0]) || (values["Email"] && values["Email"][0]) || "")
      .trim()
      .toLowerCase();
    const period = normalizePeriodName_((values["Period"] && values["Period"][0]) || "");

    writeSubmissionExportRow_({
      submittedAt: timestamp,
      submissionKey: `${sheetName}:${email}:${timestamp}`,
      formId: "",
      formTitle: sheetName,
      email,
      period,
      score: "",
      week: "",
      date: sheetName,
      topic: "",
      source: GRADE5_PDF_SOURCE
    });
  } catch (err) {
    Logger.log(`Spreadsheet response export error: ${err.message}`);
  }
}

function writeSubmissionExportRow_(data) {
  const ss = SpreadsheetApp.openById(RESPONSE_SS_ID);
  const sheet = getOrCreateExportSheet_(ss, WARMUP_SUBMISSIONS_EXPORT_SHEET, [
    "Exported At",
    "Submission Key",
    "Submitted",
    "Email Address",
    "Period",
    "Score",
    "Class",
    "Week",
    "Date",
    "Topic",
    "Form ID",
    "Warm Up",
    "Source"
  ]);

  const key = String(data.submissionKey || "").trim();
  const row = [
    new Date(),
    key,
    data.submittedAt || "",
    data.email || "",
    data.period || "",
    data.score,
    "Math 6",
    data.week || "",
    data.date || "",
    data.topic || "",
    data.formId || "",
    data.formTitle || "",
    data.source || "grade-5.pdf"
  ];

  const existingRow = findRowByValue_(sheet, 2, key);
  if (existingRow > 1) {
    sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
    return;
  }
  sheet.appendRow(row);
}

function getOrCreateExportSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const existingHeaders = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn())).getValues()[0];
    const needsHeaders = headers.some((header, i) => existingHeaders[i] !== header);
    if (needsHeaders) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}

function findRowByValue_(sheet, column, value) {
  if (!value || sheet.getLastRow() < 2) return -1;
  const values = sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(value)) return i + 2;
  }
  return -1;
}

function getFormResponseValues_(response) {
  const values = {};
  response.getItemResponses().forEach(itemResponse => {
    values[itemResponse.getItem().getTitle()] = itemResponse.getResponse();
  });
  return values;
}

function getFormResponseScore_(response) {
  try {
    const gradable = response.getGradableItemResponses();
    return gradable.reduce((total, itemResponse) => total + (Number(itemResponse.getScore()) || 0), 0);
  } catch (err) {
    return "";
  }
}

function normalizePeriodName_(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/[1-5]/);
  return match ? `Period ${match[0]}` : raw;
}

function parseWarmupTitle_(title) {
  const parsed = { week: "", date: "", topic: "" };
  const match = String(title || "").match(/M6\.W([^.]+)\.(\d{2}-\d{2})\.(\d{2})\s+\w+\s+(.+)$/);
  if (!match) return parsed;
  parsed.week = `Week ${match[1]}`;
  parsed.date = `${match[2]}-${match[3]}`;
  parsed.topic = match[4];
  return parsed;
}
