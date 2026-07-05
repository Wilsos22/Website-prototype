// =====================================================================
// BIG DOG MATH - WEEK BUILDER (Notion lessons + curated pools)
// One click: reads the week's published lessons from the Math 6 Lessons
// Notion DB and builds all five warm-up forms -
//   Q1–Q3  AI-generated (fluency + two spiral review)
//   Q4/Q5  from the CURATED pool (warmup-pools-data.gs): verified answers,
//          keyed wrong-answer -> misconception tags, matched to the lesson,
//          rotated so items don't repeat within a topic's run
//   Q6     "explain your reasoning" from the short-answer pool
// Metadata (CCSS + distractor tags) is saved for the evidence bridge, so
// Q4/Q5 feed per-standard stage gates + misconception clustering.
//
// Optional Script Property: NOTION_LESSONS_DATA_SOURCE_ID (defaults below).
// =====================================================================

const BDM_LESSONS_DATA_SOURCE_DEFAULTS = [
  "e367e541-c0c7-4613-8066-d2e61b6fee64",
  "3282eba1-de37-8069-a043-000b7c36799d",
  "d1c8e7b0-9a3c-4f1b-8c5c-9a2e5f0a1a3f"
];

// --- Entry points (called from the sidebar) --------------------------------

function buildWeekFromNotionLessons(weekConfig) {
  const safeConfig = normalizeWeekConfig_(weekConfig);
  const lessons = getNotionLessonsForWeek_(safeConfig.startDate);
  const results = [];
  for (let dayIndex = 0; dayIndex < 5; dayIndex++) {
    try {
      results.push(buildDayFromNotionLesson_(safeConfig, dayIndex, lessons));
    } catch (err) {
      results.push({ ok: false, dayIndex: dayIndex, error: String(err && err.message ? err.message : err) });
    }
  }
  return results;
}

function buildSingleDayFromNotion(weekConfig, dayIndex) {
  const safeConfig = normalizeWeekConfig_(weekConfig);
  const lessons = getNotionLessonsForWeek_(safeConfig.startDate);
  return buildDayFromNotionLesson_(safeConfig, dayIndex, lessons);
}

// --- Core day build ---------------------------------------------------------

function buildDayFromNotionLesson_(safeConfig, dayIndex, lessons) {
  const dayInfo = getWarmupDayInfo_(safeConfig.startDate, dayIndex);
  const lesson = lessons[dayInfo.isoDate];
  if (!lesson) {
    throw new Error("No published lesson in Notion for " + dayInfo.isoDate + " - publish it (or use the typed-topic build for this day).");
  }
  const topic = lesson.topic || lesson.title || "math";

  // 1. Pool picks for Q4/Q5 (+ short answer), matched to the lesson, rotated.
  const picks = pickPoolItemsForLesson_(lesson, 2);
  const saPick = pickShortAnswerForLesson_(lesson);

  // 2. AI fills the rest: Q1 fluency, Q2–Q3 spiral, plus 2 extra distractors
  //    and feedback for each pool item.
  const ai = generateWeekBuilderAIFill_(topic, picks, saPick);

  // 3. Assemble the 6-question set in the shape buildForm_ expects.
  const questions = [];
  ai.openers.forEach(function (q) { questions.push(q); }); // Q1–Q3 (multiple_choice)
  picks.forEach(function (item, i) {
    const fill = ai.poolFills[i] || { distractors: [], distractorTags: [], feedback: "", correctFeedback: "" };
    const assembled = assemblePoolChoices_(item, fill);
    questions.push({
      q: item.q,
      type: "multiple_choice",
      choices: shuffleChoices_(assembled.choices),
      correct: item.correct,
      ccss: item.ccss,
      misconceptions: assembled.misconceptions,
      feedback: fill.feedback || "",
      correctFeedback: fill.correctFeedback || "",
      points: 1
    });
  });
  questions.push({
    q: saPick ? saPick.prompt : (ai.shortAnswer || "Explain your thinking on today's topic."),
    type: "short_answer",
    correct: "",
    points: 0
  });

  // 4. Build the form through the same pipeline as every other warm-up.
  const title = dayInfo.dayName + " " + dayInfo.dateShort + "-" + dayInfo.yy;
  const weekLabel = buildWeekLabel_(safeConfig.number);
  const weekFolderName = buildWeekFolderName_(safeConfig.number, safeConfig.startDate);
  const parentFolder = DriveApp.getFolderById(PARENT_FOLDER_ID);
  const weekFolder = getOrCreateFolder_(parentFolder, weekFolderName);
  const responseSpreadsheet = SpreadsheetApp.openById(RESPONSE_SS_ID);
  const linkSheet = SpreadsheetApp.openById(FORM_LINK_SHEET_ID).getSheets()[0];

  const formResult = buildForm_(title, topic, questions, weekFolder, responseSpreadsheet, dayInfo.tabName, weekLabel);

  const triggerStatus = callIfAvailable_("installWarmupFormSubmitTriggerSafely_", [formResult.form],
    { ok: false, error: "Response export helper is not installed." });

  callIfAvailable_("saveWarmupFormMetaSafely_", [formResult.form.getId(), {
    topic: topic,
    isoDate: dayInfo.isoDate,
    lessonTitle: lesson.title,
    questions: questions
      .map(function (q, i) { return { index: i, ccss: q.ccss || "", misconceptions: q.misconceptions || {} }; })
      .filter(function (q, i) { return i < 5; })
  }], { ok: false, error: "Evidence bridge not installed." });

  const linkStatus = callIfAvailable_("recordWarmUpLinkSafely_", [{
    title: title,
    topic: topic,
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
    source: "Notion lesson + curated pool",
    subject: "Math 6"
  }], { ok: false, error: "Warm-up link export helper is not installed." });

  linkSheet.appendRow([
    new Date(), title, formResult.form.getEditUrl(), formResult.form.getPublishedUrl(),
    RESPONSE_SS_ID, weekFolderName, formResult.form.getId(), formResult.responseTabName,
    "Notion lesson + curated pool",
    linkStatus.ok ? linkStatus.action : "Link export warning: " + linkStatus.error,
    triggerStatus.ok ? "trigger installed" : "Trigger warning: " + triggerStatus.error
  ]);

  return {
    ok: true,
    title: title,
    dailyTopic: topic + (lesson.title && lesson.title !== topic ? " - " + lesson.title : ""),
    reviewTopics: ai.reviewTopics || [],
    editUrl: formResult.form.getEditUrl(),
    publishedUrl: formResult.form.getPublishedUrl(),
    responseTabName: formResult.responseTabName,
    source: "Notion lesson + curated pool (" + picks.length + " pool items)",
    notionStatus: linkStatus,
    triggerStatus: triggerStatus
  };
}

// Build EXACTLY 4 unique choices (Google Forms rejects duplicates; the form
// normalizer requires 4): correct + the keyed wrong + AI distractors, deduped
// case-insensitively, padded with safe fillers if the AI's inventions collide.
function assemblePoolChoices_(item, fill) {
  const choices = [];
  const misconceptions = {};
  const seen = {};
  const keyOf = function (s) { return String(s).trim().toLowerCase().replace(/\s+/g, " "); };
  const add = function (choice, tag) {
    const clean = String(choice || "").trim();
    if (!clean || choices.length >= 4) return false;
    const k = keyOf(clean);
    if (seen[k]) return false;
    seen[k] = true;
    choices.push(clean);
    if (tag) misconceptions[clean] = tag;
    return true;
  };
  add(item.correct, null);
  add(item.wrong, item.tag || "other");
  (fill.distractors || []).forEach(function (d, i) {
    add(d, (fill.distractorTags || [])[i] || "other");
  });
  ["None of these", "Cannot be determined", "Not enough information"].forEach(function (filler) {
    if (choices.length < 4) add(filler, "other");
  });
  return { choices: choices, misconceptions: misconceptions };
}

function shuffleChoices_(choices) {
  const arr = choices.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

// --- Notion: the week's published lessons, keyed by ISO date ----------------

function getNotionLessonsForWeek_(startDate) {
  const config = getWarmupNotionConfig_();
  const propId = PropertiesService.getScriptProperties().getProperty("NOTION_LESSONS_DATA_SOURCE_ID");
  const sourceIds = propId ? [cleanNotionId_(propId)] : BDM_LESSONS_DATA_SOURCE_DEFAULTS;

  const start = getWarmupDayInfo_(startDate, 0).isoDate;
  const end = getWarmupDayInfo_(startDate, 4).isoDate;
  const lessons = {};
  const errors = [];

  sourceIds.forEach(function (sid) {
    let cursor = null;
    try {
      do {
        const body = {
          page_size: 50,
          filter: { and: [
            { property: "Date", date: { on_or_after: start } },
            { property: "Date", date: { on_or_before: end } }
          ] }
        };
        if (cursor) body.start_cursor = cursor;
        const data = notionRequest_("post", "/data_sources/" + sid + "/query", body, config);
        (data.results || []).forEach(function (page) {
          const p = page.properties || {};
          const status = readNotionPlain_(p["Publish Workflow"]);
          if (status && status.toLowerCase().indexOf("publish") === -1) return; // only Published
          const date = readNotionPlain_(p["Date"]).slice(0, 10);
          if (!date || lessons[date]) return;
          lessons[date] = {
            title: readNotionPlain_(p["Lesson"]) || readNotionPlain_(p["Name"]),
            topic: readNotionPlain_(p["Topic"]),
            module: readNotionPlain_(p["Module #"]) || readNotionPlain_(p["Module"])
          };
        });
        cursor = data.has_more ? data.next_cursor : null;
      } while (cursor);
    } catch (err) {
      errors.push(String(err && err.message ? err.message : err));
    }
  });

  if (!Object.keys(lessons).length && errors.length === sourceIds.length) {
    throw new Error("Couldn't read lessons from Notion: " + errors[0]);
  }
  return lessons;
}

function readNotionPlain_(prop) {
  if (!prop) return "";
  const t = prop.type;
  if (t === "title" || t === "rich_text") {
    return (prop[t] || []).map(function (x) { return x.plain_text || ""; }).join("").trim();
  }
  if (t === "select") return prop.select && prop.select.name ? prop.select.name : "";
  if (t === "status") return prop.status && prop.status.name ? prop.status.name : "";
  if (t === "date") return prop.date && prop.date.start ? prop.date.start : "";
  if (t === "number") return prop.number != null ? String(prop.number) : "";
  if (t === "formula" && prop.formula) return prop.formula.string || (prop.formula.number != null ? String(prop.formula.number) : "");
  return "";
}

// --- Pool matching + no-repeat rotation --------------------------------------

function bdmStem_(w) {
  if (w.length > 8 && w.slice(-7) === "ization") w = w.slice(0, -7); // factorization -> factor
  else if (w.length > 5 && w.slice(-3) === "ing") w = w.slice(0, -3);
  else if (w.length > 4 && w.slice(-2) === "es") w = w.slice(0, -2);
  else if (w.length > 3 && w.slice(-1) === "s") w = w.slice(0, -1);
  if (w.length > 4 && w.slice(-1) === "e") w = w.slice(0, -1); // divide/dividing -> divid
  return w;
}

// Tokens match when equal, or when one is a prefix of the other (both >= 4
// chars): multiplication/multiply, graphs/graphing, factor/factoring.
function bdmTokenMatch_(a, b) {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4) return a.indexOf(b) === 0 || b.indexOf(a) === 0;
  return false;
}

function bdmTokenHit_(sourceTokens, t) {
  for (let i = 0; i < sourceTokens.length; i++) {
    if (bdmTokenMatch_(sourceTokens[i], t)) return true;
  }
  return false;
}

function bdmTokens_(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
    .filter(function (w) { return w.length > 2 && ["the", "and", "with", "for"].indexOf(w) === -1; })
    .map(bdmStem_);
}

// Score pool groups against the lesson. The lesson TITLE drives (every lesson
// in a module shares the same Topic label, so topic words can't discriminate);
// pool lesson-name matches count 3×, pool topic-name matches 1×. If the title
// yields nothing, fall back to matching on the lesson's Topic/Module text.
function scorePoolGroups_(sourceTokens, pool) {
  const groups = {};
  pool.forEach(function (item) {
    const key = item.lesson + "||" + item.topic;
    if (groups[key]) return;
    const lessonNameTokens = bdmTokens_(item.lesson);
    const topicNameTokens = bdmTokens_(item.topic).filter(function (t) { return lessonNameTokens.indexOf(t) === -1; });
    let score = 0, hits = 0;
    lessonNameTokens.forEach(function (t) { if (bdmTokenHit_(sourceTokens, t)) { score += 3; hits += 1; } });
    topicNameTokens.forEach(function (t) { if (bdmTokenHit_(sourceTokens, t)) { score += 1; hits += 1; } });
    groups[key] = { score: score, coverage: hits / Math.max(1, lessonNameTokens.length + topicNameTokens.length) };
  });
  let bestKey = null;
  Object.keys(groups).forEach(function (k) {
    const g = groups[k];
    if (g.score === 0) return;
    if (!bestKey) { bestKey = k; return; }
    const b = groups[bestKey];
    if (g.score > b.score || (g.score === b.score && g.coverage > b.coverage)) bestKey = k;
  });
  return bestKey;
}

function matchPoolGroupForLesson_(lesson, pool) {
  let bestKey = scorePoolGroups_(bdmTokens_(lesson.title || ""), pool);
  if (!bestKey) {
    bestKey = scorePoolGroups_(bdmTokens_((lesson.topic || "") + " " + (lesson.module || "")), pool);
  }
  if (!bestKey) return null;
  const parts = bestKey.split("||");
  return pool.filter(function (item) { return item.lesson === parts[0] && item.topic === parts[1]; });
}

function pickPoolItemsForLesson_(lesson, count) {
  const group = matchPoolGroupForLesson_(lesson, BDM_Q4Q5_POOL);
  if (!group || !group.length) {
    throw new Error("No pool items match lesson \"" + (lesson.title || lesson.topic) +
      "\" - check the lesson's Topic wording against the Semester 1 pool, or build this day with a typed topic.");
  }
  return rotatePicks_("q45:" + group[0].lesson, group, count);
}

function pickShortAnswerForLesson_(lesson) {
  const group = matchPoolGroupForLesson_(lesson, BDM_SHORTANSWER_POOL);
  if (!group || !group.length) return null;
  return rotatePicks_("sa:" + group[0].lesson, group, 1)[0];
}

// Rotate through a group without repeats (cursor kept in Script Properties);
// wraps around when the group is exhausted.
function rotatePicks_(key, group, count) {
  const props = PropertiesService.getScriptProperties();
  const propKey = "bdm_pool_cursor_" + key.replace(/[^a-zA-Z0-9:]/g, "_");
  let used = [];
  try { used = JSON.parse(props.getProperty(propKey) || "[]"); } catch (e) { used = []; }
  const picks = [];
  for (let n = 0; n < count; n++) {
    let idx = -1;
    for (let i = 0; i < group.length; i++) {
      if (used.indexOf(i) === -1) { idx = i; break; }
    }
    if (idx === -1) { used = []; idx = 0; } // exhausted → start the rotation over
    used.push(idx);
    picks.push(group[idx]);
  }
  props.setProperty(propKey, JSON.stringify(used));
  return picks;
}

// --- AI fill: Q1–Q3 + distractors/feedback for the pool items ----------------

function generateWeekBuilderAIFill_(topic, picks, saPick) {
  const vocabList = BDM_MISCONCEPTION_VOCAB.map(function (t) { return "\"" + t + "\""; }).join(", ");
  const poolDesc = picks.map(function (item, i) {
    return (i + 1) + ") Question: " + item.q + "\n   Correct answer: " + item.correct +
      "\n   Existing wrong choice: " + (item.wrong || "(none)");
  }).join("\n");

  const userPrompt =
    "You are helping build a 6th grade math warm-up. Today's focus topic: \"" + topic + "\".\n\n" +
    "TASK 1 - write 3 multiple-choice questions (4 choices each, exactly one correct):\n" +
    "  Q1: an easy fluency question related to the topic.\n" +
    "  Q2: a spiral-review question from a DIFFERENT 6th grade skill.\n" +
    "  Q3: a spiral-review question from another DIFFERENT skill.\n" +
    "Each needs: q, choices[4], correct (identical to one choice), ccss (best grade-6 code),\n" +
    "correctFeedback (short, genuine, not corny), feedback (teach the idea when wrong).\n\n" +
    "TASK 2 - for each existing question below, invent 3 MORE plausible wrong choices,\n" +
    "ALL DIFFERENT from each other, from the correct answer, and from the existing wrong\n" +
    "choice (same format/units). Give a misconception tag for each new wrong choice chosen\n" +
    "ONLY from this vocabulary (or \"other\" if none fits): " + vocabList + ".\n" +
    "Also write correctFeedback and feedback for each.\n\n" + poolDesc + "\n\n" +
    "NEVER make an arithmetic mistake. Return ONLY JSON:\n" +
    "{\n" +
    "  \"reviewTopics\": [\"skill for Q2\", \"skill for Q3\"],\n" +
    "  \"openers\": [ {\"q\":\"...\",\"choices\":[\"a\",\"b\",\"c\",\"d\"],\"correct\":\"a\",\"ccss\":\"6.NS.B.4\",\"correctFeedback\":\"...\",\"feedback\":\"...\"} , x3 ],\n" +
    "  \"poolFills\": [ {\"distractors\":[\"...\",\"...\",\"...\"],\"distractorTags\":[\"tag or other\",\"tag or other\",\"tag or other\"],\"correctFeedback\":\"...\",\"feedback\":\"...\"} , one per existing question ]\n" +
    "}";

  const content = callOpenAIChat_([
    { role: "system", content: "You are a careful 6th grade math teacher. Reply with a single JSON object and nothing else." },
    { role: "user", content: userPrompt }
  ]);

  let parsed;
  try { parsed = JSON.parse(content); } catch (err) {
    throw new Error("AI returned invalid JSON for the day build. Try again. (" + err.message + ")");
  }

  const openers = (Array.isArray(parsed.openers) ? parsed.openers : []).slice(0, 3).map(function (q, i) {
    const choices = Array.isArray(q.choices) ? q.choices.map(function (c) { return String(c).trim(); }).filter(Boolean) : [];
    if (choices.length !== 4) throw new Error("Opener question " + (i + 1) + " did not have 4 choices. Try again.");
    let correct = String(q.correct || "").trim();
    if (choices.indexOf(correct) === -1) correct = choices[0];
    return {
      q: String(q.q || "").trim(), type: "multiple_choice", choices: choices, correct: correct,
      ccss: String(q.ccss || "").trim(), misconceptions: {},
      feedback: String(q.feedback || "").trim(), correctFeedback: String(q.correctFeedback || "").trim(), points: 1
    };
  });
  if (openers.length !== 3) throw new Error("AI returned " + openers.length + " opener questions; expected 3. Try again.");

  const poolFills = (Array.isArray(parsed.poolFills) ? parsed.poolFills : []).map(function (f) {
    const distractors = (Array.isArray(f.distractors) ? f.distractors : []).map(function (d) { return String(d).trim(); }).filter(Boolean).slice(0, 3);
    const tags = (Array.isArray(f.distractorTags) ? f.distractorTags : []).map(function (t) {
      const tag = String(t || "").trim();
      return BDM_MISCONCEPTION_VOCAB.indexOf(tag) !== -1 ? tag : "other";
    });
    return {
      distractors: distractors,
      distractorTags: tags,
      correctFeedback: String(f.correctFeedback || "").trim(),
      feedback: String(f.feedback || "").trim()
    };
  });

  return {
    openers: openers,
    poolFills: poolFills,
    reviewTopics: Array.isArray(parsed.reviewTopics) ? parsed.reviewTopics : [],
    shortAnswer: saPick ? null : "Pick one problem from today's warm-up and explain your thinking step by step."
  };
}
