// =====================================================================
// BIG DOG MATH - SIDEBAR FUNCTIONS
// Sidebar trigger for the grade-5.pdf problem-bank warm-up generator.
// No AI calls and no external HTTP calls.
// =====================================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Big Dog Math")
    .addItem("Warm-Up Builder", "showWarmupBuilder")
    .addSeparator()
    .addItem("Install Response Export", "installResponseExportTrigger")
    .addToUi();
}

function showWarmupBuilder() {
  const html = HtmlService.createHtmlOutputFromFile("WarmupBuilder")
    .setTitle("Warm-Up Builder")
    .setWidth(460);
  SpreadsheetApp.getUi().showSidebar(html);
}

// Kept name for the existing sidebar HTML call.
// dayIndex: 0=Monday ... 4=Friday
function generateSingleDayAuto(weekConfig, dayIndex, weekTopic, overrideTopic) {
  const topic = String(overrideTopic || weekTopic || "").trim();
  if (!topic) throw new Error("Enter a topic for this day.");
  return createWarmupFormFromPdfBank_(weekConfig, dayIndex, topic);
}

// Preview one day without creating a form.
function previewDayAuto(weekTopic, dayName, dayIndex, overrideTopic) {
  const topic = String(overrideTopic || weekTopic || "").trim();
  if (!topic) throw new Error("Enter a topic for this day.");
  return buildGrade5PdfQuestionSet_(topic, normalizeWeekConfig_(WEEK_CONFIG), dayIndex);
}
