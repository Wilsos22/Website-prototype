// =====================================================================
// BIG DOG MATH - ONE-DAY WARM-UP REQUESTS FROM NOTION
//
// A database button sets "Warm-Up Build Status" to "Requested" on one
// Math 6 lesson page. A one-minute Apps Script trigger processes that page,
// creates or reuses the Google Form for its single Date, links the existing
// Warm up Links database record, and writes the result back to the lesson.
//
// This intentionally rejects date ranges. Each instructional day must have
// its own Notion lesson page.
// =====================================================================

const WARMUP_REQUEST_STATUS_PROP = "Warm-Up Build Status";
const WARMUP_REQUEST_NOTE_PROP = "Warm-Up Build Note";
const WARMUP_REQUEST_RELATION_PROP = "Warm Up Link";
const WARMUP_REQUEST_LESSON_RELATION_PROP = "Math 6 Lessons";
const WARMUP_REQUEST_MAX_PER_RUN = 3;
const WARMUP_REQUEST_HANDLER = "processWarmupBuildRequests";
const WARMUP_LINKS_DATA_SOURCE_DEFAULT = "3142eba1-de37-8024-b6cc-000b38db5d17";
const WARMUP_REQUEST_LINKS_EXPORT_SHEET = "Warm Up Links Export";

function installWarmupRequestTrigger() {
  deleteTriggersForHandler_(WARMUP_REQUEST_HANDLER);
  ScriptApp.newTrigger(WARMUP_REQUEST_HANDLER)
    .timeBased()
    .everyMinutes(1)
    .create();
  Logger.log("Warm-up request trigger installed. It checks Notion every minute.");
}

function removeWarmupRequestTrigger() {
  deleteTriggersForHandler_(WARMUP_REQUEST_HANDLER);
  Logger.log("Warm-up request trigger removed.");
}

function processWarmupBuildRequests() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    return { ok: false, skipped: true, reason: "another request run is active" };
  }

  try {
    const config = getWarmupNotionConfig_();
    if (!config.token) throw new Error("NOTION_TOKEN is not set in Script Properties.");

    const lessonsDataSourceId = getWarmupRequestLessonsDataSourceId_(config);
    const lessonSchema = getNotionDataSourceSchema_(lessonsDataSourceId, config);
    assertWarmupRequestSchema_(lessonSchema);

    const query = notionRequest_("post", "/data_sources/" + lessonsDataSourceId + "/query", {
      filter: {
        property: WARMUP_REQUEST_STATUS_PROP,
        select: { equals: "Requested" }
      },
      page_size: WARMUP_REQUEST_MAX_PER_RUN
    }, config);

    const results = (query.results || []).map(function (page) {
      return processOneWarmupBuildRequest_(page, lessonSchema, config);
    });

    Logger.log(JSON.stringify({ processed: results.length, results: results }));
    return { ok: true, processed: results.length, results: results };
  } finally {
    lock.releaseLock();
  }
}

function processOneWarmupBuildRequest_(lessonPage, lessonSchema, config) {
  const pageId = lessonPage.id;
  const properties = lessonPage.properties || {};
  const lessonTitle = readNotionPlain_(properties.Lesson) || readNotionPlain_(properties.Name) || pageId;

  setWarmupRequestState_(pageId, lessonSchema, "Building", "Building the warm-up now.", null, config);

  try {
    const publishWorkflow = readNotionPlain_(properties["Publish Workflow"]);
    if (["Ready for Review", "Published"].indexOf(publishWorkflow) < 0) {
      throw new Error("Publish Workflow must be Ready for Review or Published before creating the warm-up.");
    }

    const dateRange = readNotionDateRange_(properties.Date);
    if (!dateRange.start) throw new Error("Add a single Date to this lesson first.");
    if (dateRange.end) {
      throw new Error("Date ranges are not supported. Split this lesson into one Notion page per day.");
    }

    const isoDate = dateRange.start;
    const dateInfo = getWarmupRequestDateInfo_(isoDate);
    const lessonCode = readNotionPlain_(properties["Lesson Code"]);
    const lessonTopic = readNotionPlain_(properties["Topic #"]) ||
      readNotionPlain_(properties.Topic) ||
      topicCodeFromLessonCode_(lessonCode);

    const relatedWarmup = findUsableRelatedWarmup_(
      properties[WARMUP_REQUEST_RELATION_PROP],
      isoDate,
      lessonTopic,
      lessonCode,
      config
    );
    if (relatedWarmup) {
      setWarmupRequestState_(
        pageId,
        lessonSchema,
        "Ready",
        "Existing warm-up reused for " + isoDate + ".",
        relatedWarmup.id,
        config
      );
      return { ok: true, action: "reused lesson relation", lesson: lessonTitle, date: isoDate };
    }

    const warmupsDataSourceId = getWarmupRequestLinksDataSourceId_(config);
    const warmupSchema = getNotionDataSourceSchema_(warmupsDataSourceId, config);

    const existingNotionWarmup = findWarmupLinkPageByDate_(
      warmupsDataSourceId,
      isoDate,
      lessonTopic,
      lessonCode,
      config
    );
    if (existingNotionWarmup) {
      linkWarmupToLesson_(existingNotionWarmup, warmupSchema, lessonPage, isoDate, lessonCode, config);
      setWarmupRequestState_(
        pageId,
        lessonSchema,
        "Ready",
        "Existing warm-up reused for " + isoDate + ".",
        existingNotionWarmup.id,
        config
      );
      return { ok: true, action: "reused Notion warm-up", lesson: lessonTitle, date: isoDate };
    }

    const exportRecord = findWarmupExportRecordByDate_(isoDate, lessonTopic);
    if (isUsableWarmupExportRecord_(exportRecord)) {
      const exportPage = upsertWarmupLinkPage_(
        warmupsDataSourceId,
        warmupSchema,
        existingNotionWarmup,
        lessonPage,
        lessonCode,
        exportRecord,
        dateInfo,
        config
      );
      setWarmupRequestState_(
        pageId,
        lessonSchema,
        "Ready",
        "Existing Google Form recovered and linked for " + isoDate + ".",
        exportPage.id,
        config
      );
      return { ok: true, action: "recovered export record", lesson: lessonTitle, date: isoDate };
    }

    const buildResult = createWarmupFormFromEngine_(dateInfo.weekConfig, dateInfo.dayIndex, null);
    const exportedBuildRecord = findWarmupExportRecordByDate_(isoDate, lessonTopic);
    const builtRecord = isUsableWarmupExportRecord_(exportedBuildRecord)
      ? exportedBuildRecord
      : warmupRecordFromBuildResult_(buildResult, lessonCode, isoDate, dateInfo);
    const warmupPage = upsertWarmupLinkPage_(
      warmupsDataSourceId,
      warmupSchema,
      existingNotionWarmup,
      lessonPage,
      lessonCode,
      builtRecord,
      dateInfo,
      config
    );

    setWarmupRequestState_(
      pageId,
      lessonSchema,
      "Ready",
      "Warm-up created and linked for " + isoDate + ".",
      warmupPage.id,
      config
    );

    return {
      ok: true,
      action: "created",
      lesson: lessonTitle,
      date: isoDate,
      formUrl: buildResult.publishedUrl
    };
  } catch (err) {
    const message = String(err && err.message ? err.message : err).slice(0, 1800);
    setWarmupRequestState_(pageId, lessonSchema, "Error", message, null, config);
    return { ok: false, lesson: lessonTitle, error: message };
  }
}

function getWarmupRequestLessonsDataSourceId_(config) {
  const configured = PropertiesService.getScriptProperties().getProperty("NOTION_LESSONS_DATA_SOURCE_ID");
  const candidates = configured ? [cleanNotionId_(configured)] : BDM_LESSONS_DATA_SOURCE_DEFAULTS;
  let lastError = null;

  for (let i = 0; i < candidates.length; i++) {
    try {
      getNotionDataSourceSchema_(candidates[i], config);
      return candidates[i];
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Could not resolve the Math 6 Lessons data source.");
}

function getWarmupRequestLinksDataSourceId_(config) {
  if (config.warmupsDataSource || config.warmupsDb) {
    return getNotionDataSourceId_("warmups", config);
  }
  return WARMUP_LINKS_DATA_SOURCE_DEFAULT;
}

function assertWarmupRequestSchema_(schema) {
  const required = [WARMUP_REQUEST_STATUS_PROP, WARMUP_REQUEST_NOTE_PROP, WARMUP_REQUEST_RELATION_PROP, "Date"];
  const missing = required.filter(function (name) {
    return !schema || !schema.properties || !schema.properties[name];
  });
  if (missing.length) {
    throw new Error("Math 6 Lessons is missing required properties: " + missing.join(", "));
  }
}

function setWarmupRequestState_(pageId, lessonSchema, status, note, warmupPageId, config) {
  const properties = {};
  putNotionProperty_(lessonSchema, properties, WARMUP_REQUEST_STATUS_PROP, status);
  putNotionProperty_(lessonSchema, properties, WARMUP_REQUEST_NOTE_PROP, String(note || "").slice(0, 1900));
  if (warmupPageId) putNotionRelation_(lessonSchema, properties, WARMUP_REQUEST_RELATION_PROP, warmupPageId);
  return updateNotionPage_(pageId, properties, config);
}

function findUsableRelatedWarmup_(relationProperty, isoDate, lessonTopic, lessonCode, config) {
  if (!relationProperty || relationProperty.type !== "relation") return null;
  const related = relationProperty.relation || [];
  for (let i = 0; i < related.length; i++) {
    const page = notionRequest_("get", "/pages/" + related[i].id, null, config);
    const properties = page.properties || {};
    const date = readNotionDateRange_(properties.Date);
    if (
      date.start === isoDate &&
      !date.end &&
      isUsableWarmupPage_(page) &&
      warmupRecordMatchesLesson_(page, lessonTopic, lessonCode)
    ) return page;
  }
  return null;
}

function findWarmupLinkPageByDate_(dataSourceId, isoDate, lessonTopic, lessonCode, config) {
  const result = notionRequest_("post", "/data_sources/" + dataSourceId + "/query", {
    filter: { property: "Date", date: { equals: isoDate } },
    page_size: 10
  }, config);
  const pages = result.results || [];
  for (let i = 0; i < pages.length; i++) {
    if (!warmupRecordMatchesLesson_(pages[i], lessonTopic, lessonCode)) continue;
    if (isUsableWarmupPage_(pages[i])) return pages[i];
  }
  return null;
}

function isUsableWarmupPage_(page) {
  const properties = page && page.properties ? page.properties : {};
  const formId = readNotionPlain_(properties.Key) ||
    extractWarmupFormIdFromValue_(readNotionPlain_(properties["Edit Link"]));
  const publishedUrl = readNotionPlain_(properties["Form Link"]);
  return Boolean(publishedUrl) && canOpenWarmupForm_(formId);
}

function isUsableWarmupExportRecord_(record) {
  if (!record || !record.publishedUrl) return false;
  const formId = record.formId || extractWarmupFormIdFromValue_(record.editUrl || "");
  return canOpenWarmupForm_(formId);
}

function canOpenWarmupForm_(formId) {
  const safeFormId = String(formId || "").trim();
  if (!safeFormId) return false;
  try {
    const form = FormApp.openById(safeFormId);
    const isPublished =
      typeof form.supportsAdvancedResponderPermissions !== "function" ||
      !form.supportsAdvancedResponderPermissions() ||
      form.isPublished();
    return isPublished && Boolean(form.getPublishedUrl()) && form.isAcceptingResponses();
  } catch (err) {
    return false;
  }
}

function findWarmupExportRecordByDate_(isoDate, lessonTopic) {
  const spreadsheet = SpreadsheetApp.openById(RESPONSE_SS_ID);
  const sheet = spreadsheet.getSheetByName(WARMUP_REQUEST_LINKS_EXPORT_SHEET);
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) return null;

  const range = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn());
  const values = range.getValues();
  const displayValues = range.getDisplayValues();
  const headers = values[0].map(function (value) { return String(value || "").trim(); });
  const dateIndex = headers.indexOf("Date");
  if (dateIndex < 0) return null;

  for (let rowIndex = values.length - 1; rowIndex >= 1; rowIndex--) {
    const row = values[rowIndex];
    if (toWarmupRequestIsoDate_(row[dateIndex]) !== isoDate) continue;
    const topicIndex = headers.indexOf("Topic");
    const rowTopic = topicIndex >= 0 ? String(row[topicIndex] || displayValues[rowIndex][topicIndex] || "").trim() : "";
    if (lessonTopic && !warmupTopicsMatch_(rowTopic, lessonTopic)) continue;
    const get = function (name) {
      const index = headers.indexOf(name);
      if (index < 0) return "";
      return displayValues[rowIndex][index] || row[index] || "";
    };
    return {
      title: formatWarmupRequestTitle_(isoDate, ""),
      topic: rowTopic,
      formId: get("Key"),
      publishedUrl: get("Form Link"),
      editUrl: get("Edit Link"),
      responseSheetUrl: get("Response Sheet"),
      responseTabName: get("Response Tab") || isoToMmDdYy_(isoDate),
      weekFolderUrl: get("Folder"),
      source: get("Source") || "Warm Up Links Export",
      subject: get("Subject") || "Math 6",
      schoolYear: get("School Year") || getWarmupRequestSchoolYear_(isoDate),
      weekLabel: get("Week")
    };
  }
  return null;
}

function warmupRecordFromBuildResult_(buildResult, lessonCode, isoDate, dateInfo) {
  const formId = extractWarmupFormIdFromValue_(buildResult.editUrl || "");
  if (!formId) throw new Error("The Google Form was created, but its Form ID could not be read from the edit link.");
  return {
    title: buildResult.title,
    topic: buildResult.dailyTopic,
    formId: formId,
    publishedUrl: buildResult.publishedUrl,
    editUrl: buildResult.editUrl,
    responseSheetUrl: SpreadsheetApp.openById(RESPONSE_SS_ID).getUrl(),
    responseTabName: buildResult.responseTabName,
    weekFolderUrl: "",
    source: buildResult.source || WARMUP_ENGINE_SOURCE,
    subject: "Math 6",
    lessonCode: lessonCode,
    schoolYear: getWarmupRequestSchoolYear_(isoDate),
    weekLabel: buildWeekLabel_(dateInfo.weekConfig.number)
  };
}

function upsertWarmupLinkPage_(dataSourceId, warmupSchema, existingPage, lessonPage, lessonCode, record, dateInfo, config) {
  let page = existingPage;
  if (!page && record.formId) {
    page = findNotionPageByAnyProperty_(dataSourceId, warmupSchema, WARMUP_FORM_KEY_PROPS, record.formId, config);
  }

  const properties = {};
  setNotionTitleProperty_(
    warmupSchema,
    properties,
    "Name",
    formatWarmupRequestTitle_(dateInfo.isoDate, lessonCode) || record.title || ("Warm Up " + dateInfo.isoDate)
  );
  putNotionProperty_(warmupSchema, properties, "Key", record.formId || "");
  putNotionProperty_(warmupSchema, properties, "Lesson Code", lessonCode || record.lessonCode || "");
  putNotionMultiSelect_(warmupSchema, properties, "Class", ["Math 6"]);
  putKnownNotionSelect_(warmupSchema, properties, "School Year", record.schoolYear || getWarmupRequestSchoolYear_(dateInfo.isoDate));
  putKnownNotionSelect_(warmupSchema, properties, "Week", record.weekLabel || buildWeekLabel_(dateInfo.weekConfig.number));
  putNotionDateOnly_(warmupSchema, properties, "Day", dateInfo.isoDate);
  putNotionDateOnly_(warmupSchema, properties, "Date", dateInfo.isoDate);
  putNotionDateTime_(warmupSchema, properties, "Synced At", new Date());
  putNotionProperty_(warmupSchema, properties, "Topic", record.topic || "");
  putNotionProperty_(warmupSchema, properties, "Subject", record.subject || "Math 6");
  putNotionProperty_(warmupSchema, properties, "Form Link", record.publishedUrl || "");
  putNotionProperty_(warmupSchema, properties, "Edit Link", record.editUrl || "");
  putNotionProperty_(warmupSchema, properties, "Response Sheet", record.responseSheetUrl || "");
  putNotionProperty_(warmupSchema, properties, "Response Tab", record.responseTabName || "");
  putNotionProperty_(warmupSchema, properties, "Folder", record.weekFolderUrl || "");
  putNotionProperty_(warmupSchema, properties, "Source", record.source || WARMUP_ENGINE_SOURCE);
  putWarmupLessonRelation_(warmupSchema, properties, lessonPage.id);

  if (page) return updateNotionPage_(page.id, properties, config);
  return createNotionPage_(dataSourceId, properties, config);
}

function linkWarmupToLesson_(warmupPage, warmupSchema, lessonPage, isoDate, lessonCode, config) {
  const dateInfo = getWarmupRequestDateInfo_(isoDate);
  const properties = {};
  putNotionProperty_(warmupSchema, properties, "Lesson Code", lessonCode || "");
  putWarmupLessonRelation_(warmupSchema, properties, lessonPage.id);
  putNotionDateOnly_(warmupSchema, properties, "Date", isoDate);
  putNotionDateOnly_(warmupSchema, properties, "Day", isoDate);
  putKnownNotionSelect_(warmupSchema, properties, "Week", buildWeekLabel_(dateInfo.weekConfig.number));
  return updateNotionPage_(warmupPage.id, properties, config);
}

function putWarmupLessonRelation_(schema, target, pageId) {
  if (putNotionRelation_(schema, target, WARMUP_REQUEST_LESSON_RELATION_PROP, pageId)) return true;
  const properties = schema && schema.properties ? schema.properties : {};
  const names = Object.keys(properties);
  for (let i = 0; i < names.length; i++) {
    const property = properties[names[i]];
    if (!property || property.type !== "relation") continue;
    const relation = property.relation || {};
    const relatedDataSourceId = cleanNotionId_(relation.data_source_id || relation.database_id || "");
    if (BDM_LESSONS_DATA_SOURCE_DEFAULTS.indexOf(relatedDataSourceId) < 0) continue;
    return putNotionRelation_(schema, target, names[i], pageId);
  }
  return false;
}

function putKnownNotionSelect_(schema, target, propertyName, value) {
  if (!value || !schema || !schema.properties || !schema.properties[propertyName]) return false;
  const property = schema.properties[propertyName];
  if (property.type !== "select") return false;
  const options = property.select && property.select.options ? property.select.options : [];
  if (options.length && !options.some(function (option) { return option.name === value; })) return false;
  target[propertyName] = { select: { name: String(value) } };
  return true;
}

function putNotionDateOnly_(schema, target, propertyName, isoDate) {
  if (!schema || !schema.properties || !schema.properties[propertyName]) return false;
  if (schema.properties[propertyName].type !== "date") return false;
  target[propertyName] = { date: { start: String(isoDate).slice(0, 10), end: null } };
  return true;
}

function putNotionDateTime_(schema, target, propertyName, value) {
  if (!schema || !schema.properties || !schema.properties[propertyName]) return false;
  if (schema.properties[propertyName].type !== "date") return false;
  target[propertyName] = { date: { start: value instanceof Date ? value.toISOString() : String(value) } };
  return true;
}

function getWarmupRequestDateInfo_(isoDate) {
  const date = new Date(isoDate + "T12:00:00Z");
  if (Number.isNaN(date.getTime())) throw new Error("Date must be a valid calendar date.");
  const weekday = date.getUTCDay();
  if (weekday < 1 || weekday > 5) throw new Error("Warm-ups can only be created for Monday through Friday.");

  const mondayIso = bdmShiftIsoDate_(isoDate, -(weekday - 1));
  const weekOneValue = PropertiesService.getScriptProperties().getProperty("WARMUP_WEEK_1_START") || WEEK_CONFIG.startDate;
  const weekOneIso = mmDdYyToIso_(weekOneValue);
  const elapsedDays = Math.floor((new Date(mondayIso + "T12:00:00Z") - new Date(weekOneIso + "T12:00:00Z")) / 86400000);
  const weekNumber = Math.max(1, Math.floor(elapsedDays / 7) + 1);

  return {
    isoDate: isoDate,
    dayIndex: weekday - 1,
    weekConfig: {
      number: String(weekNumber),
      startDate: isoToMmDdYy_(mondayIso)
    }
  };
}

function mmDdYyToIso_(value) {
  const match = String(value || "").match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error("WARMUP_WEEK_1_START must use MM-DD-YY.");
  return "20" + match[3] + "-" + match[1] + "-" + match[2];
}

function isoToMmDdYy_(isoDate) {
  const match = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error("Date must use YYYY-MM-DD.");
  return match[2] + "-" + match[3] + "-" + match[1].slice(-2);
}

function getWarmupRequestSchoolYear_(isoDate) {
  const year = parseInt(String(isoDate).slice(0, 4), 10);
  const month = parseInt(String(isoDate).slice(5, 7), 10);
  const startYear = month >= 7 ? year : year - 1;
  return String(startYear) + "-" + String(startYear + 1).slice(-2);
}

function topicCodeFromLessonCode_(lessonCode) {
  const match = String(lessonCode || "").toUpperCase().match(/^(M\d+\.T\d+)/);
  return match ? match[1] : "";
}

function warmupRecordMatchesLesson_(warmupPage, lessonTopic, lessonCode) {
  const properties = warmupPage && warmupPage.properties ? warmupPage.properties : {};
  const recordTopic = readNotionPlain_(properties.Topic);
  const recordLessonCode = readNotionPlain_(properties["Lesson Code"]);
  if (lessonCode && recordLessonCode) return recordLessonCode === lessonCode;
  if (lessonTopic && !warmupTopicsMatch_(recordTopic, lessonTopic)) return false;
  return true;
}

function warmupTopicsMatch_(left, right) {
  const normalize = function (value) {
    return String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
  };
  return normalize(left) === normalize(right);
}

function formatWarmupRequestTitle_(isoDate, lessonCode) {
  const date = new Date(isoDate + "T12:00:00Z");
  if (Number.isNaN(date.getTime())) return "";
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const base = names[date.getUTCDay()] + " " + isoToMmDdYy_(isoDate);
  return lessonCode ? base + " - " + lessonCode : base;
}

function toWarmupRequestIsoDate_(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const short = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
  if (!short) return "";
  const year = short[3].length === 2 ? "20" + short[3] : short[3];
  return year + "-" + String(short[1]).padStart(2, "0") + "-" + String(short[2]).padStart(2, "0");
}
