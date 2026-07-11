// =====================================================================
// BIG DOG MATH - WARM-UP FROM THE PARAMETRIC ENGINE
// Fetches the day's 6 questions from the site's /api/warmup endpoint (a
// deterministic, correct-by-construction generator) and hands them to the SAME
// buildForm_ pipeline the AI/PDF generators use. No OpenAI key, no malformed
// output, no "no pool match" - the engine cannot return an invalid set.
//
// The response shape matches generateAIQuestionSet_ exactly:
//   { dailyTopic, reviewTopics, questions: [5 multiple_choice + 1 short_answer] }
// so this is a drop-in swap for createWarmupFormFromAI_.
//
// Setup (Script Properties, Project Settings):
//   WARMUP_ENGINE_URL  (optional) override the endpoint; defaults to production.
//   WARMUP_ENGINE_KEY  (optional) sent as "Authorization: Bearer ..." - set this
//                      to your CRON_SECRET once /api/warmup is gated.
// =====================================================================

const WARMUP_ENGINE_DEFAULT_URL = "https://bigdogmath.com/api/warmup";
const WARMUP_ENGINE_SOURCE = "Engine (parametric)";

function warmupEngineUrl_() {
  return PropertiesService.getScriptProperties().getProperty("WARMUP_ENGINE_URL") || WARMUP_ENGINE_DEFAULT_URL;
}

// Low-level fetch. params: { date, topic, prevTopic, seed } - all optional.
// With only a date, the endpoint resolves the topic (and the previous taught
// day's topic) from the Notion lesson calendar on its own.
function fetchWarmupSetFromEngine_(params) {
  const p = params || {};
  const query = [];
  if (p.date) query.push("date=" + encodeURIComponent(p.date));
  if (p.topic) query.push("topic=" + encodeURIComponent(p.topic));
  if (p.prevTopic) query.push("prevTopic=" + encodeURIComponent(p.prevTopic));
  if (p.seed) query.push("seed=" + encodeURIComponent(p.seed));
  const url = warmupEngineUrl_() + (query.length ? "?" + query.join("&") : "");

  const headers = {};
  const key = PropertiesService.getScriptProperties().getProperty("WARMUP_ENGINE_KEY");
  if (key) headers.Authorization = "Bearer " + key;

  const res = UrlFetchApp.fetch(url, { method: "get", muteHttpExceptions: true, headers: headers });
  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error("Warm-up engine " + code + ": " + String(text).slice(0, 300));
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error("Warm-up engine returned non-JSON: " + String(text).slice(0, 200));
  }
}

// Fetch + shape into what buildForm_ expects. The engine guarantees validity;
// we still check the count defensively so a bad deploy fails loudly.
function generateEngineQuestionSet_(dateStr, topicOverride) {
  const set = fetchWarmupSetFromEngine_({
    date: dateStr || null,
    topic: String(topicOverride || "").trim() || null,
  });
  const questions = set && Array.isArray(set.questions) ? set.questions : [];
  if (questions.length !== 6) {
    throw new Error("Warm-up engine returned " + questions.length + " questions; expected 6.");
  }
  return {
    dailyTopic: String((set && set.dailyTopic) || "").trim(),
    reviewTopics: set && Array.isArray(set.reviewTopics) ? set.reviewTopics : [],
    questions: questions,
  };
}

// Build one day's form from the engine. Mirrors createWarmupFormFromAI_ so all
// the downstream plumbing (submit trigger, evidence meta, link export, link
// sheet row) is identical - only the question source and the "source" label
// change. topicOverride is optional; omit it to let the endpoint resolve the
// topic from the Notion calendar by date.
function createWarmupFormFromEngine_(weekConfig, dayIndex, topicOverride) {
  const safeConfig = normalizeWeekConfig_(weekConfig);
  const dayInfo = getWarmupDayInfo_(safeConfig.startDate, dayIndex);
  const questionSet = generateEngineQuestionSet_(dayInfo.isoDate, topicOverride);
  const dailyTopic = questionSet.dailyTopic || String(topicOverride || "").trim() || defaultTopicForDay_(dayIndex);

  const title = `${dayInfo.dayName} ${dayInfo.dateShort}-${dayInfo.yy}`;
  const weekLabel = buildWeekLabel_(safeConfig.number);
  const weekFolderName = buildWeekFolderName_(safeConfig.number, safeConfig.startDate);

  const parentFolder = DriveApp.getFolderById(PARENT_FOLDER_ID);
  const weekFolder = getOrCreateFolder_(parentFolder, weekFolderName);
  const responseSpreadsheet = SpreadsheetApp.openById(RESPONSE_SS_ID);
  const linkSheet = SpreadsheetApp.openById(FORM_LINK_SHEET_ID).getSheets()[0];

  const formResult = buildForm_(
    title,
    dailyTopic,
    questionSet.questions,
    weekFolder,
    responseSpreadsheet,
    dayInfo.tabName,
    weekLabel
  );

  const triggerStatus = callIfAvailable_(
    "installWarmupFormSubmitTriggerSafely_",
    [formResult.form],
    { ok: false, error: "Response export helper is not installed." }
  );

  // CCSS + distractor->misconception metadata for the evidence bridge.
  callIfAvailable_(
    "saveWarmupFormMetaSafely_",
    [formResult.form.getId(), {
      topic: dailyTopic,
      isoDate: dayInfo.isoDate,
      questions: questionSet.questions
        .map(function (q, i) { return { index: i, ccss: q.ccss || "", misconceptions: q.misconceptions || {} }; })
        .filter(function (q, i) { return i < 5; })
    }],
    { ok: false, error: "Evidence bridge not installed." }
  );

  const linkStatus = callIfAvailable_(
    "recordWarmUpLinkSafely_",
    [{
      title: title,
      topic: dailyTopic,
      dayName: dayInfo.dayName,
      isoDate: dayInfo.isoDate,
      weekNumber: safeConfig.number,
      weekLabel: weekLabel,
      weekFolderName: weekFolderName,
      weekFolderUrl: weekFolder.getUrl(),
      formId: formResult.form.getId(),
      editUrl: formResult.form.getEditUrl(),
      publishedUrl: formResult.form.getPublishedUrl(),
      responseSpreadsheetId: RESPONSE_SS_ID,
      responseSheetUrl: responseSpreadsheet.getUrl(),
      responseTabName: formResult.responseTabName,
      source: WARMUP_ENGINE_SOURCE,
      subject: "Math 6"
    }],
    { ok: false, error: "Warm-up link export helper is not installed." }
  );

  linkSheet.appendRow([
    new Date(),
    title,
    formResult.form.getEditUrl(),
    formResult.form.getPublishedUrl(),
    RESPONSE_SS_ID,
    weekFolderName,
    formResult.form.getId(),
    formResult.responseTabName,
    WARMUP_ENGINE_SOURCE,
    linkStatus.ok ? linkStatus.action : `Link export warning: ${linkStatus.error}`,
    triggerStatus.ok ? "trigger installed" : `Trigger warning: ${triggerStatus.error}`
  ]);

  return {
    title: title,
    dailyTopic: dailyTopic,
    reviewTopics: questionSet.reviewTopics,
    editUrl: formResult.form.getEditUrl(),
    publishedUrl: formResult.form.getPublishedUrl(),
    responseTabName: formResult.responseTabName,
    source: WARMUP_ENGINE_SOURCE,
    notionStatus: linkStatus,
    triggerStatus: triggerStatus
  };
}

// Build all five day forms for a week from the engine. topics[i] is an optional
// per-day override; leave the array empty (or a slot blank) to let the endpoint
// resolve each day's topic from the Notion calendar by its date.
function generateWeekFormsFromEngine_(weekConfig, topics) {
  const safeTopics = Array.isArray(topics) ? topics : [];
  const forms = [];
  for (var dayIndex = 0; dayIndex < 5; dayIndex += 1) {
    forms.push(createWarmupFormFromEngine_(weekConfig, dayIndex, safeTopics[dayIndex]));
  }
  return forms;
}

// --- Editor-run smoke tests ---------------------------------------------------

// Fetch today's set and log it - run this first to confirm the endpoint + any
// WARMUP_ENGINE_KEY are wired correctly, before building real forms.
function testWarmupEngineFetch() {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const set = fetchWarmupSetFromEngine_({ date: today });
  Logger.log("topic: %s | strand: %s | source: %s", set.dailyTopic, set.strand, set.meta && set.meta.topicSource);
  (set.questions || []).forEach(function (q, i) {
    if (q.type === "multiple_choice") {
      Logger.log("Q%s [%s] %s  ->  %s", i + 1, q.ccss, q.q, q.correct);
    } else {
      Logger.log("Q%s (short answer) %s", i + 1, q.q);
    }
  });
}
