// =====================================================================
// BIG DOG MATH - WARM-UP FORM GENERATOR
// Source bank: grade-5.pdf from Drive, extracted into the problem bank below.
// No AI calls and no external HTTP calls.
// =====================================================================

// Permanent IDs
const PARENT_FOLDER_ID   = "1IcfLByTfqUcgcHRoXU8tWWMJLNHcNL02";
const TEMPLATE_FORM_ID   = "1dy1Qu1vbjCvW-ThjyTx2ndSQcYLnFKsDOTQW60cKNHk";
const FORM_LINK_SHEET_ID = "1vgzz3XKelmHWuGrPOsK3ukkpoeiy8OxiaZU2LDzWPg4";
const RESPONSE_SS_ID     = "1b4jxYJ6HzoxDkZLBabaPptOl568gMmrxxz6k4Goy5fY";

const GRADE5_PDF_SOURCE = "My Drive/Saved from Chrome (1)/grade-5.pdf";
const PERIOD_CHOICES = ["Period 1", "Period 2", "Period 3", "Period 4", "Period 5"];
const BDM_WARMUP_IDENTITY_ITEM_TITLE = "Big Dog connection";
const BDM_WARMUP_IDENTITY_PLACEHOLDER = "BDM_AUTH_USER_ID";

// Fallback values for running generateWeekForms() directly from Apps Script.
const WEEK_CONFIG = {
  number: 1,
  startDate: "08-10-26"
};

const WEEK_PLAN = [
  { day: "Monday",    topic: "multiplication and whole-number operations" },
  { day: "Tuesday",   topic: "fractions" },
  { day: "Wednesday", topic: "decimals" },
  { day: "Thursday",  topic: "data and statistics" },
  { day: "Friday",    topic: "order of operations" }
];

// Main function for manual runs.
function generateWeekForms() {
  WEEK_PLAN.forEach((day, i) => {
    createWarmupFormFromPdfBank_(WEEK_CONFIG, i, day.topic);
  });
}

// Called by the sidebar and by generateWeekForms().
function createWarmupFormFromPdfBank_(weekConfig, dayIndex, requestedTopic) {
  const safeConfig = normalizeWeekConfig_(weekConfig);
  const dayInfo = getWarmupDayInfo_(safeConfig.startDate, dayIndex);
  const dailyTopic = String(requestedTopic || "").trim() || defaultTopicForDay_(dayIndex);
  const questionSet = buildGrade5PdfQuestionSet_(dailyTopic, safeConfig, dayIndex);

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

  const linkStatus = callIfAvailable_(
    "recordWarmUpLinkSafely_",
    [{
      title,
      topic: dailyTopic,
      dayName: dayInfo.dayName,
      isoDate: dayInfo.isoDate,
      weekNumber: safeConfig.number,
      weekLabel,
      weekFolderName,
      weekFolderUrl: weekFolder.getUrl(),
      formId: formResult.form.getId(),
      editUrl: formResult.form.getEditUrl(),
      publishedUrl: formResult.publishedUrl,
      responseSpreadsheetId: RESPONSE_SS_ID,
      responseSheetUrl: responseSpreadsheet.getUrl(),
      responseTabName: formResult.responseTabName,
      source: GRADE5_PDF_SOURCE,
      subject: "Math 6"
    }],
    { ok: false, error: "Warm-up link export helper is not installed." }
  );

  linkSheet.appendRow([
    new Date(),
    title,
    formResult.form.getEditUrl(),
    formResult.publishedUrl,
    RESPONSE_SS_ID,
    weekFolderName,
    formResult.form.getId(),
    formResult.responseTabName,
    GRADE5_PDF_SOURCE,
    linkStatus.ok ? linkStatus.action : `Link export warning: ${linkStatus.error}`,
    triggerStatus.ok ? "trigger installed" : `Trigger warning: ${triggerStatus.error}`
  ]);

  return {
    title,
    dailyTopic,
    reviewTopics: questionSet.reviewTopics,
    editUrl: formResult.form.getEditUrl(),
    publishedUrl: formResult.publishedUrl,
    responseTabName: formResult.responseTabName,
    source: GRADE5_PDF_SOURCE,
    notionStatus: linkStatus,
    triggerStatus
  };
}

// Form builder
function buildForm_(title, topic, questions, weekFolder, responseSpreadsheet, responseTabName, weekLabel) {
  const copy = DriveApp.getFileById(TEMPLATE_FORM_ID).makeCopy(title, weekFolder);
  const form = FormApp.openById(copy.getId());
  const safeQuestions = normalizeWarmupQuestions_(questions);

  // Week + topic live in the description so the title can stay clean ("Friday 05-15-26").
  // The submission sync reads them back from here via parseWarmupDescription_.
  const descPrefix = weekLabel ? `${weekLabel} • ` : "";
  form.setTitle(title)
    .setDescription(`${descPrefix}Topic: ${topic}\nSource bank: ${GRADE5_PDF_SOURCE}`)
    .setIsQuiz(true)
    .setCollectEmail(true);

  try { form.removeDestination(); } catch (e) {}

  const existingItems = form.getItems();
  for (let i = existingItems.length - 1; i >= 0; i--) form.deleteItem(existingItems[i]);

  const period = form.addListItem();
  period.setTitle("Period")
    .setChoices(PERIOD_CHOICES.map(choice => period.createChoice(choice)))
    .setRequired(true);

  safeQuestions.forEach((q, i) => {
    if (q.type === "multiple_choice") {
      const item = form.addMultipleChoiceItem();
      item.setTitle(`${i + 1}. ${q.q}`)
        .setChoices(q.choices.map(choice => item.createChoice(choice, choice === q.correct)))
        .setPoints(q.points || 1)
        .setRequired(true);

      if (q.feedback) {
        item.setFeedbackForIncorrect(FormApp.createFeedback().setText(q.feedback).build());
      }
      if (q.correctFeedback) {
        item.setFeedbackForCorrect(FormApp.createFeedback().setText(q.correctFeedback).build());
      }
    } else {
      const item = form.addTextItem();
      item.setTitle(`6. LEVEL UP (Bonus): ${q.q}`)
        .setRequired(false)
        .setHelpText("Short answer bonus. Show your thinking.");
      try { item.setPoints(0); } catch (e) {}
    }
  });

  const identityItem = getOrCreateBigDogIdentityItem_(form);
  const publishedUrl = buildBigDogWarmupUrl_(form, identityItem);

  const beforeSheetIds = getSheetIdMap_(responseSpreadsheet);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, responseSpreadsheet.getId());
  const renamedTabName = renameNewResponseSheet_(responseSpreadsheet, beforeSheetIds, responseTabName);

  return {
    form,
    publishedUrl,
    responseTabName: renamedTabName
  };
}

function getOrCreateBigDogIdentityItem_(form) {
  const textItems = form.getItems(FormApp.ItemType.TEXT);
  let existing = null;
  for (let i = 0; i < textItems.length; i++) {
    if (textItems[i].getTitle() === BDM_WARMUP_IDENTITY_ITEM_TITLE) {
      existing = textItems[i];
      break;
    }
  }
  const item = existing ? existing.asTextItem() : form.addTextItem();
  item.setTitle(BDM_WARMUP_IDENTITY_ITEM_TITLE)
    .setHelpText("This is filled in automatically so this Chromebook can enter the lesson after the warm-up. Do not change it.")
    .setRequired(true);
  return item;
}

function buildBigDogWarmupUrl_(form, identityItem) {
  const response = form.createResponse();
  response.withItemResponse(identityItem.createResponse(BDM_WARMUP_IDENTITY_PLACEHOLDER));
  return response.toPrefilledUrl();
}

// Run this once for an already-published form, then paste the returned URL into
// the lesson's Warm up link field. Newly generated forms do this automatically.
function upgradePublishedWarmupForBigDog(formId) {
  let safeFormId = String(formId || "").trim();
  if (!safeFormId) {
    const prompt = SpreadsheetApp.getUi().prompt(
      "Connect an existing warm-up",
      "Paste the form ID from its edit URL.",
      SpreadsheetApp.getUi().ButtonSet.OK_CANCEL
    );
    if (prompt.getSelectedButton() !== SpreadsheetApp.getUi().Button.OK) return "";
    safeFormId = String(prompt.getResponseText() || "").trim();
  }
  if (!safeFormId) throw new Error("A Google Form ID is required.");

  const form = FormApp.openById(safeFormId);
  const publishedUrl = buildBigDogWarmupUrl_(form, getOrCreateBigDogIdentityItem_(form));
  Logger.log("Paste this URL into the lesson's Warm up link field: " + publishedUrl);
  SpreadsheetApp.getUi().alert(
    "Warm-up connected",
    "The prefilled link is in the execution log. Paste it into the lesson's Warm up link field.",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
  return publishedUrl;
}

// Question selection
function buildGrade5PdfQuestionSet_(dailyTopic, weekConfig, dayIndex) {
  const seedBase = `${weekConfig.number}|${weekConfig.startDate}|${dayIndex}|${dailyTopic}`;
  const used = {};
  const q1 = chooseProblem_(filterBank_({ slot: "q1" }), seedBase + "|q1", used);
  const q2 = chooseProblem_(filterBank_({ slot: "review" }), seedBase + "|q2", used);
  const q3 = chooseProblem_(filterBank_({ slot: "review" }), seedBase + "|q3", used);
  const q4 = chooseTopicProblem_(dailyTopic, "grade5", seedBase + "|q4", used);
  const q5 = chooseTopicProblem_(dailyTopic, "challenge", seedBase + "|q5", used);
  const q6 = chooseTopicProblem_(dailyTopic, "levelup", seedBase + "|q6", used);

  return {
    dailyTopic,
    reviewTopics: [q2.topicLabel, q3.topicLabel],
    questions: [q1, q2, q3, q4, q5, q6]
  };
}

function chooseTopicProblem_(topic, difficulty, seed, used) {
  const topicTags = getTopicTags_(topic);
  let pool = filterBank_({ difficulty, tags: topicTags });
  if (!pool.length && difficulty === "challenge") pool = filterBank_({ difficulty: "grade5", tags: topicTags });
  if (!pool.length && difficulty === "levelup") pool = filterBank_({ difficulty: "levelup" });
  if (!pool.length) pool = filterBank_({ difficulty });
  if (!pool.length) pool = getGrade5PdfProblemBank_();
  return chooseProblem_(pool, seed, used);
}

function filterBank_(criteria) {
  return getGrade5PdfProblemBank_().filter(problem => {
    if (criteria.slot && problem.slot !== criteria.slot) return false;
    if (criteria.difficulty && problem.difficulty !== criteria.difficulty) return false;
    if (criteria.tags && criteria.tags.length) {
      return criteria.tags.some(tag => problem.tags.indexOf(tag) !== -1);
    }
    return true;
  });
}

function chooseProblem_(pool, seedText, used) {
  if (!pool.length) throw new Error("No grade-5 PDF problems are available for this slot.");
  const seed = Math.abs(hashText_(seedText));

  for (let offset = 0; offset < pool.length; offset++) {
    const problem = pool[(seed + offset) % pool.length];
    if (!used[problem.id]) {
      used[problem.id] = true;
      return cloneProblem_(problem);
    }
  }

  return cloneProblem_(pool[seed % pool.length]);
}

function getTopicTags_(topic) {
  const text = String(topic || "").toLowerCase();
  const tags = [];
  const rules = [
    [/fraction|mixed number/, "fractions"],
    [/decimal|place value|ten|hundred|thousand/, "decimals"],
    [/multiply|multiplication|product|factor/, "multiplication"],
    [/divide|division|quotient|remainder/, "division"],
    [/operation|expression|pemdas|order/, "order"],
    [/mean|median|mode|range|data|statistic|display/, "statistics"],
    [/time|hour|minute|second/, "time"],
    [/coordinate|ordered pair|graph|plane/, "coordinate"],
    [/volume|cube|rectangular prism/, "volume"]
  ];
  rules.forEach(rule => {
    if (rule[0].test(text)) tags.push(rule[1]);
  });
  return tags.length ? tags : ["multiplication", "fractions", "decimals", "statistics", "order"];
}

function cloneProblem_(problem) {
  return {
    id: problem.id,
    q: problem.q,
    type: problem.type || "multiple_choice",
    choices: problem.choices ? problem.choices.slice() : [],
    correct: problem.correct,
    feedback: problem.feedback || "",
    points: problem.points === 0 ? 0 : 1,
    source: problem.source,
    topicLabel: problem.topicLabel || problem.tags[0]
  };
}

function getGrade5PdfProblemBank_() {
  return [
    {
      id: "g5-q1-001", slot: "q1", difficulty: "easy", tags: ["multiplication"], topicLabel: "whole-number computation",
      source: "grade-5.pdf p.1",
      q: "Find the product: 8 x 7.",
      choices: ["56", "48", "54", "64"], correct: "56",
      feedback: "8 groups of 7 is 56."
    },
    {
      id: "g5-q1-002", slot: "q1", difficulty: "easy", tags: ["division"], topicLabel: "whole-number computation",
      source: "grade-5.pdf p.2",
      q: "Find the quotient: 72 ÷ 8.",
      choices: ["9", "8", "7", "10"], correct: "9",
      feedback: "8 x 9 = 72, so 72 ÷ 8 = 9."
    },
    {
      id: "g5-q1-003", slot: "q1", difficulty: "easy", tags: ["multiplication"], topicLabel: "whole-number computation",
      source: "grade-5.pdf p.1",
      q: "Find the product: 6 x 9.",
      choices: ["54", "45", "56", "63"], correct: "54",
      feedback: "6 groups of 9 is 54."
    },
    {
      id: "g5-q1-004", slot: "q1", difficulty: "easy", tags: ["order"], topicLabel: "whole-number computation",
      source: "grade-5.pdf p.10",
      q: "Evaluate: 12 ÷ 3.",
      choices: ["4", "3", "6", "9"], correct: "4",
      feedback: "12 split into 3 equal groups is 4 in each group."
    },
    {
      id: "g5-q1-005", slot: "q1", difficulty: "easy", tags: ["multiplication"], topicLabel: "whole-number computation",
      source: "grade-5.pdf p.1",
      q: "Find the product: 5 x 12.",
      choices: ["60", "50", "55", "72"], correct: "60",
      feedback: "5 x 12 means 5 groups of 12, which is 60."
    },
    {
      id: "g5-review-001", slot: "review", difficulty: "review", tags: ["decimals"], topicLabel: "decimal place value",
      source: "grade-5.pdf p.9",
      q: "What is 8.3 ÷ 10?",
      choices: ["0.83", "83", "0.083", "8.03"], correct: "0.83",
      feedback: "Dividing by 10 moves the decimal one place left."
    },
    {
      id: "g5-review-002", slot: "review", difficulty: "review", tags: ["fractions"], topicLabel: "fractions",
      source: "grade-5.pdf p.7",
      q: "Find the sum: 1/2 + 1/4.",
      choices: ["3/4", "2/6", "1/6", "1/8"], correct: "3/4",
      feedback: "1/2 is the same as 2/4, and 2/4 + 1/4 = 3/4."
    },
    {
      id: "g5-review-003", slot: "review", difficulty: "review", tags: ["statistics"], topicLabel: "data and statistics",
      source: "grade-5.pdf p.4",
      q: "For the data set 24, 31, 12, 38, 12, 15, what is the mode?",
      choices: ["12", "24", "22", "38"], correct: "12",
      feedback: "The mode is the value that appears most often. 12 appears twice."
    },
    {
      id: "g5-review-004", slot: "review", difficulty: "review", tags: ["order"], topicLabel: "order of operations",
      source: "grade-5.pdf p.10",
      q: "Evaluate the expression inside the parentheses first: 6 - (36 ÷ 12).",
      choices: ["3", "0", "6", "9"], correct: "3",
      feedback: "36 ÷ 12 = 3, then 6 - 3 = 3."
    },
    {
      id: "g5-review-005", slot: "review", difficulty: "review", tags: ["time"], topicLabel: "time",
      source: "grade-5.pdf p.3",
      q: "Add: 7 hours 28 minutes + 3 hours 27 minutes.",
      choices: ["10 hours 55 minutes", "10 hours 45 minutes", "11 hours 55 minutes", "9 hours 55 minutes"], correct: "10 hours 55 minutes",
      feedback: "Add hours and minutes separately: 7 + 3 = 10 hours and 28 + 27 = 55 minutes."
    },
    {
      id: "g5-review-006", slot: "review", difficulty: "review", tags: ["division"], topicLabel: "division",
      source: "grade-5.pdf p.2",
      q: "What is 2,607 ÷ 12?",
      choices: ["217 r 3", "217", "207 r 3", "218 r 3"], correct: "217 r 3",
      feedback: "12 x 217 = 2,604, with 3 left over."
    },
    {
      id: "g5-grade-001", difficulty: "grade5", tags: ["multiplication"], topicLabel: "multi-digit multiplication",
      source: "grade-5.pdf p.1",
      q: "Find the product: 16,347 x 31.",
      choices: ["506,757", "490,410", "506,457", "522,104"], correct: "506,757",
      feedback: "16,347 x 30 = 490,410 and one more 16,347 makes 506,757."
    },
    {
      id: "g5-grade-002", difficulty: "grade5", tags: ["multiplication"], topicLabel: "multi-digit multiplication",
      source: "grade-5.pdf p.1",
      q: "The hazelnut production was 34,714 tons. Walnut production was 13 times as much. How many tons of walnuts were produced?",
      choices: ["451,282 tons", "347,140 tons", "416,568 tons", "45,128 tons"], correct: "451,282 tons",
      feedback: "34,714 x 13 = 34,714 x 10 + 34,714 x 3 = 451,282."
    },
    {
      id: "g5-grade-003", difficulty: "grade5", tags: ["decimals"], topicLabel: "decimal place value",
      source: "grade-5.pdf p.9",
      q: "What is 3521.6 ÷ 100?",
      choices: ["35.216", "352.16", "3.5216", "35216"], correct: "35.216",
      feedback: "Dividing by 100 moves the decimal two places left."
    },
    {
      id: "g5-grade-004", difficulty: "grade5", tags: ["statistics"], topicLabel: "data and statistics",
      source: "grade-5.pdf p.4",
      q: "For the data set 5, 28, 16, 32, 5, 16, 48, 29, 5, 35, what is the range?",
      choices: ["43", "48", "5", "22"], correct: "43",
      feedback: "Range is greatest minus least: 48 - 5 = 43."
    },
    {
      id: "g5-grade-005", difficulty: "grade5", tags: ["fractions"], topicLabel: "fractions",
      source: "grade-5.pdf p.8",
      q: "Find the product: 6/7 x 3/8.",
      choices: ["9/28", "18/15", "18/56", "3/4"], correct: "9/28",
      feedback: "Multiply numerators and denominators: 18/56. Then simplify by 2 to get 9/28."
    },
    {
      id: "g5-grade-006", difficulty: "grade5", tags: ["order"], topicLabel: "order of operations",
      source: "grade-5.pdf p.10",
      q: "Evaluate: (6 - (36 ÷ 12)) + 8.",
      choices: ["11", "17", "3", "14"], correct: "11",
      feedback: "36 ÷ 12 = 3, then 6 - 3 = 3, and 3 + 8 = 11."
    },
    {
      id: "g5-grade-007", difficulty: "grade5", tags: ["time"], topicLabel: "time",
      source: "grade-5.pdf p.3",
      q: "Subtract: 16 hours 39 minutes 34 seconds - 12 hours 9 minutes 16 seconds.",
      choices: ["4 hours 30 minutes 18 seconds", "4 hours 29 minutes 18 seconds", "3 hours 30 minutes 18 seconds", "4 hours 30 minutes 50 seconds"], correct: "4 hours 30 minutes 18 seconds",
      feedback: "Subtract seconds, minutes, and hours: 34 - 16 = 18, 39 - 9 = 30, and 16 - 12 = 4."
    },
    {
      id: "g5-grade-008", difficulty: "grade5", tags: ["division"], topicLabel: "division",
      source: "grade-5.pdf p.2",
      q: "What is 7,382 ÷ 90?",
      choices: ["82 r 2", "82", "83 r 2", "80 r 2"], correct: "82 r 2",
      feedback: "90 x 82 = 7,380, with 2 left over."
    },
    {
      id: "g5-grade-009", difficulty: "grade5", tags: ["coordinate"], topicLabel: "coordinate plane",
      source: "grade-5.pdf p.5",
      q: "In the ordered pair (6, 2), which number tells how far to move right on the x-axis?",
      choices: ["6", "2", "8", "4"], correct: "6",
      feedback: "The first number in an ordered pair is the x-coordinate."
    },
    {
      id: "g5-grade-010", difficulty: "grade5", tags: ["volume"], topicLabel: "volume",
      source: "grade-5.pdf p.6",
      q: "A rectangular prism is 4 inches long, 3 inches wide, and 2 inches tall. What is its volume?",
      choices: ["24 cubic inches", "9 cubic inches", "14 cubic inches", "18 cubic inches"], correct: "24 cubic inches",
      feedback: "Volume = length x width x height = 4 x 3 x 2 = 24."
    },
    {
      id: "g5-challenge-001", difficulty: "challenge", tags: ["multiplication"], topicLabel: "multi-digit multiplication",
      source: "grade-5.pdf p.1",
      q: "Mark & Company produces 84,050 pens in a day. How many pens are produced in 35 days?",
      choices: ["2,941,750 pens", "2,521,500 pens", "2,941,500 pens", "294,175 pens"], correct: "2,941,750 pens",
      feedback: "84,050 x 35 = 84,050 x 30 + 84,050 x 5 = 2,941,750."
    },
    {
      id: "g5-challenge-002", difficulty: "challenge", tags: ["order"], topicLabel: "order of operations",
      source: "grade-5.pdf p.10",
      q: "Evaluate: 12 + ((22 ÷ 2) x 8) - 5.",
      choices: ["95", "83", "88", "105"], correct: "95",
      feedback: "22 ÷ 2 = 11, 11 x 8 = 88, and 12 + 88 - 5 = 95."
    },
    {
      id: "g5-challenge-003", difficulty: "challenge", tags: ["decimals"], topicLabel: "decimal place value",
      source: "grade-5.pdf p.9",
      q: "What is 883.9 ÷ 1,000?",
      choices: ["0.8839", "8.839", "88.39", "0.08839"], correct: "0.8839",
      feedback: "Dividing by 1,000 moves the decimal three places left."
    },
    {
      id: "g5-challenge-004", difficulty: "challenge", tags: ["statistics"], topicLabel: "data and statistics",
      source: "grade-5.pdf p.4",
      q: "For the data set 40, 90, 36, 68, 90, 11, 88, 54, what is the range?",
      choices: ["79", "90", "68", "54"], correct: "79",
      feedback: "The greatest value is 90 and the least is 11, so the range is 90 - 11 = 79."
    },
    {
      id: "g5-challenge-005", difficulty: "challenge", tags: ["fractions"], topicLabel: "fractions",
      source: "grade-5.pdf p.8",
      q: "Find the product: 9/20 x 3/10.",
      choices: ["27/200", "12/30", "27/30", "3/20"], correct: "27/200",
      feedback: "Multiply straight across: 9 x 3 = 27 and 20 x 10 = 200."
    },
    {
      id: "g5-challenge-006", difficulty: "challenge", tags: ["time"], topicLabel: "time",
      source: "grade-5.pdf p.3",
      q: "Add: 15 hours 12 minutes 1 second + 6 hours 36 minutes 49 seconds.",
      choices: ["21 hours 48 minutes 50 seconds", "22 hours 48 minutes 50 seconds", "21 hours 49 minutes 10 seconds", "20 hours 48 minutes 50 seconds"], correct: "21 hours 48 minutes 50 seconds",
      feedback: "Add each unit: 1 + 49 = 50 seconds, 12 + 36 = 48 minutes, and 15 + 6 = 21 hours."
    },
    {
      id: "g5-level-001", difficulty: "levelup", tags: ["multiplication"], topicLabel: "multi-step multiplication",
      source: "grade-5.pdf p.1",
      type: "short_answer", points: 0,
      q: "Mark & Company makes 84,050 pens each day for 35 days. If 2,500 pens are rejected, how many usable pens are left? Explain the two steps.",
      correct: "2,939,250"
    },
    {
      id: "g5-level-002", difficulty: "levelup", tags: ["statistics"], topicLabel: "data reasoning",
      source: "grade-5.pdf p.4",
      type: "short_answer", points: 0,
      q: "The data set is 24, 31, 12, 38, 12, 15. What number could you add so the range becomes 30? Explain why.",
      correct: "42"
    },
    {
      id: "g5-level-003", difficulty: "levelup", tags: ["decimals"], topicLabel: "decimal reasoning",
      source: "grade-5.pdf p.9",
      type: "short_answer", points: 0,
      q: "A student says 721.5 ÷ 100 is 72.15. What mistake did they make, and what is the correct answer?",
      correct: "They moved the decimal one place instead of two; 7.215."
    },
    {
      id: "g5-level-004", difficulty: "levelup", tags: ["order"], topicLabel: "order of operations reasoning",
      source: "grade-5.pdf p.10",
      type: "short_answer", points: 0,
      q: "Evaluate 12 + ((22 ÷ 2) x 8) - 5. Then explain why doing addition before multiplication would change the answer.",
      correct: "95"
    },
    {
      id: "g5-level-005", difficulty: "levelup", tags: ["fractions"], topicLabel: "fraction reasoning",
      source: "grade-5.pdf p.8",
      type: "short_answer", points: 0,
      q: "A student multiplied 6/7 x 3/8 and got 18/15. Explain the mistake and give the simplified correct product.",
      correct: "They added denominators instead of multiplying; 9/28."
    },
    {
      id: "g5-level-006", difficulty: "levelup", tags: ["volume"], topicLabel: "volume reasoning",
      source: "grade-5.pdf p.6",
      type: "short_answer", points: 0,
      q: "A prism has volume 48 cubic inches. Its length is 6 inches and its width is 4 inches. What is its height, and how do you know?",
      correct: "2 inches"
    }
  ];
}

// Validation and utility helpers
function normalizeWarmupQuestions_(questions) {
  if (!Array.isArray(questions) || questions.length !== 6) {
    throw new Error(`Expected 6 questions, got ${questions && questions.length}.`);
  }

  return questions.map((q, i) => {
    if (!q || typeof q !== "object") throw new Error(`Question ${i + 1} is missing.`);
    const text = String(q.q || "").trim();
    if (!text) throw new Error(`Question ${i + 1} has no prompt text.`);

    if (i < 5) {
      const choices = Array.isArray(q.choices)
        ? q.choices.map(choice => String(choice).trim()).filter(Boolean)
        : [];
      if (choices.length !== 4) throw new Error(`Question ${i + 1} needs exactly 4 choices.`);
      return {
        q: text,
        type: "multiple_choice",
        choices,
        correct: normalizeCorrectChoice_(choices, q.correct, i + 1),
        feedback: String(q.feedback || "").trim(),
        correctFeedback: String(q.correctFeedback || "").trim(),
        points: 1
      };
    }

    return {
      q: text,
      type: "short_answer",
      correct: String(q.correct || "").trim(),
      points: 0
    };
  });
}

function normalizeCorrectChoice_(choices, correct, questionNumber) {
  const correctText = String(correct || "").trim();
  const exactIndex = choices.indexOf(correctText);
  if (exactIndex !== -1) return choices[exactIndex];
  throw new Error(`Question ${questionNumber} correct answer must match one of its choices.`);
}

function normalizeWeekConfig_(weekConfig) {
  const number = String(weekConfig && weekConfig.number ? weekConfig.number : WEEK_CONFIG.number).trim();
  const startDate = String(weekConfig && weekConfig.startDate ? weekConfig.startDate : WEEK_CONFIG.startDate).trim();
  if (!/^\d{2}-\d{2}-\d{2}$/.test(startDate)) {
    throw new Error("Start date must be MM-DD-YY.");
  }
  return { number, startDate };
}

function getWarmupDayInfo_(startDate, dayIndex) {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const [mm, dd, yy] = startDate.split("-").map(part => parseInt(part, 10));
  const date = new Date(2000 + yy, mm - 1, dd);
  date.setDate(date.getDate() + dayIndex);

  const fMM = String(date.getMonth() + 1).padStart(2, "0");
  const fDD = String(date.getDate()).padStart(2, "0");
  const fYY = String(date.getFullYear()).slice(-2);
  return {
    dayName: days[dayIndex],
    dateShort: `${fMM}-${fDD}`,
    tabName: `${fMM}-${fDD}-${fYY}`,
    yy: fYY,
    isoDate: `20${fYY}-${fMM}-${fDD}`
  };
}

function renameNewResponseSheet_(spreadsheet, beforeSheetIds, targetName) {
  const safeTarget = safeSheetName_(targetName);
  let newSheet = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    SpreadsheetApp.flush();
    Utilities.sleep(500);
    const sheets = spreadsheet.getSheets();
    const candidates = sheets.filter(sheet => !beforeSheetIds[sheet.getSheetId()]);
    if (candidates.length) {
      newSheet = candidates[candidates.length - 1];
      break;
    }
  }

  if (!newSheet) {
    Logger.log(`Could not find the new response tab to rename to ${safeTarget}.`);
    return "Response tab not found";
  }

  const finalName = getAvailableSheetName_(spreadsheet, safeTarget, newSheet.getSheetId());
  newSheet.setName(finalName);
  return finalName;
}

function getAvailableSheetName_(spreadsheet, targetName, currentSheetId) {
  const existing = spreadsheet.getSheetByName(targetName);
  if (!existing || existing.getSheetId() === currentSheetId) return targetName;

  if (isSheetEmptyOrHeaderOnly_(existing)) {
    spreadsheet.deleteSheet(existing);
    return targetName;
  }

  for (let i = 2; i < 100; i++) {
    const candidate = safeSheetName_(`${targetName} (${i})`);
    if (!spreadsheet.getSheetByName(candidate)) return candidate;
  }
  throw new Error(`Could not create a unique response tab name for ${targetName}.`);
}

function isSheetEmptyOrHeaderOnly_(sheet) {
  return sheet.getLastRow() <= 1;
}

function getSheetIdMap_(spreadsheet) {
  const map = {};
  spreadsheet.getSheets().forEach(sheet => {
    map[sheet.getSheetId()] = true;
  });
  return map;
}

function safeSheetName_(name) {
  return String(name || "Warm Up")
    .replace(/[\[\]\*\?\/\\:]/g, "-")
    .slice(0, 90);
}

function getOrCreateFolder_(parentFolder, folderName) {
  const iter = parentFolder.getFoldersByName(folderName);
  return iter.hasNext() ? iter.next() : parentFolder.createFolder(folderName);
}

function buildWeekLabel_(weekNumber) {
  return `Week ${weekNumber}`;
}

function buildWeekFolderName_(weekNumber, startDate) {
  return `Week ${weekNumber} ${startDate}`;
}

function defaultTopicForDay_(dayIndex) {
  const defaults = [
    "whole-number operations",
    "fractions",
    "decimals",
    "data and statistics",
    "order of operations"
  ];
  return defaults[dayIndex] || "grade 5 review";
}

function cleanTitlePart_(value) {
  return String(value || "Warm Up").replace(/[^\w .-]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function hashText_(text) {
  let hash = 0;
  const input = String(text || "");
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function callIfAvailable_(functionName, args, fallback) {
  try {
    const fn = this[functionName];
    if (typeof fn !== "function") return fallback;
    return fn.apply(this, args || []);
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function previewQuestionsForDay() {
  const result = buildGrade5PdfQuestionSet_(WEEK_PLAN[0].topic, WEEK_CONFIG, 0);
  Logger.log(`Preview from ${GRADE5_PDF_SOURCE}`);
  result.questions.forEach((q, i) => {
    Logger.log(`${i + 1}. ${q.q}`);
    if (q.choices && q.choices.length) Logger.log(`Choices: ${q.choices.join(" | ")}`);
    Logger.log(`Answer: ${q.correct}`);
  });
}
