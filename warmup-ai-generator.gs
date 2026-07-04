// =====================================================================
// BIG DOG MATH - AI WARM-UP QUESTION GENERATOR
// Generates the day's 6 warm-up questions with OpenAI, then hands them to
// the same buildForm_ pipeline the problem-bank generator uses.
//   - 5 multiple-choice questions (4 choices each, one correct)
//   - 1 short-answer "LEVEL UP" bonus
// Requires OPENAI_API_KEY in Script Properties.
// =====================================================================

const OPENAI_WARMUP_MODEL = "gpt-4o-mini";
const OPENAI_WARMUP_SOURCE = "AI (gpt-4o-mini)";

// Finite misconception vocabulary — must match the site's `misconceptions`
// table exactly (exact-match clustering, no NLP). Q4/Q5 wrong choices are
// tagged from THIS list so the Right-now grouping can cluster on them.
const BDM_MISCONCEPTION_VOCAB = [
  "treats ratio as additive",
  "reverses part and whole in percent",
  "adds denominators when adding fractions",
  "misplaces decimal in division",
  "ignores order of operations",
  "confuses coefficient with exponent",
  "sign errors with negatives",
  "reverses inequality symbol",
  "confuses area vs perimeter",
  "forgets to halve base × height for triangle area",
  "confuses mean and median",
  "miscounts frequencies in a data display",
  "distributes to first term only"
];

// Build all five day forms for a week from typed topics (sidebar week build).
function generateWeekFormsFromTopics(weekConfig, topics) {
  const safeTopics = Array.isArray(topics) ? topics : [];
  return safeTopics.map(function (topic, dayIndex) {
    return createWarmupFormFromAI_(weekConfig, dayIndex, topic);
  });
}

// Create one day's form from AI-generated questions.
// Mirrors createWarmupFormFromPdfBank_ but swaps the question source.
function createWarmupFormFromAI_(weekConfig, dayIndex, requestedTopic) {
  const safeConfig = normalizeWeekConfig_(weekConfig);
  const dayInfo = getWarmupDayInfo_(safeConfig.startDate, dayIndex);
  const dailyTopic = String(requestedTopic || "").trim() || defaultTopicForDay_(dayIndex);
  const questionSet = generateAIQuestionSet_(dailyTopic, safeConfig, dayIndex);

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

  // Save CCSS + distractor→misconception metadata for the evidence bridge
  // (warmup-evidence.gs) so submissions can post per-standard, tagged evidence.
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
      source: OPENAI_WARMUP_SOURCE,
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
    OPENAI_WARMUP_SOURCE,
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
    source: OPENAI_WARMUP_SOURCE,
    notionStatus: linkStatus,
    triggerStatus: triggerStatus
  };
}

// Ask OpenAI for the day's question set and validate it into the
// shape buildForm_/normalizeWarmupQuestions_ expects.
function generateAIQuestionSet_(dailyTopic, weekConfig, dayIndex) {
  const topic = String(dailyTopic || "").trim();
  if (!topic) throw new Error("A topic is required to generate questions.");

  const systemPrompt =
    "You are a 6th grade math teacher writing a short daily warm-up. " +
    "You write clear, curriculum-accurate problems and you NEVER make an arithmetic mistake. " +
    "Always reply with a single JSON object and nothing else.";

  const userPrompt =
    "Create a 6-question warm-up for 6th grade math.\n" +
    "Today's focus topic: \"" + topic + "\".\n\n" +
    "Structure (in this exact order):\n" +
    "1) An easy fluency warm-up related to the topic.\n" +
    "2) A spiral-review question from a DIFFERENT 6th grade skill.\n" +
    "3) A second spiral-review question from another DIFFERENT 6th grade skill.\n" +
    "4) An on-grade-level question on the focus topic.\n" +
    "5) A harder challenge question on the focus topic.\n" +
    "6) A short-answer LEVEL UP bonus that asks students to explain their reasoning (open response, no choices).\n\n" +
    "Rules:\n" +
    "- Questions 1-5 are multiple choice with EXACTLY 4 answer choices.\n" +
    "- Exactly one choice is correct, and `correct` must be IDENTICAL to that choice string.\n" +
    "- The 3 wrong choices must be plausible (common-mistake distractors), all distinct.\n" +
    "- Keep numbers grade-appropriate. Double-check every answer is mathematically correct.\n" +
    "- `correctFeedback`: a short, genuine celebration shown when the student is right. " +
    "Warm and encouraging but NOT corny or over-the-top. Vary it; no exclamation-point spam. " +
    "Example tone: \"Nice — you lined up the place values perfectly.\"\n" +
    "- `feedback`: shown when the student is WRONG. Do not just give the answer. Teach the idea " +
    "behind it in a friendly way, ideally connecting to what the wrong answer suggests they were " +
    "thinking, and use a concrete model when it helps. You may use simple text visuals " +
    "(dots, groups, a number line) to make it click. " +
    "Example for 2x4 when a student answers 9: \"Remember 2x4 means 2 groups with 4 in each. " +
    "One group of 4 plus another group of 4: 0000 + 0000 = 00000000, which is 8.\"\n" +
    "- Question 6 has no choices and no correct answer; just the prompt.\n" +
    "- Every multiple-choice question includes \"ccss\": the single best grade-6 CCSS code " +
    "for that question (like \"6.NS.B.4\" or \"6.RP.A.3\"; use a grade-5 code like \"5.NF.B.4\" only for below-grade review).\n" +
    "- Questions 4 and 5 are the DATA PULL: each wrong choice must be engineered to reveal ONE " +
    "specific misconception, and you must include \"misconceptions\": an object mapping each wrong " +
    "choice string (exactly as written) to a tag chosen ONLY from this fixed vocabulary:\n" +
    BDM_MISCONCEPTION_VOCAB.map(function (t) { return "  \"" + t + "\""; }).join("\n") + "\n" +
    "If no vocabulary tag fits a wrong choice, use \"other\".\n\n" +
    "Return JSON with this exact shape:\n" +
    "{\n" +
    "  \"reviewTopics\": [\"skill for Q2\", \"skill for Q3\"],\n" +
    "  \"questions\": [\n" +
    "    {\"q\": \"...\", \"choices\": [\"a\",\"b\",\"c\",\"d\"], \"correct\": \"a\", \"ccss\": \"6.NS.B.4\", \"correctFeedback\": \"...\", \"feedback\": \"...\"},\n" +
    "    ... (5 multiple-choice objects total; Q4 and Q5 also have \"misconceptions\") ...,\n" +
    "    {\"q\": \"... explain your thinking ...\"}\n" +
    "  ]\n" +
    "}";

  const content = callOpenAIChat_([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ]);

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error("AI returned invalid JSON. Try Rebuild. (" + err.message + ")");
  }

  const rawQuestions = parsed && Array.isArray(parsed.questions) ? parsed.questions : [];
  if (rawQuestions.length !== 6) {
    throw new Error("AI returned " + rawQuestions.length + " questions; expected 6. Try Rebuild.");
  }

  const questions = rawQuestions.map(function (q, i) {
    if (i < 5) {
      const choices = Array.isArray(q.choices)
        ? q.choices.map(function (c) { return String(c).trim(); }).filter(Boolean)
        : [];
      if (choices.length !== 4) {
        throw new Error("Question " + (i + 1) + " did not have 4 choices. Try Rebuild.");
      }
      let correct = String(q.correct || "").trim();
      if (choices.indexOf(correct) === -1) correct = choices[0];
      // Sanitize the distractor→misconception map: keep only real wrong choices,
      // tags must come from the fixed vocabulary (anything else → "other").
      const misconceptions = {};
      if (q.misconceptions && typeof q.misconceptions === "object") {
        Object.keys(q.misconceptions).forEach(function (choiceText) {
          const clean = String(choiceText).trim();
          if (choices.indexOf(clean) === -1 || clean === correct) return;
          const tag = String(q.misconceptions[choiceText] || "").trim();
          misconceptions[clean] = BDM_MISCONCEPTION_VOCAB.indexOf(tag) !== -1 ? tag : "other";
        });
      }
      return {
        q: String(q.q || "").trim(),
        type: "multiple_choice",
        choices: choices,
        correct: correct,
        ccss: String(q.ccss || "").trim(),
        misconceptions: misconceptions,
        feedback: String(q.feedback || "").trim(),
        correctFeedback: String(q.correctFeedback || "").trim(),
        points: 1
      };
    }
    return {
      q: String(q.q || "").trim(),
      type: "short_answer",
      correct: "",
      points: 0
    };
  });

  const reviewTopics = Array.isArray(parsed.reviewTopics)
    ? parsed.reviewTopics.map(function (t) { return String(t).trim(); }).filter(Boolean)
    : [];

  return {
    dailyTopic: topic,
    reviewTopics: reviewTopics,
    questions: questions
  };
}

function callOpenAIChat_(messages) {
  const key = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!key) {
    throw new Error("Set OPENAI_API_KEY in Script Properties (Project Settings) to use AI questions.");
  }

  const payload = {
    model: OPENAI_WARMUP_MODEL,
    messages: messages,
    temperature: 0.4,
    response_format: { type: "json_object" }
  };

  const response = UrlFetchApp.fetch("https://api.openai.com/v1/chat/completions", {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + key },
    payload: JSON.stringify(payload)
  });

  const code = response.getResponseCode();
  const text = response.getContentText();
  let body = {};
  try { body = JSON.parse(text || "{}"); } catch (e) { body = {}; }

  if (code < 200 || code >= 300) {
    const message = body.error && body.error.message ? body.error.message : text;
    throw new Error("OpenAI " + code + ": " + message);
  }

  const choice = body.choices && body.choices[0] && body.choices[0].message;
  if (!choice || !choice.content) {
    throw new Error("OpenAI returned an empty response. Try Rebuild.");
  }
  return choice.content;
}
