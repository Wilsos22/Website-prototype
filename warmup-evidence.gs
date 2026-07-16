// =====================================================================
// BIG DOG MATH - WARM-UP TO PROFICIENCY SPINE BRIDGE
// Posts each submission to the site's evidence API so mastery bars, stages,
// and Right-now grouping update from daily warm-ups automatically.
//
// Setup (Script Properties, Project Settings):
//   BDM_EVIDENCE_KEY is the same value as EVIDENCE_INGEST_KEY in Vercel (required)
//   BDM_EVIDENCE_URL is optional and defaults to https://bigdogmath.com/api/evidence
//
// What gets posted per submission:
//   1) ONE aggregate event: score 0-5 plus the day's domain and the primary
//      misconception tag (from Q4/Q5 wrong answers) moves the mastery bar
//      and feeds archetype grouping (matches the prototype's one-row-per-day).
//   2) Q4/Q5 per-question events WITH a CCSS standard (when the form has
//      metadata from the AI generator) feed the per-standard stage gates.
// =====================================================================

var BDM_META_PREFIX = "bdm_meta_";
var BDM_WARMUP_IDENTITY_FIELD_TITLE = "Big Dog connection";

// --- Form metadata (CCSS plus distractor-to-misconception maps), saved at build time ---

function saveWarmupFormMetaSafely_(formId, meta) {
  try {
    PropertiesService.getScriptProperties()
      .setProperty(BDM_META_PREFIX + formId, JSON.stringify(meta || {}));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function getWarmupFormMeta_(formId) {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(BDM_META_PREFIX + formId);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

// --- Topic to i-Ready domain (keyword matching; topics are free-typed) ---

function topicToDomain_(topic) {
  const t = String(topic || "").toLowerCase();
  const hit = function (words) { return words.some(function (w) { return t.indexOf(w) !== -1; }); };
  if (hit(["expression", "equation", "inequal", "exponent", "distribut", "variable", "coefficient"])) {
    return "Algebra and Algebraic Thinking";
  }
  if (hit(["area", "volume", "perimeter", "surface", "geometry", "coordinate", "polygon", "net", "triangle", "prism"])) {
    return "Geometry";
  }
  if (hit(["data", "statistic", "mean", "median", "histogram", "plot", "frequency", "measure of center"])) {
    return "Measurement and Data";
  }
  // Ratios, fractions, decimals, GCF/LCM, percents, and rates use Number and Operations.
  return "Number and Operations";
}

// --- Per-question detail (index, correct, chosen answer) for the 5 MC items ---

function getWarmupPerQuestionDetail_(response) {
  const out = [];
  if (!response) return out;
  let qIndex = 0;
  response.getItemResponses().forEach(function (itemResponse) {
    const item = itemResponse.getItem();
    if (item.getType() !== FormApp.ItemType.MULTIPLE_CHOICE) return;
    if (qIndex < 5) {
      out.push({
        index: qIndex,
        correct: isWarmupItemCorrect_(itemResponse, item),
        chosen: String(itemResponse.getResponse() || "").trim()
      });
    }
    qIndex++;
  });
  return out;
}

// --- The bridge: build events and POST them to /api/evidence ---

function postWarmupEvidenceSafely_(data, form, response) {
  const identityResult = postWarmupIdentitySafely_(data, response);
  try {
    const evidenceResult = postWarmupEvidence_(data, form, response);
    return {
      ok: Boolean(identityResult.ok || evidenceResult.ok),
      identity: identityResult,
      evidence: evidenceResult
    };
  } catch (err) {
    Logger.log("Evidence post error: " + (err && err.message ? err.message : err));
    return {
      ok: Boolean(identityResult.ok),
      identity: identityResult,
      evidence: { ok: false, error: String(err && err.message ? err.message : err) }
    };
  }
}

function postWarmupIdentitySafely_(data, response) {
  try {
    return postWarmupIdentity_(data, response);
  } catch (err) {
    Logger.log("Warm-up identity post error: " + (err && err.message ? err.message : err));
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function postWarmupIdentity_(data, response) {
  const email = String(data && data.email || "").trim().toLowerCase();
  const authUserId = getWarmupIdentityValue_(data, response);
  if (!email || !isWarmupIdentityUuid_(authUserId)) {
    return { ok: false, skipped: true, error: "verified email or Big Dog connection missing" };
  }

  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty("BDM_EVIDENCE_KEY");
  if (!key) {
    Logger.log("BDM_EVIDENCE_KEY not set; skipping warm-up identity post.");
    return { ok: false, skipped: true, error: "BDM_EVIDENCE_KEY not set" };
  }

  const url = props.getProperty("BDM_IDENTITY_URL") || "https://bigdogmath.com/api/student/warmup-verify";
  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    headers: { "x-bdm-key": key },
    payload: JSON.stringify({ email: email, authUserId: authUserId })
  });
  const code = res.getResponseCode();
  Logger.log("Warm-up identity post " + code + ": " + res.getContentText().slice(0, 200));
  return { ok: code >= 200 && code < 300, code: code };
}

function getWarmupIdentityValue_(data, response) {
  const direct = String(data && data.authUserId || "").trim();
  if (direct) return direct;
  if (!response) return "";

  const itemResponses = response.getItemResponses();
  for (let i = 0; i < itemResponses.length; i++) {
    const itemResponse = itemResponses[i];
    if (itemResponse.getItem().getTitle() === BDM_WARMUP_IDENTITY_FIELD_TITLE) {
      return String(itemResponse.getResponse() || "").trim();
    }
  }
  return "";
}

function isWarmupIdentityUuid_(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function postWarmupEvidence_(data, form, response) {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty("BDM_EVIDENCE_KEY");
  if (!key) {
    Logger.log("BDM_EVIDENCE_KEY not set; skipping evidence post (Notion sync unaffected).");
    return { ok: false, skipped: true };
  }
  const url = props.getProperty("BDM_EVIDENCE_URL") || "https://bigdogmath.com/api/evidence";

  const email = String(data && data.email || "").trim().toLowerCase();
  if (!email) return { ok: false, error: "no student email on submission" };

  const formId = String(data && data.formId || (form && form.getId()) || "");
  const at = (data && data.submittedAt ? new Date(data.submittedAt) : new Date()).toISOString();
  const meta = formId ? getWarmupFormMeta_(formId) : null;
  const detail = getWarmupPerQuestionDetail_(response);

  const events = [];

  // Q4/Q5 per-standard stage evidence (only when the form has CCSS metadata;
  // events without a standard would double-count against the domain bar).
  let primaryTag = null;
  [3, 4].forEach(function (i) {
    const d = detail.filter(function (x) { return x.index === i; })[0];
    if (!d) return;
    const qMeta = meta && meta.questions ? meta.questions.filter(function (q) { return q.index === i; })[0] : null;
    let tag = null;
    if (!d.correct && qMeta && qMeta.misconceptions) {
      tag = qMeta.misconceptions[d.chosen] || null;
      if (tag === "other") tag = null;
    }
    if (tag && !primaryTag) primaryTag = tag;
    if (qMeta && qMeta.ccss) {
      events.push({
        studentEmail: email,
        source: "warmup",
        isCorrect: d.correct,
        standardId: qMeta.ccss,
        misconception: tag,
        itemRef: formId + ":q" + (i + 1),
        at: at,
        dedupeKey: "warmup:" + formId + ":q" + (i + 1) + ":" + email
      });
    }
  });

  // Aggregate event: the day's 0-5 score moves the domain bar and grouping.
  const score = Number(data && data.score);
  if (isFinite(score)) {
    events.push({
      studentEmail: email,
      source: "warmup",
      score0to5: Math.max(0, Math.min(5, score)),
      domain: topicToDomain_(data && data.topic),
      misconception: primaryTag,
      itemRef: formId || undefined,
      at: at,
      dedupeKey: "warmup:" + formId + ":agg:" + email
    });
  }

  if (!events.length) return { ok: false, error: "nothing to post" };

  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    headers: { "x-bdm-key": key },
    payload: JSON.stringify({ events: events })
  });
  const code = res.getResponseCode();
  Logger.log("Evidence post " + code + ": " + res.getContentText().slice(0, 200));
  return { ok: code >= 200 && code < 300, code: code };
}

// --- Legacy-trigger shims + one-click repair -------------------------------
// Old triggers in the deployed project may still point at handler names that no
// longer exist (the classic "syncSubmissionToNotion" bug). These shims catch
// ANY legacy name and route by event shape, so no submission is ever dropped.

function syncSubmissionToNotion(e) { routeWarmupSubmitEvent_(e); }
function syncSubmissionToNotionSafely(e) { routeWarmupSubmitEvent_(e); }

function routeWarmupSubmitEvent_(e) {
  if (e && e.response && e.source && e.source.getId) {
    syncFormResponseToExportSheet(e); // form-level event
  } else {
    syncSubmissionToExportSheet(e); // spreadsheet-level event
  }
}

// Run ONCE from the Apps Script editor. Strategy: ONE spreadsheet-level trigger
// covers every form linked to the response spreadsheet, so ALL per-form
// triggers are deleted (they are redundant, double-fire submissions, and eat
// Google's 20-trigger-per-script quota, causing the "too many triggers" error).
function repairAllWarmupTriggers() {
  let removed = 0;
  let kept = false;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getEventType() !== ScriptApp.EventType.ON_FORM_SUBMIT) return;
    const handler = trigger.getHandlerFunction();
    // Keep exactly one spreadsheet-level trigger; delete everything else.
    if (handler === "syncSubmissionToExportSheet" && !kept) {
      kept = true;
      return;
    }
    ScriptApp.deleteTrigger(trigger);
    removed++;
  });
  if (!kept) installResponseExportTrigger();
  Logger.log("Trigger repair: removed " + removed + " per-form/duplicate trigger(s); " +
    (kept ? "kept" : "installed") + " the single spreadsheet trigger. " +
    "Every linked form is covered by it; no per-form triggers needed.");
}
