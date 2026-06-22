// =====================================================================
// BIG DOG MATH - SIDEBAR FUNCTIONS
// Sidebar trigger for the AI-powered warm-up generator.
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

// Weekly build path: AI generates all five day question sets and forms.
function generateWeekAuto(weekConfig, topics) {
  return generateWeekFormsFromTopics(weekConfig, topics);
}

// dayIndex: 0=Monday ... 4=Friday
function generateSingleDayAuto(weekConfig, dayIndex, weekTopic, overrideTopic) {
  const topic = String(overrideTopic || weekTopic || "").trim();
  if (!topic) throw new Error("Enter a topic for this day.");
  return createWarmupFormFromAI_(weekConfig, dayIndex, topic);
}

// Preview one day's question set without creating a form.
function previewDayAuto(weekTopic, dayName, dayIndex, overrideTopic) {
  const topic = String(overrideTopic || weekTopic || "").trim();
  if (!topic) throw new Error("Enter a topic for this day.");
  return generateAIQuestionSet_(topic, normalizeWeekConfig_(WEEK_CONFIG), dayIndex);
}
