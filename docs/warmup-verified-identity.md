# Verified warm-up identity pilot

## Approved student flow

1. The student opens Big Dog Math and enters the teacher's class code.
2. Big Dog confirms that the code belongs to an open class session.
3. The page changes to `Code accepted` and offers today's assigned Google Form warm-up.
4. Big Dog replaces `BDM_AUTH_USER_ID` in the prefilled Form URL with that Chromebook's anonymous Supabase user ID.
5. The student opens and submits the Google Form with the school Google account already used by the existing warm-up workflow.
6. The spreadsheet submit trigger sends the verified respondent email and the prefilled Chromebook ID to `/api/student/warmup-verify`.
7. The original Big Dog tab checks every three seconds and enters the lesson automatically after the identity link is confirmed.

The class code comes first. A student is not asked to complete an unrelated form before Big Dog knows which class session the student is joining. The join code is not shown again after the student has entered the lesson.

## What this keeps

- Google Forms remains the warm-up authoring and response system.
- Google Sheets remains the submission trigger and backup export path.
- Notion remains the lesson and warm-up record system.
- Big Dog displays or opens the assigned Form and handles the transition into the live lesson.
- No native Big Dog warm-up form is added.

Google Forms does not provide a supported hidden question. The required `Big Dog connection` item is therefore visible at the bottom of the Form, but its value is prefilled automatically. Its help text tells students not to change it.

## One-time activation

Keep the pilot off until every item below is complete.

1. In Supabase Auth Providers, enable Anonymous Sign-Ins.
2. Confirm that Vercel has `EVIDENCE_INGEST_KEY`.
3. In Apps Script Project Settings, set the Script Property `BDM_EVIDENCE_KEY` to the same value. Never paste the value into source code, documentation, or chat.
4. Paste the current repo versions of these files into the active warm-up Apps Script project:
   - `warmup-generator.gs`
   - `warmup-notion-sync.gs`
   - `warmup-evidence.gs`
   - whichever current generator files are active for the class
5. Run `repairAllWarmupTriggers()` once. Then run `listTriggers()` and confirm that exactly one form-submit trigger remains: the spreadsheet-level `syncSubmissionToExportSheet` trigger.
6. Set `NEXT_PUBLIC_SECURE_STUDENT_DATA=true` and `NEXT_PUBLIC_WARMUP_IDENTITY_ENABLED=true` in the applicable Vercel environment only when the Apps Script bridge and database identity fields are ready together.
7. Deploy the matching website commit.

`BDM_IDENTITY_URL` is optional. When omitted, the script posts to `https://bigdogmath.com/api/student/warmup-verify`.

## Connect an already-published warm-up

Publishing the ordinary Google Form URL is not enough for the identity pilot because it does not contain the Chromebook placeholder.

1. In the active Apps Script project, run `upgradePublishedWarmupForBigDog()`.
2. When prompted, paste the Google Form ID from the Form's edit URL.
3. Copy the returned prefilled URL from the execution log.
4. Paste that full URL into the matching Notion lesson's `Warm up link` field.
5. Confirm that the saved link contains `BDM_AUTH_USER_ID`.

New Forms created by the updated generator receive the `Big Dog connection` item and prefilled URL automatically. Their exported and Notion-linked URL should already contain `BDM_AUTH_USER_ID`.

## Pilot verification

Use a fully fictional roster student before any classroom use.

1. Start one new session with the intended lesson selected.
2. On a clean student browser, enter the join code.
3. Confirm that the page says `Code accepted` before the warm-up opens.
4. Confirm that the Form's `Big Dog connection` field is prefilled with a UUID and is not `BDM_AUTH_USER_ID`.
5. Submit the Form with the fictional roster email.
6. Keep the Big Dog tab open and confirm that it enters the lesson without re-entering the code.
7. Confirm that only one warm-up submission and one aggregate evidence event were recorded.
8. Refresh the student page and confirm that the linked browser can rejoin the same open session.

## Troubleshooting a student stuck after submission

Check these in order:

1. The Notion `Warm up link` contains `BDM_AUTH_USER_ID` before the student opens it.
2. The Form response includes a valid UUID in `Big Dog connection`.
3. The Form collected the intended school Google email.
4. That exact email exists once in the Supabase student roster for the session's class period.
5. Apps Script has exactly one `syncSubmissionToExportSheet` submit trigger.
6. `BDM_EVIDENCE_KEY` and Vercel `EVIDENCE_INGEST_KEY` match.
7. The Apps Script execution log shows a 2xx `Warm-up identity post` response.
8. The class session is still open.

## Current security boundary

This establishes a verified identity path inside the application, but it does not by itself remove older permissive Supabase policies. Keep the feature in pilot status until the remaining student and teacher browser queries have moved to protected server routes and those policies have been replaced.
