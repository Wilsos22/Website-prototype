// =====================================================================
// BIG DOG MATH - SIDEBAR FUNCTIONS
// Sidebar trigger for the warm-up generator. The three wrappers below are the
// single switch point between question sources: they now call the parametric
// ENGINE (warmup-engine.gs -> /api/warmup). To fall back to the old OpenAI
// path, swap each engine call for its ...FromAI_ / ...FromTopics equivalent
// (shown in the comment on each line).
// =====================================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Big Dog Math")
    .addItem("Warm-Up Builder", "showWarmupBuilder")
    .addSeparator()
    .addItem("Install Response + Notion Sync", "installNotionSyncTrigger")
    .addItem("Repair Existing Form Triggers", "installWarmupFormTriggersFromKnownForms")
    .addItem("Backfill Scores from Forms", "backfillWarmupScoresFromForms")
    .addItem("Set Notion Properties", "promptForWarmupNotionProperties")
    .addItem("Test Notion Setup", "testWarmupNotionSetup")
    .addItem("Backfill Export Rows to Notion", "backfillWarmupSubmissionExportsToNotion")
    .addToUi();
}

function showWarmupBuilder() {
  const html = HtmlService.createHtmlOutputFromFile("WarmupBuilder")
    .setTitle("Warm-Up Builder")
    .setWidth(460);
  SpreadsheetApp.getUi().showSidebar(html);
}

// Weekly build path. Blank topic slots are fine - the engine resolves each
// day's topic from the Notion calendar by date.
function generateWeekAuto(weekConfig, topics) {
  return generateWeekFormsFromEngine_(weekConfig, topics); // AI fallback: generateWeekFormsFromTopics(weekConfig, topics)
}

// dayIndex: 0=Monday ... 4=Friday. A blank topic is allowed (resolved by date).
function generateSingleDayAuto(weekConfig, dayIndex, weekTopic, overrideTopic) {
  const topic = String(overrideTopic || weekTopic || "").trim();
  return createWarmupFormFromEngine_(weekConfig, dayIndex, topic); // AI fallback: createWarmupFormFromAI_(weekConfig, dayIndex, topic)
}

// Preview one day's question set without creating a form.
function previewDayAuto(weekTopic, dayName, dayIndex, overrideTopic) {
  const topic = String(overrideTopic || weekTopic || "").trim();
  const info = getWarmupDayInfo_(normalizeWeekConfig_(WEEK_CONFIG).startDate, dayIndex);
  return generateEngineQuestionSet_(info.isoDate, topic); // AI fallback: generateAIQuestionSet_(topic, normalizeWeekConfig_(WEEK_CONFIG), dayIndex)
}
